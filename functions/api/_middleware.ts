import { CORS_HEADERS, jsonResponse } from '../../src/edge/apiHandlers';
import { EdgeEnv, PagesFunction } from '../../src/edge/types';

/**
 * Global Cloudflare Pages Functions `/api/*` Middleware:
 * - Responds to CORS `OPTIONS` preflight requests immediately at the edge.
 * - Catches unhandled exceptions and ensures consistent JSON error payloads + CORS headers.
 */
export const onRequest: PagesFunction<EdgeEnv> = async (context) => {
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  try {
    const response = await context.next();
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) {
      if (!headers.has(k)) {
        headers.set(k, v);
      }
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (err: any) {
    return jsonResponse(
      {
        error: 'Unhandled Edge Function error',
        detail: err?.message || String(err),
      },
      500,
    );
  }
};
