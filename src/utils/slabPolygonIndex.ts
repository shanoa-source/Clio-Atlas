import { GeoJsonMultiPolygon } from '../types/history';

const DEFAULT_SLAB_DEG = 0.025; // ~2.7 km latitude bands -> O(1) ray-cast even on 25,000-vertex Eurasia

export interface SlabIndexedRing {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  slabDeg: number;
  slabCount: number;
  slabs: Array<number[] | null>;
  ex1: Float64Array;
  ey1: Float64Array;
  ex2: Float64Array;
  ey2: Float64Array;
}

export interface SlabIndexedPolygon {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  exterior: SlabIndexedRing;
  holes: SlabIndexedRing[];
}

export function buildSlabIndexedRing(
  ring: [number, number][],
  slabDeg = DEFAULT_SLAB_DEG,
): SlabIndexedRing {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (let i = 0; i < ring.length; i++) {
    const [x, y] = ring[i];
    if (x < minLon) minLon = x;
    if (y < minLat) minLat = y;
    if (x > maxLon) maxLon = x;
    if (y > maxLat) maxLat = y;
  }

  const n = Math.max(0, ring.length - 1);
  const ex1 = new Float64Array(n);
  const ey1 = new Float64Array(n);
  const ex2 = new Float64Array(n);
  const ey2 = new Float64Array(n);

  const slabCount = Math.max(1, Math.ceil((maxLat - minLat) / slabDeg) + 1);
  const slabs: Array<number[] | null> = new Array(slabCount).fill(null);

  for (let i = 0; i < n; i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[i + 1][0];
    const yj = ring[i + 1][1];
    ex1[i] = xi;
    ey1[i] = yi;
    ex2[i] = xj;
    ey2[i] = yj;

    // Skip antimeridian jumps or horizontal edges (horizontal edges never cross ray y = lat)
    if (Math.abs(xj - xi) > 180 || yi === yj) continue;

    const lo = Math.max(0, Math.floor((Math.min(yi, yj) - minLat) / slabDeg));
    const hi = Math.min(slabCount - 1, Math.floor((Math.max(yi, yj) - minLat) / slabDeg));
    for (let s = lo; s <= hi; s++) {
      let bucket = slabs[s];
      if (!bucket) {
        bucket = [];
        slabs[s] = bucket;
      }
      bucket.push(i);
    }
  }

  return {
    minLon,
    minLat,
    maxLon,
    maxLat,
    slabDeg,
    slabCount,
    slabs,
    ex1,
    ey1,
    ex2,
    ey2,
  };
}

export function isPointInSlabRing(lon: number, lat: number, ring: SlabIndexedRing): boolean {
  if (lon < ring.minLon || lon > ring.maxLon || lat < ring.minLat || lat > ring.maxLat) {
    return false;
  }
  const s = Math.floor((lat - ring.minLat) / ring.slabDeg);
  if (s < 0 || s >= ring.slabCount) return false;
  const bucket = ring.slabs[s];
  if (!bucket) return false;

  let inside = false;
  const { ex1, ey1, ex2, ey2 } = ring;
  for (let k = 0; k < bucket.length; k++) {
    const idx = bucket[k];
    const yi = ey1[idx];
    const yj = ey2[idx];
    if (yi > lat !== yj > lat) {
      const xi = ex1[idx];
      const xj = ex2[idx];
      if (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

export function buildSlabIndexedPolygon(
  coords: [number, number][][],
  slabDeg = DEFAULT_SLAB_DEG,
): SlabIndexedPolygon | null {
  const extCoords = coords[0];
  if (!extCoords || extCoords.length < 4) return null;

  const exterior = buildSlabIndexedRing(extCoords, slabDeg);
  const holes: SlabIndexedRing[] = [];
  for (let h = 1; h < coords.length; h++) {
    if (coords[h] && coords[h].length >= 4) {
      holes.push(buildSlabIndexedRing(coords[h], slabDeg));
    }
  }

  return {
    minLon: exterior.minLon,
    minLat: exterior.minLat,
    maxLon: exterior.maxLon,
    maxLat: exterior.maxLat,
    exterior,
    holes,
  };
}

export function isPointInSlabPolygon(lon: number, lat: number, poly: SlabIndexedPolygon): boolean {
  if (lon < poly.minLon || lon > poly.maxLon || lat < poly.minLat || lat > poly.maxLat) {
    return false;
  }
  if (!isPointInSlabRing(lon, lat, poly.exterior)) {
    return false;
  }
  for (let h = 0; h < poly.holes.length; h++) {
    if (isPointInSlabRing(lon, lat, poly.holes[h])) {
      return false;
    }
  }
  return true;
}

export function buildSlabIndexedMultiPolygon(
  multi: GeoJsonMultiPolygon,
  slabDeg = DEFAULT_SLAB_DEG,
): SlabIndexedPolygon[] {
  const out: SlabIndexedPolygon[] = [];
  for (let i = 0; i < multi.coordinates.length; i++) {
    const sp = buildSlabIndexedPolygon(multi.coordinates[i], slabDeg);
    if (sp) out.push(sp);
  }
  return out;
}

export function isPointInSlabMultiPolygon(
  lon: number,
  lat: number,
  polys: SlabIndexedPolygon[],
  skipIdx = -1,
): boolean {
  for (let i = 0; i < polys.length; i++) {
    if (i === skipIdx) continue;
    if (isPointInSlabPolygon(lon, lat, polys[i])) {
      return true;
    }
  }
  return false;
}
