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
import {
  DEFAULT_GEMINI_MODEL,
  handleChatRequest,
  handleOsmBoundariesRequest,
  normalizeRequestedGeminiModel,
} from './apiHandlers';
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

  // 2. GET /api/overview-config & GET /api/data/schema start empty while exposing backend-detected datasets
  const cfgRes = await onOverviewConfigGet(
    createPagesContext(new Request('https://atlas.pages.dev/api/overview-config?lang=en'), env),
  );
  assert.equal(cfgRes.status, 200);
  const cfgJson = (await cfgRes.json()) as any;
  assert.deepEqual(cfgJson.books, []);
  assert.deepEqual(cfgJson.customEvents, []);
  assert.deepEqual(cfgJson.detectedDatasetIds, ['classical_athens', 'roman_principate']);
  assert.equal(cfgJson.datasetsBundle.territories.length, 20);
  assert.equal(cfgJson.datasetsBundle.polities.length, 8);

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
        classicalSourceName: '黍 / 秬黍 (Shǔ / Jùshǔ)',
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
  assert.equal(exportJson.speciesDiscoveries[0].classicalSourceName, '黍 / 秬黍 (Shǔ / Jùshǔ)');

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

  assert.equal(DEFAULT_GEMINI_MODEL, 'gemini-4-hydrogen');
  assert.deepEqual(normalizeRequestedGeminiModel(undefined), {
    ok: true,
    model: 'gemini-4-hydrogen',
  });
  assert.deepEqual(normalizeRequestedGeminiModel('Gemini 4 Argon'), {
    ok: true,
    model: 'gemini-4-argon',
  });
  assert.equal(normalizeRequestedGeminiModel('gemini-1.5-pro').ok, false);

  let capturedSystemInstruction = '';
  let capturedPromptText = '';
  let capturedModel = '';
  let capturedChannelMode = '';
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
      generateReplyFn: async ({ model, channelMode, systemInstruction, contents }) => {
        capturedModel = model;
        capturedChannelMode = channelMode;
        capturedSystemInstruction = systemInstruction;
        capturedPromptText = contents[contents.length - 1].parts[0].text;
        return 'In 2 CE, Chang’an reached ~380 pers./km² coupled with 91% palace/market oil-lamp radiance.';
      },
    },
  );
  assert.equal(okChatRes.status, 200);
  const okChatJson = (await okChatRes.json()) as any;
  assert.equal(okChatJson.contextMode, 'region');
  assert.equal(okChatJson.modelUsed, 'gemini-4-hydrogen');
  assert.equal(okChatJson.channelMode, 'default');
  assert.equal(capturedModel, 'gemini-4-hydrogen');
  assert.equal(capturedChannelMode, 'default');
  assert.match(capturedSystemInstruction, /\[KV Prompt\]/);
  assert.match(capturedPromptText, /Population Density × Nighttime Lights/);

  // 6b. POST /api/chat supports frontend custom API & Gemini model channel even without server GEMINI_API_KEY
  let customCapturedApiKey = '';
  let customCapturedBaseUrl: string | undefined;
  let customCapturedModel = '';
  const customChatRes = await handleChatRequest(
    new Request('https://atlas.pages.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'zh',
        message: '概述罗马元首制海运粮道。',
        aiConfig: {
          mode: 'custom',
          apiKey: 'user-own-gemini-key',
          baseUrl: 'https://custom-gateway.example.com',
          model: 'gemini-4-argon',
        },
        mapState: {
          currentYear: 117,
          activeLayers: ['transport_routes'],
        },
      }),
    }),
    env, // No server GEMINI_API_KEY needed when custom channel is supplied
    storage,
    {
      generateReplyFn: async ({ apiKey, baseUrl, model }) => {
        customCapturedApiKey = apiKey;
        customCapturedBaseUrl = baseUrl;
        customCapturedModel = model;
        return '公元 117 年亚历山大港—波尔图斯海运干线支撑罗马百万人口。';
      },
    },
  );
  assert.equal(customChatRes.status, 200);
  const customChatJson = (await customChatRes.json()) as any;
  assert.equal(customChatJson.channelMode, 'custom');
  assert.equal(customChatJson.modelUsed, 'gemini-4-argon');
  assert.equal(customCapturedApiKey, 'user-own-gemini-key');
  assert.equal(customCapturedBaseUrl, 'https://custom-gateway.example.com');
  assert.equal(customCapturedModel, 'gemini-4-argon');

  // Rejects deprecated models on custom channel with 400
  const deprecatedModelRes = await handleChatRequest(
    new Request('https://atlas.pages.dev/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: 'en',
        message: 'Test deprecated model rejection',
        aiConfig: {
          mode: 'custom',
          apiKey: 'user-own-gemini-key',
          model: 'gemini-1.5-pro',
        },
        mapState: { currentYear: 117, activeLayers: [] },
      }),
    }),
    env,
    storage,
  );
  assert.equal(deprecatedModelRes.status, 400);

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

test('Pre-Linnaean (< 1735) species validation enforces classicalSourceName, rejects legacy classicalGreekName, and validates extensible polity flags', () => {
  // 1. Valid global pre-Linnaean records (Greece, Mesoamerica) + extensible polity flagSvg / flagAsset
  const validSpeciesRes = validateImportPayload(
    {
      schemaVersion: '1.0.0',
      polities: [
        {
          id: 'pol_svg_flag',
          nameZh: '自定义矢量旗政权',
          nameEn: 'Custom SVG Flag Polity',
          eraSubtitle: 'SPQR Banner',
          startYear: -27,
          endYear: 180,
          representativeColor: '#991B1B',
          borderColor: '#F87171',
          flagSvg:
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 40"><rect width="60" height="40" fill="#7F1D1D"/></svg>',
          flagLabel: 'SPQR',
          capitalName: 'Roma',
          capitalCoords: [12.4964, 41.9028],
          historicalSummary: 'Principate Rome with inline SVG vexillum.',
          sourceCitation: 'Tacitus',
        },
        {
          id: 'pol_asset_flag',
          nameZh: '外部图像旗帜政权',
          nameEn: 'Asset Flag Polity',
          eraSubtitle: 'Asset Banner',
          startYear: 1,
          endYear: 100,
          representativeColor: '#1D4ED8',
          borderColor: '#60A5FA',
          flagAsset: 'https://example.com/flags/banner.svg',
          flagLabel: 'ASSET',
          capitalName: 'Alexandria',
          capitalCoords: [29.9187, 31.2001],
          historicalSummary: 'Polity using external flagAsset URL.',
          sourceCitation: 'Strabo',
        },
      ],
      speciesDiscoveries: [
        {
          id: 'sp_acropolis_olive_480bce',
          commonNameZh: '雅典卫城圣橄榄',
          scientificName: 'Olea europaea',
          classicalSourceName: 'ἐλαία (elaia)',
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
          classicalSourceName: 'cacahuatl (Classical Nahuatl)',
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
  assert.equal(validSpeciesRes.counts.polities, 2);
  assert.equal(validSpeciesRes.counts.speciesDiscoveries, 2);

  // 2. Rejects XSS flagSvg, missing flag source, legacy classicalGreekName, fabricated bureaus, "Unknown"/"未知", Year 0, and anachronistic Linnaeus (< 1707)
  const badSpeciesRes = validateImportPayload(
    {
      schemaVersion: '1.0.0',
      polities: [
        {
          id: 'pol_xss_flag',
          nameZh: '恶意脚本旗帜',
          nameEn: 'XSS Flag',
          eraSubtitle: '',
          startYear: 1,
          endYear: 50,
          representativeColor: '#991B1B',
          borderColor: '#F87171',
          flagSvg: '<svg onload="alert(1)"><script>evil()</script></svg>',
          flagLabel: 'XSS',
          capitalName: 'Roma',
          capitalCoords: [12.5, 41.9],
          historicalSummary: '',
          sourceCitation: '',
        },
      ],
      speciesDiscoveries: [
        {
          id: 'sp_fake_bureau',
          commonNameZh: '虚构官署测试',
          scientificName: 'Olea europaea',
          classicalGreekName: 'ἐλαία', // Legacy field name must be rejected
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
          classicalSourceName: 'δάφνη',
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
  assert.ok(paths.includes('polities[0].flagSvg'), 'must reject XSS inline SVG flag');
  assert.ok(
    paths.includes('speciesDiscoveries[0].classicalSourceName'),
    'must reject legacy classicalGreekName when classicalSourceName is missing',
  );
  assert.ok(paths.includes('speciesDiscoveries[0].discovererZh'));
  assert.ok(paths.includes('speciesDiscoveries[0].discovererEn'));
  assert.ok(paths.includes('speciesDiscoveries[1].discoveryYear'));
  assert.ok(paths.includes('speciesDiscoveries[1].discovererZh'));
  assert.ok(paths.includes('speciesDiscoveries[1].discovererEn'));
});

test('OSM Edge KV composite batch fast-path resolves multi-ID requests in 1 single KV read on cold Workers isolates while preserving osm:v1:* keys', async () => {
  const { clearEdgeOsmIsolateCache, resolveOsmBoundariesOnEdge } = await import(
    './osmEdgeService'
  );
  clearEdgeOsmIsolateCache();

  let kvGetCalls = 0;
  const rawStore = new Map<string, string>();
  const instrumentedKv: KVNamespaceLike = {
    async get(key: string, type?: 'text' | 'json'): Promise<any> {
      kvGetCalls++;
      const val = rawStore.get(key) ?? null;
      if (val === null) return null;
      return type === 'json' ? JSON.parse(val) : val;
    },
    async put(key: string, value: string): Promise<void> {
      rawStore.set(key, value);
    },
    async delete(key: string): Promise<void> {
      rawStore.delete(key);
    },
  };

  let upstreamFetchCalls = 0;
  const mockFetch: typeof fetch = async () => {
    upstreamFetchCalls++;
    return new Response(
      JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { osm_type: 'relation', osm_id: 991001 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [23.6, 37.9],
                  [23.8, 37.9],
                  [23.8, 38.0],
                  [23.6, 38.0],
                  [23.6, 37.9],
                ],
              ],
            },
          },
          {
            type: 'Feature',
            properties: { osm_type: 'relation', osm_id: 991002 },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [23.8, 37.9],
                  [24.0, 37.9],
                  [24.0, 38.0],
                  [23.8, 38.0],
                  [23.8, 37.9],
                ],
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  // Warm run: populates both osm:v1:R991001, osm:v1:R991002 AND composite osm:batch:v1:*
  const warmResult = await resolveOsmBoundariesOnEdge(
    ['R991001', 'R991002'],
    { OSM_CACHE_KV: instrumentedKv },
    { fetchImpl: mockFetch, chunkDelayMs: 0 },
  );
  assert.equal(Object.keys(warmResult).length, 2);
  assert.equal(upstreamFetchCalls, 1);
  assert.equal(rawStore.has('osm:v1:R991001'), true);
  assert.equal(rawStore.has('osm:v1:R991002'), true);
  assert.equal(
    Array.from(rawStore.keys()).some((k) => k.startsWith('osm:batch:v1:2:')),
    true,
    'Composite batch KV key must be written',
  );

  // Cold isolate simulation: clear L1 isolate memory, reset KV counter, request in reversed order
  clearEdgeOsmIsolateCache();
  kvGetCalls = 0;

  const coldIsolateResult = await resolveOsmBoundariesOnEdge(
    ['R991002', 'R991001'],
    { OSM_CACHE_KV: instrumentedKv },
    {
      fetchImpl: async () => {
        throw new Error('Upstream Nominatim should never be called on KV batch hit');
      },
      chunkDelayMs: 0,
    },
  );
  assert.equal(Object.keys(coldIsolateResult).length, 2);
  assert.equal(
    kvGetCalls,
    1,
    `Cold Workers isolate should hydrate entire parcel batch in 1 single KV read, got ${kvGetCalls}`,
  );
});

