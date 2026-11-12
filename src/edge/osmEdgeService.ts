import { GeoJsonMultiPolygon } from '../types/history';
import { EdgeEnv } from './types';

const isolateOsmBoundaryCache = new Map<string, GeoJsonMultiPolygon>();

export interface OsmEdgeServiceOptions {
  fetchImpl?: typeof fetch;
  /** Optional initial seed map (e.g. from local dev disk cache in `server.ts`) */
  initialCache?: ReadonlyMap<string, GeoJsonMultiPolygon>;
  /** Optional callback fired when new geometries are fetched from Nominatim */
  onBatchFetched?: (newlyResolved: ReadonlyMap<string, GeoJsonMultiPolygon>) => void;
  /** Override inter-chunk delay in ms (defaults to 1050ms per Nominatim policy) */
  chunkDelayMs?: number;
}

export function seedEdgeOsmCache(entries: Record<string, GeoJsonMultiPolygon>): void {
  for (const [id, geom] of Object.entries(entries)) {
    if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      isolateOsmBoundaryCache.set(id, geom);
    }
  }
}

export function getEdgeOsmCacheSnapshot(): ReadonlyMap<string, GeoJsonMultiPolygon> {
  return isolateOsmBoundaryCache;
}

function toMultiPolygon(geometry: any): GeoJsonMultiPolygon | null {
  if (!geometry || typeof geometry !== 'object') return null;
  if (geometry.type === 'MultiPolygon' && Array.isArray(geometry.coordinates)) {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates,
    };
  }
  if (geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)) {
    return {
      type: 'MultiPolygon',
      coordinates: [geometry.coordinates],
    };
  }
  return null;
}

function getWorkersDefaultCache(): Cache | null {
  const cachesObj = (globalThis as any).caches;
  if (cachesObj && typeof cachesObj === 'object' && cachesObj.default) {
    return cachesObj.default as Cache;
  }
  return null;
}

/**
 * Resolves canonical OpenStreetMap Relation/Way IDs (`R...`, `W...`) using a multi-tier Edge cache:
 * 1. Isolate L1 `Map`
 * 2. Optional Cloudflare Workers KV (`env.OSM_CACHE_KV`)
 * 3. Cloudflare Edge Cache API (`caches.default`)
 * 4. Upstream Nominatim GeoJSON batch lookup
 */
export async function resolveOsmBoundariesOnEdge(
  requestedIds: string[],
  env: EdgeEnv = {},
  options: OsmEdgeServiceOptions = {},
): Promise<Record<string, GeoJsonMultiPolygon>> {
  const {
    fetchImpl = fetch,
    initialCache,
    onBatchFetched,
    chunkDelayMs = 1050,
  } = options;

  if (initialCache) {
    for (const [k, v] of initialCache.entries()) {
      if (!isolateOsmBoundaryCache.has(k)) {
        isolateOsmBoundaryCache.set(k, v);
      }
    }
  }

  const kv = env.OSM_CACHE_KV;
  const edgeCache = getWorkersDefaultCache();

  // Check L2/L3 caches for any IDs missing from isolate memory
  const stillMissing: string[] = [];
  for (const id of requestedIds) {
    if (isolateOsmBoundaryCache.has(id)) continue;

    let found: GeoJsonMultiPolygon | null = null;

    if (kv) {
      try {
        const kvGeom = await kv.get<GeoJsonMultiPolygon>(`osm:v1:${id}`, 'json');
        if (kvGeom && kvGeom.type === 'MultiPolygon' && Array.isArray(kvGeom.coordinates)) {
          found = kvGeom;
        }
      } catch {
        // Ignore KV lookup error
      }
    }

    if (!found && edgeCache) {
      try {
        const cacheKey = new Request(`https://osm-edge-cache.internal/v1/${id}`);
        const hit = await edgeCache.match(cacheKey);
        if (hit) {
          const parsed = (await hit.json()) as GeoJsonMultiPolygon;
          if (parsed && parsed.type === 'MultiPolygon' && Array.isArray(parsed.coordinates)) {
            found = parsed;
          }
        }
      } catch {
        // Ignore Cache API lookup error
      }
    }

    if (found) {
      isolateOsmBoundaryCache.set(id, found);
    } else {
      stillMissing.push(id);
    }
  }

  if (stillMissing.length > 0) {
    const newlyResolved = new Map<string, GeoJsonMultiPolygon>();
    const chunkSize = 42;

    for (let i = 0; i < stillMissing.length; i += chunkSize) {
      const chunk = stillMissing.slice(i, i + chunkSize);
      const url = `https://nominatim.openstreetmap.org/lookup?osm_ids=${encodeURIComponent(
        chunk.join(','),
      )}&format=geojson&polygon_geojson=1&polygon_threshold=0.0002`;

      const res = await fetchImpl(url, {
        headers: {
          'User-Agent': 'CivilizationEvolutionAtlas/1.0 (Historical Cartography Engine)',
          Accept: 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error(`Nominatim lookup HTTP ${res.status}`);
      }

      const data = (await res.json()) as { features?: any[] };
      for (const feat of data.features || []) {
        const osmType = feat?.properties?.osm_type;
        const osmId = feat?.properties?.osm_id;
        const prefix = osmType === 'relation' ? 'R' : osmType === 'way' ? 'W' : 'N';
        const key = `${prefix}${osmId}`;
        const multi = toMultiPolygon(feat?.geometry);
        if (multi && multi.coordinates.length > 0) {
          isolateOsmBoundaryCache.set(key, multi);
          newlyResolved.set(key, multi);

          if (kv) {
            try {
              await kv.put(`osm:v1:${key}`, JSON.stringify(multi), {
                expirationTtl: 60 * 60 * 24 * 30, // 30 days
              });
            } catch {
              // Non-fatal
            }
          }

          if (edgeCache) {
            try {
              const cacheKey = new Request(`https://osm-edge-cache.internal/v1/${key}`);
              await edgeCache.put(
                cacheKey,
                new Response(JSON.stringify(multi), {
                  headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'public, max-age=2592000',
                  },
                }),
              );
            } catch {
              // Non-fatal
            }
          }
        }
      }

      if (i + chunkSize < stillMissing.length && chunkDelayMs > 0) {
        await new Promise((r) => setTimeout(r, chunkDelayMs));
      }
    }

    if (newlyResolved.size > 0 && onBatchFetched) {
      onBatchFetched(newlyResolved);
    }
  }

  const boundaries: Record<string, GeoJsonMultiPolygon> = {};
  for (const id of requestedIds) {
    const geom = isolateOsmBoundaryCache.get(id);
    if (geom) {
      boundaries[id] = geom;
    }
  }
  return boundaries;
}
