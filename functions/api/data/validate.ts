import { handleDataValidateRequest } from '../../../src/edge/apiHandlers';
import { EdgeEnv, PagesFunction } from '../../../src/edge/types';

/**
 * Cloudflare Pages Function: `POST /api/data/validate`
 */
export const onRequestPost: PagesFunction<EdgeEnv> = async (context) => {
  return handleDataValidateRequest(context.request, context.env);
};
