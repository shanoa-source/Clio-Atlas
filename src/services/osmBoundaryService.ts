import { useEffect, useMemo, useState } from 'react';
import { geoArea } from 'd3-geo';
import {
  computeDatasetYearBounds,
  getPolityPhases,
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
const osmIndexedCache = new Map<string, IndexedPolygonRing[]>();
const dissolvedBoundaryCache = new Map<string, GeoJsonMultiLineString>();
const regionFeatureMemo = new Map<string, ResolvedTerritoryFeature>();
let lastResolvedSig = '';
let lastResolvedList: ResolvedTerritoryFeature[] = [];
let inflightLoadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

let currentLoadPhase: OsmLoadPhase = 'idle';
let loadedFromLocalDb = false;
let loadFinishedOnce = false;

const IDB_NAME = 'civ_atlas_geodesic_cache_v5';
const IDB_STORE = 'snapshots';

function computeIdbSignature(): string {
  const regions = getTerritoryRegions();
  return `atlas_osm_v5_${regions.map((r) => `${r.id}:${r.osmIds.join('+')}`).join('|')}`;
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
  const fmt = (n: number) => Math.round(n * 10000);
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

  const incomingByEnd = new Map<string, number[]>();
  exteriorSegs.forEach((seg, idx) => {
    const outBucket = outgoingByStart.get(seg.startKey);
    if (outBucket) outBucket.push(idx);
    else outgoingByStart.set(seg.startKey, [idx]);

    const inBucket = incomingByEnd.get(seg.endKey);
    if (inBucket) inBucket.push(idx);
    else incomingByEnd.set(seg.endKey, [idx]);
  });

  const visited = new Uint8Array(exteriorSegs.length);
  const lines: [number, number][][] = [];

  for (let i = 0; i < exteriorSegs.length; i++) {
    if (visited[i]) continue;
    visited[i] = 1;
    const forwardPts: [number, number][] = [exteriorSegs[i].a, exteriorSegs[i].b];
    let currEnd = exteriorSegs[i].endKey;

    while (true) {
      const candidates = outgoingByStart.get(currEnd);
      if (!candidates) break;
      const nextIdx = candidates.find((c) => !visited[c]);
      if (nextIdx === undefined) break;
      visited[nextIdx] = 1;
      forwardPts.push(exteriorSegs[nextIdx].b);
      currEnd = exteriorSegs[nextIdx].endKey;
    }

    const backwardPts: [number, number][] = [];
    let currStart = exteriorSegs[i].startKey;
    while (currStart !== currEnd) {
      const prevCandidates = incomingByEnd.get(currStart);
      if (!prevCandidates) break;
      const prevIdx = prevCandidates.find((c) => !visited[c]);
      if (prevIdx === undefined) break;
      visited[prevIdx] = 1;
      backwardPts.push(exteriorSegs[prevIdx].a);
      currStart = exteriorSegs[prevIdx].startKey;
    }

    const chain =
      backwardPts.length > 0 ? [...backwardPts.reverse(), ...forwardPts] : forwardPts;
    if (chain.length >= 2) {
      lines.push(chain);
    }
  }

  return {
    type: 'MultiLineString',
    coordinates: lines,
  };
}

function stripAcuteMicroBurrs(
  pts: [number, number][],
  isClosed: boolean,
): [number, number][] {
  if (pts.length < 6) return pts;
  const openPts = isClosed ? pts.slice(0, -1) : pts.slice();
  if (openPts.length < 5) return pts;

  const maxSpikeSegDeg = 0.0095; // ~1 km micro-burr threshold
  const filtered: [number, number][] = [];
  const n = openPts.length;

  for (let i = 0; i < n; i++) {
    if (!isClosed && (i === 0 || i === n - 1)) {
      filtered.push(openPts[i]);
      continue;
    }
    const prev = filtered.length > 0 ? filtered[filtered.length - 1] : openPts[(i - 1 + n) % n];
    const curr = openPts[i];
    const next = openPts[(i + 1) % n];

    const dx1 = curr[0] - prev[0];
    const dy1 = curr[1] - prev[1];
    const dx2 = next[0] - curr[0];
    const dy2 = next[1] - curr[1];
    const len1 = Math.hypot(dx1, dy1);
    const len2 = Math.hypot(dx2, dy2);

    if (len1 < 1e-6) {
      continue;
    }
    // Drop sub-kilometer hairpin spikes / jagged spurs where direction reverses sharply (> ~120° turn)
    if (len1 < maxSpikeSegDeg && len2 < maxSpikeSegDeg && len2 > 1e-6) {
      const cosTurn = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      if (cosTurn < -0.48) {
        continue;
      }
    }
    filtered.push(curr);
  }

  if (filtered.length < 3) return pts;
  if (isClosed) {
    return [...filtered, filtered[0]];
  }
  return filtered;
}

function chaikinClampPass(
  pts: [number, number][],
  isClosed: boolean,
  maxDispDeg = 0.0018,
  cosTurnThreshold = 0.96,
  minSegDeg = 0.0018,
): [number, number][] {
  const openPts = isClosed ? pts.slice(0, -1) : pts;
  const n = openPts.length;
  if (n < 3) return pts;

  const out: [number, number][] = [];
  if (!isClosed) {
    out.push(openPts[0]);
  }

  const limit = isClosed ? n : n - 1;
  const start = isClosed ? 0 : 1;

  for (let i = start; i < limit; i++) {
    const prev = openPts[(i - 1 + n) % n];
    const curr = openPts[i];
    const next = openPts[(i + 1) % n];

    const v1x = curr[0] - prev[0];
    const v1y = curr[1] - prev[1];
    const v2x = next[0] - curr[0];
    const v2y = next[1] - curr[1];
    const l1 = Math.hypot(v1x, v1y);
    const l2 = Math.hypot(v2x, v2y);

    if (l1 < 1e-6 || l2 < 1e-6 || (l1 < minSegDeg && l2 < minSegDeg)) {
      out.push(curr);
      continue;
    }

    const cosTurn = (v1x * v2x + v1y * v2y) / (l1 * l2);
    // Straight, gentle, or already-dense segments need zero extra vertices
    if (cosTurn > cosTurnThreshold) {
      out.push(curr);
      continue;
    }

    // Clamp corner-cut offset to <= `maxDispDeg` (~190m) so geography never drifts off coastlines
    const t1 = Math.min(0.25, maxDispDeg / l1);
    const t2 = Math.min(0.25, maxDispDeg / l2);
    const q1: [number, number] = [
      Math.round((curr[0] - v1x * t1) * 100000) * 0.00001,
      Math.round((curr[1] - v1y * t1) * 100000) * 0.00001,
    ];
    const q2: [number, number] = [
      Math.round((curr[0] + v2x * t2) * 100000) * 0.00001,
      Math.round((curr[1] + v2y * t2) * 100000) * 0.00001,
    ];
    out.push(q1, q2);
  }

  if (!isClosed) {
    out.push(openPts[n - 1]);
  } else if (out.length > 0) {
    out.push(out[0]);
  }

  return out;
}

/**
 * Eliminates acute sub-kilometer coastal/frontier burrs ("毛刺") and rounds sharp polygonal
 * corners via adaptive displacement-clamped Chaikin refinement while avoiding vertex bloat on dense islands.
 */
export function smoothBoundaryMultiLineString(
  mls: GeoJsonMultiLineString,
): GeoJsonMultiLineString {
  const smoothedLines = mls.coordinates.map((line) => {
    if (line.length < 6) return line;
    const first = line[0];
    const last = line[line.length - 1];
    const isClosed =
      Math.abs(first[0] - last[0]) < 1e-4 && Math.abs(first[1] - last[1]) < 1e-4;

    const deburred = stripAcuteMicroBurrs(line, isClosed);
    if (deburred.length < 6) return deburred;
    const pass1 = chaikinClampPass(deburred, isClosed, 0.0018, 0.955, 0.0016);
    // Second refinement targets only remaining sharp angles (> ~28° bend) to keep vertex counts lean
    return chaikinClampPass(pass1, isClosed, 0.001, 0.88, 0.0022);
  });

  return {
    type: 'MultiLineString',
    coordinates: smoothedLines,
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

const EMPTY_MULTI_LINE: GeoJsonMultiLineString = {
  type: 'MultiLineString',
  coordinates: [],
};

function isTerritoryExclusivelyUnbounded(reg: TerritoryRegion): boolean {
  const allPolities = getPolityPhases();
  if (reg.polityId) {
    const owner = allPolities.find((p) => p.id === reg.polityId);
    if (owner) return owner.boundaryMode === 'unbounded';
  }
  const overlapping = allPolities.filter(
    (p) => p.startYear <= reg.validTo && p.endYear >= reg.validFrom,
  );
  return overlapping.length > 0 && overlapping.every((p) => p.boundaryMode === 'unbounded');
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
    const unboundedOnly = isTerritoryExclusivelyUnbounded(reg);
    const cachedOuter = dissolvedBoundaryCache.get(reg.id);
    const outerBoundary = unboundedOnly
      ? EMPTY_MULTI_LINE
      : (cachedOuter ?? smoothBoundaryMultiLineString(extractDissolvedOuterBoundary(geometry)));
    if (!unboundedOnly && !cachedOuter) {
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
          osmIndexedCache.set(id, buildIndexedPolygons(normalized));
          added = true;
        }
      }
      if (added) {
        regionFeatureMemo.clear();
        lastResolvedSig = '';
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
        osmIndexedCache.set(id, buildIndexedPolygons(geom));
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
          osmIndexedCache.set(key, buildIndexedPolygons(geom));
        });
        regionFeatureMemo.clear();
        lastResolvedSig = '';
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
  lastResolvedSig = '';
  notifySubscribers();
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    void ensureOsmTerritoriesLoaded();
  }
});

const EMPTY_TERRITORIES: ResolvedTerritoryFeature[] = [];

/**
 * Resolves active TerritoryRegions at `year` using cached high-precision OpenStreetMap geometries.
 * Dynamically derives active `[minYear, maxYear]` bounds from the unified data layer and preserves
 * reference stability (`===`) across consecutive years with identical active regions.
 */
export function resolveActiveOsmTerritories(year: number): ResolvedTerritoryFeature[] {
  const yr = Math.round(year);
  const bounds = computeDatasetYearBounds();
  if (!bounds || yr < bounds.minYear || yr > bounds.maxYear) {
    return EMPTY_TERRITORIES;
  }

  const allRegions = getTerritoryRegions();
  const activeRegs: TerritoryRegion[] = [];
  let sig = `${osmGeometryCache.size}:`;
  for (let i = 0; i < allRegions.length; i++) {
    const reg = allRegions[i];
    if (yr >= reg.validFrom && yr <= reg.validTo) {
      activeRegs.push(reg);
      sig += `${reg.id},`;
    }
  }

  if (activeRegs.length === 0) {
    return EMPTY_TERRITORIES;
  }
  if (sig === lastResolvedSig) {
    return lastResolvedList;
  }

  const out: ResolvedTerritoryFeature[] = [];
  for (const reg of activeRegs) {
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
        const unboundedOnly = isTerritoryExclusivelyUnbounded(reg);
        const cachedOuter = allRegIdsLoaded ? dissolvedBoundaryCache.get(reg.id) : undefined;
        const outerBoundary = unboundedOnly
          ? EMPTY_MULTI_LINE
          : (cachedOuter ?? smoothBoundaryMultiLineString(extractDissolvedOuterBoundary(geometry)));
        if (!unboundedOnly && allRegIdsLoaded && !cachedOuter) {
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

  lastResolvedSig = sig;
  lastResolvedList = out;
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
      osmIndexedCache.set(id, buildIndexedPolygons(normalized));
    }
  }
  dissolvedBoundaryCache.clear();
  regionFeatureMemo.clear();
  lastResolvedSig = '';
}

/**
 * Checks whether a point falls inside any loaded OpenStreetMap territory polygon using prebuilt bbox indices.
 */
export function isPointInLoadedOsmPolygons(lon: number, lat: number): boolean {
  if (osmGeometryCache.size === 0) return false;
  for (const [id, geom] of osmGeometryCache.entries()) {
    let indexed = osmIndexedCache.get(id);
    if (!indexed) {
      indexed = buildIndexedPolygons(geom);
      osmIndexedCache.set(id, indexed);
    }
    if (isPointInsideCandidatePolygons(lon, lat, indexed)) {
      return true;
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
