import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronUp,
  Pause,
  Play,
  Repeat,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { AppLanguage, TimeRangeSelection } from '../types/history';
import { formatYearByLang, UI_TEXT } from '../i18n/translations';
import {
  clamp,
  computeTimelineTickStep,
  GLOBAL_MAX_YEAR,
  GLOBAL_MIN_YEAR,
  stepHistoricalYearWithLoop,
} from '../utils/geoMath';

interface GlobalTimelineDockProps {
  language: AppLanguage;
  currentYear: number;
  selectedRange: TimeRangeSelection;
  isPlaying: boolean;
  playbackSpeed: 1 | 5;
  sidebarOpen?: boolean;
  onChangeYear: (year: number) => void;
  onChangeSelectedRange: (range: TimeRangeSelection) => void;
  onTogglePlay: () => void;
  onToggleSpeed: () => void;
}

const MIN_SPAN_YEARS = 16; // Highest zoom: 16 years across bar -> exact 1-year tick resolution
const MAX_SPAN_YEARS = 4500;

function normalizeNonZeroYear(y: number, preferPositive = false): number {
  const rounded = clamp(Math.round(y), GLOBAL_MIN_YEAR, GLOBAL_MAX_YEAR);
  if (rounded === 0) return preferPositive ? 1 : -1;
  return rounded;
}

export const GlobalTimelineDock: React.FC<GlobalTimelineDockProps> = ({
  language,
  currentYear,
  selectedRange,
  isPlaying,
  playbackSpeed,
  sidebarOpen = false,
  onChangeYear,
  onChangeSelectedRange,
  onTogglePlay,
  onToggleSpeed,
}) => {
  const ui = UI_TEXT[language];
  const [collapsed, setCollapsed] = useState(false);
  const [visibleSpan, setVisibleSpan] = useState(100);
  const [windowCenter, setWindowCenter] = useState(currentYear);
  const [yearInputText, setYearInputText] = useState(String(currentYear));
  const [editingInput, setEditingInput] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [rangeStartText, setRangeStartText] = useState('');
  const [rangeEndText, setRangeEndText] = useState('');
  const [editingRangeField, setEditingRangeField] = useState<'start' | 'end' | null>(null);

  const trackRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    mode: 'none' | 'ruler' | 'left_handle' | 'right_handle';
    startX: number;
    initialYear: number;
    initialCenter: number;
    moved: boolean;
  }>({
    mode: 'none',
    startX: 0,
    initialYear: currentYear,
    initialCenter: currentYear,
    moved: false,
  });

  const normalizedRange: [number, number] | null = useMemo(() => {
    if (!selectedRange) return null;
    const s = Math.min(selectedRange[0], selectedRange[1]);
    const e = Math.max(selectedRange[0], selectedRange[1]);
    return [s, e === s ? normalizeNonZeroYear(s + 1, true) : e];
  }, [selectedRange]);

  // Keep year input synced when not actively typing
  useEffect(() => {
    if (!editingInput) {
      setYearInputText(String(Math.round(currentYear)));
    }
  }, [currentYear, editingInput]);

  // Keep range text inputs synced when not actively typing
  useEffect(() => {
    if (!normalizedRange) {
      setRangeStartText('');
      setRangeEndText('');
      return;
    }
    if (editingRangeField !== 'start') {
      setRangeStartText(String(normalizedRange[0]));
    }
    if (editingRangeField !== 'end') {
      setRangeEndText(String(normalizedRange[1]));
    }
  }, [normalizedRange, editingRangeField]);

  // In range mode, keep window steady unless range leaves view; in standard mode, derive center synchronously from currentYear
  useEffect(() => {
    if (!normalizedRange) {
      return;
    }
    const [rStart, rEnd] = normalizedRange;
    const half = visibleSpan * 0.5;
    const viewLeft = windowCenter - half;
    const viewRight = windowCenter + half;
    if (rStart < viewLeft + visibleSpan * 0.04 || rEnd > viewRight - visibleSpan * 0.04) {
      const neededSpan = clamp(
        Math.ceil((rEnd - rStart) * 1.45),
        MIN_SPAN_YEARS,
        MAX_SPAN_YEARS,
      );
      if (neededSpan > visibleSpan) {
        setVisibleSpan(neededSpan);
      }
      setWindowCenter((rStart + rEnd) * 0.5);
    }
  }, [normalizedRange, visibleSpan, windowCenter]);

  const effectiveWindowCenter = normalizedRange ? windowCenter : currentYear;
  const halfSpan = visibleSpan * 0.5;
  const startYear = effectiveWindowCenter - halfSpan;
  const endYear = effectiveWindowCenter + halfSpan;

  const { majorStep, minorStep } = useMemo(
    () => computeTimelineTickStep(visibleSpan),
    [visibleSpan],
  );

  const ticks = useMemo(() => {
    const firstTick = Math.ceil(startYear / minorStep) * minorStep;
    const list: Array<{ year: number; pct: number; isMajor: boolean; isMedium: boolean }> = [];
    const medStep = majorStep >= 10 ? majorStep / 2 : majorStep;
    for (let y = firstTick; y <= endYear; y += minorStep) {
      if (y < GLOBAL_MIN_YEAR || y > GLOBAL_MAX_YEAR || y === 0) continue;
      const pct = ((y - startYear) / visibleSpan) * 100;
      const isMajor = Math.abs(y % majorStep) < 1e-6;
      const isMedium = !isMajor && Math.abs(y % medStep) < 1e-6;
      list.push({ year: y, pct, isMajor, isMedium });
    }
    return list;
  }, [startYear, endYear, visibleSpan, majorStep, minorStep]);

  const stepYear = (delta: number) => {
    if (normalizedRange) {
      const { nextYear } = stepHistoricalYearWithLoop(currentYear, delta, normalizedRange);
      onChangeYear(nextYear);
      return;
    }
    let target = currentYear + delta;
    if (target === 0) target = delta > 0 ? 1 : -1;
    onChangeYear(clamp(target, GLOBAL_MIN_YEAR, GLOBAL_MAX_YEAR));
  };

  const toggleRangeSelection = () => {
    if (normalizedRange) {
      onChangeSelectedRange(null);
      return;
    }
    const halfBand = Math.max(5, Math.round(visibleSpan * 0.24));
    const rStart = normalizeNonZeroYear(currentYear - halfBand, false);
    let rEnd = normalizeNonZeroYear(currentYear + halfBand, true);
    if (rEnd <= rStart) {
      rEnd = normalizeNonZeroYear(rStart + 2, true);
    }
    setWindowCenter((rStart + rEnd) * 0.5);
    onChangeSelectedRange([rStart, rEnd]);
  };

  const updateRangeBounds = (nextStart: number, nextEnd: number) => {
    const s = normalizeNonZeroYear(nextStart, false);
    let e = normalizeNonZeroYear(nextEnd, true);
    if (e <= s) {
      e = normalizeNonZeroYear(s + 1, true);
    }
    onChangeSelectedRange([s, e]);
    if (currentYear < s) onChangeYear(s);
    else if (currentYear > e) onChangeYear(e);
  };

  const zoomTimeline = (factor: number) => {
    setVisibleSpan((prev) => clamp(Math.round(prev * factor), MIN_SPAN_YEARS, MAX_SPAN_YEARS));
  };

  const handleTrackWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    zoomTimeline(e.deltaY < 0 ? 0.76 : 1.3);
  };

  const clientXToYear = (clientX: number): number => {
    if (!trackRef.current) return currentYear;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const raw = Math.round(startYear + ratio * visibleSpan);
    return normalizeNonZeroYear(raw, ratio >= 0.5);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = {
      mode: 'ruler',
      startX: e.clientX,
      initialYear: currentYear,
      initialCenter: effectiveWindowCenter,
      moved: false,
    };
  };

  const handleHandlePointerDown = (
    which: 'left_handle' | 'right_handle',
    e: React.PointerEvent<HTMLButtonElement>,
  ) => {
    e.stopPropagation();
    if (trackRef.current) {
      trackRef.current.setPointerCapture(e.pointerId);
    }
    setIsDragging(true);
    dragRef.current = {
      mode: which,
      startX: e.clientX,
      initialYear: currentYear,
      initialCenter: effectiveWindowCenter,
      moved: true,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.mode === 'none' || !trackRef.current) return;

    if (drag.mode === 'left_handle' && normalizedRange) {
      const candidate = clamp(clientXToYear(e.clientX), GLOBAL_MIN_YEAR, normalizedRange[1] - 1);
      const safeStart = candidate === 0 ? -1 : candidate;
      if (safeStart !== normalizedRange[0]) {
        updateRangeBounds(safeStart, normalizedRange[1]);
      }
      return;
    }

    if (drag.mode === 'right_handle' && normalizedRange) {
      const candidate = clamp(clientXToYear(e.clientX), normalizedRange[0] + 1, GLOBAL_MAX_YEAR);
      const safeEnd = candidate === 0 ? 1 : candidate;
      if (safeEnd !== normalizedRange[1]) {
        updateRangeBounds(normalizedRange[0], safeEnd);
      }
      return;
    }

    const dx = e.clientX - drag.startX;
    if (Math.abs(dx) > 3) drag.moved = true;

    const width = trackRef.current.clientWidth || 880;
    const yearsPerPx = visibleSpan / width;

    if (normalizedRange) {
      const target = clamp(
        clientXToYear(e.clientX),
        normalizedRange[0],
        normalizedRange[1],
      );
      const safeYear = target === 0 ? -1 : target;
      if (safeYear !== currentYear) {
        onChangeYear(safeYear);
      }
      return;
    }

    let nextYear = clamp(
      Math.round(drag.initialYear - dx * yearsPerPx),
      GLOBAL_MIN_YEAR,
      GLOBAL_MAX_YEAR,
    );
    if (nextYear === 0) nextYear = dx > 0 ? -1 : 1;
    if (nextYear !== currentYear) {
      onChangeYear(nextYear);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag.mode === 'none') return;
    const wasRulerClick = drag.mode === 'ruler' && !drag.moved;
    dragRef.current.mode = 'none';
    setIsDragging(false);

    if (wasRulerClick && trackRef.current) {
      let clickedYear = clientXToYear(e.clientX);
      if (normalizedRange) {
        clickedYear = clamp(clickedYear, normalizedRange[0], normalizedRange[1]);
        if (clickedYear === 0) clickedYear = -1;
      }
      onChangeYear(clickedYear);
    }
  };

  const commitYearInput = () => {
    setEditingInput(false);
    const parsed = parseInt(yearInputText.trim(), 10);
    if (!Number.isNaN(parsed)) {
      let target = normalizeNonZeroYear(parsed, parsed > 0);
      if (normalizedRange) {
        target = clamp(target, normalizedRange[0], normalizedRange[1]);
        if (target === 0) target = -1;
      }
      onChangeYear(target);
      setYearInputText(String(target));
    } else {
      setYearInputText(String(currentYear));
    }
  };

  const commitRangeField = (field: 'start' | 'end') => {
    setEditingRangeField(null);
    if (!normalizedRange) return;
    const rawText = field === 'start' ? rangeStartText : rangeEndText;
    const parsed = parseInt(rawText.trim(), 10);
    if (Number.isNaN(parsed)) {
      setRangeStartText(String(normalizedRange[0]));
      setRangeEndText(String(normalizedRange[1]));
      return;
    }
    if (field === 'start') {
      const nextStart = clamp(
        normalizeNonZeroYear(parsed, false),
        GLOBAL_MIN_YEAR,
        normalizedRange[1] - 1,
      );
      const safeStart = nextStart === 0 ? -1 : nextStart;
      setWindowCenter((safeStart + normalizedRange[1]) * 0.5);
      updateRangeBounds(safeStart, normalizedRange[1]);
    } else {
      const nextEnd = clamp(
        normalizeNonZeroYear(parsed, true),
        normalizedRange[0] + 1,
        GLOBAL_MAX_YEAR,
      );
      const safeEnd = nextEnd === 0 ? 1 : nextEnd;
      setWindowCenter((normalizedRange[0] + safeEnd) * 0.5);
      updateRangeBounds(normalizedRange[0], safeEnd);
    }
  };

  const playheadPct = normalizedRange
    ? clamp(((currentYear - startYear) / visibleSpan) * 100, 0, 100)
    : 50;

  const leftHandlePct = normalizedRange
    ? clamp(((normalizedRange[0] - startYear) / visibleSpan) * 100, 0, 100)
    : 0;
  const rightHandlePct = normalizedRange
    ? clamp(((normalizedRange[1] - startYear) / visibleSpan) * 100, 0, 100)
    : 100;

  return (
    <section
      aria-label={ui.timelineSectionAria}
      className={`pointer-events-none fixed bottom-3 ${
        sidebarOpen ? 'left-3 right-3 sm:left-4 sm:right-4 lg:right-[384px]' : 'inset-x-3 sm:inset-x-4'
      } z-20 flex flex-col items-center`}
    >
      <div className="pointer-events-auto w-full max-w-[1040px]">
        {/* Precision Micro-Latch Collapse / Expand Tab */}
        <div className="flex justify-center mb-1.5">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-1.5 h-6 px-3 rounded-md atlas-chassis text-[11px] font-medium text-slate-300 hover:text-white hover:border-sky-400/40 transition-colors cursor-pointer whitespace-nowrap"
            aria-expanded={!collapsed}
            aria-label={collapsed ? ui.expandTimelineAria : ui.collapseTimelineAria}
          >
            {collapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-sky-400" />
                <span className="font-mono tabular-nums text-white">
                  {formatYearByLang(currentYear, language)}
                </span>
                {normalizedRange && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span className="font-mono tabular-nums text-sky-300">
                      {formatYearByLang(normalizedRange[0], language, true)} –{' '}
                      {formatYearByLang(normalizedRange[1], language, true)}
                    </span>
                  </>
                )}
                <span className="text-slate-600">·</span>
                <span>{ui.expandTimelineBtn}</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                <span>{ui.collapseTimelineBtn}</span>
              </>
            )}
          </button>
        </div>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="timeline-body"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-xl atlas-chassis atlas-reticle px-3.5 sm:px-4 py-2.5"
            >
              {/* Top Control Deck */}
              <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-x-2.5 gap-y-1.5 mb-2 lg:overflow-x-auto atlas-scroll pb-0.5">
                {/* Left: Calibrated Tabular Year Readout + Unboxed Resolution Metadata */}
                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className="text-[17px] leading-none font-semibold text-white font-mono tabular-nums tracking-tight whitespace-nowrap"
                    data-testid="current-year-display"
                  >
                    {formatYearByLang(currentYear, language)}
                  </span>
                  <span className="h-3.5 w-px bg-white/[0.1]" aria-hidden="true" />
                  <span className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
                    {ui.resolutionLabel(minorStep)}
                  </span>
                </div>

                {/* Center: Integrated Recessed Transport & Speed Channel */}
                <div className="flex items-center gap-0.5 p-0.5 rounded-lg atlas-well shrink-0">
                  <button
                    type="button"
                    onClick={() => stepYear(-10)}
                    className="flex items-center gap-0.5 h-7 px-2 rounded-md text-xs font-mono tabular-nums text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    aria-label={ui.stepBack10Aria}
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                    <span>10</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => stepYear(-1)}
                    className="flex items-center gap-0.5 h-7 px-2 rounded-md text-xs font-mono tabular-nums text-slate-200 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    aria-label={ui.stepBack1Aria}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>{ui.oneYearShort}</span>
                  </button>

                  <button
                    type="button"
                    onClick={onTogglePlay}
                    className="flex items-center gap-1.5 h-7 px-3.5 mx-0.5 rounded-md bg-sky-400 hover:bg-sky-300 text-xs font-semibold text-slate-950 transition-colors shadow-[0_0_14px_rgba(56,189,248,0.28)] cursor-pointer whitespace-nowrap shrink-0"
                    aria-label={isPlaying ? ui.pauseAria : ui.playAria}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>{ui.pauseBtn}</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>{normalizedRange ? ui.loopPlayBtn : ui.playBtn}</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => stepYear(1)}
                    className="flex items-center gap-0.5 h-7 px-2 rounded-md text-xs font-mono tabular-nums text-slate-200 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    aria-label={ui.stepForward1Aria}
                  >
                    <span>{ui.oneYearShort}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => stepYear(10)}
                    className="flex items-center gap-0.5 h-7 px-2 rounded-md text-xs font-mono tabular-nums text-slate-300 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    aria-label={ui.stepForward10Aria}
                  >
                    <span>10</span>
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>

                  <div className="h-4 w-px bg-white/[0.09] mx-0.5" aria-hidden="true" />

                  <button
                    type="button"
                    onClick={onToggleSpeed}
                    className={`h-7 px-2 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      playbackSpeed === 5
                        ? 'bg-sky-400/[0.18] text-sky-300 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-white/[0.07]'
                    }`}
                    aria-label={ui.speedAria(playbackSpeed)}
                  >
                    {playbackSpeed}×
                  </button>
                </div>

                {/* Right: Caliper Interval Selection + Direct Year Jump + Vernier Scale Zoom */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Time-Range Selection Toggle & Bounds Inputs */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={toggleRangeSelection}
                      aria-pressed={normalizedRange !== null}
                      aria-label={ui.rangeToggleAria}
                      className={`flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                        normalizedRange
                          ? 'bg-sky-400/[0.16] border-sky-400/50 text-sky-200'
                          : 'atlas-well text-slate-300 hover:text-white hover:bg-white/[0.05]'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5 text-sky-400" />
                      <span>{ui.rangeToggleBtn}</span>
                    </button>

                    {normalizedRange && (
                      <div className="flex items-center gap-1">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitRangeField('start');
                          }}
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rangeStartText}
                            onFocus={() => setEditingRangeField('start')}
                            onChange={(e) => setRangeStartText(e.target.value)}
                            onBlur={() => commitRangeField('start')}
                            aria-label={ui.rangeStartAria}
                            className="w-13 h-7 px-1.5 rounded-md bg-sky-400/[0.08] border border-sky-400/35 text-xs font-mono tabular-nums text-sky-100 text-center focus:outline-none focus:border-sky-300"
                          />
                        </form>
                        <span className="text-xs text-slate-500 font-mono" aria-hidden="true">
                          –
                        </span>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitRangeField('end');
                          }}
                        >
                          <input
                            type="text"
                            inputMode="numeric"
                            value={rangeEndText}
                            onFocus={() => setEditingRangeField('end')}
                            onChange={(e) => setRangeEndText(e.target.value)}
                            onBlur={() => commitRangeField('end')}
                            aria-label={ui.rangeEndAria}
                            className="w-13 h-7 px-1.5 rounded-md bg-sky-400/[0.08] border border-sky-400/35 text-xs font-mono tabular-nums text-sky-100 text-center focus:outline-none focus:border-sky-300"
                          />
                        </form>
                        <button
                          type="button"
                          onClick={() => onChangeSelectedRange(null)}
                          aria-label={ui.clearRangeAria}
                          className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="h-4 w-px bg-white/[0.09] mx-0.5" aria-hidden="true" />

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitYearInput();
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <label
                      htmlFor="timeline-year-jump"
                      className="text-xs text-slate-400 whitespace-nowrap"
                    >
                      {ui.jumpLabel}
                    </label>
                    <input
                      id="timeline-year-jump"
                      type="text"
                      inputMode="numeric"
                      value={yearInputText}
                      onFocus={() => setEditingInput(true)}
                      onChange={(e) => setYearInputText(e.target.value)}
                      onBlur={commitYearInput}
                      aria-label={ui.jumpInputAria}
                      className="w-15 h-7 px-1.5 rounded-md atlas-well text-xs font-mono tabular-nums text-slate-100 text-center focus:outline-none focus:border-sky-400/70"
                    />
                  </form>

                  <div className="h-4 w-px bg-white/[0.09] mx-0.5" aria-hidden="true" />

                  <button
                    type="button"
                    onClick={() =>
                      setVisibleSpan((prev) => (prev <= MIN_SPAN_YEARS ? 100 : MIN_SPAN_YEARS))
                    }
                    aria-pressed={minorStep === 1}
                    aria-label={ui.oneYearTickAria}
                    className={`h-7 px-2 rounded-md border text-xs font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      minorStep === 1
                        ? 'bg-sky-400/[0.16] border-sky-400/50 text-sky-300 font-medium'
                        : 'atlas-well text-slate-300 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    {ui.oneYearTickBtn}
                  </button>

                  <div className="flex items-center gap-0.5 p-0.5 rounded-md atlas-well">
                    <button
                      type="button"
                      onClick={() => zoomTimeline(0.65)}
                      disabled={visibleSpan <= MIN_SPAN_YEARS}
                      className="p-1 rounded-[4px] hover:bg-white/[0.08] disabled:opacity-35 text-slate-200 transition-colors cursor-pointer"
                      aria-label={ui.zoomInTimelineAria}
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => zoomTimeline(1.55)}
                      disabled={visibleSpan >= MAX_SPAN_YEARS}
                      className="p-1 rounded-[4px] hover:bg-white/[0.08] disabled:opacity-35 text-slate-200 transition-colors cursor-pointer"
                      aria-label={ui.zoomOutTimelineAria}
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Recessed Optical Vernier Temporal Ruler with Precision Caliper Range Handles */}
              <div
                ref={trackRef}
                onWheel={handleTrackWheel}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                role="slider"
                tabIndex={0}
                aria-label={ui.rulerAria}
                aria-valuemin={normalizedRange ? normalizedRange[0] : GLOBAL_MIN_YEAR}
                aria-valuemax={normalizedRange ? normalizedRange[1] : GLOBAL_MAX_YEAR}
                aria-valuenow={currentYear}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft') stepYear(-1);
                  else if (e.key === 'ArrowRight') stepYear(1);
                }}
                className="relative h-[50px] rounded-lg atlas-well overflow-hidden select-none cursor-ew-resize focus:outline-none focus:border-sky-400/70"
              >
                {/* Optical Edge Vignette Masks */}
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 w-12 z-10"
                  style={{
                    background: 'linear-gradient(90deg, #030509 0%, rgba(3,5,9,0) 100%)',
                  }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 w-12 z-10"
                  style={{
                    background: 'linear-gradient(270deg, #030509 0%, rgba(3,5,9,0) 100%)',
                  }}
                />

                {/* Top, Center Equatorial & Bottom Vernier Reference Hairlines */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/[0.04]" />
                <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-sky-400/[0.05]" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-white/[0.07]" />

                {/* Selected Time Interval Caliper Window & Outside Dimming */}
                {normalizedRange && (
                  <>
                    <div
                      style={{ width: `${leftHandlePct}%` }}
                      className="pointer-events-none absolute inset-y-0 left-0 bg-black/65 z-[5]"
                    />
                    <div
                      style={{
                        left: `${leftHandlePct}%`,
                        width: `${Math.max(0, rightHandlePct - leftHandlePct)}%`,
                        background:
                          'linear-gradient(180deg, rgba(56,189,248,0.15) 0%, rgba(56,189,248,0.03) 100%)',
                      }}
                      className="pointer-events-none absolute inset-y-0 border-y border-sky-400/50 z-[6]"
                    />
                    <div
                      style={{ left: `${rightHandlePct}%` }}
                      className="pointer-events-none absolute inset-y-0 right-0 bg-black/65 z-[5]"
                    />
                  </>
                )}

                {/* Dual-Edge Graduated Vernier Ticks */}
                {ticks.map((t) => (
                  <div
                    key={t.year}
                    style={{ left: `${t.pct}%` }}
                    className="absolute inset-y-0 -translate-x-1/2 flex flex-col items-center justify-between pointer-events-none z-[7]"
                  >
                    {/* Upper Micro-Vernier Reference Tick */}
                    <div
                      className={
                        t.isMajor
                          ? 'w-px h-1.5 bg-slate-400/50'
                          : t.isMedium
                            ? 'w-px h-1 bg-slate-600/45'
                            : 'w-px h-0.5 bg-transparent'
                      }
                    />

                    {/* Major Year Label (guarded from left/right border clipping) */}
                    {t.isMajor && t.pct >= 5 && t.pct <= 95 && (
                      <span className="text-[10px] leading-none font-mono tabular-nums text-slate-300/90 whitespace-nowrap">
                        {formatYearByLang(t.year, language, true)}
                      </span>
                    )}

                    {/* Lower Primary Chronometer Scale Tick */}
                    <div
                      className={
                        t.isMajor
                          ? 'w-px h-3.5 bg-slate-200/85'
                          : t.isMedium
                            ? 'w-px h-2.5 bg-slate-500/70'
                            : minorStep === 1
                              ? 'w-px h-2 bg-sky-400/60'
                              : 'w-px h-1.5 bg-slate-700/85'
                      }
                    />
                  </div>
                ))}

                {/* Interactive Left Caliper Bracket Handle */}
                {normalizedRange && (
                  <button
                    type="button"
                    role="slider"
                    aria-label={ui.leftHandleAria}
                    aria-valuemin={GLOBAL_MIN_YEAR}
                    aria-valuemax={normalizedRange[1] - 1}
                    aria-valuenow={normalizedRange[0]}
                    style={{ left: `${leftHandlePct}%` }}
                    onPointerDown={(e) => handleHandlePointerDown('left_handle', e)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      const step = e.shiftKey ? 5 : 1;
                      if (e.key === 'ArrowLeft') {
                        updateRangeBounds(normalizedRange[0] - step, normalizedRange[1]);
                      } else if (e.key === 'ArrowRight') {
                        updateRangeBounds(
                          Math.min(normalizedRange[1] - 1, normalizedRange[0] + step),
                          normalizedRange[1],
                        );
                      }
                    }}
                    className="absolute top-0 bottom-0 -translate-x-1/2 z-30 w-5 flex items-center justify-center cursor-ew-resize focus:outline-none group"
                  >
                    <span className="absolute inset-y-0 w-px bg-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.65)]" />
                    <span className="absolute top-0 left-1/2 w-2 h-0.5 bg-sky-300" />
                    <span className="absolute bottom-0 left-1/2 w-2 h-0.5 bg-sky-300" />
                    <span className="relative w-3 h-5 rounded-[2px] bg-sky-400 group-hover:bg-sky-300 group-focus-visible:ring-2 group-focus-visible:ring-white text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.75)] flex items-center justify-center gap-0.5 transition-colors">
                      <span className="w-px h-2.5 bg-slate-950/75" />
                      <span className="w-px h-2.5 bg-slate-950/75" />
                    </span>
                  </button>
                )}

                {/* Interactive Right Caliper Bracket Handle */}
                {normalizedRange && (
                  <button
                    type="button"
                    role="slider"
                    aria-label={ui.rightHandleAria}
                    aria-valuemin={normalizedRange[0] + 1}
                    aria-valuemax={GLOBAL_MAX_YEAR}
                    aria-valuenow={normalizedRange[1]}
                    style={{ left: `${rightHandlePct}%` }}
                    onPointerDown={(e) => handleHandlePointerDown('right_handle', e)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      const step = e.shiftKey ? 5 : 1;
                      if (e.key === 'ArrowLeft') {
                        updateRangeBounds(
                          normalizedRange[0],
                          Math.max(normalizedRange[0] + 1, normalizedRange[1] - step),
                        );
                      } else if (e.key === 'ArrowRight') {
                        updateRangeBounds(normalizedRange[0], normalizedRange[1] + step);
                      }
                    }}
                    className="absolute top-0 bottom-0 -translate-x-1/2 z-30 w-5 flex items-center justify-center cursor-ew-resize focus:outline-none group"
                  >
                    <span className="absolute inset-y-0 w-px bg-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.65)]" />
                    <span className="absolute top-0 right-1/2 w-2 h-0.5 bg-sky-300" />
                    <span className="absolute bottom-0 right-1/2 w-2 h-0.5 bg-sky-300" />
                    <span className="relative w-3 h-5 rounded-[2px] bg-sky-400 group-hover:bg-sky-300 group-focus-visible:ring-2 group-focus-visible:ring-white text-slate-950 shadow-[0_2px_8px_rgba(0,0,0,0.75)] flex items-center justify-center gap-0.5 transition-colors">
                      <span className="w-px h-2.5 bg-slate-950/75" />
                      <span className="w-px h-2.5 bg-slate-950/75" />
                    </span>
                  </button>
                )}

                {/* Machined Sapphire Playhead Index Needle */}
                <div
                  style={{ left: `${playheadPct}%` }}
                  className={`absolute top-0 bottom-0 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none ${
                    !isDragging && normalizedRange ? 'transition-[left] duration-150 ease-out' : ''
                  }`}
                >
                  <div className="w-2.5 h-1.5 rounded-b-[2px] bg-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.9)]" />
                  <div className="w-px flex-1 bg-sky-300 shadow-[0_0_10px_rgba(56,189,248,0.85)]" />
                  <div className="w-2 h-0.5 bg-sky-300" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
};
