import 'dotenv/config';
import express, { Express, Request as ExpressRequest, Response as ExpressResponse } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  handleChatRequest,
  handleDataExportRequest,
  handleDataImportRequest,
  handleDataSchemaRequest,
  handleDataValidateRequest,
  handleOsmBoundariesRequest,
  handleOverviewConfigRequest,
  handleOverviewPreviewRequest,
} from './src/edge/apiHandlers';
import { AtlasStorageAdapter, EdgeEnv } from './src/edge/types';
import {
  getDataSchemaCatalog,
  importDataToDisk,
  loadDiskSnapshot,
} from './src/server/dataImportService';
import { GeoJsonMultiPolygon } from './src/types/history';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const CACHE_DIR = path.join(os.tmpdir(), 'civilization-atlas-osm-cache');
const CACHE_FILE = path.join(CACHE_DIR, 'osm-boundaries-v1.json');

const diskOsmCache = new Map<string, GeoJsonMultiPolygon>();

function loadDiskCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<
        string,
        GeoJsonMultiPolygon
      >;
      for (const [key, geom] of Object.entries(raw)) {
        if (geom && geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
          diskOsmCache.set(key, geom);
        }
      }
    }
  } catch {
    // Ignore corrupt cache and re-fetch cleanly
  }
}

function saveDiskCache(newlyResolved: ReadonlyMap<string, GeoJsonMultiPolygon>): void {
  try {
    for (const [k, v] of newlyResolved.entries()) {
      diskOsmCache.set(k, v);
    }
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const serialized: Record<string, GeoJsonMultiPolygon> = {};
    for (const [key, geom] of diskOsmCache.entries()) {
      serialized[key] = geom;
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(serialized), 'utf8');
  } catch {
    // Non-fatal in read-only environments
  }
}

loadDiskCache();

function createNodeDiskStorageAdapter(
  baseDir: string,
  rootSchemaDir: string,
): AtlasStorageAdapter {
  return {
    persistenceKind: 'node-disk',
    async getSnapshot() {
      return loadDiskSnapshot(baseDir);
    },
    async commitImport({ payload, target, mode, dryRun }) {
      return importDataToDisk({
        baseDir,
        payload,
        target,
        mode,
        dryRun,
      });
    },
    async getSchemaCatalog() {
      return getDataSchemaCatalog(rootSchemaDir, baseDir);
    },
  };
}

function buildEdgeEnvFromProcess(): EdgeEnv {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    APP_URL: process.env.APP_URL,
    CUSTOM_SYSTEM_PROMPT: process.env.CUSTOM_SYSTEM_PROMPT,
  };
}

function expressToWebRequest(req: ExpressRequest): Request {
  const host = req.headers.host || `127.0.0.1:${PORT}`;
  const url = `http://${host}${req.originalUrl || req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS';
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? JSON.stringify(req.body ?? {}) : undefined,
  });
}

async function sendWebResponseToExpress(webRes: Response, res: ExpressResponse): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const text = await webRes.text();
  res.send(text);
}

export interface CreateApiAppOptions {
  /** Base directory containing `data/` (defaults to workspace root `__dirname`) */
  baseDir?: string;
  /** Directory containing `data/schemas/` (defaults to workspace root `__dirname`) */
  rootSchemaDir?: string;
}

/**
 * Local Node/Express bridge delegating 100% of `/api/*` business logic to the shared
 * Web-standard Edge handlers (`src/edge/apiHandlers.ts`) used by Cloudflare Pages Functions.
 */
export function createApiApp(options: CreateApiAppOptions = {}): Express {
  const effectiveBaseDir = options.baseDir || __dirname;
  const effectiveSchemaDir = options.rootSchemaDir || __dirname;
  const diskStorage = createNodeDiskStorageAdapter(effectiveBaseDir, effectiveSchemaDir);

  const app = express();
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/overview-config', async (req, res) => {
    const webRes = await handleOverviewConfigRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
      diskStorage,
    );
    await sendWebResponseToExpress(webRes, res);
  });

  app.get('/api/data/schema', async (req, res) => {
    const webRes = await handleDataSchemaRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
      diskStorage,
    );
    await sendWebResponseToExpress(webRes, res);
  });

  app.post('/api/data/validate', async (req, res) => {
    const webRes = await handleDataValidateRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
    );
    await sendWebResponseToExpress(webRes, res);
  });

  app.post('/api/data/import', async (req, res) => {
    const webRes = await handleDataImportRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
      diskStorage,
    );
    await sendWebResponseToExpress(webRes, res);
  });

  app.get('/api/data/export', async (req, res) => {
    const webRes = await handleDataExportRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
      diskStorage,
    );
    await sendWebResponseToExpress(webRes, res);
  });

  app.post('/api/data/overview-preview', async (req, res) => {
    const webRes = await handleOverviewPreviewRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
      diskStorage,
    );
    await sendWebResponseToExpress(webRes, res);
  });

  app.post('/api/chat', async (req, res) => {
    const webRes = await handleChatRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
      diskStorage,
    );
    await sendWebResponseToExpress(webRes, res);
  });

  app.get('/api/osm-boundaries', async (req, res) => {
    const webRes = await handleOsmBoundariesRequest(
      expressToWebRequest(req),
      buildEdgeEnvFromProcess(),
      {
        initialCache: diskOsmCache,
        onBatchFetched: saveDiskCache,
      },
    );
    await sendWebResponseToExpress(webRes, res);
  });

  return app;
}

async function startServer(): Promise<void> {
  const app = createApiApp();

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

const isMainModule =
  Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isMainModule) {
  void startServer();
}
