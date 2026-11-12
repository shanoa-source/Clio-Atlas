import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApiApp } from '../../server';
import { loadExternalDataConfig } from './dataConfigLoader';
import {
  BUNDLE_COLLECTION_KEYS,
  getDataSchemaCatalog,
  importDataToDisk,
  queryImportedData,
  validateImportPayload,
} from './dataImportService';

test('JSON Schema, structural templates, and empty live data/imports store exist and are valid', () => {
  const rootDir = process.cwd();
  const schemaPath = path.join(rootDir, 'data', 'schemas', 'atlas_import_bundle.schema.json');
  const templatesPath = path.join(rootDir, 'data', 'schemas', 'import_templates.json');
  const bundlePath = path.join(rootDir, 'data', 'imports', 'atlas_bundle.json');

  assert.equal(fs.existsSync(schemaPath), true, 'atlas_import_bundle.schema.json must exist');
  assert.equal(fs.existsSync(templatesPath), true, 'import_templates.json must exist');
  assert.equal(fs.existsSync(bundlePath), true, 'atlas_bundle.json must exist');

  const catalog = getDataSchemaCatalog(rootDir, rootDir);
  assert.equal(catalog.schemaVersion, '1.0.0');
  assert.equal(
    (catalog.schema as any).$schema,
    'https://json-schema.org/draft/2020-12/schema',
  );

  const defs = (catalog.schema as any).$defs || {};
  for (const defName of [
    'SystemPromptConfig',
    'PolityRecord',
    'TerritoryRecord',
    'PopulationNodeRecord',
    'NightLightNodeRecord',
    'TransportRouteRecord',
    'SpeciesDiscoveryRecord',
    'MortalityCatastropheRecord',
    'SpaceMissionRecord',
    'BookListItem',
    'CustomHistoricalEvent',
  ]) {
    assert.ok(defs[defName], `JSON Schema must define $defs.${defName}`);
  }

  const templatesObj = (catalog.templates as any).templates || {};
  for (const tplKey of [
    'systemPromptConfig',
    'bookListItem',
    'customHistoricalEvent',
    'polityRecord',
    'territoryRecord',
    'populationNodeRecord',
    'nightLightNodeRecord',
    'transportRouteRecord',
    'speciesDiscoveryRecord',
    'mortalityCatastropheRecord',
    'spaceMissionRecord',
  ]) {
    assert.ok(templatesObj[tplKey], `import_templates.json must define templates.${tplKey}`);
  }

  // Live workspace import store must start completely empty (0 records across all collections)
  for (const col of BUNDLE_COLLECTION_KEYS) {
    assert.equal(catalog.counts[col], 0, `Live collection ${col} must be empty initially`);
  }
});

test('validateImportPayload strictly rejects malformed coordinates, handwritten polygons, inverted years, and unsupported languages', () => {
  const invalidPayload = {
    schemaVersion: '1.0.0',
    polities: [
      {
        id: 'pol_bad',
        nameZh: '错误政权',
        nameEn: 'Bad Polity',
        eraSubtitle: '',
        startYear: -300,
        endYear: -450, // Inverted: startYear > endYear
        representativeColor: 'blue', // Not #RRGGBB
        borderColor: '#60A5FA',
        flagId: 'imperial_athens',
        flagLabel: '',
        capitalName: 'Test',
        capitalCoords: [215, 95], // Out of WGS84 range
        historicalSummary: '',
        sourceCitation: '',
      },
    ],
    territories: [
      {
        id: 'terr_handwritten',
        nameZh: '手写多边形违规测试',
        validFrom: -450,
        validTo: -420,
        tier: 'metropolis',
        osmIds: ['12345'], // Missing R/W prefix
        coordinates: [[[23.5, 37.9], [23.8, 37.9], [23.8, 38.1], [23.5, 37.9]]], // Prohibited handwritten polygon
      },
    ],
    nightLightNodes: [
      {
        id: 'nl_over_1',
        nameZh: '超限光源',
        nameI18n: { zh: '超限光源', fr: 'Unsupported French' }, // Unsupported language key 'fr'
        category: 'urban_lamps',
        coords: [23.7, 37.9],
        spreadDeg: 0.1,
        validFrom: -450,
        validTo: -400,
        intensityKeyframes: [[-450, 1.45]], // Exceeds [0, 1]
        description: '',
      },
    ],
    transportRoutes: [
      {
        id: 'rt_short',
        nameZh: '单点航线',
        routeType: 'maritime',
        originName: 'A',
        destinationName: 'B',
        openedYear: -450,
        closedYear: -410,
        cargoSummary: 'Grain',
        waypoints: [[23.6, 37.9]], // Fewer than 2 waypoints
        usageKeyframes: [[-450, 100]],
        sourceCitation: '',
      },
    ],
  };

  const res = validateImportPayload(invalidPayload, 'bundle');
  assert.equal(res.valid, false);

  const errorPaths = res.errors.map((e) => e.path);
  assert.ok(errorPaths.includes('polities[0].startYear'));
  assert.ok(errorPaths.includes('polities[0].representativeColor'));
  assert.ok(errorPaths.includes('polities[0].capitalCoords[0]'));
  assert.ok(errorPaths.includes('territories[0]'), 'must reject handwritten coordinates field');
  assert.ok(errorPaths.includes('territories[0].osmIds[0]'), 'must reject invalid OSM ID format');
  assert.ok(errorPaths.includes('nightLightNodes[0].nameI18n.fr'), 'must reject non zh/en/de language');
  assert.ok(errorPaths.includes('nightLightNodes[0].intensityKeyframes[0][1]'));
  assert.ok(errorPaths.includes('transportRoutes[0].waypoints'));
});

test('importDataToDisk supports dryRun, idempotent merge upsert, and replace across bundle, books, events, and prompts', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-import-unit-'));
  try {
    const sampleBundle = {
      schemaVersion: '1.0.0',
      prompts: {
        systemPrompt: '默认学术规范提示词',
        i18n: {
          zh: '请严格引用罗马帝国元首制时期人口与海运档案。',
          en: 'Strictly cite Principate Roman demographic and maritime records.',
          de: 'Zitieren Sie strikt demographische und maritime Quellen der Prinzipatszeit.',
        },
      },
      polities: [
        {
          id: 'roman_principate_117',
          nameZh: '罗马帝国（图拉真极盛期）',
          nameEn: 'Roman Empire (Trajanic Peak)',
          nameDe: 'Römisches Reich (Trajanische Blütezeit)',
          eraSubtitle: '五贤帝时代与地中海内海体系',
          eraSubtitleI18n: {
            zh: '五贤帝时代与地中海内海体系',
            en: 'Adoptive Emperors & Mare Nostrum Integration',
            de: 'Adoptivkaiser & Mare-Nostrum-Integration',
          },
          startYear: 98,
          endYear: 138,
          representativeColor: '#991B1B',
          borderColor: '#F87171',
          flagId: 'imperial_athens',
          flagLabel: 'SPQR',
          capitalName: '罗马 (Roma)',
          capitalNameI18n: { zh: '罗马', en: 'Rome', de: 'Rom' },
          capitalCoords: [12.4964, 41.9028],
          historicalSummary: '公元 117 年罗马帝国横跨地中海三大洲，奥斯蒂亚与亚历山大港构成谷物海运动脉。',
          summaryI18n: {
            zh: '公元 117 年罗马帝国横跨地中海三大洲，奥斯蒂亚与亚历山大港构成谷物海运动脉。',
            en: 'By 117 CE the Roman Empire spanned the Mediterranean basin anchored by the Alexandria–Ostia grain axis.',
            de: '117 n. Chr. umspannte das Römische Reich den Mittelmeerraum, getragen von der Getreideachse Alexandria–Ostia.',
          },
          sourceCitation: 'Cassius Dio 68; Scheidel (2007) Cambridge Economic History',
        },
      ],
      territories: [
        {
          id: 'terr_latium_roma',
          polityId: 'roman_principate_117',
          nameZh: '拉丁姆与奥斯蒂亚海港核心区',
          nameI18n: {
            zh: '拉丁姆与奥斯蒂亚海港核心区',
            en: 'Latium & Ostia Port Core',
            de: 'Latium & Hafenbezirk Ostia',
          },
          validFrom: 50,
          validTo: 200,
          tier: 'metropolis',
          osmIds: ['R41485'],
          approxBBox: { minLon: 11.9, minLat: 41.4, maxLon: 13.2, maxLat: 42.3 },
        },
      ],
      populationNodes: [
        {
          id: 'pop_imperial_rome_ostia',
          nameZh: '罗马都城—奥斯蒂亚双城人口带',
          nameI18n: {
            zh: '罗马都城—奥斯蒂亚双城人口带',
            en: 'Imperial Rome–Ostia Urban Corridor',
            de: 'Kaiserzeitlicher Stadtkorridor Rom–Ostia',
          },
          center: [12.48, 41.89],
          radiusDegLon: 0.35,
          radiusDegLat: 0.3,
          validFrom: 50,
          validTo: 200,
          densityKeyframes: [
            [80, 420],
            [117, 510],
            [180, 390],
          ],
          estimatedTotalNote: '都城人口峰值约 100 万，依赖埃及与北非海运谷物供给',
          noteI18n: {
            zh: '都城人口峰值约 100 万，依赖埃及与北非海运谷物供给',
            en: 'Metropolis peaked near ~1,000,000 inhabitants sustained by Egyptian and African grain fleets',
            de: 'Metropole mit rund 1.000.000 Einwohnern, versorgt durch Getreideflotten aus Ägypten und Nordafrika',
          },
        },
      ],
      nightLightNodes: [
        {
          id: 'nl_portus_trajan_lighthouse',
          nameZh: '波尔图斯六角港灯塔与罗马浴场夜灯群',
          nameI18n: {
            zh: '波尔图斯六角港灯塔与罗马浴场夜灯群',
            en: 'Portus Traiani Pharos & Urban Rome Oil Lamps',
            de: 'Leuchtturm von Portus Traiani & Stadtrömische Öllampen',
          },
          category: 'harbor_beacon',
          coords: [12.26, 41.78],
          spreadDeg: 0.2,
          validFrom: 100,
          validTo: 200,
          intensityKeyframes: [
            [100, 0.85],
            [117, 0.97],
          ],
          description: '图拉真扩建六角内港巨型导航灯塔与百万人口陶油灯辐射场',
          descriptionI18n: {
            zh: '图拉真扩建六角内港巨型导航灯塔与百万人口陶油灯辐射场',
            en: 'Monumental multi-tiered harbor pharos at Portus and dense insulae oil-lamp glow',
            de: 'Mehrstufiges Hafenleuchtfeuer in Portus und dichtes Insulae-Öllampenfeld',
          },
        },
      ],
    };

    // 1. Dry-run does not create files on disk
    const dryRes = importDataToDisk({
      baseDir: tempDir,
      payload: sampleBundle,
      target: 'bundle',
      mode: 'merge',
      dryRun: true,
    });
    assert.equal(dryRes.ok, true);
    assert.equal(dryRes.counts.polities, 1);
    assert.equal(
      fs.existsSync(path.join(tempDir, 'data', 'imports', 'atlas_bundle.json')),
      false,
      'dryRun must not write to disk',
    );

    // 2. Real merge writes atomically
    const writeRes = importDataToDisk({
      baseDir: tempDir,
      payload: sampleBundle,
      target: 'bundle',
      mode: 'merge',
    });
    assert.equal(writeRes.ok, true);
    assert.equal(writeRes.counts.populationNodes, 1);

    // 3. Upsert same ID updates density without duplicating
    const updatedPopPayload = {
      schemaVersion: '1.0.0',
      populationNodes: [
        {
          ...sampleBundle.populationNodes[0],
          densityKeyframes: [[117, 560]],
        },
      ],
    };
    const upsertRes = importDataToDisk({
      baseDir: tempDir,
      payload: updatedPopPayload,
      target: 'bundle',
      mode: 'merge',
    });
    assert.equal(upsertRes.ok, true);
    assert.equal(upsertRes.counts.populationNodes, 1, 'merge must upsert by id without duplicating');
    assert.equal(upsertRes.counts.polities, 1, 'merge must preserve existing polities');

    const queried = queryImportedData(tempDir, { year: 117 });
    assert.equal(queried.populationNodes[0].densityKeyframes[0][1], 560);

    // 4. Standalone books & events target imports + language-aware prompt loader
    const bookImport = importDataToDisk({
      baseDir: tempDir,
      target: 'books',
      mode: 'merge',
      payload: [
        {
          id: 'book_scheidel_2007',
          title: 'The Cambridge Economic History of the Greco-Roman World',
          titleI18n: {
            zh: '剑桥希腊罗马世界经济史',
            en: 'The Cambridge Economic History of the Greco-Roman World',
            de: 'Cambridge Wirtschaftsgeschichte der griechisch-römischen Welt',
          },
          author: 'Walter Scheidel, Ian Morris, Richard Saller',
          startYear: -500,
          endYear: 300,
          relatedLayers: ['population_density', 'night_lights'],
          note: 'Demography and urbanization metrics',
          noteI18n: {
            zh: '古典地中海人口规模与城市化量化基准',
            en: 'Quantitative baseline for Mediterranean demography and urbanization',
            de: 'Quantitative Referenz für Demographie und Urbanisierung im Mittelmeerraum',
          },
        },
      ],
    });
    assert.equal(bookImport.ok, true);
    assert.equal(bookImport.counts.books, 1);

    const cfgDe = loadExternalDataConfig(tempDir, 'de');
    assert.equal(
      cfgDe.customSystemPrompt,
      'Zitieren Sie strikt demographische und maritime Quellen der Prinzipatszeit.',
    );
    assert.equal(cfgDe.books.length, 1);

    // 5. Replace mode clears omitted collections cleanly
    const replaceRes = importDataToDisk({
      baseDir: tempDir,
      target: 'bundle',
      mode: 'replace',
      payload: { schemaVersion: '1.0.0' },
    });
    assert.equal(replaceRes.ok, true);
    assert.equal(replaceRes.counts.polities, 0);
    assert.equal(replaceRes.counts.populationNodes, 0);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('Backend Express HTTP endpoints (/api/data/schema, /validate, /import, /export, /overview-preview) work end-to-end across zh/en/de', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-http-api-'));
  const app = createApiApp({
    baseDir: tempDir,
    rootSchemaDir: process.cwd(),
  });

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });

  try {
    const { port } = server.address() as AddressInfo;
    const baseUrl = `http://127.0.0.1:${port}`;

    // 1. GET /api/data/schema
    const schemaResp = await fetch(`${baseUrl}/api/data/schema`);
    assert.equal(schemaResp.status, 200);
    const schemaJson = (await schemaResp.json()) as any;
    assert.equal(schemaJson.schemaVersion, '1.0.0');
    assert.equal(schemaJson.counts.polities, 0);

    // 2. POST /api/data/validate (invalid -> 400)
    const badValidateResp = await fetch(`${baseUrl}/api/data/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: 'events',
        payload: [{ startYear: -300, endYear: -400 }], // Missing title & inverted years
      }),
    });
    assert.equal(badValidateResp.status, 400);
    const badValidateJson = (await badValidateResp.json()) as any;
    assert.equal(badValidateJson.valid, false);
    assert.ok(badValidateJson.errors.length >= 2);

    // 3. POST /api/data/import (valid multi-layer 117 CE dataset -> 200)
    const importPayload = {
      schemaVersion: '1.0.0',
      prompts: {
        i18n: {
          zh: '【后端导入配置】优先结合罗马帝国元首制粮道与港口灯塔回答。',
          en: '[Imported Prompt] Prioritize Principate grain fleets and Portus pharos data.',
          de: '[Importierter Prompt] Priorisieren Sie Getreideflotten und den Leuchtturm von Portus.',
        },
      },
      polities: [
        {
          id: 'roman_empire_117',
          nameZh: '罗马帝国（元首制盛期）',
          nameEn: 'Roman Empire (High Principate)',
          nameDe: 'Römisches Kaiserreich (Hoher Prinzipat)',
          eraSubtitle: '地中海统一航运网',
          startYear: 98,
          endYear: 138,
          representativeColor: '#991B1B',
          borderColor: '#F87171',
          flagId: 'imperial_athens',
          flagLabel: 'SPQR',
          capitalName: 'Roma',
          capitalCoords: [12.4964, 41.9028],
          historicalSummary: '罗马与奥斯蒂亚构成地中海最大人口与港口照明中心。',
          summaryI18n: {
            zh: '罗马与奥斯蒂亚构成地中海最大人口与港口照明中心。',
            en: 'Rome and Ostia formed the largest demographic and nocturnal beacon hub of the Mediterranean.',
            de: 'Rom und Ostia bildeten das größte Bevölkerungs- und Hafenfeuerzentrum des Mittelmeerraums.',
          },
          sourceCitation: 'Strabo 5.3; Cassius Dio 68',
        },
      ],
      territories: [
        {
          id: 'terr_italia_latium',
          polityId: 'roman_empire_117',
          nameZh: '意大利拉丁姆本土',
          nameI18n: { zh: '意大利拉丁姆本土', en: 'Italia – Latium Core', de: 'Italien – Kernland Latium' },
          validFrom: 50,
          validTo: 200,
          tier: 'metropolis',
          osmIds: ['R41485'],
          approxBBox: { minLon: 11.8, minLat: 41.3, maxLon: 13.5, maxLat: 42.4 },
        },
      ],
      populationNodes: [
        {
          id: 'pop_roma_117',
          nameZh: '罗马城垣与台伯河口聚落带',
          nameI18n: {
            zh: '罗马城垣与台伯河口聚落带',
            en: 'Urban Rome & Tiber Mouth Belt',
            de: 'Stadtgebiet Rom & Tibermündung',
          },
          center: [12.48, 41.89],
          radiusDegLon: 0.3,
          radiusDegLat: 0.28,
          validFrom: 80,
          validTo: 180,
          densityKeyframes: [[117, 525]],
          estimatedTotalNote: '高密度多层公寓（Insulae）聚居区',
          noteI18n: {
            zh: '高密度多层公寓（Insulae）聚居区',
            en: 'High-density multi-story insulae residential belt',
            de: 'Dicht bebauter mehrgeschossiger Insulae-Wohngürtel',
          },
        },
      ],
      nightLightNodes: [
        {
          id: 'nl_portus_117',
          nameZh: '波尔图斯六角港导航火塔',
          nameI18n: {
            zh: '波尔图斯六角港导航火塔',
            en: 'Portus Hexagonal Basin Lighthouse',
            de: 'Leuchtturm am Sechseckhafen von Portus',
          },
          category: 'harbor_beacon',
          coords: [12.26, 41.78],
          spreadDeg: 0.18,
          validFrom: 103,
          validTo: 190,
          intensityKeyframes: [[117, 0.95]],
          description: '保障亚历山大港运粮船队夜间进港的巨型灯塔火光',
          descriptionI18n: {
            zh: '保障亚历山大港运粮船队夜间进港的巨型灯塔火光',
            en: 'Harbor pharos guiding Alexandrian grain ships into the Tiber mouth at night',
            de: 'Hafenpharos zur nächtlichen Leitung alexandrinischer Getreideschiffe',
          },
        },
      ],
      transportRoutes: [
        {
          id: 'route_alexandria_portus_grain',
          nameZh: '亚历山大港—波尔图斯帝国海运粮道',
          nameI18n: {
            zh: '亚历山大港—波尔图斯帝国海运粮道',
            en: 'Alexandria–Portus Imperial Grain Sea Lane',
            de: 'Kaiserliche Getreideroute Alexandria–Portus',
          },
          routeType: 'maritime',
          originName: 'Alexandria',
          destinationName: 'Portus (Ostia)',
          openedYear: -30,
          closedYear: 330,
          cargoSummary: '埃及谷物、纸草与玻璃器',
          cargoSummaryI18n: {
            zh: '埃及谷物、纸草与玻璃器',
            en: 'Egyptian grain, papyrus, and glassware',
            de: 'Ägyptisches Getreide, Papyrus und Glaswaren',
          },
          waypoints: [
            [29.9, 31.2],
            [24.0, 34.8],
            [15.6, 38.2],
            [12.26, 41.78],
          ],
          usageKeyframes: [[117, 680]],
          sourceCitation: 'Rickman (1980) The Corn Supply of Ancient Rome',
        },
      ],
      books: [
        {
          id: 'bk_rickman_1980',
          title: 'The Corn Supply of Ancient Rome',
          titleI18n: {
            zh: '古罗马的谷物供应体系',
            en: 'The Corn Supply of Ancient Rome',
            de: 'Die Getreideversorgung des antiken Rom',
          },
          author: 'Geoffrey Rickman',
          startYear: -50,
          endYear: 250,
          relatedLayers: ['population_density', 'night_lights', 'transport_routes'],
          note: 'Imperial annona logistics',
          noteI18n: {
            zh: '帝国安诺那海运粮政考证',
            en: 'Analysis of Imperial annona maritime logistics',
            de: 'Analyse der kaiserzeitlichen Annona-Seelogistik',
          },
        },
      ],
      customEvents: [
        {
          id: 'ev_trajan_portus_dedication',
          nameZh: '图拉真六角内港与仓储群全面投用',
          nameI18n: {
            zh: '图拉真六角内港与仓储群全面投用',
            en: 'Full Operation of Trajanic Hexagonal Basin & Horrea at Portus',
            de: 'Vollbetrieb des Trajanischen Sechseckhafens und der Horrea in Portus',
          },
          startYear: 112,
          endYear: 120,
          coords: [12.26, 41.78],
          relatedLayers: ['population_density', 'night_lights'],
          metricI18n: {
            zh: '泊位 >100 艘巨型粮船',
            en: '>100 large grain ships capacity',
            de: 'Kapazität >100 Großfrachter',
          },
          summaryI18n: {
            zh: '大幅提升罗马百万人口的夜间卸货与仓储周转能力。',
            en: 'Expanded all-weather mooring and night unloading capacity for Rome.',
            de: 'Erweiterte Allwetter-Liegeplätze und Nachtentladung für die Millionenstadt Rom.',
          },
          sourceCitation: 'Keay et al. (2005) Portus',
        },
      ],
    };

    const importResp = await fetch(`${baseUrl}/api/data/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        target: 'bundle',
        mode: 'merge',
        payload: importPayload,
      }),
    });
    assert.equal(importResp.status, 200);
    const importJson = (await importResp.json()) as any;
    assert.equal(importJson.ok, true);
    assert.equal(importJson.counts.polities, 1);
    assert.equal(importJson.counts.populationNodes, 1);
    assert.equal(importJson.counts.nightLightNodes, 1);
    assert.equal(importJson.counts.transportRoutes, 1);
    assert.equal(importJson.counts.books, 1);
    assert.equal(importJson.counts.customEvents, 1);

    // 4. GET /api/data/export with spatial + temporal query filter
    const exportHitResp = await fetch(
      `${baseUrl}/api/data/export?year=117&minLon=11.5&minLat=41.0&maxLon=13.5&maxLat=42.5`,
    );
    assert.equal(exportHitResp.status, 200);
    const exportHitJson = (await exportHitResp.json()) as any;
    assert.equal(exportHitJson.populationNodes.length, 1);
    assert.equal(exportHitJson.nightLightNodes.length, 1);

    const exportMissResp = await fetch(`${baseUrl}/api/data/export?year=-450`);
    const exportMissJson = (await exportMissResp.json()) as any;
    assert.equal(exportMissJson.populationNodes.length, 0);

    // 5. POST /api/data/overview-preview in German ('de') inside Latium BBox at 117 CE
    const previewDeResp = await fetch(`${baseUrl}/api/data/overview-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'de',
        currentYear: 117,
        selectedRange: [110, 125],
        activeLayers: ['population_density', 'night_lights'],
        selectedRegion: {
          kind: 'bbox',
          nameZh: 'Latium',
          bbox: { minLon: 11.8, minLat: 41.4, maxLon: 13.2, maxLat: 42.3 },
        },
      }),
    });
    assert.equal(previewDeResp.status, 200);
    const previewDeJson = (await previewDeResp.json()) as any;

    assert.equal(
      previewDeJson.customSystemPrompt,
      '[Importierter Prompt] Priorisieren Sie Getreideflotten und den Leuchtturm von Portus.',
    );
    assert.equal(
      previewDeJson.overview.activePolityNameZh,
      'Römisches Kaiserreich (Hoher Prinzipat)',
    );
    assert.equal(previewDeJson.overview.metrics.peakDensityPerKm2, 525);
    assert.equal(previewDeJson.overview.metrics.peakNightLightPct, 95);
    assert.match(previewDeJson.structuredContext, /Stadtgebiet Rom & Tibermündung/);
    assert.match(previewDeJson.structuredContext, /Leuchtturm am Sechseckhafen von Portus/);
    assert.match(previewDeJson.structuredContext, /Die Getreideversorgung des antiken Rom/);
    assert.match(previewDeJson.structuredContext, /Vollbetrieb des Trajanischen Sechseckhafens/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
