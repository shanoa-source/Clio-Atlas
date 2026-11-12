import { handleChatRequest } from '../../src/edge/apiHandlers';
import { createEdgeStorageAdapter } from '../../src/edge/storage';
import { EdgeEnv, PagesFunction } from '../../src/edge/types';

/**
 * Cloudflare Pages Function: `POST /api/chat`
 * Region-aware & multi-layer coupled AI historical analysis powered by `@google/genai`.
 */
export const onRequestPost: PagesFunction<EdgeEnv> = async (context) => {
  const storage = createEdgeStorageAdapter(context.env);
  return handleChatRequest(context.request, context.env, storage);
};
