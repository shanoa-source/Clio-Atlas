import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { EntityDetailPopover } from './components/EntityDetailPopover';
import { GlobalHeaderBar } from './components/GlobalHeaderBar';
import { GlobalTimelineDock } from './components/GlobalTimelineDock';
import { RegionOverviewChatSidebar } from './components/RegionOverviewChatSidebar';
import { MapLibreGlobeStage } from './map/MapLibreGlobeStage';
import { DeepSpaceStage } from './three/DeepSpaceStage';
import {
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
import { clamp, stepHistoricalYearWithLoop } from './utils/geoMath';
import { extractRegionOverview } from './utils/regionSelector';

const ALL_TERRESTRIAL_LAYERS: OverlayLayerId[] = [
  'population_density',
  'night_lights',
  'transport_routes',
  'species_discovery',
  'mortality_catastrophe',
];

export default function App() {
  // Language option strictly restricted to Chinese ('zh'), English ('en'), and German ('de')
  const [language, setLanguage] = useState<AppLanguage>(() => {
    try {
      return normalizeAppLanguage(window.localStorage.getItem('civ_atlas_lang'));
    } catch {
      return 'zh';
    }
  });
  // Default year -454 (454 BCE) frames the Classical Athens test dataset on the global timeline
  const [currentYear, setCurrentYear] = useState<number>(-454);
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
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [customEvents, setCustomEvents] = useState<CustomHistoricalEvent[]>([]);
  const [hoverCoords, setHoverCoords] = useState<[number, number] | null>(null);
  const [cameraCommand, setCameraCommand] = useState<{
    id: number;
    kind: 'zoom_in' | 'zoom_out' | 'reset_north';
  } | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem('civ_atlas_lang', language);
    } catch {
      // Ignore storage write errors in restricted contexts
    }
    const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === language);
    document.documentElement.lang = langMeta?.htmlLang ?? 'zh-CN';
    document.title = UI_TEXT[language].pageTitle;
  }, [language]);

  // Load extensible `data/events/custom_events.json` via server (skips cleanly if empty)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/overview-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && Array.isArray(data.customEvents)) {
          setCustomEvents(data.customEvents);
        }
      })
      .catch(() => {
        // Optional extension files default to empty
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Automatic 1-year precision playback (loops within selectedRange when active)
  useEffect(() => {
    if (!isPlaying) return;
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
  }, [isPlaying, playbackSpeed, selectedRange]);

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
    [currentYear, selectedRange, activeLayers, selectedRegion, customEvents, language],
  );

  const handleSelectRegion = useCallback((region: MapRegionSelection | null) => {
    setSelectedRegion(region);
    if (region) {
      setSidebarOpen(true);
    }
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

  return (
    <main
      className="relative w-screen h-screen overflow-hidden bg-[#06080D] text-slate-100 select-none"
      data-lang={language}
      data-projection={projectionMode}
      data-active-layers={activeLayers.length > 0 ? activeLayers.join(',') : 'polity_only'}
      data-space-stage={spaceStage}
      data-range-active={selectedRange ? 'true' : 'false'}
      data-region-selected={selectedRegion ? selectedRegion.kind : 'none'}
    >
      {/* Top Precision Coordinate, Language Selector & Multi-Layer Command Bar */}
      <GlobalHeaderBar
        language={language}
        onChangeLanguage={setLanguage}
        activeLayers={activeLayers}
        projectionMode={projectionMode}
        spaceStage={spaceStage}
        hoverCoords={hoverCoords}
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
                onHoverCoordsChange={setHoverCoords}
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
              <DeepSpaceStage
                language={language}
                currentYear={currentYear}
                spaceStage={spaceStage}
                focusedBodyId={focusedBodyId}
                cameraCommand={cameraCommand}
                onSpaceStageChange={handleSpaceStageChange}
                onSelectEntity={setSelectedEntity}
              />
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
          onSetDrawToolMode={setDrawToolMode}
          onClearRegion={() => {
            setSelectedRegion(null);
            setDrawToolMode('none');
          }}
        />
      )}

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
