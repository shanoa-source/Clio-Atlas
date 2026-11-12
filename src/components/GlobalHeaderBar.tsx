import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Compass,
  Crosshair,
  Globe,
  Languages,
  Layers,
  Map as MapIcon,
  Minus,
  Plus,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AppLanguage, OverlayLayerId, ProjectionMode, SpaceStage } from '../types/history';
import {
  getOverlayLayerName,
  getOverlayLayerSubtitle,
  SUPPORTED_LANGUAGES,
  UI_TEXT,
} from '../i18n/translations';

interface GlobalHeaderBarProps {
  language: AppLanguage;
  onChangeLanguage: (lang: AppLanguage) => void;
  activeLayers: OverlayLayerId[];
  projectionMode: ProjectionMode;
  spaceStage: SpaceStage;
  hoverCoords: [number, number] | null;
  onToggleLayer: (layerId: OverlayLayerId) => void;
  onClearLayers: () => void;
  onSelectTerrestrialLayers: () => void;
  onSetProjection: (mode: ProjectionMode) => void;
  onCameraAction: (kind: 'zoom_in' | 'zoom_out' | 'reset_north') => void;
}

/**
 * Multi-select thematic overlay layers.
 * Geopolitics & Historical Flags remains the permanent baseline and is hidden as a category.
 */
export const OVERLAY_LAYER_OPTIONS: Array<{
  id: OverlayLayerId;
  label: string;
  subtitle: string;
  accentHex: string;
}> = [
  {
    id: 'population_density',
    label: '人口密度',
    subtitle: '定量密度热区（15–160+ 人/km²）',
    accentHex: '#3B82F6',
  },
  {
    id: 'night_lights',
    label: '夜晚光照',
    subtitle: '聚落人口分布与工矿夜光辐射',
    accentHex: '#F59E0B',
  },
  {
    id: 'transport_routes',
    label: '运输航道',
    subtitle: '真实海峡海角样条航线与频次着色',
    accentHex: '#F87171',
  },
  {
    id: 'species_discovery',
    label: '物种发现',
    subtitle: '新动植物发现地点与博物命名提示',
    accentHex: '#34D399',
  },
  {
    id: 'mortality_catastrophe',
    label: '死亡浩劫',
    subtitle: '伤亡人数定量热区与平滑淡入淡出',
    accentHex: '#EF4444',
  },
  {
    id: 'space_race',
    label: '月球与深空',
    subtitle: '滚轮缩至太阳系平面与探测器轨迹',
    accentHex: '#38BDF8',
  },
];

function formatCoordPair(coords: [number, number] | null): string {
  if (!coords) return '37.98°N · 23.73°E';
  const [lon, lat] = coords;
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(2)}°${ns} · ${Math.abs(lon).toFixed(2)}°${ew}`;
}

export const GlobalHeaderBar: React.FC<GlobalHeaderBarProps> = ({
  language,
  onChangeLanguage,
  activeLayers,
  projectionMode,
  spaceStage,
  hoverCoords,
  onToggleLayer,
  onClearLayers,
  onSelectTerrestrialLayers,
  onSetProjection,
  onCameraAction,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const menuContainerRef = useRef<HTMLDivElement | null>(null);
  const langContainerRef = useRef<HTMLDivElement | null>(null);

  const ui = UI_TEXT[language];
  const currentLangOption =
    SUPPORTED_LANGUAGES.find((l) => l.code === language) ?? SUPPORTED_LANGUAGES[0];

  const activeItems = OVERLAY_LAYER_OPTIONS.filter((m) => activeLayers.includes(m.id));
  const activeCount = activeItems.length;

  useEffect(() => {
    if (!menuOpen && !langMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuContainerRef.current && !menuContainerRef.current.contains(target)) {
        setMenuOpen(false);
      }
      if (langContainerRef.current && !langContainerRef.current.contains(target)) {
        setLangMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setLangMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen, langMenuOpen]);

  const firstActiveLabel =
    activeCount > 0 ? getOverlayLayerName(activeItems[0].id, language) : '';
  const triggerLabel =
    activeCount === 0
      ? ui.layerTriggerDefault
      : activeCount === 1
        ? firstActiveLabel
        : `${firstActiveLabel} +${activeCount - 1}`;

  return (
    <header className="pointer-events-none fixed top-3.5 inset-x-4 z-30 flex items-center justify-between gap-4">
      {/* Top-Left: Pure Precision Coordinate Readout */}
      <div
        aria-label={ui.coordAria}
        data-testid="coordinate-readout"
        className="pointer-events-auto flex items-center gap-2 h-10 px-3.5 rounded-xl bg-[#090C12]/96 border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_10px_28px_rgba(0,0,0,0.65)] shrink-0"
      >
        <Crosshair className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
        <span className="text-[11px] font-mono tabular-nums text-slate-300 tracking-wide whitespace-nowrap min-w-[116px]">
          {spaceStage === 'earth' ? formatCoordPair(hoverCoords) : ui.deepSpaceCoord}
        </span>
      </div>

      {/* Top-Right: Language Selector (zh/en/de) + Multi-Select Layer Menu + 3D/2D & Camera Controls */}
      <div className="pointer-events-auto flex items-center gap-2.5 shrink-0">
        {/* Language Selector Dropdown (Strictly English, German, Chinese) */}
        <div ref={langContainerRef} className="relative shrink-0">
          <div className="flex items-center h-10 p-1 rounded-xl bg-[#090C12]/96 border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.68)]">
            <button
              type="button"
              onClick={() => {
                setLangMenuOpen((prev) => !prev);
                setMenuOpen(false);
              }}
              aria-expanded={langMenuOpen}
              aria-haspopup="menu"
              aria-label={ui.languageMenuAria}
              data-testid="language-menu-trigger"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-slate-200 hover:text-white hover:bg-white/[0.05] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>{currentLangOption.shortLabel}</span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                  langMenuOpen ? 'rotate-180 text-slate-200' : ''
                }`}
              />
            </button>
          </div>

          <AnimatePresence>
            {langMenuOpen && (
              <motion.div
                role="menu"
                aria-label={ui.languageMenuAria}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 mt-2 w-36 rounded-xl bg-[#090C12]/98 border border-white/[0.1] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_52px_rgba(0,0,0,0.85)] z-40 space-y-0.5"
              >
                {SUPPORTED_LANGUAGES.map((opt) => {
                  const isSelected = opt.code === language;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isSelected}
                      data-testid={`lang-option-${opt.code}`}
                      onClick={() => {
                        onChangeLanguage(opt.code);
                        setLangMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        isSelected
                          ? 'bg-sky-400/[0.14] text-white'
                          : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'
                      }`}
                    >
                      <span>{opt.nativeLabel}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Multi-Select Thematic Layer Overlay Dropdown */}
        <div ref={menuContainerRef} className="relative">
          <div className="flex items-center h-10 p-1 rounded-xl bg-[#090C12]/96 border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.68)]">
            <button
              type="button"
              onClick={() => {
                setMenuOpen((prev) => !prev);
                setLangMenuOpen(false);
              }}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={ui.openLayerMenuAria}
              data-testid="layer-menu-trigger"
              className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                activeCount > 0
                  ? 'bg-sky-400/16 text-sky-200'
                  : 'text-slate-200 hover:text-white hover:bg-white/[0.05]'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>{triggerLabel}</span>
              {activeCount > 1 && (
                <span className="text-[11px] font-mono tabular-nums text-sky-300/90">
                  ({activeCount})
                </span>
              )}
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-150 ${
                  menuOpen ? 'rotate-180 text-slate-200' : ''
                }`}
              />
            </button>

            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onClearLayers();
                  setMenuOpen(false);
                }}
                aria-label={ui.clearAllLayersAria}
                className="ml-0.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                role="menu"
                aria-label={ui.layerMenuAria}
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 mt-2 w-76 rounded-xl bg-[#090C12]/98 border border-white/[0.1] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_52px_rgba(0,0,0,0.85)] z-40"
              >
                <div className="flex items-center justify-between px-2.5 py-1.5 mb-1 border-b border-white/[0.06] text-[11px] text-slate-400">
                  <span>{ui.multiSelectHint}</span>
                  <span className="font-mono tabular-nums text-slate-300">
                    {ui.selectedCount(activeCount, OVERLAY_LAYER_OPTIONS.length)}
                  </span>
                </div>

                <div className="space-y-0.5">
                  {OVERLAY_LAYER_OPTIONS.map((item) => {
                    const isChecked = activeLayers.includes(item.id);
                    const localizedLabel = getOverlayLayerName(item.id, language);
                    const localizedSub = getOverlayLayerSubtitle(item.id, language);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={isChecked}
                        data-testid={`layer-option-${item.id}`}
                        onClick={() => onToggleLayer(item.id)}
                        className={`w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                          isChecked
                            ? 'bg-sky-400/[0.12] text-white'
                            : 'text-slate-200 hover:bg-white/[0.05] hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="w-1 h-6 rounded-full shrink-0 transition-opacity"
                            style={{
                              backgroundColor: item.accentHex,
                              opacity: isChecked ? 1 : 0.38,
                            }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="text-xs font-medium whitespace-nowrap">
                              {localizedLabel}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate mt-0.5">
                              {localizedSub}
                            </div>
                          </div>
                        </div>

                        <span
                          className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 transition-colors ${
                            isChecked
                              ? 'bg-sky-400 border-sky-400 text-slate-950'
                              : 'border-white/20 bg-white/[0.03]'
                          }`}
                          aria-hidden="true"
                        >
                          {isChecked && <Check className="w-3 h-3 stroke-[2.6]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-1.5 pt-1.5 border-t border-white/[0.07] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={onSelectTerrestrialLayers}
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/[0.06] text-center transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {ui.selectAllTerrestrial}
                  </button>
                  <button
                    type="button"
                    disabled={activeCount === 0}
                    onClick={() => {
                      onClearLayers();
                      setMenuOpen(false);
                    }}
                    className="flex-1 px-2.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-100 disabled:opacity-35 hover:bg-white/[0.06] text-center transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {ui.clearLayersBtn}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 3D Globe / 2D World Map Switcher & Precision Camera Controls */}
        <div className="flex items-center h-10 gap-1.5 p-1 rounded-xl bg-[#090C12]/96 border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_12px_32px_rgba(0,0,0,0.68)] shrink-0">
          <div
            role="group"
            aria-label={ui.projectionGroupAria}
            className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.05]"
          >
            <button
              type="button"
              onClick={() => onSetProjection('3d')}
              aria-pressed={projectionMode === '3d'}
              aria-label={ui.globe3dAria}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                projectionMode === '3d'
                  ? 'bg-white/[0.12] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-sky-400" />
              <span>{ui.globe3d}</span>
            </button>
            <button
              type="button"
              onClick={() => onSetProjection('2d')}
              aria-pressed={projectionMode === '2d'}
              aria-label={ui.map2dAria}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                projectionMode === '2d'
                  ? 'bg-white/[0.12] text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5 text-sky-400" />
              <span>{ui.map2d}</span>
            </button>
          </div>

          <div className="h-4 w-px bg-white/[0.08]" aria-hidden="true" />

          <div className="flex items-center gap-0.5 pr-0.5">
            <button
              type="button"
              onClick={() => onCameraAction('zoom_in')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer"
              aria-label={ui.zoomInAria}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onCameraAction('zoom_out')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer"
              aria-label={ui.zoomOutAria}
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onCameraAction('reset_north')}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer"
              aria-label={ui.resetNorthAria}
            >
              <Compass className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
