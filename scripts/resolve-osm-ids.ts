import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateImportPayload } from '../src/shared/dataValidator';
import {
  AtlasImportBundle,
  GeoBBox,
  ImportedTerritoryRecord,
} from '../src/types/history';

export interface OsmAdminLookupQuery {
  modernAdminNameEn: string;
  approxBBox: GeoBBox;
  countryCode?: string;
  adminLevel?: number;
}

export interface OsmResolverOptions {
  fetchImpl?: typeof fetch;
  /** Delay between live Nominatim/Overpass HTTP calls (defaults to 1100ms per OSM Usage Policy) */
  rateLimitMs?: number;
  /** Re-resolve territories even when `osmIds` is already populated */
  force?: boolean;
  userAgent?: string;
}

export interface TerritoryOsmResolutionItem {
  id: string;
  modernAdminNameEn?: string;
  osmIds: string[];
  source: 'existing' | 'nominatim' | 'overpass' | 'unresolved';
}

export interface BundleOsmResolutionReport {
  bundle: AtlasImportBundle;
  items: TerritoryOsmResolutionItem[];
  resolvedCount: number;
  skippedCount: number;
  unresolvedIds: string[];
}

const DEFAULT_USER_AGENT =
  'CivilizationEvolutionAtlas-OsmPostProcessor/1.0 (Historical GIS Administrative Resolver)';

export function buildNominatimSearchUrl(query: OsmAdminLookupQuery): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    q: query.modernAdminNameEn.trim(),
    // Nominatim viewbox order is: left(minLon),top(maxLat),right(maxLon),bottom(minLat)
    viewbox: `${query.approxBBox.minLon},${query.approxBBox.maxLat},${query.approxBBox.maxLon},${query.approxBBox.minLat}`,
    bounded: '1',
    addressdetails: '1',
    extratags: '1',
    limit: '10',
  });
  if (query.countryCode && /^[A-Za-z]{2}$/.test(query.countryCode.trim())) {
    params.set('countrycodes', query.countryCode.trim().toLowerCase());
  }
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

function escapeOverpassRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\"]/g, '\\$&');
}

export function buildOverpassAdminQuery(query: OsmAdminLookupQuery): string {
  const { minLat, minLon, maxLat, maxLon } = query.approxBBox;
  const escaped = escapeOverpassRegex(query.modernAdminNameEn.trim());
  const levelFilter =
    typeof query.adminLevel === 'number' && Number.isInteger(query.adminLevel)
      ? `["admin_level"="${query.adminLevel}"]`
      : '';
  return [
    '[out:json][timeout:25];',
    '(',
    `  relation["boundary"="administrative"]${levelFilter}["name:en"~"^${escaped}$",i](${minLat},${minLon},${maxLat},${maxLon});`,
    `  relation["boundary"="administrative"]${levelFilter}["int_name"~"^${escaped}$",i](${minLat},${minLon},${maxLat},${maxLon});`,
    `  relation["boundary"="administrative"]${levelFilter}["name"~"${escaped}",i](${minLat},${minLon},${maxLat},${maxLon});`,
    ');',
    'out tags bb;',
  ].join('\n');
}

function bboxesIntersect(a: GeoBBox, b: GeoBBox, toleranceDeg = 0.35): boolean {
  return !(
    a.maxLon + toleranceDeg < b.minLon ||
    a.minLon - toleranceDeg > b.maxLon ||
    a.maxLat + toleranceDeg < b.minLat ||
    a.minLat - toleranceDeg > b.maxLat
  );
}

function parseNominatimBBox(rawBox: unknown): GeoBBox | null {
  if (!Array.isArray(rawBox) || rawBox.length !== 4) return null;
  // Nominatim boundingbox is [southLat, northLat, westLon, eastLon]
  const south = Number(rawBox[0]);
  const north = Number(rawBox[1]);
  const west = Number(rawBox[2]);
  const east = Number(rawBox[3]);
  if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;
  return {
    minLon: west,
    minLat: south,
    maxLon: east,
    maxLat: north,
  };
}

export function selectBestNominatimCandidate(
  candidates: unknown[],
  query: OsmAdminLookupQuery,
): string[] {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];

  const targetLower = query.modernAdminNameEn.trim().toLowerCase();
  const scored: Array<{ osmId: string; score: number }> = [];

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue;
    const c = raw as Record<string, any>;
    const osmType = String(c.osm_type || '').toLowerCase();
    const osmNum = Number(c.osm_id);
    if ((osmType !== 'relation' && osmType !== 'way') || !Number.isInteger(osmNum) || osmNum <= 0) {
      continue;
    }

    const candBox = parseNominatimBBox(c.boundingbox);
    if (candBox && !bboxesIntersect(candBox, query.approxBBox)) {
      continue;
    }

    let score = 0;
    if (osmType === 'relation') score += 50;
    if (c.category === 'boundary' || c.class === 'boundary') score += 35;
    if (c.type === 'administrative') score += 30;

    const candidateAdminLevel = Number(c.extratags?.admin_level ?? c.admin_level);
    if (query.adminLevel !== undefined && Number.isInteger(candidateAdminLevel)) {
      const diff = Math.abs(candidateAdminLevel - query.adminLevel);
      score += Math.max(0, 20 - diff * 6);
    }

    const name = String(c.name || c.display_name || '').toLowerCase();
    if (name === targetLower) score += 25;
    else if (name.includes(targetLower)) score += 12;

    if (typeof c.importance === 'number' && Number.isFinite(c.importance)) {
      score += c.importance * 10;
    }

    const prefix = osmType === 'relation' ? 'R' : 'W';
    scored.push({ osmId: `${prefix}${osmNum}`, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.length > 0 ? [scored[0].osmId] : [];
}

export function selectBestOverpassCandidate(
  elements: unknown[],
  query: OsmAdminLookupQuery,
): string[] {
  if (!Array.isArray(elements) || elements.length === 0) return [];

  const targetLower = query.modernAdminNameEn.trim().toLowerCase();
  const scored: Array<{ osmId: string; score: number }> = [];

  for (const raw of elements) {
    if (!raw || typeof raw !== 'object') continue;
    const el = raw as Record<string, any>;
    const elType = String(el.type || '').toLowerCase();
    const elId = Number(el.id);
    if ((elType !== 'relation' && elType !== 'way') || !Number.isInteger(elId) || elId <= 0) {
      continue;
    }

    if (el.bounds && typeof el.bounds === 'object') {
      const candBox: GeoBBox = {
        minLon: Number(el.bounds.minlon),
        minLat: Number(el.bounds.minlat),
        maxLon: Number(el.bounds.maxlon),
        maxLat: Number(el.bounds.maxlat),
      };
      if (
        [candBox.minLon, candBox.minLat, candBox.maxLon, candBox.maxLat].every(Number.isFinite) &&
        !bboxesIntersect(candBox, query.approxBBox)
      ) {
        continue;
      }
    }

    const tags = (el.tags && typeof el.tags === 'object' ? el.tags : {}) as Record<string, string>;
    let score = elType === 'relation' ? 50 : 20;
    if (tags.boundary === 'administrative') score += 35;

    const nameEn = (tags['name:en'] || tags.int_name || '').toLowerCase();
    const localName = (tags.name || '').toLowerCase();
    if (nameEn === targetLower || localName === targetLower) score += 30;
    else if (nameEn.includes(targetLower) || localName.includes(targetLower)) score += 15;

    const lvl = Number(tags.admin_level);
    if (query.adminLevel !== undefined && Number.isInteger(lvl)) {
      score += Math.max(0, 20 - Math.abs(lvl - query.adminLevel) * 6);
    }

    const prefix = elType === 'relation' ? 'R' : 'W';
    scored.push({ osmId: `${prefix}${elId}`, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.length > 0 ? [scored[0].osmId] : [];
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function resolveSingleTerritoryOsmIds(
  territory: ImportedTerritoryRecord,
  options: OsmResolverOptions = {},
): Promise<TerritoryOsmResolutionItem> {
  const {
    fetchImpl = fetch,
    force = false,
    userAgent = DEFAULT_USER_AGENT,
  } = options;

  if (!force && Array.isArray(territory.osmIds) && territory.osmIds.length > 0) {
    return {
      id: territory.id,
      modernAdminNameEn: territory.modernAdminNameEn,
      osmIds: territory.osmIds,
      source: 'existing',
    };
  }

  if (!territory.modernAdminNameEn || !territory.approxBBox) {
    return {
      id: territory.id,
      modernAdminNameEn: territory.modernAdminNameEn,
      osmIds: territory.osmIds || [],
      source: 'unresolved',
    };
  }

  const query: OsmAdminLookupQuery = {
    modernAdminNameEn: territory.modernAdminNameEn,
    approxBBox: territory.approxBBox,
    countryCode: territory.countryCode,
    adminLevel: territory.adminLevel,
  };

  // 1. Primary lookup via Nominatim Search API (bounded to approxBBox)
  try {
    const nominatimUrl = buildNominatimSearchUrl(query);
    const nomRes = await fetchImpl(nominatimUrl, {
      headers: {
        'User-Agent': userAgent,
        Accept: 'application/json',
      },
    });
    if (nomRes.ok) {
      const candidates = (await nomRes.json()) as unknown[];
      const picked = selectBestNominatimCandidate(candidates, query);
      if (picked.length > 0) {
        return {
          id: territory.id,
          modernAdminNameEn: territory.modernAdminNameEn,
          osmIds: picked,
          source: 'nominatim',
        };
      }
    }
  } catch {
    // Fall through to Overpass API
  }

  // 2. Fallback lookup via Overpass API administrative relation search
  try {
    const overpassQuery = buildOverpassAdminQuery(query);
    const ovRes = await fetchImpl('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(overpassQuery)}`,
    });
    if (ovRes.ok) {
      const ovData = (await ovRes.json()) as { elements?: unknown[] };
      const picked = selectBestOverpassCandidate(ovData.elements || [], query);
      if (picked.length > 0) {
        return {
          id: territory.id,
          modernAdminNameEn: territory.modernAdminNameEn,
          osmIds: picked,
          source: 'overpass',
        };
      }
    }
  } catch {
    // Unresolved
  }

  return {
    id: territory.id,
    modernAdminNameEn: territory.modernAdminNameEn,
    osmIds: territory.osmIds || [],
    source: 'unresolved',
  };
}

/**
 * Post-processes all `territories` inside an `AtlasImportBundle`, resolving
 * `modernAdminNameEn` + `approxBBox` into verified OpenStreetMap Relation/Way IDs (`R...` / `W...`).
 */
export async function resolveTerritoriesInBundle(
  bundle: AtlasImportBundle,
  options: OsmResolverOptions = {},
): Promise<BundleOsmResolutionReport> {
  const rateLimitMs = options.rateLimitMs ?? 1100;
  const updatedTerritories: ImportedTerritoryRecord[] = [];
  const items: TerritoryOsmResolutionItem[] = [];
  let resolvedCount = 0;
  let skippedCount = 0;
  const unresolvedIds: string[] = [];

  for (let i = 0; i < bundle.territories.length; i++) {
    const terr = bundle.territories[i];
    const needsNetwork =
      Boolean(options.force) || !Array.isArray(terr.osmIds) || terr.osmIds.length === 0;

    const item = await resolveSingleTerritoryOsmIds(terr, options);
    items.push(item);

    if (item.source === 'existing') {
      skippedCount++;
      updatedTerritories.push(terr);
    } else if (item.source === 'nominatim' || item.source === 'overpass') {
      resolvedCount++;
      updatedTerritories.push({
        ...terr,
        osmIds: item.osmIds,
      });
    } else {
      unresolvedIds.push(terr.id);
      updatedTerritories.push(terr);
    }

    if (needsNetwork && i + 1 < bundle.territories.length) {
      await sleep(rateLimitMs);
    }
  }

  return {
    bundle: {
      ...bundle,
      territories: updatedTerritories,
    },
    items,
    resolvedCount,
    skippedCount,
    unresolvedIds,
  };
}

async function runCli(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'Usage: npx tsx scripts/resolve-osm-ids.ts <input-bundle.json> [--out <output.json>] [--force] [--dry-run]',
        '',
        'Resolves AI-generated territory records (modernAdminNameEn + approxBBox) into canonical',
        'OpenStreetMap Relation/Way IDs (e.g. R957707) via Nominatim and Overpass API.',
      ].join('\n'),
    );
    process.exit(0);
  }

  let inputPath = '';
  let outputPath = '';
  let force = false;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out' && args[i + 1]) {
      outputPath = args[++i];
    } else if (arg === '--force') {
      force = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (!arg.startsWith('--') && !inputPath) {
      inputPath = arg;
    }
  }

  if (!inputPath) {
    console.error('Error: Missing <input-bundle.json> path.');
    process.exit(1);
  }

  const absIn = path.resolve(process.cwd(), inputPath);
  const absOut = path.resolve(process.cwd(), outputPath || inputPath);
  if (!fs.existsSync(absIn)) {
    console.error(`Error: Input file does not exist: ${absIn}`);
    process.exit(1);
  }

  const rawJson = JSON.parse(fs.readFileSync(absIn, 'utf8'));
  const isStandaloneArray = Array.isArray(rawJson);
  const candidatePayload = isStandaloneArray
    ? { schemaVersion: '1.0.0', territories: rawJson }
    : rawJson;

  const initialValidation = validateImportPayload(candidatePayload, 'bundle');
  if (!initialValidation.valid) {
    console.error('Input JSON failed validation before OSM resolution:');
    for (const err of initialValidation.errors) {
      console.error(`  - ${err.path}: ${err.message}`);
    }
    process.exit(1);
  }

  const report = await resolveTerritoriesInBundle(initialValidation.normalized, { force });
  for (const item of report.items) {
    console.log(
      `[${item.source.toUpperCase()}] ${item.id} (${item.modernAdminNameEn || 'n/a'}) -> ${
        item.osmIds.join(', ') || 'UNRESOLVED'
      }`,
    );
  }

  if (!dryRun) {
    const outputData = isStandaloneArray ? report.bundle.territories : report.bundle;
    fs.writeFileSync(absOut, `${JSON.stringify(outputData, null, 2)}\n`, 'utf8');
    console.log(
      `Wrote ${absOut} (resolved: ${report.resolvedCount}, existing: ${report.skippedCount}, unresolved: ${report.unresolvedIds.length}).`,
    );
  } else {
    console.log(
      `Dry run complete (resolved: ${report.resolvedCount}, existing: ${report.skippedCount}, unresolved: ${report.unresolvedIds.length}).`,
    );
  }

  if (report.unresolvedIds.length > 0) {
    process.exitCode = 2;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(currentFile)) {
  void runCli();
}
