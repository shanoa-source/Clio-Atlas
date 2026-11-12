import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import esbuild from 'esbuild';
import { onRequest as apiMiddleware } from '../../functions/api/_middleware';
import { onRequestPost as onChatPost } from '../../functions/api/chat';
import { onRequestGet as onDataExportGet } from '../../functions/api/data/export';
import { onRequestPost as onDataImportPost } from '../../functions/api/data/import';
import { onRequestPost as onOverviewPreviewPost } from '../../functions/api/data/overview-preview';
import { onRequestGet as onDataSchemaGet } from '../../functions/api/data/schema';
import { onRequestPost as onDataValidatePost } from '../../functions/api/data/validate';
import { onRequestGet as onOsmBoundariesGet } from '../../functions/api/osm-boundaries';
import { onRequestGet as onOverviewConfigGet } from '../../functions/api/overview-config';
import {
  buildNominatimSearchUrl,
  buildOverpassAdminQuery,
  resolveTerritoriesInBundle,
} from '../../scripts/resolve-osm-ids';
import { validateImportPayload } from '../shared/dataValidator';
import { handleChatRequest, handleOsmBoundariesRequest } from './apiHandlers';
import { createEdgeStorageAdapter, resetEdgeIsolateMemoryStore } from './storage';
import { EdgeEnv, KVNamespaceLike, PagesEventContext } from './types';

function createMockKV(): KVNamespaceLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string, type?: 'text' | 'json'): Promise<any> {
      const raw = store.get(key) ?? null;
      if (raw === null) return null;
      if (type === 'json') {
        return JSON.parse(raw);
      }
      return raw;
    },
    async put(key: string, value: string): Promise<void> {
      store.set(key, value);
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
  };
}

function createPagesContext(
  request: Request,
  env: EdgeEnv = {},
  nextFn?: () => Promise<Response>,
): PagesEventContext<EdgeEnv> {
  return {
    request,
    functionPath: new URL(request.url).pathname,
    waitUntil: () => {},
    passThroughOnException: () => {},
    next: nextFn || (async () => new Response('Not Found', { status: 404 })),
    env,
    params: {},
    data: {},
  };
}

function listTsFilesRecursively(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFilesRecursively(full));
    } else if (entry.isFile() && full.endsWith('.ts') && !full.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

test('Cloudflare Pages Functions (functions/, src/edge/, src/shared/) contain zero Node fs/os/express imports and bundle cleanly for Workers V8 isolates', async () => {
  const rootDir = process.cwd();
  const edgeDirs = [
    path.join(rootDir, 'functions'),
    path.join(rootDir, 'src', 'edge'),
    path.join(rootDir, 'src', 'shared'),
  ];

  const forbiddenImportRe =
    /from\s+['"](node:fs|fs|node:path|path|node:os|os|node:http|http|node:net|net|express)['"]/;

  for (const dir of edgeDirs) {
    const files = listTsFilesRecursively(dir);
    assert.ok(files.length > 0, `Expected TypeScript files in ${dir}`);
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      assert.equal(
        forbiddenImportRe.test(source),
        false,
        `Forbidden Node/Express import found in Edge module ${path.relative(rootDir, file)}`,
      );
    }
  }

  // Verify Cloudflare Pages routing & Wrangler configuration files exist
  assert.equal(fs.existsSync(path.join(rootDir, 'wrangler.toml')), true);
  assert.equal(fs.existsSync(path.join(rootDir, 'public', '_routes.json')), true);
  assert.equal(fs.existsSync(path.join(rootDir, 'public', '_redirects')), true);

  const routesCfg = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'public', '_routes.json'), 'utf8'),
  );
  assert.equal(routesCfg.version, 1);
  assert.deepEqual(routesCfg.include, ['/api/*']);

  // Bundle all Cloudflare Pages Functions entrypoints using esbuild with Worker/Browser conditions
  const functionEntries = listTsFilesRecursively(path.join(rootDir, 'functions'));
  assert.equal(functionEntries.length, 9, 'Expected _middleware + 8 API Pages Functions');

  const bundleResult = await esbuild.build({
    entryPoints: functionEntries,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    conditions: ['worker', 'browser', 'import'],
    target: 'es2022',
    outdir: path.join(rootDir, '.wrangler-test-out'),
  });

  assert.equal(bundleResult.errors.length, 0);
  assert.equal(bundleResult.outputFiles.length, 9);
});

test('Cloudflare Pages Functions middleware, KV-backed data import/export, overview-preview, OSM KV cache, and AI chat work end-to-end', async () => {
  resetEdgeIsolateMemoryStore('default');
  const atlasKv = createMockKV();
  const osmKv = createMockKV();
  const env: EdgeEnv = {
    ATLAS_DATA_KV: atlasKv,
    OSM_CACHE_KV: osmKv,
  };

  // 1. Middleware handles OPTIONS preflight with 204 + CORS headers
  const optionsRes = await apiMiddleware(
    createPagesContext(new Request('https://atlas.pages.dev/api/chat', { method: 'OPTIONS' }), env),
  );
  assert.equal(optionsRes.status, 204);
  assert.equal(optionsRes.headers.get('Access-Control-Allow-Origin'), '*');

  // 2. GET /api/overview-config & GET /api/data/schema start empty
  const cfgRes = await onOverviewConfigGet(
    createPagesContext(new Request('https://atlas.pages.dev/api/overview-config?lang=en'), env),
  );
  assert.equal(cfgRes.status, 200);
  const cfgJson = (await cfgRes.json()) as any;
  assert.deepEqual(cfgJson.books, []);
  assert.deepEqual(cfgJson.customEvents, []);

  const schemaRes = await onDataSchemaGet(
    createPagesContext(new Request('https://atlas.pages.dev/api/data/schema'), env),
  );
  assert.equal(schemaRes.status, 200);
  const schemaJson = (await schemaRes.json()) as any;
  assert.equal(schemaJson.schemaVersion, '1.0.0');
  assert.equal(schemaJson.counts.territories, 0);

  // 3. POST /api/data/validate rejects invalid JSON payload -> 400
  const badValRes = await onDataValidatePost(
    createPagesContext(
      new Request('https://atlas.pages.dev/api/data/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'bundle',
          payload: {
            schemaVersion: '1.0.0',
            territories: [
              {
                id: 'terr_missing_lookup',
                nameZh: '缺失反查字段辖区',
                validFrom: -300,
                validTo: -200,
                tier: 'metropolis',
                osmIds: [], // Empty osmIds WITHOUT modernAdminNameEn + approxBBox must fail!
              },
            ],
          },
        }),
      }),
      env,
    ),
  );
  assert.equal(badValRes.status, 400);

  // 4. POST /api/data/import persists into Cloudflare Workers KV (`ATLAS_DATA_KV`)
  const validHanBundle = {
    schemaVersion: '1.0.0',
    prompts: {
      i18n: {
        zh: '【KV 提示词】紧扣关中人口密度与长安夜间灯火作答。',
        en: '[KV Prompt] Focus on Guanzhong population density and Chang’an night lights.',
        de: '[KV-Prompt] Fokus auf Bevölkerungsdichte in Guanzhong und Nachtlichter in Chang’an.',
      },
    },
    polities: [
      {
        id: 'western_han_chang_an',
        nameZh: '西汉（元始二年极盛期）',
        nameEn: 'Western Han Empire (2 CE Census Peak)',
        nameDe: 'Westliche Han-Dynastie (Zensus 2 n. Chr.)',
        eraSubtitle: '关中京畿与丝路东端',
        startYear: -202,
        endYear: 8,
        representativeColor: '#B91C1C',
        borderColor: '#FCA5A5',
        flagId: 'imperial_athens',
        flagLabel: 'HAN',
        capitalName: '长安 (Chang’an)',
        capitalCoords: [108.9398, 34.3416],
        historicalSummary: '《汉书·地理志》元始二年户籍载京兆尹、左冯翊、右扶风三辅高密度聚落。',
        sourceCitation: 'Book of Han (Hanshu) ch. 28',
      },
    ],
    territories: [
      {
        id: 'terr_shaanxi_guanzhong',
        polityId: 'western_han_chang_an',
        nameZh: '三辅关中核心辖区',
        validFrom: -202,
        validTo: 8,
        tier: 'metropolis',
        modernAdminNameEn: 'Xi’an',
        countryCode: 'CN',
        adminLevel: 5,
        osmIds: [], // Valid pre-postprocessed AI output!
        approxBBox: { minLon: 107.6, minLat: 33.7, maxLon: 109.9, maxLat: 34.8 },
      },
    ],
    populationNodes: [
      {
        id: 'pop_changan_2ce',
        nameZh: '长安城与陵邑人口密集带',
        center: [108.94, 34.34],
        radiusDegLon: 0.4,
        radiusDegLat: 0.3,
        validFrom: -150,
        validTo: 8,
        densityKeyframes: [[2, 380]],
        estimatedTotalNote: '三辅户籍人口逾 240 万',
      },
    ],
    nightLightNodes: [
      {
        id: 'nl_changan_weiyang_palace',
        nameZh: '未央宫温室殿与长安九市夜火',
        category: 'urban_lamps',
        coords: [108.91, 34.31],
        spreadDeg: 0.2,
        validFrom: -190,
        validTo: 8,
        intensityKeyframes: [[2, 0.91]],
        description: '汉代铜雁鱼釭灯与宫阙卫尉夜巡火炬群',
      },
    ],
    speciesDiscoveries: [
      {
        id: 'sp_shijing_millet',
        commonNameZh: '黍（黄米先秦农书品系）',
        scientificName: 'Panicum miliaceum',
        classicalGreekName: '黍 / 秬黍 (Shǔ / Jùshǔ)',
        kingdom: 'plantae',
        discovererZh: '《氾胜之书》记述',
        discovererEn: 'Recorded in Fan Shengzhi Shu',
        discoveryYear: -10,
        locationNameZh: '关中渭水流域',
        coords: [108.95, 34.36],
        historicalNote: '西汉农学家氾胜之总结关中区田法中黍的耐旱栽培体系。',
        sourceCitation: 'Fan Shengzhi Shu (c. 1st century BCE)',
      },
    ],
  };

  const importRes = await onDataImportPost(
    createPagesContext(
      new Request('https://atlas.pages.dev/api/data/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'bundle',
          mode: 'merge',
          payload: validHanBundle,
        }),
      }),
      env,
    ),
  );
  assert.equal(importRes.status, 200);
  const importJson = (await importRes.json()) as any;
  assert.equal(importJson.ok, true);
  assert.equal(importJson.persistence, 'cloudflare-kv');
  assert.equal(atlasKv.store.has('atlas:snapshot:v1'), true, 'KV must persist snapshot JSON');

  // 5. GET /api/data/export & POST /api/data/overview-preview read back from Cloudflare KV
  const exportRes = await onDataExportGet(
    createPagesContext(
      new Request('https://atlas.pages.dev/api/data/export?year=2&layer=species_discovery'),
      env,
    ),
  );
  assert.equal(exportRes.status, 200);
  const exportJson = (await exportRes.json()) as any;
  assert.equal(exportJson.speciesDiscoveries.length, 1);
  assert.equal(exportJson.speciesDiscoveries[0].classicalGreekName, '黍 / 秬黍 (Shǔ / Jùshǔ)');

  const previewRes = await onOverviewPreviewPost(
    createPagesContext(
      new Request('https://atlas.pages.dev/api/data/overview-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'zh',
          currentYear: 2,
          selectedRange: [-20, 8],
          activeLayers: ['population_density', 'night_lights', 'species_discovery'],
          selectedRegion: {
            kind: 'bbox',
            nameZh: '关中选区',
            bbox: { minLon: 108.0, minLat: 33.9, maxLon: 109.6, maxLat: 34.8 },
          },
        }),
      }),
      env,
    ),
  );
  assert.equal(previewRes.status, 200);
  const previewJson = (await previewRes.json()) as any;
  assert.equal(previewJson.customSystemPrompt, '【KV 提示词】紧扣关中人口密度与长安夜间灯火作答。');
  assert.equal(previewJson.overview.metrics.peakDensityPerKm2, 380);
  assert.match(previewJson.structuredContext, /黍 \/ 秬黍/);

  // 6. POST /api/chat returns 503 when GEMINI_API_KEY is missing, and 200 when configured
  const missingKeyChatRes = await onChatPost(
    createPagesContext(
      new Request('https://atlas.pages.dev/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language: 'en',
          message: 'Compare Chang’an population density and night lights in 2 CE.',
          mapState: { currentYear: 2, activeLayers: ['population_density', 'night_lights'] },
        }),
      }),
      env, // No GEMINI_API_KEY
    ),
  );
  assert.equal(missingKeyChatRes.status, 503);

  let capturedSystemInstruction = '';
  let capturedPromptText = '';
  const storage = createEdgeStorageAdapter(env);
  const okChatRes = await handleChatRequest(
    new Request('https://atlas.pages.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'en',
        message: 'Analyze Guanzhong density vs palace night lights.',
        mapState: {
          currentYear: 2,
          selectedRange: [-20, 8],
          activeLayers: ['population_density', 'night_lights'],
          selectedRegion: {
            kind: 'bbox',
            nameZh: 'Guanzhong',
            bbox: { minLon: 108.0, minLat: 33.9, maxLon: 109.6, maxLat: 34.8 },
          },
        },
      }),
    }),
    { ...env, GEMINI_API_KEY: 'test-edge-key' },
    storage,
    {
      generateReplyFn: async ({ systemInstruction, contents }) => {
        capturedSystemInstruction = systemInstruction;
        capturedPromptText = contents[contents.length - 1].parts[0].text;
        return 'In 2 CE, Chang’an reached ~380 pers./km² coupled with 91% palace/market oil-lamp radiance.';
      },
    },
  );
  assert.equal(okChatRes.status, 200);
  const okChatJson = (await okChatRes.json()) as any;
  assert.equal(okChatJson.contextMode, 'region');
  assert.match(capturedSystemInstruction, /\[KV Prompt\]/);
  assert.match(capturedPromptText, /Population Density × Nighttime Lights/);

  // 7. GET /api/osm-boundaries caches geometries into `OSM_CACHE_KV` and sets Edge CDN Cache-Control
  const osmFetchRes = await handleOsmBoundariesRequest(
    new Request('https://atlas.pages.dev/api/osm-boundaries?osm_ids=R888001'),
    env,
    {
      chunkDelayMs: 0,
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            type: 'FeatureCollection',
            features: [
              {
                type: 'Feature',
                properties: { osm_type: 'relation', osm_id: 888001 },
                geometry: {
                  type: 'Polygon',
                  coordinates: [
                    [
                      [108.8, 34.2],
                      [109.1, 34.2],
                      [109.1, 34.5],
                      [108.8, 34.5],
                      [108.8, 34.2],
                    ],
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    },
  );
  assert.equal(osmFetchRes.status, 200);
  assert.match(osmFetchRes.headers.get('Cache-Control') || '', /s-maxage=604800/);
  const osmJson = (await osmFetchRes.json()) as any;
  assert.equal(osmJson.boundaries.R888001.type, 'MultiPolygon');
  assert.equal(osmKv.store.has('osm:v1:R888001'), true, 'OSM geometry must be cached in OSM_CACHE_KV');

  // Empty query returns {} directly from Pages Function
  const emptyOsmRes = await onOsmBoundariesGet(
    createPagesContext(new Request('https://atlas.pages.dev/api/osm-boundaries'), env),
  );
  assert.equal(emptyOsmRes.status, 200);
  assert.deepEqual(await emptyOsmRes.json(), { boundaries: {} });
});

test('OSM post-processing script resolves modernAdminNameEn + approxBBox via Nominatim and Overpass fallback', async () => {
  const nomUrl = buildNominatimSearchUrl({
    modernAdminNameEn: 'Attica',
    approxBBox: { minLon: 23.3, minLat: 37.6, maxLon: 24.2, maxLat: 38.4 },
    countryCode: 'GR',
    adminLevel: 5,
  });
  assert.match(nomUrl, /countrycodes=gr/);
  assert.match(nomUrl, /bounded=1/);

  const ovQuery = buildOverpassAdminQuery({
    modernAdminNameEn: 'Lazio',
    approxBBox: { minLon: 11.8, minLat: 41.3, maxLon: 13.5, maxLat: 42.4 },
    adminLevel: 4,
  });
  assert.match(ovQuery, /"boundary"="administrative"/);
  assert.match(ovQuery, /"admin_level"="4"/);

  const preResolvedValidation = validateImportPayload(
    {
      schemaVersion: '1.0.0',
      territories: [
        {
          id: 'terr_attica_ai',
          nameZh: '阿提卡行政区',
          validFrom: -500,
          validTo: -404,
          tier: 'metropolis',
          modernAdminNameEn: 'Attica',
          countryCode: 'GR',
          adminLevel: 5,
          osmIds: [],
          approxBBox: { minLon: 23.3, minLat: 37.6, maxLon: 24.2, maxLat: 38.4 },
        },
        {
          id: 'terr_lazio_ai',
          nameZh: '拉丁姆（拉齐奥）行政区',
          validFrom: -100,
          validTo: 200,
          tier: 'metropolis',
          modernAdminNameEn: 'Lazio',
          countryCode: 'IT',
          adminLevel: 4,
          approxBBox: { minLon: 11.4, minLat: 41.1, maxLon: 14.0, maxLat: 42.9 },
        },
      ],
    },
    'bundle',
  );
  assert.equal(preResolvedValidation.valid, true);

  const report = await resolveTerritoriesInBundle(preResolvedValidation.normalized, {
    rateLimitMs: 0,
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.includes('nominatim.openstreetmap.org') && url.includes('Attica')) {
        return new Response(
          JSON.stringify([
            {
              osm_type: 'node',
              osm_id: 111,
              name: 'Attica',
              boundingbox: ['37.9', '38.0', '23.7', '23.8'],
            },
            {
              osm_type: 'relation',
              osm_id: 957707,
              category: 'boundary',
              type: 'administrative',
              name: 'Attica',
              extratags: { admin_level: '5' },
              boundingbox: ['37.65', '38.34', '23.35', '24.11'],
              importance: 0.78,
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('nominatim.openstreetmap.org') && url.includes('Lazio')) {
        // Simulate empty Nominatim response to trigger Overpass API fallback
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('overpass-api.de')) {
        return new Response(
          JSON.stringify({
            elements: [
              {
                type: 'relation',
                id: 40784,
                bounds: { minlat: 41.18, minlon: 11.44, maxlat: 42.84, maxlon: 13.99 },
                tags: {
                  boundary: 'administrative',
                  admin_level: '4',
                  name: 'Lazio',
                  'name:en': 'Lazio',
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('[]', { status: 200 });
    },
  });

  assert.equal(report.resolvedCount, 2);
  assert.equal(report.unresolvedIds.length, 0);
  assert.deepEqual(report.bundle.territories[0].osmIds, ['R957707']);
  assert.equal(report.items[0].source, 'nominatim');
  assert.deepEqual(report.bundle.territories[1].osmIds, ['R40784']);
  assert.equal(report.items[1].source, 'overpass');
});

test('Pre-Linnaean (< 1735) species validation enforces earliest textual chroniclers, canonical event/text years, and global classicalGreekName', () => {
  // 1. Valid global pre-Linnaean records (Greece, Mesoamerica) + post-1735 Linnaean record
  const validSpeciesRes = validateImportPayload(
    {
      schemaVersion: '1.0.0',
      speciesDiscoveries: [
        {
          id: 'sp_acropolis_olive_480bce',
          commonNameZh: '雅典卫城圣橄榄',
          scientificName: 'Olea europaea',
          classicalGreekName: 'ἐλαία (elaia)',
          kingdom: 'plantae',
          discovererZh: '希罗多德《历史》见证记述',
          discovererEn: 'Recorded by Herodotus (Histories 8.55)',
          discoveryYear: -480,
          locationNameZh: '雅典卫城',
          coords: [23.726, 37.972],
          historicalNote: '波斯焚毁卫城次日圣橄榄一夜抽芽。',
          sourceCitation: 'Herodotus 8.55',
        },
        {
          id: 'sp_mesoamerica_cacao_1577',
          commonNameZh: '中美洲可可树',
          scientificName: 'Theobroma cacao',
          classicalGreekName: 'cacahuatl (Classical Nahuatl)',
          kingdom: 'plantae',
          discovererZh: '贝尔纳迪诺·德·萨阿贡《佛罗伦萨手抄本》记述',
          discovererEn: 'Recorded by Bernardino de Sahagún (Florentine Codex)',
          discoveryYear: 1577,
          locationNameZh: '特诺奇蒂特兰 / 墨西哥谷地',
          coords: [-99.1332, 19.4326],
          historicalNote: '纳瓦特尔语原典记述可可豆饮品与货币用途。',
          sourceCitation: 'Florentine Codex Book 11 (1577)',
        },
      ],
    },
    'bundle',
  );
  assert.equal(validSpeciesRes.valid, true);
  assert.equal(validSpeciesRes.counts.speciesDiscoveries, 2);

  // 2. Rejects fabricated ancient bureaus, "Unknown"/"未知", Year 0, and anachronistic Linnaeus (< 1707)
  const badSpeciesRes = validateImportPayload(
    {
      schemaVersion: '1.0.0',
      speciesDiscoveries: [
        {
          id: 'sp_fake_bureau',
          commonNameZh: '虚构官署测试',
          scientificName: 'Olea europaea',
          classicalGreekName: 'ἐλαία',
          kingdom: 'plantae',
          discovererZh: '雅典农政官署编目',
          discovererEn: 'Imperial Botanical Bureau',
          discoveryYear: -450,
          locationNameZh: '雅典',
          coords: [23.7, 37.9],
          historicalNote: '',
          sourceCitation: '',
        },
        {
          id: 'sp_anachronistic_linnaeus',
          commonNameZh: '时代错置林奈测试',
          scientificName: 'Laurus nobilis',
          classicalGreekName: 'δάφνη',
          kingdom: 'plantae',
          discovererZh: '未知',
          discovererEn: 'Carl Linnaeus',
          discoveryYear: 0,
          locationNameZh: '德尔斐',
          coords: [22.5, 38.48],
          historicalNote: '',
          sourceCitation: '',
        },
      ],
    },
    'bundle',
  );
  assert.equal(badSpeciesRes.valid, false);
  const paths = badSpeciesRes.errors.map((e) => e.path);
  assert.ok(paths.includes('speciesDiscoveries[0].discovererZh'));
  assert.ok(paths.includes('speciesDiscoveries[0].discovererEn'));
  assert.ok(paths.includes('speciesDiscoveries[1].discoveryYear'));
  assert.ok(paths.includes('speciesDiscoveries[1].discovererZh'));
  assert.ok(paths.includes('speciesDiscoveries[1].discovererEn'));
});
