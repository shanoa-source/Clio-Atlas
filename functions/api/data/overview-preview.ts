import { handleOverviewPreviewRequest } from '../../../src/edge/apiHandlers';
import { createEdgeStorageAdapter } from '../../../src/edge/storage';
import { EdgeEnv, PagesFunction } from '../../../src/edge/types';

/**
 * Cloudflare Pages Function: `POST /api/data/overview-preview`
 */
export const onRequestPost: PagesFunction<EdgeEnv> = async (context) => {
  const storage = createEdgeStorageAdapter(context.env);
  return handleOverviewPreviewRequest(context.request, context.env, storage);
};
