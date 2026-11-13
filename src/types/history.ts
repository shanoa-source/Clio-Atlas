export type SpecialViewMode =
  | 'polity_only'
  | 'population_density'
  | 'night_lights'
  | 'transport_routes'
  | 'species_discovery'
  | 'mortality_catastrophe'
  | 'space_race';

export type OverlayLayerId = Exclude<SpecialViewMode, 'polity_only'>;

export type AppLanguage = 'zh' | 'en' | 'de';

export type ProjectionMode = '3d' | '2d';

export type SpaceStage = 'earth' | 'solar_system' | 'body_detail';

/** Inclusive [startYear, endYear] interval when timeline range selection is active, or null in standard mode */
export type TimeRangeSelection = [number, number] | null;

export type FlagVariantId =
  | 'archaic_owl'
  | 'delian_alliance'
  | 'imperial_athens'
  | 'strategoi_wartime'
  | 'ionian_siege';

export type TerritoryTier = 'metropolis' | 'cleruchy' | 'allied_tribute';

export type PolityBoundaryMode = 'demarcated' | 'unbounded';

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: [number, number][][][];
}

export interface GeoJsonMultiLineString {
  type: 'MultiLineString';
  coordinates: [number, number][][];
}

export interface PolityPhase {
  id: string;
  nameZh: string;
  nameEn: string;
  eraSubtitle: string;
  startYear: number; // Negative for BCE, e.g., -500 = 500 BCE
  endYear: number;   // Inclusive, e.g., -404 = 404 BCE
  representativeColor: string;
  borderColor: string;
  /**
   * Cartographic territory rendering mode:
   * - 'demarcated' (default): surveyed sovereign choropleth + smoothed outer frontier strokes for states with borders.
   * - 'unbounded': Core Zone (0.60–0.85 + soft edge) + wider Influence Zone (0.20–0.40) + smooth gradient falloff (Alpha -> 0) into Terra Nullius, strictly for ancient borderless civilizations/forces.
   */
  boundaryMode?: PolityBoundaryMode;
  /** Optional explicit continental Core Administrative & Settlement Zone lobes for 'unbounded' ancient civilizations */
  coreZones?: ThermalSubZone[];
  /** Optional explicit continental Radiating Influence Zone lobes for 'unbounded' ancient civilizations */
  influenceZones?: ThermalSubZone[];
  flagId?: FlagVariantId;
  /** Optional inline sanitized SVG markup (<svg ...>...</svg>) for custom historical flags */
  flagSvg?: string;
  /** Optional external/local asset URL or data:image/... URI for custom historical flags */
  flagAsset?: string;
  flagLabel: string;
  capitalName: string;
  capitalCoords: [number, number]; // [lon, lat]
  historicalSummary: string;
  sourceCitation: string;
}

export interface TerritoryRegion {
  id: string;
  polityId?: string;
  nameZh: string;
  nameI18n?: LocalizedStringMap;
  validFrom: number;
  validTo: number;
  tier: TerritoryTier;
  /**
   * Canonical OpenStreetMap Relation/Way IDs (e.g., "R957707", "R3301815").
   * For AI-generated import records, leave empty `[]` alongside `modernAdminNameEn` + `approxBBox`
   * and populate real IDs via `scripts/resolve-osm-ids.ts`.
   */
  osmIds: string[];
  approxBBox?: GeoBBox;
}

export interface ResolvedTerritoryFeature {
  id: string;
  polityId?: string;
  nameZh: string;
  nameI18n?: LocalizedStringMap;
  validFrom: number;
  validTo: number;
  tier: TerritoryTier;
  geometry: GeoJsonMultiPolygon;
  outerBoundary: GeoJsonMultiLineString;
  approxBBox?: GeoBBox;
}

export interface ThermalSubZone {
  coords: [number, number]; // [lon, lat]
  radiusLon: number;
  radiusLat: number;
  weightFactor?: number; // 0..1 multiplier relative to parent zone
}

export interface PopulationDensityNode {
  id: string;
  nameZh: string;
  center: [number, number]; // [lon, lat]
  radiusDegLon: number;
  radiusDegLat: number;
  validFrom: number;
  validTo: number;
  /** Keyframe densities [year, personsPerKm2][] */
  densityKeyframes: [number, number][];
  estimatedTotalNote: string;
  /** Optional multi-lobe land anchors so GPU heatmap forms organic geographic corridors */
  thermalSubZones?: ThermalSubZone[];
}

export interface NightLightNode {
  id: string;
  nameZh: string;
  category: 'urban_lamps' | 'harbor_beacon' | 'smelting_furnace' | 'sanctuary_flame';
  coords: [number, number]; // [lon, lat]
  spreadDeg: number;
  validFrom: number;
  validTo: number;
  /** Keyframe relative intensity [year, 0..1][] */
  intensityKeyframes: [number, number][];
  description: string;
}

export interface TransportRoute {
  id: string;
  nameZh: string;
  routeType: 'maritime' | 'overland';
  originName: string;
  destinationName: string;
  openedYear: number;
  closedYear: number;
  cargoSummary: string;
  waypoints: [number, number][]; // [lon, lat][] from origin to destination
  /** Annual voyages in given historical keyframes [year, tripsPerYear][] */
  usageKeyframes: [number, number][];
  sourceCitation: string;
}

export interface SpeciesDiscovery {
  id: string;
  commonNameZh: string;
  scientificName: string;
  /**
   * Generalized Classical / Canonical Source-Language Original Name
   * (Ancient Greek for Greece, Latin/Greek for Rome, Pre-Qin/Han-Tang classical name + transliteration for China, Classical Nahuatl for Mesoamerica, etc.).
   */
  classicalSourceName: string;
  kingdom: 'plantae' | 'animalia';
  /** For pre-Linnaean records (< 1735), strictly cite earliest extant textual chronicler / historical witness (never fabricate bureaus). */
  discovererZh: string;
  /** For pre-Linnaean records (< 1735), strictly cite earliest extant textual chronicler / historical witness in English. */
  discovererEn: string;
  /** For pre-Linnaean records (< 1735), anchor strictly to canonical text composition year or landmark historical event year (e.g., -480). */
  discoveryYear: number;
  locationNameZh: string;
  coords: [number, number]; // [lon, lat]
  historicalNote: string;
  sourceCitation: string;
}

export interface MortalityCatastrophe {
  id: string;
  nameZh: string;
  causeCategory: 'plague' | 'warfare' | 'siege_famine';
  startYear: number;
  endYear: number;
  locationNameZh: string;
  coords: [number, number]; // [lon, lat]
  spreadDeg: number;
  estimatedDeaths: number;
  historicalNote: string;
  sourceCitation: string;
  /** Optional multi-lobe land anchors (e.g. Long Walls corridor, Laurion, Salamis, Syracuse quarry path) */
  thermalSubZones?: ThermalSubZone[];
}

export interface CelestialBodySpec {
  id: string;
  nameZh: string;
  nameEn: string;
  kind: 'star' | 'planet' | 'moon';
  parentBodyId?: string;
  orbitRadiusUnits: number;
  orbitalPeriodYears: number;
  displayRadius: number;
  baseColor: string;
  secondaryColor: string;
  hasRings?: boolean;
  initialPhaseRad: number;
  descriptionZh: string;
}

export interface SpaceOrbitalProbe {
  id: string;
  nameZh: string;
  agency: string;
  orbitAltitudeRatio: number;
  inclinationDeg: number;
  activeFromYear: number;
  activeToYear: number;
  statusZh: string;
}

export interface SpaceSurfaceBase {
  id: string;
  nameZh: string;
  agency: string;
  kind: 'lander' | 'rover' | 'base';
  coords: [number, number]; // [lon, lat] on target body
  landedYear: number;
  statusZh: string;
}

export interface SpaceMission {
  id: string;
  nameZh: string;
  nameI18n?: LocalizedStringMap;
  agency: string;
  originBodyId: string;
  targetBodyId: string;
  launchYear: number;
  arrivalYear: number;
  missionStatusZh: string;
  missionStatusI18n?: LocalizedStringMap;
  orbitProbes: SpaceOrbitalProbe[];
  surfaceBases: SpaceSurfaceBase[];
}

export interface ScreenProjectedBubble {
  id: string;
  x: number;
  y: number;
  visible: boolean;
}

export type SelectedEntity =
  | {
      kind: 'polity';
      phase: PolityPhase;
      regionCount: number;
      clickedTerritoryId?: string;
      clickedTerritoryNameZh?: string;
      clickedTerritoryTier?: TerritoryTier;
    }
  | { kind: 'species'; species: SpeciesDiscovery }
  | { kind: 'route'; route: TransportRoute; annualTrips: number; colorHex: string }
  | { kind: 'catastrophe'; catastrophe: MortalityCatastrophe }
  | { kind: 'celestial'; body: CelestialBodySpec };

export type RegionDrawToolMode = 'none' | 'box' | 'circle';

export interface GeoBBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

export type MapRegionSelection =
  | {
      kind: 'territory';
      territoryId: string;
      nameZh: string;
      tier: TerritoryTier;
      bbox: GeoBBox;
      /** Simplified outer rings [lon, lat][][] for accurate spatial matching & map highlight */
      polygonRings?: [number, number][][];
    }
  | {
      kind: 'bbox';
      nameZh: string;
      bbox: GeoBBox;
    }
  | {
      kind: 'circle';
      nameZh: string;
      center: [number, number]; // [lon, lat]
      radiusKm: number;
      bbox: GeoBBox;
    };

export interface LocalizedStringMap {
  zh?: string;
  en?: string;
  de?: string;
}

export interface CustomHistoricalEvent {
  id?: string;
  title?: string;
  nameZh?: string;
  nameI18n?: LocalizedStringMap;
  year?: number;
  startYear?: number;
  endYear?: number;
  coords?: [number, number];
  bbox?: GeoBBox;
  locationNameZh?: string;
  locationI18n?: LocalizedStringMap;
  category?: string;
  categoryI18n?: LocalizedStringMap;
  relatedLayers?: OverlayLayerId[];
  metricLabel?: string;
  metricI18n?: LocalizedStringMap;
  summary?: string;
  description?: string;
  summaryI18n?: LocalizedStringMap;
  sourceCitation?: string;
}

export interface BookListItem {
  id?: string;
  title?: string;
  titleI18n?: LocalizedStringMap;
  author?: string;
  year?: string | number;
  region?: string;
  era?: string;
  startYear?: number;
  endYear?: number;
  bbox?: GeoBBox;
  relatedLayers?: OverlayLayerId[];
  isbn?: string;
  note?: string;
  noteI18n?: LocalizedStringMap;
}

export interface SystemPromptConfig {
  systemPrompt?: string;
  i18n?: LocalizedStringMap;
}

export interface ImportedPolityRecord extends PolityPhase {
  nameDe?: string;
  eraSubtitleI18n?: LocalizedStringMap;
  capitalNameI18n?: LocalizedStringMap;
  summaryI18n?: LocalizedStringMap;
}

export interface ImportedTerritoryRecord extends TerritoryRegion {
  polityId?: string;
  nameI18n?: LocalizedStringMap;
  /**
   * Standard English name of the modern corresponding administrative division (e.g., "Attica", "Lazio", "Shaanxi"),
   * used by `scripts/resolve-osm-ids.ts` to query Nominatim / Overpass API and populate real `osmIds`.
   */
  modernAdminNameEn?: string;
  /** Optional ISO 3166-1 alpha-2 country code (e.g., "GR", "IT", "CN") to disambiguate OSM lookup */
  countryCode?: string;
  /** Optional OpenStreetMap administrative level (2..10, e.g., 4 for province/region, 6 for prefecture/county) */
  adminLevel?: number;
  /** Bounding box [minLon, minLat, maxLon, maxLat] used by backend spatial queries and OSM post-processing lookup */
  approxBBox?: GeoBBox;
}

export interface ImportedPopulationNodeRecord extends PopulationDensityNode {
  nameI18n?: LocalizedStringMap;
  noteI18n?: LocalizedStringMap;
}

export interface ImportedNightLightNodeRecord extends NightLightNode {
  nameI18n?: LocalizedStringMap;
  descriptionI18n?: LocalizedStringMap;
}

export interface ImportedTransportRouteRecord extends TransportRoute {
  nameI18n?: LocalizedStringMap;
  originNameI18n?: LocalizedStringMap;
  destinationNameI18n?: LocalizedStringMap;
  cargoSummaryI18n?: LocalizedStringMap;
}

export interface ImportedSpeciesDiscoveryRecord extends SpeciesDiscovery {
  commonNameI18n?: LocalizedStringMap;
  discovererI18n?: LocalizedStringMap;
  locationNameI18n?: LocalizedStringMap;
  historicalNoteI18n?: LocalizedStringMap;
}

export interface ImportedMortalityCatastropheRecord extends MortalityCatastrophe {
  nameI18n?: LocalizedStringMap;
  locationNameI18n?: LocalizedStringMap;
  historicalNoteI18n?: LocalizedStringMap;
}

export interface ImportedSpaceMissionRecord extends SpaceMission {
  nameI18n?: LocalizedStringMap;
  missionStatusI18n?: LocalizedStringMap;
}

export interface AtlasImportBundle {
  schemaVersion: '1.0.0';
  updatedAt?: string;
  prompts?: SystemPromptConfig;
  polities: ImportedPolityRecord[];
  territories: ImportedTerritoryRecord[];
  populationNodes: ImportedPopulationNodeRecord[];
  nightLightNodes: ImportedNightLightNodeRecord[];
  transportRoutes: ImportedTransportRouteRecord[];
  speciesDiscoveries: ImportedSpeciesDiscoveryRecord[];
  mortalityCatastrophes: ImportedMortalityCatastropheRecord[];
  spaceMissions: ImportedSpaceMissionRecord[];
  books: BookListItem[];
  customEvents: CustomHistoricalEvent[];
}

export interface RegionEventSummaryItem {
  id: string;
  year: number;
  endYear?: number;
  yearLabel: string;
  category:
    | 'polity'
    | 'population'
    | 'night_light'
    | 'catastrophe'
    | 'species'
    | 'route'
    | 'custom';
  categoryLabelZh: string;
  titleZh: string;
  locationZh: string;
  metricLabel?: string;
  summaryZh: string;
  sourceCitation?: string;
}

export interface RegionPopulationNodeDetail {
  id: string;
  nameZh: string;
  densityPerKm2: number;
  rangeStartDensity?: number;
  rangeEndDensity?: number;
  note: string;
}

export interface RegionNightLightNodeDetail {
  id: string;
  nameZh: string;
  categoryZh: string;
  intensityPct: number;
  rangeStartPct?: number;
  rangeEndPct?: number;
  description: string;
}

export interface RegionLayerMetrics {
  matchedTerritoryNames: string[];
  populationNodeCount: number;
  peakDensityPerKm2: number | null;
  avgDensityPerKm2: number | null;
  nightLightNodeCount: number;
  peakNightLightPct: number | null;
  activeRouteCount: number;
  totalAnnualVoyages: number;
  catastropheCount: number;
  totalEstimatedDeaths: number;
  speciesCount: number;
}

export interface RegionOverviewData {
  hasSelection: boolean;
  selectionKind: 'none' | 'territory' | 'bbox' | 'circle';
  regionTitleZh: string;
  coordsSummary: string;
  currentYear: number;
  selectedRange: TimeRangeSelection;
  timeWindow: [number, number];
  timeLabelZh: string;
  activePolityNameZh: string | null;
  activeEraSubtitle: string | null;
  activeLayers: OverlayLayerId[];
  activeLayerLabelsZh: string[];
  metrics: RegionLayerMetrics;
  populationDetails: RegionPopulationNodeDetail[];
  nightLightDetails: RegionNightLightNodeDetail[];
  events: RegionEventSummaryItem[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  contextMode?: 'region' | 'global';
  regionLabel?: string;
  isError?: boolean;
  modelUsed?: string;
}

export type AiChannelMode = 'default' | 'custom';

export interface AiChannelConfig {
  mode: AiChannelMode;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
}


