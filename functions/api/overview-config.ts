import { handleOverviewConfigRequest } from '../../src/edge/apiHandlers';
import { createEdgeStorageAdapter } from '../../src/edge/storage';
import { EdgeEnv, PagesFunction } from '../../src/edge/types';

/**
 * Cloudflare Pages Function: `GET /api/overview-config`
 */
export const onRequestGet: PagesFunction<EdgeEnv> = async (context) => {
  const storage = createEdgeStorageAdapter(context.env);
  return handleOverviewConfigRequest(context.request, context.env, storage);
};
