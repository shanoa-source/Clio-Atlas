import type { SkySpecification, StyleSpecification } from 'maplibre-gl';
import { getLand50mGeoJson } from '../three/earthGeoData';

export const CARTO_DARK_MATTER_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const ALLOWED_SYMBOL_LAYER_IDS = new Set([
  'watername_ocean',
  'watername_sea',
  'watername_lake',
  'watername_lake_line',
  'waterway_label',
  'place_continent',
]);

const BLOCKED_SOURCE_LAYERS = new Set([
  'boundaries',
  'roads',
  'buildings',
  'pois',
]);

export function buildGlobeSkySpec(isNightMode: boolean): SkySpecification {
  if (isNightMode) {
    return {
      'sky-color': '#030509',
      'horizon-color': '#0f2342',
      'fog-color': '#04070d',
      'sky-horizon-blend': 0.45,
      'horizon-fog-blend': 0.75,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 0.5, 8, 0],
    };
  }
  return {
    'sky-color': '#05080f',
    'horizon-color': '#1d3b63',
    'fog-color': '#070b13',
    'sky-horizon-blend': 0.5,
    'horizon-fog-blend': 0.72,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.88, 5.5, 0.46, 8.5, 0],
  };
}

/**
 * Transforms an official CARTO Dark Matter style specification into a historically pure,
 * commercial-grade 3D Globe vector basemap:
 * - Enables MapLibre 3D Globe projection (`type: "globe"`) + atmospheric horizon scatter (`sky`).
 * - Removes modern 21st-century political borders (`boundaries`), highways (`roads`), `buildings`,
 *   and modern nation-state/city labels so historical polities never clash with 2026 borders.
 * - Calibrates CARTO Dark Matter's charcoal landmass, deep abyssal ocean, rivers, and crisp
 *   vector coastline strokes for maximum historical GIS contrast.
 */
export function sanitizeCartoDarkMatterStyle(
  rawStyle: Record<string, any>,
  isNightMode = false,
  projectionType: 'globe' | 'mercator' = 'globe',
  includeOfflineUnderlay = true,
): StyleSpecification {
  const landColor = isNightMode ? '#0b0e15' : '#181d27';
  const landCoverColor = isNightMode ? '#0d111a' : '#1c222e';
  const waterColor = isNightMode ? '#04060b' : '#090d16';
  const riverColor = isNightMode ? '#0e1726' : '#162233';
  const coastlineColor = isNightMode ? '#1b2638' : '#2a364b';

  const rawLayers: any[] = Array.isArray(rawStyle.layers) ? rawStyle.layers : [];
  const backgroundAndLandLayers: any[] = [];
  const waterAndRiverLayers: any[] = [];
  const symbolLayers: any[] = [];

  for (const layer of rawLayers) {
    if (!layer || typeof layer !== 'object') continue;
    const id = String(layer.id || '');
    const srcLayer = String(layer['source-layer'] || '');
    const group = String(layer.metadata?.['carto:group'] || '');

    // Strip all modern geopolitical boundaries, roads, buildings, residential blocks, and POIs
    if (
      BLOCKED_SOURCE_LAYERS.has(srcLayer) ||
      group === 'boundaries' ||
      id.startsWith('boundary') ||
      id.startsWith('road') ||
      id.startsWith('tunnel') ||
      id.startsWith('bridge') ||
      id.startsWith('rail') ||
      id.startsWith('aeroway') ||
      id.startsWith('building') ||
      id === 'landuse_residential' ||
      id === 'water_shadow'
    ) {
      continue;
    }

    // Only retain timeless physical geographic labels (oceans, seas, rivers, continents)
    if (layer.type === 'symbol' && !ALLOWED_SYMBOL_LAYER_IDS.has(id)) {
      continue;
    }

    const cloned = JSON.parse(JSON.stringify(layer));

    if (cloned.id === 'background' && cloned.type === 'background') {
      cloned.paint = {
        ...cloned.paint,
        'background-color': landColor,
        'background-opacity': 1,
      };
      backgroundAndLandLayers.push(cloned);
    } else if ((cloned.id === 'water' || srcLayer === 'water') && cloned.type === 'fill') {
      // CRITICAL MapLibre GL v5 WebGL pass rule: `fill-opacity === 1` hoists a fill layer into
      // Pass 1 (`opaque` pass) BEFORE `heatmap` and `line` layers! Setting `0.9995` (255/255 in 8-bit RGBA)
      // keeps `water` in Pass 2 (`translucent` pass) in strict top-down layer order so `#090d16` ocean
      // masks 100% of any heatmap halo or coastal border overflow with zero sea bleed.
      cloned.paint = {
        'fill-color': waterColor,
        'fill-antialias': true,
        'fill-opacity': 0.9995,
      };
      waterAndRiverLayers.push(cloned);
      if (cloned.id === 'water' && cloned.source) {
        waterAndRiverLayers.push({
          id: 'carto-water-coastline-crisp',
          type: 'line',
          source: cloned.source,
          'source-layer': 'water',
          filter: ['==', ['geometry-type'], 'Polygon'],
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': coastlineColor,
            'line-width': [
              'interpolate',
              ['exponential', 1.35],
              ['zoom'],
              1.15,
              0.44,
              2.5,
              0.66,
              5,
              1.1,
              10,
              1.52,
            ],
            'line-blur': ['interpolate', ['linear'], ['zoom'], 1.15, 0.16, 4, 0.3, 9, 0.4],
            'line-opacity': 0.92,
          },
        });
      }
    } else if (cloned.id === 'waterway' && cloned.type === 'line') {
      cloned.layout = {
        ...(cloned.layout || {}),
        'line-cap': 'round',
        'line-join': 'round',
      };
      cloned.paint = {
        ...cloned.paint,
        'line-color': riverColor,
        'line-blur': 0.28,
      };
      waterAndRiverLayers.push(cloned);
    } else if (cloned.type === 'symbol') {
      cloned.paint = {
        ...cloned.paint,
        'text-color': isNightMode ? 'rgba(100, 116, 139, 0.36)' : 'rgba(148, 163, 184, 0.48)',
        'text-halo-color': 'rgba(6, 9, 15, 0.85)',
        'text-halo-width': 1.2,
      };
      symbolLayers.push(cloned);
    } else {
      if (cloned.type === 'fill') {
        cloned.paint = {
          ...cloned.paint,
          'fill-antialias': false,
          'fill-color': landCoverColor,
          'fill-opacity': 0.45,
        };
      }
      backgroundAndLandLayers.push(cloned);
    }
  }

  // Deterministic cartographic stack: Land & Terrain -> [Polity Fill & Inner Ribbon inserted before `water`] -> Water, Coastline & Rivers -> Geographic Labels
  const filteredLayers: any[] = [
    ...backgroundAndLandLayers,
    ...waterAndRiverLayers,
    ...symbolLayers,
  ];

  const sources: Record<string, any> = {
    ...(rawStyle.sources || {}),
  };

  const hasVectorTileSource = Object.values(sources).some(
    (s: any) => s && (s.type === 'vector' || Array.isArray(s.tiles)),
  );

  // Use Natural Earth vector landmass only when offline (no vector tile source present)
  if (includeOfflineUnderlay && !hasVectorTileSource) {
    sources['ne-land-underlay'] = {
      type: 'geojson',
      data: getLand50mGeoJson() as any,
    };

    const bgIdx = filteredLayers.findIndex((l) => l.id === 'background');
    const underlayLayers = [
      {
        id: 'ne-ocean-base',
        type: 'background',
        paint: {
          'background-color': waterColor,
        },
      },
      {
        id: 'ne-land-fill-underlay',
        type: 'fill',
        source: 'ne-land-underlay',
        paint: {
          'fill-color': landColor,
          'fill-opacity': 1,
        },
      },
      {
        id: 'ne-land-coast-underlay',
        type: 'line',
        source: 'ne-land-underlay',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': coastlineColor,
          'line-width': 0.95,
          'line-blur': 0.35,
          'line-opacity': 0.85,
        },
      },
    ];

    if (bgIdx >= 0) {
      filteredLayers.splice(bgIdx, 1, ...underlayLayers);
    } else {
      filteredLayers.unshift(...underlayLayers);
    }
  }

  const styleSpec: Record<string, any> = {
    version: 8,
    name: 'CARTO Dark Matter Historical Globe',
    projection: { type: projectionType },
    sky: buildGlobeSkySpec(isNightMode),
    sources,
    glyphs:
      typeof rawStyle.glyphs === 'string' && rawStyle.glyphs.length > 0
        ? rawStyle.glyphs
        : 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
    layers: filteredLayers,
  };

  if (rawStyle.sprite) {
    styleSpec.sprite = rawStyle.sprite;
  }

  return styleSpec as StyleSpecification;
}

/**
 * Pure offline CARTO Dark Matter fallback style if external network access is ever unavailable.
 */
export function buildOfflineDarkMatterStyle(
  isNightMode = false,
  projectionType: 'globe' | 'mercator' = 'globe',
): StyleSpecification {
  return sanitizeCartoDarkMatterStyle(
    {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#181d27' } }],
    },
    isNightMode,
    projectionType,
    true,
  );
}

const CARTO_SESSION_CACHE_KEY = 'civ_atlas_carto_raw_style_v1';
let cachedRawCartoStyle: Record<string, any> | null = null;
let inflightCartoPromise: Promise<Record<string, any> | null> | null = null;

/**
 * Pre-warms and caches the CARTO Dark Matter style JSON so MapLibre initializes once cleanly
 * without tearing down and rebuilding WebGL sources/layers on boot.
 */
export function preloadCartoDarkMatterStyle(timeoutMs = 1600): Promise<Record<string, any> | null> {
  if (cachedRawCartoStyle) {
    return Promise.resolve(cachedRawCartoStyle);
  }

  if (typeof window !== 'undefined') {
    try {
      const saved = window.sessionStorage.getItem(CARTO_SESSION_CACHE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.layers)) {
          cachedRawCartoStyle = parsed;
          return Promise.resolve(parsed);
        }
      }
    } catch {
      // Ignore storage access errors
    }
  }

  if (!inflightCartoPromise && typeof fetch === 'function') {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer =
      ctrl && timeoutMs > 0 ? globalThis.setTimeout(() => ctrl.abort(), timeoutMs) : null;

    inflightCartoPromise = fetch(CARTO_DARK_MATTER_STYLE_URL, {
      signal: ctrl?.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json && typeof json === 'object' && Array.isArray(json.layers)) {
          cachedRawCartoStyle = json;
          if (typeof window !== 'undefined') {
            try {
              window.sessionStorage.setItem(CARTO_SESSION_CACHE_KEY, JSON.stringify(json));
            } catch {
              // Ignore quota errors
            }
          }
          return json as Record<string, any>;
        }
        return null;
      })
      .catch(() => null)
      .finally(() => {
        if (timer !== null) globalThis.clearTimeout(timer);
        inflightCartoPromise = null;
      });
  }

  return inflightCartoPromise ?? Promise.resolve(null);
}

if (typeof window !== 'undefined' && typeof fetch === 'function') {
  void preloadCartoDarkMatterStyle();
}

