import {
  applyImportMutationToSnapshot,
  AtlasRawStoreSnapshot,
  computeBundleCounts,
  filterSnapshotData,
  ImportMode,
  ImportTarget,
  isPlainObject,
  validateImportPayload,
} from '../shared/dataValidator';
import { getBackendDetectedDatasetSummary } from '../shared/atlasDataLayer';
import {
  buildBundledInitialSnapshot,
  BUNDLED_ATLAS_SCHEMA,
  BUNDLED_IMPORT_TEMPLATES,
} from './staticData';
import { AtlasStorageAdapter, EdgeEnv } from './types';

const KV_SNAPSHOT_KEY = 'atlas:snapshot:v1';

/**
 * Isolate-scoped fallback map keyed by store namespace so unbound Cloudflare Pages previews
 * and Edge unit tests maintain coherent state within an isolate without touching `node:fs`.
 */
const isolateSnapshots = new Map<string, AtlasRawStoreSnapshot>();

export function resetEdgeIsolateMemoryStore(namespace = 'default'): void {
  isolateSnapshots.delete(namespace);
}

function hydrateStoredSnapshot(
  raw: unknown,
  fallbackPromptTxt: string,
): AtlasRawStoreSnapshot {
  const base = buildBundledInitialSnapshot(fallbackPromptTxt);
  if (!isPlainObject(raw)) return base;

  const bundle = isPlainObject(raw.bundle)
    ? validateImportPayload(raw.bundle, 'bundle').normalized
    : base.bundle;
  const books = Array.isArray(raw.books)
    ? validateImportPayload(raw.books, 'books').normalized.books
    : base.books;
  const customEvents = Array.isArray(raw.customEvents)
    ? validateImportPayload(raw.customEvents, 'events').normalized.customEvents
    : base.customEvents;
  const promptsJson = isPlainObject(raw.promptsJson)
    ? validateImportPayload(raw.promptsJson, 'prompts').normalized.prompts || {}
    : base.promptsJson;
  const promptTxt =
    typeof raw.promptTxt === 'string' && raw.promptTxt.trim()
      ? raw.promptTxt.trim()
      : fallbackPromptTxt;

  return {
    bundle,
    books,
    customEvents,
    promptsJson,
    promptTxt,
  };
}

/**
 * Creates a Cloudflare Pages Edge-compatible `AtlasStorageAdapter`:
 * - When `env.ATLAS_DATA_KV` is bound, reads & persists snapshots globally in Cloudflare Workers KV.
 * - When `env.ATLAS_DATA_KV` is omitted, serves bundled `/data/*` JSON + isolate memory cleanly.
 */
export function createEdgeStorageAdapter(
  env: EdgeEnv = {},
  options: { isolateNamespace?: string } = {},
): AtlasStorageAdapter {
  const kv = env.ATLAS_DATA_KV;
  const fallbackPrompt =
    typeof env.CUSTOM_SYSTEM_PROMPT === 'string' ? env.CUSTOM_SYSTEM_PROMPT.trim() : '';
  const ns = options.isolateNamespace || 'default';

  const persistenceKind: 'cloudflare-kv' | 'edge-memory' = kv ? 'cloudflare-kv' : 'edge-memory';

  async function getSnapshot(): Promise<AtlasRawStoreSnapshot> {
    if (kv) {
      try {
        const stored = await kv.get(KV_SNAPSHOT_KEY, 'json');
        if (stored) {
          return hydrateStoredSnapshot(stored, fallbackPrompt);
        }
      } catch {
        // Fall back to isolate/bundled state if KV read fails transiently
      }
    }

    const mem = isolateSnapshots.get(ns);
    if (mem) {
      return {
        ...mem,
        promptTxt: mem.promptTxt || fallbackPrompt,
      };
    }

    const initial = buildBundledInitialSnapshot(fallbackPrompt);
    isolateSnapshots.set(ns, initial);
    return initial;
  }

  async function commitImport(params: {
    payload: unknown;
    target: ImportTarget;
    mode: ImportMode;
    dryRun: boolean;
  }) {
    const current = await getSnapshot();
    const { result, nextSnapshot } = applyImportMutationToSnapshot({
      snapshot: current,
      payload: params.payload,
      target: params.target,
      mode: params.mode,
      dryRun: params.dryRun,
    });

    if (!result.ok) {
      return {
        ...result,
        persistence: persistenceKind,
      };
    }

    if (!params.dryRun) {
      isolateSnapshots.set(ns, nextSnapshot);
      if (kv) {
        await kv.put(KV_SNAPSHOT_KEY, JSON.stringify(nextSnapshot));
      }
    }

    return {
      ...result,
      persistence: persistenceKind,
    };
  }

  async function getSchemaCatalog() {
    const snapshot = await getSnapshot();
    const merged = filterSnapshotData(snapshot);
    return {
      schemaVersion: '1.0.0' as const,
      schema: BUNDLED_ATLAS_SCHEMA,
      templates: BUNDLED_IMPORT_TEMPLATES,
      counts: computeBundleCounts(merged),
    };
  }

  async function getDetectedDatasets() {
    return getBackendDetectedDatasetSummary();
  }

  return {
    persistenceKind,
    getSnapshot,
    getDetectedDatasets,
    commitImport,
    getSchemaCatalog,
  };
}
