import {
  ATHENS_DATA_END_YEAR,
  ATHENS_DATA_START_YEAR,
  ATHENS_MORTALITY_CATASTROPHES,
  ATHENS_NIGHT_LIGHTS,
  ATHENS_POLITY_PHASES,
  ATHENS_POPULATION_REGIONS,
  ATHENS_SPECIES_DISCOVERIES,
  ATHENS_TERRITORY_REGIONS,
  ATHENS_TRANSPORT_ROUTES,
  SOLAR_SYSTEM_BODIES,
} from '../data/athensClassicalData';
import {
  CelestialBodySpec,
  MortalityCatastrophe,
  NightLightNode,
  PolityPhase,
  PopulationDensityNode,
  SpaceMission,
  SpeciesDiscovery,
  TerritoryRegion,
  TimeRangeSelection,
  TransportRoute,
} from '../types/history';

/** Global civilization timeline span (3500 BCE to 2025 CE) */
export const GLOBAL_MIN_YEAR = -3500;
export const GLOBAL_MAX_YEAR = 2025;

/** ThreeGlobe standard sphere radius */
export const GLOBE_RADIUS = 100;
export const FLAT_MAP_WIDTH = 360;
export const FLAT_MAP_HEIGHT = 180;

const DEG2RAD = Math.PI / 180;

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 格式化历史年份（负数表示公元前 BCE，正数表示公元 CE）
 */
export function formatHistoricalYear(year: number, compact = false): string {
  const rounded = Math.round(year);
  if (rounded < 0) {
    return compact ? `${Math.abs(rounded)} BCE` : `公元前 ${Math.abs(rounded)} 年`;
  }
  if (rounded === 0) {
    return compact ? '1 BCE' : '公元前 1 年';
  }
  return compact ? `${rounded} CE` : `公元 ${rounded} 年`;
}

/**
 * 球面地理坐标 [lon, lat] -> 三维球体坐标 (x, y, z)
 * 与 ThreeGlobe 坐标系完全对齐：(lon=0°, lat=0°) 位于 (0, 0, +R)，东经 +X，北纬 +Y
 */
export function geoToSphereXYZ(
  lonDeg: number,
  latDeg: number,
  radius = GLOBE_RADIUS,
): [number, number, number] {
  const lon = lonDeg * DEG2RAD;
  const lat = latDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  const x = radius * cosLat * Math.sin(lon);
  const y = radius * Math.sin(lat);
  const z = radius * cosLat * Math.cos(lon);
  return [x, y, z];
}

/**
 * 二维等距圆柱投影世界地图坐标 [lon, lat] -> 平面坐标 (x, y, z)
 */
export function geoToFlatXYZ(
  lonDeg: number,
  latDeg: number,
  elevation = 0,
  width = FLAT_MAP_WIDTH,
  height = FLAT_MAP_HEIGHT,
): [number, number, number] {
  const x = (lonDeg / 180) * (width * 0.5);
  const y = (latDeg / 90) * (height * 0.5);
  const z = elevation;
  return [x, y, z];
}

/**
 * 三维球体与二维平面地图之间的平滑插值坐标（morph: 0 = 3D 球体, 1 = 2D 世界地图）
 */
export function geoToMorphedXYZ(
  lonDeg: number,
  latDeg: number,
  morph: number,
  elevation = 0,
  radius = GLOBE_RADIUS,
): [number, number, number] {
  const m = clamp(morph, 0, 1);
  const [sx, sy, sz] = geoToSphereXYZ(lonDeg, latDeg, radius + elevation);
  const [fx, fy, fz] = geoToFlatXYZ(lonDeg, latDeg, elevation);
  return [lerp(sx, fx, m), lerp(sy, fy, m), lerp(sz, fz, m)];
}

/**
 * 关键帧线性插值
 */
export function interpolateKeyframes(keyframes: [number, number][], year: number): number {
  if (keyframes.length === 0) return 0;
  if (year <= keyframes[0][0]) return keyframes[0][1];
  const last = keyframes[keyframes.length - 1];
  if (year >= last[0]) return last[1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    const [y0, v0] = keyframes[i];
    const [y1, v1] = keyframes[i + 1];
    if (year >= y0 && year <= y1) {
      if (y1 === y0) return v1;
      const t = (year - y0) / (y1 - y0);
      return lerp(v0, v1, t);
    }
  }
  return last[1];
}

/**
 * 获取当前年份激活的雅典政权阶段与旗帜；
 * 若年份在政权出现之前（year < -500）或结束之后（year > -404），严格返回 null。
 */
export function getActivePolityPhase(year: number): PolityPhase | null {
  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) {
    return null;
  }
  return (
    ATHENS_POLITY_PHASES.find((phase) => yr >= phase.startYear && yr <= phase.endYear) ?? null
  );
}

/**
 * 获取当前年份真实存在的政权领土多边形分片；
 * 在某一国家或政权出现之前（year < -500）或结束后（year > -404）严格返回空数组。
 */
export function getActiveTerritoryRegions(year: number): TerritoryRegion[] {
  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) {
    return [];
  }
  return ATHENS_TERRITORY_REGIONS.filter((reg) => yr >= reg.validFrom && yr <= reg.validTo);
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function lerpRgbStops(
  stops: [number, [number, number, number]][],
  tNorm: number,
): [number, number, number] {
  const t = clamp(tNorm, 0, 1);
  if (t <= stops[0][0]) return stops[0][1];
  const last = stops[stops.length - 1];
  if (t >= last[0]) return last[1];

  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const localT = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
      return [
        lerp(c0[0], c1[0], localT),
        lerp(c0[1], c1[1], localT),
        lerp(c0[2], c1[2], localT),
      ];
    }
  }
  return last[1];
}

/**
 * 人口密度颜色映射：蓝色（低密度）-> 深棕色（高密度）
 */
export function densityToBlueBrownRGB(densityPerKm2: number): [number, number, number] {
  const norm = clamp((densityPerKm2 - 10) / 150, 0, 1);
  const stops: [number, [number, number, number]][] = [
    [0.0, [37, 99, 235]],   // #2563EB 蓝色（低密度）
    [0.28, [72, 132, 184]], // #4884B8 蓝青过渡
    [0.55, [163, 122, 76]], // #A37A4C 黄褐过渡
    [0.80, [122, 65, 27]],  // #7A411B 暖棕褐色
    [1.0, [66, 29, 10]],    // #421D0A 深棕色（高密度）
  ];
  return lerpRgbStops(stops, norm);
}

export function densityToBlueBrownHex(densityPerKm2: number): string {
  const [r, g, b] = densityToBlueBrownRGB(densityPerKm2);
  return rgbToHex(r, g, b);
}

/**
 * 运输航道使用频次颜色映射：白色（低频）-> 红色/深红色（高频）
 */
export function routeUsageToWhiteRedRGB(annualTrips: number): [number, number, number] {
  const norm = clamp((annualTrips - 20) / 410, 0, 1);
  const stops: [number, [number, number, number]][] = [
    [0.0, [255, 255, 255]],  // #FFFFFF 纯白
    [0.32, [254, 202, 202]], // #FECACA 浅粉白
    [0.62, [248, 113, 113]], // #F87171 珊瑚红
    [0.85, [220, 38, 38]],   // #DC2626 正红
    [1.0, [153, 27, 27]],    // #991B1B 深红
  ];
  return lerpRgbStops(stops, norm);
}

export function routeUsageToWhiteRedHex(annualTrips: number): string {
  const [r, g, b] = routeUsageToWhiteRedRGB(annualTrips);
  return rgbToHex(r, g, b);
}

/**
 * 人口与死亡浩劫红色像素点颜色映射：密集像素点颜色变深
 */
export function mortalityDensityToRedRGB(localIntensity: number): [number, number, number] {
  const norm = clamp(localIntensity, 0, 1);
  const stops: [number, [number, number, number]][] = [
    [0.0, [248, 113, 113]], // #F87171 稀疏浅红
    [0.35, [220, 38, 38]],  // #DC2626 鲜红
    [0.70, [153, 27, 27]],  // #991B1B 暗红
    [1.0, [69, 10, 10]],    // #450A0A 极深暗血红
  ];
  return lerpRgbStops(stops, norm);
}

export function mortalityDensityToRedHex(localIntensity: number): string {
  const [r, g, b] = mortalityDensityToRedRGB(localIntensity);
  return rgbToHex(r, g, b);
}

export function getActivePopulationNodes(
  year: number,
): Array<{ node: PopulationDensityNode; density: number }> {
  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) return [];
  return ATHENS_POPULATION_REGIONS.filter((n) => yr >= n.validFrom && yr <= n.validTo).map(
    (node) => ({
      node,
      density: interpolateKeyframes(node.densityKeyframes, yr),
    }),
  );
}

export function getActiveNightLights(
  year: number,
): Array<{ node: NightLightNode; intensity: number }> {
  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) return [];
  return ATHENS_NIGHT_LIGHTS.filter((n) => yr >= n.validFrom && yr <= n.validTo).map((node) => ({
    node,
    intensity: clamp(interpolateKeyframes(node.intensityKeyframes, yr), 0.05, 1),
  }));
}

export function getActiveTransportRoutes(
  year: number,
): Array<{ route: TransportRoute; annualTrips: number; colorHex: string }> {
  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) return [];
  return ATHENS_TRANSPORT_ROUTES.filter((r) => yr >= r.openedYear && yr <= r.closedYear).map(
    (route) => {
      const annualTrips = Math.round(interpolateKeyframes(route.usageKeyframes, yr));
      return {
        route,
        annualTrips,
        colorHex: routeUsageToWhiteRedHex(annualTrips),
      };
    },
  );
}

/**
 * 将人口密度（人/km²）映射为归一化 GPU 热力强度 [0.18 .. 1.0]：
 * - 低密区（~15 人/km²，如色雷斯林矿带） -> ~0.19（外围蓝色）
 * - 中密区（~55–85 人/km²，如爱奥尼亚商港与阿提卡农区） -> ~0.48–0.65（蓝青至黄褐过渡）
 * - 高密区（≥150 人/km²，如雅典—比雷埃夫斯长墙城区） -> ~0.95–1.00（核心深棕色）
 */
export function densityToPopulationMagnitude(densityPerKm2: number): number {
  return clamp(0.16 + 0.84 * ((densityPerKm2 - 12) / 148), 0.16, 1.0);
}

/**
 * 将单次浩劫死亡人数映射为归一化红外热力强度 [0.16 .. 1.0]：
 * - 较小规模（如米洛斯 4,500 人、马拉松平原会战 6,600 人） -> 0.20 – 0.23（严格呈现浅红色）
 * - 中等规模（如埃及远征 28,000 人、西西里远征 44,000 人） -> 0.47 – 0.63（中红 / 鲜红）
 * - 特大规模（如薛西斯侵希战争 78,000 人、雅典大瘟疫 88,000 人） -> 0.95 – 1.00（浓郁深红色）
 */
export function deathsToMortalityMagnitude(estimatedDeaths: number): number {
  const d = Math.max(0, estimatedDeaths);
  return clamp(0.11 + 0.89 * Math.pow(d / 82000, 0.88), 0.13, 1.0);
}

/**
 * 五次多项式平滑阶跃（Perlin Smootherstep: 6t^5 - 15t^4 + 10t^3），
 * 在 t=0 与 t=1 处一阶、二阶导数均为 0，消除淡入启动与淡出收尾时的速率突变。
 */
export function smootherstep01(tRaw: number): number {
  const t = clamp(tRaw, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * 计算单次死亡浩劫在指定年份（及可选时间段选取状态）下的淡入/淡出时间包络权重 [0 .. 1]：
 * - 若开启时间段选取 `selectedRange = [rStart, rEnd]`：凡与选中时间段重叠的事件保持 `1.0` 常驻不消失；区间外为 `0`。
 * - 常态单点/播放模式：事件开始前 3 年按五次平滑曲线渐进淡入，事件发生期 `[startYear, endYear]` 保持 `1.0` 峰值，
 *   事件结束后 8 年内（`endYear -> endYear + 8`）按五次平滑曲线渐进淡出至 `0`。
 */
export function computeMortalityEventEnvelope(
  ev: MortalityCatastrophe,
  year: number,
  selectedRange: TimeRangeSelection = null,
): number {
  if (selectedRange) {
    const [rawA, rawB] = selectedRange;
    const rStart = Math.min(rawA, rawB);
    const rEnd = Math.max(rawA, rawB);
    if (rEnd < ATHENS_DATA_START_YEAR || rStart > ATHENS_DATA_END_YEAR) return 0;
    if (ev.endYear >= rStart && ev.startYear <= rEnd) {
      return 1.0;
    }
    return 0;
  }

  if (year < ATHENS_DATA_START_YEAR || year > ATHENS_DATA_END_YEAR) {
    return 0;
  }

  const fadeInSpan = 3.0;
  const fadeOutSpan = 8.0;

  if (year <= ev.startYear - fadeInSpan || year >= ev.endYear + fadeOutSpan) {
    return 0;
  }

  if (year < ev.startYear) {
    const t = (year - (ev.startYear - fadeInSpan)) / fadeInSpan;
    return +smootherstep01(t).toFixed(4);
  }

  if (year <= ev.endYear) {
    return 1.0;
  }

  const tOut = (year - ev.endYear) / fadeOutSpan;
  return +(1 - smootherstep01(tOut)).toFixed(4);
}

export function getActiveSpeciesDiscoveries(
  year: number,
  selectedRange: TimeRangeSelection = null,
): SpeciesDiscovery[] {
  if (selectedRange) {
    const [rawA, rawB] = selectedRange;
    const rStart = Math.min(rawA, rawB);
    const rEnd = Math.max(rawA, rawB);
    if (rEnd < ATHENS_DATA_START_YEAR || rStart > ATHENS_DATA_END_YEAR) return [];
    // 在时间段选取状态下，选中时间段内的所有物种发现气泡持续保留、不会消失
    return ATHENS_SPECIES_DISCOVERIES.filter(
      (sp) => sp.discoveryYear >= rStart && sp.discoveryYear <= rEnd,
    );
  }

  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) return [];
  // 常态单点模式下展示当前年份已发现且处于当时代观察窗口内的物种（避免跨世纪无限堆积）
  const spotlightSpanYears = 22;
  return ATHENS_SPECIES_DISCOVERIES.filter(
    (sp) => yr >= sp.discoveryYear && yr <= sp.discoveryYear + spotlightSpanYears,
  );
}

export function getActiveMortalityCatastrophesWithFade(
  year: number,
  selectedRange: TimeRangeSelection = null,
): Array<{ catastrophe: MortalityCatastrophe; envelope: number; magnitude: number }> {
  const out: Array<{ catastrophe: MortalityCatastrophe; envelope: number; magnitude: number }> = [];
  for (const ev of ATHENS_MORTALITY_CATASTROPHES) {
    const envelope = computeMortalityEventEnvelope(ev, year, selectedRange);
    if (envelope > 0.01) {
      out.push({
        catastrophe: ev,
        envelope,
        magnitude: deathsToMortalityMagnitude(ev.estimatedDeaths),
      });
    }
  }
  return out;
}

export function getActiveMortalityCatastrophes(
  year: number,
  cumulativeInEra = false,
  selectedRange: TimeRangeSelection = null,
): MortalityCatastrophe[] {
  if (selectedRange) {
    return getActiveMortalityCatastrophesWithFade(year, selectedRange).map((x) => x.catastrophe);
  }
  const yr = Math.round(year);
  if (yr < ATHENS_DATA_START_YEAR || yr > ATHENS_DATA_END_YEAR) return [];
  if (cumulativeInEra) {
    return ATHENS_MORTALITY_CATASTROPHES.filter((ev) => yr >= ev.startYear);
  }
  return getActiveMortalityCatastrophesWithFade(yr, null).map((x) => x.catastrophe);
}

/**
 * 推进历史年份（自动跳过不存在的公元 0 年）：
 * 若开启时间段选取 `selectedRange = [rStart, rEnd]`，到达右边界后自动循环回左边界播放。
 */
export function stepHistoricalYearWithLoop(
  currentYear: number,
  deltaYears: number,
  selectedRange: TimeRangeSelection = null,
): { nextYear: number; reachedGlobalEnd: boolean } {
  let next = Math.round(currentYear) + deltaYears;
  if (next === 0) {
    next = deltaYears >= 0 ? 1 : -1;
  }

  if (selectedRange) {
    const rStart = Math.min(selectedRange[0], selectedRange[1]);
    const rEnd = Math.max(selectedRange[0], selectedRange[1]);
    if (next > rEnd || next < rStart) {
      return {
        nextYear: rStart === 0 ? 1 : rStart,
        reachedGlobalEnd: false,
      };
    }
    return { nextYear: next, reachedGlobalEnd: false };
  }

  if (next > GLOBAL_MAX_YEAR) {
    return { nextYear: GLOBAL_MAX_YEAR, reachedGlobalEnd: true };
  }
  return {
    nextYear: Math.max(GLOBAL_MIN_YEAR, next),
    reachedGlobalEnd: false,
  };
}

/**
 * 全球时间轴刻度间隔计算：支持从五千年全览平滑缩放到最高精确到 1 年（minorStep = 1）
 */
export function computeTimelineTickStep(visibleSpanYears: number): {
  majorStep: number;
  minorStep: number;
} {
  if (visibleSpanYears <= 30) {
    return { majorStep: 5, minorStep: 1 };
  }
  if (visibleSpanYears <= 70) {
    return { majorStep: 10, minorStep: 1 };
  }
  if (visibleSpanYears <= 180) {
    return { majorStep: 20, minorStep: 5 };
  }
  if (visibleSpanYears <= 500) {
    return { majorStep: 50, minorStep: 10 };
  }
  if (visibleSpanYears <= 1600) {
    return { majorStep: 200, minorStep: 50 };
  }
  return { majorStep: 500, minorStep: 100 };
}

/**
 * 向心 Catmull-Rom 样条曲线插值（alpha = 0.5）：
 * 严格经过每一个真实海上绕行航点（海峡中线、海岬外海锚点、港口入口），无自交、无尖角折线与过冲，生成丝滑海运航道。
 */
export function smoothMaritimeWaypointsCatmullRom(
  waypoints: [number, number][],
  samplesPerSegment = 20,
): [number, number][] {
  if (waypoints.length < 2) return waypoints.slice();
  if (waypoints.length === 2) {
    const out: [number, number][] = [];
    const [x0, y0] = waypoints[0];
    const [x1, y1] = waypoints[1];
    for (let s = 0; s <= samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      out.push([lerp(x0, x1, t), lerp(y0, y1, t)]);
    }
    return out;
  }

  const out: [number, number][] = [];
  const alpha = 0.5;
  const steps = Math.max(6, samplesPerSegment);

  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const p0: [number, number] =
      i === 0
        ? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]]
        : waypoints[i - 1];
    const p3: [number, number] =
      i + 2 < waypoints.length
        ? waypoints[i + 2]
        : [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]];

    const d01 = Math.max(1e-4, Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), alpha));
    const d12 = Math.max(1e-4, Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), alpha));
    const d23 = Math.max(1e-4, Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), alpha));

    const t0 = 0;
    const t1 = t0 + d01;
    const t2 = t1 + d12;
    const t3 = t2 + d23;

    for (let s = 0; s < steps; s++) {
      const t = t1 + ((t2 - t1) * s) / steps;

      const a1x = ((t1 - t) / (t1 - t0)) * p0[0] + ((t - t0) / (t1 - t0)) * p1[0];
      const a1y = ((t1 - t) / (t1 - t0)) * p0[1] + ((t - t0) / (t1 - t0)) * p1[1];
      const a2x = ((t2 - t) / (t2 - t1)) * p1[0] + ((t - t1) / (t2 - t1)) * p2[0];
      const a2y = ((t2 - t) / (t2 - t1)) * p1[1] + ((t - t1) / (t2 - t1)) * p2[1];
      const a3x = ((t3 - t) / (t3 - t2)) * p2[0] + ((t - t2) / (t3 - t2)) * p3[0];
      const a3y = ((t3 - t) / (t3 - t2)) * p2[1] + ((t - t2) / (t3 - t2)) * p3[1];

      const b1x = ((t2 - t) / (t2 - t0)) * a1x + ((t - t0) / (t2 - t0)) * a2x;
      const b1y = ((t2 - t) / (t2 - t0)) * a1y + ((t - t0) / (t2 - t0)) * a2y;
      const b2x = ((t3 - t) / (t3 - t1)) * a2x + ((t - t1) / (t3 - t1)) * a3x;
      const b2y = ((t3 - t) / (t3 - t1)) * a2y + ((t - t1) / (t3 - t1)) * a3y;

      const cx = ((t2 - t) / (t2 - t1)) * b1x + ((t - t1) / (t2 - t1)) * b2x;
      const cy = ((t2 - t) / (t2 - t1)) * b1y + ((t - t1) / (t2 - t1)) * b2y;
      out.push([cx, cy]);
    }
  }

  out.push(waypoints[waypoints.length - 1]);
  return out;
}

/**
 * 对海运航点序列执行向心 Catmull-Rom 样条平滑，并按弧长比例 revealProgress [0..1] 截取起点 -> 终点过渡子路径
 */
export function densifyAndSliceWaypoints(
  waypoints: [number, number][],
  revealProgress: number,
  samplesPerSegment = 20,
): [number, number][] {
  if (waypoints.length < 2) return waypoints.slice();
  const dense = smoothMaritimeWaypointsCatmullRom(waypoints, samplesPerSegment);

  const prog = clamp(revealProgress, 0.04, 1);
  if (prog >= 0.999) return dense;

  // Slice smoothly by cumulative arc length so ship reveal speed is uniform across short straits & open seas
  const cumLen = new Float64Array(dense.length);
  let totalLen = 0;
  for (let i = 1; i < dense.length; i++) {
    const dx = dense[i][0] - dense[i - 1][0];
    const dy = dense[i][1] - dense[i - 1][1];
    totalLen += Math.hypot(dx, dy);
    cumLen[i] = totalLen;
  }

  if (totalLen <= 1e-8) return dense.slice(0, 2);
  const targetLen = totalLen * prog;

  const sliced: [number, number][] = [dense[0]];
  for (let i = 1; i < dense.length; i++) {
    if (cumLen[i] <= targetLen) {
      sliced.push(dense[i]);
    } else {
      const segLen = cumLen[i] - cumLen[i - 1];
      const frac = segLen > 1e-9 ? clamp((targetLen - cumLen[i - 1]) / segLen, 0, 1) : 1;
      sliced.push([
        lerp(dense[i - 1][0], dense[i][0], frac),
        lerp(dense[i - 1][1], dense[i][1], frac),
      ]);
      break;
    }
  }

  if (sliced.length < 2) {
    sliced.push(dense[1]);
  }
  return sliced;
}

/**
 * 计算太阳系平面图中各天体在给定年份的黄道平面位置 (x, 0, z)
 */
export function computeCelestialBodyXZ(
  body: CelestialBodySpec,
  yearFloat: number,
  allBodies: CelestialBodySpec[] = SOLAR_SYSTEM_BODIES,
): [number, number] {
  if (body.kind === 'star' || body.orbitRadiusUnits === 0) {
    return [0, 0];
  }
  const elapsedYears = yearFloat - ATHENS_DATA_START_YEAR;
  const angularVel = (Math.PI * 2) / body.orbitalPeriodYears;
  const angle = body.initialPhaseRad + elapsedYears * angularVel;

  const localX = Math.cos(angle) * body.orbitRadiusUnits;
  const localZ = Math.sin(angle) * body.orbitRadiusUnits;

  if (body.parentBodyId) {
    const parent = allBodies.find((b) => b.id === body.parentBodyId);
    if (parent) {
      const [px, pz] = computeCelestialBodyXZ(parent, yearFloat, allBodies);
      return [px + localX, pz + localZ];
    }
  }

  return [localX, localZ];
}

export function computeMissionTransferProgress(
  mission: SpaceMission,
  yearFloat: number,
): number {
  if (yearFloat < mission.launchYear) return 0;
  if (mission.arrivalYear <= mission.launchYear) return 1;
  return clamp((yearFloat - mission.launchYear) / (mission.arrivalYear - mission.launchYear), 0, 1);
}

export function createSeededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
