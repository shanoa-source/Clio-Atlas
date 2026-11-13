import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { geoArea } from 'd3-geo';
import {
  computeCelestialBodyXZ,
  computeMissionTransferProgress,
  computeMortalityEventEnvelope,
  computeTimelineTickStep,
  deathsToMortalityMagnitude,
  densifyAndSliceWaypoints,
  densityToBlueBrownRGB,
  densityToPopulationMagnitude,
  formatHistoricalYear,
  geoToFlatXYZ,
  geoToMorphedXYZ,
  geoToSphereXYZ,
  getActiveMortalityCatastrophes,
  getActivePolityPhase,
  getActivePolityPhases,
  getActiveSpeciesDiscoveries,
  getActiveTerritoryRegions,
  getActiveTransportRoutes,
  GLOBE_RADIUS,
  mortalityDensityToRedRGB,
  resolvePolityForTerritory,
  routeUsageToWhiteRedRGB,
  stepHistoricalYearWithLoop,
} from './geoMath';
import {
  computeDatasetYearBounds,
  getAtlasDatasetPresets,
  getMortalityCatastrophes,
  getSolarSystemBodies,
  getSpaceMissions,
  getTerritoryRegions,
  getTransportRoutes,
} from '../shared/atlasDataLayer';
import { sanitizeInlineFlagSvg } from '../shared/dataValidator';
import { isPointOnMediterraneanLand } from '../three/earthGeoData';
import {
  extractDissolvedOuterBoundary,
  getAllConfiguredOsmIds,
  parseNominatimGeoJsonFeatures,
  resolveActiveOsmTerritories,
  seedOsmGeometryCache,
} from '../services/osmBoundaryService';
import {
  buildOfflineDarkMatterStyle,
  sanitizeCartoDarkMatterStyle,
} from '../map/cartoStyleBuilder';
import { SpaceMission } from '../types/history';

// Pre-seed OpenStreetMap cache from os.tmpdir() if present for deterministic offline unit tests
const diskCachePath = path.join(
  os.tmpdir(),
  'civilization-atlas-osm-cache',
  'osm-boundaries-v1.json',
);
if (fs.existsSync(diskCachePath)) {
  const cached = JSON.parse(fs.readFileSync(diskCachePath, 'utf8'));
  seedOsmGeometryCache(cached);
}

test('zero handwritten polygon coordinates exist in unified atlasDataLayer territories; all regions bind canonical OpenStreetMap IDs', () => {
  const allTerritories = getTerritoryRegions();
  assert.equal(
    allTerritories.length,
    24,
    'Expected 12 Classical Athens + 4 Bronze Age Aegean + 8 Roman Principate territories',
  );
  for (const reg of allTerritories) {
    assert.equal('polygon' in (reg as any), false, `Region ${reg.id} must not have handwritten polygon`);
    assert.equal(
      'clipPolygons' in (reg as any),
      false,
      `Region ${reg.id} must not have handwritten clipPolygons`,
    );
    assert.ok(Array.isArray(reg.osmIds) && reg.osmIds.length >= 1);
    for (const osmId of reg.osmIds) {
      assert.match(osmId, /^[RW]\d+$/, `Invalid canonical OSM ID ${osmId} on ${reg.id}`);
    }
  }

  const uniqueOsmIds = getAllConfiguredOsmIds();
  assert.ok(uniqueOsmIds.length >= 55);
});

test('dynamic dataset year bounds derive [-1600, 180] and activate Bronze Age (-1600..-1180), Classical Athens (-500..-404) & Roman Principate (-27..180) accurately', () => {
  const bounds = computeDatasetYearBounds();
  assert.deepEqual(bounds, { minYear: -1600, maxYear: 180 });

  const presets = getAtlasDatasetPresets();
  assert.ok(
    presets.some(
      (p) => p.id === 'mycenaean_minoan_bronze' && p.minYear === -1600 && p.maxYear === -1180,
    ),
  );
  assert.ok(presets.some((p) => p.id === 'classical_athens' && p.minYear === -500 && p.maxYear === -404));
  assert.ok(presets.some((p) => p.id === 'roman_principate' && p.minYear === -27 && p.maxYear === 180));

  // Outside dataset time windows: before 1600 BCE, between 1179..501 BCE, between 403..28 BCE, and after 180 CE
  assert.equal(getActivePolityPhase(-1601), null);
  assert.equal(getActivePolityPhase(-1179), null);
  assert.equal(getActivePolityPhase(-501), null);
  assert.equal(getActiveTerritoryRegions(-501).length, 0);
  assert.equal(resolveActiveOsmTerritories(-501).length, 0);
  assert.equal(getActivePolityPhase(-403), null);
  assert.equal(getActiveTerritoryRegions(-403).length, 0);
  assert.equal(resolveActiveOsmTerritories(-403).length, 0);
  assert.equal(getActivePolityPhase(-28), null);
  assert.equal(getActivePolityPhase(181), null);
  assert.equal(getActiveTerritoryRegions(181).length, 0);
  assert.equal(getActivePolityPhase(2020), null);

  // Roman Principate dataset verification at 117 CE (Trajanic peak)
  const romanPolities117 = getActivePolityPhases(117);
  assert.equal(romanPolities117.length, 1);
  assert.equal(romanPolities117[0].id, 'roman_flavian_trajanic_peak');
  assert.ok(romanPolities117[0].flagSvg && romanPolities117[0].flagSvg.includes('SPQR'));
  assert.ok(sanitizeInlineFlagSvg(romanPolities117[0].flagSvg));
  assert.equal(sanitizeInlineFlagSvg('<svg onload="alert(1)"><rect width="10" height="10"/></svg>'), null);

  const romanTerritories117 = getActiveTerritoryRegions(117);
  assert.equal(romanTerritories117.length, 8);
  const resolvedPolity = resolvePolityForTerritory(romanTerritories117[0], romanPolities117);
  assert.equal(resolvedPolity?.id, 'roman_flavian_trajanic_peak');

  const romanRoutes117 = getActiveTransportRoutes(117);
  assert.equal(romanRoutes117.length, 5);

  const romanSpecies = getActiveSpeciesDiscoveries(77, [-27, 180]);
  assert.equal(romanSpecies.length, 4);
  for (const sp of romanSpecies) {
    assert.ok(sp.classicalSourceName.length > 0, `Species ${sp.id} must define classicalSourceName`);
    assert.equal('classicalGreekName' in (sp as any), false);
  }
});

test('OpenStreetMap geometries normalize cleanly, dissolve internal sub-municipal seams, and have valid spherical winding', () => {
  // Verify Nominatim GeoJSON parser & shared-edge dissolution on two adjacent squares
  const sampleFc = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { osm_type: 'relation', osm_id: 999001 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [23.6, 37.9],
              [23.7, 37.9],
              [23.7, 38.0],
              [23.6, 38.0],
              [23.6, 37.9],
            ],
          ],
        },
      },
      {
        type: 'Feature',
        properties: { osm_type: 'relation', osm_id: 999002 },
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [23.7, 37.9],
              [23.8, 37.9],
              [23.8, 38.0],
              [23.7, 38.0],
              [23.7, 37.9],
            ],
          ],
        },
      },
    ],
  };

  const parsed = parseNominatimGeoJsonFeatures(sampleFc);
  assert.equal(parsed.size, 2);
  const merged = {
    type: 'MultiPolygon' as const,
    coordinates: [
      ...parsed.get('R999001')!.coordinates,
      ...parsed.get('R999002')!.coordinates,
    ],
  };
  const dissolved = extractDissolvedOuterBoundary(merged);
  // 2 squares = 8 directed segments; shared edge [23.7,37.9]-[23.7,38.0] cancels out (2 segments removed -> 6 exterior segments)
  const totalExteriorSegments = dissolved.coordinates.reduce(
    (sum, line) => sum + (line.length - 1),
    0,
  );
  assert.equal(totalExteriorSegments, 6);

  if (fs.existsSync(diskCachePath)) {
    const active454 = resolveActiveOsmTerritories(-454);
    assert.ok(active454.length >= 10);
    const pureIslandIds = new Set([
      'euboea_cleruchy',
      'lemnos_imbros_skyros',
      'cyclades_delos_archipelago',
      'samos_democratic_bastion',
      'aegina_saronic_control',
      'melos_cleruchy',
    ]);
    for (const feat of active454) {
      const steradians = geoArea(feat.geometry as any);
      assert.ok(
        steradians > 0 && steradians < 0.02,
        `OSM Polygon ${feat.id} has invalid spherical area: ${steradians}`,
      );
      if (pureIslandIds.has(feat.id)) {
        assert.equal(
          feat.outerBoundary.coordinates.length,
          0,
          `Pure island territory ${feat.id} must emit 0 coastal border strokes`,
        );
      } else {
        assert.ok(
          feat.outerBoundary.coordinates.length >= 1,
          `Mainland territory ${feat.id} must retain its inland national border`,
        );
      }
    }
  }

  assert.equal(isPointOnMediterraneanLand(23.7275, 37.9838), true);
  assert.equal(isPointOnMediterraneanLand(25.0, 36.0), false);
});

test('Classical Athens polity phases, representative colors, and flags switch accurately across 500–404 BCE', () => {
  const earlyPolis = getActivePolityPhase(-490);
  assert.ok(earlyPolis);
  assert.equal(earlyPolis.flagId, 'archaic_owl');
  assert.equal(earlyPolis.representativeColor, '#2563EB');

  const delian = getActivePolityPhase(-470);
  assert.ok(delian);
  assert.equal(delian.flagId, 'delian_alliance');
  assert.notEqual(delian.representativeColor, earlyPolis.representativeColor);

  const empirePeak = getActivePolityPhase(-454);
  assert.ok(empirePeak);
  assert.equal(empirePeak.flagId, 'imperial_athens');

  const wartime = getActivePolityPhase(-420);
  assert.ok(wartime);
  assert.equal(wartime.flagId, 'strategoi_wartime');

  const siege = getActivePolityPhase(-404);
  assert.ok(siege);
  assert.equal(siege.flagId, 'ionian_siege');
});

test('territory borders expand from 500 BCE to 454 BCE peak and contract by 404 BCE', () => {
  const regions500 = getActiveTerritoryRegions(-500);
  const regions454 = getActiveTerritoryRegions(-454);
  const regions404 = getActiveTerritoryRegions(-404);

  assert.ok(regions500.length >= 2);
  assert.ok(regions454.length > regions500.length);
  assert.ok(regions404.length < regions454.length);
});

test('population density maps low density to blue and high density to deep brown', () => {
  const lowBlue = densityToBlueBrownRGB(12);
  const highBrown = densityToBlueBrownRGB(160);

  assert.ok(lowBlue[2] > lowBlue[0] + 100);
  assert.ok(highBrown[0] > highBrown[1] && highBrown[1] > highBrown[2]);
  assert.ok(highBrown[0] < 90);
});

test('transport route frequency maps low usage to white, high usage to deep red, and slices start-to-end transitions', () => {
  const lowWhite = routeUsageToWhiteRedRGB(20);
  const highRed = routeUsageToWhiteRedRGB(440);

  assert.deepEqual(lowWhite, [255, 255, 255]);
  assert.ok(highRed[0] > 140 && highRed[1] < 40 && highRed[2] < 40);

  const routes450 = getActiveTransportRoutes(-450);
  assert.ok(routes450.length >= 5);
  const slicedQuarter = densifyAndSliceWaypoints(routes450[0].route.waypoints, 0.25);
  const slicedFull = densifyAndSliceWaypoints(routes450[0].route.waypoints, 1.0);
  assert.ok(slicedQuarter.length < slicedFull.length);
  assert.deepEqual(slicedQuarter[0], routes450[0].route.waypoints[0]);
});

test('mortality catastrophe density darkens red pixels as density increases', () => {
  const sparseRed = mortalityDensityToRedRGB(0.05);
  const denseDarkRed = mortalityDensityToRedRGB(1.0);

  assert.ok(sparseRed[0] > denseDarkRed[0]);
  assert.ok(denseDarkRed[0] > denseDarkRed[1] * 3);
  const events430 = getActiveMortalityCatastrophes(-430, true);
  assert.ok(events430.some((e) => e.id === 'cat_plague_of_athens'));
});

test('ThreeGlobe aligned 3D sphere and 2D flat world map coordinates match exactly', () => {
  const [sx, sy, sz] = geoToSphereXYZ(0, 0, GLOBE_RADIUS);
  assert.ok(Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6 && Math.abs(sz - GLOBE_RADIUS) < 1e-6);

  const [fx, fy, fz] = geoToFlatXYZ(90, 45, 0.5);
  assert.equal(fx, 90);
  assert.equal(fy, 45);
  assert.equal(fz, 0.5);

  const morphed0 = geoToMorphedXYZ(23.7275, 37.9838, 0, 0);
  const sphereAthens = geoToSphereXYZ(23.7275, 37.9838, GLOBE_RADIUS);
  assert.deepEqual(morphed0, sphereAthens);
});

test('global timeline zoom supports 1-year tick resolution and historical BCE formatting', () => {
  const fineZoom = computeTimelineTickStep(24);
  assert.equal(fineZoom.minorStep, 1);
  const millennialZoom = computeTimelineTickStep(4000);
  assert.equal(millennialZoom.majorStep, 500);
  assert.equal(formatHistoricalYear(-454), '公元前 454 年');
  assert.equal(formatHistoricalYear(-454, true), '454 BCE');
});

test('species discoveries and Solar System orbital / trajectory mechanics work accurately', () => {
  assert.equal(getActiveSpeciesDiscoveries(-495).length, 0);
  // Standard single-year spotlight window shows contemporary discoveries without centuries-long clutter
  assert.equal(getActiveSpeciesDiscoveries(-420).length, 2);
  // Range-selection mode retains every species discovered inside the selected interval without disappearing
  assert.equal(getActiveSpeciesDiscoveries(-420, [-490, -410]).length, 7);
  assert.equal(getSpaceMissions().length, 0);

  const bodies = getSolarSystemBodies();
  const earth = bodies.find((b) => b.id === 'earth')!;
  const moon = bodies.find((b) => b.id === 'moon')!;
  const [ex, ez] = computeCelestialBodyXZ(earth, -454);
  const [mx, mz] = computeCelestialBodyXZ(moon, -454);
  assert.ok(Math.abs(Math.hypot(ex, ez) - earth.orbitRadiusUnits) < 1e-4);
  assert.ok(Math.abs(Math.hypot(mx - ex, mz - ez) - moon.orbitRadiusUnits) < 1e-4);

  const sampleMission: SpaceMission = {
    id: 'test_transfer',
    nameZh: '测试转移轨道',
    agency: 'TEST',
    originBodyId: 'earth',
    targetBodyId: 'mars',
    launchYear: 1975,
    arrivalYear: 1976,
    missionStatusZh: '在途',
    orbitProbes: [],
    surfaceBases: [],
  };
  assert.equal(computeMissionTransferProgress(sampleMission, 1974.5), 0);
  assert.equal(computeMissionTransferProgress(sampleMission, 1975.5), 0.5);
  assert.equal(computeMissionTransferProgress(sampleMission, 1976.2), 1);
});

test('CARTO Dark Matter style sanitizer configures 3D Globe projection and strips all modern boundaries, roads, buildings, and nation/city labels', () => {
  const sampleCartoRaw = {
    version: 8,
    sources: {
      carto: {
        type: 'vector',
        tiles: ['https://tiles.basemaps.cartocdn.com/vectortiles/carto.streets/v2/{z}/{x}/{y}.mvt'],
      },
    },
    sprite: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/sprite',
    glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#0e0e0e' } },
      { id: 'water', type: 'fill', source: 'carto', 'source-layer': 'water', paint: {} },
      { id: 'waterway', type: 'line', source: 'carto', 'source-layer': 'waterway', paint: {} },
      { id: 'boundary_country_outline', type: 'line', source: 'carto', 'source-layer': 'boundaries' },
      { id: 'boundary_state', type: 'line', source: 'carto', 'source-layer': 'boundaries' },
      { id: 'road_pri_fill_noramp', type: 'line', source: 'carto', 'source-layer': 'roads' },
      { id: 'building', type: 'fill', source: 'carto', 'source-layer': 'buildings' },
      { id: 'place_country_1', type: 'symbol', source: 'carto', 'source-layer': 'place' },
      { id: 'place_city_r6', type: 'symbol', source: 'carto', 'source-layer': 'place' },
      { id: 'watername_sea', type: 'symbol', source: 'carto', 'source-layer': 'water_name' },
    ],
  };

  const sanitizedGlobe = sanitizeCartoDarkMatterStyle(sampleCartoRaw, false, 'globe');
  assert.deepEqual(sanitizedGlobe.projection, { type: 'globe' });
  assert.ok(sanitizedGlobe.sky);

  const ids = new Set(sanitizedGlobe.layers.map((l) => l.id));
  assert.equal(ids.has('boundary_country_outline'), false);
  assert.equal(ids.has('boundary_state'), false);
  assert.equal(ids.has('road_pri_fill_noramp'), false);
  assert.equal(ids.has('building'), false);
  assert.equal(ids.has('place_country_1'), false);
  assert.equal(ids.has('place_city_r6'), false);

  assert.equal(ids.has('background'), true);
  assert.equal(ids.has('water'), true);
  assert.equal(ids.has('carto-water-coastline-crisp'), true);
  assert.equal(ids.has('waterway'), true);
  assert.equal(ids.has('watername_sea'), true);

  const waterLayer = sanitizedGlobe.layers.find((l) => l.id === 'water') as any;
  assert.equal(waterLayer?.paint?.['fill-color'], '#090d16');
  assert.equal(waterLayer?.paint?.['fill-opacity'], 0.9995);

  const offlineMercator = buildOfflineDarkMatterStyle(true, 'mercator');
  assert.deepEqual(offlineMercator.projection, { type: 'mercator' });
  assert.equal(typeof offlineMercator.glyphs, 'string');
  assert.ok((offlineMercator.glyphs as string).length > 10);
  assert.equal(offlineMercator.sprite, undefined);
  assert.ok(offlineMercator.layers.some((l) => l.id === 'ne-land-fill-underlay'));
});

test('all 12 Catmull-Rom maritime transport splines across Classical Athens & Roman Principate stay 100% in sea lanes without crossing land', async () => {
  const allRoutes = getTransportRoutes();
  assert.equal(allRoutes.length, 12);
  const { smoothMaritimeWaypointsCatmullRom } = await import('./geoMath');
  const { getLand50mGeoJson } = await import('../three/earthGeoData');

  const landFc = getLand50mGeoJson();
  interface BboxRing {
    id: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    ring: [number, number][];
  }
  const indexedRings: BboxRing[] = [];
  const registerPolys = (id: string, polys: any[]) => {
    for (const poly of polys) {
      const r = poly[0];
      if (!r || r.length < 4) continue;
      let minX = 999;
      let minY = 999;
      let maxX = -999;
      let maxY = -999;
      for (const [x, y] of r) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      indexedRings.push({ id, minX, minY, maxX, maxY, ring: r });
    }
  };

  for (const f of landFc.features) {
    if (f.geometry.type === 'Polygon') registerPolys('land50m', [f.geometry.coordinates]);
    else if (f.geometry.type === 'MultiPolygon') registerPolys('land50m', f.geometry.coordinates);
  }

  if (fs.existsSync(diskCachePath)) {
    const cachedOsm = JSON.parse(fs.readFileSync(diskCachePath, 'utf8'));
    const islandOsmIds = [
      'R957707', 'R3301815', 'R537221', 'R1815263', 'R965446',
      'R531131', 'R531101', 'R531102', 'R531115', 'R453091', 'R453214',
      'R531999', 'R531990', 'R531997', 'R532001', 'R531978', 'R542011', 'R453964',
      'R6830778', 'R3188280', 'R452381', 'R537593', 'R537592',
      'R536480', 'R452614', 'R543490', 'R531969',
    ];
    for (const id of islandOsmIds) {
      if (cachedOsm[id]) registerPolys(id, cachedOsm[id].coordinates);
    }
  }

  const hitLand = (lon: number, lat: number): string | null => {
    for (const b of indexedRings) {
      if (lon < b.minX || lon > b.maxX || lat < b.minY || lat > b.maxY) continue;
      if (b.id === 'land50m' && lon >= 23.62 && lon <= 24.18 && lat >= 38.05 && lat <= 38.45) {
        continue;
      }
      let inside = false;
      const r = b.ring;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i];
        const [xj, yj] = r[j];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi) {
          inside = !inside;
        }
      }
      if (inside) return b.id;
    }
    return null;
  };

  for (const route of allRoutes) {
    const spline = smoothMaritimeWaypointsCatmullRom(route.waypoints, 24);
    assert.ok(spline.length > 80, `Route ${route.id} should produce a dense smooth spline`);
    for (const [lon, lat] of spline) {
      const hit = hitLand(lon, lat);
      assert.equal(
        hit,
        null,
        `Maritime route ${route.id} crossed land (${hit}) at [${lon.toFixed(4)}, ${lat.toFixed(4)}]`,
      );
    }
    // Every Classical Athens Aegean / Eastern Mediterranean route arriving at Piraeus must round south of Cape Sounion (37.65°N)
    if (
      route.openedYear < -300 &&
      route.id !== 'route_magna_graecia_sicily_west'
    ) {
      const sounionPass = spline.some(
        ([lon, lat]) => lon >= 23.96 && lon <= 24.06 && lat <= 37.60,
      );
      assert.equal(
        sounionPass,
        true,
        `Route ${route.id} must round south of Cape Sounion before entering Saronic Gulf`,
      );
    }
  }
});

test('continuous GPU thermal heatmap control points emit concentric core (1.0), mid (0.6), and outer (0.25) weight tiers', async () => {
  const { computeMortalityThermalPoints, computePopulationThermalPoints } = await import(
    './pixelLayers'
  );

  assert.equal(computeMortalityThermalPoints(-510).length, 0);
  assert.equal(computePopulationThermalPoints(-510).length, 0);
  assert.equal(computeMortalityThermalPoints(-390).length, 0);
  assert.equal(computePopulationThermalPoints(-390).length, 0);

  const mort413 = computeMortalityThermalPoints(-413);
  const mortFullRange = computeMortalityThermalPoints(-413, [-495, -404]);
  const pop454 = computePopulationThermalPoints(-454);
  assert.ok(mort413.length >= 90 && mort413.length < mortFullRange.length);
  assert.ok(mortFullRange.length >= 400);
  assert.ok(pop454.length >= 400);

  for (const list of [mort413, pop454]) {
    const corePts = list.filter((p) => p.tier === 'core');
    const midPts = list.filter((p) => p.tier === 'mid');
    const outerPts = list.filter((p) => p.tier === 'outer');
    assert.ok(corePts.length > 0 && midPts.length > 0 && outerPts.length > 0);
    assert.ok(corePts.every((p) => p.tierBaseWeight === 1.0));
    assert.ok(midPts.every((p) => p.tierBaseWeight === 0.6));
    assert.ok(outerPts.every((p) => p.tierBaseWeight === 0.25));
  }
});

test('mortality catastrophe fade-in / post-event fade-out, Marathon (6,600) vs Persian Invasion (78,000) magnitude scaling, night-light distribution, and range loop playback', async () => {
  const { computeMortalityThermalPoints, computeNightLightThermalPoints } = await import(
    './pixelLayers'
  );

  const allCatastrophes = getMortalityCatastrophes();
  const marathon = allCatastrophes.find((e) => e.id === 'cat_marathon_battle')!;
  const persianInvasion = allCatastrophes.find(
    (e) => e.id === 'cat_salamis_plataea_persian_invasion',
  )!;

  // 1. Quantitative magnitude scaling: Marathon (6,600) -> light red (< 0.26); Persian Invasion (78,000) -> deep red (> 0.92)
  const marathonMag = deathsToMortalityMagnitude(marathon.estimatedDeaths);
  const persianMag = deathsToMortalityMagnitude(persianInvasion.estimatedDeaths);
  assert.ok(marathonMag < 0.26, `Expected Marathon (6,600) magnitude < 0.26, got ${marathonMag}`);
  assert.ok(persianMag > 0.92, `Expected Persian Invasion (78,000) magnitude > 0.92, got ${persianMag}`);
  assert.ok(persianMag > marathonMag * 3.8);

  // Population density quantitative magnitude scaling: 15/km² -> ~0.18, 160/km² -> 1.0
  assert.ok(densityToPopulationMagnitude(15) < 0.22);
  assert.equal(densityToPopulationMagnitude(160), 1.0);

  // 2. Smooth C² quintic fade-in (3-year span) and post-event fade-out (8-year span) in standard mode
  assert.equal(computeMortalityEventEnvelope(marathon, -493, null), 0);
  const fadeInEarly = computeMortalityEventEnvelope(marathon, -492, null);
  const fadeInMid = computeMortalityEventEnvelope(marathon, -491.5, null);
  const fadeInLate = computeMortalityEventEnvelope(marathon, -491, null);
  assert.ok(fadeInEarly > 0.18 && fadeInEarly < 0.3);
  assert.ok(Math.abs(fadeInMid - 0.5) < 1e-6);
  assert.ok(fadeInLate > 0.7 && fadeInLate < 0.82);
  assert.equal(computeMortalityEventEnvelope(marathon, -490, null), 1.0);
  const fadeOutMid = computeMortalityEventEnvelope(marathon, -486, null);
  assert.ok(Math.abs(fadeOutMid - 0.5) < 1e-6);
  assert.ok(computeMortalityEventEnvelope(marathon, -483, null) > 0.01);
  assert.equal(computeMortalityEventEnvelope(marathon, -482, null), 0);

  // 3. Non-disappearing persistence when timeline range selection covers [-495, -475]
  assert.equal(computeMortalityEventEnvelope(marathon, -476, [-495, -475]), 1.0);
  assert.equal(computeMortalityEventEnvelope(persianInvasion, -476, [-495, -475]), 1.0);
  const rangePts = computeMortalityThermalPoints(-476, [-495, -475]);
  const marathonCoreMax = Math.max(
    ...rangePts
      .filter((p) => p.sourceId === 'cat_marathon_battle' && p.tier === 'core')
      .map((p) => p.weight),
  );
  const persianCoreMax = Math.max(
    ...rangePts
      .filter((p) => p.sourceId === 'cat_salamis_plataea_persian_invasion' && p.tier === 'core')
      .map((p) => p.weight),
  );
  assert.ok(marathonCoreMax < 0.26, `Marathon core weight should stay light red: ${marathonCoreMax}`);
  assert.ok(persianCoreMax > 0.70, `Persian Invasion core weight should hit deep red: ${persianCoreMax}`);
  assert.ok(persianCoreMax > marathonCoreMax * 3.2);

  // 4. Night-light thermal points follow population & industrial distribution
  const night454 = computeNightLightThermalPoints(-454);
  assert.ok(night454.length >= 400);
  const evalGaussianField = (pts: typeof night454, lon: number, lat: number) =>
    pts.reduce((sum, p) => {
      const dx = (p.lon - lon) * 0.8;
      const dy = p.lat - lat;
      return sum + p.weight * Math.exp(-(dx * dx + dy * dy) / (2 * 0.092 * 0.092));
    }, 0);
  const athensNightField = evalGaussianField(night454, 23.7275, 37.975);
  const thraceNightField = evalGaussianField(night454, 23.355, 40.295);
  assert.ok(
    athensNightField > thraceNightField * 3.5,
    `Expected Athens urban night field (${athensNightField}) > 3.5x sparse Thrace (${thraceNightField})`,
  );

  // 5. Loop playback within selected time interval & year-0 skip
  assert.deepEqual(stepHistoricalYearWithLoop(-476, 1, [-477, -475]), {
    nextYear: -475,
    reachedGlobalEnd: false,
  });
  assert.deepEqual(stepHistoricalYearWithLoop(-475, 1, [-477, -475]), {
    nextYear: -477,
    reachedGlobalEnd: false,
  });
  assert.deepEqual(stepHistoricalYearWithLoop(-1, 1, null), {
    nextYear: 1,
    reachedGlobalEnd: false,
  });
});

test('empty data/prompts, data/booklists, and data/events placeholder files exist with zero prefilled content and load without error', async () => {
  const { loadExternalDataConfig } = await import('../server/dataConfigLoader');
  const rootDir = process.cwd();

  const promptFile = path.join(rootDir, 'data', 'prompts', 'system_prompt.txt');
  const booksFile = path.join(rootDir, 'data', 'booklists', 'books.json');
  const eventsFile = path.join(rootDir, 'data', 'events', 'custom_events.json');

  assert.equal(fs.existsSync(promptFile), true, 'data/prompts/system_prompt.txt must exist');
  assert.equal(fs.existsSync(booksFile), true, 'data/booklists/books.json must exist');
  assert.equal(fs.existsSync(eventsFile), true, 'data/events/custom_events.json must exist');

  assert.equal(fs.readFileSync(promptFile, 'utf8').trim(), '', 'system_prompt.txt must be empty');
  assert.deepEqual(JSON.parse(fs.readFileSync(booksFile, 'utf8')), [], 'books.json must be empty []');
  assert.deepEqual(
    JSON.parse(fs.readFileSync(eventsFile, 'utf8')),
    [],
    'custom_events.json must be empty []',
  );

  const loaded = loadExternalDataConfig(rootDir);
  assert.equal(loaded.customSystemPrompt, '');
  assert.deepEqual(loaded.books, []);
  assert.deepEqual(loaded.customEvents, []);
});

test('region selector extracts spatial-temporal overview and builds region-scoped vs global AI prompt context accurately', async () => {
  const { computeCircleBBox, extractRegionOverview, formatContextForPrompt } = await import(
    './regionSelector'
  );

  // 1. Unselected Global Mode at 454 BCE
  const globalOverview = extractRegionOverview({
    currentYear: -454,
    selectedRange: null,
    activeLayers: ['transport_routes'],
    selectedRegion: null,
  });
  assert.equal(globalOverview.hasSelection, false);
  assert.equal(globalOverview.selectionKind, 'none');
  assert.ok(globalOverview.metrics.matchedTerritoryNames.length >= 10);
  const globalPrompt = formatContextForPrompt(globalOverview, []);
  assert.match(globalPrompt, /当前全局时间轴状态上下文/);

  // 2. Circle selection centered on Athens (35 km) across 431–426 BCE -> matches Plague of Athens, excludes Sicilian Expedition
  const athensCenter: [number, number] = [23.7275, 37.9838];
  const circleOverview = extractRegionOverview({
    currentYear: -429,
    selectedRange: [-431, -426],
    activeLayers: ['mortality_catastrophe', 'population_density'],
    selectedRegion: {
      kind: 'circle',
      nameZh: '自定义画圈区域',
      center: athensCenter,
      radiusKm: 35,
      bbox: computeCircleBBox(athensCenter, 35),
    },
  });
  assert.equal(circleOverview.hasSelection, true);
  assert.equal(circleOverview.selectionKind, 'circle');
  assert.ok(circleOverview.events.some((e) => e.id === 'cat_plague_of_athens'));
  assert.equal(
    circleOverview.events.some((e) => e.id === 'cat_sicilian_expedition_catastrophe'),
    false,
  );
  const regionPrompt = formatContextForPrompt(circleOverview, []);
  assert.match(regionPrompt, /当前地图选中区域结构化上下文/);
  assert.match(regionPrompt, /雅典大瘟疫/);

  // 3. BBox selection around Syracuse / Eastern Sicily in 413 BCE -> isolates Sicilian Expedition catastrophe
  const sicilyBBoxOverview = extractRegionOverview({
    currentYear: -413,
    selectedRange: null,
    activeLayers: ['mortality_catastrophe'],
    selectedRegion: {
      kind: 'bbox',
      nameZh: '自定义框选区域',
      bbox: { minLon: 14.8, minLat: 36.7, maxLon: 15.6, maxLat: 37.4 },
    },
  });
  assert.equal(sicilyBBoxOverview.hasSelection, true);
  assert.ok(sicilyBBoxOverview.events.some((e) => e.id === 'cat_sicilian_expedition_catastrophe'));
  assert.equal(
    sicilyBBoxOverview.events.some((e) => e.id === 'cat_plague_of_athens'),
    false,
  );

  // 4. Single Territory selection (`attica_salamis_core`) in 480 BCE -> matches Salamis/Plataea invasion & Attica territory
  const territoryOverview = extractRegionOverview({
    currentYear: -480,
    selectedRange: null,
    activeLayers: ['population_density', 'mortality_catastrophe'],
    selectedRegion: {
      kind: 'territory',
      territoryId: 'attica_salamis_core',
      nameZh: '阿提卡本土、比雷埃夫斯三军港与萨拉米斯岛',
      tier: 'metropolis',
      bbox: { minLon: 23.32, minLat: 37.64, maxLon: 24.12, maxLat: 38.34 },
    },
  });
  assert.equal(territoryOverview.selectionKind, 'territory');
  assert.deepEqual(territoryOverview.metrics.matchedTerritoryNames, [
    '阿提卡本土、比雷埃夫斯三军港与萨拉米斯岛',
  ]);
  assert.ok(
    territoryOverview.events.some((e) => e.id === 'cat_salamis_plataea_persian_invasion'),
  );

  // 5. Overlaid Layers Coupling (`population_density` + `night_lights`): extracts node-level densities & night-light sources and enforces strong cross-layer correlation in AI prompt
  const popNightOverview = extractRegionOverview({
    currentYear: -440,
    selectedRange: [-454, -431],
    activeLayers: ['population_density', 'night_lights'],
    selectedRegion: {
      kind: 'bbox',
      nameZh: '自定义框选区域',
      bbox: { minLon: 23.4, minLat: 37.65, maxLon: 24.15, maxLat: 38.2 },
    },
  });
  assert.equal(popNightOverview.hasSelection, true);
  assert.ok(popNightOverview.populationDetails.length >= 2, 'must extract Attica population nodes');
  assert.ok(popNightOverview.nightLightDetails.length >= 2, 'must extract Attica/Laurion night light nodes');
  assert.ok(
    (popNightOverview.metrics.peakNightLightPct ?? 0) >= 50,
    'must compute peak night light percentage',
  );
  assert.ok(popNightOverview.events.some((e) => e.category === 'population'));
  assert.ok(popNightOverview.events.some((e) => e.category === 'night_light'));
  assert.equal(
    popNightOverview.events.some((e) => e.category === 'catastrophe' || e.category === 'species'),
    false,
    'unselected thematic layers should not pollute overview items when population + night_lights are overlaid',
  );

  const popNightPrompt = formatContextForPrompt(popNightOverview, []);
  assert.match(popNightPrompt, /当前叠加图层强相关分析要求/);
  assert.match(popNightPrompt, /人口密度 × 夜晚光照耦合/);
  assert.match(popNightPrompt, /【人口密度图层】匹配/);
  assert.match(popNightPrompt, /【夜晚光照图层】匹配/);
});

test('language support is strictly restricted to English (en), German (de), and Chinese (zh) across UI helpers, region overview, and AI prompts', async () => {
  const {
    formatYearByLang,
    normalizeAppLanguage,
    SUPPORTED_LANGUAGES,
  } = await import('../i18n/translations');
  const { extractRegionOverview, formatContextForPrompt } = await import('./regionSelector');

  // 1. Strictly only 3 supported languages: English (default), Chinese, German
  assert.deepEqual(
    SUPPORTED_LANGUAGES.map((l) => l.code),
    ['en', 'zh', 'de'],
  );
  assert.equal(normalizeAppLanguage('en'), 'en');
  assert.equal(normalizeAppLanguage('de'), 'de');
  assert.equal(normalizeAppLanguage('zh'), 'zh');
  assert.equal(normalizeAppLanguage('fr'), 'en');
  assert.equal(normalizeAppLanguage('ja'), 'en');
  assert.equal(normalizeAppLanguage(undefined), 'en');
  assert.equal(normalizeAppLanguage(null), 'en');

  // 2. Year formatting across zh / en / de
  assert.equal(formatYearByLang(-454, 'zh'), '公元前 454 年');
  assert.equal(formatYearByLang(-454, 'en'), '454 BCE');
  assert.equal(formatYearByLang(-454, 'de'), '454 v. Chr.');
  assert.equal(formatYearByLang(120, 'de'), '120 n. Chr.');

  // 3. English ('en') localized overview & AI context prompt
  const enOverview = extractRegionOverview({
    currentYear: -440,
    selectedRange: [-454, -431],
    activeLayers: ['population_density', 'night_lights'],
    selectedRegion: {
      kind: 'bbox',
      nameZh: 'Custom Box Selection',
      bbox: { minLon: 23.4, minLat: 37.65, maxLon: 24.15, maxLat: 38.2 },
    },
    language: 'en',
  });
  assert.equal(enOverview.timeLabelZh, '454 BCE – 431 BCE');
  assert.ok(enOverview.activeLayerLabelsZh.includes('Population Density'));
  assert.ok(enOverview.activeLayerLabelsZh.includes('Nighttime Lights'));
  assert.ok(enOverview.events.some((e) => /Urban Athens|Laurion/i.test(e.titleZh)));
  const enPrompt = formatContextForPrompt(enOverview, [], 'en');
  assert.match(enPrompt, /SELECTED MAP REGION CONTEXT/);
  assert.match(enPrompt, /ACTIVE OVERLAID LAYER CORRELATION DIRECTIVES/);
  assert.match(enPrompt, /Population Density × Nighttime Lights:/);

  // 4. German ('de') localized overview & AI context prompt
  const deOverview = extractRegionOverview({
    currentYear: -440,
    selectedRange: [-454, -431],
    activeLayers: ['population_density', 'night_lights'],
    selectedRegion: null,
    language: 'de',
  });
  assert.match(deOverview.regionTitleZh, /Globale Ansicht|Athenisches Seereich/);
  assert.equal(deOverview.timeLabelZh, '454 v. Chr. – 431 v. Chr.');
  assert.ok(deOverview.activeLayerLabelsZh.includes('Bevölkerungsdichte'));
  assert.ok(deOverview.activeLayerLabelsZh.includes('Nachtbeleuchtung'));
  const dePrompt = formatContextForPrompt(deOverview, [], 'de');
  assert.match(dePrompt, /GLOBALER ZEITLEISTENKONTEXT/);
  assert.match(dePrompt, /ANFORDERUNGEN ZUR EBENENKORRELATION/);
  assert.match(dePrompt, /Bevölkerungsdichte × Nachtbeleuchtung:/);
});

test('lossless spatial-bbox seam dissolution dissolves adjacent municipal edges accurately and reports OsmLoadingSnapshot readiness', async () => {
  const {
    extractDissolvedOuterBoundary,
    getOsmLoadingSnapshot,
    resolveActiveOsmTerritories,
    seedOsmGeometryCache,
  } = await import('../services/osmBoundaryService');

  // Two adjacent squares sharing the vertical edge x = 23.8 (with slight vertex offset within 140m Douglas-Peucker tolerance)
  const adjacentPair = {
    type: 'MultiPolygon' as const,
    coordinates: [
      [
        [
          [23.7, 37.9],
          [23.8, 37.9],
          [23.8, 38.0],
          [23.7, 38.0],
          [23.7, 37.9],
        ] as [number, number][],
      ],
      [
        [
          [23.8002, 37.9],
          [23.9, 37.9],
          [23.9, 38.0],
          [23.8002, 38.0],
          [23.8002, 37.9],
        ] as [number, number][],
      ],
    ],
  };

  const dissolved = extractDissolvedOuterBoundary(adjacentPair);
  const allPoints = dissolved.coordinates.flat();
  const hasInteriorSeamMidpoint = allPoints.some(
    ([lon, lat]) => Math.abs(lon - 23.8) < 0.001 && lat > 37.91 && lat < 37.99,
  );
  assert.equal(
    hasInteriorSeamMidpoint,
    false,
    'Shared internal seam between adjacent sub-polygons must be dissolved',
  );
  assert.ok(dissolved.coordinates.length >= 1, 'Exterior perimeter must be preserved');

  if (fs.existsSync(diskCachePath)) {
    const cached = JSON.parse(fs.readFileSync(diskCachePath, 'utf8'));
    seedOsmGeometryCache(cached);
    const t0 = performance.now();
    const resolved = resolveActiveOsmTerritories(-454);
    const elapsedMs = performance.now() - t0;
    assert.ok(resolved.length >= 10, `Expected >= 10 territories at 454 BCE, got ${resolved.length}`);
    assert.ok(
      elapsedMs < 250,
      `Expected lossless bbox-pruned seam dissolution across all territories in < 250ms, took ${elapsedMs.toFixed(1)}ms`,
    );
    const snap = getOsmLoadingSnapshot();
    assert.equal(snap.totalIds > 40, true);
    assert.equal(typeof snap.loadedIds, 'number');
  }
});

test('Clio-Atlas webpage title & English default language are uniformly configured across index.html and UI_TEXT', async () => {
  const { UI_TEXT } = await import('../i18n/translations');
  assert.equal(UI_TEXT.en.pageTitle, 'Clio-Atlas');
  assert.equal(UI_TEXT.zh.pageTitle, 'Clio-Atlas');
  assert.equal(UI_TEXT.de.pageTitle, 'Clio-Atlas');
  assert.equal(UI_TEXT.en.brandShort, 'Clio-Atlas');
  assert.equal(UI_TEXT.zh.brandShort, 'Clio-Atlas');
  assert.equal(UI_TEXT.de.brandShort, 'Clio-Atlas');

  const indexHtml = fs.readFileSync(path.join(process.cwd(), 'index.html'), 'utf8');
  assert.match(indexHtml, /<html\s+lang="en"/);
  assert.match(indexHtml, /<title>Clio-Atlas<\/title>/);
  assert.match(indexHtml, /property="og:title"\s+content="Clio-Atlas"/);
  assert.equal(indexHtml.includes('<title>文明演进史'), false);
});

test('borderless ancient civilizations (boundaryMode: unbounded) emit Core (0.60..0.85), wider Influence (0.20..0.40), Terra Nullius falloff (-> 0), and strict zero ocean bleed while demarcated states stay bordered', async () => {
  const {
    computeUnboundedPolityField,
    evaluateUnboundedFieldAlpha,
    isUnboundedPolity,
  } = await import('./unboundedPolityField');
  const { getPolityPhases } = await import('../shared/atlasDataLayer');

  const allPolities = getPolityPhases();
  const unboundedIds = allPolities.filter((p) => isUnboundedPolity(p)).map((p) => p.id);
  assert.deepEqual(
    unboundedIds.sort(),
    ['minoan_neopalatial_thalassocracy', 'mycenaean_palace_koine'],
    'Only borderless Bronze Age civilizations should use unbounded sphere rendering',
  );

  // Demarcated Classical Athens (-454) & Roman Principate (117) produce zero unbounded emitters
  const athens454 = getActivePolityPhases(-454);
  assert.equal(athens454.every((p) => !isUnboundedPolity(p)), true);
  const emptyDemarcatedField = computeUnboundedPolityField(
    athens454,
    resolveActiveOsmTerritories(-454),
  );
  assert.equal(emptyDemarcatedField.shells.length, 0);
  assert.equal(emptyDemarcatedField.glazeParcels.length, 0);

  // Mycenaean Palace Koine at 1450 BCE (-1450)
  const mycPolities = getActivePolityPhases(-1450);
  assert.equal(mycPolities.length, 1);
  assert.equal(mycPolities[0].id, 'mycenaean_palace_koine');
  assert.equal(isUnboundedPolity(mycPolities[0]), true);

  const mycTerritories = resolveActiveOsmTerritories(-1450);
  const mycField = computeUnboundedPolityField(mycPolities, mycTerritories);
  assert.ok(mycField.shells.length >= 60, 'Expected concentric organic draped polygon shells');

  // 1. Core Administrative Zone (Mycenae / Argolid [22.7562, 37.7308]): opacity in [0.60, 0.85]
  const coreAlpha = evaluateUnboundedFieldAlpha(
    mycField,
    'mycenaean_palace_koine',
    22.7562,
    37.7308,
    mycTerritories,
  );
  assert.ok(
    coreAlpha >= 0.6 && coreAlpha <= 0.85,
    `Expected Mycenae Core Zone alpha in [0.60, 0.85], got ${coreAlpha}`,
  );

  // 2. Radiating Influence Zone (Western Anatolia / Miletus [27.32, 37.45] & Thessaly [22.85, 39.15]): opacity in [0.20, 0.40]
  const anatoliaInfluenceAlpha = evaluateUnboundedFieldAlpha(
    mycField,
    'mycenaean_palace_koine',
    27.32,
    37.45,
    mycTerritories,
  );
  const thessalyInfluenceAlpha = evaluateUnboundedFieldAlpha(
    mycField,
    'mycenaean_palace_koine',
    22.85,
    39.15,
    mycTerritories,
  );
  assert.ok(
    anatoliaInfluenceAlpha >= 0.2 && anatoliaInfluenceAlpha <= 0.4,
    `Expected Western Anatolia Influence Zone alpha in [0.20, 0.40], got ${anatoliaInfluenceAlpha}`,
  );
  assert.ok(
    thessalyInfluenceAlpha >= 0.2 && thessalyInfluenceAlpha <= 0.4,
    `Expected Thessaly Influence Zone alpha in [0.20, 0.40], got ${thessalyInfluenceAlpha}`,
  );

  // 3. Smooth outer falloff to Terra Nullius (Alpha -> 0 in interior Balkans / central Anatolia)
  const frontierAlpha = evaluateUnboundedFieldAlpha(
    mycField,
    'mycenaean_palace_koine',
    22.85,
    40.35,
    mycTerritories,
  );
  const terraNulliusAlpha = evaluateUnboundedFieldAlpha(
    mycField,
    'mycenaean_palace_koine',
    22.5,
    42.8,
    mycTerritories,
  );
  assert.ok(coreAlpha > thessalyInfluenceAlpha, 'Core alpha must exceed Influence alpha');
  assert.ok(thessalyInfluenceAlpha > frontierAlpha, 'Influence alpha must decay toward frontier');
  assert.equal(terraNulliusAlpha, 0, 'Distant Terra Nullius alpha must reach exact 0');

  // 4. Strict coastline clipping: open Cretan Sea & Myrtoan Sea evaluate to exact 0
  assert.equal(
    evaluateUnboundedFieldAlpha(mycField, 'mycenaean_palace_koine', 25.0, 36.0, mycTerritories),
    0,
    'Open Cretan Sea must have 0 unbounded alpha (zero coastline overflow)',
  );
  assert.equal(
    evaluateUnboundedFieldAlpha(mycField, 'mycenaean_palace_koine', 23.6, 36.7, mycTerritories),
    0,
    'Open Myrtoan Sea must have 0 unbounded alpha (zero coastline overflow)',
  );
});

test('smoothBoundaryMultiLineString removes sub-kilometer jagged hairpin burrs and rounds acute corners while keeping closed loops closed', async () => {
  const { smoothBoundaryMultiLineString } = await import('../services/osmBoundaryService');

  // Construct a closed ring with an artificial sharp 400m hairpin burr spike at [23.75, 38.0032]
  const jaggedClosedLoop = {
    type: 'MultiLineString' as const,
    coordinates: [
      [
        [23.7, 37.95],
        [23.7498, 38.0],
        [23.75, 38.0032], // sharp micro-burr spike (~350m out and right back)
        [23.7502, 38.0],
        [23.8, 38.0],
        [23.8, 37.95],
        [23.7, 37.95],
      ] as [number, number][],
    ],
  };

  const smoothed = smoothBoundaryMultiLineString(jaggedClosedLoop);
  assert.equal(smoothed.coordinates.length, 1);
  const ring = smoothed.coordinates[0];
  assert.ok(ring.length > 8, 'Chaikin corner smoothing should densify rounded turns');

  // Closed loop must remain strictly closed
  assert.deepEqual(ring[0], ring[ring.length - 1], 'Closed boundary ring must stay closed');

  // Hairpin spike tip above lat 38.002 must be eliminated
  const maxLat = Math.max(...ring.map((pt) => pt[1]));
  assert.ok(
    maxLat <= 38.0005,
    `Expected jagged hairpin burr at 38.0032 to be removed, got maxLat=${maxLat}`,
  );
});

test('unbounded ancient civilization sphere computation & 350-year Bronze Age timeline scrub execute in < 35ms total with compact draped polygon shells', async () => {
  const {
    computeUnboundedPolityField,
    evaluateUnboundedFieldAlpha,
    hitTestUnboundedPolityAtLngLat,
  } = await import('./unboundedPolityField');

  // Cold-ish transition across Minoan (-1500) -> Mycenaean (-1450) + 350 consecutive year ticks (-1550..-1201)
  const tStart = performance.now();
  let lastTerrRef: any = null;
  let sameRefCount = 0;

  for (let yr = -1550; yr <= -1201; yr++) {
    const pols = getActivePolityPhases(yr);
    const terrs = resolveActiveOsmTerritories(yr);
    if (terrs === lastTerrRef) {
      sameRefCount++;
    }
    lastTerrRef = terrs;
    const field = computeUnboundedPolityField(pols, terrs, { opacityScale: 1.0 });
    assert.ok(
      field.shells.length > 0 && field.shells.length <= 200,
      `Expected compact draped shell count (<= 200) at year ${yr}, got ${field.shells.length}`,
    );
  }
  const totalElapsedMs = performance.now() - tStart;
  assert.ok(
    totalElapsedMs < 35,
    `Expected 350 Bronze Age unbounded year ticks to complete in < 35ms, took ${totalElapsedMs.toFixed(2)}ms`,
  );
  assert.ok(
    sameRefCount >= 345,
    `Expected reference-stable activeTerritories across consecutive Bronze Age years, got ${sameRefCount}/350`,
  );

  // Verify Minoan (-1500) Knossos Core Zone [25.1631, 35.2979] also sits cleanly in [0.60, 0.85] with zero sea bleed
  const minoanPols = getActivePolityPhases(-1500);
  const minoanTerrs = resolveActiveOsmTerritories(-1500);
  const minoanField = computeUnboundedPolityField(minoanPols, minoanTerrs);
  const knossosAlpha = evaluateUnboundedFieldAlpha(
    minoanField,
    'minoan_neopalatial_thalassocracy',
    25.1631,
    35.2979,
    minoanTerrs,
  );
  assert.ok(
    knossosAlpha >= 0.6 && knossosAlpha <= 0.85,
    `Expected Minoan Knossos Core Zone alpha in [0.60, 0.85], got ${knossosAlpha}`,
  );
  assert.equal(
    evaluateUnboundedFieldAlpha(
      minoanField,
      'minoan_neopalatial_thalassocracy',
      25.16,
      35.75,
      minoanTerrs,
    ),
    0,
    'Sea of Crete just north of Heraklion must evaluate to exact 0 alpha',
  );

  const mycPols = getActivePolityPhases(-1450);
  const mycTerrs = resolveActiveOsmTerritories(-1450);
  assert.equal(
    hitTestUnboundedPolityAtLngLat(22.7562, 37.7308, mycPols, mycTerrs)?.id,
    'mycenaean_palace_koine',
    'Mycenae heartland must hit Mycenaean unbounded sphere',
  );
  assert.equal(
    hitTestUnboundedPolityAtLngLat(22.85, 39.15, mycPols, mycTerrs)?.id,
    'mycenaean_palace_koine',
    'Thessaly continental influence belt must hit Mycenaean unbounded sphere',
  );
  assert.equal(
    hitTestUnboundedPolityAtLngLat(25.0, 36.0, mycPols, mycTerrs),
    null,
    'Open Cretan Sea must NOT hit unbounded sphere',
  );
});

test('GeopoliticalTransitionController drives snappy 210ms fade-in/fade-out across territorial expansion, regime change, and polity demise, while zoom-adaptive border widths slim down at macro overview', async () => {
  const {
    buildZoomAdaptiveBorderPaintSpecs,
    evaluateBorderWidthsAtZoom,
    GEOPOLITICAL_FADE_MS,
    GeopoliticalTransitionController,
  } = await import('./polityTransitionEngine');

  // 1. Animation duration stays crisp and snappy (<= 250ms, exact 210ms)
  assert.equal(GEOPOLITICAL_FADE_MS, 210);
  assert.ok(GEOPOLITICAL_FADE_MS <= 250);

  // 2. Zoom-adaptive border widths: slim at macro overview (zoom 1.2) to prevent crowding, expanding smoothly on zoom-in
  const macro = evaluateBorderWidthsAtZoom(1.2);
  const subMacro = evaluateBorderWidthsAtZoom(2.2);
  const continental = evaluateBorderWidthsAtZoom(3.5);
  const regional = evaluateBorderWidthsAtZoom(5.5);
  const local = evaluateBorderWidthsAtZoom(8.0);
  const polis = evaluateBorderWidthsAtZoom(11.5);

  assert.ok(macro.coreStrokePx < 0.6, `Expected slim macro core stroke < 0.6px, got ${macro.coreStrokePx}`);
  assert.ok(macro.alliedStrokePx < 0.48, `Expected slim macro allied stroke < 0.48px, got ${macro.alliedStrokePx}`);
  assert.ok(macro.casingPx < 0.9, `Expected slim macro casing < 0.9px, got ${macro.casingPx}`);
  assert.ok(macro.innerRibbonPx < 0.95, `Expected slim macro inner ribbon < 0.95px, got ${macro.innerRibbonPx}`);

  assert.ok(
    macro.coreStrokePx < subMacro.coreStrokePx &&
      subMacro.coreStrokePx < continental.coreStrokePx &&
      continental.coreStrokePx < regional.coreStrokePx &&
      regional.coreStrokePx < local.coreStrokePx &&
      local.coreStrokePx < polis.coreStrokePx,
    'Core border stroke width must strictly increase across zoom levels 1.2 -> 11.5',
  );
  assert.ok(
    macro.casingPx < subMacro.casingPx &&
      subMacro.casingPx < continental.casingPx &&
      continental.casingPx < regional.casingPx &&
      regional.casingPx < local.casingPx &&
      local.casingPx < polis.casingPx,
    'Border casing width must strictly increase across zoom levels 1.2 -> 11.5',
  );

  const paintSpecs = buildZoomAdaptiveBorderPaintSpecs();
  assert.equal(paintSpecs.strokeWidthExpr[0], 'interpolate');
  assert.deepEqual(paintSpecs.strokeWidthExpr[2], ['zoom']);
  assert.equal(paintSpecs.casingWidthExpr[0], 'interpolate');
  assert.equal(paintSpecs.innerRibbonWidthExpr[0], 'interpolate');

  // 3. Demarcated transitions: initial boot -> territorial expansion (-500 -> -499) -> regime change (-499 -> -454) -> demise (-404 -> -403)
  const ctrl = new GeopoliticalTransitionController();
  const boot = ctrl.syncTarget(
    getActivePolityPhases(-500),
    resolveActiveOsmTerritories(-500),
    1000,
    { immediate: true },
  );
  assert.equal(boot.changed, true);
  assert.equal(boot.frame.isAnimating, false);
  const count500 = boot.frame.steadyDemarcated.length;
  assert.ok(count500 >= 2);
  assert.equal(boot.frame.enteringDemarcated.length, 0);
  assert.equal(boot.frame.exitingDemarcated.length, 0);

  // Territorial expansion within same Archaic Athens regime (-500 -> -499 annexes Lemnos/Imbros/Skyros)
  const expand = ctrl.syncTarget(
    getActivePolityPhases(-499),
    resolveActiveOsmTerritories(-499),
    2000,
  );
  assert.equal(expand.changed, true);
  assert.equal(expand.frame.isAnimating, true);
  assert.equal(
    expand.frame.steadyDemarcated.length,
    count500,
    'Pre-existing territories must stay steady at 1.0 opacity during territorial expansion',
  );
  assert.ok(expand.frame.enteringDemarcated.length >= 1, 'Newly annexed territory must enter fade-in slot');
  assert.equal(expand.frame.exitingDemarcated.length, 0);
  assert.equal(expand.frame.enteringFactor, 0);

  const midExpand = ctrl.sampleFrame(2105);
  assert.equal(midExpand.isAnimating, true);
  assert.ok(midExpand.enteringFactor > 0.35 && midExpand.enteringFactor < 0.65);

  const settledExpand = ctrl.sampleFrame(2220);
  assert.equal(settledExpand.isAnimating, false);
  assert.equal(settledExpand.enteringFactor, 1);

  // Regime phase change & full imperial expansion (-499 Archaic #2563EB -> -454 Imperial #4F46E5)
  const regimeSwitch = ctrl.syncTarget(
    getActivePolityPhases(-454),
    resolveActiveOsmTerritories(-454),
    3000,
  );
  assert.equal(regimeSwitch.frame.isAnimating, true);
  assert.ok(regimeSwitch.frame.enteringDemarcated.length >= 10);
  assert.equal(regimeSwitch.frame.exitingDemarcated.length, count500 + expand.frame.enteringDemarcated.length);
  assert.equal(regimeSwitch.frame.enteringFactor, 0);
  assert.equal(regimeSwitch.frame.exitingFactor, 1);

  const midRegime = ctrl.sampleFrame(3105);
  assert.ok(midRegime.enteringFactor > 0.35 && midRegime.enteringFactor < 0.65);
  assert.ok(midRegime.exitingFactor > 0.35 && midRegime.exitingFactor < 0.65);

  const settledRegime = ctrl.sampleFrame(3220);
  assert.equal(settledRegime.isAnimating, false);
  assert.equal(settledRegime.enteringFactor, 1);
  assert.equal(settledRegime.exitingFactor, 0);
  assert.equal(settledRegime.exitingDemarcated.length, 0, 'Superseded regime must clean up to empty after fade-out');

  // Polity demise (-454 -> -403 where Classical Athens has fallen)
  const demise = ctrl.syncTarget(
    getActivePolityPhases(-403),
    resolveActiveOsmTerritories(-403),
    4000,
  );
  assert.equal(demise.frame.isAnimating, true);
  assert.equal(demise.frame.steadyDemarcated.length, 0);
  assert.equal(demise.frame.enteringDemarcated.length, 0);
  assert.ok(demise.frame.exitingDemarcated.length >= 10);
  assert.equal(demise.frame.exitingFactor, 1);

  const midDemise = ctrl.sampleFrame(4105);
  assert.ok(midDemise.exitingFactor > 0.35 && midDemise.exitingFactor < 0.65);

  const settledDemise = ctrl.sampleFrame(4220);
  assert.equal(settledDemise.isAnimating, false);
  assert.equal(settledDemise.exitingFactor, 0);
  assert.equal(settledDemise.exitingDemarcated.length, 0, 'Extinct polity must clean up to empty after 210ms fade-out');

  // 4. Unbounded ancient civilization regime transition (-1500 Minoan -> -1450 Mycenaean -> -1179 demise)
  ctrl.syncTarget(getActivePolityPhases(-1500), resolveActiveOsmTerritories(-1500), 5000, {
    immediate: true,
  });
  const unbSwitch = ctrl.syncTarget(
    getActivePolityPhases(-1450),
    resolveActiveOsmTerritories(-1450),
    6000,
  );
  assert.equal(unbSwitch.frame.isAnimating, true);
  assert.ok(unbSwitch.frame.enteringUnbounded !== null);
  assert.ok(unbSwitch.frame.exitingUnbounded !== null);
  assert.equal(unbSwitch.frame.enteringFactor, 0);
  assert.equal(unbSwitch.frame.exitingFactor, 1);

  const settledUnbSwitch = ctrl.sampleFrame(6220);
  assert.equal(settledUnbSwitch.isAnimating, false);
  assert.equal(settledUnbSwitch.exitingUnbounded, null);
  assert.ok(settledUnbSwitch.enteringUnbounded !== null);

  const unbDemise = ctrl.syncTarget(
    getActivePolityPhases(-1179),
    resolveActiveOsmTerritories(-1179),
    7000,
  );
  assert.equal(unbDemise.frame.isAnimating, true);
  assert.equal(unbDemise.frame.enteringUnbounded, null);
  assert.ok(unbDemise.frame.exitingUnbounded !== null);

  const settledUnbDemise = ctrl.sampleFrame(7220);
  assert.equal(settledUnbDemise.isAnimating, false);
  assert.equal(settledUnbDemise.exitingUnbounded, null);
});

test('extractInlandNationalBorder & dissolveSamePolityInlandBorders strip 100% of coastal white-fringe strokes while preserving inland national frontiers and dissolving same-polity provincial seams', async () => {
  if (!fs.existsSync(diskCachePath)) return;

  const { buildGeopoliticalTargetSnapshot } = await import('./polityTransitionEngine');

  // 1. Roman Principate at 117 CE: Sicily/Sardinia & Crete emit 0 coastal strokes; mainland frontier provinces retain inland borders
  const romanPolities = getActivePolityPhases(117);
  const romanTerrs = resolveActiveOsmTerritories(117);
  const romanSnap = buildGeopoliticalTargetSnapshot(romanPolities, romanTerrs);

  const byId117 = new Map(romanSnap.demarcatedItems.map((d) => [d.id, d]));
  assert.equal(
    byId117.get('provincia_sicilia_et_sardinia')!.outerBoundary.coordinates.length,
    0,
    'Sicily & Sardinia must have 0 coastal border strokes (zero coastal white fringes)',
  );
  assert.equal(
    byId117.get('creta_et_aegean_transit')!.outerBoundary.coordinates.length,
    0,
    'Crete must have 0 coastal border strokes',
  );
  assert.ok(
    byId117.get('italia_latium_et_etruria_core')!.outerBoundary.coordinates.length >= 1,
    'Northern/Central Italia must retain external inland frontiers',
  );
  assert.ok(
    byId117.get('gallia_narbonensis_province')!.outerBoundary.coordinates.length >= 1,
    'Gallia Narbonensis must retain northern Cévennes/Rhône inland frontier',
  );
  assert.ok(
    byId117.get('hispania_baetica_et_tarraconensis')!.outerBoundary.coordinates.length >= 1,
    'Hispania must retain western Lusitania/Asturia inland frontier',
  );

  // 2. Same-polity internal provincial seam dissolution:
  // In 117 CE, Italia Campania/Apulia only borders the sea and Latium/Samnium (same Roman polity), so its shared seam with Latium reduces segment count!
  const rawCampania = romanTerrs.find((t) => t.id === 'italia_campania_apulia_ports')!;
  const dissolvedCampania = byId117.get('italia_campania_apulia_ports')!;
  const rawCampaniaVerts = rawCampania.outerBoundary.coordinates.reduce(
    (s, l) => s + l.length,
    0,
  );
  const dissolvedCampaniaVerts = dissolvedCampania.outerBoundary.coordinates.reduce(
    (s, l) => s + l.length,
    0,
  );
  assert.ok(
    dissolvedCampaniaVerts < rawCampaniaVerts,
    `Expected shared Latium-Campania provincial seam to dissolve (${dissolvedCampaniaVerts} < ${rawCampaniaVerts})`,
  );

  // Similarly in 454 BCE (when Athens holds Boeotia) vs 440 BCE (when Athens no longer holds Boeotia):
  // Attica's northern frontier dissolves against Boeotia in 454 BCE and reappears cleanly in 440 BCE!
  const snap454 = buildGeopoliticalTargetSnapshot(
    getActivePolityPhases(-454),
    resolveActiveOsmTerritories(-454),
  );
  const snap440 = buildGeopoliticalTargetSnapshot(
    getActivePolityPhases(-440),
    resolveActiveOsmTerritories(-440),
  );
  const byId454 = new Map(snap454.demarcatedItems.map((d) => [d.id, d]));
  const atticaLines454 = byId454.get('attica_salamis_core')!.outerBoundary.coordinates;
  const atticaVerts454 = atticaLines454.reduce((s, l) => s + l.length, 0);
  const atticaVerts440 = snap440.demarcatedItems
    .find((d) => d.id === 'attica_salamis_core')!
    .outerBoundary.coordinates.reduce((s, l) => s + l.length, 0);
  assert.ok(
    atticaVerts454 < atticaVerts440,
    `Attica-Boeotia internal seam must dissolve in 454 BCE (${atticaVerts454}) and reappear as external national border in 440 BCE (${atticaVerts440})`,
  );
  assert.equal(
    atticaLines454.some((l) => l.length <= 2),
    false,
    'Dissolved Attica-Boeotia seam must leave zero 2-vertex micro-speck remnants',
  );

  // Pure Aegean island territories in 454 BCE must emit 0 coastal border strokes
  for (const islandId of [
    'euboea_cleruchy',
    'samos_democratic_bastion',
    'cyclades_delos_archipelago',
    'lemnos_imbros_skyros',
    'aegina_tributary',
    'rhodes_dorian_hexapolis',
  ]) {
    const item = byId454.get(islandId);
    if (item) {
      assert.equal(
        item.outerBoundary.coordinates.length,
        0,
        `Pure island territory ${islandId} must have 0 coastal border strokes`,
      );
    }
  }

  // Narrow Mytilene strait check: Lesbos (lon < 26.64, lat > 38.92) inside ionia_lesbos_chios_coast must never jump onto mainland Anatolia
  const ioniaPts = byId454
    .get('ionia_lesbos_chios_coast')!
    .outerBoundary.coordinates.flat();
  const hasLesbosCrossStraitStroke = ioniaPts.some(
    ([lon, lat]) => lon < 26.64 && lat > 38.92 && lat < 39.42,
  );
  assert.equal(
    hasLesbosCrossStraitStroke,
    false,
    'Lesbos must have 0 cross-strait border strokes across the Mytilene channel',
  );
});

test('buildStaticGeopoliticalCatalog & GeopoliticalGpuAnimator eliminate opacity dips and Web Worker reloads across regime changes, rapid scrubbing, and demise', async () => {
  if (!fs.existsSync(diskCachePath)) return;

  const { getPolityPhases } = await import('../shared/atlasDataLayer');
  const { getAllResolvedOsmTerritories } = await import('../services/osmBoundaryService');
  const { buildStaticGeopoliticalCatalog, GeopoliticalGpuAnimator } = await import(
    './polityTransitionEngine'
  );

  const catalog = buildStaticGeopoliticalCatalog(
    getPolityPhases(),
    getAllResolvedOsmTerritories(),
  );
  assert.ok(catalog.demarcatedFillFC.features.length >= 20, 'Static catalog registers all OSM fills once');
  assert.ok(catalog.demarcatedBoundaryFC.features.length >= 10, 'Static catalog registers dissolved inland border variants');
  assert.ok(catalog.unboundedFieldFC.features.length > 0, 'Static catalog registers unbounded sphere shells');

  const anim = new GeopoliticalGpuAnimator();
  assert.equal(anim.bindCatalog(catalog), true);
  assert.equal(anim.bindCatalog(catalog), false, 'Idempotent bindCatalog does not reset state');

  // 1. Initial immediate render at 500 BCE (Archaic Athens #2563eb)
  const init = anim.syncTarget(
    getActivePolityPhases(-500),
    resolveActiveOsmTerritories(-500),
    1000,
    { immediate: true },
  );
  assert.equal(init.frame.isAnimating, false);
  const atticaInit = init.frame.fills.find((f) => f.territoryId === 'attica_salamis_core')!;
  assert.equal(atticaInit.alpha, 0.65);
  assert.equal(atticaInit.fillColor, '#2563eb');

  // 2. Regime change + expansion (-500 Archaic Athens -> -478 Early Delian League):
  // Continuing Attica keeps steady alpha === 0.65 at every frame (ZERO midpoint opacity dip!) while morphing RGB hex!
  const expectedDelianHex = getActivePolityPhases(-478)[0].representativeColor.toLowerCase();
  const expectedEmpireHex = getActivePolityPhases(-454)[0].representativeColor.toLowerCase();
  const step478 = anim.syncTarget(
    getActivePolityPhases(-478),
    resolveActiveOsmTerritories(-478),
    2000,
  );
  assert.equal(step478.frame.isAnimating, true);
  const atticaT0 = step478.frame.fills.find((f) => f.territoryId === 'attica_salamis_core')!;
  const cycladesT0 = step478.frame.fills.find((f) => f.territoryId === 'cyclades_delos_archipelago')!;
  assert.equal(atticaT0.alpha, 0.65);
  assert.equal(atticaT0.fillColor, '#2563eb');
  assert.equal(cycladesT0.alpha, 0, 'Newly annexed Cyclades starts cleanly at alpha 0');
  assert.equal(cycladesT0.fillColor, expectedDelianHex, 'Newly annexed Cyclades snaps immediately to target hue');

  const mid478 = anim.sampleFrame(2105);
  const atticaMid = mid478.fills.find((f) => f.territoryId === 'attica_salamis_core')!;
  const cycladesMid = mid478.fills.find((f) => f.territoryId === 'cyclades_delos_archipelago')!;
  assert.equal(atticaMid.alpha, 0.65, 'Continuing territory must have ZERO opacity dip at midpoint');
  assert.notEqual(atticaMid.fillColor, '#2563eb');
  assert.notEqual(atticaMid.fillColor, expectedDelianHex);
  assert.ok(cycladesMid.alpha > 0.15 && cycladesMid.alpha < 0.45);

  // 3. Rapid 5x playback / mouse scrubbing mid-flight (-478 -> -454 Classical Empire at +105ms):
  // Cyclades continues smoothly from its mid-flight alpha without ever resetting back to 0!
  const midFlightCycladesAlpha = cycladesMid.alpha;
  const rapid454 = anim.syncTarget(
    getActivePolityPhases(-454),
    resolveActiveOsmTerritories(-454),
    2105,
  );
  const cycladesAfterScrub = rapid454.frame.fills.find(
    (f) => f.territoryId === 'cyclades_delos_archipelago',
  )!;
  assert.ok(
    Math.abs(cycladesAfterScrub.alpha - midFlightCycladesAlpha) < 0.002,
    `Rapid scrubbing must preserve C0 alpha continuity (${cycladesAfterScrub.alpha} vs ${midFlightCycladesAlpha})`,
  );

  const settled454 = anim.sampleFrame(2330);
  assert.equal(settled454.isAnimating, false);
  const atticaSettled = settled454.fills.find((f) => f.territoryId === 'attica_salamis_core')!;
  assert.equal(atticaSettled.alpha, 0.65);
  assert.equal(atticaSettled.fillColor, expectedEmpireHex);

  // 4. Polity demise (-404 -> -403): starts at full current alpha on frame 0 and decays monotonically to 0
  anim.syncTarget(getActivePolityPhases(-404), resolveActiveOsmTerritories(-404), 3000, {
    immediate: true,
  });
  const demise = anim.syncTarget(
    getActivePolityPhases(-403),
    resolveActiveOsmTerritories(-403),
    4000,
  );
  assert.equal(demise.frame.isAnimating, true);
  const atticaDemise0 = demise.frame.fills.find((f) => f.territoryId === 'attica_salamis_core')!;
  assert.equal(atticaDemise0.alpha, 0.65, 'Frame 0 of demise must hold full 0.65 alpha (zero blank-frame blink)');

  const atticaDemiseMid = anim
    .sampleFrame(4105)
    .fills.find((f) => f.territoryId === 'attica_salamis_core')!;
  assert.ok(atticaDemiseMid.alpha > 0.2 && atticaDemiseMid.alpha < 0.45);

  const demiseSettled = anim.sampleFrame(4220);
  assert.equal(demiseSettled.isAnimating, false);
  assert.equal(
    demiseSettled.fills.every((f) => f.alpha === 0),
    true,
    'All fills settle cleanly to 0 after 210ms demise fade-out',
  );
  assert.equal(
    demiseSettled.boundaries.every((b) => b.alpha === 0),
    true,
    'All inland borders settle cleanly to 0 after 210ms demise fade-out',
  );
});




