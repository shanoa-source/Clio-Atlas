import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { geoContains } from 'd3-geo';
import land50mTopology from 'world-atlas/land-50m.json';
import {
  getLoadedOsmBoundaryCount,
  isPointInLoadedOsmPolygons,
} from '../services/osmBoundaryService';

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

let cachedLand50mGeoJson: GeoJsonFeatureCollection | null = null;

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

/**
 * Land check for regional population density pixel sampling:
 * Uses loaded OpenStreetMap polygons directly when ready, with global land-50m fallback.
 */
export function isPointOnMediterraneanLand(lon: number, lat: number): boolean {
  if (getLoadedOsmBoundaryCount() > 0 && isPointInLoadedOsmPolygons(lon, lat)) {
    return true;
  }
  const fc = getLand50mGeoJson();
  for (const f of fc.features) {
    if (geoContains(f as any, [lon, lat])) {
      return true;
    }
  }
  return false;
}
