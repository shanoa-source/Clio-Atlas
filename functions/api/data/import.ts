import { handleDataImportRequest } from '../../../src/edge/apiHandlers';
import { createEdgeStorageAdapter } from '../../../src/edge/storage';
import { EdgeEnv, PagesFunction } from '../../../src/edge/types';

/**
 * Cloudflare Pages Function: `POST /api/data/import`
 * Validates and persists imported historical datasets into Cloudflare Workers KV (`ATLAS_DATA_KV`) or isolate store.
 */
export const onRequestPost: PagesFunction<EdgeEnv> = async (context) => {
  const storage = createEdgeStorageAdapter(context.env);
  return handleDataImportRequest(context.request, context.env, storage);
};
