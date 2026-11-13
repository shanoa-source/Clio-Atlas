import classicalAthensRaw from '../../data/datasets/classical_athens.json';
import romanPrincipateRaw from '../../data/datasets/roman_principate.json';
import solarSystemRaw from '../../data/datasets/solar_system.json';
import {
  AtlasImportBundle,
  CelestialBodySpec,
  CustomHistoricalEvent,
  ImportedMortalityCatastropheRecord,
  ImportedNightLightNodeRecord,
  ImportedPolityRecord,
  ImportedPopulationNodeRecord,
  ImportedSpeciesDiscoveryRecord,
  ImportedTerritoryRecord,
  ImportedTransportRouteRecord,
  SpaceMission,
} from '../types/history';

export interface AtlasDatasetPreset {
  id: string;
  nameZh: string;
  nameEn: string;
  nameDe: string;
  defaultYear: number;
  minYear: number;
  maxYear: number;
  cameraCenter: [number, number];
  cameraZoom: number;
}

interface RawDatasetFile extends AtlasImportBundle {
  datasetMeta?: {
    id: string;
    nameZh: string;
    nameEn: string;
    nameDe: string;
    defaultYear: number;
    cameraCenter: [number, number];
    cameraZoom: number;
  };
}

interface RawSolarSystemFile {
  schemaVersion: string;
  bodies: CelestialBodySpec[];
  spaceMissions: SpaceMission[];
}

const BUILTIN_DATASET_FILES: RawDatasetFile[] = [
  classicalAthensRaw as unknown as RawDatasetFile,
  romanPrincipateRaw as unknown as RawDatasetFile,
];

const SOLAR_SYSTEM_FILE = solarSystemRaw as unknown as RawSolarSystemFile;

function mergeById<T extends { id: string }>(...lists: Array<T[] | undefined>): T[] {
  const out: T[] = [];
  const indexById = new Map<string, number>();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item.id !== 'string') continue;
      const existing = indexById.get(item.id);
      if (existing !== undefined) {
        out[existing] = item;
      } else {
        indexById.set(item.id, out.length);
        out.push(item);
      }
    }
  }
  return out;
}

const BUILTIN_MERGED_BUNDLE: AtlasImportBundle = {
  schemaVersion: '1.0.0',
  polities: mergeById<ImportedPolityRecord>(...BUILTIN_DATASET_FILES.map((d) => d.polities)),
  territories: mergeById<ImportedTerritoryRecord>(
    ...BUILTIN_DATASET_FILES.map((d) => d.territories),
  ),
  populationNodes: mergeById<ImportedPopulationNodeRecord>(
    ...BUILTIN_DATASET_FILES.map((d) => d.populationNodes),
  ),
  nightLightNodes: mergeById<ImportedNightLightNodeRecord>(
    ...BUILTIN_DATASET_FILES.map((d) => d.nightLightNodes),
  ),
  transportRoutes: mergeById<ImportedTransportRouteRecord>(
    ...BUILTIN_DATASET_FILES.map((d) => d.transportRoutes),
  ),
  speciesDiscoveries: mergeById<ImportedSpeciesDiscoveryRecord>(
    ...BUILTIN_DATASET_FILES.map((d) => d.speciesDiscoveries),
  ),
  mortalityCatastrophes: mergeById<ImportedMortalityCatastropheRecord>(
    ...BUILTIN_DATASET_FILES.map((d) => d.mortalityCatastrophes),
  ),
  spaceMissions: mergeById<SpaceMission>(
    SOLAR_SYSTEM_FILE.spaceMissions,
    ...BUILTIN_DATASET_FILES.map((d) => d.spaceMissions),
  ),
  customEvents: [
    ...BUILTIN_DATASET_FILES.flatMap((d) => (Array.isArray(d.customEvents) ? d.customEvents : [])),
  ],
  books: [...BUILTIN_DATASET_FILES.flatMap((d) => (Array.isArray(d.books) ? d.books : []))],
};

let backendDatasetsBundle: AtlasImportBundle | null = null;
let runtimeImportedBundle: AtlasImportBundle | null = null;
const dataLayerListeners = new Set<() => void>();

export function subscribeAtlasDataLayer(listener: () => void): () => void {
  dataLayerListeners.add(listener);
  return () => {
    dataLayerListeners.delete(listener);
  };
}

export function setBackendDatasetsBundle(bundle: AtlasImportBundle | null | undefined): void {
  backendDatasetsBundle = bundle ?? null;
  dataLayerListeners.forEach((cb) => cb());
}

export function setRuntimeImportedBundle(bundle: AtlasImportBundle | null | undefined): void {
  runtimeImportedBundle = bundle ?? null;
  dataLayerListeners.forEach((cb) => cb());
}

export function getRuntimeImportedBundle(): AtlasImportBundle | null {
  return runtimeImportedBundle;
}

export function getBuiltinDatasetsBundle(): AtlasImportBundle {
  return BUILTIN_MERGED_BUNDLE;
}

export function getBackendDetectedDatasetSummary(): {
  datasetIds: string[];
  mergedBundle: AtlasImportBundle;
} {
  const datasetIds = BUILTIN_DATASET_FILES.map((ds, idx) =>
    ds.datasetMeta?.id ? ds.datasetMeta.id : `dataset_${idx + 1}`,
  );
  return {
    datasetIds,
    mergedBundle: BUILTIN_MERGED_BUNDLE,
  };
}

export function getPolityPhases(extraBundle?: AtlasImportBundle | null): ImportedPolityRecord[] {
  return mergeById<ImportedPolityRecord>(
    BUILTIN_MERGED_BUNDLE.polities,
    backendDatasetsBundle?.polities,
    runtimeImportedBundle?.polities,
    extraBundle?.polities,
  );
}

export function getTerritoryRegions(
  extraBundle?: AtlasImportBundle | null,
): ImportedTerritoryRecord[] {
  return mergeById<ImportedTerritoryRecord>(
    BUILTIN_MERGED_BUNDLE.territories,
    backendDatasetsBundle?.territories,
    runtimeImportedBundle?.territories,
    extraBundle?.territories,
  );
}

export function getPopulationNodes(
  extraBundle?: AtlasImportBundle | null,
): ImportedPopulationNodeRecord[] {
  return mergeById<ImportedPopulationNodeRecord>(
    BUILTIN_MERGED_BUNDLE.populationNodes,
    backendDatasetsBundle?.populationNodes,
    runtimeImportedBundle?.populationNodes,
    extraBundle?.populationNodes,
  );
}

export function getNightLightNodes(
  extraBundle?: AtlasImportBundle | null,
): ImportedNightLightNodeRecord[] {
  return mergeById<ImportedNightLightNodeRecord>(
    BUILTIN_MERGED_BUNDLE.nightLightNodes,
    backendDatasetsBundle?.nightLightNodes,
    runtimeImportedBundle?.nightLightNodes,
    extraBundle?.nightLightNodes,
  );
}

export function getTransportRoutes(
  extraBundle?: AtlasImportBundle | null,
): ImportedTransportRouteRecord[] {
  return mergeById<ImportedTransportRouteRecord>(
    BUILTIN_MERGED_BUNDLE.transportRoutes,
    backendDatasetsBundle?.transportRoutes,
    runtimeImportedBundle?.transportRoutes,
    extraBundle?.transportRoutes,
  );
}

export function getSpeciesDiscoveries(
  extraBundle?: AtlasImportBundle | null,
): ImportedSpeciesDiscoveryRecord[] {
  return mergeById<ImportedSpeciesDiscoveryRecord>(
    BUILTIN_MERGED_BUNDLE.speciesDiscoveries,
    backendDatasetsBundle?.speciesDiscoveries,
    runtimeImportedBundle?.speciesDiscoveries,
    extraBundle?.speciesDiscoveries,
  );
}

export function getMortalityCatastrophes(
  extraBundle?: AtlasImportBundle | null,
): ImportedMortalityCatastropheRecord[] {
  return mergeById<ImportedMortalityCatastropheRecord>(
    BUILTIN_MERGED_BUNDLE.mortalityCatastrophes,
    backendDatasetsBundle?.mortalityCatastrophes,
    runtimeImportedBundle?.mortalityCatastrophes,
    extraBundle?.mortalityCatastrophes,
  );
}

export function getSolarSystemBodies(): CelestialBodySpec[] {
  return SOLAR_SYSTEM_FILE.bodies;
}

export function getSpaceMissions(extraBundle?: AtlasImportBundle | null): SpaceMission[] {
  return mergeById<SpaceMission>(
    BUILTIN_MERGED_BUNDLE.spaceMissions,
    backendDatasetsBundle?.spaceMissions,
    runtimeImportedBundle?.spaceMissions,
    extraBundle?.spaceMissions,
  );
}

export function getCustomHistoricalEvents(
  extraEvents?: CustomHistoricalEvent[],
  extraBundle?: AtlasImportBundle | null,
): CustomHistoricalEvent[] {
  const combined: CustomHistoricalEvent[] = [
    ...(BUILTIN_MERGED_BUNDLE.customEvents || []),
    ...(extraEvents || []),
  ];
  const seen = new Set(combined.map((e) => e.id).filter(Boolean));
  for (const source of [
    backendDatasetsBundle?.customEvents,
    runtimeImportedBundle?.customEvents,
    extraBundle?.customEvents,
  ]) {
    if (!Array.isArray(source)) continue;
    for (const ev of source) {
      if (ev.id && seen.has(ev.id)) continue;
      if (ev.id) seen.add(ev.id);
      combined.push(ev);
    }
  }
  return combined;
}

/**
 * Dynamically derives the `[minYear, maxYear]` window strictly from the records present in a dataset bundle
 * (or the active merged data layer when omitted), with zero hardcoded civilization year constants.
 */
export function computeDatasetYearBounds(
  bundle?: Partial<AtlasImportBundle> | null,
): { minYear: number; maxYear: number } | null {
  const polities = bundle ? bundle.polities || [] : getPolityPhases();
  const territories = bundle ? bundle.territories || [] : getTerritoryRegions();
  const popNodes = bundle ? bundle.populationNodes || [] : getPopulationNodes();
  const nightNodes = bundle ? bundle.nightLightNodes || [] : getNightLightNodes();
  const routes = bundle ? bundle.transportRoutes || [] : getTransportRoutes();
  const species = bundle ? bundle.speciesDiscoveries || [] : getSpeciesDiscoveries();
  const catastrophes = bundle ? bundle.mortalityCatastrophes || [] : getMortalityCatastrophes();
  const missions = bundle ? bundle.spaceMissions || [] : getSpaceMissions();
  const customEvents = bundle ? bundle.customEvents || [] : getCustomHistoricalEvents();

  let minYear = Infinity;
  let maxYear = -Infinity;

  const pushYear = (y: unknown) => {
    if (typeof y === 'number' && Number.isFinite(y)) {
      if (y < minYear) minYear = y;
      if (y > maxYear) maxYear = y;
    }
  };

  for (const p of polities) {
    pushYear(p.startYear);
    pushYear(p.endYear);
  }
  for (const t of territories) {
    pushYear(t.validFrom);
    pushYear(t.validTo);
  }
  for (const n of popNodes) {
    pushYear(n.validFrom);
    pushYear(n.validTo);
  }
  for (const nl of nightNodes) {
    pushYear(nl.validFrom);
    pushYear(nl.validTo);
  }
  for (const r of routes) {
    pushYear(r.openedYear);
    pushYear(r.closedYear);
  }
  for (const sp of species) {
    pushYear(sp.discoveryYear);
  }
  for (const c of catastrophes) {
    pushYear(c.startYear);
    pushYear(c.endYear);
  }
  for (const sm of missions) {
    pushYear(sm.launchYear);
    pushYear(sm.arrivalYear);
  }
  for (const ce of customEvents) {
    pushYear(ce.year);
    pushYear(ce.startYear);
    pushYear(ce.endYear);
  }

  if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) {
    return null;
  }
  return {
    minYear: Math.round(minYear),
    maxYear: Math.round(maxYear),
  };
}

export function getAtlasDatasetPresets(): AtlasDatasetPreset[] {
  const presets: AtlasDatasetPreset[] = [];
  for (const ds of BUILTIN_DATASET_FILES) {
    const meta = ds.datasetMeta;
    if (!meta) continue;
    const bounds = computeDatasetYearBounds(ds) ?? {
      minYear: meta.defaultYear,
      maxYear: meta.defaultYear,
    };
    presets.push({
      id: meta.id,
      nameZh: meta.nameZh,
      nameEn: meta.nameEn,
      nameDe: meta.nameDe,
      defaultYear: meta.defaultYear,
      minYear: bounds.minYear,
      maxYear: bounds.maxYear,
      cameraCenter: meta.cameraCenter,
      cameraZoom: meta.cameraZoom,
    });
  }
  return presets;
}
