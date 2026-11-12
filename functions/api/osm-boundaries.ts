import { handleOsmBoundariesRequest } from '../../src/edge/apiHandlers';
import { EdgeEnv, PagesFunction } from '../../src/edge/types';

/**
 * Cloudflare Pages Function: `GET /api/osm-boundaries`
 * Resolves OpenStreetMap administrative Relation/Way geometries using Cloudflare Edge Cache API + KV + Nominatim.
 */
export const onRequestGet: PagesFunction<EdgeEnv> = async (context) => {
  return handleOsmBoundariesRequest(context.request, context.env);
};
