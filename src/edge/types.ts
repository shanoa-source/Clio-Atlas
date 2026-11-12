import {
  AtlasRawStoreSnapshot,
  BundleCollectionKey,
  ImportExecutionResult,
  ImportMode,
  ImportTarget,
} from '../shared/dataValidator';

/**
 * Minimal Cloudflare Workers KVNamespace interface compatible with Cloudflare Pages Functions bindings.
 */
export interface KVNamespaceLike {
  get(key: string, type?: 'text'): Promise<string | null>;
  get<T = unknown>(key: string, type: 'json'): Promise<T | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number; metadata?: Record<string, unknown> },
  ): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Environment bindings injected into Cloudflare Pages Functions (`context.env`)
 * and bridged from `process.env` when running locally under `tsx server.ts`.
 */
export interface EdgeEnv {
  /** Gemini API key configured in Cloudflare Pages Secrets (`wrangler pages secret put GEMINI_API_KEY`) or `.dev.vars` */
  GEMINI_API_KEY?: string;
  /** Optional public deployment URL */
  APP_URL?: string;
  /** Optional system prompt override via Cloudflare Pages environment variable */
  CUSTOM_SYSTEM_PROMPT?: string;
  /** Optional Cloudflare Workers KV namespace for persistent runtime `POST /api/data/import` storage */
  ATLAS_DATA_KV?: KVNamespaceLike;
  /** Optional Cloudflare Workers KV namespace for persistent OpenStreetMap boundary polygon caching */
  OSM_CACHE_KV?: KVNamespaceLike;
  [key: string]: unknown;
}

/**
 * Standard Cloudflare Pages Functions `EventContext` signature.
 */
export interface PagesEventContext<
  Env = EdgeEnv,
  Params extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> {
  request: Request;
  functionPath: string;
  waitUntil: (promise: Promise<unknown>) => void;
  passThroughOnException: () => void;
  next: (input?: Request | string, init?: RequestInit) => Promise<Response>;
  env: Env;
  params: Record<Params, string | string[]>;
  data: Data;
}

export type PagesFunction<
  Env = EdgeEnv,
  Params extends string = string,
  Data extends Record<string, unknown> = Record<string, unknown>,
> = (context: PagesEventContext<Env, Params, Data>) => Response | Promise<Response>;

/**
 * Runtime-agnostic storage adapter shared between Cloudflare Pages Functions (KV / Isolate Memory)
 * and local Node/Bun development (`data/` filesystem).
 */
export interface AtlasStorageAdapter {
  readonly persistenceKind: 'node-disk' | 'cloudflare-kv' | 'edge-memory';
  getSnapshot(): Promise<AtlasRawStoreSnapshot>;
  commitImport(params: {
    payload: unknown;
    target: ImportTarget;
    mode: ImportMode;
    dryRun: boolean;
  }): Promise<ImportExecutionResult>;
  getSchemaCatalog(): Promise<{
    schemaVersion: '1.0.0';
    schema: Record<string, unknown>;
    templates: Record<string, unknown>;
    counts: Record<BundleCollectionKey, number>;
  }>;
}
