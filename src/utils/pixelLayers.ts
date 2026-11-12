import { ATHENS_MORTALITY_CATASTROPHES } from '../data/athensClassicalData';
import { ThermalSubZone, TimeRangeSelection } from '../types/history';
import {
  clamp,
  createSeededRandom,
  deathsToMortalityMagnitude,
  densityToPopulationMagnitude,
  getActiveMortalityCatastrophesWithFade,
  getActiveNightLights,
  getActivePopulationNodes,
} from './geoMath';

export interface GeoPixelPoint {
  lon: number;
  lat: number;
  r: number; // 0..1
  g: number; // 0..1
  b: number; // 0..1
  hex: string;
  sizePx: number;
}

export interface ThermalControlPoint {
  lon: number;
  lat: number;
  /** Weighted intensity fed into MapLibre native GPU `heatmap-weight` */
  weight: number;
  /** Canonical concentric gradient ring tier */
  tier: 'core' | 'mid' | 'outer';
  tierBaseWeight: 1.0 | 0.6 | 0.25;
  /** Optional parent event / region ID for real-time fade tracking */
  sourceId?: string;
}

interface EmitterOffsetTemplate {
  dLonNorm: number;
  dLatNorm: number;
  tier: 'core' | 'mid' | 'outer';
  tierBaseWeight: 1.0 | 0.6 | 0.25;
}

const cachedEmitterTemplates = new Map<string, EmitterOffsetTemplate[]>();

function hashStringSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Generates a deterministic, non-circular multi-ring thermal emitter constellation for a sub-zone:
 * - Core (`weight: 1.0`): dense central cluster forming a continuous deep-temperature heart
 * - Mid ring (`weight: 0.6`): organically modulated intermediate thermal contour
 * - Outer ring (`weight: 0.25`): broad low-temperature periphery ensuring silky falloff without discrete dots
 */
function getOrCreateZoneTemplate(seedKey: string): EmitterOffsetTemplate[] {
  const existing = cachedEmitterTemplates.get(seedKey);
  if (existing) return existing;

  const rand = createSeededRandom(hashStringSeed(seedKey));
  const phaseA = rand() * Math.PI * 2;
  const phaseB = rand() * Math.PI * 2;
  const stretchAngle = rand() * Math.PI;
  const cosS = Math.cos(stretchAngle);
  const sinS = Math.sin(stretchAngle);

  const applyOrganicAnisotropy = (nx: number, ny: number): [number, number] => {
    const rx = nx * cosS - ny * sinS;
    const ry = nx * sinS + ny * cosS;
    const sx = rx * 1.15;
    const sy = ry * 0.88;
    return [sx * cosS + sy * sinS, -sx * sinS + sy * cosS];
  };

  const out: EmitterOffsetTemplate[] = [];

  // 1. Center & inner core spine (tier: 'core', base weight 1.0)
  out.push({
    dLonNorm: (rand() - 0.5) * 0.05,
    dLatNorm: (rand() - 0.5) * 0.05,
    tier: 'core',
    tierBaseWeight: 1.0,
  });

  const coreCount = 6;
  for (let i = 0; i < coreCount; i++) {
    const theta = (i / coreCount) * Math.PI * 2 + (rand() - 0.5) * 0.32;
    const r = (0.22 + rand() * 0.1) * (1 + 0.14 * Math.sin(2 * theta + phaseA));
    const [dx, dy] = applyOrganicAnisotropy(Math.cos(theta) * r, Math.sin(theta) * r);
    out.push({
      dLonNorm: dx,
      dLatNorm: dy,
      tier: 'core',
      tierBaseWeight: 1.0,
    });
  }

  // 2. Mid thermal contour ring (tier: 'mid', base weight 0.6)
  const midCount = 10;
  for (let i = 0; i < midCount; i++) {
    const theta = (i / midCount) * Math.PI * 2 + (rand() - 0.5) * 0.26;
    const harmonic = 1 + 0.18 * Math.sin(3 * theta + phaseA) + 0.1 * Math.cos(2 * theta + phaseB);
    const r = (0.52 + rand() * 0.12) * harmonic;
    const [dx, dy] = applyOrganicAnisotropy(Math.cos(theta) * r, Math.sin(theta) * r);
    out.push({
      dLonNorm: dx,
      dLatNorm: dy,
      tier: 'mid',
      tierBaseWeight: 0.6,
    });
  }

  // 3. Outer thermal dissipation fringe (tier: 'outer', base weight 0.25)
  const outerCount = 14;
  for (let i = 0; i < outerCount; i++) {
    const theta = (i / outerCount) * Math.PI * 2 + (rand() - 0.5) * 0.22;
    const harmonic = 1 + 0.2 * Math.sin(3 * theta + phaseB) + 0.12 * Math.cos(4 * theta + phaseA);
    const r = (0.86 + rand() * 0.16) * harmonic;
    const [dx, dy] = applyOrganicAnisotropy(Math.cos(theta) * r, Math.sin(theta) * r);
    out.push({
      dLonNorm: dx,
      dLatNorm: dy,
      tier: 'outer',
      tierBaseWeight: 0.25,
    });
  }

  cachedEmitterTemplates.set(seedKey, out);
  return out;
}

/**
 * Normalizes weights across closely spaced sibling sub-zones (e.g., Athens-Long Walls-Piraeus corridor)
 * so that peak GPU `heatmap-density` strictly reflects the quantitative target magnitude (deaths or persons/km²)
 * rather than inflating when multiple sub-zones overlap geographically.
 */
function emitQuantitativeSubZones(
  parentId: string,
  subZones: ThermalSubZone[],
  targetMagnitude: number,
  out: ThermalControlPoint[],
  sigmaDeg = 0.088,
): void {
  const twoSigmaSq = 2 * sigmaDeg * sigmaDeg;

  for (let zIdx = 0; zIdx < subZones.length; zIdx++) {
    const z = subZones[zIdx];
    const template = getOrCreateZoneTemplate(`${parentId}_sub_${zIdx}`);

    // Compute local Gaussian overlap from sibling sub-zones within the same event/region
    let overlapSum = 1.0;
    const selfFactor = z.weightFactor ?? 1.0;
    for (let otherIdx = 0; otherIdx < subZones.length; otherIdx++) {
      if (otherIdx === zIdx) continue;
      const oz = subZones[otherIdx];
      const dLon = (z.coords[0] - oz.coords[0]) * 0.8;
      const dLat = z.coords[1] - oz.coords[1];
      const distSq = dLon * dLon + dLat * dLat;
      const otherFactor = (oz.weightFactor ?? 1.0) / Math.max(0.25, selfFactor);
      overlapSum += otherFactor * Math.exp(-distSq / twoSigmaSq);
    }

    const overlapNorm = 1 / clamp(overlapSum, 1.0, 2.8);
    const localScale = clamp(targetMagnitude * selfFactor * overlapNorm, 0.02, 1.0);

    for (let i = 0; i < template.length; i++) {
      const tpl = template[i];
      out.push({
        lon: z.coords[0] + tpl.dLonNorm * z.radiusLon,
        lat: z.coords[1] + tpl.dLatNorm * z.radiusLat,
        weight: +(tpl.tierBaseWeight * localScale).toFixed(4),
        tier: tpl.tier,
        tierBaseWeight: tpl.tierBaseWeight,
        sourceId: parentId,
      });
    }
  }
}

/**
 * 人口密度连续热成像控制点场（与具体人口密度 15–160+ 人/km² 严格定量挂钩，海岸线 100% 截断）
 */
export function computePopulationThermalPoints(year: number): ThermalControlPoint[] {
  const active = getActivePopulationNodes(year);
  if (active.length === 0) return [];

  const out: ThermalControlPoint[] = [];
  for (const { node, density } of active) {
    const densityMagnitude = densityToPopulationMagnitude(density);
    const zones: ThermalSubZone[] =
      node.thermalSubZones && node.thermalSubZones.length > 0
        ? node.thermalSubZones
        : [
            {
              coords: node.center,
              radiusLon: node.radiusDegLon,
              radiusLat: node.radiusDegLat,
              weightFactor: 1.0,
            },
          ];

    emitQuantitativeSubZones(node.id, zones, densityMagnitude, out, 0.095);
  }
  return out;
}

/**
 * 死亡浩劫连续红外热成像控制点场：
 * - 颜色深浅严格对应具体伤亡规模：如马拉松会战 6,600 人严格落在浅红色阶（~0.23），薛西斯侵希战争 78,000 人与雅典大瘟疫 88,000 人直达浓郁深红色阶（0.95–1.0）。
 * - 支持事件开始淡入与结束后平滑淡出包络（`envelopeOverrideById` 可传入实时帧动画插值权重），在时间段选取模式下常驻不消失。
 */
export function computeMortalityThermalPoints(
  year: number,
  selectedRange: TimeRangeSelection = null,
  envelopeOverrideById?: ReadonlyMap<string, number>,
): ThermalControlPoint[] {
  const activeWithFade = getActiveMortalityCatastrophesWithFade(year, selectedRange);
  const out: ThermalControlPoint[] = [];

  if (envelopeOverrideById && envelopeOverrideById.size > 0) {
    for (const ev of ATHENS_MORTALITY_CATASTROPHES) {
      const animEnv = envelopeOverrideById.get(ev.id) ?? 0;
      if (animEnv <= 0.01) continue;
      const baseMag = deathsToMortalityMagnitude(ev.estimatedDeaths);
      const effectiveMagnitude = baseMag * clamp(animEnv, 0, 1);
      const zones: ThermalSubZone[] =
        ev.thermalSubZones && ev.thermalSubZones.length > 0
          ? ev.thermalSubZones
          : [
              {
                coords: ev.coords,
                radiusLon: ev.spreadDeg * 1.1,
                radiusLat: ev.spreadDeg,
                weightFactor: 1.0,
              },
            ];
      emitQuantitativeSubZones(ev.id, zones, effectiveMagnitude, out, 0.088);
    }
    return out;
  }

  if (activeWithFade.length === 0) return [];

  for (const { catastrophe: ev, envelope } of activeWithFade) {
    const baseMagnitude = deathsToMortalityMagnitude(ev.estimatedDeaths);
    const effectiveMagnitude = baseMagnitude * envelope;
    if (effectiveMagnitude <= 0.01) continue;

    const zones: ThermalSubZone[] =
      ev.thermalSubZones && ev.thermalSubZones.length > 0
        ? ev.thermalSubZones
        : [
            {
              coords: ev.coords,
              radiusLon: ev.spreadDeg * 1.1,
              radiusLat: ev.spreadDeg,
              weightFactor: 1.0,
            },
          ];

    emitQuantitativeSubZones(ev.id, zones, effectiveMagnitude, out, 0.088);
  }
  return out;
}

/**
 * 夜晚光照连续热辐射场（逻辑与人口密度及聚落/工矿分布一致，渲染于 `#04060b` 暗夜海洋遮罩正下方）：
 * - 基础光强由各区域人口密度分布驱动（高密城邦核心区最亮、低密边疆与岛屿微弱琥珀光）；
 * - 叠加劳里厄姆昼夜冶银炉群、比雷埃夫斯军港夜航灯塔、苏尼翁角与赫勒斯滂引航火标等特种夜间光源。
 */
export function computeNightLightThermalPoints(year: number): ThermalControlPoint[] {
  const activePop = getActivePopulationNodes(year);
  const activeBeacons = getActiveNightLights(year);
  if (activePop.length === 0 && activeBeacons.length === 0) return [];

  const out: ThermalControlPoint[] = [];

  // 1. Settlement nighttime radiance mirroring population density & urban/insular distribution
  for (const { node, density } of activePop) {
    const popLuminance = clamp(0.14 + 0.82 * ((density - 12) / 150), 0.14, 0.96);
    const zones: ThermalSubZone[] =
      node.thermalSubZones && node.thermalSubZones.length > 0
        ? node.thermalSubZones
        : [
            {
              coords: node.center,
              radiusLon: node.radiusDegLon,
              radiusLat: node.radiusDegLat,
              weightFactor: 1.0,
            },
          ];

    emitQuantitativeSubZones(`night_pop_${node.id}`, zones, popLuminance, out, 0.092);
  }

  // 2. Specialized nocturnal industrial furnaces, sanctuary flames & harbor beacons
  for (const { node, intensity } of activeBeacons) {
    const beaconZone: ThermalSubZone[] = [
      {
        coords: node.coords,
        radiusLon: Math.max(0.055, node.spreadDeg * 0.52),
        radiusLat: Math.max(0.048, node.spreadDeg * 0.45),
        weightFactor: 1.0,
      },
    ];
    emitQuantitativeSubZones(
      `night_beacon_${node.id}`,
      beaconZone,
      clamp(intensity * 0.55, 0.1, 0.6),
      out,
      0.075,
    );
  }

  return out;
}

/**
 * 夜间核心聚落与海岬灯标高光星点（叠加在连续夜间光场之上，呈现真实城池街巷与港口灯火质感）
 */
export function computeNightLightPixels(year: number): GeoPixelPoint[] {
  const activePop = getActivePopulationNodes(year);
  const activeBeacons = getActiveNightLights(year);
  if (activePop.length === 0 && activeBeacons.length === 0) return [];

  const out: GeoPixelPoint[] = [];

  // Emit fine settlement lamp pinpoints proportional to population density sub-zones
  for (const { node, density } of activePop) {
    const normDensity = clamp((density - 12) / 150, 0.08, 1.0);
    const zones =
      node.thermalSubZones && node.thermalSubZones.length > 0
        ? node.thermalSubZones
        : [{ coords: node.center, radiusLon: node.radiusDegLon, radiusLat: node.radiusDegLat, weightFactor: 1.0 }];

    for (let zIdx = 0; zIdx < zones.length; zIdx++) {
      const z = zones[zIdx];
      const rand = createSeededRandom(hashStringSeed(`lamp_${node.id}_${zIdx}`));
      const count = Math.max(3, Math.round((4 + normDensity * 18) * (z.weightFactor ?? 1.0)));
      for (let i = 0; i < count; i++) {
        const ang = rand() * Math.PI * 2;
        const rad = Math.pow(rand(), 1.65) * 0.58;
        const lon = z.coords[0] + Math.cos(ang) * rad * z.radiusLon;
        const lat = z.coords[1] + Math.sin(ang) * rad * z.radiusLat;
        const core = clamp((1 - rad / 0.6) * normDensity, 0.12, 1);

        const r = 255;
        const g = Math.round(172 + core * 74);
        const b = Math.round(58 + core * 148);
        const hex = `#${r.toString(16).padStart(2, '0')}${g
          .toString(16)
          .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

        out.push({
          lon,
          lat,
          r: r / 255,
          g: g / 255,
          b: b / 255,
          hex,
          sizePx: 1.8 + core * 2.6,
        });
      }
    }
  }

  // Emit harbor navigation beacons & Laurion furnace cores
  for (const { node, intensity } of activeBeacons) {
    const rand = createSeededRandom(hashStringSeed(node.id));
    const count = Math.round(5 + intensity * 12);
    for (let i = 0; i < count; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = Math.pow(rand(), 1.8) * (node.spreadDeg * 0.42);
      const lon = node.coords[0] + Math.cos(ang) * rad * 1.15;
      const lat = node.coords[1] + Math.sin(ang) * rad;
      const coreFactor = clamp(1 - rad / Math.max(0.03, node.spreadDeg * 0.45), 0, 1) * intensity;

      const r = 255;
      const g = Math.round(185 + coreFactor * 65);
      const b = Math.round(75 + coreFactor * 145);
      const hex = `#${r.toString(16).padStart(2, '0')}${g
        .toString(16)
        .padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

      out.push({
        lon,
        lat,
        r: r / 255,
        g: g / 255,
        b: b / 255,
        hex,
        sizePx: 2.2 + coreFactor * 2.8,
      });
    }
  }

  return out;
}
