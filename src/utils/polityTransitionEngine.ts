import {
  PolityPhase,
  ResolvedTerritoryFeature,
} from '../types/history';
import { clamp, resolvePolityForTerritory, smootherstep01 } from './geoMath';
import { dissolveSamePolityInlandBorders } from '../services/osmBoundaryService';
import {
  computeUnboundedPolityField,
  isUnboundedPolity,
  UnboundedPolityFieldResult,
} from './unboundedPolityField';

/**
 * Crisp, snappy cartographic transition duration (210ms):
 * Smooth enough for the human eye to perceive territorial expansion, regime change,
 * and polity demise without ever feeling sluggish or lagging behind 1x/5x timeline playback.
 */
export const GEOPOLITICAL_FADE_MS = 210;

export interface DemarcatedSlotItem {
  key: string;
  id: string;
  polityId: string;
  nameZh: string;
  tier: ResolvedTerritoryFeature['tier'];
  isCore: boolean;
  fillColor: string;
  borderColor: string;
  baseFillOpacity: number;
  geometry: ResolvedTerritoryFeature['geometry'];
  outerBoundary: ResolvedTerritoryFeature['outerBoundary'];
}

export interface UnboundedSlotCohort {
  key: string;
  field: UnboundedPolityFieldResult;
}

export interface GeopoliticalTransitionFrame {
  steadyDemarcated: DemarcatedSlotItem[];
  enteringDemarcated: DemarcatedSlotItem[];
  exitingDemarcated: DemarcatedSlotItem[];
  steadyUnbounded: UnboundedSlotCohort | null;
  enteringUnbounded: UnboundedSlotCohort | null;
  exitingUnbounded: UnboundedSlotCohort | null;
  steadyDemarcatedSig: string;
  enteringDemarcatedSig: string;
  exitingDemarcatedSig: string;
  steadyUnboundedSig: string;
  enteringUnboundedSig: string;
  exitingUnboundedSig: string;
  enteringFactor: number;
  exitingFactor: number;
  isAnimating: boolean;
}

export interface ZoomBorderWidthStop {
  zoom: number;
  coreStrokePx: number;
  alliedStrokePx: number;
  casingPx: number;
  innerRibbonPx: number;
  strokeBlurPx: number;
  ribbonBlurPx: number;
}

/**
 * Multi-scale cartographic zoom curve for national borders:
 * - At macro globe/continental overview (`zoom 1.15–2.4`), borders slim down to delicate
 *   sub-pixel / ~0.6–0.85px threads with minimal blur so archipelagos, peninsulas, and small
 *   states never crowd or squeeze together.
 * - As the user zooms into regional & polis views (`zoom 4.5–11.5`), stroke, dark casing, and
 *   inner coastal ribbon expand proportionally with viewport scale.
 */
export const ZOOM_ADAPTIVE_BORDER_STOPS: ReadonlyArray<ZoomBorderWidthStop> = [
  {
    zoom: 1.15,
    coreStrokePx: 0.52,
    alliedStrokePx: 0.4,
    casingPx: 0.82,
    innerRibbonPx: 0.85,
    strokeBlurPx: 0.16,
    ribbonBlurPx: 0.32,
  },
  {
    zoom: 2.2,
    coreStrokePx: 0.82,
    alliedStrokePx: 0.64,
    casingPx: 1.24,
    innerRibbonPx: 1.48,
    strokeBlurPx: 0.22,
    ribbonBlurPx: 0.52,
  },
  {
    zoom: 3.5,
    coreStrokePx: 1.32,
    alliedStrokePx: 1.02,
    casingPx: 1.96,
    innerRibbonPx: 2.75,
    strokeBlurPx: 0.3,
    ribbonBlurPx: 0.85,
  },
  {
    zoom: 5.5,
    coreStrokePx: 2.18,
    alliedStrokePx: 1.7,
    casingPx: 3.15,
    innerRibbonPx: 4.95,
    strokeBlurPx: 0.38,
    ribbonBlurPx: 1.25,
  },
  {
    zoom: 8.0,
    coreStrokePx: 3.22,
    alliedStrokePx: 2.52,
    casingPx: 4.55,
    innerRibbonPx: 7.75,
    strokeBlurPx: 0.44,
    ribbonBlurPx: 1.55,
  },
  {
    zoom: 11.5,
    coreStrokePx: 4.35,
    alliedStrokePx: 3.4,
    casingPx: 5.95,
    innerRibbonPx: 10.8,
    strokeBlurPx: 0.48,
    ribbonBlurPx: 1.8,
  },
];

const EXP_BASE = 1.38;

function interpExp(z: number, z0: number, z1: number, v0: number, v1: number): number {
  const span = z1 - z0;
  if (span <= 1e-6) return v1;
  const t = clamp((z - z0) / span, 0, 1);
  const weight = (Math.pow(EXP_BASE, t * span) - 1) / (Math.pow(EXP_BASE, span) - 1);
  return v0 + (v1 - v0) * weight;
}

/**
 * Evaluates exact rendered border pixel widths at any MapLibre zoom level (for deterministic unit tests).
 */
export function evaluateBorderWidthsAtZoom(zoom: number): Omit<ZoomBorderWidthStop, 'zoom'> {
  const stops = ZOOM_ADAPTIVE_BORDER_STOPS;
  if (zoom <= stops[0].zoom) {
    const s = stops[0];
    return {
      coreStrokePx: s.coreStrokePx,
      alliedStrokePx: s.alliedStrokePx,
      casingPx: s.casingPx,
      innerRibbonPx: s.innerRibbonPx,
      strokeBlurPx: s.strokeBlurPx,
      ribbonBlurPx: s.ribbonBlurPx,
    };
  }
  const last = stops[stops.length - 1];
  if (zoom >= last.zoom) {
    return {
      coreStrokePx: last.coreStrokePx,
      alliedStrokePx: last.alliedStrokePx,
      casingPx: last.casingPx,
      innerRibbonPx: last.innerRibbonPx,
      strokeBlurPx: last.strokeBlurPx,
      ribbonBlurPx: last.ribbonBlurPx,
    };
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (zoom >= a.zoom && zoom <= b.zoom) {
      return {
        coreStrokePx: +interpExp(zoom, a.zoom, b.zoom, a.coreStrokePx, b.coreStrokePx).toFixed(3),
        alliedStrokePx: +interpExp(
          zoom,
          a.zoom,
          b.zoom,
          a.alliedStrokePx,
          b.alliedStrokePx,
        ).toFixed(3),
        casingPx: +interpExp(zoom, a.zoom, b.zoom, a.casingPx, b.casingPx).toFixed(3),
        innerRibbonPx: +interpExp(zoom, a.zoom, b.zoom, a.innerRibbonPx, b.innerRibbonPx).toFixed(
          3,
        ),
        strokeBlurPx: +interpExp(zoom, a.zoom, b.zoom, a.strokeBlurPx, b.strokeBlurPx).toFixed(3),
        ribbonBlurPx: +interpExp(zoom, a.zoom, b.zoom, a.ribbonBlurPx, b.ribbonBlurPx).toFixed(3),
      };
    }
  }
  return {
    coreStrokePx: last.coreStrokePx,
    alliedStrokePx: last.alliedStrokePx,
    casingPx: last.casingPx,
    innerRibbonPx: last.innerRibbonPx,
    strokeBlurPx: last.strokeBlurPx,
    ribbonBlurPx: last.ribbonBlurPx,
  };
}

/**
 * Builds MapLibre GL JS zoom-interpolated style expressions for demarcated national borders.
 */
export function buildZoomAdaptiveBorderPaintSpecs(): {
  strokeWidthExpr: any;
  strokeBlurExpr: any;
  casingWidthExpr: any;
  casingBlurExpr: any;
  innerRibbonWidthExpr: any;
  innerRibbonBlurExpr: any;
} {
  const strokeWidthExpr: any[] = ['interpolate', ['exponential', EXP_BASE], ['zoom']];
  const strokeBlurExpr: any[] = ['interpolate', ['linear'], ['zoom']];
  const casingWidthExpr: any[] = ['interpolate', ['exponential', EXP_BASE], ['zoom']];
  const casingBlurExpr: any[] = ['interpolate', ['linear'], ['zoom']];
  const innerRibbonWidthExpr: any[] = ['interpolate', ['exponential', EXP_BASE], ['zoom']];
  const innerRibbonBlurExpr: any[] = ['interpolate', ['linear'], ['zoom']];

  for (const s of ZOOM_ADAPTIVE_BORDER_STOPS) {
    strokeWidthExpr.push(s.zoom, ['case', ['get', 'isCore'], s.coreStrokePx, s.alliedStrokePx]);
    strokeBlurExpr.push(s.zoom, s.strokeBlurPx);
    casingWidthExpr.push(s.zoom, s.casingPx);
    casingBlurExpr.push(s.zoom, +(s.strokeBlurPx * 1.15).toFixed(2));
    innerRibbonWidthExpr.push(s.zoom, s.innerRibbonPx);
    innerRibbonBlurExpr.push(s.zoom, s.ribbonBlurPx);
  }

  return {
    strokeWidthExpr,
    strokeBlurExpr,
    casingWidthExpr,
    casingBlurExpr,
    innerRibbonWidthExpr,
    innerRibbonBlurExpr,
  };
}

let lastDemarcatedDissolveKey = '';
let lastDemarcatedDissolvedItems: DemarcatedSlotItem[] = [];

export function buildGeopoliticalTargetSnapshot(
  activePolities: PolityPhase[],
  activeTerritories: ResolvedTerritoryFeature[],
): {
  targetSig: string;
  demarcatedItems: DemarcatedSlotItem[];
  unboundedCohort: UnboundedSlotCohort | null;
} {
  const demarcatedPolities = activePolities.filter((p) => !isUnboundedPolity(p));
  let demarcatedItems: DemarcatedSlotItem[] = [];

  if (demarcatedPolities.length > 0) {
    const rawItems: DemarcatedSlotItem[] = [];
    for (let i = 0; i < activeTerritories.length; i++) {
      const t = activeTerritories[i];
      const owner = resolvePolityForTerritory(t, activePolities) ?? activePolities[0];
      if (!owner || isUnboundedPolity(owner)) continue;
      const baseFillOpacity =
        t.tier === 'metropolis' ? 0.65 : t.tier === 'cleruchy' ? 0.57 : 0.49;
      const key = `${t.id}::${owner.id}::${owner.representativeColor}::${owner.borderColor}::${t.tier}`;
      rawItems.push({
        key,
        id: t.id,
        polityId: owner.id,
        nameZh: t.nameZh,
        tier: t.tier,
        isCore: t.tier !== 'allied_tribute',
        fillColor: owner.representativeColor,
        borderColor: owner.borderColor,
        baseFillOpacity,
        geometry: t.geometry,
        outerBoundary: t.outerBoundary,
      });
    }

    const dissolveKey = rawItems
      .map((d) => `${d.key}:${d.outerBoundary.coordinates.length}`)
      .join('|');
    if (dissolveKey === lastDemarcatedDissolveKey) {
      demarcatedItems = lastDemarcatedDissolvedItems;
    } else {
      demarcatedItems = dissolveSamePolityInlandBorders(rawItems);
      lastDemarcatedDissolveKey = dissolveKey;
      lastDemarcatedDissolvedItems = demarcatedItems;
    }
  }

  const unboundedPolities = activePolities.filter((p) => isUnboundedPolity(p));
  let unboundedCohort: UnboundedSlotCohort | null = null;
  if (unboundedPolities.length > 0) {
    const uKey = `${unboundedPolities
      .map((p) => `${p.id}:${p.representativeColor}`)
      .join(',')}::${activeTerritories.map((t) => t.id).join(',')}`;
    const field = computeUnboundedPolityField(activePolities, activeTerritories, {
      opacityScale: 1.0,
    });
    if (field.shells.length > 0 || field.glazeParcels.length > 0) {
      unboundedCohort = { key: uKey, field };
    }
  }

  const targetSig = `${demarcatedItems.map((d) => d.key).join('|')}###${unboundedCohort?.key ?? 'none'}`;
  return { targetSig, demarcatedItems, unboundedCohort };
}

function itemsSig(items: DemarcatedSlotItem[]): string {
  return items.length === 0
    ? 'empty'
    : items
        .map((d) => `${d.key}#${d.outerBoundary.coordinates.length}`)
        .join('|');
}

/**
 * Stateful, zero-allocation GPU snapshot diff & 210ms C² cross-fade controller:
 * - Unchanged territories remain steady at `1.0` (zero flicker during territorial expansion/contraction).
 * - Newly annexed territories, emergent polities, or successor regimes fade in `0 -> 1`.
 * - Ceded territories, superseded regimes, or extinct polities fade out `1 -> 0` and clean up to empty.
 */
export class GeopoliticalTransitionController {
  private initialized = false;
  private lastTargetSig = '__uninit__';
  private tweenStartMs = 0;
  private durationMs = GEOPOLITICAL_FADE_MS;

  private steadyDemarcated: DemarcatedSlotItem[] = [];
  private enteringDemarcated: DemarcatedSlotItem[] = [];
  private exitingDemarcated: DemarcatedSlotItem[] = [];

  private steadyUnbounded: UnboundedSlotCohort | null = null;
  private enteringUnbounded: UnboundedSlotCohort | null = null;
  private exitingUnbounded: UnboundedSlotCohort | null = null;

  private enterStartFactor = 0;
  private exitStartFactor = 1;
  private curEnteringFactor = 1;
  private curExitingFactor = 0;
  private animating = false;

  constructor(durationMs = GEOPOLITICAL_FADE_MS) {
    this.durationMs = clamp(durationMs, 80, 400);
  }

  public reset(): void {
    this.initialized = false;
    this.lastTargetSig = '__uninit__';
    this.steadyDemarcated = [];
    this.enteringDemarcated = [];
    this.exitingDemarcated = [];
    this.steadyUnbounded = null;
    this.enteringUnbounded = null;
    this.exitingUnbounded = null;
    this.curEnteringFactor = 1;
    this.curExitingFactor = 0;
    this.animating = false;
  }

  public syncTarget(
    activePolities: PolityPhase[],
    activeTerritories: ResolvedTerritoryFeature[],
    nowMs: number,
    options: { immediate?: boolean } = {},
  ): { changed: boolean; frame: GeopoliticalTransitionFrame } {
    const { targetSig, demarcatedItems, unboundedCohort } = buildGeopoliticalTargetSnapshot(
      activePolities,
      activeTerritories,
    );

    if (this.initialized && targetSig === this.lastTargetSig && !options.immediate) {
      return { changed: false, frame: this.sampleFrame(nowMs) };
    }

    // Advance current factors to `nowMs` before re-partitioning any mid-flight tween
    if (this.initialized && this.animating) {
      this.sampleFrame(nowMs);
    }

    const isImmediate = !this.initialized || Boolean(options.immediate);
    this.initialized = true;
    this.lastTargetSig = targetSig;

    if (isImmediate) {
      this.steadyDemarcated = demarcatedItems;
      this.enteringDemarcated = [];
      this.exitingDemarcated = [];
      this.steadyUnbounded = unboundedCohort;
      this.enteringUnbounded = null;
      this.exitingUnbounded = null;
      this.enterStartFactor = 1;
      this.exitStartFactor = 0;
      this.curEnteringFactor = 1;
      this.curExitingFactor = 0;
      this.animating = false;
      return { changed: true, frame: this.buildCurrentFrame() };
    }

    // Build visibility lookup of everything currently displayed right before `nowMs`
    const prevDemarcatedVis = new Map<string, { item: DemarcatedSlotItem; alpha: number }>();
    for (const item of this.steadyDemarcated) {
      prevDemarcatedVis.set(item.key, { item, alpha: 1.0 });
    }
    if (this.curEnteringFactor > 0.02) {
      for (const item of this.enteringDemarcated) {
        prevDemarcatedVis.set(item.key, { item, alpha: this.curEnteringFactor });
      }
    }
    if (this.curExitingFactor > 0.04) {
      for (const item of this.exitingDemarcated) {
        if (!prevDemarcatedVis.has(item.key)) {
          prevDemarcatedVis.set(item.key, { item, alpha: this.curExitingFactor });
        }
      }
    }

    const nextKeys = new Set(demarcatedItems.map((d) => d.key));
    const nextSteady: DemarcatedSlotItem[] = [];
    const nextEntering: DemarcatedSlotItem[] = [];
    const nextExiting: DemarcatedSlotItem[] = [];

    let resurrectedAlphaSum = 0;
    let resurrectedCount = 0;

    for (const item of demarcatedItems) {
      const prev = prevDemarcatedVis.get(item.key);
      if (prev && prev.alpha >= 0.96) {
        nextSteady.push(item);
      } else {
        nextEntering.push(item);
        if (prev && prev.alpha > 0.02) {
          resurrectedAlphaSum += prev.alpha;
          resurrectedCount++;
        }
      }
    }

    let maxDepartingAlpha = 0;
    for (const [key, { item, alpha }] of prevDemarcatedVis.entries()) {
      if (!nextKeys.has(key) && alpha >= 0.04) {
        nextExiting.push(item);
        if (alpha > maxDepartingAlpha) {
          maxDepartingAlpha = alpha;
        }
      }
    }
    // Bound exiting ghosts during ultra-fast timeline scrubbing
    if (nextExiting.length > 24) {
      nextExiting.length = 24;
    }

    // Partition Unbounded Ancient Civilization Cohort (`steady`, `entering`, `exiting`)
    const prevUnboundedCandidates: Array<{ cohort: UnboundedSlotCohort; alpha: number }> = [];
    if (this.steadyUnbounded) {
      prevUnboundedCandidates.push({ cohort: this.steadyUnbounded, alpha: 1.0 });
    }
    if (this.enteringUnbounded && this.curEnteringFactor > 0.02) {
      prevUnboundedCandidates.push({
        cohort: this.enteringUnbounded,
        alpha: this.curEnteringFactor,
      });
    }
    if (this.exitingUnbounded && this.curExitingFactor > 0.04) {
      prevUnboundedCandidates.push({
        cohort: this.exitingUnbounded,
        alpha: this.curExitingFactor,
      });
    }

    let nextSteadyUnbounded: UnboundedSlotCohort | null = null;
    let nextEnteringUnbounded: UnboundedSlotCohort | null = null;
    let nextExitingUnbounded: UnboundedSlotCohort | null = null;

    if (unboundedCohort) {
      const matchingPrev = prevUnboundedCandidates.find(
        (c) => c.cohort.key === unboundedCohort.key,
      );
      if (matchingPrev && matchingPrev.alpha >= 0.96) {
        nextSteadyUnbounded = unboundedCohort;
      } else {
        nextEnteringUnbounded = unboundedCohort;
        if (matchingPrev && matchingPrev.alpha > 0.02 && nextEntering.length === 0) {
          resurrectedAlphaSum += matchingPrev.alpha;
          resurrectedCount++;
        }
      }
    }

    const departingUnbounded = prevUnboundedCandidates.find(
      (c) => !unboundedCohort || c.cohort.key !== unboundedCohort.key,
    );
    if (departingUnbounded && departingUnbounded.alpha >= 0.04) {
      nextExitingUnbounded = departingUnbounded.cohort;
      if (departingUnbounded.alpha > maxDepartingAlpha) {
        maxDepartingAlpha = departingUnbounded.alpha;
      }
    }

    const hasEntering = nextEntering.length > 0 || nextEnteringUnbounded !== null;
    const hasExiting = nextExiting.length > 0 || nextExitingUnbounded !== null;

    this.steadyDemarcated = nextSteady;
    this.enteringDemarcated = nextEntering;
    this.exitingDemarcated = nextExiting;
    this.steadyUnbounded = nextSteadyUnbounded;
    this.enteringUnbounded = nextEnteringUnbounded;
    this.exitingUnbounded = nextExitingUnbounded;

    if (!hasEntering && !hasExiting) {
      this.enterStartFactor = 1;
      this.exitStartFactor = 0;
      this.curEnteringFactor = 1;
      this.curExitingFactor = 0;
      this.animating = false;
    } else {
      this.tweenStartMs = nowMs;
      this.enterStartFactor =
        hasEntering && resurrectedCount > 0 && resurrectedCount === nextEntering.length
          ? clamp(resurrectedAlphaSum / resurrectedCount, 0, 0.92)
          : 0;
      this.exitStartFactor = hasExiting ? clamp(maxDepartingAlpha, 0.05, 1.0) : 0;
      this.curEnteringFactor = hasEntering ? this.enterStartFactor : 1;
      this.curExitingFactor = hasExiting ? this.exitStartFactor : 0;
      this.animating = true;
    }

    return { changed: true, frame: this.buildCurrentFrame() };
  }

  public sampleFrame(nowMs: number): GeopoliticalTransitionFrame {
    if (!this.animating) {
      return this.buildCurrentFrame();
    }

    const rawT = clamp((nowMs - this.tweenStartMs) / this.durationMs, 0, 1);
    if (rawT >= 1) {
      // Clear now-invisible exiting cohorts (alpha === 0); keep settled entering cohorts in place
      // at factor 1.0 so async MapLibre Web Worker tile builds never cause a 1-frame handoff flash.
      this.exitingDemarcated = [];
      this.exitingUnbounded = null;
      this.curEnteringFactor = 1;
      this.curExitingFactor = 0;
      this.animating = false;
      return this.buildCurrentFrame();
    }

    const eased = smootherstep01(rawT);
    const hasEntering = this.enteringDemarcated.length > 0 || this.enteringUnbounded !== null;
    const hasExiting = this.exitingDemarcated.length > 0 || this.exitingUnbounded !== null;

    this.curEnteringFactor = hasEntering
      ? +(this.enterStartFactor + (1 - this.enterStartFactor) * eased).toFixed(4)
      : 1;
    this.curExitingFactor = hasExiting ? +(this.exitStartFactor * (1 - eased)).toFixed(4) : 0;

    return this.buildCurrentFrame();
  }

  private buildCurrentFrame(): GeopoliticalTransitionFrame {
    return {
      steadyDemarcated: this.steadyDemarcated,
      enteringDemarcated: this.enteringDemarcated,
      exitingDemarcated: this.exitingDemarcated,
      steadyUnbounded: this.steadyUnbounded,
      enteringUnbounded: this.enteringUnbounded,
      exitingUnbounded: this.exitingUnbounded,
      steadyDemarcatedSig: itemsSig(this.steadyDemarcated),
      enteringDemarcatedSig: itemsSig(this.enteringDemarcated),
      exitingDemarcatedSig: itemsSig(this.exitingDemarcated),
      steadyUnboundedSig: this.steadyUnbounded?.key ?? 'empty',
      enteringUnboundedSig: this.enteringUnbounded?.key ?? 'empty',
      exitingUnboundedSig: this.exitingUnbounded?.key ?? 'empty',
      enteringFactor: this.curEnteringFactor,
      exitingFactor: this.curExitingFactor,
      isAnimating: this.animating,
    };
  }
}
