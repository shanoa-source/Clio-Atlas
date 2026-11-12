import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CircleDot,
  PanelRightClose,
  PanelRightOpen,
  Send,
  SquareDashedMousePointer,
  Trash2,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AppLanguage,
  ChatMessage,
  MapRegionSelection,
  OverlayLayerId,
  RegionDrawToolMode,
  RegionOverviewData,
  TimeRangeSelection,
} from '../types/history';
import {
  formatCompactCountByLang,
  getOverlayLayerName,
  getShortPolityLayerName,
  UI_TEXT,
} from '../i18n/translations';

interface RegionOverviewChatSidebarProps {
  language: AppLanguage;
  isOpen: boolean;
  onToggleOpen: () => void;
  overview: RegionOverviewData;
  selectedRegion: MapRegionSelection | null;
  drawToolMode: RegionDrawToolMode;
  currentYear: number;
  selectedRange: TimeRangeSelection;
  activeLayers: OverlayLayerId[];
  onSetDrawToolMode: (mode: RegionDrawToolMode) => void;
  onClearRegion: () => void;
}

function renderFormattedChatText(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function buildLayerAwareQuickPrompts(
  hasSelection: boolean,
  activeLayers: OverlayLayerId[],
  lang: AppLanguage,
): string[] {
  const hasPop = activeLayers.includes('population_density');
  const hasNight = activeLayers.includes('night_lights');

  if (lang === 'en') {
    if (hasPop && hasNight) {
      return [
        hasSelection
          ? 'Analyze how population density correlates with nighttime radiance in this region'
          : 'Compare urban olive-oil lamp density vs. Laurion smelting furnace radiance',
        hasSelection
          ? 'How do urban lamps differ from harbor beacons and mining fires here?'
          : 'Why do lower-density mining zones still emit intense nighttime light?',
      ];
    }
    if (activeLayers.length >= 2) {
      const names = activeLayers.map((id) => getOverlayLayerName(id, 'en')).join(' & ');
      return [
        hasSelection
          ? `Analyze the spatial coupling of ${names} in this region`
          : `Analyze the historical relationship between ${names}`,
        `Summarize key quantitative patterns across ${names}`,
      ];
    }
    if (activeLayers.length === 1) {
      const singleName = getOverlayLayerName(activeLayers[0], 'en');
      return [
        hasSelection
          ? `Explain the ${singleName} pattern and drivers in this selected region`
          : `Explain the spatial distribution of ${singleName} at this period`,
        `Interpret the primary historical sources behind ${singleName}`,
      ];
    }
    return hasSelection
      ? [
          'Summarize the key historical events in this selected region and timeframe',
          'Analyze this region’s political and naval role in the Athenian alliance',
        ]
      : [
          'Summarize the current Athenian polity phase and territorial reach',
          'What major historical turning points define this year?',
        ];
  }

  if (lang === 'de') {
    if (hasPop && hasNight) {
      return [
        hasSelection
          ? 'Korrelation von Bevölkerungsdichte und Nachtbeleuchtung im Auswahlgebiet analysieren'
          : 'Städtische Öllampendichte mit den 24h-Silberschmelzöfen von Laurion vergleichen',
        hasSelection
          ? 'Wie unterscheiden sich Stadtlichter, Hafenfeuer und Hüttenöfen hier?'
          : 'Warum zeigen dünner besiedelte Bergbaureviere dennoch starke Nachtstrahlung?',
      ];
    }
    if (activeLayers.length >= 2) {
      const names = activeLayers.map((id) => getOverlayLayerName(id, 'de')).join(' & ');
      return [
        hasSelection
          ? `Räumliche Kopplung von ${names} im Auswahlgebiet analysieren`
          : `Historische Wechselwirkung zwischen ${names} im aktuellen Zeitraum erklären`,
        `Wichtigste Befunde der aktiven Ebenen (${names}) zusammenfassen`,
      ];
    }
    if (activeLayers.length === 1) {
      const singleName = getOverlayLayerName(activeLayers[0], 'de');
      return [
        hasSelection
          ? `Verteilung und Ursachen von ${singleName} in diesem Gebiet erläutern`
          : `Räumliches Muster von ${singleName} in dieser Epoche analysieren`,
        `Quellenbefunde zur Ebene ${singleName} interpretieren`,
      ];
    }
    return hasSelection
      ? [
          'Wichtigste historische Ereignisse dieses Gebiets zusammenfassen',
          'Politische und maritime Rolle dieses Gebiets im Seebund erläutern',
        ]
      : [
          'Aktuelle Phase der athenischen Herrschaft und Reichweite zusammenfassen',
          'Welche historischen Schlüsselereignisse prägen dieses Jahr?',
        ];
  }

  // Default Chinese ('zh')
  const scopePrefix = hasSelection ? '分析该选区在当前时间范围内' : '结合当前时间范围分析';
  if (hasPop && hasNight) {
    return [
      `${scopePrefix}人口密度与夜晚光照强度的分布关联`,
      hasSelection
        ? '该选区内高密城区油灯与工矿/港口夜火有何差异？'
        : '为什么部分低人口密度矿区仍呈现高强度夜间火光？',
    ];
  }

  if (activeLayers.length >= 2) {
    const names = activeLayers.map((id) => getOverlayLayerName(id, 'zh')).join('与');
    return [
      `${scopePrefix}${names}的空间耦合关系`,
      `解读当前叠加图层（${names}）反映的核心历史特征`,
    ];
  }

  if (activeLayers.length === 1) {
    const singleName = getOverlayLayerName(activeLayers[0], 'zh');
    return [
      `${scopePrefix}${singleName}的分布格局与成因`,
      `结合史料解读当前${singleName}图层的核心节点数据`,
    ];
  }

  return hasSelection
    ? ['概括该选区在当前时间段的核心历史事件', '分析该选区与雅典海上同盟的政治与军事关系']
    : ['概括当前年份雅典政权阶段与疆域态势', '当前时间点有哪些关键历史事件？'];
}

export const RegionOverviewChatSidebar: React.FC<RegionOverviewChatSidebarProps> = ({
  language,
  isOpen,
  onToggleOpen,
  overview,
  selectedRegion,
  drawToolMode,
  currentYear,
  selectedRange,
  activeLayers,
  onSetDrawToolMode,
  onClearRegion,
}) => {
  const ui = UI_TEXT[language];
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSending]);

  const overlaidFocusLabel = useMemo(() => {
    if (activeLayers.length === 0) return getShortPolityLayerName(language);
    return activeLayers.map((id) => getOverlayLayerName(id, language)).join(' + ');
  }, [activeLayers, language]);

  const quickPrompts = useMemo(
    () => buildLayerAwareQuickPrompts(overview.hasSelection, activeLayers, language),
    [overview.hasSelection, activeLayers, language],
  );

  const sendQuestion = async (rawQuestion: string) => {
    const trimmed = rawQuestion.trim();
    if (!trimmed || isSending) return;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
    };

    const priorHistory = messages
      .filter((m) => !m.isError)
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          language,
          history: priorHistory,
          mapState: {
            currentYear,
            selectedRange,
            activeLayers,
            selectedRegion,
            language,
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      const layerSummary = String(data.activeLayerSummaryZh || overlaidFocusLabel);
      const regionSummary =
        data.contextMode === 'region'
          ? `${String(data.regionTitleZh || overview.regionTitleZh)} · ${layerSummary}`
          : `${ui.globalTimelineBadge} · ${layerSummary}`;

      const modelMsg: ChatMessage = {
        id: `m_${Date.now()}`,
        role: 'model',
        text: String(data.reply || ''),
        contextMode: data.contextMode === 'region' ? 'region' : 'global',
        regionLabel: regionSummary,
      };
      setMessages((prev) => [...prev, modelMsg]);
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: `e_${Date.now()}`,
        role: 'model',
        text: err?.message || ui.networkError,
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(inputText);
  };

  return (
    <>
      {/* Collapsed Expand Trigger */}
      <AnimatePresence>
        {!isOpen && (
          <motion.div
            key="sidebar-collapsed-trigger"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="pointer-events-auto fixed top-16 right-4 z-25 flex items-center gap-1.5"
          >
            <button
              type="button"
              onClick={onToggleOpen}
              className="flex items-center gap-2 h-9 px-3.5 rounded-xl bg-[#090C12]/96 border border-white/[0.1] text-xs font-medium text-slate-200 hover:text-white hover:border-white/[0.18] transition-colors shadow-[0_12px_30px_rgba(0,0,0,0.75)] cursor-pointer whitespace-nowrap shrink-0"
              aria-label={ui.expandSidebarAria}
            >
              <PanelRightOpen className="w-4 h-4 text-sky-400" />
              <span>{ui.expandSidebarBtn}</span>
              {overview.hasSelection && (
                <>
                  <span className="text-slate-600" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-sky-300 max-w-[96px] truncate">
                    {overview.regionTitleZh}
                  </span>
                </>
              )}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Right Fixed / Collapsible Sidebar (Upper: Selected Region Overview | Lower: AI Chat Stream + Bottom Input) */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.aside
            key="region-overview-chat-sidebar"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            aria-label={ui.sidebarAria}
            className="pointer-events-auto fixed top-16 bottom-3.5 right-4 z-25 w-[356px] max-w-[calc(100vw-2rem)] flex flex-col rounded-2xl bg-[#090C12]/96 border border-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_52px_rgba(0,0,0,0.86)] overflow-hidden"
          >
            {/* Top Toolbar: Explicit Box / Circle Region Selection Controls + Collapse */}
            <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-white/[0.08] shrink-0">
              <h2 className="text-xs font-semibold text-slate-100 tracking-wide whitespace-nowrap">
                {ui.sidebarHeading}
              </h2>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onSetDrawToolMode(drawToolMode === 'box' ? 'none' : 'box')}
                  aria-pressed={drawToolMode === 'box'}
                  aria-label={ui.boxSelectAria}
                  className={`flex items-center gap-1 h-7 px-2 rounded-lg border text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    drawToolMode === 'box'
                      ? 'bg-sky-400/20 border-sky-400/55 text-sky-200 font-medium'
                      : 'bg-[#05070B] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <SquareDashedMousePointer className="w-3.5 h-3.5" />
                  <span>{ui.boxSelectBtn}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onSetDrawToolMode(drawToolMode === 'circle' ? 'none' : 'circle')}
                  aria-pressed={drawToolMode === 'circle'}
                  aria-label={ui.circleSelectAria}
                  className={`flex items-center gap-1 h-7 px-2 rounded-lg border text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    drawToolMode === 'circle'
                      ? 'bg-sky-400/20 border-sky-400/55 text-sky-200 font-medium'
                      : 'bg-[#05070B] border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <CircleDot className="w-3.5 h-3.5" />
                  <span>{ui.circleSelectBtn}</span>
                </button>

                {selectedRegion && (
                  <button
                    type="button"
                    onClick={onClearRegion}
                    aria-label={ui.clearRegionAria}
                    className="flex items-center gap-0.5 h-7 px-2 rounded-lg bg-[#05070B] border border-white/[0.08] text-xs text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <X className="w-3 h-3" />
                    <span>{ui.clearRegionBtn}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onToggleOpen}
                  aria-label={ui.collapseSidebarAria}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer shrink-0"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* UPPER HALF: Selected Region Overview + Layer-Synchronized Events Table */}
            <section
              aria-label={ui.overviewSectionAria}
              className="flex-[1.08] min-h-0 flex flex-col border-b border-white/[0.08]"
            >
              {/* Region Header & Quantitative Metrics */}
              <div className="px-3.5 py-2.5 border-b border-white/[0.06] shrink-0">
                <div
                  className="text-sm font-semibold text-white truncate"
                  data-testid="selected-region-title"
                >
                  {overview.regionTitleZh}
                </div>

                <div className="text-[11px] text-slate-400 font-mono tabular-nums truncate mt-0.5">
                  {overview.coordsSummary}
                </div>

                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1 min-w-0">
                  <span className="font-mono tabular-nums text-sky-300 shrink-0">
                    {overview.timeLabelZh}
                  </span>
                  <span className="text-slate-600 shrink-0" aria-hidden="true">
                    ·
                  </span>
                  <span className="truncate" data-testid="sidebar-active-layers">
                    {ui.layersPrefix}
                    {overview.activeLayerLabelsZh.join(' / ')}
                  </span>
                </div>

                {/* Compact Tabular Layer Metrics */}
                <div className="grid grid-cols-4 gap-1.5 mt-2.5 pt-2 border-t border-white/[0.06]">
                  <div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {ui.metricTerritories}
                    </div>
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-200 mt-0.5">
                      {overview.metrics.matchedTerritoryNames.length}
                      {ui.metricTerritoriesUnit && (
                        <span className="text-[10px] font-normal text-slate-500 ml-0.5">
                          {ui.metricTerritoriesUnit}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 truncate">{ui.metricPeakPop}</div>
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-200 mt-0.5">
                      {overview.metrics.peakDensityPerKm2 ?? '—'}
                      {overview.metrics.peakDensityPerKm2 !== null && (
                        <span className="text-[10px] font-normal text-slate-500 ml-0.5">/km²</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {activeLayers.includes('night_lights') &&
                      !activeLayers.includes('transport_routes')
                        ? ui.metricPeakLight
                        : ui.metricVoyages}
                    </div>
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-200 mt-0.5">
                      {activeLayers.includes('night_lights') &&
                      !activeLayers.includes('transport_routes') ? (
                        overview.metrics.peakNightLightPct !== null ? (
                          <>
                            {overview.metrics.peakNightLightPct}
                            <span className="text-[10px] font-normal text-slate-500 ml-0.5">%</span>
                          </>
                        ) : (
                          '—'
                        )
                      ) : overview.metrics.totalAnnualVoyages > 0 ? (
                        <>
                          {overview.metrics.totalAnnualVoyages}
                          <span className="text-[10px] font-normal text-slate-500 ml-0.5">
                            {ui.metricVoyagesUnit}
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-500 truncate">{ui.metricCasualties}</div>
                    <div className="text-xs font-semibold font-mono tabular-nums text-slate-200 mt-0.5">
                      {formatCompactCountByLang(overview.metrics.totalEstimatedDeaths, language)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Scrollable Historical Events & Layer Records Table */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between px-3.5 py-1.5 bg-white/[0.02] border-b border-white/[0.05] shrink-0">
                  <span className="text-[11px] font-medium text-slate-300">
                    {ui.eventsTableHeading}
                  </span>
                  <span
                    className="text-[11px] font-mono tabular-nums text-slate-400"
                    data-testid="overview-event-count"
                  >
                    {ui.eventsCountLabel(overview.events.length)}
                  </span>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-3.5 divide-y divide-white/[0.06]">
                  {overview.events.length === 0 ? (
                    <div className="py-6 text-center text-xs text-slate-500 leading-relaxed">
                      {ui.emptyEventsHint}
                    </div>
                  ) : (
                    overview.events.map((ev) => (
                      <div key={ev.id} className="py-2">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0 truncate">
                            <span className="font-mono tabular-nums text-sky-300 truncate">
                              {ev.yearLabel}
                            </span>
                            <span className="text-slate-600 shrink-0" aria-hidden="true">
                              ·
                            </span>
                            <span className="text-slate-400 truncate">{ev.categoryLabelZh}</span>
                          </div>
                          {ev.metricLabel && (
                            <span className="font-mono tabular-nums text-slate-300 shrink-0 whitespace-nowrap">
                              {ev.metricLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-slate-100 mt-0.5 truncate">
                          {ev.titleZh}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug line-clamp-2 mt-0.5">
                          {ev.summaryZh}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            {/* LOWER HALF: AI Chat Message Stream + Fixed Bottom Input Bar */}
            <section aria-label={ui.chatSectionAria} className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between px-3.5 py-2 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-1.5 text-[11px] min-w-0">
                  <span className="font-semibold text-slate-200 shrink-0">{ui.chatHeading}</span>
                  <span className="text-slate-600 shrink-0" aria-hidden="true">
                    ·
                  </span>
                  <span
                    className="text-slate-400 truncate"
                    data-testid="chat-context-indicator"
                  >
                    {overview.hasSelection ? ui.scopeRegionShort : ui.scopeGlobalShort} ·{' '}
                    {overlaidFocusLabel}
                  </span>
                </div>

                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setMessages([])}
                    aria-label={ui.clearChatAria}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{ui.clearChatBtn}</span>
                  </button>
                )}
              </div>

              <div
                role="log"
                aria-label={ui.chatLogAria}
                aria-live="polite"
                className="flex-1 min-h-0 overflow-y-auto px-3.5 py-2.5 space-y-2.5"
              >
                {messages.length === 0 ? (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {overview.hasSelection
                        ? ui.chatEmptyRegionHint(
                            overview.regionTitleZh,
                            overview.timeLabelZh,
                            overlaidFocusLabel,
                          )
                        : ui.chatEmptyGlobalHint(overview.timeLabelZh, overlaidFocusLabel)}
                    </p>
                    <div className="flex flex-col gap-1.5 pt-1">
                      {quickPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => void sendQuestion(prompt)}
                          className="text-left px-2.5 py-1.5 rounded-lg bg-[#05070B] hover:bg-white/[0.05] border border-white/[0.08] text-xs text-slate-300 hover:text-white transition-colors cursor-pointer truncate"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        data-testid={msg.role === 'model' ? 'chat-model-reply' : 'chat-user-msg'}
                        className={`max-w-[92%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                          msg.role === 'user'
                            ? 'bg-sky-400/18 border border-sky-400/35 text-slate-100'
                            : msg.isError
                              ? 'bg-rose-950/45 border border-rose-500/35 text-rose-200'
                              : 'bg-white/[0.03] border border-white/[0.08] text-slate-200'
                        }`}
                      >
                        {renderFormattedChatText(msg.text)}
                      </div>
                      {msg.role === 'model' && !msg.isError && msg.regionLabel && (
                        <span className="text-[10px] text-slate-500 mt-1 px-0.5 truncate max-w-full">
                          {ui.contextBadgePrefix}
                          {msg.regionLabel}
                        </span>
                      )}
                    </div>
                  ))
                )}

                {isSending && (
                  <div className="text-xs text-slate-400 py-1">{ui.sendingHint}</div>
                )}
                <div ref={messageEndRef} />
              </div>

              {/* Fixed Bottom Input Bar */}
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 p-2.5 border-t border-white/[0.08] bg-[#06080D] shrink-0"
              >
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    overview.hasSelection
                      ? ui.inputPlaceholderRegion(overlaidFocusLabel)
                      : ui.inputPlaceholderGlobal(overlaidFocusLabel)
                  }
                  aria-label={ui.chatInputAria}
                  data-testid="chat-question-input"
                  className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-[#0B0F17] border border-white/[0.1] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
                <button
                  type="submit"
                  disabled={isSending || !inputText.trim()}
                  aria-label={ui.sendAria}
                  data-testid="chat-submit-btn"
                  className="flex items-center gap-1 h-8 px-3 rounded-lg bg-sky-400 hover:bg-sky-300 disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-slate-950 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{ui.sendBtn}</span>
                </button>
              </form>
            </section>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
};
