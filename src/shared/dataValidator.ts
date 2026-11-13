import {
  AppLanguage,
  AtlasImportBundle,
  BookListItem,
  CustomHistoricalEvent,
  FlagVariantId,
  GeoBBox,
  ImportedMortalityCatastropheRecord,
  ImportedNightLightNodeRecord,
  ImportedPolityRecord,
  ImportedPopulationNodeRecord,
  ImportedSpaceMissionRecord,
  ImportedSpeciesDiscoveryRecord,
  ImportedTerritoryRecord,
  ImportedTransportRouteRecord,
  LocalizedStringMap,
  OverlayLayerId,
  SystemPromptConfig,
  TerritoryTier,
  ThermalSubZone,
} from '../types/history';

export type ImportTarget = 'bundle' | 'events' | 'books' | 'prompts';
export type ImportMode = 'merge' | 'replace';

export type BundleCollectionKey =
  | 'polities'
  | 'territories'
  | 'populationNodes'
  | 'nightLightNodes'
  | 'transportRoutes'
  | 'speciesDiscoveries'
  | 'mortalityCatastrophes'
  | 'spaceMissions'
  | 'books'
  | 'customEvents';

export const BUNDLE_COLLECTION_KEYS: BundleCollectionKey[] = [
  'polities',
  'territories',
  'populationNodes',
  'nightLightNodes',
  'transportRoutes',
  'speciesDiscoveries',
  'mortalityCatastrophes',
  'spaceMissions',
  'books',
  'customEvents',
];

const VALID_OVERLAY_LAYERS = new Set<OverlayLayerId>([
  'population_density',
  'night_lights',
  'transport_routes',
  'species_discovery',
  'mortality_catastrophe',
  'space_race',
]);

const VALID_FLAG_IDS = new Set<FlagVariantId>([
  'archaic_owl',
  'delian_alliance',
  'imperial_athens',
  'strategoi_wartime',
  'ionian_siege',
]);

const VALID_TERRITORY_TIERS = new Set<TerritoryTier>([
  'metropolis',
  'cleruchy',
  'allied_tribute',
]);

const VALID_NIGHT_CATEGORIES = new Set([
  'urban_lamps',
  'harbor_beacon',
  'smelting_furnace',
  'sanctuary_flame',
]);

const VALID_ROUTE_TYPES = new Set(['maritime', 'overland']);
const VALID_KINGDOMS = new Set(['plantae', 'animalia']);
const VALID_CAUSE_CATEGORIES = new Set(['plague', 'warfare', 'siege_famine']);
const VALID_SURFACE_BASE_KINDS = new Set(['lander', 'rover', 'base']);
const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
const OSM_ID_RE = /^[RW][0-9]+$/;
const COUNTRY_CODE_RE = /^[A-Za-z]{2}$/;
const DANGEROUS_SVG_RE =
  /<\s*script\b|javascript:|vbscript:|\bon[a-z]+\s*=|<\s*foreignobject\b|<\s*iframe\b|<\s*object\b|<\s*embed\b/i;
const VALID_FLAG_ASSET_RE =
  /^(https?:\/\/[^\s]+|\/[^\s]+|data:image\/(svg\+xml|png|jpeg|webp)[;,][^\s]+)$/i;

export function sanitizeInlineFlagSvg(rawSvg: string): string | null {
  const trimmed = rawSvg.trim();
  if (!trimmed.toLowerCase().startsWith('<svg') || !trimmed.toLowerCase().includes('</svg>')) {
    return null;
  }
  if (DANGEROUS_SVG_RE.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Pre-Linnaean (< 1735 CE) guardrails against LLM-hallucinated placeholders or fictional bureaus */
const PLACEHOLDER_DISCOVERER_RE =
  /^(unknown|anonymous|n\/a|none|tbd|todo|null|undefined|未知|不详|佚名|佚名发现人|未知发现者)$/i;
const FABRICATED_ANCIENT_BUREAU_RE =
  /(农政官署|皇家植物局|帝国博物局|植物编目署|皇家物种署|botanical\s+registry|imperial\s+botanical\s+bureau|ministry\s+of\s+botany|royal\s+taxonomy\s+office)/i;
const ANACHRONISTIC_LINNAEUS_RE = /\b(linnaeus|carl\s+von\s+linn[eé])\b|林奈/i;

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  normalized: AtlasImportBundle;
  counts: Record<BundleCollectionKey, number>;
}

export interface ImportExecutionResult {
  ok: boolean;
  dryRun: boolean;
  target: ImportTarget;
  mode: ImportMode;
  errors: ValidationIssue[];
  counts: Record<BundleCollectionKey, number>;
  writtenFile?: string;
  persistence?: 'node-disk' | 'cloudflare-kv' | 'edge-memory';
}

export interface ImportedDataQueryFilter {
  collection?: BundleCollectionKey;
  year?: number;
  startYear?: number;
  endYear?: number;
  bbox?: GeoBBox;
  layer?: OverlayLayerId;
}

export function createEmptyAtlasBundle(): AtlasImportBundle {
  return {
    schemaVersion: '1.0.0',
    prompts: {},
    polities: [],
    territories: [],
    populationNodes: [],
    nightLightNodes: [],
    transportRoutes: [],
    speciesDiscoveries: [],
    mortalityCatastrophes: [],
    spaceMissions: [],
    books: [],
    customEvents: [],
  };
}

export function computeBundleCounts(
  bundle: AtlasImportBundle,
): Record<BundleCollectionKey, number> {
  return {
    polities: bundle.polities.length,
    territories: bundle.territories.length,
    populationNodes: bundle.populationNodes.length,
    nightLightNodes: bundle.nightLightNodes.length,
    transportRoutes: bundle.transportRoutes.length,
    speciesDiscoveries: bundle.speciesDiscoveries.length,
    mortalityCatastrophes: bundle.mortalityCatastrophes.length,
    spaceMissions: bundle.spaceMissions.length,
    books: bundle.books.length,
    customEvents: bundle.customEvents.length,
  };
}

export function isPlainObject(v: unknown): v is Record<string, any> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isInteger(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v);
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

function validateLonLat(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): [number, number] | null {
  if (
    !Array.isArray(val) ||
    val.length !== 2 ||
    !isFiniteNumber(val[0]) ||
    !isFiniteNumber(val[1])
  ) {
    errors.push({
      path: fieldPath,
      message: 'Must be a [longitude, latitude] numeric tuple of length 2.',
    });
    return null;
  }
  const [lon, lat] = val;
  if (lon < -180 || lon > 180) {
    errors.push({
      path: `${fieldPath}[0]`,
      message: `Longitude ${lon} out of WGS84 range [-180, 180].`,
    });
    return null;
  }
  if (lat < -90 || lat > 90) {
    errors.push({
      path: `${fieldPath}[1]`,
      message: `Latitude ${lat} out of WGS84 range [-90, 90].`,
    });
    return null;
  }
  return [lon, lat];
}

function validateGeoBBox(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): GeoBBox | undefined {
  if (val === undefined) return undefined;
  if (!isPlainObject(val)) {
    errors.push({
      path: fieldPath,
      message: 'Must be a GeoBBox object { minLon, minLat, maxLon, maxLat }.',
    });
    return undefined;
  }
  const { minLon, minLat, maxLon, maxLat } = val;
  if (
    !isFiniteNumber(minLon) ||
    !isFiniteNumber(minLat) ||
    !isFiniteNumber(maxLon) ||
    !isFiniteNumber(maxLat)
  ) {
    errors.push({ path: fieldPath, message: 'GeoBBox bounds must all be finite numbers.' });
    return undefined;
  }
  if (minLon < -180 || maxLon > 180 || minLon > maxLon) {
    errors.push({
      path: fieldPath,
      message: `Invalid longitude bounds [${minLon}, ${maxLon}]; expected -180 <= minLon <= maxLon <= 180.`,
    });
    return undefined;
  }
  if (minLat < -90 || maxLat > 90 || minLat > maxLat) {
    errors.push({
      path: fieldPath,
      message: `Invalid latitude bounds [${minLat}, ${maxLat}]; expected -90 <= minLat <= maxLat <= 90.`,
    });
    return undefined;
  }
  return { minLon, minLat, maxLon, maxLat };
}

function validateLocalizedMap(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): LocalizedStringMap | undefined {
  if (val === undefined) return undefined;
  if (!isPlainObject(val)) {
    errors.push({
      path: fieldPath,
      message: 'Localized map must be an object with optional keys zh, en, de.',
    });
    return undefined;
  }
  const out: LocalizedStringMap = {};
  for (const [k, v] of Object.entries(val)) {
    if (k !== 'zh' && k !== 'en' && k !== 'de') {
      errors.push({
        path: `${fieldPath}.${k}`,
        message: `Unsupported language key "${k}"; only "zh", "en", and "de" are supported.`,
      });
      continue;
    }
    if (v !== undefined) {
      if (typeof v !== 'string') {
        errors.push({ path: `${fieldPath}.${k}`, message: 'Translation value must be a string.' });
      } else {
        out[k as AppLanguage] = v;
      }
    }
  }
  return out;
}

function validateOverlayLayersArray(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): OverlayLayerId[] | undefined {
  if (val === undefined) return undefined;
  if (!Array.isArray(val)) {
    errors.push({ path: fieldPath, message: 'Must be an array of OverlayLayerId strings.' });
    return undefined;
  }
  const out: OverlayLayerId[] = [];
  val.forEach((item, idx) => {
    if (typeof item !== 'string' || !VALID_OVERLAY_LAYERS.has(item as OverlayLayerId)) {
      errors.push({
        path: `${fieldPath}[${idx}]`,
        message: `Invalid layer "${String(item)}". Supported layers: ${Array.from(VALID_OVERLAY_LAYERS).join(', ')}.`,
      });
    } else {
      out.push(item as OverlayLayerId);
    }
  });
  return out;
}

function validateKeyframes(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
  maxVal?: number,
): [number, number][] {
  if (!Array.isArray(val) || val.length === 0) {
    errors.push({ path: fieldPath, message: 'Must be a non-empty array of [year, value] pairs.' });
    return [];
  }
  const pairs: [number, number][] = [];
  val.forEach((item, idx) => {
    if (
      !Array.isArray(item) ||
      item.length !== 2 ||
      !isInteger(item[0]) ||
      !isFiniteNumber(item[1])
    ) {
      errors.push({
        path: `${fieldPath}[${idx}]`,
        message: 'Keyframe must be [integerYear, numericValue].',
      });
      return;
    }
    if (item[1] < 0 || (maxVal !== undefined && item[1] > maxVal)) {
      errors.push({
        path: `${fieldPath}[${idx}][1]`,
        message:
          maxVal !== undefined
            ? `Value ${item[1]} must be within [0, ${maxVal}].`
            : `Value ${item[1]} must be >= 0.`,
      });
      return;
    }
    pairs.push([item[0], item[1]]);
  });
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs;
}

function validateThermalSubZones(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): ThermalSubZone[] | undefined {
  if (val === undefined) return undefined;
  if (!Array.isArray(val)) {
    errors.push({ path: fieldPath, message: 'thermalSubZones must be an array.' });
    return undefined;
  }
  const zones: ThermalSubZone[] = [];
  val.forEach((z, idx) => {
    const p = `${fieldPath}[${idx}]`;
    if (!isPlainObject(z)) {
      errors.push({ path: p, message: 'ThermalSubZone must be an object.' });
      return;
    }
    const coords = validateLonLat(z.coords, `${p}.coords`, errors);
    if (!isFiniteNumber(z.radiusLon) || z.radiusLon <= 0) {
      errors.push({ path: `${p}.radiusLon`, message: 'radiusLon must be > 0.' });
    }
    if (!isFiniteNumber(z.radiusLat) || z.radiusLat <= 0) {
      errors.push({ path: `${p}.radiusLat`, message: 'radiusLat must be > 0.' });
    }
    if (
      z.weightFactor !== undefined &&
      (!isFiniteNumber(z.weightFactor) || z.weightFactor < 0 || z.weightFactor > 1)
    ) {
      errors.push({ path: `${p}.weightFactor`, message: 'weightFactor must be within [0, 1].' });
    }
    if (
      coords &&
      isFiniteNumber(z.radiusLon) &&
      z.radiusLon > 0 &&
      isFiniteNumber(z.radiusLat) &&
      z.radiusLat > 0
    ) {
      zones.push({
        coords,
        radiusLon: z.radiusLon,
        radiusLat: z.radiusLat,
        ...(z.weightFactor !== undefined ? { weightFactor: z.weightFactor } : {}),
      });
    }
  });
  return zones;
}

function validatePromptsObject(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): SystemPromptConfig {
  if (val === undefined) return {};
  if (typeof val === 'string') {
    return { systemPrompt: val.trim() };
  }
  if (!isPlainObject(val)) {
    errors.push({ path: fieldPath, message: 'Prompts config must be an object or string.' });
    return {};
  }
  const out: SystemPromptConfig = {};
  if (val.systemPrompt !== undefined) {
    if (typeof val.systemPrompt !== 'string') {
      errors.push({ path: `${fieldPath}.systemPrompt`, message: 'systemPrompt must be a string.' });
    } else {
      out.systemPrompt = val.systemPrompt.trim();
    }
  }
  const i18n = validateLocalizedMap(val.i18n, `${fieldPath}.i18n`, errors);
  if (i18n) out.i18n = i18n;
  return out;
}

function validateBooksArray(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): BookListItem[] {
  if (val === undefined) return [];
  if (!Array.isArray(val)) {
    errors.push({ path: fieldPath, message: 'books must be an array.' });
    return [];
  }
  const seenIds = new Set<string>();
  const out: BookListItem[] = [];

  val.forEach((raw, idx) => {
    const p = `${fieldPath}[${idx}]`;
    if (!isPlainObject(raw)) {
      errors.push({ path: p, message: 'Book item must be an object.' });
      return;
    }
    if (!isNonEmptyString(raw.title)) {
      errors.push({ path: `${p}.title`, message: 'Book title is required and must be non-empty.' });
    }
    if (raw.id !== undefined) {
      if (!isNonEmptyString(raw.id)) {
        errors.push({
          path: `${p}.id`,
          message: 'Book id, when provided, must be a non-empty string.',
        });
      } else if (seenIds.has(raw.id)) {
        errors.push({ path: `${p}.id`, message: `Duplicate book id "${raw.id}".` });
      } else {
        seenIds.add(raw.id);
      }
    }
    if (raw.startYear !== undefined && !isInteger(raw.startYear)) {
      errors.push({ path: `${p}.startYear`, message: 'startYear must be an integer.' });
    }
    if (raw.endYear !== undefined && !isInteger(raw.endYear)) {
      errors.push({ path: `${p}.endYear`, message: 'endYear must be an integer.' });
    }
    if (isInteger(raw.startYear) && isInteger(raw.endYear) && raw.startYear > raw.endYear) {
      errors.push({ path: `${p}.startYear`, message: 'startYear cannot be greater than endYear.' });
    }
    const bbox = validateGeoBBox(raw.bbox, `${p}.bbox`, errors);
    const titleI18n = validateLocalizedMap(raw.titleI18n, `${p}.titleI18n`, errors);
    const noteI18n = validateLocalizedMap(raw.noteI18n, `${p}.noteI18n`, errors);
    const relatedLayers = validateOverlayLayersArray(
      raw.relatedLayers,
      `${p}.relatedLayers`,
      errors,
    );

    if (isNonEmptyString(raw.title)) {
      out.push({
        ...(isNonEmptyString(raw.id) ? { id: raw.id.trim() } : {}),
        title: raw.title.trim(),
        ...(titleI18n ? { titleI18n } : {}),
        ...(typeof raw.author === 'string' ? { author: raw.author.trim() } : {}),
        ...(typeof raw.year === 'string' || isInteger(raw.year) ? { year: raw.year } : {}),
        ...(typeof raw.region === 'string' ? { region: raw.region.trim() } : {}),
        ...(typeof raw.era === 'string' ? { era: raw.era.trim() } : {}),
        ...(isInteger(raw.startYear) ? { startYear: raw.startYear } : {}),
        ...(isInteger(raw.endYear) ? { endYear: raw.endYear } : {}),
        ...(bbox ? { bbox } : {}),
        ...(relatedLayers ? { relatedLayers } : {}),
        ...(typeof raw.isbn === 'string' ? { isbn: raw.isbn.trim() } : {}),
        ...(typeof raw.note === 'string' ? { note: raw.note.trim() } : {}),
        ...(noteI18n ? { noteI18n } : {}),
      });
    }
  });
  return out;
}

function validateCustomEventsArray(
  val: unknown,
  fieldPath: string,
  errors: ValidationIssue[],
): CustomHistoricalEvent[] {
  if (val === undefined) return [];
  if (!Array.isArray(val)) {
    errors.push({ path: fieldPath, message: 'customEvents must be an array.' });
    return [];
  }
  const seenIds = new Set<string>();
  const out: CustomHistoricalEvent[] = [];

  val.forEach((raw, idx) => {
    const p = `${fieldPath}[${idx}]`;
    if (!isPlainObject(raw)) {
      errors.push({ path: p, message: 'CustomHistoricalEvent must be an object.' });
      return;
    }
    const nameI18n = validateLocalizedMap(raw.nameI18n, `${p}.nameI18n`, errors);
    const hasAnyTitle =
      isNonEmptyString(raw.nameZh) ||
      isNonEmptyString(raw.title) ||
      Boolean(nameI18n && (nameI18n.zh || nameI18n.en || nameI18n.de));
    if (!hasAnyTitle) {
      errors.push({
        path: `${p}.nameZh`,
        message: 'At least one of nameZh, title, or nameI18n.{zh,en,de} is required.',
      });
    }
    if (raw.id !== undefined) {
      if (!isNonEmptyString(raw.id)) {
        errors.push({ path: `${p}.id`, message: 'Event id must be a non-empty string.' });
      } else if (seenIds.has(raw.id)) {
        errors.push({ path: `${p}.id`, message: `Duplicate event id "${raw.id}".` });
      } else {
        seenIds.add(raw.id);
      }
    }
    if (raw.year !== undefined && !isInteger(raw.year)) {
      errors.push({ path: `${p}.year`, message: 'year must be an integer.' });
    }
    if (raw.startYear !== undefined && !isInteger(raw.startYear)) {
      errors.push({ path: `${p}.startYear`, message: 'startYear must be an integer.' });
    }
    if (raw.endYear !== undefined && !isInteger(raw.endYear)) {
      errors.push({ path: `${p}.endYear`, message: 'endYear must be an integer.' });
    }
    if (isInteger(raw.startYear) && isInteger(raw.endYear) && raw.startYear > raw.endYear) {
      errors.push({ path: `${p}.startYear`, message: 'startYear cannot be greater than endYear.' });
    }
    const coords =
      raw.coords !== undefined ? validateLonLat(raw.coords, `${p}.coords`, errors) : undefined;
    const bbox = validateGeoBBox(raw.bbox, `${p}.bbox`, errors);
    const locationI18n = validateLocalizedMap(raw.locationI18n, `${p}.locationI18n`, errors);
    const categoryI18n = validateLocalizedMap(raw.categoryI18n, `${p}.categoryI18n`, errors);
    const metricI18n = validateLocalizedMap(raw.metricI18n, `${p}.metricI18n`, errors);
    const summaryI18n = validateLocalizedMap(raw.summaryI18n, `${p}.summaryI18n`, errors);
    const relatedLayers = validateOverlayLayersArray(
      raw.relatedLayers,
      `${p}.relatedLayers`,
      errors,
    );

    if (hasAnyTitle) {
      out.push({
        ...(isNonEmptyString(raw.id) ? { id: raw.id.trim() } : {}),
        ...(isNonEmptyString(raw.title) ? { title: raw.title.trim() } : {}),
        ...(isNonEmptyString(raw.nameZh) ? { nameZh: raw.nameZh.trim() } : {}),
        ...(nameI18n ? { nameI18n } : {}),
        ...(isInteger(raw.year) ? { year: raw.year } : {}),
        ...(isInteger(raw.startYear) ? { startYear: raw.startYear } : {}),
        ...(isInteger(raw.endYear) ? { endYear: raw.endYear } : {}),
        ...(coords ? { coords } : {}),
        ...(bbox ? { bbox } : {}),
        ...(typeof raw.locationNameZh === 'string'
          ? { locationNameZh: raw.locationNameZh.trim() }
          : {}),
        ...(locationI18n ? { locationI18n } : {}),
        ...(typeof raw.category === 'string' ? { category: raw.category.trim() } : {}),
        ...(categoryI18n ? { categoryI18n } : {}),
        ...(relatedLayers ? { relatedLayers } : {}),
        ...(typeof raw.metricLabel === 'string' ? { metricLabel: raw.metricLabel.trim() } : {}),
        ...(metricI18n ? { metricI18n } : {}),
        ...(typeof raw.summary === 'string' ? { summary: raw.summary.trim() } : {}),
        ...(typeof raw.description === 'string' ? { description: raw.description.trim() } : {}),
        ...(summaryI18n ? { summaryI18n } : {}),
        ...(typeof raw.sourceCitation === 'string'
          ? { sourceCitation: raw.sourceCitation.trim() }
          : {}),
      });
    }
  });
  return out;
}

function validatePreLinnaeanDiscovererString(
  text: string,
  discoveryYear: number,
  fieldPath: string,
  errors: ValidationIssue[],
): void {
  const trimmed = text.trim();
  if (PLACEHOLDER_DISCOVERER_RE.test(trimmed)) {
    errors.push({
      path: fieldPath,
      message:
        'Pre-Linnaean (< 1735) species must cite the earliest extant textual chronicler or historical witness (e.g., "阿里斯托芬 / 泰奥弗拉斯托斯记述"), not "Unknown" / "未知".',
    });
    return;
  }
  if (FABRICATED_ANCIENT_BUREAU_RE.test(trimmed)) {
    errors.push({
      path: fieldPath,
      message:
        'Fabricated ancient botanical bureaus/registries are prohibited for pre-Linnaean (< 1735) species; cite the earliest extant textual chronicler or historical witness instead.',
    });
    return;
  }
  if (discoveryYear < 1707 && ANACHRONISTIC_LINNAEUS_RE.test(trimmed)) {
    errors.push({
      path: fieldPath,
      message:
        'Anachronistic attribution to Linnaeus before 1707 CE; for pre-Linnaean records (< 1735), cite the earliest extant textual chronicler or historical witness.',
    });
  }
}

/**
 * Runtime-agnostic validator for `bundle`, `events`, `books`, or `prompts` payloads.
 * Runs identically in Cloudflare Pages Functions (V8 Isolate) and Node/Bun.
 */
export function validateImportPayload(
  rawPayload: unknown,
  target: ImportTarget = 'bundle',
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const normalized = createEmptyAtlasBundle();

  if (target === 'prompts') {
    normalized.prompts = validatePromptsObject(rawPayload, 'prompts', errors);
    return {
      valid: errors.length === 0,
      errors,
      normalized,
      counts: computeBundleCounts(normalized),
    };
  }

  if (target === 'books') {
    normalized.books = validateBooksArray(rawPayload, 'books', errors);
    return {
      valid: errors.length === 0,
      errors,
      normalized,
      counts: computeBundleCounts(normalized),
    };
  }

  if (target === 'events') {
    normalized.customEvents = validateCustomEventsArray(rawPayload, 'customEvents', errors);
    return {
      valid: errors.length === 0,
      errors,
      normalized,
      counts: computeBundleCounts(normalized),
    };
  }

  if (!isPlainObject(rawPayload)) {
    errors.push({ path: '', message: 'Bundle payload must be a JSON object.' });
    return {
      valid: false,
      errors,
      normalized,
      counts: computeBundleCounts(normalized),
    };
  }

  if (rawPayload.schemaVersion !== undefined && rawPayload.schemaVersion !== '1.0.0') {
    errors.push({
      path: 'schemaVersion',
      message: `Unsupported schemaVersion "${String(rawPayload.schemaVersion)}"; expected "1.0.0".`,
    });
  }

  normalized.prompts = validatePromptsObject(rawPayload.prompts, 'prompts', errors);
  normalized.books = validateBooksArray(rawPayload.books, 'books', errors);
  normalized.customEvents = validateCustomEventsArray(
    rawPayload.customEvents,
    'customEvents',
    errors,
  );

  // 1. Polities
  if (rawPayload.polities !== undefined) {
    if (!Array.isArray(rawPayload.polities)) {
      errors.push({ path: 'polities', message: 'polities must be an array.' });
    } else {
      const seen = new Set<string>();
      rawPayload.polities.forEach((raw, idx) => {
        const p = `polities[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'Polity record must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate polity id "${raw.id}".` });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.nameZh)) {
          errors.push({ path: `${p}.nameZh`, message: 'nameZh is required.' });
        }
        if (!isNonEmptyString(raw.nameEn)) {
          errors.push({ path: `${p}.nameEn`, message: 'nameEn is required.' });
        }
        if (!isInteger(raw.startYear)) {
          errors.push({ path: `${p}.startYear`, message: 'startYear must be an integer.' });
        }
        if (!isInteger(raw.endYear)) {
          errors.push({ path: `${p}.endYear`, message: 'endYear must be an integer.' });
        }
        if (isInteger(raw.startYear) && isInteger(raw.endYear) && raw.startYear > raw.endYear) {
          errors.push({ path: `${p}.startYear`, message: 'startYear cannot exceed endYear.' });
        }
        if (
          typeof raw.representativeColor !== 'string' ||
          !HEX_COLOR_RE.test(raw.representativeColor)
        ) {
          errors.push({
            path: `${p}.representativeColor`,
            message: 'Must be a #RRGGBB hex color.',
          });
        }
        if (typeof raw.borderColor !== 'string' || !HEX_COLOR_RE.test(raw.borderColor)) {
          errors.push({ path: `${p}.borderColor`, message: 'Must be a #RRGGBB hex color.' });
        }
        let flagId: FlagVariantId | undefined;
        let flagSvg: string | undefined;
        let flagAsset: string | undefined;

        if (raw.flagId !== undefined && raw.flagId !== '') {
          if (typeof raw.flagId !== 'string' || !VALID_FLAG_IDS.has(raw.flagId as FlagVariantId)) {
            errors.push({
              path: `${p}.flagId`,
              message: `flagId must be one of: ${Array.from(VALID_FLAG_IDS).join(', ')}.`,
            });
          } else {
            flagId = raw.flagId as FlagVariantId;
          }
        }

        if (raw.flagSvg !== undefined && raw.flagSvg !== '') {
          if (typeof raw.flagSvg !== 'string') {
            errors.push({ path: `${p}.flagSvg`, message: 'flagSvg must be an inline <svg> string.' });
          } else {
            const cleanSvg = sanitizeInlineFlagSvg(raw.flagSvg);
            if (!cleanSvg) {
              errors.push({
                path: `${p}.flagSvg`,
                message:
                  'flagSvg must be a valid <svg>...</svg> element without <script>, event handlers, or executable URIs.',
              });
            } else {
              flagSvg = cleanSvg;
            }
          }
        }

        if (raw.flagAsset !== undefined && raw.flagAsset !== '') {
          if (
            typeof raw.flagAsset !== 'string' ||
            DANGEROUS_SVG_RE.test(raw.flagAsset) ||
            !VALID_FLAG_ASSET_RE.test(raw.flagAsset.trim())
          ) {
            errors.push({
              path: `${p}.flagAsset`,
              message:
                'flagAsset must be an https:// URL, root-relative /path, or safe data:image/(svg+xml|png|jpeg|webp) URI.',
            });
          } else {
            flagAsset = raw.flagAsset.trim();
          }
        }

        if (!flagId && !flagSvg && !flagAsset) {
          errors.push({
            path: `${p}.flagId`,
            message: `At least one of flagId (${Array.from(VALID_FLAG_IDS).join(', ')}), flagSvg, or flagAsset is required.`,
          });
        }

        if (!isNonEmptyString(raw.capitalName)) {
          errors.push({ path: `${p}.capitalName`, message: 'capitalName is required.' });
        }
        const capitalCoords = validateLonLat(raw.capitalCoords, `${p}.capitalCoords`, errors);
        const eraSubtitleI18n = validateLocalizedMap(
          raw.eraSubtitleI18n,
          `${p}.eraSubtitleI18n`,
          errors,
        );
        const capitalNameI18n = validateLocalizedMap(
          raw.capitalNameI18n,
          `${p}.capitalNameI18n`,
          errors,
        );
        const summaryI18n = validateLocalizedMap(raw.summaryI18n, `${p}.summaryI18n`, errors);

        if (errors.length === beforeCount && capitalCoords) {
          const rec: ImportedPolityRecord = {
            id: raw.id.trim(),
            nameZh: raw.nameZh.trim(),
            nameEn: raw.nameEn.trim(),
            ...(isNonEmptyString(raw.nameDe) ? { nameDe: raw.nameDe.trim() } : {}),
            eraSubtitle: String(raw.eraSubtitle ?? '').trim(),
            ...(eraSubtitleI18n ? { eraSubtitleI18n } : {}),
            startYear: raw.startYear,
            endYear: raw.endYear,
            representativeColor: raw.representativeColor,
            borderColor: raw.borderColor,
            ...(flagId ? { flagId } : {}),
            ...(flagSvg ? { flagSvg } : {}),
            ...(flagAsset ? { flagAsset } : {}),
            flagLabel: String(raw.flagLabel ?? '').trim(),
            capitalName: raw.capitalName.trim(),
            ...(capitalNameI18n ? { capitalNameI18n } : {}),
            capitalCoords,
            historicalSummary: String(raw.historicalSummary ?? '').trim(),
            ...(summaryI18n ? { summaryI18n } : {}),
            sourceCitation: String(raw.sourceCitation ?? '').trim(),
          };
          normalized.polities.push(rec);
        }
      });
    }
  }

  // 2. Territories: support resolved `osmIds` OR (`modernAdminNameEn` + `approxBBox`) for `scripts/resolve-osm-ids.ts` post-processing
  if (rawPayload.territories !== undefined) {
    if (!Array.isArray(rawPayload.territories)) {
      errors.push({ path: 'territories', message: 'territories must be an array.' });
    } else {
      const seen = new Set<string>();
      rawPayload.territories.forEach((raw, idx) => {
        const p = `territories[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'Territory record must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if ('coordinates' in raw || 'polygon' in raw || 'geometry' in raw) {
          errors.push({
            path: p,
            message:
              'Handwritten polygon coordinates are prohibited; specify modernAdminNameEn + approxBBox (for scripts/resolve-osm-ids.ts) or canonical OpenStreetMap IDs in osmIds.',
          });
        }
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate territory id "${raw.id}".` });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.nameZh)) {
          errors.push({ path: `${p}.nameZh`, message: 'nameZh is required.' });
        }
        if (!isInteger(raw.validFrom)) {
          errors.push({ path: `${p}.validFrom`, message: 'validFrom must be an integer.' });
        }
        if (!isInteger(raw.validTo)) {
          errors.push({ path: `${p}.validTo`, message: 'validTo must be an integer.' });
        }
        if (isInteger(raw.validFrom) && isInteger(raw.validTo) && raw.validFrom > raw.validTo) {
          errors.push({ path: `${p}.validFrom`, message: 'validFrom cannot exceed validTo.' });
        }
        if (
          typeof raw.tier !== 'string' ||
          !VALID_TERRITORY_TIERS.has(raw.tier as TerritoryTier)
        ) {
          errors.push({
            path: `${p}.tier`,
            message: `tier must be one of: ${Array.from(VALID_TERRITORY_TIERS).join(', ')}.`,
          });
        }

        if (raw.modernAdminNameEn !== undefined && !isNonEmptyString(raw.modernAdminNameEn)) {
          errors.push({
            path: `${p}.modernAdminNameEn`,
            message: 'modernAdminNameEn, when provided, must be a non-empty English administrative name.',
          });
        }
        if (
          raw.countryCode !== undefined &&
          (typeof raw.countryCode !== 'string' || !COUNTRY_CODE_RE.test(raw.countryCode.trim()))
        ) {
          errors.push({
            path: `${p}.countryCode`,
            message: 'countryCode must be a 2-letter ISO 3166-1 alpha-2 code (e.g. "GR", "IT", "CN").',
          });
        }
        if (
          raw.adminLevel !== undefined &&
          (!isInteger(raw.adminLevel) || raw.adminLevel < 2 || raw.adminLevel > 10)
        ) {
          errors.push({
            path: `${p}.adminLevel`,
            message: 'adminLevel must be an integer between 2 and 10.',
          });
        }

        const nameI18n = validateLocalizedMap(raw.nameI18n, `${p}.nameI18n`, errors);
        const approxBBox = validateGeoBBox(raw.approxBBox, `${p}.approxBBox`, errors);

        const osmIds: string[] = [];
        if (raw.osmIds !== undefined && !Array.isArray(raw.osmIds)) {
          errors.push({
            path: `${p}.osmIds`,
            message: 'osmIds must be an array of OpenStreetMap IDs.',
          });
        } else if (Array.isArray(raw.osmIds) && raw.osmIds.length > 0) {
          raw.osmIds.forEach((oid: unknown, oIdx: number) => {
            if (typeof oid !== 'string' || !OSM_ID_RE.test(oid.trim().toUpperCase())) {
              errors.push({
                path: `${p}.osmIds[${oIdx}]`,
                message: `Invalid OpenStreetMap ID "${String(oid)}"; expected Relation (R<digits>) or Way (W<digits>).`,
              });
            } else {
              osmIds.push(oid.trim().toUpperCase());
            }
          });
        } else {
          // Empty or omitted `osmIds` is valid ONLY when `modernAdminNameEn` + `approxBBox` are provided for script post-processing
          const hasPostProcessMetadata =
            isNonEmptyString(raw.modernAdminNameEn) && Boolean(approxBBox);
          if (!hasPostProcessMetadata) {
            errors.push({
              path: `${p}.osmIds`,
              message:
                'Provide either canonical OpenStreetMap IDs in osmIds (e.g. ["R957707"]) or both modernAdminNameEn + approxBBox for scripts/resolve-osm-ids.ts post-processing.',
            });
          }
        }

        if (errors.length === beforeCount) {
          const rec: ImportedTerritoryRecord = {
            id: raw.id.trim(),
            ...(isNonEmptyString(raw.polityId) ? { polityId: raw.polityId.trim() } : {}),
            nameZh: raw.nameZh.trim(),
            ...(nameI18n ? { nameI18n } : {}),
            validFrom: raw.validFrom,
            validTo: raw.validTo,
            tier: raw.tier as TerritoryTier,
            ...(isNonEmptyString(raw.modernAdminNameEn)
              ? { modernAdminNameEn: raw.modernAdminNameEn.trim() }
              : {}),
            ...(typeof raw.countryCode === 'string' && COUNTRY_CODE_RE.test(raw.countryCode.trim())
              ? { countryCode: raw.countryCode.trim().toUpperCase() }
              : {}),
            ...(isInteger(raw.adminLevel) ? { adminLevel: raw.adminLevel } : {}),
            osmIds,
            ...(approxBBox ? { approxBBox } : {}),
          };
          normalized.territories.push(rec);
        }
      });
    }
  }

  // 3. Population Density Nodes
  if (rawPayload.populationNodes !== undefined) {
    if (!Array.isArray(rawPayload.populationNodes)) {
      errors.push({ path: 'populationNodes', message: 'populationNodes must be an array.' });
    } else {
      const seen = new Set<string>();
      rawPayload.populationNodes.forEach((raw, idx) => {
        const p = `populationNodes[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'Population node must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate populationNode id "${raw.id}".` });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.nameZh)) {
          errors.push({ path: `${p}.nameZh`, message: 'nameZh is required.' });
        }
        const center = validateLonLat(raw.center, `${p}.center`, errors);
        if (!isFiniteNumber(raw.radiusDegLon) || raw.radiusDegLon <= 0) {
          errors.push({ path: `${p}.radiusDegLon`, message: 'radiusDegLon must be > 0.' });
        }
        if (!isFiniteNumber(raw.radiusDegLat) || raw.radiusDegLat <= 0) {
          errors.push({ path: `${p}.radiusDegLat`, message: 'radiusDegLat must be > 0.' });
        }
        if (!isInteger(raw.validFrom)) {
          errors.push({ path: `${p}.validFrom`, message: 'validFrom must be an integer.' });
        }
        if (!isInteger(raw.validTo)) {
          errors.push({ path: `${p}.validTo`, message: 'validTo must be an integer.' });
        }
        if (isInteger(raw.validFrom) && isInteger(raw.validTo) && raw.validFrom > raw.validTo) {
          errors.push({ path: `${p}.validFrom`, message: 'validFrom cannot exceed validTo.' });
        }
        const densityKeyframes = validateKeyframes(
          raw.densityKeyframes,
          `${p}.densityKeyframes`,
          errors,
        );
        const nameI18n = validateLocalizedMap(raw.nameI18n, `${p}.nameI18n`, errors);
        const noteI18n = validateLocalizedMap(raw.noteI18n, `${p}.noteI18n`, errors);
        const thermalSubZones = validateThermalSubZones(
          raw.thermalSubZones,
          `${p}.thermalSubZones`,
          errors,
        );

        if (errors.length === beforeCount && center) {
          const rec: ImportedPopulationNodeRecord = {
            id: raw.id.trim(),
            nameZh: raw.nameZh.trim(),
            ...(nameI18n ? { nameI18n } : {}),
            center,
            radiusDegLon: raw.radiusDegLon,
            radiusDegLat: raw.radiusDegLat,
            validFrom: raw.validFrom,
            validTo: raw.validTo,
            densityKeyframes,
            estimatedTotalNote: String(raw.estimatedTotalNote ?? '').trim(),
            ...(noteI18n ? { noteI18n } : {}),
            ...(thermalSubZones ? { thermalSubZones } : {}),
          };
          normalized.populationNodes.push(rec);
        }
      });
    }
  }

  // 4. Nighttime Light Nodes
  if (rawPayload.nightLightNodes !== undefined) {
    if (!Array.isArray(rawPayload.nightLightNodes)) {
      errors.push({ path: 'nightLightNodes', message: 'nightLightNodes must be an array.' });
    } else {
      const seen = new Set<string>();
      rawPayload.nightLightNodes.forEach((raw, idx) => {
        const p = `nightLightNodes[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'NightLightNode must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate nightLightNode id "${raw.id}".` });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.nameZh)) {
          errors.push({ path: `${p}.nameZh`, message: 'nameZh is required.' });
        }
        if (typeof raw.category !== 'string' || !VALID_NIGHT_CATEGORIES.has(raw.category)) {
          errors.push({
            path: `${p}.category`,
            message: `category must be one of: ${Array.from(VALID_NIGHT_CATEGORIES).join(', ')}.`,
          });
        }
        const coords = validateLonLat(raw.coords, `${p}.coords`, errors);
        if (!isFiniteNumber(raw.spreadDeg) || raw.spreadDeg <= 0) {
          errors.push({ path: `${p}.spreadDeg`, message: 'spreadDeg must be > 0.' });
        }
        if (!isInteger(raw.validFrom)) {
          errors.push({ path: `${p}.validFrom`, message: 'validFrom must be an integer.' });
        }
        if (!isInteger(raw.validTo)) {
          errors.push({ path: `${p}.validTo`, message: 'validTo must be an integer.' });
        }
        if (isInteger(raw.validFrom) && isInteger(raw.validTo) && raw.validFrom > raw.validTo) {
          errors.push({ path: `${p}.validFrom`, message: 'validFrom cannot exceed validTo.' });
        }
        const intensityKeyframes = validateKeyframes(
          raw.intensityKeyframes,
          `${p}.intensityKeyframes`,
          errors,
          1,
        );
        const nameI18n = validateLocalizedMap(raw.nameI18n, `${p}.nameI18n`, errors);
        const descriptionI18n = validateLocalizedMap(
          raw.descriptionI18n,
          `${p}.descriptionI18n`,
          errors,
        );

        if (errors.length === beforeCount && coords) {
          const rec: ImportedNightLightNodeRecord = {
            id: raw.id.trim(),
            nameZh: raw.nameZh.trim(),
            ...(nameI18n ? { nameI18n } : {}),
            category: raw.category as ImportedNightLightNodeRecord['category'],
            coords,
            spreadDeg: raw.spreadDeg,
            validFrom: raw.validFrom,
            validTo: raw.validTo,
            intensityKeyframes,
            description: String(raw.description ?? '').trim(),
            ...(descriptionI18n ? { descriptionI18n } : {}),
          };
          normalized.nightLightNodes.push(rec);
        }
      });
    }
  }

  // 5. Transport Routes
  if (rawPayload.transportRoutes !== undefined) {
    if (!Array.isArray(rawPayload.transportRoutes)) {
      errors.push({ path: 'transportRoutes', message: 'transportRoutes must be an array.' });
    } else {
      const seen = new Set<string>();
      rawPayload.transportRoutes.forEach((raw, idx) => {
        const p = `transportRoutes[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'TransportRoute must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate transportRoute id "${raw.id}".` });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.nameZh)) {
          errors.push({ path: `${p}.nameZh`, message: 'nameZh is required.' });
        }
        if (typeof raw.routeType !== 'string' || !VALID_ROUTE_TYPES.has(raw.routeType)) {
          errors.push({
            path: `${p}.routeType`,
            message: 'routeType must be "maritime" or "overland".',
          });
        }
        if (!isNonEmptyString(raw.originName)) {
          errors.push({ path: `${p}.originName`, message: 'originName is required.' });
        }
        if (!isNonEmptyString(raw.destinationName)) {
          errors.push({ path: `${p}.destinationName`, message: 'destinationName is required.' });
        }
        if (!isInteger(raw.openedYear)) {
          errors.push({ path: `${p}.openedYear`, message: 'openedYear must be an integer.' });
        }
        if (!isInteger(raw.closedYear)) {
          errors.push({ path: `${p}.closedYear`, message: 'closedYear must be an integer.' });
        }
        if (
          isInteger(raw.openedYear) &&
          isInteger(raw.closedYear) &&
          raw.openedYear > raw.closedYear
        ) {
          errors.push({ path: `${p}.openedYear`, message: 'openedYear cannot exceed closedYear.' });
        }
        const waypoints: [number, number][] = [];
        if (!Array.isArray(raw.waypoints) || raw.waypoints.length < 2) {
          errors.push({
            path: `${p}.waypoints`,
            message: 'waypoints must contain at least 2 [lon, lat] points.',
          });
        } else {
          raw.waypoints.forEach((wp: unknown, wIdx: number) => {
            const pt = validateLonLat(wp, `${p}.waypoints[${wIdx}]`, errors);
            if (pt) waypoints.push(pt);
          });
        }
        const usageKeyframes = validateKeyframes(
          raw.usageKeyframes,
          `${p}.usageKeyframes`,
          errors,
        );
        const nameI18n = validateLocalizedMap(raw.nameI18n, `${p}.nameI18n`, errors);
        const originNameI18n = validateLocalizedMap(
          raw.originNameI18n,
          `${p}.originNameI18n`,
          errors,
        );
        const destinationNameI18n = validateLocalizedMap(
          raw.destinationNameI18n,
          `${p}.destinationNameI18n`,
          errors,
        );
        const cargoSummaryI18n = validateLocalizedMap(
          raw.cargoSummaryI18n,
          `${p}.cargoSummaryI18n`,
          errors,
        );

        if (errors.length === beforeCount) {
          const rec: ImportedTransportRouteRecord = {
            id: raw.id.trim(),
            nameZh: raw.nameZh.trim(),
            ...(nameI18n ? { nameI18n } : {}),
            routeType: raw.routeType as 'maritime' | 'overland',
            originName: raw.originName.trim(),
            ...(originNameI18n ? { originNameI18n } : {}),
            destinationName: raw.destinationName.trim(),
            ...(destinationNameI18n ? { destinationNameI18n } : {}),
            openedYear: raw.openedYear,
            closedYear: raw.closedYear,
            cargoSummary: String(raw.cargoSummary ?? '').trim(),
            ...(cargoSummaryI18n ? { cargoSummaryI18n } : {}),
            waypoints,
            usageKeyframes,
            sourceCitation: String(raw.sourceCitation ?? '').trim(),
          };
          normalized.transportRoutes.push(rec);
        }
      });
    }
  }

  // 6. Species Discoveries (with Pre-Linnaean < 1735 chronicler & source-language name rules)
  if (rawPayload.speciesDiscoveries !== undefined) {
    if (!Array.isArray(rawPayload.speciesDiscoveries)) {
      errors.push({
        path: 'speciesDiscoveries',
        message: 'speciesDiscoveries must be an array.',
      });
    } else {
      const seen = new Set<string>();
      rawPayload.speciesDiscoveries.forEach((raw, idx) => {
        const p = `speciesDiscoveries[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'SpeciesDiscovery must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate speciesDiscovery id "${raw.id}".` });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.commonNameZh)) {
          errors.push({ path: `${p}.commonNameZh`, message: 'commonNameZh is required.' });
        }
        if (!isNonEmptyString(raw.scientificName)) {
          errors.push({ path: `${p}.scientificName`, message: 'scientificName is required.' });
        }
        if (typeof raw.kingdom !== 'string' || !VALID_KINGDOMS.has(raw.kingdom)) {
          errors.push({
            path: `${p}.kingdom`,
            message: 'kingdom must be "plantae" or "animalia".',
          });
        }
        if (!isNonEmptyString(raw.discovererZh)) {
          errors.push({ path: `${p}.discovererZh`, message: 'discovererZh is required.' });
        }
        if (!isNonEmptyString(raw.discovererEn)) {
          errors.push({ path: `${p}.discovererEn`, message: 'discovererEn is required.' });
        }
        if (!isInteger(raw.discoveryYear)) {
          errors.push({
            path: `${p}.discoveryYear`,
            message: 'discoveryYear must be an integer.',
          });
        } else if (raw.discoveryYear === 0) {
          errors.push({
            path: `${p}.discoveryYear`,
            message:
              'discoveryYear cannot be 0 (historical calendar skips Year 0 between -1 and 1; anchor ancient species to canonical text composition or historical event year).',
          });
        }
        if (!isNonEmptyString(raw.locationNameZh)) {
          errors.push({ path: `${p}.locationNameZh`, message: 'locationNameZh is required.' });
        }

        const coords = validateLonLat(raw.coords, `${p}.coords`, errors);
        const commonNameI18n = validateLocalizedMap(
          raw.commonNameI18n,
          `${p}.commonNameI18n`,
          errors,
        );
        const discovererI18n = validateLocalizedMap(
          raw.discovererI18n,
          `${p}.discovererI18n`,
          errors,
        );
        const locationNameI18n = validateLocalizedMap(
          raw.locationNameI18n,
          `${p}.locationNameI18n`,
          errors,
        );
        const historicalNoteI18n = validateLocalizedMap(
          raw.historicalNoteI18n,
          `${p}.historicalNoteI18n`,
          errors,
        );

        if (isInteger(raw.discoveryYear) && raw.discoveryYear < 1735) {
          if (isNonEmptyString(raw.discovererZh)) {
            validatePreLinnaeanDiscovererString(
              raw.discovererZh,
              raw.discoveryYear,
              `${p}.discovererZh`,
              errors,
            );
          }
          if (isNonEmptyString(raw.discovererEn)) {
            validatePreLinnaeanDiscovererString(
              raw.discovererEn,
              raw.discoveryYear,
              `${p}.discovererEn`,
              errors,
            );
          }
          if (discovererI18n) {
            for (const langKey of ['zh', 'en', 'de'] as const) {
              const val = discovererI18n[langKey];
              if (val) {
                validatePreLinnaeanDiscovererString(
                  val,
                  raw.discoveryYear,
                  `${p}.discovererI18n.${langKey}`,
                  errors,
                );
              }
            }
          }
        }

        if ('classicalGreekName' in raw && raw.classicalSourceName === undefined) {
          errors.push({
            path: `${p}.classicalSourceName`,
            message:
              'Field "classicalGreekName" has been renamed to "classicalSourceName"; please use "classicalSourceName".',
          });
        }

        if (errors.length === beforeCount && coords) {
          const rec: ImportedSpeciesDiscoveryRecord = {
            id: raw.id.trim(),
            commonNameZh: raw.commonNameZh.trim(),
            ...(commonNameI18n ? { commonNameI18n } : {}),
            scientificName: raw.scientificName.trim(),
            classicalSourceName: String(raw.classicalSourceName ?? '').trim(),
            kingdom: raw.kingdom as 'plantae' | 'animalia',
            discovererZh: raw.discovererZh.trim(),
            discovererEn: raw.discovererEn.trim(),
            ...(discovererI18n ? { discovererI18n } : {}),
            discoveryYear: raw.discoveryYear,
            locationNameZh: raw.locationNameZh.trim(),
            ...(locationNameI18n ? { locationNameI18n } : {}),
            coords,
            historicalNote: String(raw.historicalNote ?? '').trim(),
            ...(historicalNoteI18n ? { historicalNoteI18n } : {}),
            sourceCitation: String(raw.sourceCitation ?? '').trim(),
          };
          normalized.speciesDiscoveries.push(rec);
        }
      });
    }
  }

  // 7. Mortality Catastrophes
  if (rawPayload.mortalityCatastrophes !== undefined) {
    if (!Array.isArray(rawPayload.mortalityCatastrophes)) {
      errors.push({
        path: 'mortalityCatastrophes',
        message: 'mortalityCatastrophes must be an array.',
      });
    } else {
      const seen = new Set<string>();
      rawPayload.mortalityCatastrophes.forEach((raw, idx) => {
        const p = `mortalityCatastrophes[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'MortalityCatastrophe must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({
            path: `${p}.id`,
            message: `Duplicate mortalityCatastrophe id "${raw.id}".`,
          });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.nameZh)) {
          errors.push({ path: `${p}.nameZh`, message: 'nameZh is required.' });
        }
        if (typeof raw.causeCategory !== 'string' || !VALID_CAUSE_CATEGORIES.has(raw.causeCategory)) {
          errors.push({
            path: `${p}.causeCategory`,
            message: `causeCategory must be one of: ${Array.from(VALID_CAUSE_CATEGORIES).join(', ')}.`,
          });
        }
        if (!isInteger(raw.startYear)) {
          errors.push({ path: `${p}.startYear`, message: 'startYear must be an integer.' });
        }
        if (!isInteger(raw.endYear)) {
          errors.push({ path: `${p}.endYear`, message: 'endYear must be an integer.' });
        }
        if (isInteger(raw.startYear) && isInteger(raw.endYear) && raw.startYear > raw.endYear) {
          errors.push({ path: `${p}.startYear`, message: 'startYear cannot exceed endYear.' });
        }
        if (!isNonEmptyString(raw.locationNameZh)) {
          errors.push({ path: `${p}.locationNameZh`, message: 'locationNameZh is required.' });
        }
        const coords = validateLonLat(raw.coords, `${p}.coords`, errors);
        if (!isFiniteNumber(raw.spreadDeg) || raw.spreadDeg <= 0) {
          errors.push({ path: `${p}.spreadDeg`, message: 'spreadDeg must be > 0.' });
        }
        if (!isInteger(raw.estimatedDeaths) || raw.estimatedDeaths < 0) {
          errors.push({
            path: `${p}.estimatedDeaths`,
            message: 'estimatedDeaths must be a non-negative integer.',
          });
        }
        const nameI18n = validateLocalizedMap(raw.nameI18n, `${p}.nameI18n`, errors);
        const locationNameI18n = validateLocalizedMap(
          raw.locationNameI18n,
          `${p}.locationNameI18n`,
          errors,
        );
        const historicalNoteI18n = validateLocalizedMap(
          raw.historicalNoteI18n,
          `${p}.historicalNoteI18n`,
          errors,
        );
        const thermalSubZones = validateThermalSubZones(
          raw.thermalSubZones,
          `${p}.thermalSubZones`,
          errors,
        );

        if (errors.length === beforeCount && coords) {
          const rec: ImportedMortalityCatastropheRecord = {
            id: raw.id.trim(),
            nameZh: raw.nameZh.trim(),
            ...(nameI18n ? { nameI18n } : {}),
            causeCategory: raw.causeCategory as ImportedMortalityCatastropheRecord['causeCategory'],
            startYear: raw.startYear,
            endYear: raw.endYear,
            locationNameZh: raw.locationNameZh.trim(),
            ...(locationNameI18n ? { locationNameI18n } : {}),
            coords,
            spreadDeg: raw.spreadDeg,
            estimatedDeaths: raw.estimatedDeaths,
            historicalNote: String(raw.historicalNote ?? '').trim(),
            ...(historicalNoteI18n ? { historicalNoteI18n } : {}),
            sourceCitation: String(raw.sourceCitation ?? '').trim(),
            ...(thermalSubZones ? { thermalSubZones } : {}),
          };
          normalized.mortalityCatastrophes.push(rec);
        }
      });
    }
  }

  // 8. Space Missions
  if (rawPayload.spaceMissions !== undefined) {
    if (!Array.isArray(rawPayload.spaceMissions)) {
      errors.push({ path: 'spaceMissions', message: 'spaceMissions must be an array.' });
    } else {
      const seen = new Set<string>();
      rawPayload.spaceMissions.forEach((raw, idx) => {
        const p = `spaceMissions[${idx}]`;
        if (!isPlainObject(raw)) {
          errors.push({ path: p, message: 'SpaceMission must be an object.' });
          return;
        }
        const beforeCount = errors.length;
        if (!isNonEmptyString(raw.id)) {
          errors.push({ path: `${p}.id`, message: 'id is required.' });
        } else if (seen.has(raw.id)) {
          errors.push({ path: `${p}.id`, message: `Duplicate spaceMission id "${raw.id}".` });
        } else {
          seen.add(raw.id);
        }
        if (!isNonEmptyString(raw.nameZh)) {
          errors.push({ path: `${p}.nameZh`, message: 'nameZh is required.' });
        }
        if (!isNonEmptyString(raw.agency)) {
          errors.push({ path: `${p}.agency`, message: 'agency is required.' });
        }
        if (!isNonEmptyString(raw.originBodyId)) {
          errors.push({ path: `${p}.originBodyId`, message: 'originBodyId is required.' });
        }
        if (!isNonEmptyString(raw.targetBodyId)) {
          errors.push({ path: `${p}.targetBodyId`, message: 'targetBodyId is required.' });
        }
        if (!isInteger(raw.launchYear)) {
          errors.push({ path: `${p}.launchYear`, message: 'launchYear must be an integer.' });
        }
        if (!isInteger(raw.arrivalYear)) {
          errors.push({ path: `${p}.arrivalYear`, message: 'arrivalYear must be an integer.' });
        }
        if (
          isInteger(raw.launchYear) &&
          isInteger(raw.arrivalYear) &&
          raw.launchYear > raw.arrivalYear
        ) {
          errors.push({
            path: `${p}.launchYear`,
            message: 'launchYear cannot exceed arrivalYear.',
          });
        }
        const orbitProbes: ImportedSpaceMissionRecord['orbitProbes'] = [];
        if (Array.isArray(raw.orbitProbes)) {
          raw.orbitProbes.forEach((pr: unknown, prIdx: number) => {
            const prPath = `${p}.orbitProbes[${prIdx}]`;
            if (!isPlainObject(pr)) {
              errors.push({ path: prPath, message: 'OrbitProbe must be an object.' });
              return;
            }
            if (!isNonEmptyString(pr.id) || !isNonEmptyString(pr.nameZh)) {
              errors.push({ path: prPath, message: 'OrbitProbe requires id and nameZh.' });
              return;
            }
            if (!isFiniteNumber(pr.orbitAltitudeRatio) || pr.orbitAltitudeRatio <= 0) {
              errors.push({
                path: `${prPath}.orbitAltitudeRatio`,
                message: 'orbitAltitudeRatio must be > 0.',
              });
              return;
            }
            if (
              !isInteger(pr.activeFromYear) ||
              !isInteger(pr.activeToYear) ||
              pr.activeFromYear > pr.activeToYear
            ) {
              errors.push({
                path: `${prPath}.activeFromYear`,
                message: 'Invalid activeFromYear/activeToYear.',
              });
              return;
            }
            orbitProbes.push({
              id: pr.id.trim(),
              nameZh: pr.nameZh.trim(),
              agency: String(pr.agency ?? raw.agency ?? '').trim(),
              orbitAltitudeRatio: pr.orbitAltitudeRatio,
              inclinationDeg: isFiniteNumber(pr.inclinationDeg) ? pr.inclinationDeg : 0,
              activeFromYear: pr.activeFromYear,
              activeToYear: pr.activeToYear,
              statusZh: String(pr.statusZh ?? '').trim(),
            });
          });
        }
        const surfaceBases: ImportedSpaceMissionRecord['surfaceBases'] = [];
        if (Array.isArray(raw.surfaceBases)) {
          raw.surfaceBases.forEach((sb: unknown, sbIdx: number) => {
            const sbPath = `${p}.surfaceBases[${sbIdx}]`;
            if (!isPlainObject(sb)) {
              errors.push({ path: sbPath, message: 'SurfaceBase must be an object.' });
              return;
            }
            const sbCoords = validateLonLat(sb.coords, `${sbPath}.coords`, errors);
            if (
              !isNonEmptyString(sb.id) ||
              !isNonEmptyString(sb.nameZh) ||
              typeof sb.kind !== 'string' ||
              !VALID_SURFACE_BASE_KINDS.has(sb.kind) ||
              !isInteger(sb.landedYear) ||
              !sbCoords
            ) {
              errors.push({ path: sbPath, message: 'Invalid SurfaceBase fields.' });
              return;
            }
            surfaceBases.push({
              id: sb.id.trim(),
              nameZh: sb.nameZh.trim(),
              agency: String(sb.agency ?? raw.agency ?? '').trim(),
              kind: sb.kind as 'lander' | 'rover' | 'base',
              coords: sbCoords,
              landedYear: sb.landedYear,
              statusZh: String(sb.statusZh ?? '').trim(),
            });
          });
        }
        const nameI18n = validateLocalizedMap(raw.nameI18n, `${p}.nameI18n`, errors);
        const missionStatusI18n = validateLocalizedMap(
          raw.missionStatusI18n,
          `${p}.missionStatusI18n`,
          errors,
        );

        if (errors.length === beforeCount) {
          normalized.spaceMissions.push({
            id: raw.id.trim(),
            nameZh: raw.nameZh.trim(),
            ...(nameI18n ? { nameI18n } : {}),
            agency: raw.agency.trim(),
            originBodyId: raw.originBodyId.trim(),
            targetBodyId: raw.targetBodyId.trim(),
            launchYear: raw.launchYear,
            arrivalYear: raw.arrivalYear,
            missionStatusZh: String(raw.missionStatusZh ?? '').trim(),
            ...(missionStatusI18n ? { missionStatusI18n } : {}),
            orbitProbes,
            surfaceBases,
          });
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalized,
    counts: computeBundleCounts(normalized),
  };
}

export function mergeByKey<T>(
  existing: T[],
  incoming: T[],
  keyFn: (item: T, index: number) => string,
): T[] {
  const result = [...existing];
  const indexByKey = new Map<string, number>();
  result.forEach((item, idx) => {
    indexByKey.set(keyFn(item, idx), idx);
  });
  incoming.forEach((item, idx) => {
    const k = keyFn(item, existing.length + idx);
    const existingIdx = indexByKey.get(k);
    if (existingIdx !== undefined) {
      result[existingIdx] = item;
    } else {
      indexByKey.set(k, result.length);
      result.push(item);
    }
  });
  return result;
}

export interface AtlasRawStoreSnapshot {
  bundle: AtlasImportBundle;
  books: BookListItem[];
  customEvents: CustomHistoricalEvent[];
  promptsJson: SystemPromptConfig;
  promptTxt: string;
}

export function createEmptyStoreSnapshot(): AtlasRawStoreSnapshot {
  return {
    bundle: createEmptyAtlasBundle(),
    books: [],
    customEvents: [],
    promptsJson: {},
    promptTxt: '',
  };
}

export function applyImportMutationToSnapshot(params: {
  snapshot: AtlasRawStoreSnapshot;
  payload: unknown;
  target: ImportTarget;
  mode: ImportMode;
  dryRun: boolean;
}): {
  result: ImportExecutionResult;
  nextSnapshot: AtlasRawStoreSnapshot;
} {
  const { snapshot, payload, target, mode, dryRun } = params;
  const validation = validateImportPayload(payload, target);

  if (!validation.valid) {
    return {
      result: {
        ok: false,
        dryRun,
        target,
        mode,
        errors: validation.errors,
        counts: validation.counts,
      },
      nextSnapshot: snapshot,
    };
  }

  if (target === 'books') {
    const nextBooks =
      mode === 'replace'
        ? validation.normalized.books
        : mergeByKey(
            snapshot.books,
            validation.normalized.books,
            (b, idx) => b.id || `${b.title || ''}::${b.author || idx}`,
          );
    const summaryBundle = createEmptyAtlasBundle();
    summaryBundle.books = nextBooks;
    return {
      result: {
        ok: true,
        dryRun,
        target,
        mode,
        errors: [],
        counts: computeBundleCounts(summaryBundle),
        writtenFile: 'data/booklists/books.json',
      },
      nextSnapshot: dryRun ? snapshot : { ...snapshot, books: nextBooks },
    };
  }

  if (target === 'events') {
    const nextEvents =
      mode === 'replace'
        ? validation.normalized.customEvents
        : mergeByKey(
            snapshot.customEvents,
            validation.normalized.customEvents,
            (ev, idx) =>
              ev.id || `${ev.nameZh || ev.title || idx}::${ev.startYear ?? ev.year ?? ''}`,
          );
    const summaryBundle = createEmptyAtlasBundle();
    summaryBundle.customEvents = nextEvents;
    return {
      result: {
        ok: true,
        dryRun,
        target,
        mode,
        errors: [],
        counts: computeBundleCounts(summaryBundle),
        writtenFile: 'data/events/custom_events.json',
      },
      nextSnapshot: dryRun ? snapshot : { ...snapshot, customEvents: nextEvents },
    };
  }

  if (target === 'prompts') {
    const currentPrompts = snapshot.promptsJson || {};
    const incomingPrompts = validation.normalized.prompts || {};
    const nextPrompts: SystemPromptConfig =
      mode === 'replace'
        ? incomingPrompts
        : {
            ...(currentPrompts.systemPrompt ? { systemPrompt: currentPrompts.systemPrompt } : {}),
            ...(incomingPrompts.systemPrompt !== undefined
              ? { systemPrompt: incomingPrompts.systemPrompt }
              : {}),
            ...(currentPrompts.i18n || incomingPrompts.i18n
              ? {
                  i18n: {
                    ...(currentPrompts.i18n || {}),
                    ...(incomingPrompts.i18n || {}),
                  },
                }
              : {}),
          };
    return {
      result: {
        ok: true,
        dryRun,
        target,
        mode,
        errors: [],
        counts: computeBundleCounts(validation.normalized),
        writtenFile: 'data/prompts/system_prompt.json',
      },
      nextSnapshot: dryRun ? snapshot : { ...snapshot, promptsJson: nextPrompts },
    };
  }

  // target === 'bundle'
  const current = mode === 'merge' ? snapshot.bundle : createEmptyAtlasBundle();
  const inc = validation.normalized;

  const nextBundle: AtlasImportBundle =
    mode === 'replace'
      ? {
          ...inc,
          updatedAt: new Date().toISOString(),
        }
      : {
          schemaVersion: '1.0.0',
          updatedAt: new Date().toISOString(),
          prompts: {
            ...(current.prompts?.systemPrompt ? { systemPrompt: current.prompts.systemPrompt } : {}),
            ...(inc.prompts?.systemPrompt !== undefined
              ? { systemPrompt: inc.prompts.systemPrompt }
              : {}),
            ...(current.prompts?.i18n || inc.prompts?.i18n
              ? {
                  i18n: {
                    ...(current.prompts?.i18n || {}),
                    ...(inc.prompts?.i18n || {}),
                  },
                }
              : {}),
          },
          polities: mergeByKey(current.polities, inc.polities, (x) => x.id),
          territories: mergeByKey(current.territories, inc.territories, (x) => x.id),
          populationNodes: mergeByKey(current.populationNodes, inc.populationNodes, (x) => x.id),
          nightLightNodes: mergeByKey(current.nightLightNodes, inc.nightLightNodes, (x) => x.id),
          transportRoutes: mergeByKey(current.transportRoutes, inc.transportRoutes, (x) => x.id),
          speciesDiscoveries: mergeByKey(
            current.speciesDiscoveries,
            inc.speciesDiscoveries,
            (x) => x.id,
          ),
          mortalityCatastrophes: mergeByKey(
            current.mortalityCatastrophes,
            inc.mortalityCatastrophes,
            (x) => x.id,
          ),
          spaceMissions: mergeByKey(current.spaceMissions, inc.spaceMissions, (x) => x.id),
          books: mergeByKey(
            current.books,
            inc.books,
            (b, idx) => b.id || `${b.title || ''}::${b.author || idx}`,
          ),
          customEvents: mergeByKey(
            current.customEvents,
            inc.customEvents,
            (ev, idx) =>
              ev.id || `${ev.nameZh || ev.title || idx}::${ev.startYear ?? ev.year ?? ''}`,
          ),
        };

  return {
    result: {
      ok: true,
      dryRun,
      target,
      mode,
      errors: [],
      counts: computeBundleCounts(nextBundle),
      writtenFile: 'data/imports/atlas_bundle.json',
    },
    nextSnapshot: dryRun ? snapshot : { ...snapshot, bundle: nextBundle },
  };
}

function intervalsOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return Math.max(a0, b0) <= Math.min(a1, b1);
}

function pointInBBox(pt: [number, number], box: GeoBBox): boolean {
  return pt[0] >= box.minLon && pt[0] <= box.maxLon && pt[1] >= box.minLat && pt[1] <= box.maxLat;
}

function boxesOverlap(a: GeoBBox, b: GeoBBox): boolean {
  return !(
    a.maxLon < b.minLon ||
    a.minLon > b.maxLon ||
    a.maxLat < b.minLat ||
    a.minLat > b.maxLat
  );
}

/**
 * Merges a snapshot's `bundle`, standalone `books`, and standalone `customEvents`
 * and applies optional temporal, spatial (`bbox`), layer, and collection filters.
 */
export function filterSnapshotData(
  snapshot: AtlasRawStoreSnapshot,
  filter: ImportedDataQueryFilter = {},
): AtlasImportBundle {
  const mergedBooks =
    snapshot.books.length > 0
      ? mergeByKey(
          snapshot.bundle.books,
          validateImportPayload(snapshot.books, 'books').normalized.books,
          (b, idx) => b.id || `${b.title || ''}::${b.author || idx}`,
        )
      : snapshot.bundle.books;

  const mergedEvents =
    snapshot.customEvents.length > 0
      ? mergeByKey(
          snapshot.bundle.customEvents,
          validateImportPayload(snapshot.customEvents, 'events').normalized.customEvents,
          (ev, idx) =>
            ev.id || `${ev.nameZh || ev.title || idx}::${ev.startYear ?? ev.year ?? ''}`,
        )
      : snapshot.bundle.customEvents;

  const bundle: AtlasImportBundle = {
    ...snapshot.bundle,
    books: mergedBooks,
    customEvents: mergedEvents,
  };

  const hasTimeFilter =
    isInteger(filter.year) || isInteger(filter.startYear) || isInteger(filter.endYear);
  const wStart = isInteger(filter.startYear)
    ? filter.startYear
    : isInteger(filter.year)
      ? filter.year
      : -100000;
  const wEnd = isInteger(filter.endYear)
    ? filter.endYear
    : isInteger(filter.year)
      ? filter.year
      : 100000;
  const box = filter.bbox;

  const filtered: AtlasImportBundle = {
    schemaVersion: '1.0.0',
    ...(bundle.updatedAt ? { updatedAt: bundle.updatedAt } : {}),
    prompts: bundle.prompts,
    polities: bundle.polities.filter((p) => {
      if (hasTimeFilter && !intervalsOverlap(p.startYear, p.endYear, wStart, wEnd)) return false;
      if (box && !pointInBBox(p.capitalCoords, box)) return false;
      return true;
    }),
    territories: bundle.territories.filter((t) => {
      if (hasTimeFilter && !intervalsOverlap(t.validFrom, t.validTo, wStart, wEnd)) return false;
      if (box && t.approxBBox && !boxesOverlap(t.approxBBox, box)) return false;
      return true;
    }),
    populationNodes: bundle.populationNodes.filter((n) => {
      if (filter.layer && filter.layer !== 'population_density') return false;
      if (hasTimeFilter && !intervalsOverlap(n.validFrom, n.validTo, wStart, wEnd)) return false;
      if (box && !pointInBBox(n.center, box)) return false;
      return true;
    }),
    nightLightNodes: bundle.nightLightNodes.filter((n) => {
      if (filter.layer && filter.layer !== 'night_lights') return false;
      if (hasTimeFilter && !intervalsOverlap(n.validFrom, n.validTo, wStart, wEnd)) return false;
      if (box && !pointInBBox(n.coords, box)) return false;
      return true;
    }),
    transportRoutes: bundle.transportRoutes.filter((r) => {
      if (filter.layer && filter.layer !== 'transport_routes') return false;
      if (hasTimeFilter && !intervalsOverlap(r.openedYear, r.closedYear, wStart, wEnd)) {
        return false;
      }
      if (box && !r.waypoints.some((pt) => pointInBBox(pt, box))) return false;
      return true;
    }),
    speciesDiscoveries: bundle.speciesDiscoveries.filter((sp) => {
      if (filter.layer && filter.layer !== 'species_discovery') return false;
      if (hasTimeFilter) {
        if (isInteger(filter.startYear) && sp.discoveryYear < wStart) return false;
        if (sp.discoveryYear > wEnd) return false;
      }
      if (box && !pointInBBox(sp.coords, box)) return false;
      return true;
    }),
    mortalityCatastrophes: bundle.mortalityCatastrophes.filter((mc) => {
      if (filter.layer && filter.layer !== 'mortality_catastrophe') return false;
      if (hasTimeFilter && !intervalsOverlap(mc.startYear, mc.endYear, wStart, wEnd)) return false;
      if (box && !pointInBBox(mc.coords, box)) return false;
      return true;
    }),
    spaceMissions: bundle.spaceMissions.filter((sm) => {
      if (filter.layer && filter.layer !== 'space_race') return false;
      if (hasTimeFilter && !intervalsOverlap(sm.launchYear, sm.arrivalYear, wStart, wEnd)) {
        return false;
      }
      return true;
    }),
    books: bundle.books.filter((b) => {
      if (
        filter.layer &&
        b.relatedLayers &&
        b.relatedLayers.length > 0 &&
        !b.relatedLayers.includes(filter.layer)
      ) {
        return false;
      }
      if (
        hasTimeFilter &&
        isInteger(b.startYear) &&
        isInteger(b.endYear) &&
        !intervalsOverlap(b.startYear, b.endYear, wStart, wEnd)
      ) {
        return false;
      }
      if (box && b.bbox && !boxesOverlap(b.bbox, box)) return false;
      return true;
    }),
    customEvents: bundle.customEvents.filter((ev) => {
      if (
        filter.layer &&
        ev.relatedLayers &&
        ev.relatedLayers.length > 0 &&
        !ev.relatedLayers.includes(filter.layer)
      ) {
        return false;
      }
      const evStart = isInteger(ev.startYear) ? ev.startYear : isInteger(ev.year) ? ev.year : null;
      const evEnd = isInteger(ev.endYear) ? ev.endYear : evStart;
      if (
        hasTimeFilter &&
        evStart !== null &&
        evEnd !== null &&
        !intervalsOverlap(evStart, evEnd, wStart, wEnd)
      ) {
        return false;
      }
      if (box) {
        if (ev.coords && !pointInBBox(ev.coords, box)) return false;
        if (!ev.coords && ev.bbox && !boxesOverlap(ev.bbox, box)) return false;
      }
      return true;
    }),
  };

  if (filter.collection) {
    for (const key of BUNDLE_COLLECTION_KEYS) {
      if (key !== filter.collection) {
        (filtered as any)[key] = [];
      }
    }
  }

  return filtered;
}

export function resolvePromptFromJson(parsed: unknown, language: AppLanguage): string {
  if (typeof parsed === 'string') {
    return parsed.trim();
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as {
      systemPrompt?: unknown;
      i18n?: Record<string, unknown>;
    };
    const byLang = obj.i18n?.[language];
    if (typeof byLang === 'string' && byLang.trim()) {
      return byLang.trim();
    }
    if (typeof obj.systemPrompt === 'string' && obj.systemPrompt.trim()) {
      return obj.systemPrompt.trim();
    }
  }
  return '';
}

export function resolveExternalConfigFromSnapshot(
  snapshot: AtlasRawStoreSnapshot,
  language: AppLanguage = 'zh',
): {
  customSystemPrompt: string;
  books: BookListItem[];
  customEvents: CustomHistoricalEvent[];
  bundle: AtlasImportBundle;
} {
  const bundle = filterSnapshotData(snapshot);

  let customSystemPrompt = snapshot.promptTxt.trim();
  if (!customSystemPrompt && snapshot.promptsJson) {
    customSystemPrompt = resolvePromptFromJson(snapshot.promptsJson, language);
  }
  if (!customSystemPrompt && bundle.prompts) {
    customSystemPrompt = resolvePromptFromJson(bundle.prompts, language);
  }

  return {
    customSystemPrompt,
    books: bundle.books,
    customEvents: bundle.customEvents,
    bundle,
  };
}
