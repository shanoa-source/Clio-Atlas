import { isPointOnMediterraneanLand } from '../three/earthGeoData';
import {
  GeoJsonMultiPolygon,
  PolityPhase,
  ResolvedTerritoryFeature,
  ThermalSubZone,
} from '../types/history';
import { clamp, resolvePolityForTerritory } from './geoMath';

export type UnboundedZoneTier = 'core' | 'influence' | 'falloff';

export interface UnboundedFieldShell {
  id: string;
  polityId: string;
  tier: UnboundedZoneTier;
  color: string;
  fillOpacity: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  ring: [number, number][];
}

export interface UnboundedGlazeParcel {
  id: string;
  polityId: string;
  nameZh: string;
  tier: ResolvedTerritoryFeature['tier'];
  isCoreZone: boolean;
  fillColor: string;
  fillOpacity: number;
  geometry: GeoJsonMultiPolygon;
  outerBoundary: ResolvedTerritoryFeature['outerBoundary'];
}

export interface UnboundedPolityFieldResult {
  shells: UnboundedFieldShell[];
  glazeParcels: UnboundedGlazeParcel[];
}

interface IndexedSubPolygon {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  exterior: [number, number][];
  holes: [number, number][][];
}

const multiPolygonIndexMemo = new WeakMap<GeoJsonMultiPolygon, IndexedSubPolygon[]>();

let lastFieldCacheSig = '';
let lastFieldCacheResult: UnboundedPolityFieldResult | null = null;

/**
 * Concentric radial stops (ordered outer -> inner) for Radiating Influence & Frontier Falloff.
 * Fine sub-quantization alpha increments (`0.012..0.030`) rasterize into MapLibre's draped globe
 * tiles with `'fill-antialias': false` underneath CARTO `water`, yielding a silky band-free
 * continental decay (`Alpha -> 0`) with 0% ocean spillover and 0 extra per-frame GPU passes.
 */
const INFLUENCE_SHELL_STOPS: ReadonlyArray<{
  rScale: number;
  alpha: number;
  tier: UnboundedZoneTier;
  organicAmp: number;
}> = [
  { rScale: 1.58, alpha: 0.012, tier: 'falloff', organicAmp: 1.0 },
  { rScale: 1.44, alpha: 0.015, tier: 'falloff', organicAmp: 0.96 },
  { rScale: 1.30, alpha: 0.018, tier: 'falloff', organicAmp: 0.92 },
  { rScale: 1.17, alpha: 0.022, tier: 'falloff', organicAmp: 0.88 },
  { rScale: 1.05, alpha: 0.025, tier: 'falloff', organicAmp: 0.84 },
  { rScale: 0.94, alpha: 0.027, tier: 'influence', organicAmp: 0.80 },
  { rScale: 0.83, alpha: 0.029, tier: 'influence', organicAmp: 0.76 },
  { rScale: 0.72, alpha: 0.030, tier: 'influence', organicAmp: 0.72 },
  { rScale: 0.62, alpha: 0.030, tier: 'influence', organicAmp: 0.68 },
  { rScale: 0.52, alpha: 0.030, tier: 'influence', organicAmp: 0.64 },
  { rScale: 0.42, alpha: 0.028, tier: 'influence', organicAmp: 0.60 },
  { rScale: 0.32, alpha: 0.026, tier: 'influence', organicAmp: 0.55 },
  { rScale: 0.23, alpha: 0.024, tier: 'influence', organicAmp: 0.50 },
  { rScale: 0.14, alpha: 0.020, tier: 'influence', organicAmp: 0.45 },
];

/**
 * Concentric radial stops (ordered outer -> inner) for Core Administrative & Settlement Zones:
 * - Outer 4 stops (`rScale: 1.38..0.94`): Soft Edge feathered transition into the Influence belt.
 * - Inner 8 stops (`rScale: 0.82..0.11`): Condensed palatial/urban heartland reaching `0.60–0.85`.
 */
const CORE_SHELL_STOPS: ReadonlyArray<{
  rScale: number;
  alpha: number;
  tier: UnboundedZoneTier;
  organicAmp: number;
  tintLift: number;
}> = [
  { rScale: 1.38, alpha: 0.022, tier: 'influence', organicAmp: 0.82, tintLift: 0 },
  { rScale: 1.22, alpha: 0.032, tier: 'influence', organicAmp: 0.78, tintLift: 0 },
  { rScale: 1.07, alpha: 0.045, tier: 'influence', organicAmp: 0.74, tintLift: 0 },
  { rScale: 0.94, alpha: 0.062, tier: 'influence', organicAmp: 0.68, tintLift: 0 },
  { rScale: 0.82, alpha: 0.082, tier: 'core', organicAmp: 0.62, tintLift: 0.02 },
  { rScale: 0.70, alpha: 0.095, tier: 'core', organicAmp: 0.58, tintLift: 0.04 },
  { rScale: 0.59, alpha: 0.105, tier: 'core', organicAmp: 0.54, tintLift: 0.06 },
  { rScale: 0.48, alpha: 0.110, tier: 'core', organicAmp: 0.50, tintLift: 0.08 },
  { rScale: 0.38, alpha: 0.110, tier: 'core', organicAmp: 0.46, tintLift: 0.10 },
  { rScale: 0.28, alpha: 0.105, tier: 'core', organicAmp: 0.42, tintLift: 0.12 },
  { rScale: 0.19, alpha: 0.095, tier: 'core', organicAmp: 0.38, tintLift: 0.14 },
  { rScale: 0.11, alpha: 0.080, tier: 'core', organicAmp: 0.34, tintLift: 0.16 },
];

/**
 * Returns true strictly for ancient civilizations / polities without fixed surveyed national borders.
 * Demarcated states (`boundaryMode === 'demarcated'` or omitted default) return false and retain
 * classic sovereign choropleth + border rendering.
 */
export function isUnboundedPolity(polity: PolityPhase | null | undefined): boolean {
  return polity?.boundaryMode === 'unbounded';
}

function getIndexedMultiPolygon(mp: GeoJsonMultiPolygon): IndexedSubPolygon[] {
  const cached = multiPolygonIndexMemo.get(mp);
  if (cached) return cached;

  const indexed: IndexedSubPolygon[] = [];
  for (let i = 0; i < mp.coordinates.length; i++) {
    const poly = mp.coordinates[i];
    const ext = poly[0];
    if (!ext || ext.length < 4) continue;
    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (let k = 0; k < ext.length; k++) {
      const [x, y] = ext[k];
      if (x < minLon) minLon = x;
      if (y < minLat) minLat = y;
      if (x > maxLon) maxLon = x;
      if (y > maxLat) maxLat = y;
    }
    indexed.push({
      minLon,
      minLat,
      maxLon,
      maxLat,
      exterior: ext,
      holes: poly.slice(1),
    });
  }
  multiPolygonIndexMemo.set(mp, indexed);
  return indexed;
}

function pointInRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointInMultiPolygon(lon: number, lat: number, mp: GeoJsonMultiPolygon): boolean {
  const indexed = getIndexedMultiPolygon(mp);
  for (let i = 0; i < indexed.length; i++) {
    const sub = indexed[i];
    if (lon < sub.minLon || lon > sub.maxLon || lat < sub.minLat || lat > sub.maxLat) continue;
    if (pointInRing(lon, lat, sub.exterior)) {
      let inHole = false;
      for (let h = 0; h < sub.holes.length; h++) {
        if (pointInRing(lon, lat, sub.holes[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

function isPointOnContinentalOrPolityLand(
  lon: number,
  lat: number,
  territories: ResolvedTerritoryFeature[],
): boolean {
  for (let i = 0; i < territories.length; i++) {
    const t = territories[i];
    const bb = t.approxBBox;
    if (
      (!bb ||
        (lon >= bb.minLon - 0.05 &&
          lon <= bb.maxLon + 0.05 &&
          lat >= bb.minLat - 0.05 &&
          lat <= bb.maxLat + 0.05)) &&
      pointInMultiPolygon(lon, lat, t.geometry)
    ) {
      return true;
    }
  }
  return isPointOnMediterraneanLand(lon, lat);
}

function deriveFallbackZonesFromTerritories(
  polity: PolityPhase,
  ownedTerritories: ResolvedTerritoryFeature[],
): { coreZones: ThermalSubZone[]; influenceZones: ThermalSubZone[] } {
  const coreZones: ThermalSubZone[] = [];
  const influenceZones: ThermalSubZone[] = [];

  for (const t of ownedTerritories) {
    if (!t.approxBBox) continue;
    const cLon = (t.approxBBox.minLon + t.approxBBox.maxLon) * 0.5;
    const cLat = (t.approxBBox.minLat + t.approxBBox.maxLat) * 0.5;
    const spanLon = Math.max(0.28, (t.approxBBox.maxLon - t.approxBBox.minLon) * 0.45);
    const spanLat = Math.max(0.24, (t.approxBBox.maxLat - t.approxBBox.minLat) * 0.45);
    if (t.tier === 'metropolis' || t.tier === 'cleruchy') {
      coreZones.push({
        coords: [cLon, cLat],
        radiusLon: spanLon,
        radiusLat: spanLat,
        weightFactor: t.tier === 'metropolis' ? 1.0 : 0.86,
      });
      influenceZones.push({
        coords: [cLon, cLat],
        radiusLon: spanLon * 1.95,
        radiusLat: spanLat * 1.95,
        weightFactor: 0.72,
      });
    } else {
      influenceZones.push({
        coords: [cLon, cLat],
        radiusLon: spanLon * 1.35,
        radiusLat: spanLat * 1.35,
        weightFactor: 0.85,
      });
    }
  }

  if (coreZones.length === 0) {
    const [capLon, capLat] = polity.capitalCoords;
    coreZones.push({
      coords: [capLon, capLat],
      radiusLon: 0.85,
      radiusLat: 0.72,
      weightFactor: 1.0,
    });
  }

  if (influenceZones.length === 0) {
    for (const cz of coreZones) {
      influenceZones.push({
        coords: [cz.coords[0], cz.coords[1]],
        radiusLon: cz.radiusLon * 2.25,
        radiusLat: cz.radiusLat * 2.25,
        weightFactor: 0.82,
      });
    }
  }

  return { coreZones, influenceZones };
}

function parseHexToRgb(hex: string): [number, number, number] {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16) || 217,
      parseInt(clean[1] + clean[1], 16) || 119,
      parseInt(clean[2] + clean[2], 16) || 6,
    ];
  }
  if (clean.length >= 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 217,
      parseInt(clean.slice(2, 4), 16) || 119,
      parseInt(clean.slice(4, 6), 16) || 6,
    ];
  }
  return [217, 119, 6];
}

function liftHexLuminance(hex: string, liftFactor: number): string {
  if (liftFactor <= 0.001) return hex;
  const [r, g, b] = parseHexToRgb(hex);
  const f = clamp(liftFactor, 0, 0.35);
  const nr = Math.min(255, Math.round(r + (255 - r) * f));
  const ng = Math.min(255, Math.round(g + (255 - g) * f));
  const nb = Math.min(255, Math.round(b + (255 - b) * f));
  return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb
    .toString(16)
    .padStart(2, '0')}`;
}

function buildOrganicEllipticalRing(
  centerLon: number,
  centerLat: number,
  rLon: number,
  rLat: number,
  organicAmp: number,
  phaseSeed: number,
  segments = 36,
): {
  ring: [number, number][];
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
} {
  const ring: [number, number][] = [];
  const p1 = phaseSeed;
  const p2 = phaseSeed * 1.73 + 1.15;
  const p3 = phaseSeed * 2.41 + 2.62;

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    const mod =
      1 +
      organicAmp *
        (0.062 * Math.sin(2 * theta + p1) +
          0.038 * Math.cos(3 * theta + p2) +
          0.022 * Math.sin(5 * theta + p3));
    const lon = +(centerLon + Math.cos(theta) * rLon * mod).toFixed(4);
    const lat = +clamp(centerLat + Math.sin(theta) * rLat * mod, -84, 84).toFixed(4);
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
    ring.push([lon, lat]);
  }
  ring.push([ring[0][0], ring[0][1]]);

  return { ring, minLon, minLat, maxLon, maxLat };
}

/**
 * O(1) mathematical hit-test for unbounded ancient civilization spheres (avoids WebGL
 * `queryRenderedFeatures` overhead across concentric shells during mousemove/click).
 */
export function hitTestUnboundedPolityAtLngLat(
  lon: number,
  lat: number,
  activePolities: PolityPhase[],
  activeTerritories: ResolvedTerritoryFeature[],
): PolityPhase | null {
  const unbounded = activePolities.filter((p) => isUnboundedPolity(p));
  if (unbounded.length === 0) return null;

  for (const polity of unbounded) {
    const owned = activeTerritories.filter(
      (t) => resolvePolityForTerritory(t, activePolities)?.id === polity.id,
    );
    const fallback = deriveFallbackZonesFromTerritories(polity, owned);
    const coreZones =
      polity.coreZones && polity.coreZones.length > 0 ? polity.coreZones : fallback.coreZones;
    const influenceZones =
      polity.influenceZones && polity.influenceZones.length > 0
        ? polity.influenceZones
        : fallback.influenceZones;

    let inEnvelope = false;
    for (let i = 0; i < coreZones.length; i++) {
      const cz = coreZones[i];
      const dx = (lon - cz.coords[0]) / Math.max(0.15, cz.radiusLon * 1.4);
      const dy = (lat - cz.coords[1]) / Math.max(0.15, cz.radiusLat * 1.4);
      if (dx * dx + dy * dy <= 1.0) {
        inEnvelope = true;
        break;
      }
    }
    if (!inEnvelope) {
      for (let i = 0; i < influenceZones.length; i++) {
        const iz = influenceZones[i];
        const dx = (lon - iz.coords[0]) / Math.max(0.2, iz.radiusLon * 1.32);
        const dy = (lat - iz.coords[1]) / Math.max(0.2, iz.radiusLat * 1.32);
        if (dx * dx + dy * dy <= 1.0) {
          inEnvelope = true;
          break;
        }
      }
    }

    if (inEnvelope && isPointOnContinentalOrPolityLand(lon, lat, owned)) {
      return polity;
    }
  }
  return null;
}

const EMPTY_FIELD_RESULT: UnboundedPolityFieldResult = {
  shells: [],
  glazeParcels: [],
};

/**
 * Generates draped concentric organic polygon shells + land parcel glazes exclusively for
 * borderless ancient civilizations (`boundaryMode === 'unbounded'`), with signature memoization
 * so timeline scrubbing across an unbounded era runs in O(1) (~0.001ms per year tick):
 *
 * 1. Core Zone (`tier: 'core'`): Rich `representativeColor`, composite opacity `0.60–0.85`
 *    with soft feathered outer edge (`Soft Edge`).
 * 2. Influence Zone (`tier: 'influence'`): Tributary / patrol / trade radiation belt covering a
 *    significantly larger continental footprint at lower base opacity (`0.20–0.40`).
 * 3. Frontier Falloff (`tier: 'falloff'`): Smooth radial gradient decay (`Alpha -> 0`) into dark
 *    Terra Nullius with zero hard outer boundary stroke and **zero** ocean spillover (rendered
 *    as draped `type: 'fill'` polygons strictly underneath CARTO `water`).
 */
export function computeUnboundedPolityField(
  activePolities: PolityPhase[],
  activeTerritories: ResolvedTerritoryFeature[],
  options: { opacityScale?: number } = {},
): UnboundedPolityFieldResult {
  const unboundedPolities = activePolities.filter((p) => isUnboundedPolity(p));
  if (unboundedPolities.length === 0) {
    return EMPTY_FIELD_RESULT;
  }

  const opacityScale = clamp(options.opacityScale ?? 1.0, 0.15, 1.25);
  const sig = `${unboundedPolities.map((p) => `${p.id}:${p.representativeColor}`).join(',')}|${activeTerritories
    .map((t) => t.id)
    .join(',')}|${opacityScale.toFixed(3)}`;

  if (sig === lastFieldCacheSig && lastFieldCacheResult) {
    return lastFieldCacheResult;
  }

  const shells: UnboundedFieldShell[] = [];
  const glazeParcels: UnboundedGlazeParcel[] = [];

  for (const polity of unboundedPolities) {
    const ownedTerritories = activeTerritories.filter((t) => {
      const owner = resolvePolityForTerritory(t, activePolities);
      return owner?.id === polity.id;
    });

    // Subtle land parcel glazes anchored to island & regional landmasses (strictly clipped by `water`)
    for (const t of ownedTerritories) {
      const isCore = t.tier === 'metropolis' || t.tier === 'cleruchy';
      glazeParcels.push({
        id: t.id,
        polityId: polity.id,
        nameZh: t.nameZh,
        tier: t.tier,
        isCoreZone: isCore,
        fillColor: polity.representativeColor,
        fillOpacity: +((isCore ? 0.10 : 0.045) * opacityScale).toFixed(3),
        geometry: t.geometry,
        outerBoundary: t.outerBoundary,
      });
    }

    const fallback = deriveFallbackZonesFromTerritories(polity, ownedTerritories);
    const coreZones =
      polity.coreZones && polity.coreZones.length > 0 ? polity.coreZones : fallback.coreZones;
    const influenceZones =
      polity.influenceZones && polity.influenceZones.length > 0
        ? polity.influenceZones
        : fallback.influenceZones;

    let seq = 0;

    // Pass 1 (Bottom of draped stack): Frontier Falloff -> Radiating Influence Activity Zone (`0.20 ~ 0.40`)
    for (let zIdx = 0; zIdx < influenceZones.length; zIdx++) {
      const iz = influenceZones[zIdx];
      const [iLon, iLat] = iz.coords;
      const w = clamp(iz.weightFactor ?? 0.85, 0.25, 1.0);
      const baseRLon = Math.max(0.22, iz.radiusLon);
      const baseRLat = Math.max(0.18, iz.radiusLat);
      const phaseSeed = (iLon * 12.9898 + iLat * 78.233 + zIdx * 1.91) % (Math.PI * 2);

      for (let sIdx = 0; sIdx < INFLUENCE_SHELL_STOPS.length; sIdx++) {
        const stop = INFLUENCE_SHELL_STOPS[sIdx];
        const fillOpacity = +clamp(stop.alpha * w * opacityScale, 0.004, 0.25).toFixed(4);
        const built = buildOrganicEllipticalRing(
          iLon,
          iLat,
          baseRLon * stop.rScale,
          baseRLat * stop.rScale,
          stop.organicAmp,
          phaseSeed,
          36,
        );
        shells.push({
          id: `${polity.id}_${stop.tier}_${seq++}`,
          polityId: polity.id,
          tier: stop.tier,
          color: polity.representativeColor,
          fillOpacity,
          minLon: built.minLon,
          minLat: built.minLat,
          maxLon: built.maxLon,
          maxLat: built.maxLat,
          ring: built.ring,
        });
      }
    }

    // Pass 2 (Top of unbounded stack, still strictly beneath `water`): Core Administrative Zone (`0.60 ~ 0.85` + Soft Edge)
    for (let zIdx = 0; zIdx < coreZones.length; zIdx++) {
      const cz = coreZones[zIdx];
      const [cLon, cLat] = cz.coords;
      const w = clamp(cz.weightFactor ?? 1.0, 0.35, 1.0);
      const baseRLon = Math.max(0.18, cz.radiusLon);
      const baseRLat = Math.max(0.15, cz.radiusLat);
      const phaseSeed = (cLon * 19.19 + cLat * 47.77 + zIdx * 2.37) % (Math.PI * 2);

      for (let sIdx = 0; sIdx < CORE_SHELL_STOPS.length; sIdx++) {
        const stop = CORE_SHELL_STOPS[sIdx];
        const fillOpacity = +clamp(stop.alpha * w * opacityScale, 0.005, 0.35).toFixed(4);
        const built = buildOrganicEllipticalRing(
          cLon,
          cLat,
          baseRLon * stop.rScale,
          baseRLat * stop.rScale,
          stop.organicAmp,
          phaseSeed,
          36,
        );
        shells.push({
          id: `${polity.id}_${stop.tier}_${seq++}`,
          polityId: polity.id,
          tier: stop.tier,
          color: liftHexLuminance(polity.representativeColor, stop.tintLift),
          fillOpacity,
          minLon: built.minLon,
          minLat: built.minLat,
          maxLon: built.maxLon,
          maxLat: built.maxLat,
          ring: built.ring,
        });
      }
    }
  }

  const result: UnboundedPolityFieldResult = { shells, glazeParcels };
  lastFieldCacheSig = sig;
  lastFieldCacheResult = result;
  return result;
}

/**
 * Exact continental alpha evaluator at `(lon, lat)` matching MapLibre's draped `type: 'fill'`
 * compositing underneath CARTO's `#090d16` / `#04060b` ocean vector mask:
 * - Ocean / sea / gulf (`!isPointOnContinentalOrPolityLand`) -> exact `0`.
 * - Landmass -> standard source-over alpha compositing across `glazeParcels` + `shells` containing `(lon, lat)`.
 */
export function evaluateUnboundedFieldAlpha(
  field: UnboundedPolityFieldResult,
  polityId: string,
  lon: number,
  lat: number,
  ownedTerritories: ResolvedTerritoryFeature[] = [],
): number {
  if (!isPointOnContinentalOrPolityLand(lon, lat, ownedTerritories)) {
    return 0;
  }

  let transmittance = 1.0;

  for (let i = 0; i < field.glazeParcels.length; i++) {
    const parcel = field.glazeParcels[i];
    if (parcel.polityId !== polityId) continue;
    if (pointInMultiPolygon(lon, lat, parcel.geometry)) {
      transmittance *= 1 - parcel.fillOpacity;
    }
  }

  for (let i = 0; i < field.shells.length; i++) {
    const sh = field.shells[i];
    if (sh.polityId !== polityId) continue;
    if (lon < sh.minLon || lon > sh.maxLon || lat < sh.minLat || lat > sh.maxLat) continue;
    if (pointInRing(lon, lat, sh.ring)) {
      transmittance *= 1 - sh.fillOpacity;
    }
  }

  return +(1 - transmittance).toFixed(4);
}
