import { resolveExternalConfigFromSnapshot } from '../shared/dataValidator';
import {
  AppLanguage,
  AtlasImportBundle,
  BookListItem,
  CustomHistoricalEvent,
} from '../types/history';
import { loadDiskSnapshot } from './dataImportService';

export interface LoadedExternalDataConfig {
  customSystemPrompt: string;
  books: BookListItem[];
  customEvents: CustomHistoricalEvent[];
  bundle: AtlasImportBundle;
}

/**
 * Reads user-extensible configuration and imported JSON data from:
 * - `data/prompts/system_prompt.txt` & `data/prompts/system_prompt.json`
 * - `data/booklists/books.json`
 * - `data/events/custom_events.json`
 * - `data/imports/atlas_bundle.json`
 * Gracefully skips empty or missing files without throwing any error.
 */
export function loadExternalDataConfig(
  baseDir: string,
  language: AppLanguage = 'zh',
): LoadedExternalDataConfig {
  const snapshot = loadDiskSnapshot(baseDir);
  return resolveExternalConfigFromSnapshot(snapshot, language);
}
