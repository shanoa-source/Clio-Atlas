import rawBooksJson from '../../data/booklists/books.json';
import rawCustomEventsJson from '../../data/events/custom_events.json';
import rawAtlasBundleJson from '../../data/imports/atlas_bundle.json';
import rawSchemaJson from '../../data/schemas/atlas_import_bundle.schema.json';
import rawTemplatesJson from '../../data/schemas/import_templates.json';
import {
  AtlasRawStoreSnapshot,
  createEmptyAtlasBundle,
  validateImportPayload,
} from '../shared/dataValidator';
import { BookListItem, CustomHistoricalEvent } from '../types/history';

export const BUNDLED_ATLAS_SCHEMA = rawSchemaJson as Record<string, unknown>;
export const BUNDLED_IMPORT_TEMPLATES = rawTemplatesJson as Record<string, unknown>;

/**
 * Builds the baseline `AtlasRawStoreSnapshot` from build-time bundled `/data/*` JSON assets.
 * Because Cloudflare Pages Functions run inside stateless V8 isolates without `node:fs`,
 * Wrangler/esbuild bundles these JSON modules directly into the Edge Worker at build time.
 */
export function buildBundledInitialSnapshot(customPromptEnv = ''): AtlasRawStoreSnapshot {
  const bundle =
    rawAtlasBundleJson &&
    typeof rawAtlasBundleJson === 'object' &&
    !Array.isArray(rawAtlasBundleJson)
      ? validateImportPayload(rawAtlasBundleJson, 'bundle').normalized
      : createEmptyAtlasBundle();

  const books: BookListItem[] = Array.isArray(rawBooksJson)
    ? validateImportPayload(rawBooksJson, 'books').normalized.books
    : [];

  const customEvents: CustomHistoricalEvent[] = Array.isArray(rawCustomEventsJson)
    ? validateImportPayload(rawCustomEventsJson, 'events').normalized.customEvents
    : [];

  return {
    bundle,
    books,
    customEvents,
    promptsJson: {},
    promptTxt: customPromptEnv.trim(),
  };
}
