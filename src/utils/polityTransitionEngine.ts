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
        hasEntering && resurrectedCount > 0
          ? clamp(resurrectedAlphaSum / Math.max(1, nextEntering.length), 0, 0.92)
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

/* ============================================================================
 * ZERO-FLICKER STATIC GPU CATALOG & PER-FEATURE CONTINUOUS STATE ANIMATOR
 * Uploads all polygon & inland-border geometries ONCE to MapLibre GeoJSON
 * sources (`promoteId: 'fid'`) and drives 100% of timeline playback, mouse
 * scrubbing, regime color morphs, expansions, and demises via synchronous
 * `map.setFeatureState` updates (zero runtime `setData` Web Worker reloads,
 * zero data-driven `setPaintProperty` tile pauses, zero opacity dips).
 * ========================================================================== */

export function parseHexRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (!Number.isNaN(r) && !Number.isNaN(g) && !Number.isNaN(b)) {
      return [r, g, b];
    }
  }
  return [79, 70, 229];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const cr = clamp(Math.round(r), 0, 255);
  const cg = clamp(Math.round(g), 0, 255);
  const cb = clamp(Math.round(b), 0, 255);
  return `#${cr.toString(16).padStart(2, '0')}${cg.toString(16).padStart(2, '0')}${cb
    .toString(16)
    .padStart(2, '0')}`;
}

export function computeBoundaryVariantKey(
  territoryId: string,
  isCore: boolean,
  mls: ResolvedTerritoryFeature['outerBoundary'],
): string | null {
  const coords = mls.coordinates;
  if (coords.length === 0) return null;
  let totalPts = 0;
  let sumLon = 0;
  let sumLat = 0;
  for (let i = 0; i < coords.length; i++) {
    const line = coords[i];
    totalPts += line.length;
    if (line.length > 0) {
      sumLon += line[0][0] + line[line.length - 1][0];
      sumLat += line[0][1] + line[line.length - 1][1];
    }
  }
  return `${territoryId}:${isCore ? 1 : 0}:${coords.length}:${totalPts}:${Math.round(
    sumLon * 1000,
  )}:${Math.round(sumLat * 1000)}`;
}

export interface StaticGeopoliticalCatalog {
  catalogSig: string;
  demarcatedFillFC: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: number;
      properties: {
        fid: number;
        id: string;
        nameZh: string;
        tier: ResolvedTerritoryFeature['tier'];
        fillColor: string;
      };
      geometry: ResolvedTerritoryFeature['geometry'];
    }>;
  };
  demarcatedBoundaryFC: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: number;
      properties: {
        fid: number;
        bKey: string;
        id: string;
        isCore: boolean;
        borderColor: string;
      };
      geometry: ResolvedTerritoryFeature['outerBoundary'];
    }>;
  };
  unboundedGlazeFC: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: number;
      properties: {
        fid: number;
        cohortKey: string;
        id: string;
        polityId: string;
        nameZh: string;
        tier: ResolvedTerritoryFeature['tier'];
        isCoreZone: boolean;
        fillColor: string;
        baseOpacity: number;
      };
      geometry: ResolvedTerritoryFeature['geometry'];
    }>;
  };
  unboundedFieldFC: {
    type: 'FeatureCollection';
    features: Array<{
      type: 'Feature';
      id: number;
      properties: {
        fid: number;
        cohortKey: string;
        id: string;
        polityId: string;
        tier: UnboundedPolityFieldResult['shells'][number]['tier'];
        color: string;
        baseOpacity: number;
      };
      geometry: {
        type: 'Polygon';
        coordinates: [number, number][][];
      };
    }>;
  };
  fillFidByTerritoryId: Map<string, number>;
  boundaryFidByBKey: Map<string, number>;
  fallbackBoundaryFidByTerritoryId: Map<string, number>;
  unboundedGlazeFidsByCohort: Map<string, number[]>;
  unboundedFieldFidsByCohort: Map<string, number[]>;
}

let cachedStaticCatalog: StaticGeopoliticalCatalog | null = null;

export function computeStaticCatalogSignature(
  allPolities: PolityPhase[],
  allTerritories: ResolvedTerritoryFeature[],
): string {
  const pPart = allPolities
    .map(
      (p) =>
        `${p.id}:${p.startYear}:${p.endYear}:${p.representativeColor}:${p.borderColor}:${p.boundaryMode ?? 'd'}`,
    )
    .join(',');
  const tPart = allTerritories
    .map(
      (t) =>
        `${t.id}:${t.validFrom}:${t.validTo}:${t.geometry.coordinates.length}:${t.outerBoundary.coordinates.length}`,
    )
    .join(',');
  return `${pPart}###${tPart}`;
}

/**
 * Builds the complete static GeoJSON catalog across all polities, territories, dissolved border
 * variants, and unbounded spheres in `< 8ms` once when OSM geometries finish loading.
 */
export function buildStaticGeopoliticalCatalog(
  allPolities: PolityPhase[],
  allTerritories: ResolvedTerritoryFeature[],
): StaticGeopoliticalCatalog {
  const catalogSig = computeStaticCatalogSignature(allPolities, allTerritories);
  if (cachedStaticCatalog && cachedStaticCatalog.catalogSig === catalogSig) {
    return cachedStaticCatalog;
  }

  const fillFeatures: StaticGeopoliticalCatalog['demarcatedFillFC']['features'] = [];
  const boundaryFeatures: StaticGeopoliticalCatalog['demarcatedBoundaryFC']['features'] = [];
  const unboundedGlazeFeatures: StaticGeopoliticalCatalog['unboundedGlazeFC']['features'] = [];
  const unboundedFieldFeatures: StaticGeopoliticalCatalog['unboundedFieldFC']['features'] = [];

  const fillFidByTerritoryId = new Map<string, number>();
  const boundaryFidByBKey = new Map<string, number>();
  const fallbackBoundaryFidByTerritoryId = new Map<string, number>();
  const unboundedGlazeFidsByCohort = new Map<string, number[]>();
  const unboundedFieldFidsByCohort = new Map<string, number[]>();

  let nextFillFid = 1;
  let nextBoundaryFid = 1;
  let nextUnbGlazeFid = 1;
  let nextUnbFieldFid = 1;

  for (const reg of allTerritories) {
    const owner =
      (reg.polityId ? allPolities.find((p) => p.id === reg.polityId) : undefined) ??
      allPolities.find((p) => p.startYear <= reg.validTo && p.endYear >= reg.validFrom);
    const defaultFill = owner?.representativeColor ?? '#4F46E5';
    const defaultBorder = owner?.borderColor ?? '#A5B4FC';

    const fid = nextFillFid++;
    fillFidByTerritoryId.set(reg.id, fid);
    fillFeatures.push({
      type: 'Feature',
      id: fid,
      properties: {
        fid,
        id: reg.id,
        nameZh: reg.nameZh,
        tier: reg.tier,
        fillColor: defaultFill,
      },
      geometry: reg.geometry,
    });

    const isCore = reg.tier !== 'allied_tribute';
    const standaloneKey = computeBoundaryVariantKey(reg.id, isCore, reg.outerBoundary);
    if (standaloneKey && !boundaryFidByBKey.has(standaloneKey)) {
      const bFid = nextBoundaryFid++;
      boundaryFidByBKey.set(standaloneKey, bFid);
      fallbackBoundaryFidByTerritoryId.set(reg.id, bFid);
      boundaryFeatures.push({
        type: 'Feature',
        id: bFid,
        properties: {
          fid: bFid,
          bKey: standaloneKey,
          id: reg.id,
          isCore,
          borderColor: defaultBorder,
        },
        geometry: reg.outerBoundary,
      });
    }
  }

  // Sweep all historical regime/territory transition years once to register every dissolved border
  // variant and every unbounded sphere cohort into the static GPU sources
  const candidateYears = new Set<number>();
  for (const p of allPolities) {
    candidateYears.add(p.startYear);
    candidateYears.add(p.endYear);
    if (p.endYear + 1 !== 0) candidateYears.add(p.endYear + 1);
    else candidateYears.add(1);
  }
  for (const r of allTerritories) {
    candidateYears.add(r.validFrom);
    candidateYears.add(r.validTo);
    if (r.validTo + 1 !== 0) candidateYears.add(r.validTo + 1);
    else candidateYears.add(1);
  }

  const seenUnboundedCohorts = new Set<string>();
  const sortedYears = Array.from(candidateYears).sort((a, b) => a - b);

  for (const yr of sortedYears) {
    const polsAtYr = allPolities.filter((p) => yr >= p.startYear && yr <= p.endYear);
    if (polsAtYr.length === 0) continue;
    const terrsAtYr = allTerritories.filter((t) => yr >= t.validFrom && yr <= t.validTo);
    const snap = buildGeopoliticalTargetSnapshot(polsAtYr, terrsAtYr);

    for (const d of snap.demarcatedItems) {
      const bKey = computeBoundaryVariantKey(d.id, d.isCore, d.outerBoundary);
      if (bKey && !boundaryFidByBKey.has(bKey)) {
        const bFid = nextBoundaryFid++;
        boundaryFidByBKey.set(bKey, bFid);
        if (!fallbackBoundaryFidByTerritoryId.has(d.id)) {
          fallbackBoundaryFidByTerritoryId.set(d.id, bFid);
        }
        boundaryFeatures.push({
          type: 'Feature',
          id: bFid,
          properties: {
            fid: bFid,
            bKey,
            id: d.id,
            isCore: d.isCore,
            borderColor: d.borderColor,
          },
          geometry: d.outerBoundary,
        });
      }
    }

    if (snap.unboundedCohort && !seenUnboundedCohorts.has(snap.unboundedCohort.key)) {
      const cohortKey = snap.unboundedCohort.key;
      seenUnboundedCohorts.add(cohortKey);
      const gFids: number[] = [];
      for (const g of snap.unboundedCohort.field.glazeParcels) {
        const gFid = nextUnbGlazeFid++;
        gFids.push(gFid);
        unboundedGlazeFeatures.push({
          type: 'Feature',
          id: gFid,
          properties: {
            fid: gFid,
            cohortKey,
            id: g.id,
            polityId: g.polityId,
            nameZh: g.nameZh,
            tier: g.tier,
            isCoreZone: g.isCoreZone,
            fillColor: g.fillColor,
            baseOpacity: g.fillOpacity,
          },
          geometry: g.geometry,
        });
      }
      unboundedGlazeFidsByCohort.set(cohortKey, gFids);

      const fFids: number[] = [];
      for (const sh of snap.unboundedCohort.field.shells) {
        const fFid = nextUnbFieldFid++;
        fFids.push(fFid);
        unboundedFieldFeatures.push({
          type: 'Feature',
          id: fFid,
          properties: {
            fid: fFid,
            cohortKey,
            id: sh.id,
            polityId: sh.polityId,
            tier: sh.tier,
            color: sh.color,
            baseOpacity: sh.fillOpacity,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [sh.ring],
          },
        });
      }
      unboundedFieldFidsByCohort.set(cohortKey, fFids);
    }
  }

  cachedStaticCatalog = {
    catalogSig,
    demarcatedFillFC: { type: 'FeatureCollection', features: fillFeatures },
    demarcatedBoundaryFC: { type: 'FeatureCollection', features: boundaryFeatures },
    unboundedGlazeFC: { type: 'FeatureCollection', features: unboundedGlazeFeatures },
    unboundedFieldFC: { type: 'FeatureCollection', features: unboundedFieldFeatures },
    fillFidByTerritoryId,
    boundaryFidByBKey,
    fallbackBoundaryFidByTerritoryId,
    unboundedGlazeFidsByCohort,
    unboundedFieldFidsByCohort,
  };
  return cachedStaticCatalog;
}

interface ColorAlphaTweenNode {
  fid: number;
  startAlpha: number;
  curAlpha: number;
  targetAlpha: number;
  startR: number;
  startG: number;
  startB: number;
  curR: number;
  curG: number;
  curB: number;
  targetR: number;
  targetG: number;
  targetB: number;
  tweenStartMs: number;
  animating: boolean;
}

interface ScalarTweenNode {
  cohortKey: string;
  startAlpha: number;
  curAlpha: number;
  targetAlpha: number;
  tweenStartMs: number;
  animating: boolean;
}

export interface GpuEvaluatedFillState {
  fid: number;
  territoryId: string;
  alpha: number;
  fillColor: string;
}

export interface GpuEvaluatedBoundaryState {
  fid: number;
  alpha: number;
  borderColor: string;
}

export interface GpuEvaluatedCohortState {
  cohortKey: string;
  glazeFids: number[];
  fieldFids: number[];
  alpha: number;
}

export interface GeopoliticalGpuFrame {
  fills: GpuEvaluatedFillState[];
  boundaries: GpuEvaluatedBoundaryState[];
  unboundedCohorts: GpuEvaluatedCohortState[];
  isAnimating: boolean;
}

/**
 * Per-feature continuous RGB + Alpha GPU state interpolator:
 * - Continuing territories across regime changes keep steady opacity while smoothly morphing RGB color
 *   (eliminating translucent cross-fade mid-point dips and double-layer flashes).
 * - Each feature owns its own independent `tweenStartMs`, so rapid 5x auto-playback or continuous
 *   mouse scrubbing along the timeline never resets already-in-flight features back to 0.
 */
export class GeopoliticalGpuAnimator {
  private durationMs: number;
  private catalog: StaticGeopoliticalCatalog | null = null;
  private initialized = false;
  private lastTargetSig = '__uninit__';

  private fillNodes = new Map<number, ColorAlphaTweenNode>();
  private territoryIdByFillFid = new Map<number, string>();
  private boundaryNodes = new Map<number, ColorAlphaTweenNode>();
  private cohortNodes = new Map<string, ScalarTweenNode>();

  constructor(durationMs = GEOPOLITICAL_FADE_MS) {
    this.durationMs = clamp(durationMs, 80, 400);
  }

  public bindCatalog(catalog: StaticGeopoliticalCatalog): boolean {
    if (this.catalog && this.catalog.catalogSig === catalog.catalogSig) {
      return false;
    }
    this.catalog = catalog;
    this.initialized = false;
    this.lastTargetSig = '__uninit__';
    this.fillNodes.clear();
    this.territoryIdByFillFid.clear();
    this.boundaryNodes.clear();
    this.cohortNodes.clear();

    for (const f of catalog.demarcatedFillFC.features) {
      const [r, g, b] = parseHexRgb(f.properties.fillColor);
      this.territoryIdByFillFid.set(f.id, f.properties.id);
      this.fillNodes.set(f.id, {
        fid: f.id,
        startAlpha: 0,
        curAlpha: 0,
        targetAlpha: 0,
        startR: r,
        startG: g,
        startB: b,
        curR: r,
        curG: g,
        curB: b,
        targetR: r,
        targetG: g,
        targetB: b,
        tweenStartMs: 0,
        animating: false,
      });
    }

    for (const bFeat of catalog.demarcatedBoundaryFC.features) {
      const [r, g, b] = parseHexRgb(bFeat.properties.borderColor);
      this.boundaryNodes.set(bFeat.id, {
        fid: bFeat.id,
        startAlpha: 0,
        curAlpha: 0,
        targetAlpha: 0,
        startR: r,
        startG: g,
        startB: b,
        curR: r,
        curG: g,
        curB: b,
        targetR: r,
        targetG: g,
        targetB: b,
        tweenStartMs: 0,
        animating: false,
      });
    }

    for (const cohortKey of catalog.unboundedGlazeFidsByCohort.keys()) {
      this.cohortNodes.set(cohortKey, {
        cohortKey,
        startAlpha: 0,
        curAlpha: 0,
        targetAlpha: 0,
        tweenStartMs: 0,
        animating: false,
      });
    }
    for (const cohortKey of catalog.unboundedFieldFidsByCohort.keys()) {
      if (!this.cohortNodes.has(cohortKey)) {
        this.cohortNodes.set(cohortKey, {
          cohortKey,
          startAlpha: 0,
          curAlpha: 0,
          targetAlpha: 0,
          tweenStartMs: 0,
          animating: false,
        });
      }
    }

    return true;
  }

  public syncTarget(
    activePolities: PolityPhase[],
    activeTerritories: ResolvedTerritoryFeature[],
    nowMs: number,
    options: { immediate?: boolean } = {},
  ): { changed: boolean; frame: GeopoliticalGpuFrame } {
    if (!this.catalog) {
      return {
        changed: false,
        frame: { fills: [], boundaries: [], unboundedCohorts: [], isAnimating: false },
      };
    }

    const { targetSig, demarcatedItems, unboundedCohort } = buildGeopoliticalTargetSnapshot(
      activePolities,
      activeTerritories,
    );

    if (this.initialized && targetSig === this.lastTargetSig && !options.immediate) {
      return { changed: false, frame: this.sampleFrame(nowMs) };
    }

    // Advance all currently in-flight nodes to exact `nowMs` before retargeting
    if (this.initialized) {
      this.advanceNodesTo(nowMs);
    }

    const isImmediate = !this.initialized || Boolean(options.immediate);
    this.initialized = true;
    this.lastTargetSig = targetSig;

    // 1. Retarget Demarcated Territory Fills & Dissolved Inland Boundary Variants
    const desiredFillByFid = new Map<number, { alpha: number; rgb: [number, number, number] }>();
    const desiredBoundaryByFid = new Map<
      number,
      { alpha: number; rgb: [number, number, number] }
    >();

    for (const item of demarcatedItems) {
      const fFid = this.catalog.fillFidByTerritoryId.get(item.id);
      if (fFid !== undefined) {
        desiredFillByFid.set(fFid, {
          alpha: item.baseFillOpacity,
          rgb: parseHexRgb(item.fillColor),
        });
      }

      const bKey = computeBoundaryVariantKey(item.id, item.isCore, item.outerBoundary);
      if (bKey) {
        const bFid =
          this.catalog.boundaryFidByBKey.get(bKey) ??
          this.catalog.fallbackBoundaryFidByTerritoryId.get(item.id);
        if (bFid !== undefined) {
          desiredBoundaryByFid.set(bFid, {
            alpha: 1,
            rgb: parseHexRgb(item.borderColor),
          });
        }
      }
    }

    for (const [fid, node] of this.fillNodes.entries()) {
      const desired = desiredFillByFid.get(fid);
      this.retargetColorAlphaNode(
        node,
        desired ? desired.alpha : 0,
        desired ? desired.rgb : null,
        nowMs,
        isImmediate,
      );
    }

    for (const [fid, node] of this.boundaryNodes.entries()) {
      const desired = desiredBoundaryByFid.get(fid);
      this.retargetColorAlphaNode(
        node,
        desired ? desired.alpha : 0,
        desired ? desired.rgb : null,
        nowMs,
        isImmediate,
      );
    }

    // 2. Retarget Unbounded Ancient Civilization Cohorts
    const activeCohortKey = unboundedCohort?.key ?? null;
    for (const [cohortKey, node] of this.cohortNodes.entries()) {
      const nextAlpha = cohortKey === activeCohortKey ? 1 : 0;
      if (isImmediate) {
        node.startAlpha = nextAlpha;
        node.curAlpha = nextAlpha;
        node.targetAlpha = nextAlpha;
        node.animating = false;
      } else if (Math.abs(nextAlpha - node.targetAlpha) > 1e-4) {
        node.startAlpha = node.curAlpha;
        node.targetAlpha = nextAlpha;
        node.tweenStartMs = nowMs;
        node.animating = Math.abs(node.targetAlpha - node.curAlpha) > 1e-4;
      }
    }

    return { changed: true, frame: this.buildFrame() };
  }

  private retargetColorAlphaNode(
    node: ColorAlphaTweenNode,
    nextAlpha: number,
    nextRgb: [number, number, number] | null,
    nowMs: number,
    isImmediate: boolean,
  ): void {
    const effR = nextRgb ? nextRgb[0] : node.curR;
    const effG = nextRgb ? nextRgb[1] : node.curG;
    const effB = nextRgb ? nextRgb[2] : node.curB;

    if (isImmediate) {
      node.startAlpha = nextAlpha;
      node.curAlpha = nextAlpha;
      node.targetAlpha = nextAlpha;
      node.startR = node.curR = node.targetR = effR;
      node.startG = node.curG = node.targetG = effG;
      node.startB = node.curB = node.targetB = effB;
      node.animating = false;
      return;
    }

    const alphaChanged = Math.abs(nextAlpha - node.targetAlpha) > 1e-4;
    const colorChanged =
      nextAlpha > 0 &&
      (Math.abs(effR - node.targetR) >= 1 ||
        Math.abs(effG - node.targetG) >= 1 ||
        Math.abs(effB - node.targetB) >= 1);

    // If this feature's target hasn't changed, let its existing tween continue uninterrupted!
    if (!alphaChanged && !colorChanged) {
      return;
    }

    if (node.curAlpha <= 0.004 && nextAlpha > 0) {
      // Entering from invisible: snap RGB immediately to incoming sovereign color so fade-in is pure
      node.startAlpha = 0;
      node.curAlpha = 0;
      node.targetAlpha = nextAlpha;
      node.startR = node.curR = node.targetR = effR;
      node.startG = node.curG = node.targetG = effG;
      node.startB = node.curB = node.targetB = effB;
      node.tweenStartMs = nowMs;
      node.animating = true;
    } else if (nextAlpha <= 0) {
      // Exiting to 0: preserve current displayed color so fade-out never shifts hue
      node.startAlpha = node.curAlpha;
      node.targetAlpha = 0;
      node.startR = node.targetR = node.curR;
      node.startG = node.targetG = node.curG;
      node.startB = node.targetB = node.curB;
      node.tweenStartMs = nowMs;
      node.animating = node.curAlpha > 0.004;
      if (!node.animating) {
        node.curAlpha = 0;
      }
    } else {
      // Continuing visible territory (regime change or mid-flight reversal): smooth RGB + alpha morph
      node.startAlpha = node.curAlpha;
      node.targetAlpha = nextAlpha;
      node.startR = node.curR;
      node.startG = node.curG;
      node.startB = node.curB;
      node.targetR = effR;
      node.targetG = effG;
      node.targetB = effB;
      node.tweenStartMs = nowMs;
      node.animating =
        Math.abs(node.targetAlpha - node.curAlpha) > 1e-4 ||
        Math.abs(node.targetR - node.curR) >= 0.5 ||
        Math.abs(node.targetG - node.curG) >= 0.5 ||
        Math.abs(node.targetB - node.curB) >= 0.5;
    }
  }

  private advanceNodesTo(nowMs: number): void {
    for (const node of this.fillNodes.values()) {
      if (!node.animating) continue;
      const rawT = clamp((nowMs - node.tweenStartMs) / this.durationMs, 0, 1);
      if (rawT >= 1) {
        node.curAlpha = node.targetAlpha;
        node.curR = node.targetR;
        node.curG = node.targetG;
        node.curB = node.targetB;
        node.animating = false;
      } else {
        const e = smootherstep01(rawT);
        node.curAlpha = node.startAlpha + (node.targetAlpha - node.startAlpha) * e;
        node.curR = node.startR + (node.targetR - node.startR) * e;
        node.curG = node.startG + (node.targetG - node.startG) * e;
        node.curB = node.startB + (node.targetB - node.startB) * e;
      }
    }

    for (const node of this.boundaryNodes.values()) {
      if (!node.animating) continue;
      const rawT = clamp((nowMs - node.tweenStartMs) / this.durationMs, 0, 1);
      if (rawT >= 1) {
        node.curAlpha = node.targetAlpha;
        node.curR = node.targetR;
        node.curG = node.targetG;
        node.curB = node.targetB;
        node.animating = false;
      } else {
        const e = smootherstep01(rawT);
        node.curAlpha = node.startAlpha + (node.targetAlpha - node.startAlpha) * e;
        node.curR = node.startR + (node.targetR - node.startR) * e;
        node.curG = node.startG + (node.targetG - node.startG) * e;
        node.curB = node.startB + (node.targetB - node.startB) * e;
      }
    }

    for (const node of this.cohortNodes.values()) {
      if (!node.animating) continue;
      const rawT = clamp((nowMs - node.tweenStartMs) / this.durationMs, 0, 1);
      if (rawT >= 1) {
        node.curAlpha = node.targetAlpha;
        node.animating = false;
      } else {
        const e = smootherstep01(rawT);
        node.curAlpha = node.startAlpha + (node.targetAlpha - node.startAlpha) * e;
      }
    }
  }

  public sampleFrame(nowMs: number): GeopoliticalGpuFrame {
    this.advanceNodesTo(nowMs);
    return this.buildFrame();
  }

  private buildFrame(): GeopoliticalGpuFrame {
    if (!this.catalog) {
      return { fills: [], boundaries: [], unboundedCohorts: [], isAnimating: false };
    }

    let anyAnimating = false;
    const fills: GpuEvaluatedFillState[] = [];
    for (const [fid, node] of this.fillNodes.entries()) {
      if (node.animating) anyAnimating = true;
      fills.push({
        fid,
        territoryId: this.territoryIdByFillFid.get(fid) ?? '',
        alpha: +node.curAlpha.toFixed(4),
        fillColor: rgbToHex(node.curR, node.curG, node.curB),
      });
    }

    const boundaries: GpuEvaluatedBoundaryState[] = [];
    for (const [fid, node] of this.boundaryNodes.entries()) {
      if (node.animating) anyAnimating = true;
      boundaries.push({
        fid,
        alpha: +node.curAlpha.toFixed(4),
        borderColor: rgbToHex(node.curR, node.curG, node.curB),
      });
    }

    const unboundedCohorts: GpuEvaluatedCohortState[] = [];
    for (const [cohortKey, node] of this.cohortNodes.entries()) {
      if (node.animating) anyAnimating = true;
      unboundedCohorts.push({
        cohortKey,
        glazeFids: this.catalog.unboundedGlazeFidsByCohort.get(cohortKey) ?? [],
        fieldFids: this.catalog.unboundedFieldFidsByCohort.get(cohortKey) ?? [],
        alpha: +node.curAlpha.toFixed(4),
      });
    }

    return { fills, boundaries, unboundedCohorts, isAnimating: anyAnimating };
  }
}

