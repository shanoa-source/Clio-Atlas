import { useEffect, useMemo, useState } from 'react';
import { geoArea } from 'd3-geo';
import {
  ATHENS_DATA_END_YEAR,
  ATHENS_DATA_START_YEAR,
  ATHENS_TERRITORY_REGIONS,
} from '../data/athensClassicalData';
import {
  GeoJsonMultiLineString,
  GeoJsonMultiPolygon,
  ResolvedTerritoryFeature,
  TerritoryRegion,
} from '../types/history';

const osmGeometryCache = new Map<string, GeoJsonMultiPolygon>();
const regionFeatureMemo = new Map<string, ResolvedTerritoryFeature>();
let inflightLoadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function notifySubscribers(): void {
  regionFeatureMemo.clear();
  subscribers.forEach((cb) => cb());
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
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  exterior: [number, number][];
  holes: [number, number][][];
}

function buildIndexedPolygons(multiPolygons: GeoJsonMultiPolygon[]): IndexedPolygonRing[] {
  const indexed: IndexedPolygonRing[] = [];
  for (const mp of multiPolygons) {
    for (const poly of mp.coordinates) {
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
        minLon,
        minLat,
        maxLon,
        maxLat,
        exterior,
        holes: poly.slice(1),
      });
    }
  }
  return indexed;
}

function isPointInsideIndexedPolygons(
  lon: number,
  lat: number,
  indexed: IndexedPolygonRing[],
): boolean {
  for (let i = 0; i < indexed.length; i++) {
    const p = indexed[i];
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
 */
export function extractDissolvedOuterBoundary(
  multiPolygon: GeoJsonMultiPolygon,
): GeoJsonMultiLineString {
  const fmt = (n: number) => n.toFixed(4);
  const undirectedCounts = new Map<string, number>();
  const directedSegments: Array<{
    startKey: string;
    endKey: string;
    undirectedKey: string;
    a: [number, number];
    b: [number, number];
  }> = [];

  for (const poly of multiPolygon.coordinates) {
    for (const ring of poly) {
      for (let i = 0; i < ring.length - 1; i++) {
        const a = ring[i];
        const b = ring[i + 1];
        const startKey = `${fmt(a[0])},${fmt(a[1])}`;
        const endKey = `${fmt(b[0])},${fmt(b[1])}`;
        if (startKey === endKey) continue;
        const undirectedKey = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
        undirectedCounts.set(undirectedKey, (undirectedCounts.get(undirectedKey) ?? 0) + 1);
        directedSegments.push({ startKey, endKey, undirectedKey, a, b });
      }
    }
  }

  const indexedPolys =
    multiPolygon.coordinates.length > 1 ? buildIndexedPolygons([multiPolygon]) : null;
  const normalEps = 0.0014; // ~140m normal probe dissolves any Douglas-Peucker slit between adjacent municipalities

  // Retain strictly exterior segments (neither exact-vertex shared nor interior to neighboring sub-polygons)
  const outgoingByStart = new Map<string, number[]>();
  const exteriorSegs = directedSegments.filter((seg) => {
    if ((undirectedCounts.get(seg.undirectedKey) ?? 0) > 1) return false;
    if (indexedPolys) {
      const dx = seg.b[0] - seg.a[0];
      const dy = seg.b[1] - seg.a[1];
      const len = Math.hypot(dx, dy);
      if (len > 1e-7) {
        const mx = (seg.a[0] + seg.b[0]) * 0.5;
        const my = (seg.a[1] + seg.b[1]) * 0.5;
        const nx = (-dy / len) * normalEps;
        const ny = (dx / len) * normalEps;
        const leftInside = isPointInsideIndexedPolygons(mx + nx, my + ny, indexedPolys);
        const rightInside = isPointInsideIndexedPolygons(mx - nx, my - ny, indexedPolys);
        if (leftInside && rightInside) {
          return false;
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
  regions: TerritoryRegion[] = ATHENS_TERRITORY_REGIONS,
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

async function fetchOsmIdsFromApi(osmIds: string[]): Promise<void> {
  const missing = osmIds.filter((id) => !osmGeometryCache.has(id));
  if (missing.length === 0) return;

  // 1. Primary path: local Express `/api/osm-boundaries` proxy with persistent disk cache
  try {
    const res = await fetch(
      `/api/osm-boundaries?osm_ids=${encodeURIComponent(missing.join(','))}`,
    );
    if (res.ok) {
      const payload = (await res.json()) as {
        boundaries?: Record<string, GeoJsonMultiPolygon>;
      };
      if (payload && payload.boundaries) {
        for (const [id, geom] of Object.entries(payload.boundaries)) {
          const normalized = normalizeOsmGeometryToMultiPolygon(geom);
          if (normalized) {
            osmGeometryCache.set(id, normalized);
          }
        }
      }
    }
  } catch {
    // Fall through to direct OpenStreetMap Nominatim lookup if backend route is unavailable
  }

  // 2. Direct OpenStreetMap Nominatim CORS fallback for any still-missing IDs
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
      }
    }
  }
}

export function ensureOsmTerritoriesLoaded(): Promise<void> {
  const allIds = getAllConfiguredOsmIds();
  if (allIds.every((id) => osmGeometryCache.has(id))) {
    return Promise.resolve();
  }
  if (!inflightLoadPromise) {
    inflightLoadPromise = fetchOsmIdsFromApi(allIds)
      .catch((err) => {
        console.warn('OpenStreetMap boundary fetch warning:', err);
      })
      .finally(() => {
        inflightLoadPromise = null;
        notifySubscribers();
      });
  }
  return inflightLoadPromise;
}

/**
 * Resolves active TerritoryRegions at `year` using cached high-precision OpenStreetMap geometries.
 * Strictly returns `[]` before 500 BCE or after 404 BCE.
 */
export function resolveActiveOsmTerritories(year: number): ResolvedTerritoryFeature[] {
  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) {
    return [];
  }

  const out: ResolvedTerritoryFeature[] = [];
  for (const reg of ATHENS_TERRITORY_REGIONS) {
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
        resolved = {
          id: reg.id,
          nameZh: reg.nameZh,
          validFrom: reg.validFrom,
          validTo: reg.validTo,
          tier: reg.tier,
          geometry,
          outerBoundary: extractDissolvedOuterBoundary(geometry),
        };
        regionFeatureMemo.set(reg.id, resolved);
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

  const allIds = useMemo(() => getAllConfiguredOsmIds(), []);
  const boundariesReady = allIds.length > 0 && osmGeometryCache.size > 0;

  return { activeTerritories, boundariesReady };
}
