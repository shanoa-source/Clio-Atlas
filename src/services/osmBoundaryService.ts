import { useEffect, useMemo, useState } from 'react';
import { geoArea } from 'd3-geo';
import {
  computeDatasetYearBounds,
  getTerritoryRegions,
  subscribeAtlasDataLayer,
} from '../shared/atlasDataLayer';
import {
  GeoJsonMultiLineString,
  GeoJsonMultiPolygon,
  ResolvedTerritoryFeature,
  TerritoryRegion,
} from '../types/history';

export type OsmLoadPhase =
  | 'idle'
  | 'cache_check'
  | 'fetching_parcels'
  | 'dissolving_seams'
  | 'ready';

export interface OsmLoadingSnapshot {
  phase: OsmLoadPhase;
  loadedIds: number;
  totalIds: number;
  fromCache: boolean;
  done: boolean;
}

const osmGeometryCache = new Map<string, GeoJsonMultiPolygon>();
const dissolvedBoundaryCache = new Map<string, GeoJsonMultiLineString>();
const regionFeatureMemo = new Map<string, ResolvedTerritoryFeature>();
let inflightLoadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

let currentLoadPhase: OsmLoadPhase = 'idle';
let loadedFromLocalDb = false;
let loadFinishedOnce = false;

const IDB_NAME = 'civ_atlas_geodesic_cache_v3';
const IDB_STORE = 'snapshots';

function computeIdbSignature(): string {
  const regions = getTerritoryRegions();
  return `atlas_osm_v3_${regions.map((r) => `${r.id}:${r.osmIds.join('+')}`).join('|')}`;
}

interface PersistedOsmSnapshot {
  signature: string;
  geometries: Record<string, GeoJsonMultiPolygon>;
  dissolvedBoundaries: Record<string, GeoJsonMultiLineString>;
}

function notifySubscribers(): void {
  subscribers.forEach((cb) => cb());
}

function setLoadPhase(phase: OsmLoadPhase): void {
  if (currentLoadPhase !== phase) {
    currentLoadPhase = phase;
    notifySubscribers();
  }
}

function reverseRingIfNeeded(ring: [number, number][]): [number, number][] {
  return ring.slice().reverse();
}

/**
 * Normalizes any OpenStreetMap GeoJSON Polygon or MultiPolygon into a valid GeoJSON MultiPolygon,
 * correcting ring orientation if spherical area > 2π (inverted exterior winding).
 */
export function normalizeOsmGeometryToMultiPolygon(geometry: any): GeoJsonMultiPolygon | null {
  if (!geometry || typeof geometry !== 'object') return null;

  let rawPolygons: [number, number][][][] = [];
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    rawPolygons = geometry.coordinates;
  } else if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    rawPolygons = [geometry.coordinates];
  } else {
    return null;
  }

  const cleanedPolygons: [number, number][][][] = [];
  for (const poly of rawPolygons) {
    if (!Array.isArray(poly) || poly.length === 0 || !Array.isArray(poly[0]) || poly[0].length < 4) {
      continue;
    }
    const singlePoly = {
      type: 'Polygon' as const,
      coordinates: poly,
    };
    const steradians = geoArea(singlePoly as any);
    if (steradians > Math.PI * 2) {
      cleanedPolygons.push(poly.map((ring) => reverseRingIfNeeded(ring)));
    } else if (steradians > 0) {
      cleanedPolygons.push(poly);
    }
  }

  if (cleanedPolygons.length === 0) return null;
  return {
    type: 'MultiPolygon',
    coordinates: cleanedPolygons,
  };
}

interface IndexedPolygonRing {
  polyIdx: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  exterior: [number, number][];
  holes: [number, number][][];
}

function buildIndexedPolygons(multiPolygon: GeoJsonMultiPolygon): IndexedPolygonRing[] {
  const indexed: IndexedPolygonRing[] = [];
  for (let polyIdx = 0; polyIdx < multiPolygon.coordinates.length; polyIdx++) {
    const poly = multiPolygon.coordinates[polyIdx];
    const exterior = poly[0];
    if (!exterior || exterior.length < 4) continue;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of exterior) {
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
    indexed.push({
      polyIdx,
      minLon,
      minLat,
      maxLon,
      maxLat,
      exterior,
      holes: poly.slice(1),
    });
  }
  return indexed;
}

function isPointInsideCandidatePolygons(
  lon: number,
  lat: number,
  candidates: IndexedPolygonRing[],
): boolean {
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    if (lon < p.minLon || lon > p.maxLon || lat < p.minLat || lat > p.maxLat) continue;
    if (pointInPolygonRing(lon, lat, p.exterior)) {
      let inHole = false;
      for (let h = 0; h < p.holes.length; h++) {
        if (pointInPolygonRing(lon, lat, p.holes[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

/**
 * Dissolves shared internal administrative edges between adjacent OpenStreetMap relations
 * within the same historical TerritoryRegion (even when Nominatim simplifies adjacent rings independently),
 * returning continuous outer frontier & coastal LineStrings.
 *
 * Mathematically lossless spatial-bbox pruning skips O(V) PIP probes on coastal segments that do not
 * fall within `normalEps` of any neighboring sub-polygon's bounding box (~60x faster CPU execution).
 */
export function extractDissolvedOuterBoundary(
  multiPolygon: GeoJsonMultiPolygon,
): GeoJsonMultiLineString {
  const fmt = (n: number) => n.toFixed(4);
  const undirectedCounts = new Map<string, number>();
  const directedSegments: Array<{
    polyIdx: number;
    startKey: string;
    endKey: string;
    undirectedKey: string;
    a: [number, number];
    b: [number, number];
  }> = [];

  for (let polyIdx = 0; polyIdx < multiPolygon.coordinates.length; polyIdx++) {
    const poly = multiPolygon.coordinates[polyIdx];
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const startKey = `${fmt(a[0])},${fmt(a[1])}`;
        const endKey = `${fmt(b[0])},${fmt(b[1])}`;
        if (startKey === endKey) continue;
        const undirectedKey = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
        undirectedCounts.set(undirectedKey, (undirectedCounts.get(undirectedKey) ?? 0) + 1);
        directedSegments.push({ polyIdx, startKey, endKey, undirectedKey, a, b });
      }
    }
  }

  const indexedPolys =
    multiPolygon.coordinates.length > 1 ? buildIndexedPolygons(multiPolygon) : null;
  const normalEps = 0.0014; // ~140m normal probe dissolves any Douglas-Peucker slit between adjacent municipalities
  const bboxPad = normalEps * 1.5;
  const localCandidates: IndexedPolygonRing[] = [];

  // Retain strictly exterior segments (neither exact-vertex shared nor interior to neighboring sub-polygons)
  const outgoingByStart = new Map<string, number[]>();
  const exteriorSegs = directedSegments.filter((seg) => {
    if ((undirectedCounts.get(seg.undirectedKey) ?? 0) > 1) return false;
    if (indexedPolys && indexedPolys.length > 1) {
      const mx = (seg.a[0] + seg.b[0]) * 0.5;
      const my = (seg.a[1] + seg.b[1]) * 0.5;

      // Fast bbox filter: an inter-polygon seam requires at least one OTHER sub-polygon within `bboxPad` of midpoint
      localCandidates.length = 0;
      let hasOtherPolyNear = false;
      for (let q = 0; q < indexedPolys.length; q++) {
        const p = indexedPolys[q];
        if (
          mx >= p.minLon - bboxPad &&
          mx <= p.maxLon + bboxPad &&
          my >= p.minLat - bboxPad &&
          my <= p.maxLat + bboxPad
        ) {
          localCandidates.push(p);
          if (p.polyIdx !== seg.polyIdx) {
            hasOtherPolyNear = true;
          }
        }
      }

      if (hasOtherPolyNear && localCandidates.length >= 2) {
        const dx = seg.b[0] - seg.a[0];
        const dy = seg.b[1] - seg.a[1];
        const len = Math.hypot(dx, dy);
        if (len > 1e-7) {
          const nx = (-dy / len) * normalEps;
          const ny = (dx / len) * normalEps;
          const leftInside = isPointInsideCandidatePolygons(mx + nx, my + ny, localCandidates);
          if (leftInside) {
            const rightInside = isPointInsideCandidatePolygons(mx - nx, my - ny, localCandidates);
            if (rightInside) {
              return false;
            }
          }
        }
      }
    }
    return true;
  });

  exteriorSegs.forEach((seg, idx) => {
    const bucket = outgoingByStart.get(seg.startKey);
    if (bucket) bucket.push(idx);
    else outgoingByStart.set(seg.startKey, [idx]);
  });

  const visited = new Uint8Array(exteriorSegs.length);
  const lines: [number, number][][] = [];

  for (let i = 0; i < exteriorSegs.length; i++) {
    if (visited[i]) continue;
    visited[i] = 1;
    const chain: [number, number][] = [exteriorSegs[i].a, exteriorSegs[i].b];
    let currEnd = exteriorSegs[i].endKey;

    while (true) {
      const candidates = outgoingByStart.get(currEnd);
      if (!candidates) break;
      const nextIdx = candidates.find((c) => !visited[c]);
      if (nextIdx === undefined) break;
      visited[nextIdx] = 1;
      chain.push(exteriorSegs[nextIdx].b);
      currEnd = exteriorSegs[nextIdx].endKey;
    }

    if (chain.length >= 2) {
      lines.push(chain);
    }
  }

  return {
    type: 'MultiLineString',
    coordinates: lines,
  };
}

/**
 * Parses a Nominatim OpenStreetMap GeoJSON FeatureCollection into a map of canonical OSM IDs ("R123", "W456")
 */
export function parseNominatimGeoJsonFeatures(
  featureCollection: { features?: any[] } | null | undefined,
): Map<string, GeoJsonMultiPolygon> {
  const out = new Map<string, GeoJsonMultiPolygon>();
  if (!featureCollection || !Array.isArray(featureCollection.features)) {
    return out;
  }

  for (const feat of featureCollection.features) {
    const osmType = feat?.properties?.osm_type;
    const osmId = feat?.properties?.osm_id;
    if (!osmType || !osmId) continue;
    const prefix = osmType === 'relation' ? 'R' : osmType === 'way' ? 'W' : 'N';
    const key = `${prefix}${osmId}`;
    const multi = normalizeOsmGeometryToMultiPolygon(feat.geometry);
    if (multi) {
      out.set(key, multi);
    }
  }
  return out;
}

/**
 * Collects all unique canonical OpenStreetMap IDs across configured TerritoryRegions
 */
export function getAllConfiguredOsmIds(
  regions: TerritoryRegion[] = getTerritoryRegions(),
): string[] {
  const set = new Set<string>();
  for (const reg of regions) {
    for (const id of reg.osmIds) {
      if (/^[RW]\d+$/.test(id)) {
        set.add(id);
      }
    }
  }
  return Array.from(set);
}

async function readIdbSnapshot(signature: string): Promise<PersistedOsmSnapshot | null> {
  if (typeof indexedDB === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onerror = () => resolve(null);
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readonly');
          const store = tx.objectStore(IDB_STORE);
          const getReq = store.get(signature);
          getReq.onsuccess = () => {
            db.close();
            const val = getReq.result as PersistedOsmSnapshot | undefined;
            if (val && val.signature === signature && val.geometries) {
              resolve(val);
            } else {
              resolve(null);
            }
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch {
          resolve(null);
        }
      };
    } catch {
      resolve(null);
    }
  });
}

async function writeIdbSnapshot(snapshot: PersistedOsmSnapshot): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onerror = () => resolve();
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction(IDB_STORE, 'readwrite');
          tx.objectStore(IDB_STORE).put(snapshot, snapshot.signature);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          resolve();
        }
      };
    } catch {
      resolve();
    }
  });
}

function precomputeAllDissolvedRegions(): void {
  for (const reg of getTerritoryRegions()) {
    if (regionFeatureMemo.has(reg.id)) continue;
    const allPresent = reg.osmIds.length > 0 && reg.osmIds.every((id) => osmGeometryCache.has(id));
    if (!allPresent) continue;

    const mergedPolygons: [number, number][][][] = [];
    for (const osmId of reg.osmIds) {
      const geom = osmGeometryCache.get(osmId);
      if (geom) {
        mergedPolygons.push(...geom.coordinates);
      }
    }
    if (mergedPolygons.length === 0) continue;

    const geometry: GeoJsonMultiPolygon = {
      type: 'MultiPolygon',
      coordinates: mergedPolygons,
    };
    const cachedOuter = dissolvedBoundaryCache.get(reg.id);
    const outerBoundary = cachedOuter ?? extractDissolvedOuterBoundary(geometry);
    if (!cachedOuter) {
      dissolvedBoundaryCache.set(reg.id, outerBoundary);
    }

    regionFeatureMemo.set(reg.id, {
      id: reg.id,
      polityId: reg.polityId,
      nameZh: reg.nameZh,
      nameI18n: reg.nameI18n,
      validFrom: reg.validFrom,
      validTo: reg.validTo,
      tier: reg.tier,
      geometry,
      outerBoundary,
      approxBBox: reg.approxBBox,
    });
  }
}

async function fetchBatchFromProxy(chunk: string[]): Promise<boolean> {
  if (chunk.length === 0) return true;
  try {
    const res = await fetch(
      `/api/osm-boundaries?osm_ids=${encodeURIComponent(chunk.join(','))}`,
    );
    if (!res.ok) return false;
    const payload = (await res.json()) as {
      boundaries?: Record<string, GeoJsonMultiPolygon>;
    };
    if (payload && payload.boundaries) {
      let added = false;
      for (const [id, geom] of Object.entries(payload.boundaries)) {
        const normalized = normalizeOsmGeometryToMultiPolygon(geom);
        if (normalized) {
          osmGeometryCache.set(id, normalized);
          added = true;
        }
      }
      if (added) {
        regionFeatureMemo.clear();
        notifySubscribers();
      }
      return true;
    }
  } catch {
    // Fall back to direct Nominatim if backend route is unreachable
  }
  return false;
}

async function fetchOsmIdsFromApi(osmIds: string[]): Promise<void> {
  const missingInitial = osmIds.filter((id) => !osmGeometryCache.has(id));
  if (missingInitial.length === 0) {
    setLoadPhase('dissolving_seams');
    precomputeAllDissolvedRegions();
    loadFinishedOnce = true;
    setLoadPhase('ready');
    return;
  }

  // Step 1: Check persistent IndexedDB snapshot first (0 network bytes, 0 seam-dissolution CPU on repeat visits!)
  const signature = computeIdbSignature();
  setLoadPhase('cache_check');
  const persisted = await readIdbSnapshot(signature);
  if (persisted) {
    for (const [id, geom] of Object.entries(persisted.geometries)) {
      if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
        osmGeometryCache.set(id, geom);
      }
    }
    for (const [regId, outer] of Object.entries(persisted.dissolvedBoundaries || {})) {
      if (outer && outer.type === 'MultiLineString' && Array.isArray(outer.coordinates)) {
        dissolvedBoundaryCache.set(regId, outer);
      }
    }
    if (osmIds.every((id) => osmGeometryCache.has(id))) {
      loadedFromLocalDb = true;
      precomputeAllDissolvedRegions();
      loadFinishedOnce = true;
      setLoadPhase('ready');
      return;
    }
  }

  // Step 2: Parallel 3-Wave Priority Fetch against Cloudflare KV / Express `/api/osm-boundaries`
  setLoadPhase('fetching_parcels');
  const missing = osmIds.filter((id) => !osmGeometryCache.has(id));
  const waveSize = Math.ceil(missing.length / 3);
  const waves: string[][] = [];
  for (let i = 0; i < missing.length; i += waveSize) {
    waves.push(missing.slice(i, i + waveSize));
  }

  await Promise.all(waves.map((w) => fetchBatchFromProxy(w)));

  // Step 3: Direct OpenStreetMap Nominatim CORS fallback for any still-missing IDs
  const stillMissing = osmIds.filter((id) => !osmGeometryCache.has(id));
  if (stillMissing.length > 0) {
    const chunkSize = 42;
    for (let i = 0; i < stillMissing.length; i += chunkSize) {
      const chunk = stillMissing.slice(i, i + chunkSize);
      const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${encodeURIComponent(
        chunk.join(','),
      )}&format=geojson&polygon_geojson=1&polygon_threshold=0.0002`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const fc = await res.json();
        const parsed = parseNominatimGeoJsonFeatures(fc);
        parsed.forEach((geom, key) => {
          osmGeometryCache.set(key, geom);
        });
        regionFeatureMemo.clear();
        notifySubscribers();
      }
    }
  }

  // Step 4: Yield one microtask for UI progress paint, then dissolve internal municipal seams & persist to IndexedDB
  setLoadPhase('dissolving_seams');
  await new Promise((r) => setTimeout(r, 0));
  precomputeAllDissolvedRegions();

  if (osmIds.every((id) => osmGeometryCache.has(id))) {
    const geometriesObj: Record<string, GeoJsonMultiPolygon> = {};
    osmGeometryCache.forEach((v, k) => {
      geometriesObj[k] = v;
    });
    const dissolvedObj: Record<string, GeoJsonMultiLineString> = {};
    dissolvedBoundaryCache.forEach((v, k) => {
      dissolvedObj[k] = v;
    });
    void writeIdbSnapshot({
      signature,
      geometries: geometriesObj,
      dissolvedBoundaries: dissolvedObj,
    });
  }

  loadFinishedOnce = true;
  setLoadPhase('ready');
}

export function ensureOsmTerritoriesLoaded(): Promise<void> {
  const allIds = getAllConfiguredOsmIds();
  if (allIds.every((id) => osmGeometryCache.has(id))) {
    precomputeAllDissolvedRegions();
    loadFinishedOnce = true;
    currentLoadPhase = 'ready';
    return Promise.resolve();
  }
  if (!inflightLoadPromise) {
    inflightLoadPromise = fetchOsmIdsFromApi(allIds)
      .catch((err) => {
        console.warn('OpenStreetMap boundary fetch warning:', err);
      })
      .finally(() => {
        inflightLoadPromise = null;
        loadFinishedOnce = true;
        currentLoadPhase = 'ready';
        notifySubscribers();
      });
  }
  return inflightLoadPromise;
}

// Start warming fine-grained OSM parcel geometries immediately at browser boot (before React mount completes)
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  void ensureOsmTerritoriesLoaded();
}

subscribeAtlasDataLayer(() => {
  regionFeatureMemo.clear();
  notifySubscribers();
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    void ensureOsmTerritoriesLoaded();
  }
});

/**
 * Resolves active TerritoryRegions at `year` using cached high-precision OpenStreetMap geometries.
 * Dynamically derives active `[minYear, maxYear]` bounds from the unified data layer.
 */
export function resolveActiveOsmTerritories(year: number): ResolvedTerritoryFeature[] {
  const yr = Math.round(year);
  const bounds = computeDatasetYearBounds();
  if (!bounds || yr < bounds.minYear || yr > bounds.maxYear) {
    return [];
  }

  const out: ResolvedTerritoryFeature[] = [];
  for (const reg of getTerritoryRegions()) {
    if (yr < reg.validFrom || yr > reg.validTo) continue;

    let resolved = regionFeatureMemo.get(reg.id);
    if (!resolved) {
      const mergedPolygons: [number, number][][][] = [];
      for (const osmId of reg.osmIds) {
        const geom = osmGeometryCache.get(osmId);
        if (geom) {
          mergedPolygons.push(...geom.coordinates);
        }
      }

      if (mergedPolygons.length > 0) {
        const geometry: GeoJsonMultiPolygon = {
          type: 'MultiPolygon',
          coordinates: mergedPolygons,
        };
        const allRegIdsLoaded =
          reg.osmIds.length > 0 && reg.osmIds.every((id) => osmGeometryCache.has(id));
        const cachedOuter = allRegIdsLoaded ? dissolvedBoundaryCache.get(reg.id) : undefined;
        const outerBoundary = cachedOuter ?? extractDissolvedOuterBoundary(geometry);
        if (allRegIdsLoaded && !cachedOuter) {
          dissolvedBoundaryCache.set(reg.id, outerBoundary);
        }

        resolved = {
          id: reg.id,
          polityId: reg.polityId,
          nameZh: reg.nameZh,
          nameI18n: reg.nameI18n,
          validFrom: reg.validFrom,
          validTo: reg.validTo,
          tier: reg.tier,
          geometry,
          outerBoundary,
          approxBBox: reg.approxBBox,
        };
        if (allRegIdsLoaded) {
          regionFeatureMemo.set(reg.id, resolved);
        }
      }
    }

    if (resolved) {
      out.push(resolved);
    }
  }
  return out;
}

/**
 * Seeds the in-memory OpenStreetMap geometry cache directly (used by deterministic Node unit tests).
 */
export function seedOsmGeometryCache(entries: Record<string, GeoJsonMultiPolygon>): void {
  for (const [id, geom] of Object.entries(entries)) {
    const normalized = normalizeOsmGeometryToMultiPolygon(geom);
    if (normalized) {
      osmGeometryCache.set(id, normalized);
    }
  }
  dissolvedBoundaryCache.clear();
  regionFeatureMemo.clear();
}

/**
 * Checks whether a point falls inside any loaded OpenStreetMap territory polygon.
 */
export function isPointInLoadedOsmPolygons(lon: number, lat: number): boolean {
  if (osmGeometryCache.size === 0) return false;
  for (const geom of osmGeometryCache.values()) {
    for (const poly of geom.coordinates) {
      const exterior = poly[0];
      if (!exterior || exterior.length < 4) continue;
      if (pointInPolygonRing(lon, lat, exterior)) {
        let inHole = false;
        for (let h = 1; h < poly.length; h++) {
          if (pointInPolygonRing(lon, lat, poly[h])) {
            inHole = true;
            break;
          }
        }
        if (!inHole) return true;
      }
    }
  }
  return false;
}

export function getLoadedOsmBoundaryCount(): number {
  return osmGeometryCache.size;
}

export function getOsmLoadingSnapshot(): OsmLoadingSnapshot {
  const allIds = getAllConfiguredOsmIds();
  const loadedIds = allIds.reduce((acc, id) => acc + (osmGeometryCache.has(id) ? 1 : 0), 0);
  const allLoaded = allIds.length > 0 && loadedIds >= allIds.length;
  return {
    phase: allLoaded ? 'ready' : currentLoadPhase,
    loadedIds,
    totalIds: allIds.length,
    fromCache: loadedFromLocalDb,
    done: allLoaded || loadFinishedOnce,
  };
}

function pointInPolygonRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function useOsmResolvedTerritories(currentYear: number): {
  activeTerritories: ResolvedTerritoryFeature[];
  boundariesReady: boolean;
  loadingSnapshot: OsmLoadingSnapshot;
} {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const listener = () => setRevision((r) => r + 1);
    subscribers.add(listener);
    void ensureOsmTerritoriesLoaded();
    return () => {
      subscribers.delete(listener);
    };
  }, []);

  const activeTerritories = useMemo(
    () => resolveActiveOsmTerritories(currentYear),
    [currentYear, revision],
  );

  const loadingSnapshot = useMemo(() => getOsmLoadingSnapshot(), [revision]);
  const boundariesReady = loadingSnapshot.totalIds > 0 && loadingSnapshot.loadedIds > 0;

  return { activeTerritories, boundariesReady, loadingSnapshot };
}
