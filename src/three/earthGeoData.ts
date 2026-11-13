import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import land50mTopology from 'world-atlas/land-50m.json';
import {
  getLoadedOsmBoundaryCount,
  isPointInLoadedOsmPolygons,
} from '../services/osmBoundaryService';

import {
  buildSlabIndexedPolygon,
  isPointInSlabPolygon,
  SlabIndexedPolygon,
} from '../utils/slabPolygonIndex';

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: any[];
    };
    properties?: Record<string, unknown>;
  }>;
}

interface TaggedLand50mPolygon {
  landmassId: number;
  slab: SlabIndexedPolygon;
}

let cachedLand50mGeoJson: GeoJsonFeatureCollection | null = null;
let cachedLand50mGrid: Map<number, TaggedLand50mPolygon[]> | null = null;

const GRID_DEG = 5;

function gridKey(gx: number, gy: number): number {
  return (gy + 90) * 1000 + (gx + 360);
}

/**
 * Global 1:50m Natural Earth land GeoJSON (used strictly as an offline basemap fallback if CARTO vector tiles are unreachable)
 */
export function getLand50mGeoJson(): GeoJsonFeatureCollection {
  if (cachedLand50mGeoJson) return cachedLand50mGeoJson;
  const topo = land50mTopology as unknown as Topology<{ land: GeometryCollection }>;
  const geo = feature(topo, topo.objects.land) as unknown as GeoJsonFeatureCollection;
  cachedLand50mGeoJson =
    geo.type === 'FeatureCollection' ? geo : { type: 'FeatureCollection', features: [geo as any] };
  return cachedLand50mGeoJson;
}

function getLand50mSpatialGrid(): Map<number, TaggedLand50mPolygon[]> {
  if (cachedLand50mGrid) return cachedLand50mGrid;
  const fc = getLand50mGeoJson();
  const list: SlabIndexedPolygon[] = [];

  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === 'Polygon') {
      const sp = buildSlabIndexedPolygon(f.geometry.coordinates as [number, number][][]);
      if (sp) list.push(sp);
    } else if (f.geometry.type === 'MultiPolygon') {
      const polys = f.geometry.coordinates as [number, number][][][];
      for (let i = 0; i < polys.length; i++) {
        const sp = buildSlabIndexedPolygon(polys[i]);
        if (sp) list.push(sp);
      }
    }
  }

  // Sort largest continents first (Afro-Eurasia at landmassId 0) so continental land checks hit on iteration 0
  list.sort(
    (a, b) =>
      (b.maxLon - b.minLon) * (b.maxLat - b.minLat) -
      (a.maxLon - a.minLon) * (a.maxLat - a.minLat),
  );

  const grid = new Map<number, TaggedLand50mPolygon[]>();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const tagged: TaggedLand50mPolygon = { landmassId: i, slab: p };
    const gx0 = Math.floor(p.minLon / GRID_DEG);
    const gx1 = Math.floor(p.maxLon / GRID_DEG);
    const gy0 = Math.floor(p.minLat / GRID_DEG);
    const gy1 = Math.floor(p.maxLat / GRID_DEG);
    for (let gy = gy0; gy <= gy1; gy++) {
      for (let gx = gx0; gx <= gx1; gx++) {
        const k = gridKey(gx, gy);
        const bucket = grid.get(k);
        if (bucket) bucket.push(tagged);
        else grid.set(k, [tagged]);
      }
    }
  }

  cachedLand50mGrid = grid;
  return grid;
}

/**
 * Returns the unique 1:50m Natural Earth landmass polygon ID (`>= 0`, with `0` = Afro-Eurasia)
 * containing `(lon, lat)`, or `-1` if `(lon, lat)` is on water.
 * Used to guarantee inland border probes never jump across narrow sea straits between an island and a continent.
 */
export function getContinentalLandmassId50m(lon: number, lat: number): number {
  const bucket = getLand50mSpatialGrid().get(
    gridKey(Math.floor(lon / GRID_DEG), Math.floor(lat / GRID_DEG)),
  );
  if (!bucket) return -1;
  for (let i = 0; i < bucket.length; i++) {
    if (isPointInSlabPolygon(lon, lat, bucket[i].slab)) {
      return bucket[i].landmassId;
    }
  }
  return -1;
}

/**
 * Pure 1:50m Natural Earth continental/island landmass check using 5° grid + O(1) latitude-slab buckets
 * (excludes fine-grained OpenStreetMap polygons so coastal vs continental-inland rays evaluate cleanly).
 */
export function isPointOnContinentalLand50m(lon: number, lat: number): boolean {
  return getContinentalLandmassId50m(lon, lat) !== -1;
}

/**
 * High-speed slab-indexed land check:
 * Checks slab-indexed OpenStreetMap polygons first, then slab-indexed Natural Earth 1:50m continental rings.
 */
export function isPointOnMediterraneanLand(lon: number, lat: number): boolean {
  if (getLoadedOsmBoundaryCount() > 0 && isPointInLoadedOsmPolygons(lon, lat)) {
    return true;
  }
  return isPointOnContinentalLand50m(lon, lat);
}

