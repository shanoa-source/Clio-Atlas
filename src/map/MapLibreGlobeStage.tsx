import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { AnimatePresence, motion } from 'motion/react';

maplibregl.setWorkerUrl(maplibreWorkerUrl);
import {
  AppLanguage,
  MapRegionSelection,
  OverlayLayerId,
  PolityPhase,
  ProjectionMode,
  RegionDrawToolMode,
  SelectedEntity,
  SpaceStage,
  SpeciesDiscovery,
  TimeRangeSelection,
} from '../types/history';
import {
  formatYearByLang,
  localizePolity,
  localizeSpecies,
  UI_TEXT,
} from '../i18n/translations';
import { getMortalityCatastrophes } from '../shared/atlasDataLayer';
import {
  clamp,
  computeMortalityEventEnvelope,
  densifyAndSliceWaypoints,
  getActiveMortalityCatastrophes,
  getActivePolityPhases,
  getActiveSpeciesDiscoveries,
  getActiveTransportRoutes,
  resolvePolityForTerritory,
  smootherstep01,
} from '../utils/geoMath';
import {
  bboxToPolygonRing,
  computeCircleBBox,
  createGeodesicCircleRing,
  haversineDistanceKm,
} from '../utils/regionSelector';
import {
  computeMortalityThermalPoints,
  computeNightLightPixels,
  computeNightLightThermalPoints,
  computePopulationThermalPoints,
} from '../utils/pixelLayers';
import { useOsmResolvedTerritories } from '../services/osmBoundaryService';
import {
  hitTestUnboundedPolityAtLngLat,
  isUnboundedPolity,
  UnboundedPolityFieldResult,
} from '../utils/unboundedPolityField';
import {
  buildZoomAdaptiveBorderPaintSpecs,
  DemarcatedSlotItem,
  GeopoliticalTransitionController,
  GeopoliticalTransitionFrame,
} from '../utils/polityTransitionEngine';
import {
  buildGlobeSkySpec,
  buildOfflineDarkMatterStyle,
  preloadCartoDarkMatterStyle,
  sanitizeCartoDarkMatterStyle,
} from './cartoStyleBuilder';
import { HistoricalFlagSvg } from '../components/HistoricalFlagSvg';

interface MapLibreGlobeStageProps {
  language: AppLanguage;
  currentYear: number;
  selectedRange: TimeRangeSelection;
  activeLayers: OverlayLayerId[];
  projectionMode: ProjectionMode;
  selectedRegion: MapRegionSelection | null;
  drawToolMode: RegionDrawToolMode;
  cameraCommand: {
    id: number;
    kind: 'zoom_in' | 'zoom_out' | 'reset_north' | 'fly_to';
    center?: [number, number];
    zoom?: number;
  } | null;
  onSpaceStageChange: (stage: SpaceStage, bodyId?: string) => void;
  onSelectEntity: (entity: SelectedEntity | null) => void;
  onSelectRegion: (region: MapRegionSelection | null) => void;
  onFinishDrawTool: () => void;
  onHoverCoordsChange?: (coords: [number, number] | null) => void;
  onMapStyleReady?: () => void;
  onInitialParcelsReady?: () => void;
}

interface ProjectedPolityAnchor {
  polity: PolityPhase;
  x: number;
  y: number;
  visible: boolean;
}

interface ProjectedSpeciesBubble {
  species: SpeciesDiscovery;
  anchorX: number;
  anchorY: number;
  x: number;
  y: number;
  visible: boolean;
}

type FadeableLayerKey = 'pop' | 'night' | 'routes' | 'mort' | 'species';

function createRouteArrowImageData(): { width: number; height: number; data: Uint8Array } {
  const size = 28;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(24, 14);
  ctx.lineTo(6, 5);
  ctx.lineTo(11.5, 14);
  ctx.lineTo(6, 23);
  ctx.closePath();
  ctx.fill();
  const img = ctx.getImageData(0, 0, size, size);
  return { width: size, height: size, data: new Uint8Array(img.data.buffer) };
}

/**
 * Checks whether [lon, lat] is on the front-facing hemisphere of the 3D Globe relative to map center.
 */
function isFrontHemisphere(
  pointLon: number,
  pointLat: number,
  centerLon: number,
  centerLat: number,
): boolean {
  const rad = Math.PI / 180;
  const lat1 = pointLat * rad;
  const lat2 = centerLat * rad;
  const dLon = (pointLon - centerLon) * rad;
  const cosAngle =
    Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return cosAngle > 0.14;
}

const EMPTY_FC = {
  type: 'FeatureCollection' as const,
  features: [] as any[],
};

const EMPTY_SPECIES_LIST: SpeciesDiscovery[] = [];

export const MapLibreGlobeStage: React.FC<MapLibreGlobeStageProps> = ({
  language,
  currentYear,
  selectedRange,
  activeLayers,
  projectionMode,
  selectedRegion,
  drawToolMode,
  cameraCommand,
  onSpaceStageChange,
  onSelectEntity,
  onSelectRegion,
  onFinishDrawTool,
  onHoverCoordsChange,
  onMapStyleReady,
  onInitialParcelsReady,
}) => {
  const ui = UI_TEXT[language];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layersReadyRef = useRef<boolean>(false);
  const initialParcelsNotifiedRef = useRef<boolean>(false);
  const baseLayerIdsRef = useRef<{ landuseIds: string[]; symbolIds: string[] }>({
    landuseIds: [],
    symbolIds: [],
  });

  const [flagOverlays, setFlagOverlays] = useState<ProjectedPolityAnchor[]>([]);
  const [speciesBubbles, setSpeciesBubbles] = useState<ProjectedSpeciesBubble[]>([]);
  const [dragPreview, setDragPreview] = useState<{
    startX: number;
    startY: number;
    curX: number;
    curY: number;
  } | null>(null);

  const hasSpeciesLayer = activeLayers.includes('species_discovery');
  const hasSpaceLayer = activeLayers.includes('space_race');

  const prevPolitiesRef = useRef<{ sig: string; list: PolityPhase[] }>({ sig: '', list: [] });
  const activePolities: PolityPhase[] = useMemo(() => {
    const next = getActivePolityPhases(currentYear);
    const sig = next.map((p) => p.id).join(',');
    if (sig === prevPolitiesRef.current.sig) {
      return prevPolitiesRef.current.list;
    }
    prevPolitiesRef.current = { sig, list: next };
    return next;
  }, [currentYear]);
  const { activeTerritories, loadingSnapshot } = useOsmResolvedTerritories(currentYear);
  const activeSpecies = useMemo(
    () =>
      hasSpeciesLayer
        ? getActiveSpeciesDiscoveries(currentYear, selectedRange)
        : EMPTY_SPECIES_LIST,
    [currentYear, selectedRange, hasSpeciesLayer],
  );

  const latestRef = useRef({
    currentYear,
    selectedRange,
    activeLayers,
    projectionMode,
    selectedRegion,
    drawToolMode,
    activePolities,
    activeTerritories,
    loadingSnapshot,
    activeSpecies,
    onSpaceStageChange,
    onSelectEntity,
    onSelectRegion,
    onHoverCoordsChange,
    onMapStyleReady,
    onInitialParcelsReady,
  });
  latestRef.current = {
    currentYear,
    selectedRange,
    activeLayers,
    projectionMode,
    selectedRegion,
    drawToolMode,
    activePolities,
    activeTerritories,
    loadingSnapshot,
    activeSpecies,
    onSpaceStageChange,
    onSelectEntity,
    onSelectRegion,
    onHoverCoordsChange,
    onMapStyleReady,
    onInitialParcelsReady,
  };

  const syncApiRef = useRef<{
    syncDataLayers: () => void;
    syncProjectedOverlays: () => void;
    syncThemePaint: () => void;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let routeAnimRaf = 0;
    let layerFadeRaf = 0;
    let geoFadeRaf = 0;
    let mortalityAnimTimer = 0;
    let hoverRaf = 0;
    let moveRaf = 0;

    const knownOpenRoutes = new Set<string>();
    const routeAnimStartMs = new Map<string, number>();
    const displayedMortalityEnv = new Map<string, number>();
    const mortStartEnv = new Map<string, number>();
    const mortTargetEnv = new Map<string, number>();
    let mortTweenStartMs = 0;
    let mortalityEnvInitialized = false;
    let prevSyncedYear: number | null = null;
    const lastPaintCache = new Map<string, number | string>();
    let lastThemeNight: boolean | null = null;
    const geoTransition = new GeopoliticalTransitionController();
    let hasRenderedInitialGeo = false;
    let lastSteadyDemarcatedSig = '__init__';
    let lastEnteringDemarcatedSig = '__init__';
    let lastExitingDemarcatedSig = '__init__';
    let lastSteadyUnboundedSig = '__init__';
    let lastEnteringUnboundedSig = '__init__';
    let lastExitingUnboundedSig = '__init__';
    let lastSelectedRegionSig = '__init__';
    let lastFlagOverlaySig = '';
    let lastHoverCoordSig = '';
    let lastCursorQueryMs = 0;
    let lastCursorStyle = '';

    // Wall-clock C² quintic GPU cross-fade state (0.0 -> 1.0 over 280ms; 0% idle CPU once settled)
    const layerFadeCurrent: Record<FadeableLayerKey, number> = {
      pop: 0,
      night: 0,
      routes: 0,
      mort: 0,
      species: 0,
    };
    const layerFadeStart: Record<FadeableLayerKey, number> = {
      pop: 0,
      night: 0,
      routes: 0,
      mort: 0,
      species: 0,
    };
    const layerFadeTarget: Record<FadeableLayerKey, number> = {
      pop: 0,
      night: 0,
      routes: 0,
      mort: 0,
      species: 0,
    };
    const layerFadeStartMs: Record<FadeableLayerKey, number> = {
      pop: 0,
      night: 0,
      routes: 0,
      mort: 0,
      species: 0,
    };

    let cleanupInstance: (() => void) | null = null;

    void preloadCartoDarkMatterStyle(950).then((rawCartoJson) => {
      if (cancelled || !containerRef.current) return;

      const isNightInit = latestRef.current.activeLayers.includes('night_lights');
      const projInit = latestRef.current.projectionMode === '3d' ? 'globe' : 'mercator';

      const initialStyle = rawCartoJson
        ? sanitizeCartoDarkMatterStyle(rawCartoJson, isNightInit, projInit, true)
        : buildOfflineDarkMatterStyle(isNightInit, projInit);

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: initialStyle,
        center: [23.8, 37.6],
        zoom: 3.55,
        pitch: latestRef.current.projectionMode === '3d' ? 16 : 0,
        bearing: 0,
        minZoom: 1.15,
        maxZoom: 12,
        fadeDuration: 0,
        attributionControl: false,
        canvasContextAttributes: {
          preserveDrawingBuffer: true,
          antialias: true,
        },
      });
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
      mapRef.current = map;

    function syncProjectedOverlays() {
      if (cancelled) return;
      const {
        projectionMode: proj,
        activePolities: polList,
        activeSpecies: spList,
      } = latestRef.current;

      const w = container?.clientWidth || window.innerWidth;
      const h = container?.clientHeight || window.innerHeight;
      const center = map.getCenter();

      if (polList.length > 0) {
        const nextFlags = polList.map((pol) => {
          const [lon, lat] = pol.capitalCoords;
          const visible =
            proj === '2d' || isFrontHemisphere(lon, lat, center.lng, center.lat);
          const pt = map.project([lon, lat]);
          const rx = Math.round(pt.x * 2) * 0.5;
          const ry = Math.round(pt.y * 2) * 0.5;
          return {
            polity: pol,
            x: rx,
            y: ry,
            visible:
              visible && rx >= -60 && rx <= w + 60 && ry >= -60 && ry <= h + 60,
          };
        });
        const sig = nextFlags
          .map((f) => `${f.polity.id}:${f.x}:${f.y}:${f.visible ? 1 : 0}`)
          .join('|');
        if (sig !== lastFlagOverlaySig) {
          lastFlagOverlaySig = sig;
          setFlagOverlays(nextFlags);
        }
      } else if (lastFlagOverlaySig !== 'empty') {
        lastFlagOverlaySig = 'empty';
        setFlagOverlays([]);
      }

      if (spList.length > 0) {
        const raw = spList.map((sp) => {
          const [lon, lat] = sp.coords;
          const visible =
            proj === '2d' || isFrontHemisphere(lon, lat, center.lng, center.lat);
          const pt = map.project([lon, lat]);
          return {
            species: sp,
            anchorX: pt.x,
            anchorY: pt.y,
            x: pt.x,
            y: pt.y - 26,
            visible: visible && pt.x >= 20 && pt.x <= w - 20 && pt.y >= 40 && pt.y <= h - 40,
          };
        });

        const vis = raw
          .filter((b) => b.visible)
          .sort((a, b) => a.anchorY - b.anchorY || a.anchorX - b.anchorX);

        for (let i = 0; i < vis.length; i++) {
          for (let j = 0; j < i; j++) {
            if (Math.abs(vis[i].x - vis[j].x) < 244 && Math.abs(vis[i].y - vis[j].y) < 68) {
              vis[i].x = clamp(
                vis[i].anchorX + (i % 2 === 1 ? 142 : -142),
                136,
                w - 136,
              );
            }
          }
          for (let j = 0; j < i; j++) {
            if (Math.abs(vis[i].x - vis[j].x) < 244 && Math.abs(vis[i].y - vis[j].y) < 68) {
              vis[i].y = clamp(vis[j].y + 70, 96, h - 156);
            }
          }
        }

        setSpeciesBubbles(raw);
      } else {
        setSpeciesBubbles((prev) => (prev.length === 0 ? prev : []));
      }
    }

    function syncThemePaint() {
      if (!layersReadyRef.current || cancelled) return;
      const isNight = latestRef.current.activeLayers.includes('night_lights');
      if (lastThemeNight === isNight) return;
      lastThemeNight = isNight;

      const landColor = isNight ? '#0b0e15' : '#181d27';
      const landCoverColor = isNight ? '#0d111a' : '#1c222e';
      const waterColor = isNight ? '#04060b' : '#090d16';
      const riverColor = isNight ? '#0e1726' : '#162233';
      const coastlineColor = isNight ? '#1b2638' : '#2a364b';

      if (map.getLayer('background')) {
        map.setPaintProperty('background', 'background-color', landColor);
      }
      if (map.getLayer('ne-ocean-base')) {
        map.setPaintProperty('ne-ocean-base', 'background-color', waterColor);
      }
      if (map.getLayer('ne-land-fill-underlay')) {
        map.setPaintProperty('ne-land-fill-underlay', 'fill-color', landColor);
      }
      if (map.getLayer('ne-land-coast-underlay')) {
        map.setPaintProperty('ne-land-coast-underlay', 'line-color', coastlineColor);
      }
      if (map.getLayer('water')) {
        map.setPaintProperty('water', 'fill-color', waterColor);
        map.setPaintProperty('water', 'fill-opacity', 0.9995);
      }
      if (map.getLayer('waterway')) {
        map.setPaintProperty('waterway', 'line-color', riverColor);
      }
      if (map.getLayer('carto-water-coastline-crisp')) {
        map.setPaintProperty('carto-water-coastline-crisp', 'line-color', coastlineColor);
      }
      for (const lid of baseLayerIdsRef.current.landuseIds) {
        if (map.getLayer(lid)) {
          map.setPaintProperty(lid, 'fill-color', landCoverColor);
        }
      }
      for (const sid of baseLayerIdsRef.current.symbolIds) {
        if (map.getLayer(sid)) {
          map.setPaintProperty(
            sid,
            'text-color',
            isNight ? 'rgba(100, 116, 139, 0.34)' : 'rgba(148, 163, 184, 0.48)',
          );
        }
      }

      map.setSky(buildGlobeSkySpec(isNight));
    }

    function setPaintIfChanged(layerId: string, prop: string, val: number) {
      if (!map.getLayer(layerId)) return;
      const cacheKey = `p:${layerId}:${prop}`;
      if (lastPaintCache.get(cacheKey) === val) return;
      lastPaintCache.set(cacheKey, val);
      map.setPaintProperty(layerId, prop as any, val);
    }

    function setVisIfChanged(layerId: string, visible: boolean) {
      if (!map.getLayer(layerId)) return;
      const v = visible ? 'visible' : 'none';
      const cacheKey = `v:${layerId}`;
      if (lastPaintCache.get(cacheKey) === v) return;
      lastPaintCache.set(cacheKey, v);
      map.setLayoutProperty(layerId, 'visibility', v);
    }

    function setScaledFillOpacityIfChanged(layerId: string, scaleFactor: number) {
      if (!map.getLayer(layerId)) return;
      const clamped = +clamp(scaleFactor, 0, 1).toFixed(3);
      const vis = clamped > 0.004;
      setVisIfChanged(layerId, vis);
      if (!vis) return;
      const cacheKey = `fo:${layerId}`;
      if (lastPaintCache.get(cacheKey) === clamped) return;
      lastPaintCache.set(cacheKey, clamped);
      const expr: any =
        clamped >= 0.999 ? ['get', 'fillOpacity'] : ['*', ['get', 'fillOpacity'], clamped];
      map.setPaintProperty(layerId, 'fill-opacity', expr);
    }

    function applyGeopoliticalPaint(frame: GeopoliticalTransitionFrame) {
      if (!layersReadyRef.current || cancelled) return;

      const thermalBlend = Math.max(layerFadeCurrent.pop, layerFadeCurrent.mort);
      const nightBlend = layerFadeCurrent.night;
      const demarcatedThemeScale = 1 - Math.max(thermalBlend * 0.74, nightBlend * 0.66);
      const unboundedThemeScale = 1 - Math.max(thermalBlend * 0.66, nightBlend * 0.54);
      const surfaceBorderBlend = Math.max(thermalBlend, nightBlend * 0.85);

      const baseStrokeOp = 0.96 - surfaceBorderBlend * 0.42;
      const baseCasingOp = 0.9 - surfaceBorderBlend * 0.46;
      const baseRibbonOp = 0.28 - surfaceBorderBlend * 0.18;

      const applyDemarcatedSlotPaint = (
        suffix: '' | '-entering' | '-exiting',
        hasItems: boolean,
        factor: number,
      ) => {
        const fillId = `polity-fill${suffix}`;
        const strokeId = `polity-stroke${suffix}`;
        const casingId = `polity-casing${suffix}`;
        const ribbonId = `polity-inner-ribbon${suffix}`;

        const effFactor = hasItems ? factor : 0;
        setScaledFillOpacityIfChanged(fillId, effFactor * demarcatedThemeScale);

        const sOp = +(baseStrokeOp * effFactor).toFixed(3);
        const cOp = +(baseCasingOp * effFactor).toFixed(3);
        const rOp = +(baseRibbonOp * effFactor).toFixed(3);

        setVisIfChanged(strokeId, sOp > 0.004);
        setVisIfChanged(casingId, cOp > 0.004);
        setVisIfChanged(ribbonId, rOp > 0.004);

        if (sOp > 0.004) setPaintIfChanged(strokeId, 'line-opacity', sOp);
        if (cOp > 0.004) setPaintIfChanged(casingId, 'line-opacity', cOp);
        if (rOp > 0.004) setPaintIfChanged(ribbonId, 'line-opacity', rOp);
      };

      applyDemarcatedSlotPaint('', frame.steadyDemarcated.length > 0, 1);
      applyDemarcatedSlotPaint(
        '-entering',
        frame.enteringDemarcated.length > 0,
        frame.enteringFactor,
      );
      applyDemarcatedSlotPaint('-exiting', frame.exitingDemarcated.length > 0, frame.exitingFactor);

      const applyUnboundedSlotPaint = (
        suffix: '' | '-entering' | '-exiting',
        cohort: GeopoliticalTransitionFrame['steadyUnbounded'],
        factor: number,
      ) => {
        const hasGlaze = Boolean(cohort && cohort.field.glazeParcels.length > 0);
        const hasShells = Boolean(cohort && cohort.field.shells.length > 0);
        const uScale = factor * unboundedThemeScale;
        setScaledFillOpacityIfChanged(`unbounded-influence-glaze${suffix}`, hasGlaze ? uScale : 0);
        setScaledFillOpacityIfChanged(`unbounded-core-glaze${suffix}`, hasGlaze ? uScale : 0);
        setScaledFillOpacityIfChanged(`unbounded-sphere-fill${suffix}`, hasShells ? uScale : 0);
      };

      applyUnboundedSlotPaint('', frame.steadyUnbounded, 1);
      applyUnboundedSlotPaint('-entering', frame.enteringUnbounded, frame.enteringFactor);
      applyUnboundedSlotPaint('-exiting', frame.exitingUnbounded, frame.exitingFactor);
    }

    function uploadDemarcatedSlot(
      polySourceName: string,
      boundarySourceName: string,
      items: DemarcatedSlotItem[],
    ) {
      const pSrc = map.getSource(polySourceName) as maplibregl.GeoJSONSource | undefined;
      const bSrc = map.getSource(boundarySourceName) as maplibregl.GeoJSONSource | undefined;
      if (!pSrc || !bSrc) return;

      if (items.length === 0) {
        pSrc.setData(EMPTY_FC);
        bSrc.setData(EMPTY_FC);
        return;
      }

      pSrc.setData({
        type: 'FeatureCollection',
        features: items.map((t) => ({
          type: 'Feature',
          properties: {
            id: t.id,
            polityId: t.polityId,
            nameZh: t.nameZh,
            tier: t.tier,
            fillColor: t.fillColor,
            borderColor: t.borderColor,
            fillOpacity: t.baseFillOpacity,
          },
          geometry: t.geometry as any,
        })),
      });

      bSrc.setData({
        type: 'FeatureCollection',
        features: items.map((t) => ({
          type: 'Feature',
          properties: {
            id: t.id,
            polityId: t.polityId,
            nameZh: t.nameZh,
            isCore: t.isCore,
            fillColor: t.fillColor,
            borderColor: t.borderColor,
          },
          geometry: t.outerBoundary as any,
        })),
      });
    }

    function uploadUnboundedSlot(
      glazeSourceName: string,
      fieldSourceName: string,
      field: UnboundedPolityFieldResult | null,
    ) {
      const gSrc = map.getSource(glazeSourceName) as maplibregl.GeoJSONSource | undefined;
      const fSrc = map.getSource(fieldSourceName) as maplibregl.GeoJSONSource | undefined;
      if (!gSrc || !fSrc) return;

      if (!field || (field.glazeParcels.length === 0 && field.shells.length === 0)) {
        gSrc.setData(EMPTY_FC);
        fSrc.setData(EMPTY_FC);
        return;
      }

      gSrc.setData({
        type: 'FeatureCollection',
        features: field.glazeParcels.map((g) => ({
          type: 'Feature',
          properties: {
            id: g.id,
            polityId: g.polityId,
            nameZh: g.nameZh,
            tier: g.tier,
            isCoreZone: g.isCoreZone,
            fillColor: g.fillColor,
            fillOpacity: g.fillOpacity,
          },
          geometry: g.geometry as any,
        })),
      });

      fSrc.setData({
        type: 'FeatureCollection',
        features: field.shells.map((sh) => ({
          type: 'Feature',
          properties: {
            id: sh.id,
            polityId: sh.polityId,
            tier: sh.tier,
            color: sh.color,
            fillOpacity: sh.fillOpacity,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [sh.ring],
          },
        })),
      });
    }

    function syncGeopoliticalSourcesIfDirty(frame: GeopoliticalTransitionFrame) {
      if (frame.steadyDemarcatedSig !== lastSteadyDemarcatedSig) {
        lastSteadyDemarcatedSig = frame.steadyDemarcatedSig;
        uploadDemarcatedSlot('polity-source', 'polity-boundary-source', frame.steadyDemarcated);
      }
      if (frame.enteringDemarcatedSig !== lastEnteringDemarcatedSig) {
        lastEnteringDemarcatedSig = frame.enteringDemarcatedSig;
        uploadDemarcatedSlot(
          'polity-entering-source',
          'polity-boundary-entering-source',
          frame.enteringDemarcated,
        );
      }
      if (frame.exitingDemarcatedSig !== lastExitingDemarcatedSig) {
        lastExitingDemarcatedSig = frame.exitingDemarcatedSig;
        uploadDemarcatedSlot(
          'polity-exiting-source',
          'polity-boundary-exiting-source',
          frame.exitingDemarcated,
        );
      }

      if (frame.steadyUnboundedSig !== lastSteadyUnboundedSig) {
        lastSteadyUnboundedSig = frame.steadyUnboundedSig;
        uploadUnboundedSlot(
          'unbounded-glaze-source',
          'unbounded-field-source',
          frame.steadyUnbounded?.field ?? null,
        );
      }
      if (frame.enteringUnboundedSig !== lastEnteringUnboundedSig) {
        lastEnteringUnboundedSig = frame.enteringUnboundedSig;
        uploadUnboundedSlot(
          'unbounded-glaze-entering-source',
          'unbounded-field-entering-source',
          frame.enteringUnbounded?.field ?? null,
        );
      }
      if (frame.exitingUnboundedSig !== lastExitingUnboundedSig) {
        lastExitingUnboundedSig = frame.exitingUnboundedSig;
        uploadUnboundedSlot(
          'unbounded-glaze-exiting-source',
          'unbounded-field-exiting-source',
          frame.exitingUnbounded?.field ?? null,
        );
      }
    }

    function scheduleGeopoliticalFade() {
      if (cancelled || !layersReadyRef.current) return;
      if (geoFadeRaf) return;

      const stepGeoFade = (nowMs: number) => {
        geoFadeRaf = 0;
        if (cancelled || !layersReadyRef.current) return;
        const frame = geoTransition.sampleFrame(nowMs);
        syncGeopoliticalSourcesIfDirty(frame);
        applyGeopoliticalPaint(frame);
        if (frame.isAnimating) {
          geoFadeRaf = requestAnimationFrame(stepGeoFade);
        }
      };

      geoFadeRaf = requestAnimationFrame(stepGeoFade);
    }

    function applyLayerFadePaint() {
      if (!layersReadyRef.current || cancelled) return;
      const layers = latestRef.current.activeLayers;
      const hasMort = layers.includes('mortality_catastrophe');
      const hasNight = layers.includes('night_lights');
      const hasPop = layers.includes('population_density');

      // Smart multi-layer opacity balancing when multiple surface heatmaps are stacked simultaneously
      const popMax = hasMort ? 0.78 : hasNight ? 0.82 : 0.95;
      const nightMax = hasPop ? 0.84 : 0.95;
      const mortMax = 0.96;

      const popVal = +(layerFadeCurrent.pop * popMax).toFixed(3);
      setVisIfChanged('pop-heatmap-layer', popVal > 0);
      if (popVal > 0) setPaintIfChanged('pop-heatmap-layer', 'heatmap-opacity', popVal);

      const nightHeatVal = +(layerFadeCurrent.night * nightMax).toFixed(3);
      setVisIfChanged('night-heatmap-layer', nightHeatVal > 0);
      setVisIfChanged('night-lights-halo', nightHeatVal > 0);
      setVisIfChanged('night-lights-core', nightHeatVal > 0);
      if (nightHeatVal > 0) {
        setPaintIfChanged('night-heatmap-layer', 'heatmap-opacity', nightHeatVal);
        setPaintIfChanged('night-lights-halo', 'circle-opacity', +(layerFadeCurrent.night * 0.28).toFixed(3));
        setPaintIfChanged('night-lights-core', 'circle-opacity', +(layerFadeCurrent.night * 0.95).toFixed(3));
      }

      const routeVal = +(layerFadeCurrent.routes * 0.96).toFixed(3);
      setVisIfChanged('routes-glow', routeVal > 0);
      setVisIfChanged('routes-core', routeVal > 0);
      setVisIfChanged('routes-arrows', routeVal > 0);
      if (routeVal > 0) {
        setPaintIfChanged('routes-glow', 'line-opacity', +(layerFadeCurrent.routes * 0.22).toFixed(3));
        setPaintIfChanged('routes-core', 'line-opacity', routeVal);
        setPaintIfChanged('routes-arrows', 'icon-opacity', +(layerFadeCurrent.routes * 0.98).toFixed(3));
      }

      const mortVal = +(layerFadeCurrent.mort * mortMax).toFixed(3);
      setVisIfChanged('mortality-heatmap-layer', mortVal > 0);
      setVisIfChanged('mortality-epicenter-ring', mortVal > 0);
      if (mortVal > 0) {
        setPaintIfChanged('mortality-heatmap-layer', 'heatmap-opacity', mortVal);
      }

      const spAlpha = +(layerFadeCurrent.species * 0.96).toFixed(3);
      setVisIfChanged('species-points-layer', spAlpha > 0);
      if (spAlpha > 0) {
        setPaintIfChanged('species-points-layer', 'circle-opacity', spAlpha);
        setPaintIfChanged('species-points-layer', 'circle-stroke-opacity', spAlpha);
      }

      // Smoothly modulate geopolitical fills & borders across all steady/entering/exiting slots
      applyGeopoliticalPaint(geoTransition.sampleFrame(performance.now()));
    }

    function cleanupZeroedSources() {
      if (layerFadeTarget.pop === 0 && layerFadeCurrent.pop === 0) {
        (map.getSource('pop-thermal-source') as maplibregl.GeoJSONSource | undefined)?.setData(
          EMPTY_FC,
        );
      }
      if (layerFadeTarget.night === 0 && layerFadeCurrent.night === 0) {
        (map.getSource('night-thermal-source') as maplibregl.GeoJSONSource | undefined)?.setData(
          EMPTY_FC,
        );
        (map.getSource('night-lights-source') as maplibregl.GeoJSONSource | undefined)?.setData(
          EMPTY_FC,
        );
      }
      if (layerFadeTarget.routes === 0 && layerFadeCurrent.routes === 0) {
        (map.getSource('routes-source') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY_FC);
      }
      if (layerFadeTarget.mort === 0 && layerFadeCurrent.mort === 0) {
        mortalityEnvInitialized = false;
        displayedMortalityEnv.clear();
        mortStartEnv.clear();
        mortTargetEnv.clear();
        (
          map.getSource('mortality-thermal-source') as maplibregl.GeoJSONSource | undefined
        )?.setData(EMPTY_FC);
        (
          map.getSource('mortality-epicenters-source') as maplibregl.GeoJSONSource | undefined
        )?.setData(EMPTY_FC);
      }
      if (layerFadeTarget.species === 0 && layerFadeCurrent.species === 0) {
        (map.getSource('species-points-source') as maplibregl.GeoJSONSource | undefined)?.setData(
          EMPTY_FC,
        );
      }
    }

    function scheduleLayerFade() {
      if (cancelled || !layersReadyRef.current) return;
      if (layerFadeRaf) return;

      const stepFadeFrame = (nowMs: number) => {
        layerFadeRaf = 0;
        if (cancelled || !layersReadyRef.current) return;

        let anyMoving = false;
        const keys: FadeableLayerKey[] = ['pop', 'night', 'routes', 'mort', 'species'];
        for (const k of keys) {
          const tgt = layerFadeTarget[k];
          if (layerFadeCurrent[k] !== tgt) {
            const rawT = clamp((nowMs - layerFadeStartMs[k]) / 280, 0, 1);
            if (rawT >= 1) {
              layerFadeCurrent[k] = tgt;
            } else {
              const eased = smootherstep01(rawT);
              layerFadeCurrent[k] = layerFadeStart[k] + (tgt - layerFadeStart[k]) * eased;
              anyMoving = true;
            }
          }
        }

        applyLayerFadePaint();

        if (anyMoving) {
          layerFadeRaf = requestAnimationFrame(stepFadeFrame);
        } else {
          cleanupZeroedSources();
        }
      };

      layerFadeRaf = requestAnimationFrame(stepFadeFrame);
    }

    function updateRoutesSource(nowMs: number) {
      const src = map.getSource('routes-source') as maplibregl.GeoJSONSource | undefined;
      if (!src) return;

      const { currentYear: yr, activeLayers: layers } = latestRef.current;
      if (!layers.includes('transport_routes')) {
        // Keep last geometry during GPU fade-out; cleanupZeroedSources clears once opacity hits 0
        return;
      }

      const activeRoutes = getActiveTransportRoutes(yr);
      let anyStillAnimating = false;

      const features = activeRoutes.map(({ route, annualTrips, colorHex }) => {
        const animStart = routeAnimStartMs.get(route.id);
        let progress = 1.0;
        if (animStart !== undefined) {
          progress = clamp((nowMs - animStart) / 760, 0.05, 1.0);
          if (progress < 1.0) {
            anyStillAnimating = true;
          } else {
            routeAnimStartMs.delete(route.id);
          }
        }
        const coords = densifyAndSliceWaypoints(route.waypoints, progress, 22);
        return {
          type: 'Feature' as const,
          properties: {
            id: route.id,
            nameZh: route.nameZh,
            annualTrips,
            colorHex,
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: coords,
          },
        };
      });

      src.setData({
        type: 'FeatureCollection',
        features,
      });

      if (anyStillAnimating && !cancelled) {
        cancelAnimationFrame(routeAnimRaf);
        routeAnimRaf = requestAnimationFrame((ts) => updateRoutesSource(ts));
      }
    }

    function syncDataLayers() {
      if (!layersReadyRef.current || cancelled) return;
      const {
        currentYear: yr,
        activeLayers: layers,
        activePolities: polList,
        activeTerritories: territories,
        activeSpecies: spList,
      } = latestRef.current;

      const hasPop = layers.includes('population_density');
      const hasNight = layers.includes('night_lights');
      const hasRoutes = layers.includes('transport_routes');
      const hasSpecies = layers.includes('species_discovery');
      const hasMort = layers.includes('mortality_catastrophe');

      // Update wall-clock GPU cross-fade targets for any changed thematic layer
      const fadeNow = performance.now();
      const desiredTargets: Record<FadeableLayerKey, number> = {
        pop: hasPop ? 1 : 0,
        night: hasNight ? 1 : 0,
        routes: hasRoutes ? 1 : 0,
        mort: hasMort ? 1 : 0,
        species: hasSpecies ? 1 : 0,
      };
      for (const k of ['pop', 'night', 'routes', 'mort', 'species'] as FadeableLayerKey[]) {
        if (layerFadeTarget[k] !== desiredTargets[k]) {
          layerFadeStart[k] = layerFadeCurrent[k];
          layerFadeTarget[k] = desiredTargets[k];
          layerFadeStartMs[k] = fadeNow;
        }
      }

      // 1. Geopolitical Rendering (210ms GPU cross-fade across Steady / Entering / Exiting slots):
      //    - Demarcated states (`boundaryMode !== 'unbounded'`): Sovereign Choropleth + Zoom-Adaptive Outer Borders
      //    - Unbounded ancient civilizations (`boundaryMode === 'unbounded'`): Core Zone + Wider Influence Zone
      //      + Smooth Gradient Falloff to Terra Nullius, strictly clipped beneath CARTO `water`.
      const politySrc = map.getSource('polity-source') as maplibregl.GeoJSONSource | undefined;
      const polityBoundarySrc = map.getSource('polity-boundary-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      const unboundedGlazeSrc = map.getSource('unbounded-glaze-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      const unboundedFieldSrc = map.getSource('unbounded-field-source') as
        | maplibregl.GeoJSONSource
        | undefined;

      const isBootWarmup =
        !hasRenderedInitialGeo &&
        polList.length > 0 &&
        territories.length === 0 &&
        !latestRef.current.loadingSnapshot.done;

      if (politySrc && polityBoundarySrc && unboundedGlazeSrc && unboundedFieldSrc) {
        if (!isBootWarmup) {
          const isImmediate = !hasRenderedInitialGeo;
          hasRenderedInitialGeo = true;
          const { changed, frame } = geoTransition.syncTarget(polList, territories, fadeNow, {
            immediate: isImmediate,
          });
          if (changed) {
            syncGeopoliticalSourcesIfDirty(frame);
            applyGeopoliticalPaint(frame);
            if (frame.isAnimating) {
              scheduleGeopoliticalFade();
            }
          }
        }

        // Notify entry boot sequence once fine-grained OSM parcel geometries are pushed & rendered on the WebGL globe
        if (!initialParcelsNotifiedRef.current) {
          const snap = latestRef.current.loadingSnapshot;
          const parcelsReadyForYear =
            snap.done && (polList.length === 0 || territories.length > 0 || snap.loadedIds === 0);
          if (parcelsReadyForYear) {
            initialParcelsNotifiedRef.current = true;
            let notified = false;
            const notifyRendered = () => {
              if (notified || cancelled) return;
              notified = true;
              requestAnimationFrame(() => {
                if (!cancelled) {
                  latestRef.current.onInitialParcelsReady?.();
                }
              });
            };
            map.once('render', notifyRendered);
            map.triggerRepaint();
            window.setTimeout(notifyRendered, 220);
          }
        }
      }

      // 2. Population Density Continuous GPU Thermal Field (15–160+ persons/km², Blue -> Deep Brown)
      const popSrc = map.getSource('pop-thermal-source') as maplibregl.GeoJSONSource | undefined;
      if (popSrc && hasPop) {
        const emitters = computePopulationThermalPoints(yr);
        popSrc.setData({
          type: 'FeatureCollection',
          features: emitters.map((p, idx) => ({
            type: 'Feature',
            properties: {
              id: idx,
              weight: p.weight,
              tier: p.tier,
            },
            geometry: {
              type: 'Point',
              coordinates: [p.lon, p.lat],
            },
          })),
        });
      }

      // 3. Nighttime Illumination: Population-Aligned Settlement Radiance Heatmap + Pinpoint Urban/Harbor Lamps
      const nightThermalSrc = map.getSource(
        'night-thermal-source',
      ) as maplibregl.GeoJSONSource | undefined;
      const nightSrc = map.getSource('night-lights-source') as maplibregl.GeoJSONSource | undefined;
      if (nightThermalSrc && nightSrc && hasNight) {
        const thermalLights = computeNightLightThermalPoints(yr);
        const pinpointLights = computeNightLightPixels(yr);
        nightThermalSrc.setData({
          type: 'FeatureCollection',
          features: thermalLights.map((p, idx) => ({
            type: 'Feature',
            properties: {
              id: idx,
              weight: p.weight,
            },
            geometry: {
              type: 'Point',
              coordinates: [p.lon, p.lat],
            },
          })),
        });
        nightSrc.setData({
          type: 'FeatureCollection',
          features: pinpointLights.map((p, idx) => ({
            type: 'Feature',
            properties: {
              id: idx,
              color: p.hex,
              radius: p.sizePx,
            },
            geometry: {
              type: 'Point',
              coordinates: [p.lon, p.lat],
            },
          })),
        });
      }

      // 4. Transport Routes (Start-to-End Catmull-Rom Maritime Reveal + Directional Arrows + White->Deep Red)
      if (hasRoutes) {
        const activeRoutes = getActiveTransportRoutes(yr);
        const currentRouteIds = new Set(activeRoutes.map((r) => r.route.id));
        const nowMs = performance.now();
        if (prevSyncedYear !== null && prevSyncedYear !== yr) {
          for (const { route } of activeRoutes) {
            if (!knownOpenRoutes.has(route.id) || yr === route.openedYear) {
              routeAnimStartMs.set(route.id, nowMs);
            }
          }
        }
        knownOpenRoutes.clear();
        currentRouteIds.forEach((id) => knownOpenRoutes.add(id));
        updateRoutesSource(nowMs);
      } else {
        cancelAnimationFrame(routeAnimRaf);
      }
      prevSyncedYear = yr;

      // 5. Mortality Catastrophe Quantitative Infrared Thermal Field + Silky Per-Event Fade-In / Post-Event Fade-Out
      const mortSrc = map.getSource(
        'mortality-thermal-source',
      ) as maplibregl.GeoJSONSource | undefined;
      const mortEpicenterSrc = map.getSource(
        'mortality-epicenters-source',
      ) as maplibregl.GeoJSONSource | undefined;

      const stepMortalityFade = () => {
        if (cancelled) return;
        window.clearTimeout(mortalityAnimTimer);
        mortalityAnimTimer = 0;

        const mSrc = map.getSource('mortality-thermal-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        const eSrc = map.getSource('mortality-epicenters-source') as
          | maplibregl.GeoJSONSource
          | undefined;
        if (!mSrc || !eSrc) return;

        const {
          currentYear: curY,
          selectedRange: curRange,
          activeLayers: curLayers,
        } = latestRef.current;

        if (!curLayers.includes('mortality_catastrophe')) {
          return;
        }

        const nowMs = performance.now();
        const rawT = mortalityEnvInitialized
          ? clamp((nowMs - mortTweenStartMs) / 300, 0, 1)
          : 1.0;
        const eased = smootherstep01(rawT);
        const stillTransitioning = rawT < 1.0;

        const allCatastrophes = getMortalityCatastrophes();
        for (const ev of allCatastrophes) {
          const targetEnv = mortTargetEnv.get(ev.id) ?? 0;
          const startEnv = mortStartEnv.get(ev.id) ?? targetEnv;
          const nextEnv = stillTransitioning
            ? startEnv + (targetEnv - startEnv) * eased
            : targetEnv;
          if (nextEnv <= 0.006 && targetEnv === 0) {
            displayedMortalityEnv.delete(ev.id);
          } else {
            displayedMortalityEnv.set(ev.id, nextEnv);
          }
        }
        mortalityEnvInitialized = true;

        const emitters = computeMortalityThermalPoints(curY, curRange, displayedMortalityEnv);
        const hitCats = getActiveMortalityCatastrophes(curY, false, curRange);

        mSrc.setData({
          type: 'FeatureCollection',
          features: emitters.map((p, idx) => ({
            type: 'Feature',
            properties: {
              id: idx,
              weight: p.weight,
              tier: p.tier,
            },
            geometry: {
              type: 'Point',
              coordinates: [p.lon, p.lat],
            },
          })),
        });

        eSrc.setData({
          type: 'FeatureCollection',
          features: hitCats.map((c) => ({
            type: 'Feature',
            properties: { id: c.id },
            geometry: {
              type: 'Point',
              coordinates: c.coords,
            },
          })),
        });

        if (stillTransitioning && !cancelled) {
          mortalityAnimTimer = window.setTimeout(stepMortalityFade, 55);
        }
      };

      if (mortSrc && mortEpicenterSrc) {
        if (hasMort) {
          const allCatastrophes = getMortalityCatastrophes();
          let targetsChanged = !mortalityEnvInitialized;
          for (const ev of allCatastrophes) {
            const nextTgt = computeMortalityEventEnvelope(ev, yr, latestRef.current.selectedRange);
            const prevTgt = mortTargetEnv.get(ev.id) ?? 0;
            if (Math.abs(nextTgt - prevTgt) > 0.002) {
              targetsChanged = true;
            }
            mortStartEnv.set(
              ev.id,
              displayedMortalityEnv.get(ev.id) ?? (mortalityEnvInitialized ? 0 : nextTgt),
            );
            mortTargetEnv.set(ev.id, nextTgt);
          }
          if (targetsChanged) {
            mortTweenStartMs = performance.now();
            stepMortalityFade();
          }
        } else {
          window.clearTimeout(mortalityAnimTimer);
          mortalityAnimTimer = 0;
        }
      }

      // 6. Species Discovery Anchor Beacons
      const spSrc = map.getSource('species-points-source') as maplibregl.GeoJSONSource | undefined;
      if (spSrc && hasSpecies) {
        spSrc.setData({
          type: 'FeatureCollection',
          features: spList.map((s) => ({
            type: 'Feature',
            properties: { id: s.id },
            geometry: {
              type: 'Point',
              coordinates: s.coords,
            },
          })),
        });
      }

      // 7. Selected Region Highlight Overlay (Territory / BBox / Geodesic Circle)
      const selSrc = map.getSource('selected-region-source') as
        | maplibregl.GeoJSONSource
        | undefined;
      const selReg = latestRef.current.selectedRegion;
      if (selSrc) {
        const liveTerrForSel =
          selReg?.kind === 'territory'
            ? territories.find((t) => t.id === selReg.territoryId)
            : undefined;
        const selSig = !selReg
          ? 'none'
          : selReg.kind === 'territory'
            ? `terr:${selReg.territoryId}:${liveTerrForSel ? 'live' : 'fallback'}`
            : selReg.kind === 'bbox'
              ? `bbox:${selReg.bbox.minLon},${selReg.bbox.minLat},${selReg.bbox.maxLon},${selReg.bbox.maxLat}`
              : `circle:${selReg.center[0]},${selReg.center[1]},${selReg.radiusKm}`;

        if (selSig !== lastSelectedRegionSig) {
          lastSelectedRegionSig = selSig;
          setVisIfChanged('selected-region-fill', Boolean(selReg));
          setVisIfChanged('selected-region-stroke', Boolean(selReg));

          if (!selReg) {
            selSrc.setData(EMPTY_FC);
          } else if (selReg.kind === 'territory') {
            if (liveTerrForSel) {
              selSrc.setData({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    properties: { kind: 'territory' },
                    geometry: liveTerrForSel.geometry as any,
                  },
                ],
              });
            } else if (selReg.polygonRings && selReg.polygonRings.length > 0) {
              selSrc.setData({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    properties: { kind: 'territory' },
                    geometry: {
                      type: 'MultiPolygon',
                      coordinates: selReg.polygonRings.map((r) => [r]),
                    },
                  },
                ],
              });
            } else {
              selSrc.setData({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    properties: { kind: 'territory' },
                    geometry: {
                      type: 'Polygon',
                      coordinates: [bboxToPolygonRing(selReg.bbox)],
                    },
                  },
                ],
              });
            }
          } else if (selReg.kind === 'bbox') {
            selSrc.setData({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { kind: 'bbox' },
                  geometry: {
                    type: 'Polygon',
                    coordinates: [bboxToPolygonRing(selReg.bbox)],
                  },
                },
              ],
            });
          } else if (selReg.kind === 'circle') {
            selSrc.setData({
              type: 'FeatureCollection',
              features: [
                {
                  type: 'Feature',
                  properties: { kind: 'circle' },
                  geometry: {
                    type: 'Polygon',
                    coordinates: [createGeodesicCircleRing(selReg.center, selReg.radiusKm, 72)],
                  },
                },
              ],
            });
          }
        }
      }

      // Drive GPU paint-property cross-fade for newly toggled or deselected layers
      scheduleLayerFade();
      syncProjectedOverlays();
    }

    function registerOverlaySourcesAndLayers() {
      if (cancelled) return;
      cancelAnimationFrame(geoFadeRaf);
      geoFadeRaf = 0;
      lastPaintCache.clear();
      lastThemeNight = null;
      geoTransition.reset();
      hasRenderedInitialGeo = false;
      lastSteadyDemarcatedSig = '__init__';
      lastEnteringDemarcatedSig = '__init__';
      lastExitingDemarcatedSig = '__init__';
      lastSteadyUnboundedSig = '__init__';
      lastEnteringUnboundedSig = '__init__';
      lastExitingUnboundedSig = '__init__';
      lastSelectedRegionSig = '__init__';
      mortalityEnvInitialized = false;

      const currentLayers = map.getStyle()?.layers || [];
      baseLayerIdsRef.current = {
        landuseIds: currentLayers
          .filter((l: any) => l.type === 'fill' && l['source-layer'] === 'landuse')
          .map((l) => l.id),
        symbolIds: currentLayers.filter((l) => l.type === 'symbol').map((l) => l.id),
      };

      if (!map.hasImage('route-arrow')) {
        map.addImage('route-arrow', createRouteArrowImageData(), {
          sdf: true,
          pixelRatio: 2,
        });
      }

      const precisionSources: Array<{ name: string; tolerance: number }> = [
        { name: 'polity-source', tolerance: 0.035 },
        { name: 'polity-entering-source', tolerance: 0.035 },
        { name: 'polity-exiting-source', tolerance: 0.035 },
        { name: 'polity-boundary-source', tolerance: 0.035 },
        { name: 'polity-boundary-entering-source', tolerance: 0.035 },
        { name: 'polity-boundary-exiting-source', tolerance: 0.035 },
        { name: 'unbounded-glaze-source', tolerance: 0.05 },
        { name: 'unbounded-glaze-entering-source', tolerance: 0.05 },
        { name: 'unbounded-glaze-exiting-source', tolerance: 0.05 },
        { name: 'unbounded-field-source', tolerance: 0.04 },
        { name: 'unbounded-field-entering-source', tolerance: 0.04 },
        { name: 'unbounded-field-exiting-source', tolerance: 0.04 },
        { name: 'pop-thermal-source', tolerance: 0.15 },
        { name: 'night-thermal-source', tolerance: 0.15 },
        { name: 'night-lights-source', tolerance: 0.35 },
        { name: 'routes-source', tolerance: 0.06 },
        { name: 'mortality-thermal-source', tolerance: 0.15 },
        { name: 'mortality-epicenters-source', tolerance: 0.25 },
        { name: 'species-points-source', tolerance: 0.25 },
        { name: 'selected-region-source', tolerance: 0.035 },
      ];
      for (const { name, tolerance } of precisionSources) {
        if (!map.getSource(name)) {
          map.addSource(name, {
            type: 'geojson',
            data: EMPTY_FC,
            maxzoom: 12,
            tolerance,
          });
        }
      }

      // CRITICAL CARTOGRAPHIC COMPOSITING:
      // Insert ALL Demarcated Polity Fills/Borders, Unbounded Ancient Civilization Spheres, Population Thermal Heatmap,
      // Nighttime Radiance Heatmap, and Mortality Infrared Heatmap strictly BENEATH CARTO's `#090d16` / `#04060b`
      // OpenStreetMap `water` vector layer so 0% of any polygon or radial gradient overflows into oceans!
      const firstSymbolId = currentLayers.find((l) => l.type === 'symbol')?.id;
      const waterLayerId = currentLayers.find((l) => l.id === 'water')?.id;
      const beforeWaterOrSymbol = waterLayerId || firstSymbolId;

      // 0A–0C. Draped Unbounded Ancient Civilization Sphere-of-Influence Stack (Exiting -> Steady -> Entering)
      const unboundedSlots: Array<{
        suffix: '' | '-entering' | '-exiting';
        glazeSrc: string;
        fieldSrc: string;
      }> = [
        {
          suffix: '-exiting',
          glazeSrc: 'unbounded-glaze-exiting-source',
          fieldSrc: 'unbounded-field-exiting-source',
        },
        {
          suffix: '',
          glazeSrc: 'unbounded-glaze-source',
          fieldSrc: 'unbounded-field-source',
        },
        {
          suffix: '-entering',
          glazeSrc: 'unbounded-glaze-entering-source',
          fieldSrc: 'unbounded-field-entering-source',
        },
      ];

      for (const slot of unboundedSlots) {
        const infId = `unbounded-influence-glaze${slot.suffix}`;
        if (!map.getLayer(infId)) {
          map.addLayer(
            {
              id: infId,
              type: 'fill',
              source: slot.glazeSrc,
              filter: ['==', ['get', 'isCoreZone'], false],
              layout: { visibility: 'none' },
              paint: {
                'fill-antialias': false,
                'fill-color': ['get', 'fillColor'],
                'fill-opacity': ['get', 'fillOpacity'],
              },
            },
            beforeWaterOrSymbol,
          );
        }

        const coreId = `unbounded-core-glaze${slot.suffix}`;
        if (!map.getLayer(coreId)) {
          map.addLayer(
            {
              id: coreId,
              type: 'fill',
              source: slot.glazeSrc,
              filter: ['==', ['get', 'isCoreZone'], true],
              layout: { visibility: 'none' },
              paint: {
                'fill-antialias': false,
                'fill-color': ['get', 'fillColor'],
                'fill-opacity': ['get', 'fillOpacity'],
              },
            },
            beforeWaterOrSymbol,
          );
        }

        const sphereId = `unbounded-sphere-fill${slot.suffix}`;
        if (!map.getLayer(sphereId)) {
          map.addLayer(
            {
              id: sphereId,
              type: 'fill',
              source: slot.fieldSrc,
              layout: { visibility: 'none' },
              paint: {
                'fill-antialias': false,
                'fill-color': ['get', 'color'],
                'fill-opacity': ['get', 'fillOpacity'],
              },
            },
            beforeWaterOrSymbol,
          );
        }
      }

      // 1A. Seam-free Demarcated Sovereign / Allied Choropleth Glaze (Exiting -> Steady -> Entering, clipped 100% by `water`)
      const demarcatedFillSlots: Array<{
        id: string;
        source: string;
      }> = [
        { id: 'polity-fill-exiting', source: 'polity-exiting-source' },
        { id: 'polity-fill', source: 'polity-source' },
        { id: 'polity-fill-entering', source: 'polity-entering-source' },
      ];
      for (const fSlot of demarcatedFillSlots) {
        if (!map.getLayer(fSlot.id)) {
          map.addLayer(
            {
              id: fSlot.id,
              type: 'fill',
              source: fSlot.source,
              layout: { visibility: 'none' },
              paint: {
                'fill-antialias': false,
                'fill-color': ['get', 'fillColor'],
                'fill-opacity': ['get', 'fillOpacity'],
              },
            },
            beforeWaterOrSymbol,
          );
        }
      }

      // 2. Population Density Native GPU Thermal Heatmap (15 -> 160+ persons/km², Blue -> Deep Brown, clipped 100% by `water`)
      if (!map.getLayer('pop-heatmap-layer')) {
        map.addLayer(
          {
            id: 'pop-heatmap-layer',
            type: 'heatmap',
            source: 'pop-thermal-source',
            maxzoom: 12,
            paint: {
              'heatmap-weight': ['get', 'weight'],
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2,
                0.085,
                4,
                0.112,
                7,
                0.158,
                10,
                0.42,
                12,
                0.62,
              ],
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2,
                16,
                4,
                28,
                7,
                65,
                10,
                130,
                12,
                195,
              ],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(37, 99, 235, 0)',
                0.07,
                'rgba(37, 99, 235, 0.48)',
                0.22,
                'rgba(59, 130, 246, 0.76)',
                0.44,
                'rgba(78, 134, 180, 0.85)',
                0.64,
                'rgba(166, 120, 70, 0.92)',
                0.84,
                'rgba(124, 63, 24, 0.96)',
                1.0,
                'rgba(68, 28, 10, 0.99)',
              ],
              'heatmap-opacity': 0,
            },
          },
          beforeWaterOrSymbol,
        );
      }

      // 3A. Nighttime Settlement & Industrial Radiance GPU Heatmap (mirroring population distribution, clipped 100% by `#04060b` night ocean)
      if (!map.getLayer('night-heatmap-layer')) {
        map.addLayer(
          {
            id: 'night-heatmap-layer',
            type: 'heatmap',
            source: 'night-thermal-source',
            maxzoom: 12,
            paint: {
              'heatmap-weight': ['get', 'weight'],
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2,
                0.082,
                4,
                0.108,
                7,
                0.155,
                10,
                0.40,
                12,
                0.60,
              ],
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2,
                15,
                4,
                26,
                7,
                60,
                10,
                122,
                12,
                182,
              ],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(180, 83, 9, 0)',
                0.07,
                'rgba(180, 83, 9, 0.28)',
                0.22,
                'rgba(217, 119, 6, 0.56)',
                0.45,
                'rgba(245, 158, 11, 0.78)',
                0.70,
                'rgba(251, 191, 36, 0.91)',
                0.90,
                'rgba(254, 240, 138, 0.97)',
                1.0,
                'rgba(255, 251, 219, 0.99)',
              ],
              'heatmap-opacity': 0,
            },
          },
          beforeWaterOrSymbol,
        );
      }

      // 5A. Mortality Catastrophe Quantitative GPU Infrared Thermal Heatmap (sits atop pop/night beneath `water`)
      if (!map.getLayer('mortality-heatmap-layer')) {
        map.addLayer(
          {
            id: 'mortality-heatmap-layer',
            type: 'heatmap',
            source: 'mortality-thermal-source',
            maxzoom: 12,
            paint: {
              'heatmap-weight': ['get', 'weight'],
              'heatmap-intensity': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2,
                0.095,
                4,
                0.125,
                7,
                0.185,
                10,
                0.44,
                12,
                0.65,
              ],
              'heatmap-radius': [
                'interpolate',
                ['linear'],
                ['zoom'],
                2,
                13,
                4,
                22,
                7,
                46,
                10,
                98,
                12,
                152,
              ],
              'heatmap-color': [
                'interpolate',
                ['linear'],
                ['heatmap-density'],
                0,
                'rgba(254, 226, 226, 0)',
                0.05,
                'rgba(254, 205, 211, 0.45)',
                0.16,
                'rgba(253, 164, 175, 0.78)',
                0.28,
                'rgba(251, 140, 152, 0.86)',
                0.46,
                'rgba(239, 68, 68, 0.91)',
                0.66,
                'rgba(190, 24, 32, 0.95)',
                0.82,
                'rgba(124, 10, 18, 0.98)',
                1.0,
                'rgba(68, 3, 9, 0.99)',
              ],
              'heatmap-opacity': 0,
            },
          },
          beforeWaterOrSymbol,
        );
      }

      // 1B–1D. Multi-Scale Zoom-Adaptive National Borders (All Ribbons -> All Casings -> All Strokes, strictly beneath `water`)
      const borderSpecs = buildZoomAdaptiveBorderPaintSpecs();
      const borderSlots: Array<{ suffix: '' | '-entering' | '-exiting'; source: string }> = [
        { suffix: '-exiting', source: 'polity-boundary-exiting-source' },
        { suffix: '', source: 'polity-boundary-source' },
        { suffix: '-entering', source: 'polity-boundary-entering-source' },
      ];

      for (const bSlot of borderSlots) {
        const ribbonId = `polity-inner-ribbon${bSlot.suffix}`;
        if (!map.getLayer(ribbonId)) {
          map.addLayer(
            {
              id: ribbonId,
              type: 'line',
              source: bSlot.source,
              layout: {
                visibility: 'none',
                'line-cap': 'round',
                'line-join': 'round',
              },
              paint: {
                'line-color': ['get', 'borderColor'],
                'line-width': borderSpecs.innerRibbonWidthExpr,
                'line-blur': borderSpecs.innerRibbonBlurExpr,
                'line-opacity': 0.28,
              },
            },
            beforeWaterOrSymbol,
          );
        }
      }

      for (const bSlot of borderSlots) {
        const casingId = `polity-casing${bSlot.suffix}`;
        if (!map.getLayer(casingId)) {
          map.addLayer(
            {
              id: casingId,
              type: 'line',
              source: bSlot.source,
              layout: {
                visibility: 'none',
                'line-cap': 'round',
                'line-join': 'round',
              },
              paint: {
                'line-color': 'rgba(6, 9, 15, 0.88)',
                'line-width': borderSpecs.casingWidthExpr,
                'line-blur': borderSpecs.casingBlurExpr,
                'line-opacity': 0.9,
              },
            },
            beforeWaterOrSymbol,
          );
        }
      }

      for (const bSlot of borderSlots) {
        const strokeId = `polity-stroke${bSlot.suffix}`;
        if (!map.getLayer(strokeId)) {
          map.addLayer(
            {
              id: strokeId,
              type: 'line',
              source: bSlot.source,
              layout: {
                visibility: 'none',
                'line-cap': 'round',
                'line-join': 'round',
              },
              paint: {
                'line-color': ['get', 'borderColor'],
                'line-width': borderSpecs.strokeWidthExpr,
                'line-blur': borderSpecs.strokeBlurExpr,
                'line-opacity': 0.96,
              },
            },
            beforeWaterOrSymbol,
          );
        }
      }

      // 3B. Nighttime Illumination Radial Bloom (above `water` for harbor beacons)
      if (!map.getLayer('night-lights-halo')) {
        map.addLayer({
          id: 'night-lights-halo',
          type: 'circle',
          source: 'night-lights-source',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2,
              ['*', ['get', 'radius'], 1.4],
              6,
              ['*', ['get', 'radius'], 3.1],
            ],
            'circle-color': '#f59e0b',
            'circle-blur': 1.15,
            'circle-opacity': 0,
          },
        });
      }
      if (!map.getLayer('night-lights-core')) {
        map.addLayer({
          id: 'night-lights-core',
          type: 'circle',
          source: 'night-lights-source',
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              2,
              ['*', ['get', 'radius'], 0.42],
              6,
              ['*', ['get', 'radius'], 0.95],
            ],
            'circle-color': ['get', 'color'],
            'circle-blur': 0.25,
            'circle-opacity': 0,
          },
        });
      }

      // 4. Maritime Transport Routes (Catmull-Rom Sea Lanes + Directional Arrows above `#090d16` ocean)
      if (!map.getLayer('routes-glow')) {
        map.addLayer({
          id: 'routes-glow',
          type: 'line',
          source: 'routes-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'colorHex'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 4.8, 6, 8.2],
            'line-opacity': 0,
          },
        });
      }
      if (!map.getLayer('routes-core')) {
        map.addLayer({
          id: 'routes-core',
          type: 'line',
          source: 'routes-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': ['get', 'colorHex'],
            'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.8, 5, 2.7, 8, 3.8],
            'line-opacity': 0,
          },
        });
      }
      if (!map.getLayer('routes-arrows')) {
        map.addLayer({
          id: 'routes-arrows',
          type: 'symbol',
          source: 'routes-source',
          layout: {
            'symbol-placement': 'line',
            'symbol-spacing': 56,
            'icon-image': 'route-arrow',
            'icon-size': ['interpolate', ['linear'], ['zoom'], 2, 0.72, 5, 0.94, 8, 1.15],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
            'icon-rotation-alignment': 'map',
          },
          paint: {
            'icon-color': ['get', 'colorHex'],
            'icon-halo-color': 'rgba(5, 8, 15, 0.85)',
            'icon-halo-width': 0.8,
            'icon-opacity': 0,
          },
        });
      }

      // 5B. Invisible Interactive Hit Target for Mortality Catastrophe Inspector Popover
      if (!map.getLayer('mortality-epicenter-ring')) {
        map.addLayer({
          id: 'mortality-epicenter-ring',
          type: 'circle',
          source: 'mortality-epicenters-source',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 14, 6, 30, 10, 56],
            'circle-color': '#dc2626',
            'circle-opacity': 0,
            'circle-stroke-width': 0,
          },
        });
      }

      // 6. Species Discovery Coordinate Beacons
      if (!map.getLayer('species-points-layer')) {
        map.addLayer({
          id: 'species-points-layer',
          type: 'circle',
          source: 'species-points-source',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 4.2, 6, 6.5],
            'circle-color': '#10b981',
            'circle-stroke-color': '#ecfdf5',
            'circle-stroke-width': 1.4,
            'circle-opacity': 0,
            'circle-stroke-opacity': 0,
          },
        });
      }

      // 7. User-Selected Region Highlight Frame (Territory / BBox / Circle)
      if (!map.getLayer('selected-region-fill')) {
        map.addLayer({
          id: 'selected-region-fill',
          type: 'fill',
          source: 'selected-region-source',
          paint: {
            'fill-color': '#38bdf8',
            'fill-opacity': 0.14,
          },
        });
      }
      if (!map.getLayer('selected-region-stroke')) {
        map.addLayer({
          id: 'selected-region-stroke',
          type: 'line',
          source: 'selected-region-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#38bdf8',
            'line-width': 2.2,
            'line-dasharray': [3, 2],
            'line-opacity': 0.94,
          },
        });
      }

      layersReadyRef.current = true;
      latestRef.current.onMapStyleReady?.();
      applyLayerFadePaint();
      syncThemePaint();
      syncDataLayers();
    }

    map.on('style.load', registerOverlaySourcesAndLayers);

    // If CARTO style timed out during initial 950ms window, allow a background upgrade only if it arrives later
    if (!rawCartoJson) {
      preloadCartoDarkMatterStyle(5000)
        .then((lateCartoJson) => {
          if (cancelled || !lateCartoJson) return;
          const sanitized = sanitizeCartoDarkMatterStyle(
            lateCartoJson,
            latestRef.current.activeLayers.includes('night_lights'),
            latestRef.current.projectionMode === '3d' ? 'globe' : 'mercator',
            true,
          );
          layersReadyRef.current = false;
          map.setStyle(sanitized, { diff: false });
        })
        .catch(() => {
          // Offline Natural Earth fallback style already active and crisp
        });
    }

    const scheduleOverlaySync = () => {
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        syncProjectedOverlays();
      });
    };

    map.on('move', scheduleOverlaySync);
    map.on('resize', scheduleOverlaySync);

    map.on('mousemove', (e) => {
      const lng = e.lngLat.lng;
      const lat = e.lngLat.lat;
      const px = e.point.x;
      const py = e.point.y;

      if (hoverRaf) return;
      hoverRaf = requestAnimationFrame(() => {
        hoverRaf = 0;
        if (cancelled) return;

        const qLng = Math.round(lng * 100) / 100;
        const qLat = Math.round(lat * 100) / 100;
        const coordSig = `${qLng},${qLat}`;
        if (coordSig !== lastHoverCoordSig) {
          lastHoverCoordSig = coordSig;
          latestRef.current.onHoverCoordsChange?.([qLng, qLat]);
        }

        if (!layersReadyRef.current || map.isMoving()) return;
        const now = performance.now();
        if (now - lastCursorQueryMs < 55) return;
        lastCursorQueryMs = now;

        const {
          activeLayers: layers,
          activePolities: polList,
          activeTerritories: terrs,
        } = latestRef.current;

        const candidateLayers: string[] = [];
        if (layers.includes('transport_routes')) candidateLayers.push('routes-core');
        if (layers.includes('mortality_catastrophe'))
          candidateLayers.push('mortality-epicenter-ring');
        if (layers.includes('species_discovery')) candidateLayers.push('species-points-layer');
        if (polList.some((p) => !isUnboundedPolity(p))) {
          candidateLayers.push('polity-fill', 'polity-fill-entering');
        }
        if (polList.some((p) => isUnboundedPolity(p)) && terrs.length > 0) {
          candidateLayers.push(
            'unbounded-core-glaze',
            'unbounded-core-glaze-entering',
            'unbounded-influence-glaze',
            'unbounded-influence-glaze-entering',
          );
        }

        const hitLayers = candidateLayers.filter(
          (id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none',
        );
        let isInteractive = false;
        if (hitLayers.length > 0) {
          isInteractive = map.queryRenderedFeatures([px, py], { layers: hitLayers }).length > 0;
        }
        if (!isInteractive && polList.some((p) => isUnboundedPolity(p))) {
          isInteractive = Boolean(hitTestUnboundedPolityAtLngLat(lng, lat, polList, terrs));
        }

        const nextCursor = isInteractive ? 'pointer' : '';
        if (nextCursor !== lastCursorStyle) {
          lastCursorStyle = nextCursor;
          map.getCanvas().style.cursor = nextCursor;
        }
      });
    });

    map.on('mouseout', () => {
      lastHoverCoordSig = '';
      latestRef.current.onHoverCoordsChange?.(null);
    });

    map.on('click', (e) => {
      if (!layersReadyRef.current || latestRef.current.drawToolMode !== 'none') return;
      const {
        currentYear: yr,
        activeLayers: layers,
        activePolities: polList,
        activeTerritories: terrs,
      } = latestRef.current;

      // Priority 1: Transport route click (when active)
      if (layers.includes('transport_routes') && map.getLayer('routes-core')) {
        const routeHits = map.queryRenderedFeatures(
          [
            [e.point.x - 6, e.point.y - 6],
            [e.point.x + 6, e.point.y + 6],
          ],
          { layers: ['routes-core'] },
        );
        if (routeHits.length > 0) {
          const rid = routeHits[0].properties?.id;
          const match = getActiveTransportRoutes(yr).find((r) => r.route.id === rid);
          if (match) {
            latestRef.current.onSelectEntity({
              kind: 'route',
              route: match.route,
              annualTrips: match.annualTrips,
              colorHex: match.colorHex,
            });
            return;
          }
        }
      }

      // Priority 2: Mortality catastrophe click (when active)
      if (layers.includes('mortality_catastrophe') && map.getLayer('mortality-epicenter-ring')) {
        const catHits = map.queryRenderedFeatures(
          [
            [e.point.x - 10, e.point.y - 10],
            [e.point.x + 10, e.point.y + 10],
          ],
          { layers: ['mortality-epicenter-ring'] },
        );
        if (catHits.length > 0) {
          const cid = catHits[0].properties?.id;
          const match = getActiveMortalityCatastrophes(
            yr,
            false,
            latestRef.current.selectedRange,
          ).find((c) => c.id === cid);
          if (match) {
            latestRef.current.onSelectEntity({ kind: 'catastrophe', catastrophe: match });
            return;
          }
        }
      }

      // Priority 3: Species beacon click (when active)
      if (layers.includes('species_discovery') && map.getLayer('species-points-layer')) {
        const spHits = map.queryRenderedFeatures(
          [
            [e.point.x - 8, e.point.y - 8],
            [e.point.x + 8, e.point.y + 8],
          ],
          { layers: ['species-points-layer'] },
        );
        if (spHits.length > 0) {
          const sid = spHits[0].properties?.id;
          const match = getActiveSpeciesDiscoveries(
            yr,
            latestRef.current.selectedRange,
          ).find((s) => s.id === sid);
          if (match) {
            latestRef.current.onSelectEntity({ kind: 'species', species: match });
            return;
          }
        }
      }

      // Priority 4: Geopolitical territory polygon or unbounded ancient sphere click -> open selected element overview popover
      const geoClickLayers = [
        'polity-fill',
        'polity-fill-entering',
        'unbounded-core-glaze',
        'unbounded-core-glaze-entering',
        'unbounded-influence-glaze',
        'unbounded-influence-glaze-entering',
      ].filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none');

      if (polList.length > 0) {
        if (geoClickLayers.length > 0) {
          const polHits = map.queryRenderedFeatures(e.point, { layers: geoClickLayers });
          if (polHits.length > 0) {
            const hitProps = polHits[0].properties || {};
            const clickedId = hitProps.id;
            const clickedPolityId = hitProps.polityId;
            const hitTerr = terrs.find((t) => t.id === clickedId);
            const ownerPol =
              polList.find((p) => p.id === clickedPolityId) ||
              (hitTerr ? resolvePolityForTerritory(hitTerr, polList) : null) ||
              polList[0];
            const ownerCount = terrs.filter(
              (t) => (resolvePolityForTerritory(t, polList) ?? polList[0]).id === ownerPol.id,
            ).length;
            latestRef.current.onSelectEntity({
              kind: 'polity',
              phase: ownerPol,
              regionCount: ownerCount,
              clickedTerritoryId: hitTerr?.id,
              clickedTerritoryNameZh: hitTerr?.nameZh,
              clickedTerritoryTier: hitTerr?.tier,
            });
            return;
          }
        }

        // Mathematical hit-test for continental Influence Zone outside discrete glaze parcels (e.g. Thessaly / Western Anatolia)
        const hitUnboundedPol = hitTestUnboundedPolityAtLngLat(
          e.lngLat.lng,
          e.lngLat.lat,
          polList,
          terrs,
        );
        if (hitUnboundedPol) {
          const ownerCount = terrs.filter(
            (t) => (resolvePolityForTerritory(t, polList) ?? polList[0]).id === hitUnboundedPol.id,
          ).length;
          latestRef.current.onSelectEntity({
            kind: 'polity',
            phase: hitUnboundedPol,
            regionCount: ownerCount,
          });
          return;
        }
      }
    });

    // Wheel-down zoom-out transition to 3D Solar System when Lunar & Deep Space layer is active
    const canvasEl = map.getCanvas();
    const handleWheel = (e: WheelEvent) => {
      if (
        latestRef.current.activeLayers.includes('space_race') &&
        latestRef.current.projectionMode === '3d' &&
        e.deltaY > 0 &&
        map.getZoom() <= 2.35
      ) {
        latestRef.current.onSpaceStageChange('solar_system', 'moon');
      }
    };
    canvasEl.addEventListener('wheel', handleWheel, { passive: true });

      syncApiRef.current = {
        syncDataLayers,
        syncProjectedOverlays,
        syncThemePaint,
      };

      cleanupInstance = () => {
        canvasEl.removeEventListener('wheel', handleWheel);
        syncApiRef.current = null;
        mapRef.current = null;
        map.remove();
      };
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(routeAnimRaf);
      cancelAnimationFrame(layerFadeRaf);
      cancelAnimationFrame(geoFadeRaf);
      window.clearTimeout(mortalityAnimTimer);
      cancelAnimationFrame(hoverRaf);
      cancelAnimationFrame(moveRaf);
      cleanupInstance?.();
    };
  }, []);

  // Sync data layers whenever year, selectedRange, selectedRegion, parcel load state, or multi-select activeLayers changes
  useEffect(() => {
    syncApiRef.current?.syncThemePaint();
    syncApiRef.current?.syncDataLayers();
  }, [
    currentYear,
    selectedRange,
    activeLayers,
    activePolities,
    activeTerritories,
    loadingSnapshot.done,
    loadingSnapshot.loadedIds,
    activeSpecies,
    selectedRegion,
  ]);

  // Escape key cancels active box/circle draw mode
  useEffect(() => {
    if (drawToolMode === 'none') {
      setDragPreview(null);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDragPreview(null);
        onFinishDrawTool();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [drawToolMode, onFinishDrawTool]);

  // Morph between 3D Globe (`globe`) and 2D Flat World Map (`mercator`) seamlessly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !layersReadyRef.current) return;
    map.setProjection({ type: projectionMode === '3d' ? 'globe' : 'mercator' });
    map.easeTo({
      pitch: projectionMode === '3d' ? 16 : 0,
      bearing: 0,
      zoom: projectionMode === '2d' ? Math.min(map.getZoom(), 2.8) : Math.max(map.getZoom(), 3.3),
      duration: 520,
    });
    const timer = window.setTimeout(() => {
      syncApiRef.current?.syncProjectedOverlays();
    }, 540);
    return () => window.clearTimeout(timer);
  }, [projectionMode]);

  // Execute toolbar & dataset camera commands (+ / - / reset north / fly_to)
  useEffect(() => {
    if (!cameraCommand) return;
    const map = mapRef.current;
    if (!map) return;

    if (cameraCommand.kind === 'zoom_in') {
      map.zoomTo(Math.min(map.getMaxZoom(), map.getZoom() + 0.9), { duration: 280 });
    } else if (cameraCommand.kind === 'zoom_out') {
      const nextZoom = map.getZoom() - 0.95;
      if (hasSpaceLayer && projectionMode === '3d' && nextZoom <= 2.1) {
        onSpaceStageChange('solar_system', 'moon');
        return;
      }
      map.zoomTo(Math.max(map.getMinZoom(), nextZoom), { duration: 280 });
    } else if (cameraCommand.kind === 'reset_north') {
      const primaryCapital = activePolities[0]?.capitalCoords ?? [23.8, 37.6];
      map.easeTo({
        center: primaryCapital,
        zoom: projectionMode === '3d' ? 3.55 : 2.3,
        pitch: projectionMode === '3d' ? 16 : 0,
        bearing: 0,
        duration: 520,
      });
    } else if (cameraCommand.kind === 'fly_to' && cameraCommand.center) {
      map.easeTo({
        center: cameraCommand.center,
        zoom:
          projectionMode === '3d'
            ? (cameraCommand.zoom ?? 3.55)
            : Math.min(cameraCommand.zoom ?? 2.6, 2.8),
        pitch: projectionMode === '3d' ? 16 : 0,
        bearing: 0,
        duration: 640,
      });
    }
  }, [activePolities, cameraCommand, hasSpaceLayer, onSpaceStageChange, projectionMode]);

  const visibleSpeciesBubbles = hasSpeciesLayer
    ? speciesBubbles.filter((b) => b.visible)
    : [];

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#04060B]"
      data-testid={projectionMode === '3d' ? 'maplibre-globe-stage' : 'maplibre-2d-stage'}
    >
      {/* Orbital Horizon Radial Backdrop framing the 3D MapLibre Globe */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 48%, rgba(14, 165, 233, 0.09) 0%, rgba(15, 35, 66, 0.14) 34%, rgba(4, 6, 11, 0.98) 74%)',
        }}
      />

      {/* MapLibre GL JS v5+ Canvas Mount */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Interactive Box / Circle Geographic Region Selection Overlay */}
      {drawToolMode !== 'none' && (
        <div
          data-testid="region-draw-overlay"
          onPointerDown={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            e.currentTarget.setPointerCapture(e.pointerId);
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            setDragPreview({ startX: x, startY: y, curX: x, curY: y });
          }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            if (mapRef.current) {
              const ll = mapRef.current.unproject([x, y]);
              onHoverCoordsChange?.([ll.lng, ll.lat]);
            }
            setDragPreview((prev) => (prev ? { ...prev, curX: x, curY: y } : null));
          }}
          onPointerUp={(e) => {
            if (!dragPreview || !mapRef.current) {
              setDragPreview(null);
              return;
            }
            const rect = e.currentTarget.getBoundingClientRect();
            const endX = e.clientX - rect.left;
            const endY = e.clientY - rect.top;
            const distPx = Math.hypot(endX - dragPreview.startX, endY - dragPreview.startY);
            const startX = dragPreview.startX;
            const startY = dragPreview.startY;
            setDragPreview(null);

            if (distPx < 6) {
              return;
            }

            const map = mapRef.current;
            if (drawToolMode === 'box') {
              const xMin = Math.min(startX, endX);
              const xMax = Math.max(startX, endX);
              const yMin = Math.min(startY, endY);
              const yMax = Math.max(startY, endY);
              const corners = [
                map.unproject([xMin, yMin]),
                map.unproject([xMax, yMin]),
                map.unproject([xMax, yMax]),
                map.unproject([xMin, yMax]),
              ];
              const lons = corners.map((c) => clamp(c.lng, -180, 180));
              const lats = corners.map((c) => clamp(c.lat, -85, 85));
              onSelectRegion({
                kind: 'bbox',
                nameZh: ui.customBoxName,
                bbox: {
                  minLon: +Math.min(...lons).toFixed(4),
                  minLat: +Math.min(...lats).toFixed(4),
                  maxLon: +Math.max(...lons).toFixed(4),
                  maxLat: +Math.max(...lats).toFixed(4),
                },
              });
              onFinishDrawTool();
            } else if (drawToolMode === 'circle') {
              const cLL = map.unproject([startX, startY]);
              const eLL = map.unproject([endX, endY]);
              const center: [number, number] = [
                +clamp(cLL.lng, -180, 180).toFixed(4),
                +clamp(cLL.lat, -85, 85).toFixed(4),
              ];
              const edge: [number, number] = [
                clamp(eLL.lng, -180, 180),
                clamp(eLL.lat, -85, 85),
              ];
              const radiusKm = clamp(Math.round(haversineDistanceKm(center, edge)), 8, 2500);
              onSelectRegion({
                kind: 'circle',
                nameZh: ui.customCircleName,
                center,
                radiusKm,
                bbox: computeCircleBBox(center, radiusKm),
              });
              onFinishDrawTool();
            }
          }}
          className="absolute inset-0 z-15 cursor-crosshair select-none touch-none"
        >
          {/* Active Draw Tool Instruction Banner */}
          <div
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto absolute top-16 left-4 z-20 flex items-center gap-3 px-3.5 py-2 rounded-lg atlas-chassis atlas-reticle text-xs text-slate-200"
          >
            <span>{drawToolMode === 'box' ? ui.boxModeBanner : ui.circleModeBanner}</span>
            <button
              type="button"
              onClick={onFinishDrawTool}
              className="px-2 py-0.5 rounded bg-white/[0.08] hover:bg-white/[0.15] text-slate-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              {ui.cancelBtn}
            </button>
          </div>

          {/* Live Screen-Space Drag Preview */}
          {dragPreview && (
            <svg className="pointer-events-none absolute inset-0 w-full h-full" aria-hidden="true">
              {drawToolMode === 'box' ? (
                <rect
                  x={Math.min(dragPreview.startX, dragPreview.curX)}
                  y={Math.min(dragPreview.startY, dragPreview.curY)}
                  width={Math.abs(dragPreview.curX - dragPreview.startX)}
                  height={Math.abs(dragPreview.curY - dragPreview.startY)}
                  fill="rgba(56, 189, 248, 0.14)"
                  stroke="#38bdf8"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
              ) : (
                <>
                  <circle
                    cx={dragPreview.startX}
                    cy={dragPreview.startY}
                    r={Math.hypot(
                      dragPreview.curX - dragPreview.startX,
                      dragPreview.curY - dragPreview.startY,
                    )}
                    fill="rgba(56, 189, 248, 0.14)"
                    stroke="#38bdf8"
                    strokeWidth="1.5"
                    strokeDasharray="5 3"
                  />
                  <circle
                    cx={dragPreview.startX}
                    cy={dragPreview.startY}
                    r="3"
                    fill="#38bdf8"
                  />
                </>
              )}
            </svg>
          )}
        </div>
      )}

      {/* Always-Present Geopolitical & Historical Flag Leader Callouts */}
      <AnimatePresence>
        {flagOverlays
          .filter((ov) => ov.visible)
          .map((flagOverlay) => {
            const pol = flagOverlay.polity;
            const locPolity = localizePolity(pol, language);
            const isCompactLeft = flagOverlay.x < 250;
            const viewW = containerRef.current?.clientWidth ?? 1280;
            const endX = isCompactLeft
              ? clamp(Math.round(flagOverlay.x), 96, Math.max(96, viewW - 96))
              : Math.round(flagOverlay.x - 66);
            const endY = isCompactLeft
              ? Math.max(68, Math.round(flagOverlay.y - 46))
              : Math.round(flagOverlay.y - 40);
            const cardTransform = isCompactLeft
              ? `translate3d(${endX}px, ${endY}px, 0) translate(-50%, -100%)`
              : `translate3d(${endX}px, ${endY}px, 0) translate(-100%, -50%)`;
            const polRegionCount = activeTerritories.filter(
              (t) => (resolvePolityForTerritory(t, activePolities) ?? pol).id === pol.id,
            ).length;

            return (
              <motion.div
                key={`polity-callout-${pol.id}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="pointer-events-none absolute inset-0 z-10"
              >
                <svg
                  className="pointer-events-none absolute inset-0 w-full h-full"
                  aria-hidden="true"
                >
                  <line
                    x1={Math.round(flagOverlay.x)}
                    y1={Math.round(flagOverlay.y)}
                    x2={endX}
                    y2={endY}
                    stroke={pol.borderColor}
                    strokeOpacity="0.72"
                    strokeWidth="1.15"
                  />
                  <circle
                    cx={Math.round(flagOverlay.x)}
                    cy={Math.round(flagOverlay.y)}
                    r="6.5"
                    fill="none"
                    stroke={pol.borderColor}
                    strokeOpacity="0.52"
                    strokeWidth="0.9"
                    strokeDasharray="2 2"
                  />
                  <circle
                    cx={Math.round(flagOverlay.x)}
                    cy={Math.round(flagOverlay.y)}
                    r="2.6"
                    fill={pol.representativeColor}
                    stroke={pol.borderColor}
                    strokeWidth="1.25"
                  />
                </svg>
                <div
                  style={{ transform: cardTransform }}
                  className="pointer-events-auto absolute top-0 left-0"
                >
                  <button
                    type="button"
                    data-testid="polity-flag-callout"
                    onClick={() =>
                      onSelectEntity({
                        kind: 'polity',
                        phase: pol,
                        regionCount: polRegionCount,
                      })
                    }
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg atlas-chassis atlas-reticle text-slate-100 hover:border-sky-400/65 transition-colors cursor-pointer group"
                    aria-label={ui.inspectPolityAria(locPolity.name)}
                  >
                    <HistoricalFlagSvg
                      flagId={pol.flagId}
                      flagSvg={pol.flagSvg}
                      flagAsset={pol.flagAsset}
                      label={pol.flagLabel}
                      language={language}
                      className="w-9 h-6 shrink-0 rounded-[2px] ring-1 ring-white/20"
                    />
                    <div className="text-left leading-tight">
                      <div className="text-xs font-semibold tracking-tight text-white group-hover:text-sky-100 transition-colors whitespace-nowrap">
                        {locPolity.name}
                      </div>
                      <div className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">
                        {locPolity.capitalName}
                      </div>
                    </div>
                  </button>
                </div>
              </motion.div>
            );
          })}
      </AnimatePresence>

      {/* Flora & Fauna Species Discovery Leader Lines & Smooth Fade-In/Out Callouts */}
      <svg
        className="pointer-events-none absolute inset-0 z-10 w-full h-full"
        aria-hidden="true"
      >
        <AnimatePresence>
          {visibleSpeciesBubbles.map(({ species, anchorX, anchorY, x, y }) => (
            <motion.g
              key={`sp-line-${species.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            >
              <line
                x1={anchorX}
                y1={anchorY}
                x2={x}
                y2={y - 8}
                stroke="rgba(52, 211, 153, 0.58)"
                strokeWidth="1.1"
                strokeDasharray="3 2"
              />
            </motion.g>
          ))}
        </AnimatePresence>
      </svg>

      <AnimatePresence>
        {visibleSpeciesBubbles.map(({ species, x, y }) => {
          const spLoc = localizeSpecies(species, language);
          return (
            <motion.div
              key={`sp-card-${species.id}`}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              style={{
                left: `${Math.round(x)}px`,
                top: `${Math.round(y)}px`,
                transform: 'translate(-50%, -100%)',
              }}
              className="absolute z-10"
            >
              <button
                type="button"
                onClick={() => onSelectEntity({ kind: 'species', species })}
                className="w-[232px] px-3 py-2 rounded-lg atlas-chassis border border-emerald-400/35 text-left hover:border-emerald-400/65 transition-colors cursor-pointer"
                aria-label={ui.speciesAria(spLoc.commonName)}
              >
                <div className="text-xs font-semibold text-emerald-200 truncate">
                  {spLoc.commonName}
                </div>
                <div className="text-[11px] text-slate-300 truncate mt-0.5">
                  {ui.speciesDiscoveryPrefix}
                  {spLoc.discoverer}
                </div>
                <div className="text-[10px] text-slate-400 font-mono tabular-nums truncate mt-0.5">
                  {formatYearByLang(species.discoveryYear, language, true)} ·{' '}
                  {species.scientificName}
                </div>
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Orbital Transition Affordance when Lunar & Deep Space layer is active on Earth */}
      <AnimatePresence>
        {hasSpaceLayer && projectionMode === '3d' && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto absolute top-16 left-4 z-10 flex items-center gap-3 px-3.5 py-2 rounded-lg atlas-chassis atlas-reticle text-xs text-slate-300"
          >
            <span>{ui.scrollToSolarHint}</span>
            <button
              type="button"
              onClick={() => onSpaceStageChange('solar_system', 'moon')}
              className="px-2.5 py-1 rounded bg-sky-400/15 hover:bg-sky-400/25 border border-sky-400/35 text-sky-300 font-medium transition-colors whitespace-nowrap cursor-pointer"
            >
              {ui.enterSolarBtn}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
