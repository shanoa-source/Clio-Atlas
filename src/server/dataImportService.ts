import fs from 'node:fs';
import path from 'node:path';
import {
  applyImportMutationToSnapshot,
  AtlasRawStoreSnapshot,
  BUNDLE_COLLECTION_KEYS,
  BundleCollectionKey,
  computeBundleCounts,
  createEmptyAtlasBundle,
  filterSnapshotData,
  ImportExecutionResult,
  ImportedDataQueryFilter,
  ImportMode,
  ImportTarget,
  isPlainObject,
  mergeByKey,
  validateImportPayload,
  ValidationIssue,
  ValidationResult,
} from '../shared/dataValidator';
import {
  AtlasImportBundle,
  BookListItem,
  CustomHistoricalEvent,
  SystemPromptConfig,
} from '../types/history';

export {
  BUNDLE_COLLECTION_KEYS,
  computeBundleCounts,
  createEmptyAtlasBundle,
  mergeByKey,
  validateImportPayload,
};

export type {
  BundleCollectionKey,
  ImportedDataQueryFilter,
  ImportExecutionResult,
  ImportMode,
  ImportTarget,
  ValidationIssue,
  ValidationResult,
};

function atomicWriteJson(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function safeReadTextFile(filePath: string): string {
  try {
    if (!fs.existsSync(filePath)) return '';
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size === 0) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return '';
  }
}

export function loadDiskSnapshot(baseDir: string): AtlasRawStoreSnapshot {
  const bundle = loadBundleFromDisk(baseDir);

  let books: BookListItem[] = [];
  const booksPath = path.join(baseDir, 'data', 'booklists', 'books.json');
  const rawBooks = safeReadTextFile(booksPath);
  if (rawBooks) {
    try {
      const parsed = JSON.parse(rawBooks);
      if (Array.isArray(parsed)) books = parsed;
    } catch {
      books = [];
    }
  }

  let customEvents: CustomHistoricalEvent[] = [];
  const eventsPath = path.join(baseDir, 'data', 'events', 'custom_events.json');
  const rawEvents = safeReadTextFile(eventsPath);
  if (rawEvents) {
    try {
      const parsed = JSON.parse(rawEvents);
      if (Array.isArray(parsed)) customEvents = parsed;
    } catch {
      customEvents = [];
    }
  }

  let promptsJson: SystemPromptConfig = {};
  const promptsJsonPath = path.join(baseDir, 'data', 'prompts', 'system_prompt.json');
  const rawPromptsJson = safeReadTextFile(promptsJsonPath);
  if (rawPromptsJson) {
    try {
      const parsed = JSON.parse(rawPromptsJson);
      if (isPlainObject(parsed)) promptsJson = parsed as SystemPromptConfig;
    } catch {
      promptsJson = {};
    }
  }

  const promptTxt = safeReadTextFile(path.join(baseDir, 'data', 'prompts', 'system_prompt.txt'));

  return {
    bundle,
    books,
    customEvents,
    promptsJson,
    promptTxt,
  };
}

export function loadBundleFromDisk(baseDir: string): AtlasImportBundle {
  const bundlePath = path.join(baseDir, 'data', 'imports', 'atlas_bundle.json');
  if (!fs.existsSync(bundlePath)) {
    return createEmptyAtlasBundle();
  }
  try {
    const raw = fs.readFileSync(bundlePath, 'utf8').trim();
    if (!raw) return createEmptyAtlasBundle();
    const parsed = JSON.parse(raw);
    const res = validateImportPayload(parsed, 'bundle');
    return res.normalized;
  } catch {
    return createEmptyAtlasBundle();
  }
}

/**
 * Validates and imports structured JSON data into `data/imports/atlas_bundle.json`,
 * `data/events/custom_events.json`, `data/booklists/books.json`, or `data/prompts/system_prompt.json`.
 */
export function importDataToDisk(params: {
  baseDir: string;
  payload: unknown;
  target?: ImportTarget;
  mode?: ImportMode;
  dryRun?: boolean;
}): ImportExecutionResult {
  const {
    baseDir,
    payload,
    target = 'bundle',
    mode = 'merge',
    dryRun = false,
  } = params;

  const snapshot = loadDiskSnapshot(baseDir);
  const { result, nextSnapshot } = applyImportMutationToSnapshot({
    snapshot,
    payload,
    target,
    mode,
    dryRun,
  });

  if (!result.ok) {
    return result;
  }

  if (!dryRun) {
    if (target === 'books') {
      atomicWriteJson(path.join(baseDir, 'data', 'booklists', 'books.json'), nextSnapshot.books);
    } else if (target === 'events') {
      atomicWriteJson(
        path.join(baseDir, 'data', 'events', 'custom_events.json'),
        nextSnapshot.customEvents,
      );
    } else if (target === 'prompts') {
      atomicWriteJson(
        path.join(baseDir, 'data', 'prompts', 'system_prompt.json'),
        nextSnapshot.promptsJson,
      );
    } else {
      atomicWriteJson(
        path.join(baseDir, 'data', 'imports', 'atlas_bundle.json'),
        nextSnapshot.bundle,
      );
    }
  }

  return {
    ...result,
    persistence: 'node-disk',
  };
}

/**
 * Loads all imported data (`atlas_bundle.json` + standalone `books.json` + `custom_events.json`)
 * and applies optional temporal, spatial (`bbox`), layer, or collection filters.
 */
export function queryImportedData(
  baseDir: string,
  filter: ImportedDataQueryFilter = {},
): AtlasImportBundle {
  const snapshot = loadDiskSnapshot(baseDir);
  return filterSnapshotData(snapshot, filter);
}

export function getDataSchemaCatalog(
  rootSchemaDir: string,
  dataBaseDir = rootSchemaDir,
): {
  schemaVersion: '1.0.0';
  schema: Record<string, unknown>;
  templates: Record<string, unknown>;
  counts: Record<BundleCollectionKey, number>;
} {
  const schemaPath = path.join(rootSchemaDir, 'data', 'schemas', 'atlas_import_bundle.schema.json');
  const templatesPath = path.join(rootSchemaDir, 'data', 'schemas', 'import_templates.json');

  let schema: Record<string, unknown> = {};
  let templates: Record<string, unknown> = {};

  if (fs.existsSync(schemaPath)) {
    schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  }
  if (fs.existsSync(templatesPath)) {
    templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8'));
  }

  const merged = queryImportedData(dataBaseDir);
  return {
    schemaVersion: '1.0.0',
    schema,
    templates,
    counts: computeBundleCounts(merged),
  };
}

/**
 * Automatically detects and merges all historical dataset JSON bundles under `data/datasets/*.json`
 * on the backend filesystem (excluding solar_system.json celestial definitions), so dropping a new
 * dataset file into `data/datasets/` makes it immediately available to the unified frontend.
 */
export function discoverBackendDatasetsFromDisk(baseDir: string): {
  datasetIds: string[];
  mergedBundle: AtlasImportBundle;
} {
  const datasetsDir = path.join(baseDir, 'data', 'datasets');
  const merged = createEmptyAtlasBundle();
  const datasetIds: string[] = [];

  if (!fs.existsSync(datasetsDir)) {
    return { datasetIds, mergedBundle: merged };
  }

  const entries = fs
    .readdirSync(datasetsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b));

  for (const fileName of entries) {
    const fullPath = path.join(datasetsDir, fileName);
    const rawText = safeReadTextFile(fullPath);
    if (!rawText) continue;
    try {
      const parsed = JSON.parse(rawText);
      if (!isPlainObject(parsed)) continue;
      // Skip non-polity celestial definition files such as solar_system.json
      if (Array.isArray(parsed.bodies) && !Array.isArray(parsed.polities)) {
        continue;
      }
      const meta = isPlainObject(parsed.datasetMeta) ? parsed.datasetMeta : null;
      const datasetId =
        typeof meta?.id === 'string' && meta.id.trim()
          ? meta.id.trim()
          : fileName.replace(/\.json$/i, '');

      const candidatePayload = { ...parsed };
      delete candidatePayload.datasetMeta;

      const validated = validateImportPayload(candidatePayload, 'bundle');
      if (!validated.valid) continue;
      const norm = validated.normalized;
      datasetIds.push(datasetId);

      merged.polities = mergeByKey(merged.polities, norm.polities, (item) => item.id);
      merged.territories = mergeByKey(merged.territories, norm.territories, (item) => item.id);
      merged.populationNodes = mergeByKey(
        merged.populationNodes,
        norm.populationNodes,
        (item) => item.id,
      );
      merged.nightLightNodes = mergeByKey(
        merged.nightLightNodes,
        norm.nightLightNodes,
        (item) => item.id,
      );
      merged.transportRoutes = mergeByKey(
        merged.transportRoutes,
        norm.transportRoutes,
        (item) => item.id,
      );
      merged.speciesDiscoveries = mergeByKey(
        merged.speciesDiscoveries,
        norm.speciesDiscoveries,
        (item) => item.id,
      );
      merged.mortalityCatastrophes = mergeByKey(
        merged.mortalityCatastrophes,
        norm.mortalityCatastrophes,
        (item) => item.id,
      );
      merged.spaceMissions = mergeByKey(
        merged.spaceMissions,
        norm.spaceMissions,
        (item) => item.id,
      );
      merged.books = [...merged.books, ...norm.books];
      merged.customEvents = [...merged.customEvents, ...norm.customEvents];
    } catch {
      // Ignore malformed dataset files without crashing server startup
    }
  }

  return {
    datasetIds,
    mergedBundle: merged,
  };
}
