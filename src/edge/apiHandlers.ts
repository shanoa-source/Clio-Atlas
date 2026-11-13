import { GoogleGenAI } from '@google/genai';
import {
  getBasePolityLayerName,
  getOverlayLayerName,
  normalizeAppLanguage,
} from '../i18n/translations';
import {
  computeDatasetYearBounds,
  getAtlasDatasetPresets,
  getBackendDetectedDatasetSummary,
} from '../shared/atlasDataLayer';
import {
  BUNDLE_COLLECTION_KEYS,
  BundleCollectionKey,
  filterSnapshotData,
  ImportMode,
  ImportTarget,
  resolveExternalConfigFromSnapshot,
  validateImportPayload,
} from '../shared/dataValidator';
import {
  AppLanguage,
  GeoBBox,
  MapRegionSelection,
  OverlayLayerId,
  TimeRangeSelection,
} from '../types/history';
import {
  extractRegionOverview,
  formatContextForPrompt,
} from '../utils/regionSelector';
import { OsmEdgeServiceOptions, resolveOsmBoundariesOnEdge } from './osmEdgeService';
import { createEdgeStorageAdapter } from './storage';
import { AtlasStorageAdapter, EdgeEnv } from './types';

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function safeParseJsonBody(request: Request): Promise<any> {
  try {
    const text = await request.text();
    if (!text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isValidRegionSelection(val: any): val is MapRegionSelection {
  if (!val || typeof val !== 'object' || !val.bbox || typeof val.bbox !== 'object') {
    return false;
  }
  const { minLon, minLat, maxLon, maxLat } = val.bbox;
  if (
    typeof minLon !== 'number' ||
    typeof minLat !== 'number' ||
    typeof maxLon !== 'number' ||
    typeof maxLat !== 'number'
  ) {
    return false;
  }
  if (val.kind === 'territory') {
    return typeof val.territoryId === 'string' && typeof val.nameZh === 'string';
  }
  if (val.kind === 'bbox') {
    return typeof val.nameZh === 'string';
  }
  if (val.kind === 'circle') {
    return (
      Array.isArray(val.center) &&
      val.center.length === 2 &&
      typeof val.radiusKm === 'number'
    );
  }
  return false;
}

function parseImportTarget(raw: unknown): ImportTarget {
  if (raw === 'events' || raw === 'books' || raw === 'prompts' || raw === 'bundle') {
    return raw;
  }
  return 'bundle';
}

function parseImportMode(raw: unknown): ImportMode {
  return raw === 'replace' ? 'replace' : 'merge';
}

function parseOptionalInt(val: string | null): number | undefined {
  if (val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isInteger(n) ? n : undefined;
}

function parseOptionalFloat(val: string | null): number | undefined {
  if (val === null || val === '') return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';

const DEPRECATED_GEMINI_MODEL_PATTERN =
  /^(gemini-1\.5(?:-|$)|gemini-2\.0(?:-|$)|gemini-pro$)/i;

const GEMINI_MODEL_ALIASES: Record<string, string> = {
  'gemini flash': 'gemini-4-hydrogen',
  'gemini 4 flash': 'gemini-4-hydrogen',
  'gemini hydrogen': 'gemini-4-hydrogen',
  'gemini 4 hydrogen': 'gemini-4-hydrogen',
  'gemini-4-hydrogen': 'gemini-4-hydrogen',
  'gemini lite': 'gemini-3.1-flash-lite',
  'flash lite': 'gemini-3.1-flash-lite',
  'gemini 3.1 flash lite': 'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'gemini carbon': 'gemini-4-carbon',
  'gemini 4 carbon': 'gemini-4-carbon',
  'gemini-4-carbon': 'gemini-4-carbon',
  'gemini pro': 'gemini-4-argon',
  'gemini 4': 'gemini-4-argon',
  'gemini argon': 'gemini-4-argon',
  'gemini 4 argon': 'gemini-4-argon',
  'gemini-4-argon': 'gemini-4-argon',
};

export function normalizeRequestedGeminiModel(
  rawModel: unknown,
): { ok: true; model: string } | { ok: false; reason: 'deprecated' | 'invalid' } {
  if (typeof rawModel !== 'string' || !rawModel.trim()) {
    return { ok: true, model: DEFAULT_GEMINI_MODEL };
  }
  const trimmed = rawModel.trim();
  const lower = trimmed.toLowerCase().replace(/\s+/g, ' ');
  if (GEMINI_MODEL_ALIASES[lower]) {
    return { ok: true, model: GEMINI_MODEL_ALIASES[lower] };
  }
  if (DEPRECATED_GEMINI_MODEL_PATTERN.test(trimmed)) {
    return { ok: false, reason: 'deprecated' };
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,95}$/.test(trimmed)) {
    return { ok: false, reason: 'invalid' };
  }
  return { ok: true, model: trimmed };
}

function createEdgeGeminiClient(apiKey: string, baseUrl?: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(baseUrl ? { baseUrl } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * `GET /api/overview-config`
 */
export async function handleOverviewConfigRequest(
  request: Request,
  env: EdgeEnv = {},
  storage: AtlasStorageAdapter = createEdgeStorageAdapter(env),
): Promise<Response> {
  const url = new URL(request.url);
  const lang = normalizeAppLanguage(url.searchParams.get('lang') ?? undefined);
  const snapshot = await storage.getSnapshot();
  const detected = storage.getDetectedDatasets
    ? await storage.getDetectedDatasets()
    : getBackendDetectedDatasetSummary();
  const { books, customEvents, bundle } = resolveExternalConfigFromSnapshot(snapshot, lang);
  return jsonResponse({
    books,
    customEvents,
    bundle,
    detectedDatasetIds: detected.datasetIds,
    datasetsBundle: detected.mergedBundle,
  });
}

/**
 * `GET /api/data/schema`
 */
export async function handleDataSchemaRequest(
  _request: Request,
  env: EdgeEnv = {},
  storage: AtlasStorageAdapter = createEdgeStorageAdapter(env),
): Promise<Response> {
  try {
    const catalog = await storage.getSchemaCatalog();
    return jsonResponse(catalog);
  } catch (err: any) {
    return jsonResponse(
      {
        error: 'Failed to read JSON schema catalog',
        detail: err?.message || String(err),
      },
      500,
    );
  }
}

/**
 * `POST /api/data/validate`
 */
export async function handleDataValidateRequest(
  request: Request,
  _env: EdgeEnv = {},
): Promise<Response> {
  const url = new URL(request.url);
  const body = await safeParseJsonBody(request);
  if (body === null) {
    return jsonResponse({ valid: false, errors: [{ path: '', message: 'Invalid JSON body.' }] }, 400);
  }

  const hasEnvelope = body && typeof body === 'object' && 'payload' in body;
  const target = parseImportTarget(hasEnvelope ? body.target : url.searchParams.get('target'));
  const payload = hasEnvelope ? body.payload : body;
  const result = validateImportPayload(payload, target);
  return jsonResponse(result, result.valid ? 200 : 400);
}

/**
 * `POST /api/data/import`
 */
export async function handleDataImportRequest(
  request: Request,
  env: EdgeEnv = {},
  storage: AtlasStorageAdapter = createEdgeStorageAdapter(env),
): Promise<Response> {
  const url = new URL(request.url);
  const body = await safeParseJsonBody(request);
  if (body === null) {
    return jsonResponse(
      { ok: false, errors: [{ path: '', message: 'Invalid JSON body.' }] },
      400,
    );
  }

  const hasEnvelope = body && typeof body === 'object' && 'payload' in body;
  const target = parseImportTarget(hasEnvelope ? body.target : url.searchParams.get('target'));
  const mode = parseImportMode(hasEnvelope ? body.mode : url.searchParams.get('mode'));
  const queryDry = url.searchParams.get('dryRun');
  const dryRun = Boolean(
    hasEnvelope ? body.dryRun : queryDry === 'true' || queryDry === '1',
  );
  const payload = hasEnvelope ? body.payload : body;

  const outcome = await storage.commitImport({
    payload,
    target,
    mode,
    dryRun,
  });

  return jsonResponse(outcome, outcome.ok ? 200 : 400);
}

/**
 * `GET /api/data/export`
 */
export async function handleDataExportRequest(
  request: Request,
  env: EdgeEnv = {},
  storage: AtlasStorageAdapter = createEdgeStorageAdapter(env),
): Promise<Response> {
  const url = new URL(request.url);
  const rawCollection = url.searchParams.get('collection') || undefined;
  const collection =
    rawCollection && BUNDLE_COLLECTION_KEYS.includes(rawCollection as BundleCollectionKey)
      ? (rawCollection as BundleCollectionKey)
      : undefined;

  if (rawCollection && !collection) {
    return jsonResponse(
      {
        error: `Unsupported collection "${rawCollection}". Valid collections: ${BUNDLE_COLLECTION_KEYS.join(', ')}.`,
      },
      400,
    );
  }

  const minLon = parseOptionalFloat(url.searchParams.get('minLon'));
  const minLat = parseOptionalFloat(url.searchParams.get('minLat'));
  const maxLon = parseOptionalFloat(url.searchParams.get('maxLon'));
  const maxLat = parseOptionalFloat(url.searchParams.get('maxLat'));

  let bbox: GeoBBox | undefined;
  if (
    minLon !== undefined &&
    minLat !== undefined &&
    maxLon !== undefined &&
    maxLat !== undefined
  ) {
    bbox = { minLon, minLat, maxLon, maxLat };
  }

  const snapshot = await storage.getSnapshot();
  const layerParam = url.searchParams.get('layer');
  const data = filterSnapshotData(snapshot, {
    collection,
    year: parseOptionalInt(url.searchParams.get('year')),
    startYear: parseOptionalInt(url.searchParams.get('startYear')),
    endYear: parseOptionalInt(url.searchParams.get('endYear')),
    bbox,
    layer: layerParam ? (layerParam as OverlayLayerId) : undefined,
  });

  return jsonResponse(data);
}

/**
 * `POST /api/data/overview-preview`
 */
export async function handleOverviewPreviewRequest(
  request: Request,
  env: EdgeEnv = {},
  storage: AtlasStorageAdapter = createEdgeStorageAdapter(env),
): Promise<Response> {
  const body = (await safeParseJsonBody(request)) ?? {};
  const language: AppLanguage = normalizeAppLanguage(body.language);
  const defaultYear =
    getAtlasDatasetPresets()[0]?.defaultYear ?? computeDatasetYearBounds()?.minYear ?? 1;
  const currentYear =
    typeof body.currentYear === 'number' && Number.isFinite(body.currentYear)
      ? Math.round(body.currentYear)
      : defaultYear;
  const selectedRange: TimeRangeSelection =
    Array.isArray(body.selectedRange) &&
    body.selectedRange.length === 2 &&
    typeof body.selectedRange[0] === 'number' &&
    typeof body.selectedRange[1] === 'number'
      ? [body.selectedRange[0], body.selectedRange[1]]
      : null;
  const activeLayers: OverlayLayerId[] = Array.isArray(body.activeLayers)
    ? body.activeLayers.filter((x: unknown): x is OverlayLayerId => typeof x === 'string')
    : [];
  const selectedRegion: MapRegionSelection | null = isValidRegionSelection(body.selectedRegion)
    ? body.selectedRegion
    : null;

  const snapshot = await storage.getSnapshot();
  const { customSystemPrompt, books, customEvents, bundle } = resolveExternalConfigFromSnapshot(
    snapshot,
    language,
  );

  const overview = extractRegionOverview({
    currentYear,
    selectedRange,
    activeLayers,
    selectedRegion,
    customEvents,
    importedBundle: bundle,
    language,
  });

  const structuredContext = formatContextForPrompt(overview, books, language);
  return jsonResponse({
    language,
    customSystemPrompt,
    overview,
    structuredContext,
  });
}

export interface ChatHandlerOptions {
  generateReplyFn?: (params: {
    apiKey: string;
    baseUrl?: string;
    model: string;
    channelMode: 'default' | 'custom';
    systemInstruction: string;
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  }) => Promise<string>;
}

/**
 * `POST /api/chat` — Region-Aware & Multi-Layer Coupled Historical AI Chat Endpoint
 */
export async function handleChatRequest(
  request: Request,
  env: EdgeEnv = {},
  storage: AtlasStorageAdapter = createEdgeStorageAdapter(env),
  options: ChatHandlerOptions = {},
): Promise<Response> {
  const body = (await safeParseJsonBody(request)) ?? {};
  const mapState = body?.mapState ?? {};
  const language: AppLanguage = normalizeAppLanguage(body?.language ?? mapState.language);

  try {
    const rawMessage = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!rawMessage) {
      const emptyErr =
        language === 'en'
          ? 'Please enter a valid question.'
          : language === 'de'
            ? 'Bitte geben Sie eine gültige Frage ein.'
            : '请输入有效的问题内容。';
      return jsonResponse({ error: emptyErr }, 400);
    }

    const rawAiConfig =
      body?.aiConfig && typeof body.aiConfig === 'object' ? body.aiConfig : null;
    const channelMode: 'default' | 'custom' =
      rawAiConfig?.mode === 'custom' ? 'custom' : 'default';

    const requestedModelCheck =
      channelMode === 'custom'
        ? normalizeRequestedGeminiModel(rawAiConfig?.model)
        : { ok: true as const, model: DEFAULT_GEMINI_MODEL };

    if (!requestedModelCheck.ok) {
      const modelErr =
        requestedModelCheck.reason === 'deprecated'
          ? language === 'en'
            ? 'This legacy Gemini model is deprecated and unsupported. Please choose Gemini 4 Hydrogen, Gemini 4 Argon, Gemini 4 Carbon, or Gemini 3.1 Flash Lite.'
            : language === 'de'
              ? 'Dieses ältere Gemini-Modell wird nicht mehr unterstützt. Bitte wählen Sie Gemini 4 Hydrogen, Gemini 4 Argon, Gemini 4 Carbon oder Gemini 3.1 Flash Lite.'
              : '该旧版 Gemini 模型已废弃且不再支持，请切换为 Gemini 4 Hydrogen、Gemini 4 Argon、Gemini 4 Carbon 或 Gemini 3.1 Flash Lite。'
          : language === 'en'
            ? 'Invalid Gemini model identifier format.'
            : language === 'de'
              ? 'Ungültiges Gemini-Modellformat.'
              : '自定义 Gemini 模型名称格式无效。';
      return jsonResponse({ error: modelErr }, 400);
    }

    const effectiveModel = requestedModelCheck.model;

    let effectiveBaseUrl: string | undefined;
    if (channelMode === 'custom' && typeof rawAiConfig?.baseUrl === 'string') {
      const trimmedUrl = rawAiConfig.baseUrl.trim();
      if (trimmedUrl) {
        try {
          const parsedUrl = new URL(trimmedUrl);
          if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
            throw new Error('protocol');
          }
          effectiveBaseUrl = trimmedUrl.replace(/\/+$/, '');
        } catch {
          const urlErr =
            language === 'en'
              ? 'Invalid custom API Base URL. Must start with https:// or http://.'
              : language === 'de'
                ? 'Ungültige benutzerdefinierte API-Basis-URL. Muss mit https:// oder http:// beginnen.'
                : '自定义 API 端点地址无效，请填写以 https:// 或 http:// 开头的完整 URL。';
          return jsonResponse({ error: urlErr }, 400);
        }
      }
    }

    const serverApiKey = typeof env.GEMINI_API_KEY === 'string' ? env.GEMINI_API_KEY.trim() : '';
    const customApiKey =
      channelMode === 'custom' && typeof rawAiConfig?.apiKey === 'string'
        ? rawAiConfig.apiKey.trim()
        : '';
    const apiKey = channelMode === 'custom' ? customApiKey || serverApiKey : serverApiKey;

    if (!apiKey) {
      const keyErr =
        channelMode === 'custom'
          ? language === 'en'
            ? 'Custom channel has no API key provided and server GEMINI_API_KEY is unset. Enter your Gemini API key in the AI Channel panel.'
            : language === 'de'
              ? 'Für den benutzerdefinierten Kanal wurde kein API-Schlüssel angegeben und GEMINI_API_KEY fehlt auf dem Server.'
              : '自定义通道未填写 API Key 且服务端未配置默认密钥，请在 AI 模型通道配置中填入您的 Gemini API Key。'
          : language === 'en'
            ? 'GEMINI_API_KEY is missing on the server. Configure GEMINI_API_KEY in Cloudflare Pages Secrets, or switch to Custom API & Model channel.'
            : language === 'de'
              ? 'GEMINI_API_KEY fehlt auf dem Server. Konfigurieren Sie die Secrets oder wechseln Sie zum benutzerdefinierten API-Kanal.'
              : '服务端未检测到默认 GEMINI_API_KEY，请在服务端环境变量中配置密钥，或在右上角切换至「自定义 API 与模型通道」。';
      return jsonResponse({ error: keyErr }, channelMode === 'custom' ? 400 : 503);
    }

    const defaultYear =
      getAtlasDatasetPresets()[0]?.defaultYear ?? computeDatasetYearBounds()?.minYear ?? 1;
    const currentYear =
      typeof mapState.currentYear === 'number' && Number.isFinite(mapState.currentYear)
        ? Math.round(mapState.currentYear)
        : defaultYear;

    const selectedRange: TimeRangeSelection =
      Array.isArray(mapState.selectedRange) &&
      mapState.selectedRange.length === 2 &&
      typeof mapState.selectedRange[0] === 'number' &&
      typeof mapState.selectedRange[1] === 'number'
        ? [mapState.selectedRange[0], mapState.selectedRange[1]]
        : null;

    const activeLayers: OverlayLayerId[] = Array.isArray(mapState.activeLayers)
      ? mapState.activeLayers.filter((x: unknown): x is OverlayLayerId => typeof x === 'string')
      : [];

    const hasSelectedRegion = isValidRegionSelection(mapState.selectedRegion);
    const selectedRegion: MapRegionSelection | null = hasSelectedRegion
      ? mapState.selectedRegion
      : null;

    const snapshot = await storage.getSnapshot();
    const { customSystemPrompt, books, customEvents, bundle } = resolveExternalConfigFromSnapshot(
      snapshot,
      language,
    );

    const overview = extractRegionOverview({
      currentYear,
      selectedRange,
      activeLayers,
      selectedRegion,
      customEvents,
      importedBundle: bundle,
      language,
    });

    const structuredContext = formatContextForPrompt(overview, books, language);

    const overlaidLabels = activeLayers
      .map((id) => getOverlayLayerName(id, language))
      .join(' + ');
    const baseLayerLabel = getBasePolityLayerName(language);

    let baseInstruction: string;
    let userPromptHeader: string;

    if (language === 'en') {
      const spatialScopeRule = hasSelectedRegion
        ? '1. Spatial & Temporal Boundary: The user has explicitly selected a map region via Box/Circle. Answer strictly around the [Selected Region + Active Year/Interval] in the context below; if the question goes outside the selection, note that explicitly before giving brief context.'
        : '1. Spatial & Temporal Boundary: No specific region is selected; answer around the [Global Timeline Year/Interval] in the context below.';
      const layerCorrelationRule =
        activeLayers.length > 0
          ? `2. Overlaid Layer Correlation (Critical): The user has overlaid [${overlaidLabels}]. Your analysis MUST be strongly correlated with [${overlaidLabels}], centering on their quantitative metrics, spatial gradients, and cross-layer coupling (e.g., when Population Density + Nighttime Lights are overlaid together, contrast settlement densities in pers./km² with urban oil lamps, harbor beacons, and 24h smelting furnaces).`
          : `2. Layer Focus: Only the baseline [${baseLayerLabel}] layer is active; focus on polity evolution, provincial/league territories, and major historical events.`;
      const styleRule =
        '3. Language & Style: You MUST respond strictly in English. Cite exact years, locations, quantitative figures, and primary sources concisely (around 150–260 words unless asked for more).';
      baseInstruction = [
        'You are a rigorous scholar of historical geography and Classical civilizations.',
        spatialScopeRule,
        layerCorrelationRule,
        styleRule,
      ].join('\n');
      userPromptHeader = `[User Question (Respond in English, tightly correlated with the spatial scope, timeframe, and active layers "${overlaidLabels || baseLayerLabel}")]`;
    } else if (language === 'de') {
      const spatialScopeRule = hasSelectedRegion
        ? '1. Räumliche & Zeitliche Eingrenzung: Der Nutzer hat per Rechteck/Kreis ein Kartengebiet ausgewählt. Antworten Sie strikt bezogen auf [Ausgewähltes Gebiet + Aktuelles Jahr/Zeitraum] im Kontext unten; falls die Frage darüber hinausgeht, weisen Sie zuerst ausdrücklich darauf hin.'
        : '1. Räumliche & Zeitliche Eingrenzung: Kein Teilgebiet ist ausgewählt; antworten Sie bezogen auf das [Globale Zeitleistenjahr / Zeitraum] im Kontext unten.';
      const layerCorrelationRule =
        activeLayers.length > 0
          ? `2. Strikte Ebenenkorrelation (Kernanforderung): Der Nutzer hat [${overlaidLabels}] überlagert. Ihre Analyse MUSS eng mit [${overlaidLabels}] verknüpft sein und deren Messwerte, räumliche Gradienten sowie Wechselwirkungen in den Mittelpunkt stellen (z. B. bei Bevölkerungsdichte + Nachtbeleuchtung: Zusammenhang zwischen Einw./km², städtischen Öllampen, Hafenleuchtfeuern und 24h-Schmelzöfen).`
          : `2. Ebenen-Fokus: Nur die Basisebene [${baseLayerLabel}] ist aktiv; fokussieren Sie sich auf Herrschaftsphasen, Provinzen/Bündnisgebiete und zentrale Ereignisse.`;
      const styleRule =
        '3. Sprache & Stil: Antworten Sie AUSSCHLIESSLICH auf Deutsch. Zitieren Sie präzise Jahreszahlen, Orte, Messwerte und antike Quellen klar und prägnant (ca. 150–260 Wörter, sofern nicht ausführlicher gewünscht).';
      baseInstruction = [
        'Sie sind ein präziser Historiker für Historische Geographie und antike Zivilisationen.',
        spatialScopeRule,
        layerCorrelationRule,
        styleRule,
      ].join('\n');
      userPromptHeader = `[Nutzerfrage (Bitte auf Deutsch antworten, eng verknüpft mit Zeitraum, Raumbezug und aktiven Ebenen „${overlaidLabels || baseLayerLabel}“)]`;
    } else {
      const spatialScopeRule = hasSelectedRegion
        ? '1. 空间与时间边界约束：当前用户已通过框选/画圈划定特定地理区域。请严格围绕下方上下文中的【选中区域坐标范围 + 当前时间点/时间段】作答；若问题涉及选区或时间段之外的内容，请先明确指出其不在当前选区/时间范围内，再作简要补充。'
        : '1. 空间与时间边界约束：当前用户未框选特定区域，请严格围绕下方上下文中的【当前全局时间轴年份/时间段】作答。';
      const layerCorrelationRule =
        activeLayers.length > 0
          ? `2. 叠加图层强相关约束（核心要求）：当前用户在地图上叠加开启了【${overlaidLabels}】图层。你的回答必须与【${overlaidLabels}】强相关，以这组激活图层的具体指标、空间梯度与相互耦合关系作为核心论述主线（例如当「人口密度 + 夜晚光照」同时叠加时，必须紧扣各聚落人口密度（人/km²）与城区油灯、港口航标、昼夜冶炼炉夜间光强（%）的对应关系与局部分异展开分析），不要偏离去堆砌未开启图层的无关信息。`
          : '2. 图层聚焦约束：当前仅开启基础【政权与历史旗帜】底图，请围绕政权阶段演进、行省/同盟疆域控制与核心历史事件展开分析。';
      const styleRule =
        '3. 语言与表述规范：必须使用简体中文作答；优先引用上下文中的具体年份、地名、量化数值与文献出处，条理清晰、客观精炼（控制在 180–320 字以内，除非用户要求详述）。';
      baseInstruction = [
        '你是一位严谨的历史地理与人类文明演进时空分析学者。',
        spatialScopeRule,
        layerCorrelationRule,
        styleRule,
      ].join('\n');
      userPromptHeader = `【用户提问（请用简体中文，结合当前空间范围、时间范围及叠加图层「${
        overlaidLabels || baseLayerLabel
      }」强相关作答）】`;
    }

    const systemInstruction = customSystemPrompt
      ? `${customSystemPrompt}\n\n${baseInstruction}`
      : baseInstruction;

    const rawHistory = Array.isArray(body?.history) ? body.history.slice(-8) : [];
    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
    for (const item of rawHistory) {
      if (
        item &&
        (item.role === 'user' || item.role === 'model') &&
        typeof item.text === 'string' &&
        item.text.trim()
      ) {
        contents.push({
          role: item.role,
          parts: [{ text: item.text.trim() }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [
        {
          text: `${structuredContext}\n\n${userPromptHeader}\n${rawMessage}`,
        },
      ],
    });

    let replyText = '';
    if (options.generateReplyFn) {
      replyText = (
        await options.generateReplyFn({
          apiKey,
          baseUrl: effectiveBaseUrl,
          model: effectiveModel,
          channelMode,
          systemInstruction,
          contents,
        })
      ).trim();
    } else {
      const ai = createEdgeGeminiClient(apiKey, effectiveBaseUrl);
      const response = await ai.models.generateContent({
        model: effectiveModel,
        contents,
        config: {
          systemInstruction,
        },
      });
      replyText = (response.text ?? '').trim();
    }

    const fallbackReply =
      language === 'en'
        ? 'No valid response was generated. Please try again.'
        : language === 'de'
          ? 'Keine gültige Antwort generiert. Bitte erneut versuchen.'
          : '未生成有效回答，请稍后重试。';

    return jsonResponse({
      reply: replyText || fallbackReply,
      modelUsed: effectiveModel,
      channelMode,
      contextMode: hasSelectedRegion ? 'region' : 'global',
      regionTitleZh: overview.regionTitleZh,
      activeLayerSummaryZh: overlaidLabels || baseLayerLabel,
      matchedEventCount: overview.events.length,
      language,
    });
  } catch (err: any) {
    const msg = String(err?.message || err || '');
    let userFacingError =
      language === 'en'
        ? 'AI service request failed. Please try again.'
        : language === 'de'
          ? 'KI-Anfrage fehlgeschlagen. Bitte erneut versuchen.'
          : 'AI 服务请求失败，请稍后重试。';
    if (
      msg.includes('API_KEY_INVALID') ||
      msg.includes('PERMISSION_DENIED') ||
      msg.includes('API key not valid') ||
      err?.status === 403
    ) {
      userFacingError =
        language === 'en'
          ? 'Invalid or unauthorized Gemini API key. Check your Custom API Key or server GEMINI_API_KEY.'
          : language === 'de'
            ? 'Ungültiger Gemini-API-Schlüssel. Bitte prüfen Sie Ihren API-Schlüssel.'
            : 'Gemini API 密钥无效或权限不足，请检查自定义 API Key 或服务端 GEMINI_API_KEY 配置。';
    } else if (msg.includes('RESOURCE_EXHAUSTED') || err?.status === 429) {
      userFacingError =
        language === 'en'
          ? 'API quota exceeded (429). Please retry shortly or configure a higher-quota key.'
          : language === 'de'
            ? 'API-Kontingent erschöpft (429). Bitte später erneut versuchen.'
            : '当前 API 调用配额已达上限（429），请稍后重试或切换高配额密钥。';
    } else if (msg) {
      userFacingError =
        language === 'en'
          ? `AI request error: ${msg.slice(0, 180)}`
          : language === 'de'
            ? `KI-Fehler: ${msg.slice(0, 180)}`
            : `AI 对话请求异常：${msg.slice(0, 180)}`;
    }
    return jsonResponse({ error: userFacingError }, 500);
  }
}

/**
 * `GET /api/osm-boundaries`
 */
export async function handleOsmBoundariesRequest(
  request: Request,
  env: EdgeEnv = {},
  options: OsmEdgeServiceOptions = {},
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawParam = url.searchParams.get('osm_ids') || '';
    const requestedIds = Array.from(
      new Set(
        rawParam
          .split(',')
          .map((s) => s.trim().toUpperCase())
          .filter((s) => /^[RW]\d+$/.test(s)),
      ),
    );

    if (requestedIds.length === 0) {
      return jsonResponse({ boundaries: {} });
    }

    const boundaries = await resolveOsmBoundariesOnEdge(requestedIds, env, options);
    return jsonResponse({ boundaries }, 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    });
  } catch (err: any) {
    return jsonResponse(
      {
        error: 'Failed to retrieve OpenStreetMap boundary geometry',
        detail: err?.message || String(err),
      },
      502,
    );
  }
}
