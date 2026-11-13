import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AiModelConfigModal } from './components/AiModelConfigModal';
import { AtlasBootOverlay } from './components/AtlasBootOverlay';
import { EntityDetailPopover } from './components/EntityDetailPopover';
import { GlobalHeaderBar } from './components/GlobalHeaderBar';
import { GlobalTimelineDock } from './components/GlobalTimelineDock';
import { IntroStaticPage } from './components/IntroStaticPage';
import { RegionOverviewChatSidebar } from './components/RegionOverviewChatSidebar';
import { MapLibreGlobeStage } from './map/MapLibreGlobeStage';
import { useOsmResolvedTerritories } from './services/osmBoundaryService';
import {
  getAtlasDatasetPresets,
  setBackendDatasetsBundle,
  setRuntimeImportedBundle,
  subscribeAtlasDataLayer,
} from './shared/atlasDataLayer';
import {
  AiChannelConfig,
  AppLanguage,
  CustomHistoricalEvent,
  MapRegionSelection,
  OverlayLayerId,
  ProjectionMode,
  RegionDrawToolMode,
  SelectedEntity,
  SpaceStage,
  TimeRangeSelection,
} from './types/history';
import {
  normalizeAppLanguage,
  SUPPORTED_LANGUAGES,
  UI_TEXT,
} from './i18n/translations';
import {
  loadAiChannelConfig,
  resetAiChannelConfig,
  saveAiChannelConfig,
} from './utils/aiChannelStorage';
import {
  clamp,
  getActivePolityPhases,
  getActiveTerritoryRegions,
  resolvePolityForTerritory,
  stepHistoricalYearWithLoop,
} from './utils/geoMath';
import { extractRegionOverview } from './utils/regionSelector';

const LazyDeepSpaceStage = lazy(() => import('./three/DeepSpaceStage'));

const ALL_TERRESTRIAL_LAYERS: OverlayLayerId[] = [
  'population_density',
  'night_lights',
  'transport_routes',
  'species_discovery',
  'mortality_catastrophe',
];

function shouldBypassBootOverlay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  } catch {
    return false;
  }
}

function checkIsIntroPath(pathname: string): boolean {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return clean === '/intro';
}

export default function App() {
  const [isIntroRoute, setIsIntroRoute] = useState<boolean>(() =>
    typeof window !== 'undefined' ? checkIsIntroPath(window.location.pathname) : false,
  );

  // Language option strictly restricted to English ('en', default), Chinese ('zh'), and German ('de')
  const [language, setLanguage] = useState<AppLanguage>(() => {
    try {
      return normalizeAppLanguage(window.localStorage.getItem('civ_atlas_lang'));
    } catch {
      return 'en';
    }
  });

  // Initial year derived from the unified data layer
  const [currentYear, setCurrentYear] = useState<number>(() => {
    const firstPreset = getAtlasDatasetPresets()[0];
    return firstPreset ? firstPreset.defaultYear : -454;
  });
  const [selectedRange, setSelectedRange] = useState<TimeRangeSelection>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<1 | 5>(1);
  const [activeLayers, setActiveLayers] = useState<OverlayLayerId[]>([]);
  const [projectionMode, setProjectionMode] = useState<ProjectionMode>('3d');
  const [spaceStage, setSpaceStage] = useState<SpaceStage>('earth');
  const [focusedBodyId, setFocusedBodyId] = useState<string>('moon');
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<MapRegionSelection | null>(null);
  const [drawToolMode, setDrawToolMode] = useState<RegionDrawToolMode>('none');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  );
  const [customEvents, setCustomEvents] = useState<CustomHistoricalEvent[]>([]);
  const [dataLayerRev, setDataLayerRev] = useState<number>(0);
  const hoverCoordsListenerRef = useRef<((coords: [number, number] | null) => void) | null>(null);
  const [cameraCommand, setCameraCommand] = useState<{
    id: number;
    kind: 'zoom_in' | 'zoom_out' | 'reset_north' | 'fly_to';
    center?: [number, number];
    zoom?: number;
  } | null>(null);

  // User-configurable AI API & Gemini Model Channel (defaults to server Gemini 4 Hydrogen)
  const [aiConfig, setAiConfig] = useState<AiChannelConfig>(() => loadAiChannelConfig());
  const [aiModalOpen, setAiModalOpen] = useState<boolean>(false);

  const navigateTo = useCallback((nextPath: '/' | '/intro') => {
    if (typeof window === 'undefined') return;
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath);
    }
    setIsIntroRoute(checkIsIntroPath(nextPath));
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setIsIntroRoute(checkIsIntroPath(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    return subscribeAtlasDataLayer(() => {
      setDataLayerRev((r) => r + 1);
    });
  }, []);

  useEffect(() => {
    let wasDesktop = window.innerWidth >= 1024;
    const onResize = () => {
      const isNowDesktop = window.innerWidth >= 1024;
      if (wasDesktop && !isNowDesktop) {
        setSidebarOpen(false);
      } else if (!wasDesktop && isNowDesktop) {
        setSidebarOpen(true);
      }
      wasDesktop = isNowDesktop;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Entry Boot Sequence: stays active until fine-grained OSM territory parcels are loaded & rendered on the 3D Globe
  const [bootDismissed, setBootDismissed] = useState<boolean>(() => shouldBypassBootOverlay());
  const [mapStyleReady, setMapStyleReady] = useState<boolean>(false);
  const [parcelsRendered, setParcelsRendered] = useState<boolean>(false);
  const [minBootElapsed, setMinBootElapsed] = useState<boolean>(false);

  const { loadingSnapshot: osmSnapshot } = useOsmResolvedTerritories(currentYear);

  // Minimum optical calibration settle (420ms) + airgapped failsafe timeout (8500ms)
  useEffect(() => {
    if (isIntroRoute || bootDismissed) return;
    const minTimer = window.setTimeout(() => {
      setMinBootElapsed(true);
    }, 420);
    const failsafeTimer = window.setTimeout(() => {
      setParcelsRendered(true);
      setMinBootElapsed(true);
      setBootDismissed(true);
    }, 8500);
    return () => {
      window.clearTimeout(minTimer);
      window.clearTimeout(failsafeTimer);
    };
  }, [bootDismissed, isIntroRoute]);

  // Dismiss entry loader smoothly once fine-grained parcels are rendered on the globe
  useEffect(() => {
    if (isIntroRoute || bootDismissed) return;
    if (parcelsRendered && minBootElapsed) {
      const settleTimer = window.setTimeout(() => {
        setBootDismissed(true);
      }, 140);
      return () => window.clearTimeout(settleTimer);
    }
  }, [bootDismissed, parcelsRendered, minBootElapsed, isIntroRoute]);

  // Pre-warm lazy DeepSpaceStage Three.js chunk during browser idle time AFTER initial globe boot finishes
  useEffect(() => {
    if (isIntroRoute || !bootDismissed) return;
    const idleTimer = window.setTimeout(() => {
      void import('./three/DeepSpaceStage');
    }, 1200);
    return () => window.clearTimeout(idleTimer);
  }, [bootDismissed, isIntroRoute]);

  useEffect(() => {
    try {
      window.localStorage.setItem('civ_atlas_lang', language);
    } catch {
      // Ignore storage write errors in restricted contexts
    }
    const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === language);
    document.documentElement.lang = langMeta?.htmlLang ?? 'en';
    document.title = UI_TEXT[language].pageTitle;
  }, [language]);

  useEffect(() => {
    setSelectedEntity((prev) => {
      if (!prev) return null;
      if (
        prev.kind === 'polity' &&
        (currentYear < prev.phase.startYear || currentYear > prev.phase.endYear)
      ) {
        return null;
      }
      return prev;
    });
  }, [currentYear]);

  // Load all backend-detected datasets (`datasetsBundle`), runtime `bundle`, and `customEvents` uniformly
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/overview-config?lang=${encodeURIComponent(language)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (Array.isArray(data.customEvents)) {
          setCustomEvents(data.customEvents);
        }
        if (data.datasetsBundle && typeof data.datasetsBundle === 'object') {
          setBackendDatasetsBundle(data.datasetsBundle);
        }
        if (data.bundle && typeof data.bundle === 'object') {
          setRuntimeImportedBundle(data.bundle);
        }
      })
      .catch(() => {
        // Optional extension files default to built-in merged dataset layer
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Automatic 1-year precision playback (loops within selectedRange when active)
  useEffect(() => {
    if (!isPlaying || isIntroRoute) return;
    const intervalMs = playbackSpeed === 5 ? 90 : 320;
    const timer = window.setInterval(() => {
      setCurrentYear((prev) => {
        const { nextYear, reachedGlobalEnd } = stepHistoricalYearWithLoop(prev, 1, selectedRange);
        if (reachedGlobalEnd) {
          setIsPlaying(false);
        }
        return nextYear;
      });
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [isPlaying, playbackSpeed, selectedRange, isIntroRoute]);

  // Smoothly update or dismiss open polity inspector popover across regime changes & polity demise
  useEffect(() => {
    setSelectedEntity((prev) => {
      if (!prev || prev.kind !== 'polity') return prev;
      if (currentYear >= prev.phase.startYear && currentYear <= prev.phase.endYear) {
        return prev;
      }
      const nextPolities = getActivePolityPhases(currentYear);
      if (nextPolities.length === 0) {
        return null;
      }
      const successor = nextPolities[0];
      const nextRegionCount = getActiveTerritoryRegions(currentYear).filter(
        (t) => (resolvePolityForTerritory(t, nextPolities) ?? successor).id === successor.id,
      ).length;
      return {
        kind: 'polity',
        phase: successor,
        regionCount: nextRegionCount,
      };
    });
  }, [currentYear]);

  const overview = useMemo(
    () =>
      extractRegionOverview({
        currentYear,
        selectedRange,
        activeLayers,
        selectedRegion,
        customEvents,
        language,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentYear, selectedRange, activeLayers, selectedRegion, customEvents, language, dataLayerRev],
  );

  const handleSelectRegion = useCallback((region: MapRegionSelection | null) => {
    setSelectedRegion(region);
    if (region) {
      setSidebarOpen(true);
    }
  }, []);

  const handleSaveAiConfig = useCallback((next: AiChannelConfig) => {
    saveAiChannelConfig(next);
    setAiConfig(next);
  }, []);

  const handleResetAiConfig = useCallback(() => {
    const fallback = resetAiChannelConfig();
    setAiConfig(fallback);
  }, []);

  const handleChangeSelectedRange = useCallback((range: TimeRangeSelection) => {
    setSelectedRange(range);
    if (range) {
      const rStart = Math.min(range[0], range[1]);
      const rEnd = Math.max(range[0], range[1]);
      setCurrentYear((prev) => {
        const clamped = clamp(prev, rStart, rEnd);
        return clamped === 0 ? -1 : clamped;
      });
    }
  }, []);

  const handleToggleLayer = useCallback((layerId: OverlayLayerId) => {
    setActiveLayers((prev) => {
      const exists = prev.includes(layerId);
      const next = exists ? prev.filter((id) => id !== layerId) : [...prev, layerId];
      if (!next.includes('space_race')) {
        setSpaceStage('earth');
      } else if (!exists && layerId === 'space_race') {
        setProjectionMode('3d');
      }
      return next;
    });
  }, []);

  const handleClearLayers = useCallback(() => {
    setActiveLayers([]);
    setSelectedEntity(null);
    setSpaceStage('earth');
  }, []);

  const handleSelectTerrestrialLayers = useCallback(() => {
    setActiveLayers((prev) => {
      const hasSpace = prev.includes('space_race');
      return hasSpace ? [...ALL_TERRESTRIAL_LAYERS, 'space_race'] : [...ALL_TERRESTRIAL_LAYERS];
    });
  }, []);

  const handleSetProjection = useCallback((mode: ProjectionMode) => {
    setProjectionMode(mode);
    setSpaceStage('earth');
  }, []);

  const handleSpaceStageChange = useCallback((stage: SpaceStage, bodyId?: string) => {
    setSpaceStage(stage);
    if (bodyId) {
      setFocusedBodyId(bodyId);
      setDrawToolMode('none');
    }
  }, []);

  const handleCameraAction = useCallback((kind: 'zoom_in' | 'zoom_out' | 'reset_north') => {
    setCameraCommand({ id: Date.now() + Math.random(), kind });
  }, []);

  const handleMapStyleReady = useCallback(() => {
    setMapStyleReady(true);
  }, []);

  const handleInitialParcelsReady = useCallback(() => {
    setParcelsRendered(true);
  }, []);

  const handleHoverCoordsChange = useCallback((coords: [number, number] | null) => {
    hoverCoordsListenerRef.current?.(coords);
  }, []);

  const subscribeHoverCoords = useCallback(
    (listener: (coords: [number, number] | null) => void) => {
      hoverCoordsListenerRef.current = listener;
      return () => {
        if (hoverCoordsListenerRef.current === listener) {
          hoverCoordsListenerRef.current = null;
        }
      };
    },
    [],
  );

  if (isIntroRoute) {
    return (
      <IntroStaticPage
        language={language}
        onChangeLanguage={setLanguage}
        onLaunchAtlas={() => navigateTo('/')}
      />
    );
  }

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#04060B] text-slate-100 select-none"
      data-lang={language}
      data-projection={projectionMode}
      data-active-layers={activeLayers.length > 0 ? activeLayers.join(',') : 'polity_only'}
      data-space-stage={spaceStage}
      data-range-active={selectedRange ? 'true' : 'false'}
      data-region-selected={selectedRegion ? selectedRegion.kind : 'none'}
      data-boot-ready={bootDismissed ? 'true' : 'false'}
      data-ai-channel={aiConfig.mode}
    >
      {/* Entry Geodesic Calibration Overlay (Earth + Compass animation only, active until fine OSM parcels render) */}
      <AtlasBootOverlay
        language={language}
        visible={!bootDismissed}
        mapStyleReady={mapStyleReady}
        parcelsRendered={parcelsRendered}
        osmSnapshot={osmSnapshot}
      />

      {/* Top Live Coordinate Readout, /intro Entry, Language Selector & Multi-Layer Command Bar */}
      <GlobalHeaderBar
        language={language}
        onChangeLanguage={setLanguage}
        currentYear={currentYear}
        activeLayers={activeLayers}
        projectionMode={projectionMode}
        spaceStage={spaceStage}
        subscribeHoverCoords={subscribeHoverCoords}
        onOpenIntro={() => {
          setIsPlaying(false);
          navigateTo('/intro');
        }}
        onToggleLayer={handleToggleLayer}
        onClearLayers={handleClearLayers}
        onSelectTerrestrialLayers={handleSelectTerrestrialLayers}
        onSetProjection={handleSetProjection}
        onCameraAction={handleCameraAction}
      />

      {/* Primary Interactive Geospatial Stage: MapLibre GL JS 3D Globe / 2D Map OR Three.js Deep Space */}
      <div className="w-full h-full">
        <AnimatePresence mode="wait">
          {spaceStage === 'earth' ? (
            <motion.div
              key="stage-earth-maplibre"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
              className="w-full h-full"
            >
              <MapLibreGlobeStage
                language={language}
                currentYear={currentYear}
                selectedRange={selectedRange}
                activeLayers={activeLayers}
                projectionMode={projectionMode}
                selectedRegion={selectedRegion}
                drawToolMode={drawToolMode}
                cameraCommand={cameraCommand}
                onSpaceStageChange={handleSpaceStageChange}
                onSelectEntity={setSelectedEntity}
                onSelectRegion={handleSelectRegion}
                onFinishDrawTool={() => setDrawToolMode('none')}
                onHoverCoordsChange={handleHoverCoordsChange}
                onMapStyleReady={handleMapStyleReady}
                onInitialParcelsReady={handleInitialParcelsReady}
              />
            </motion.div>
          ) : (
            <motion.div
              key="stage-deep-space-three"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.26 }}
              className="w-full h-full"
            >
              <Suspense fallback={<div className="w-full h-full bg-[#04060B]" />}>
                <LazyDeepSpaceStage
                  language={language}
                  currentYear={currentYear}
                  spaceStage={spaceStage}
                  focusedBodyId={focusedBodyId}
                  cameraCommand={
                    cameraCommand && cameraCommand.kind !== 'fly_to'
                      ? { id: cameraCommand.id, kind: cameraCommand.kind }
                      : null
                  }
                  onSpaceStageChange={handleSpaceStageChange}
                  onSelectEntity={setSelectedEntity}
                />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Stacked Multi-Layer Quantitative Scale Legend & Contextual Inspector */}
      <EntityDetailPopover
        language={language}
        selectedEntity={selectedEntity}
        activeLayers={activeLayers}
        sidebarOpen={sidebarOpen}
        onClose={() => setSelectedEntity(null)}
      />

      {/* Right Collapsible Overview & AI Chat Sidebar */}
      {spaceStage === 'earth' && (
        <RegionOverviewChatSidebar
          language={language}
          isOpen={sidebarOpen}
          onToggleOpen={() => setSidebarOpen((o) => !o)}
          overview={overview}
          selectedRegion={selectedRegion}
          drawToolMode={drawToolMode}
          currentYear={currentYear}
          selectedRange={selectedRange}
          activeLayers={activeLayers}
          aiConfig={aiConfig}
          onOpenAiConfig={() => setAiModalOpen(true)}
          onSetDrawToolMode={setDrawToolMode}
          onClearRegion={() => {
            setSelectedRegion(null);
            setDrawToolMode('none');
          }}
        />
      )}

      {/* AI API & Gemini Model Channel Configuration Modal */}
      <AiModelConfigModal
        language={language}
        isOpen={aiModalOpen}
        config={aiConfig}
        onSave={handleSaveAiConfig}
        onReset={handleResetAiConfig}
        onClose={() => setAiModalOpen(false)}
      />

      {/* Bottom Collapsible Precision Optical Chronometer */}
      <GlobalTimelineDock
        language={language}
        currentYear={currentYear}
        selectedRange={selectedRange}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        sidebarOpen={spaceStage === 'earth' && sidebarOpen}
        onChangeYear={setCurrentYear}
        onChangeSelectedRange={handleChangeSelectedRange}
        onTogglePlay={() => setIsPlaying((p) => !p)}
        onToggleSpeed={() => setPlaybackSpeed((s) => (s === 1 ? 5 : 1))}
      />
    </main>
  );
}
