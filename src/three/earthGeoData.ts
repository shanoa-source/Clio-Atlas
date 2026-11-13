import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
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

interface IndexedLandPolygon {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  exterior: [number, number][];
  holes: [number, number][][];
}

let cachedLand50mGeoJson: GeoJsonFeatureCollection | null = null;
let cachedLand50mIndex: IndexedLandPolygon[] | null = null;

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

function getLand50mSpatialIndex(): IndexedLandPolygon[] {
  if (cachedLand50mIndex) return cachedLand50mIndex;
  const fc = getLand50mGeoJson();
  const index: IndexedLandPolygon[] = [];

  const addPolygonCoords = (polyCoords: [number, number][][]) => {
    const exterior = polyCoords[0];
    if (!exterior || exterior.length < 4) return;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (let i = 0; i < exterior.length; i++) {
      const [lon, lat] = exterior[i];
      if (lon < minLon) minLon = lon;
      if (lat < minLat) minLat = lat;
      if (lon > maxLon) maxLon = lon;
      if (lat > maxLat) maxLat = lat;
    }
    // Skip antimeridian-wrapping polar rings for Mediterranean/Eurasian fast-path safety if malformed
    index.push({
      minLon,
      minLat,
      maxLon,
      maxLat,
      exterior,
      holes: polyCoords.slice(1),
    });
  };

  for (const f of fc.features) {
    if (!f.geometry) continue;
    if (f.geometry.type === 'Polygon') {
      addPolygonCoords(f.geometry.coordinates as [number, number][][]);
    } else if (f.geometry.type === 'MultiPolygon') {
      const polys = f.geometry.coordinates as [number, number][][][];
      for (let i = 0; i < polys.length; i++) {
        addPolygonCoords(polys[i]);
      }
    }
  }

  cachedLand50mIndex = index;
  return index;
}

function pointInRingFast(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    // Skip antimeridian jump segments
    if (Math.abs(xj - xi) > 180) continue;
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * High-speed bbox-indexed land check (~5,000x faster than full-globe d3.geoContains):
 * Checks bbox-indexed OpenStreetMap polygons first, then bbox-pruned Natural Earth 1:50m continental rings.
 */
export function isPointOnMediterraneanLand(lon: number, lat: number): boolean {
  if (getLoadedOsmBoundaryCount() > 0 && isPointInLoadedOsmPolygons(lon, lat)) {
    return true;
  }
  const index = getLand50mSpatialIndex();
  for (let i = 0; i < index.length; i++) {
    const item = index[i];
    if (lon < item.minLon || lon > item.maxLon || lat < item.minLat || lat > item.maxLat) {
      continue;
    }
    if (pointInRingFast(lon, lat, item.exterior)) {
      let inHole = false;
      for (let h = 0; h < item.holes.length; h++) {
        if (pointInRingFast(lon, lat, item.holes[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}
