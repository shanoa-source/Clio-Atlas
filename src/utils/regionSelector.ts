import {
  computeDatasetYearBounds,
  getMortalityCatastrophes,
  getNightLightNodes,
  getPolityPhases,
  getPopulationNodes,
  getSpaceMissions,
  getSpeciesDiscoveries,
  getTerritoryRegions,
  getTransportRoutes,
} from '../shared/atlasDataLayer';
import {
  formatNumberByLang,
  formatYearByLang,
  getBasePolityLayerName,
  getOverlayLayerName,
  localizeCatastrophe,
  localizeNightLightNode,
  localizePolity,
  localizePopulationNode,
  localizeSpecies,
  localizeTerritoryName,
  localizeTransportRoute,
  UI_TEXT,
} from '../i18n/translations';
import {
  AppLanguage,
  AtlasImportBundle,
  BookListItem,
  CustomHistoricalEvent,
  GeoBBox,
  GeoJsonMultiPolygon,
  ImportedMortalityCatastropheRecord,
  ImportedNightLightNodeRecord,
  ImportedPolityRecord,
  ImportedPopulationNodeRecord,
  ImportedSpeciesDiscoveryRecord,
  ImportedTerritoryRecord,
  ImportedTransportRouteRecord,
  LocalizedStringMap,
  MapRegionSelection,
  OverlayLayerId,
  RegionEventSummaryItem,
  RegionLayerMetrics,
  RegionNightLightNodeDetail,
  RegionOverviewData,
  RegionPopulationNodeDetail,
  TimeRangeSelection,
} from '../types/history';
import {
  clamp,
  getActivePolityPhase,
  interpolateKeyframes,
  smoothMaritimeWaypointsCatmullRom,
} from './geoMath';

const EARTH_RADIUS_KM = 6371;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const OVERLAY_LAYER_NAME_MAP: Record<OverlayLayerId, string> = {
  population_density: '人口密度',
  night_lights: '夜晚光照',
  transport_routes: '运输航道',
  species_discovery: '物种发现',
  mortality_catastrophe: '死亡浩劫',
  space_race: '月球与深空',
};

/**
 * Great-circle Haversine distance in kilometers between two [lon, lat] points.
 */
export function haversineDistanceKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * DEG2RAD;
  const dLon = (b[0] - a[0]) * DEG2RAD;
  const lat1 = a[1] * DEG2RAD;
  const lat2 = b[1] * DEG2RAD;
  const sinLat = Math.sin(dLat * 0.5);
  const sinLon = Math.sin(dLon * 0.5);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function normalizeBBox(a: [number, number], b: [number, number]): GeoBBox {
  return {
    minLon: +Math.min(a[0], b[0]).toFixed(4),
    minLat: +Math.min(a[1], b[1]).toFixed(4),
    maxLon: +Math.max(a[0], b[0]).toFixed(4),
    maxLat: +Math.max(a[1], b[1]).toFixed(4),
  };
}

export function computeMultiPolygonBBox(geom: GeoJsonMultiPolygon): GeoBBox {
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  for (const poly of geom.coordinates) {
    const outer = poly[0] || [];
    for (const [lon, lat] of outer) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (minLon > maxLon) {
    return { minLon: 23.0, minLat: 37.5, maxLon: 24.2, maxLat: 38.3 };
  }
  return {
    minLon: +minLon.toFixed(4),
    minLat: +minLat.toFixed(4),
    maxLon: +maxLon.toFixed(4),
    maxLat: +maxLat.toFixed(4),
  };
}

export function extractCompactOuterRings(
  geom: GeoJsonMultiPolygon,
  maxVerticesPerRing = 180,
): [number, number][][] {
  const rings: [number, number][][] = [];
  for (const poly of geom.coordinates) {
    const outer = poly[0];
    if (!outer || outer.length < 4) continue;
    if (outer.length <= maxVerticesPerRing) {
      rings.push(outer.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]));
    } else {
      const step = (outer.length - 1) / (maxVerticesPerRing - 1);
      const sampled: [number, number][] = [];
      for (let i = 0; i < maxVerticesPerRing - 1; i++) {
        const pt = outer[Math.round(i * step)];
        sampled.push([+pt[0].toFixed(4), +pt[1].toFixed(4)]);
      }
      sampled.push(sampled[0]);
      rings.push(sampled);
    }
  }
  return rings;
}

/**
 * Generates a closed geodesic circle polygon ring on the sphere around `center` with `radiusKm`.
 */
export function createGeodesicCircleRing(
  center: [number, number],
  radiusKm: number,
  steps = 64,
): [number, number][] {
  const [lon0, lat0] = center;
  const latRad = lat0 * DEG2RAD;
  const lonRad = lon0 * DEG2RAD;
  const angDist = Math.max(1, radiusKm) / EARTH_RADIUS_KM;

  const ring: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const bearing = (i / steps) * Math.PI * 2;
    const sinLat2 =
      Math.sin(latRad) * Math.cos(angDist) +
      Math.cos(latRad) * Math.sin(angDist) * Math.cos(bearing);
    const lat2 = Math.asin(clamp(sinLat2, -1, 1));
    const y = Math.sin(bearing) * Math.sin(angDist) * Math.cos(latRad);
    const x = Math.cos(angDist) - Math.sin(latRad) * Math.sin(lat2);
    const lon2 = lonRad + Math.atan2(y, x);
    ring.push([+(lon2 * RAD2DEG).toFixed(4), +(lat2 * RAD2DEG).toFixed(4)]);
  }
  return ring;
}

export function computeCircleBBox(center: [number, number], radiusKm: number): GeoBBox {
  const ring = createGeodesicCircleRing(center, radiusKm, 36);
  let minLon = 180;
  let minLat = 90;
  let maxLon = -180;
  let maxLat = -90;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return {
    minLon: +minLon.toFixed(4),
    minLat: +minLat.toFixed(4),
    maxLon: +maxLon.toFixed(4),
    maxLat: +maxLat.toFixed(4),
  };
}

export function bboxToPolygonRing(bbox: GeoBBox): [number, number][] {
  return [
    [bbox.minLon, bbox.minLat],
    [bbox.maxLon, bbox.minLat],
    [bbox.maxLon, bbox.maxLat],
    [bbox.minLon, bbox.maxLat],
    [bbox.minLon, bbox.minLat],
  ];
}

function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? 'N' : 'S'}`;
}

function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(2)}°${lon >= 0 ? 'E' : 'W'}`;
}

export function formatBBoxLabel(bbox: GeoBBox): string {
  return `${formatLat(bbox.minLat)}–${formatLat(bbox.maxLat)} · ${formatLon(bbox.minLon)}–${formatLon(bbox.maxLon)}`;
}

function pointInRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function minDistanceDegToRings(lon: number, lat: number, rings: [number, number][][]): number {
  let minDistSq = Infinity;
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const dx = (ring[i][0] - lon) * Math.cos(lat * DEG2RAD);
      const dy = ring[i][1] - lat;
      const dSq = dx * dx + dy * dy;
      if (dSq < minDistSq) minDistSq = dSq;
    }
  }
  return Math.sqrt(minDistSq);
}

/**
 * Tests whether a geographic coordinate [lon, lat] falls inside the user's selected region.
 */
export function isPointInRegionSelection(
  lon: number,
  lat: number,
  selection: MapRegionSelection,
  coastalBufferDeg = 0.22,
): boolean {
  if (selection.kind === 'bbox') {
    const { minLon, minLat, maxLon, maxLat } = selection.bbox;
    return lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat;
  }

  if (selection.kind === 'circle') {
    return haversineDistanceKm(selection.center, [lon, lat]) <= selection.radiusKm;
  }

  // `territory` selection
  const { bbox, polygonRings } = selection;
  if (
    lon < bbox.minLon - coastalBufferDeg ||
    lon > bbox.maxLon + coastalBufferDeg ||
    lat < bbox.minLat - coastalBufferDeg ||
    lat > bbox.maxLat + coastalBufferDeg
  ) {
    return false;
  }

  if (!polygonRings || polygonRings.length === 0) {
    return true;
  }

  for (const ring of polygonRings) {
    if (pointInRing(lon, lat, ring)) return true;
  }

  return minDistanceDegToRings(lon, lat, polygonRings) <= coastalBufferDeg;
}

export function bboxesOverlap(a: GeoBBox, b: GeoBBox, margin = 0): boolean {
  return !(
    a.maxLon + margin < b.minLon ||
    a.minLon - margin > b.maxLon ||
    a.maxLat + margin < b.minLat ||
    a.minLat - margin > b.maxLat
  );
}

export function doesRouteIntersectSelection(
  waypoints: [number, number][],
  selection: MapRegionSelection,
): boolean {
  const dense = smoothMaritimeWaypointsCatmullRom(waypoints, 8);
  return dense.some(([lon, lat]) => isPointInRegionSelection(lon, lat, selection, 0.26));
}

function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.max(aStart, bStart) <= Math.min(aEnd, bEnd);
}

/**
 * Generates explicit thematic & cross-layer coupling instructions based on the currently overlaid `activeLayers`.
 */
export function buildActiveLayerFocusDirective(
  activeLayers: OverlayLayerId[],
  lang: AppLanguage = 'zh',
): string[] {
  const hasPop = activeLayers.includes('population_density');
  const hasNight = activeLayers.includes('night_lights');
  const hasRoutes = activeLayers.includes('transport_routes');
  const hasMort = activeLayers.includes('mortality_catastrophe');
  const hasSpecies = activeLayers.includes('species_discovery');
  const hasSpace = activeLayers.includes('space_race');

  if (lang === 'en') {
    if (activeLayers.length === 0) {
      return [
        '- Only the baseline [Polities & Historical Flags] layer is active: focus on polity evolution, territorial sovereignty, and Delian League tribute districts.',
      ];
    }
    const layerNames = activeLayers.map((id) => getOverlayLayerName(id, 'en'));
    const directives: string[] = [
      `- Currently active overlaid thematic layers: [${layerNames.join(' + ')}].`,
      '- Strong Correlation Requirement: Your response MUST focus directly on these active layers, citing their quantitative metrics and spatial gradients rather than drifting into unselected themes.',
    ];
    if (hasPop) {
      directives.push(
        '- [Population Density]: Cite settlement-level density values (pers./km²), contrasting dense urban/harbor cores against sparser mining or island frontiers.',
      );
    }
    if (hasNight) {
      directives.push(
        '- [Nighttime Lights]: Focus on pre-industrial nocturnal light sources (urban olive-oil lamps, harbor beacons & ship-sheds, Laurion 24h silver smelting furnaces, sanctuary flames) and relative radiance (%).',
      );
    }
    if (hasRoutes) {
      directives.push(
        '- [Maritime Routes]: Analyze sea lanes, annual voyage frequencies (voyages/yr), and strategic cargoes (grain, naval timber, silver bullion).',
      );
    }
    if (hasMort) {
      directives.push(
        '- [Mortality & Wars]: Focus on battles, siege famines, and epidemics, citing casualty magnitudes and demographic shocks.',
      );
    }
    if (hasSpecies) {
      directives.push(
        '- [Species Discovery]: Reference earliest extant textual chroniclers / historical witnesses (for pre-1735 pre-Linnaean records, never invent ancient discoverers or fictional bureaus), binomial + classical source-language names (`classicalSourceName`: Ancient Greek, Latin, Pre-Qin/Han-Tang Chinese + transliteration, Classical Nahuatl, etc.), and canonical text/event years.',
      );
    }
    if (hasSpace) {
      directives.push(
        '- [Lunar & Deep Space]: Relate the current epoch to classical astronomical observations or deep-space orbital missions.',
      );
    }
    if (activeLayers.length >= 2) {
      directives.push(
        '- [Multi-Layer Coupling Analysis (Key Focus)]: Explain the spatial and causal coupling across the simultaneously active layers:',
      );
      if (hasPop && hasNight) {
        directives.push(
          '  * Population Density × Nighttime Lights: Compare high-density urban/port cores (Athens–Piraeus domestic oil lamps & harbor fires) with specialized industrial/ritual light anomalies (e.g., Laurion 24h silver smelting furnaces exceeding local population rank, or Cape Sounion / Delos beacons) and dim low-density frontiers.',
        );
      }
      if (hasPop && hasRoutes) {
        directives.push(
          '  * Population Density × Maritime Routes: Explain how dense urban Attica exceeded local carrying capacity and depended on high-frequency Pontic/Egyptian grain lanes into Piraeus.',
        );
      }
      if (hasPop && hasMort) {
        directives.push(
          '  * Population Density × Mortality: Explain how wartime refugee crowding (Long Walls), mining camps, or island sieges amplified epidemic spread and fatality gradients.',
        );
      }
      if (hasNight && hasRoutes) {
        directives.push(
          '  * Nighttime Lights × Maritime Routes: Explain how headland beacons, strait fire-towers, and Piraeus dockyard fires enabled safe high-frequency maritime traffic.',
        );
      }
      if (hasNight && hasMort) {
        directives.push(
          '  * Nighttime Lights × Mortality: Analyze how sackings, epidemics, or wartime blockades (e.g., Decelean occupation crippling Laurion furnaces) depressed nocturnal radiance.',
        );
      }
      if (hasRoutes && hasMort) {
        directives.push(
          '  * Maritime Routes × Mortality: Analyze how struggles over sea lifelines (Egypt, Sicily, Hellespont/Aegospotami, Piraeus blockade) triggered mass casualties and famine.',
        );
      }
    }
    return directives;
  }

  if (lang === 'de') {
    if (activeLayers.length === 0) {
      return [
        '- Derzeit ist nur die Basiskarte [Herrschaften & Historische Flaggen] aktiv: Fokussieren Sie sich auf Herrschaftsphasen, Territorien und Tributbezirke des Seebundes.',
      ];
    }
    const layerNames = activeLayers.map((id) => getOverlayLayerName(id, 'de'));
    const directives: string[] = [
      `- Aktuell überlagerte thematische Ebenen: [${layerNames.join(' + ')}].`,
      '- Strikte Ebenenkorrelation: Ihre Antwort MUSS eng mit diesen aktiven Ebenen verknüpft sein und deren konkrete Messwerte sowie räumliche Muster auswerten.',
    ];
    if (hasPop) {
      directives.push(
        '- [Bevölkerungsdichte]: Nennen Sie konkrete Siedlungsdichten (Einw./km²) im Vergleich zwischen urbanem Polis-Kern und dünn besiedelten Insel-/Grenzräumen.',
      );
    }
    if (hasNight) {
      directives.push(
        '- [Nachtbeleuchtung]: Analysieren Sie vorindustrielle Lichtquellen (städtische Olivenöllampen, Hafenleuchtfeuer, 24h-Silberschmelzöfen in Laurion, Heiligtumsfeuer) samt relativer Lichtstärke (%).',
      );
    }
    if (hasRoutes) {
      directives.push(
        '- [Seehandelsrouten]: Berücksichtigen Sie Routenverlauf, jährliche Fahrtenfrequenz (Fahrten/J.) und strategische Frachtgüter (Getreide, Schiffbauholz, Silber).',
      );
    }
    if (hasMort) {
      directives.push(
        '- [Opfer & Katastrophen]: Analysieren Sie Schlachten, Belagerungshungersnöte und Seuchen anhand geschätzter Opferzahlen und Wärmezentren.',
      );
    }
    if (hasSpecies) {
      directives.push(
        '- [Artenentdeckung]: Nennen Sie für vor-linnéische Arten (< 1735) ausschließlich früheste Textzeugen/Chronisten (keine erfundenen Ämter oder Entdecker), wissenschaftliche sowie klassische Originalsprachennamen (`classicalSourceName`: Altgriechisch, Latein, klassisches Chinesisch, Nahuatl usw.) und kanonische Werk-/Ereignisjahre.',
      );
    }
    if (hasSpace) {
      directives.push(
        '- [Mond & Tiefraum]: Verknüpfen Sie das gewählte Jahr mit antiker Astronomie bzw. modernen Tiefraummissionen.',
      );
    }
    if (activeLayers.length >= 2) {
      directives.push(
        '- [Mehrebenen-Kopplungsanalyse (Schwerpunkt)]: Erklären Sie die räumlichen und kausalen Zusammenhänge zwischen den überlagerten Ebenen:',
      );
      if (hasPop && hasNight) {
        directives.push(
          '  * Bevölkerungsdichte × Nachtbeleuchtung: Vergleichen Sie dicht besiedelte Stadt-/Hafenkerne (Athen–Piräus mit Öllampen und Werftfeuern) mit industriellen oder kultischen Lichtanomalien (z. B. 24h-Schmelzöfen von Laurion mit Spitzenlichtstärke trotz geringerer Einwohnerzahl als Athen, Kap Sunion, Delos) sowie dunklen Randzonen.',
        );
      }
      if (hasPop && hasRoutes) {
        directives.push(
          '  * Bevölkerungsdichte × Seehandelsrouten: Zeigen Sie, wie die hohe Bevölkerungsdichte Attikas von hochfrequenten Getreiderouten (Schwarzes Meer, Ägypten) nach Piräus abhing.',
        );
      }
      if (hasPop && hasMort) {
        directives.push(
          '  * Bevölkerungsdichte × Opferzahlen: Erklären Sie, wie Flüchtlingsdichte hinter den Langen Mauern, Bergbaulager oder Inselbelagerungen Seuchen und Verluste verstärkten.',
        );
      }
      if (hasNight && hasRoutes) {
        directives.push(
          '  * Nachtbeleuchtung × Seehandelsrouten: Erläutern Sie die Rolle von Kap- und Hafenleuchtfeuern für die sichere Nachtnavigation auf Hauptseelinien.',
        );
      }
      if (hasNight && hasMort) {
        directives.push(
          '  * Nachtbeleuchtung × Katastrophen: Analysieren Sie den Rückgang nächtlicher Siedlungs- und Hüttenfeuer durch Zerstörung, Seuchen oder Kriegsblockaden (z. B. Laurion).',
        );
      }
      if (hasRoutes && hasMort) {
        directives.push(
          '  * Seehandelsrouten × Katastrophen: Zeigen Sie, wie Kämpfe um Seeverbindungen (Ägypten, Sizilien, Aigospotamoi, Blockade von Piräus) zu hohen Verlusten und Hungersnot führten.',
        );
      }
    }
    return directives;
  }

  // Default Chinese ('zh')
  if (activeLayers.length === 0) {
    return [
      '- 当前仅开启基础【政权与历史旗帜】底图（未叠加额外专题图层）：请重点围绕政权阶段演进、疆域版图与同盟贡区控制范围展开分析。',
    ];
  }

  const layerNames = activeLayers.map((id) => OVERLAY_LAYER_NAME_MAP[id] || id);
  const directives: string[] = [
    `- 当前用户叠加激活的专题图层为：【${layerNames.join(' + ')}】。`,
    '- 强相关输出要求：回答内容必须与上述已激活图层强相关，围绕各激活图层的核心量化指标、空间分布特征展开，严禁脱离当前叠加图层泛泛而谈。',
  ];

  if (hasPop) {
    directives.push(
      '- 【人口密度维度】：必须引用具体聚落节点的人口密度梯度（人/km²），区分高密度都城/港城核心与低密度林矿/岛屿边疆的人口承载结构。',
    );
  }
  if (hasNight) {
    directives.push(
      '- 【夜晚光照维度】：必须紧密围绕前工业时代的夜间人工光源形态（城区橄榄油灯群、海港导航灯塔与船坞夜火、劳里厄姆昼夜银铅冶炼炉、圣域长明火）及其相对辐射光强（%）展开解读。',
    );
  }
  if (hasRoutes) {
    directives.push(
      '- 【运输航道维度】：必须结合途经海运干线的起止节点、年航行频次（航次/年）与承运战略物资（谷物、造船木、银锭等）进行分析。',
    );
  }
  if (hasMort) {
    directives.push(
      '- 【死亡浩劫维度】：必须聚焦战争会战、围城饥荒与瘟疫事件的伤亡人数规模、热力核心分布及对城邦国力的冲击。',
    );
  }
  if (hasSpecies) {
    directives.push(
      '- 【物种发现维度】：对于林奈双名法（1735 年）之前的古代物种，必须严格引用“最早传世文献记述者 / 历史事件见证者”及“原典成书年或标志性事件年”（严禁编造古代发现人或虚假官署），并结合古典原典语言名称（`classicalSourceName`：希腊填古希腊文、罗马填拉丁/希腊原名、中国填先秦/汉唐古称与转写、中美洲填纳瓦特尔语等）与现代学名展开说明。',
    );
  }
  if (hasSpace) {
    directives.push(
      '- 【月球与深空维度】：结合当前年份所处历史时期的天文学观测背景或现代深空探测轨道任务进行说明。',
    );
  }

  if (activeLayers.length >= 2) {
    directives.push('- 【多图层叠加耦合分析（重点）】：当前处于多图层叠加状态，请重点剖析这些激活图层之间的因果与空间耦合关系：');
    if (hasPop && hasNight) {
      directives.push(
        '  * 人口密度 × 夜晚光照耦合：对比高人口密度核心区（如雅典城区—比雷埃夫斯双城带，密集民居油灯与港口夜航火光）与特殊功能性光源区（如劳里厄姆银矿昼夜冶炼炉群、提洛/海岬圣域火光，工业或祭祀驱动的局部高光强）以及低密边疆微光区的差异与对应关系。',
      );
    }
    if (hasPop && hasRoutes) {
      directives.push(
        '  * 人口密度 × 运输航道耦合：剖析高密度城区人口超出本土农业承载力后，对黑海/埃及高频海运粮道及比雷埃夫斯中转港的结构性依赖。',
      );
    }
    if (hasPop && hasMort) {
      directives.push(
        '  * 人口密度 × 死亡浩劫耦合：剖析高密度人口聚集（如长墙避难棚户带、矿区或围城孤岛）如何放大瘟疫传播率、饥荒损耗与战争伤亡梯度。',
      );
    }
    if (hasNight && hasRoutes) {
      directives.push(
        '  * 夜晚光照 × 运输航道耦合：剖析海港导航灯塔、海峡火号与船坞夜间修造火光如何支撑高频海运航道的安全通行。',
      );
    }
    if (hasNight && hasMort) {
      directives.push(
        '  * 夜晚光照 × 死亡浩劫耦合：结合战争焚城、瘟疫损耗或敌军封锁矿区（如德凯莱亚驻军瘫痪劳里厄姆冶炉）对聚落与工矿夜间火光强度的冲击进行解读。',
      );
    }
    if (hasRoutes && hasMort) {
      directives.push(
        '  * 运输航道 × 死亡浩劫耦合：剖析海上生命线争夺（如埃及远征、西西里远征、赫勒斯滂羊河决战及比雷埃夫斯封锁）如何直接引发大规模伤亡与城邦饥荒。',
      );
    }
  }

  return directives;
}

/**
 * Pure, deterministic spatial + temporal + active-layer extractor used identically on both frontend
 * (Right Overview Sidebar) and backend (`POST /api/chat` context builder).
 */
function pickI18n(
  map: LocalizedStringMap | undefined,
  lang: AppLanguage,
  fallback: string,
): string {
  const candidate = map?.[lang];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;
}

function mergeRecordsById<T extends { id: string }>(base: T[], extra: T[] = []): T[] {
  if (extra.length === 0) return base;
  const out = [...base];
  const idxMap = new Map<string, number>();
  out.forEach((item, i) => idxMap.set(item.id, i));
  for (const item of extra) {
    const existing = idxMap.get(item.id);
    if (existing !== undefined) {
      out[existing] = item;
    } else {
      idxMap.set(item.id, out.length);
      out.push(item);
    }
  }
  return out;
}

export function extractRegionOverview(params: {
  currentYear: number;
  selectedRange: TimeRangeSelection;
  activeLayers: OverlayLayerId[];
  selectedRegion: MapRegionSelection | null;
  customEvents?: CustomHistoricalEvent[];
  importedBundle?: AtlasImportBundle;
  language?: AppLanguage;
}): RegionOverviewData {
  const {
    currentYear,
    selectedRange,
    activeLayers,
    selectedRegion,
    customEvents = [],
    importedBundle,
    language = 'zh',
  } = params;

  const yr = Math.round(currentYear);
  const timeWindow: [number, number] = selectedRange
    ? [Math.min(selectedRange[0], selectedRange[1]), Math.max(selectedRange[0], selectedRange[1])]
    : [yr, yr];
  const [wStart, wEnd] = timeWindow;
  const sampleMidYear = Math.round((wStart + wEnd) * 0.5);

  const timeLabelZh = selectedRange
    ? `${formatYearByLang(wStart, language, true)} – ${formatYearByLang(wEnd, language, true)}`
    : formatYearByLang(yr, language, false);

  const importedPolityIds = new Set((importedBundle?.polities ?? []).map((p) => p.id));
  const rawCandidatePolities: ImportedPolityRecord[] = getPolityPhases(importedBundle);
  const candidatePolities: ImportedPolityRecord[] =
    importedPolityIds.size > 0
      ? [
          ...rawCandidatePolities.filter((p) => importedPolityIds.has(p.id)),
          ...rawCandidatePolities.filter((p) => !importedPolityIds.has(p.id)),
        ]
      : rawCandidatePolities;

  // When a spatial region is selected and multiple polities overlap in time, prefer the polity spatially matching the selection
  const activeTimePolities = candidatePolities.filter(
    (p) =>
      (yr >= p.startYear && yr <= p.endYear) ||
      intervalsOverlap(p.startYear, p.endYear, wStart, wEnd),
  );

  const activePolity: ImportedPolityRecord | null =
    (selectedRegion
      ? activeTimePolities.find((p) =>
          isPointInRegionSelection(p.capitalCoords[0], p.capitalCoords[1], selectedRegion, 4.0),
        )
      : undefined) ||
    candidatePolities.find((p) => yr >= p.startYear && yr <= p.endYear) ||
    getActivePolityPhase(yr) ||
    activeTimePolities[0] ||
    null;

  const resolvePolityText = (pol: ImportedPolityRecord) => {
    const baseLoc = localizePolity(pol, language);
    const defaultName =
      language === 'en'
        ? pol.nameEn || baseLoc.name
        : language === 'de'
          ? pol.nameDe || pol.nameEn || baseLoc.name
          : baseLoc.name;
    return {
      name: defaultName,
      eraSubtitle: pickI18n(pol.eraSubtitleI18n, language, baseLoc.eraSubtitle),
      capitalName: pickI18n(pol.capitalNameI18n, language, baseLoc.capitalName),
      summary: pickI18n(pol.summaryI18n, language, baseLoc.summary),
    };
  };

  const localizedActivePolity = activePolity ? resolvePolityText(activePolity) : null;

  const activeLayerLabelsZh = [
    getBasePolityLayerName(language),
    ...activeLayers.map((id) => getOverlayLayerName(id, language)),
  ];

  // 1. Region header metadata
  let regionTitleZh =
    language === 'en'
      ? 'Global View (No Region Selected)'
      : language === 'de'
        ? 'Globale Ansicht (Kein Gebiet gewählt)'
        : '全局视图（未框选特定区域）';

  let coordsSummary =
    language === 'en'
      ? 'Global Viewport · Use Box / Circle tools to lock a region'
      : language === 'de'
        ? 'Globales Sichtfeld · Rechteck / Kreis für Gebietsauswahl nutzen'
        : '全球视野 · 使用框选/画圈工具可锁定局部区域';

  if (selectedRegion) {
    if (selectedRegion.kind === 'bbox') {
      regionTitleZh = UI_TEXT[language].customBoxName;
      coordsSummary = formatBBoxLabel(selectedRegion.bbox);
    } else if (selectedRegion.kind === 'circle') {
      regionTitleZh = UI_TEXT[language].customCircleName;
      const centerStr = `${formatLat(selectedRegion.center[1])} · ${formatLon(
        selectedRegion.center[0],
      )}`;
      const rKm = Math.round(selectedRegion.radiusKm);
      coordsSummary =
        language === 'en'
          ? `Center ${centerStr} · Radius ${rKm} km`
          : language === 'de'
            ? `Zentrum ${centerStr} · Radius ${rKm} km`
            : `圆心 ${centerStr} · 半径 ${rKm} km`;
    } else {
      regionTitleZh = localizeTerritoryName(
        selectedRegion.territoryId,
        selectedRegion.nameZh,
        language,
      );
      coordsSummary = formatBBoxLabel(selectedRegion.bbox);
    }
  }

  // 2. Matched territories in timeWindow & spatial selection
  const allTerritories: ImportedTerritoryRecord[] = getTerritoryRegions(importedBundle);

  const matchedTerritories = allTerritories.filter((reg) => {
    if (!intervalsOverlap(reg.validFrom, reg.validTo, wStart, wEnd)) return false;
    if (!selectedRegion) return true;
    if (selectedRegion.kind === 'territory') {
      return reg.id === selectedRegion.territoryId;
    }
    const approxBox = reg.approxBBox;
    if (!approxBox) return false;
    if (selectedRegion.kind === 'circle') {
      const cx = (approxBox.minLon + approxBox.maxLon) * 0.5;
      const cy = (approxBox.minLat + approxBox.maxLat) * 0.5;
      return (
        isPointInRegionSelection(cx, cy, selectedRegion, 0.3) ||
        bboxesOverlap(approxBox, selectedRegion.bbox)
      );
    }
    return bboxesOverlap(approxBox, selectedRegion.bbox);
  });

  // 3. Matched population density nodes & node-level details
  const allPopNodes: ImportedPopulationNodeRecord[] = getPopulationNodes(importedBundle);

  const matchedPopNodes = allPopNodes.filter((node) => {
    if (!intervalsOverlap(node.validFrom, node.validTo, wStart, wEnd)) return false;
    if (!selectedRegion) return true;
    if (isPointInRegionSelection(node.center[0], node.center[1], selectedRegion, 0.25)) {
      return true;
    }
    return (node.thermalSubZones || []).some((sub) =>
      isPointInRegionSelection(sub.coords[0], sub.coords[1], selectedRegion, 0.2),
    );
  });

  const populationDetails: RegionPopulationNodeDetail[] = matchedPopNodes.map((n) => {
    const evalYr = clamp(yr, n.validFrom, n.validTo);
    const densityPerKm2 = Math.round(interpolateKeyframes(n.densityKeyframes, evalYr));
    const loc = localizePopulationNode(n, language);
    const detail: RegionPopulationNodeDetail = {
      id: n.id,
      nameZh: pickI18n(n.nameI18n, language, loc.name),
      densityPerKm2,
      note: pickI18n(n.noteI18n, language, loc.note),
    };
    if (selectedRange) {
      detail.rangeStartDensity = Math.round(
        interpolateKeyframes(n.densityKeyframes, clamp(wStart, n.validFrom, n.validTo)),
      );
      detail.rangeEndDensity = Math.round(
        interpolateKeyframes(n.densityKeyframes, clamp(wEnd, n.validFrom, n.validTo)),
      );
    }
    return detail;
  });

  const popDensities = populationDetails.map((d) => d.densityPerKm2);
  const peakDensityPerKm2 = popDensities.length > 0 ? Math.max(...popDensities) : null;
  const avgDensityPerKm2 =
    popDensities.length > 0
      ? Math.round(popDensities.reduce((a, b) => a + b, 0) / popDensities.length)
      : null;

  // 4. Matched night-light nodes & node-level details
  const allNightNodes: ImportedNightLightNodeRecord[] = getNightLightNodes(importedBundle);

  const matchedNightNodes = allNightNodes.filter((n) => {
    if (!intervalsOverlap(n.validFrom, n.validTo, wStart, wEnd)) return false;
    if (!selectedRegion) return true;
    return isPointInRegionSelection(n.coords[0], n.coords[1], selectedRegion, 0.22);
  });

  const nightLightDetails: RegionNightLightNodeDetail[] = matchedNightNodes.map((n) => {
    const evalYr = clamp(yr, n.validFrom, n.validTo);
    const intensityPct = Math.round(interpolateKeyframes(n.intensityKeyframes, evalYr) * 100);
    const loc = localizeNightLightNode(n, language);
    const detail: RegionNightLightNodeDetail = {
      id: n.id,
      nameZh: pickI18n(n.nameI18n, language, loc.name),
      categoryZh: loc.categoryLabel,
      intensityPct,
      description: pickI18n(n.descriptionI18n, language, loc.description),
    };
    if (selectedRange) {
      detail.rangeStartPct = Math.round(
        interpolateKeyframes(n.intensityKeyframes, clamp(wStart, n.validFrom, n.validTo)) * 100,
      );
      detail.rangeEndPct = Math.round(
        interpolateKeyframes(n.intensityKeyframes, clamp(wEnd, n.validFrom, n.validTo)) * 100,
      );
    }
    return detail;
  });

  const peakNightLightPct =
    nightLightDetails.length > 0
      ? Math.max(...nightLightDetails.map((d) => d.intensityPct))
      : null;

  // 5. Matched transport routes
  const allRoutes: ImportedTransportRouteRecord[] = getTransportRoutes(importedBundle);

  const matchedRoutes = allRoutes.filter((r) => {
    if (!intervalsOverlap(r.openedYear, r.closedYear, wStart, wEnd)) return false;
    if (!selectedRegion) return true;
    return doesRouteIntersectSelection(r.waypoints, selectedRegion);
  });

  const totalAnnualVoyages = matchedRoutes.reduce((sum, r) => {
    const evalY = clamp(sampleMidYear, r.openedYear, r.closedYear);
    return sum + Math.round(interpolateKeyframes(r.usageKeyframes, evalY));
  }, 0);

  // 6. Matched mortality catastrophes & species discoveries
  const allCatastrophes: ImportedMortalityCatastropheRecord[] =
    getMortalityCatastrophes(importedBundle);

  const matchedCatastrophes = allCatastrophes.filter((ev) => {
    const timeMatch = selectedRange
      ? intervalsOverlap(ev.startYear, ev.endYear, wStart, wEnd)
      : yr >= ev.startYear - 3 && yr <= ev.endYear + 8;
    if (!timeMatch) return false;
    if (!selectedRegion) return true;
    if (isPointInRegionSelection(ev.coords[0], ev.coords[1], selectedRegion, 0.25)) {
      return true;
    }
    return (ev.thermalSubZones || []).some((sub) =>
      isPointInRegionSelection(sub.coords[0], sub.coords[1], selectedRegion, 0.22),
    );
  });

  const allSpecies: ImportedSpeciesDiscoveryRecord[] = getSpeciesDiscoveries(importedBundle);

  const matchedSpecies = allSpecies.filter((sp) => {
    const timeMatch = selectedRange
      ? sp.discoveryYear >= wStart && sp.discoveryYear <= wEnd
      : yr >= sp.discoveryYear && yr <= sp.discoveryYear + 22;
    if (!timeMatch) return false;
    if (!selectedRegion) return true;
    return isPointInRegionSelection(sp.coords[0], sp.coords[1], selectedRegion, 0.25);
  });

  // 7. Layer-Aware Historical Events & Data Summary List
  const events: RegionEventSummaryItem[] = [];
  const hasSpecificOverlay = activeLayers.length > 0;
  const showAllBaselineEvents = !hasSpecificOverlay;

  // 7A. Polity Phase transitions
  if (candidatePolities.length > 0 && (showAllBaselineEvents || Boolean(selectedRegion))) {
    const relevantPolityPhases = candidatePolities.filter((phase) => {
      if (!intervalsOverlap(phase.startYear, phase.endYear, wStart, wEnd)) return false;
      if (!selectedRegion) return true;
      if (
        isPointInRegionSelection(
          phase.capitalCoords[0],
          phase.capitalCoords[1],
          selectedRegion,
          0.3,
        )
      ) {
        return true;
      }
      return matchedTerritories.some((t) =>
        intervalsOverlap(t.validFrom, t.validTo, phase.startYear, phase.endYear),
      );
    });

    for (const phase of relevantPolityPhases) {
      const locPol = resolvePolityText(phase);
      const terrCount = allTerritories.filter((t) => {
        if (t.polityId && t.polityId !== phase.id) return false;
        return intervalsOverlap(t.validFrom, t.validTo, phase.startYear, phase.endYear);
      }).length;
      events.push({
        id: `polity_${phase.id}`,
        year: phase.startYear,
        endYear: phase.endYear,
        yearLabel: `${formatYearByLang(phase.startYear, language, true)}–${formatYearByLang(
          phase.endYear,
          language,
          true,
        )}`,
        category: 'polity',
        categoryLabelZh:
          language === 'en' ? 'Polity' : language === 'de' ? 'Herrschaft' : '政权演进',
        titleZh: locPol.name,
        locationZh: locPol.capitalName,
        metricLabel:
          language === 'en'
            ? `${terrCount} territories`
            : language === 'de'
              ? `${terrCount} Gebiete`
              : `控制 ${terrCount} 处辖区`,
        summaryZh: locPol.summary,
        sourceCitation: phase.sourceCitation,
      });
    }
  }

  // 7B. Population Density layer records
  if (activeLayers.includes('population_density')) {
    for (const p of populationDetails) {
      const unitStr = language === 'en' ? '/km²' : language === 'de' ? 'Einw./km²' : '人/km²';
      const approxPrefix = language === 'en' ? '~' : language === 'de' ? 'ca. ' : '约 ';
      const metricStr =
        selectedRange && p.rangeStartDensity !== undefined && p.rangeEndDensity !== undefined
          ? `${p.rangeStartDensity}→${p.rangeEndDensity} ${unitStr}`
          : `${approxPrefix}${p.densityPerKm2} ${unitStr}`;
      events.push({
        id: p.id,
        year: yr,
        yearLabel: timeLabelZh,
        category: 'population',
        categoryLabelZh: getOverlayLayerName('population_density', language),
        titleZh: p.nameZh,
        locationZh: p.nameZh,
        metricLabel: metricStr,
        summaryZh: p.note,
      });
    }
  }

  // 7C. Nighttime Illumination layer records
  if (activeLayers.includes('night_lights')) {
    for (const nl of nightLightDetails) {
      const metricStr =
        selectedRange && nl.rangeStartPct !== undefined && nl.rangeEndPct !== undefined
          ? language === 'en'
            ? `Light ${nl.rangeStartPct}%→${nl.rangeEndPct}%`
            : language === 'de'
              ? `Licht ${nl.rangeStartPct}%→${nl.rangeEndPct}%`
              : `光强 ${nl.rangeStartPct}%→${nl.rangeEndPct}%`
          : language === 'en'
            ? `Radiance ${nl.intensityPct}%`
            : language === 'de'
              ? `Lichtstärke ${nl.intensityPct}%`
              : `相对光强 ${nl.intensityPct}%`;
      events.push({
        id: nl.id,
        year: yr,
        yearLabel: nl.categoryZh,
        category: 'night_light',
        categoryLabelZh: getOverlayLayerName('night_lights', language),
        titleZh: nl.nameZh,
        locationZh: nl.nameZh,
        metricLabel: metricStr,
        summaryZh: nl.description,
      });
    }
  }

  // 7D. Mortality Catastrophes
  if (showAllBaselineEvents || activeLayers.includes('mortality_catastrophe')) {
    for (const cat of matchedCatastrophes) {
      const locCat = localizeCatastrophe(cat, language);
      const deathsStr = formatNumberByLang(cat.estimatedDeaths, language);
      events.push({
        id: cat.id,
        year: cat.startYear,
        endYear: cat.endYear,
        yearLabel:
          cat.startYear === cat.endYear
            ? formatYearByLang(cat.startYear, language, true)
            : `${formatYearByLang(cat.startYear, language, true)}–${formatYearByLang(
                cat.endYear,
                language,
                true,
              )}`,
        category: 'catastrophe',
        categoryLabelZh: locCat.categoryLabel,
        titleZh: pickI18n(cat.nameI18n, language, locCat.name),
        locationZh: pickI18n(cat.locationNameI18n, language, locCat.location),
        metricLabel:
          language === 'en'
            ? `~${deathsStr} deaths`
            : language === 'de'
              ? `ca. ${deathsStr} Opfer`
              : `约 ${deathsStr} 人死亡`,
        summaryZh: pickI18n(cat.historicalNoteI18n, language, locCat.note),
        sourceCitation: cat.sourceCitation,
      });
    }
  }

  // 7E. Species Discoveries
  if (showAllBaselineEvents || activeLayers.includes('species_discovery')) {
    for (const sp of matchedSpecies) {
      const locSp = localizeSpecies(sp, language);
      const commonName = pickI18n(sp.commonNameI18n, language, locSp.commonName);
      const classicalSuffix = sp.classicalSourceName ? ` · ${sp.classicalSourceName}` : '';
      events.push({
        id: sp.id,
        year: sp.discoveryYear,
        yearLabel: formatYearByLang(sp.discoveryYear, language, true),
        category: 'species',
        categoryLabelZh:
          language === 'en' ? 'Species' : language === 'de' ? 'Artenfund' : '物种记述',
        titleZh: `${commonName} (${sp.scientificName}${classicalSuffix})`,
        locationZh: pickI18n(sp.locationNameI18n, language, locSp.location),
        metricLabel: pickI18n(sp.discovererI18n, language, locSp.discoverer),
        summaryZh: pickI18n(sp.historicalNoteI18n, language, locSp.note),
        sourceCitation: sp.sourceCitation,
      });
    }
  }

  // 7F. Maritime Transport Routes
  if (activeLayers.includes('transport_routes') || (showAllBaselineEvents && selectedRegion)) {
    for (const r of matchedRoutes) {
      const evalY = clamp(sampleMidYear, r.openedYear, r.closedYear);
      const voyages = Math.round(interpolateKeyframes(r.usageKeyframes, evalY));
      const locRt = localizeTransportRoute(r, language);
      const openedYearStr = formatYearByLang(r.openedYear, language, true);
      const originLabel = pickI18n(r.originNameI18n, language, locRt.origin);
      const destLabel = pickI18n(r.destinationNameI18n, language, locRt.destination);
      const cargoLabel = pickI18n(r.cargoSummaryI18n, language, locRt.cargo);
      events.push({
        id: r.id,
        year: r.openedYear,
        endYear: r.closedYear,
        yearLabel:
          language === 'en'
            ? `Opened ${openedYearStr}`
            : language === 'de'
              ? `Ab ${openedYearStr}`
              : `${openedYearStr} 开通`,
        category: 'route',
        categoryLabelZh: getOverlayLayerName('transport_routes', language),
        titleZh: pickI18n(r.nameI18n, language, locRt.name),
        locationZh: `${originLabel} → ${destLabel}`,
        metricLabel:
          language === 'en'
            ? `~${voyages} voyages/yr`
            : language === 'de'
              ? `ca. ${voyages} Fahrten/J.`
              : `约 ${voyages} 航次/年`,
        summaryZh:
          language === 'en'
            ? `Cargo: ${cargoLabel}`
            : language === 'de'
              ? `Fracht: ${cargoLabel}`
              : `承运物资：${cargoLabel}`,
        sourceCitation: r.sourceCitation,
      });
    }
  }

  // 7F-2. Space Missions (when space_race is active or baseline view)
  const allSpaceMissions = getSpaceMissions(importedBundle);
  if (allSpaceMissions.length > 0 && (showAllBaselineEvents || activeLayers.includes('space_race'))) {
    for (const sm of allSpaceMissions) {
      if (!intervalsOverlap(sm.launchYear, sm.arrivalYear, wStart, wEnd)) continue;
      events.push({
        id: sm.id,
        year: sm.launchYear,
        endYear: sm.arrivalYear,
        yearLabel:
          sm.launchYear === sm.arrivalYear
            ? formatYearByLang(sm.launchYear, language, true)
            : `${formatYearByLang(sm.launchYear, language, true)}–${formatYearByLang(
                sm.arrivalYear,
                language,
                true,
              )}`,
        category: 'custom',
        categoryLabelZh: getOverlayLayerName('space_race', language),
        titleZh: pickI18n(sm.nameI18n, language, sm.nameZh),
        locationZh: `${sm.originBodyId} → ${sm.targetBodyId}`,
        metricLabel: sm.agency,
        summaryZh: pickI18n(sm.missionStatusI18n, language, sm.missionStatusZh),
      });
    }
  }

  // 7G. User-extensible Custom Events from `data/events/custom_events.json` & `atlas_bundle.json`
  const combinedCustomEvents: CustomHistoricalEvent[] = [...customEvents];
  if (importedBundle?.customEvents?.length) {
    const existingIds = new Set(combinedCustomEvents.map((e) => e.id).filter(Boolean));
    for (const ce of importedBundle.customEvents) {
      if (ce.id && existingIds.has(ce.id)) continue;
      combinedCustomEvents.push(ce);
    }
  }

  for (let i = 0; i < combinedCustomEvents.length; i++) {
    const ce = combinedCustomEvents[i];
    if (!ce || typeof ce !== 'object') continue;
    if (
      hasSpecificOverlay &&
      ce.relatedLayers &&
      ce.relatedLayers.length > 0 &&
      !ce.relatedLayers.some((l) => activeLayers.includes(l))
    ) {
      continue;
    }
    const cStart =
      typeof ce.startYear === 'number'
        ? ce.startYear
        : typeof ce.year === 'number'
          ? ce.year
          : null;
    const cEnd = typeof ce.endYear === 'number' ? ce.endYear : cStart;
    if (cStart !== null && cEnd !== null && !intervalsOverlap(cStart, cEnd, wStart, wEnd)) {
      continue;
    }

    if (selectedRegion) {
      let spatialMatch = true;
      if (Array.isArray(ce.coords) && ce.coords.length >= 2) {
        spatialMatch = isPointInRegionSelection(ce.coords[0], ce.coords[1], selectedRegion, 0.25);
      } else if (ce.bbox) {
        spatialMatch = bboxesOverlap(ce.bbox, selectedRegion.bbox);
      }
      if (!spatialMatch) continue;
    }

    const fallbackTitle = (
      language === 'zh' ? ce.nameZh || ce.title : ce.title || ce.nameZh || ''
    )?.trim();
    const title = pickI18n(ce.nameI18n, language, fallbackTitle || '');
    if (!title) continue;

    const defaultCategory =
      language === 'en' ? 'Custom Record' : language === 'de' ? 'Zusatzquelle' : '扩展史料';

    events.push({
      id: ce.id || `custom_ev_${i}`,
      year: cStart ?? yr,
      endYear: cEnd ?? undefined,
      yearLabel: cStart !== null ? formatYearByLang(cStart, language, true) : timeLabelZh,
      category: 'custom',
      categoryLabelZh: pickI18n(ce.categoryI18n, language, ce.category || defaultCategory),
      titleZh: title,
      locationZh: pickI18n(ce.locationI18n, language, ce.locationNameZh || regionTitleZh),
      metricLabel: pickI18n(ce.metricI18n, language, ce.metricLabel || '') || undefined,
      summaryZh: pickI18n(ce.summaryI18n, language, ce.summary || ce.description || ''),
      sourceCitation: ce.sourceCitation,
    });
  }

  events.sort((a, b) => a.year - b.year || a.id.localeCompare(b.id));

  const metrics: RegionLayerMetrics = {
    matchedTerritoryNames: matchedTerritories.map((t) =>
      pickI18n(t.nameI18n, language, localizeTerritoryName(t.id, t.nameZh, language)),
    ),
    populationNodeCount: matchedPopNodes.length,
    peakDensityPerKm2,
    avgDensityPerKm2,
    nightLightNodeCount: matchedNightNodes.length,
    peakNightLightPct,
    activeRouteCount: matchedRoutes.length,
    totalAnnualVoyages,
    catastropheCount: matchedCatastrophes.length,
    totalEstimatedDeaths: matchedCatastrophes.reduce((s, c) => s + c.estimatedDeaths, 0),
    speciesCount: matchedSpecies.length,
  };

  return {
    hasSelection: Boolean(selectedRegion),
    selectionKind: selectedRegion ? selectedRegion.kind : 'none',
    regionTitleZh,
    coordsSummary,
    currentYear: yr,
    selectedRange,
    timeWindow,
    timeLabelZh,
    activePolityNameZh: localizedActivePolity ? localizedActivePolity.name : null,
    activeEraSubtitle: localizedActivePolity ? localizedActivePolity.eraSubtitle : null,
    activeLayers,
    activeLayerLabelsZh,
    metrics,
    populationDetails,
    nightLightDetails,
    events,
  };
}

/**
 * Builds the structured context block injected into the Gemini model prompt on `POST /api/chat`,
 * tightly coupling [Selected Region / Global] × [Time Point / Interval] × [Active Overlaid Layers]
 * in the user's selected language (`zh` | `en` | `de`).
 */
export function formatContextForPrompt(
  overview: RegionOverviewData,
  books: BookListItem[] = [],
  language: AppLanguage = 'zh',
): string {
  const m = overview.metrics;
  const activeSet = new Set(overview.activeLayers);
  const noSpecialOverlay = activeSet.size === 0;
  const [wStart, wEnd] = overview.timeWindow;

  const relevantBooks = books.filter((b) => {
    if (!b || (!b.title && !b.note)) return false;
    if (
      typeof b.startYear === 'number' &&
      typeof b.endYear === 'number' &&
      !intervalsOverlap(b.startYear, b.endYear, wStart, wEnd)
    ) {
      return false;
    }
    if (
      overview.activeLayers.length > 0 &&
      b.relatedLayers &&
      b.relatedLayers.length > 0 &&
      !b.relatedLayers.some((l) => activeSet.has(l))
    ) {
      return false;
    }
    return true;
  });

  if (language === 'en') {
    const lines: string[] = [];
    if (overview.hasSelection) {
      lines.push(
        '=== SELECTED MAP REGION CONTEXT (Answer strictly within this geographic selection, timeframe, and active overlaid layers) ===',
      );
      lines.push(`- Selected Region: ${overview.regionTitleZh} (Type: ${overview.selectionKind})`);
      lines.push(`- Geographic Bounds: ${overview.coordsSummary}`);
    } else {
      lines.push(
        '=== GLOBAL TIMELINE CONTEXT (No specific region selected; answer from the global viewport, timeframe, and active overlaid layers) ===',
      );
    }
    lines.push(`- Active Time Point / Interval: ${overview.timeLabelZh}`);
    const dataBounds = computeDatasetYearBounds();
    const boundsLabelEn = dataBounds
      ? `${formatYearByLang(dataBounds.minYear, 'en', true)} – ${formatYearByLang(dataBounds.maxYear, 'en', true)}`
      : 'no loaded dataset';
    lines.push(
      `- Historical Polity Phase: ${
        overview.activePolityNameZh
          ? `${overview.activePolityNameZh} (${overview.activeEraSubtitle || ''})`
          : `Outside active polity intervals (loaded dataset span: ${boundsLabelEn})`
      }`,
    );
    lines.push(`- Displayed Layer Stack: ${overview.activeLayerLabelsZh.join(' + ')}`);

    lines.push('\n=== ACTIVE OVERLAID LAYER CORRELATION DIRECTIVES ===');
    for (const d of buildActiveLayerFocusDirective(overview.activeLayers, 'en')) {
      lines.push(d);
    }

    lines.push('\n[Empirical Metrics & Node Details for Active Layers]');
    lines.push(
      `- Controlled Territories (${m.matchedTerritoryNames.length}): ${
        m.matchedTerritoryNames.length > 0 ? m.matchedTerritoryNames.join('; ') : 'None'
      }`,
    );

    if (activeSet.has('population_density')) {
      lines.push(
        `- [Population Density Layer] ${m.populationNodeCount} settlement zones, average ~${
          m.avgDensityPerKm2 ?? 0
        } pers./km², peak ~${m.peakDensityPerKm2 ?? 0} pers./km²:`,
      );
      for (const p of overview.populationDetails) {
        const trend =
          p.rangeStartDensity !== undefined && p.rangeEndDensity !== undefined
            ? ` (Range: ${p.rangeStartDensity} → ${p.rangeEndDensity} pers./km², current: ${p.densityPerKm2} pers./km²)`
            : ` (~${p.densityPerKm2} pers./km²)`;
        lines.push(`  * ${p.nameZh}${trend}: ${p.note}`);
      }
    }

    if (activeSet.has('night_lights')) {
      lines.push(
        `- [Nighttime Lights Layer] ${m.nightLightNodeCount} pre-industrial nocturnal light nodes, peak relative radiance ${
          m.peakNightLightPct ?? 0
        }%:`,
      );
      for (const nl of overview.nightLightDetails) {
        const trend =
          nl.rangeStartPct !== undefined && nl.rangeEndPct !== undefined
            ? ` (Range: ${nl.rangeStartPct}% → ${nl.rangeEndPct}%, current: ${nl.intensityPct}%)`
            : ` (Relative radiance: ${nl.intensityPct}%)`;
        lines.push(`  * ${nl.nameZh} [${nl.categoryZh}]${trend}: ${nl.description}`);
      }
    }

    if (activeSet.has('transport_routes')) {
      lines.push(
        `- [Maritime Routes Layer] ${m.activeRouteCount} active sea lanes, ~${m.totalAnnualVoyages} voyages/yr total.`,
      );
    }
    if (activeSet.has('mortality_catastrophe')) {
      lines.push(
        `- [Mortality & Wars Layer] ${m.catastropheCount} major catastrophe events, ~${m.totalEstimatedDeaths.toLocaleString('en-US')} total estimated fatalities.`,
      );
    }
    if (activeSet.has('species_discovery')) {
      lines.push(`- [Species Discovery Layer] ${m.speciesCount} classical natural-history records.`);
    }
    if (noSpecialOverlay) {
      lines.push(
        `- Baseline Reference: ${m.populationNodeCount} settlement zones (peak ${
          m.peakDensityPerKm2 ?? '—'
        } pers./km²), ${m.activeRouteCount} sea lanes (${m.totalAnnualVoyages} voyages/yr), ${
          m.catastropheCount
        } major casualty events.`,
      );
    }

    lines.push(`\n[Matched Events & Layer Records (${overview.events.length} items)]`);
    if (overview.events.length === 0) {
      lines.push('(No matching records within the current spatial, temporal, and layer selection)');
    } else {
      for (const ev of overview.events) {
        const metricPart = ev.metricLabel ? ` | Metric: ${ev.metricLabel}` : '';
        const sourcePart = ev.sourceCitation ? ` | Source: ${ev.sourceCitation}` : '';
        lines.push(
          `- [${ev.yearLabel}] [${ev.categoryLabelZh}] ${ev.titleZh} (Location: ${ev.locationZh}${metricPart}): ${ev.summaryZh}${sourcePart}`,
        );
      }
    }

    if (relevantBooks.length > 0) {
      lines.push('\n[Reference Booklist (from data/booklists/books.json & atlas_bundle.json)]');
      for (const b of relevantBooks) {
        const bTitle = pickI18n(b.titleI18n, 'en', b.title || 'Untitled');
        const bNote = pickI18n(b.noteI18n, 'en', b.note || '');
        lines.push(
          `- ${bTitle}${b.author ? ` (${b.author})` : ''}${bNote ? `: ${bNote}` : ''}`,
        );
      }
    }
    return lines.join('\n');
  }

  if (language === 'de') {
    const lines: string[] = [];
    if (overview.hasSelection) {
      lines.push(
        '=== STRUKTURIERTER KONTEXT DES AUSGEWÄHLTEN KARTENGEBIETS (Bitte strikt bezogen auf dieses Gebiet, den Zeitraum und die aktiven Ebenen antworten) ===',
      );
      lines.push(`- Ausgewähltes Gebiet: ${overview.regionTitleZh} (Typ: ${overview.selectionKind})`);
      lines.push(`- Koordinatenbereich: ${overview.coordsSummary}`);
    } else {
      lines.push(
        '=== GLOBALER ZEITLEISTENKONTEXT (Kein Teilgebiet ausgewählt; bitte bezogen auf die globale Ansicht, den Zeitraum und die aktiven Ebenen antworten) ===',
      );
    }
    lines.push(`- Aktueller Zeitpunkt / Zeitraum: ${overview.timeLabelZh}`);
    const dataBoundsDe = computeDatasetYearBounds();
    const boundsLabelDe = dataBoundsDe
      ? `${formatYearByLang(dataBoundsDe.minYear, 'de', true)} – ${formatYearByLang(dataBoundsDe.maxYear, 'de', true)}`
      : 'keine Daten';
    lines.push(
      `- Historische Herrschaftsphase: ${
        overview.activePolityNameZh
          ? `${overview.activePolityNameZh} (${overview.activeEraSubtitle || ''})`
          : `Außerhalb aktiver Herrschaftsphasen (Datenfenster: ${boundsLabelDe})`
      }`,
    );
    lines.push(`- Aktive Ebenenkombination: ${overview.activeLayerLabelsZh.join(' + ')}`);

    lines.push('\n=== ANFORDERUNGEN ZUR EBENENKORRELATION ===');
    for (const d of buildActiveLayerFocusDirective(overview.activeLayers, 'de')) {
      lines.push(d);
    }

    lines.push('\n[Empirische Kennzahlen & Knotendaten der aktiven Ebenen]');
    lines.push(
      `- Kontrollierte Gebiete (${m.matchedTerritoryNames.length}): ${
        m.matchedTerritoryNames.length > 0 ? m.matchedTerritoryNames.join('; ') : 'Keine'
      }`,
    );

    if (activeSet.has('population_density')) {
      lines.push(
        `- [Ebene Bevölkerungsdichte] ${m.populationNodeCount} Siedlungszonen, Mittelwert ca. ${
          m.avgDensityPerKm2 ?? 0
        } Einw./km², Spitzenwert ca. ${m.peakDensityPerKm2 ?? 0} Einw./km²:`,
      );
      for (const p of overview.populationDetails) {
        const trend =
          p.rangeStartDensity !== undefined && p.rangeEndDensity !== undefined
            ? ` (Zeitraum: ${p.rangeStartDensity} → ${p.rangeEndDensity} Einw./km², aktuell: ${p.densityPerKm2} Einw./km²)`
            : ` (ca. ${p.densityPerKm2} Einw./km²)`;
        lines.push(`  * ${p.nameZh}${trend}: ${p.note}`);
      }
    }

    if (activeSet.has('night_lights')) {
      lines.push(
        `- [Ebene Nachtbeleuchtung] ${m.nightLightNodeCount} vorindustrielle Lichtquellenknoten, maximale relative Lichtstärke ${
          m.peakNightLightPct ?? 0
        }%:`,
      );
      for (const nl of overview.nightLightDetails) {
        const trend =
          nl.rangeStartPct !== undefined && nl.rangeEndPct !== undefined
            ? ` (Zeitraum: ${nl.rangeStartPct}% → ${nl.rangeEndPct}%, aktuell: ${nl.intensityPct}%)`
            : ` (Relative Lichtstärke: ${nl.intensityPct}%)`;
        lines.push(`  * ${nl.nameZh} [${nl.categoryZh}]${trend}: ${nl.description}`);
      }
    }

    if (activeSet.has('transport_routes')) {
      lines.push(
        `- [Ebene Seehandelsrouten] ${m.activeRouteCount} aktive Routen, insgesamt ca. ${m.totalAnnualVoyages} Fahrten/Jahr.`,
      );
    }
    if (activeSet.has('mortality_catastrophe')) {
      lines.push(
        `- [Ebene Opfer & Katastrophen] ${m.catastropheCount} Großereignisse, insgesamt ca. ${m.totalEstimatedDeaths.toLocaleString('de-DE')} geschätzte Todesopfer.`,
      );
    }
    if (activeSet.has('species_discovery')) {
      lines.push(`- [Ebene Artenentdeckung] ${m.speciesCount} antike naturkundliche Einträge.`);
    }
    if (noSpecialOverlay) {
      lines.push(
        `- Basisreferenz: ${m.populationNodeCount} Siedlungszonen (Spitze ${
          m.peakDensityPerKm2 ?? '—'
        } Einw./km²), ${m.activeRouteCount} Seehandelsrouten (${m.totalAnnualVoyages} Fahrten/J.), ${
          m.catastropheCount
        } Großereignisse.`,
      );
    }

    lines.push(`\n[Passende Ereignisse & Ebeneneinträge (${overview.events.length} Einträge)]`);
    if (overview.events.length === 0) {
      lines.push('(Keine passenden Einträge für diese Gebiets-, Zeit- und Ebenenauswahl)');
    } else {
      for (const ev of overview.events) {
        const metricPart = ev.metricLabel ? ` | Kennzahl: ${ev.metricLabel}` : '';
        const sourcePart = ev.sourceCitation ? ` | Quelle: ${ev.sourceCitation}` : '';
        lines.push(
          `- [${ev.yearLabel}] [${ev.categoryLabelZh}] ${ev.titleZh} (Ort: ${ev.locationZh}${metricPart}): ${ev.summaryZh}${sourcePart}`,
        );
      }
    }

    if (relevantBooks.length > 0) {
      lines.push('\n[Literaturliste (aus data/booklists/books.json & atlas_bundle.json)]');
      for (const b of relevantBooks) {
        const bTitle = pickI18n(b.titleI18n, 'de', b.title || 'Ohne Titel');
        const bNote = pickI18n(b.noteI18n, 'de', b.note || '');
        lines.push(
          `- ${bTitle}${b.author ? ` (${b.author})` : ''}${bNote ? `: ${bNote}` : ''}`,
        );
      }
    }
    return lines.join('\n');
  }

  // Default Chinese ('zh')
  const lines: string[] = [];

  if (overview.hasSelection) {
    lines.push(
      '=== 当前地图选中区域结构化上下文（请严格围绕以下划定区域、时间范围及叠加激活图层作答） ===',
    );
    lines.push(`- 选中区域名称：${overview.regionTitleZh}（选区类型：${overview.selectionKind}）`);
    lines.push(`- 地理坐标范围：${overview.coordsSummary}`);
  } else {
    lines.push(
      '=== 当前全局时间轴状态上下文（用户当前未框选特定区域，请基于全局视野、时间范围及叠加激活图层作答） ===',
    );
  }

  lines.push(`- 当前时间轴位置/区间：${overview.timeLabelZh}`);
  const dataBoundsZh = computeDatasetYearBounds();
  const boundsLabelZh = dataBoundsZh
    ? `${formatYearByLang(dataBoundsZh.minYear, 'zh', true)} – ${formatYearByLang(dataBoundsZh.maxYear, 'zh', true)}`
    : '暂无数据集';
  lines.push(
    `- 当前所属历史政权阶段：${
      overview.activePolityNameZh
        ? `${overview.activePolityNameZh}（${overview.activeEraSubtitle || ''}）`
        : `当前年份未匹配激活政权区间（已载入数据集跨度：${boundsLabelZh}）`
    }`,
  );
  lines.push(`- 当前显示图层组合：${overview.activeLayerLabelsZh.join(' + ')}`);

  lines.push('\n=== 当前叠加图层强相关分析要求 ===');
  for (const directive of buildActiveLayerFocusDirective(overview.activeLayers, 'zh')) {
    lines.push(directive);
  }

  lines.push('\n【当前激活图层实证指标与节点明细】');
  lines.push(
    `- 政权控制辖区（共 ${m.matchedTerritoryNames.length} 处）：${
      m.matchedTerritoryNames.length > 0 ? m.matchedTerritoryNames.join('；') : '无'
    }`,
  );

  if (activeSet.has('population_density')) {
    lines.push(
      `- 【人口密度图层】匹配 ${m.populationNodeCount} 个聚落统计区，平均密度约 ${
        m.avgDensityPerKm2 ?? 0
      } 人/km²，峰值密度约 ${m.peakDensityPerKm2 ?? 0} 人/km²：`,
    );
    if (overview.populationDetails.length === 0) {
      lines.push('  * 当前选区/时间范围内无已录入人口密度聚落节点。');
    } else {
      for (const p of overview.populationDetails) {
        const trend =
          p.rangeStartDensity !== undefined && p.rangeEndDensity !== undefined
            ? `（区间起止：${p.rangeStartDensity} → ${p.rangeEndDensity} 人/km²，当前点：${p.densityPerKm2} 人/km²）`
            : `（当前密度：约 ${p.densityPerKm2} 人/km²）`;
        lines.push(`  * ${p.nameZh}${trend}：${p.note}`);
      }
    }
  }

  if (activeSet.has('night_lights')) {
    lines.push(
      `- 【夜晚光照图层】匹配 ${m.nightLightNodeCount} 处前工业夜间核心光源节点，峰值相对辐射光强 ${
        m.peakNightLightPct ?? 0
      }%（地面同时叠加与人口聚落分布耦合的连续琥珀热力辐射场）：`,
    );
    if (overview.nightLightDetails.length === 0) {
      lines.push('  * 当前选区/时间范围内无已录入核心夜间火光节点。');
    } else {
      for (const nl of overview.nightLightDetails) {
        const trend =
          nl.rangeStartPct !== undefined && nl.rangeEndPct !== undefined
            ? `（区间起止光强：${nl.rangeStartPct}% → ${nl.rangeEndPct}%，当前：${nl.intensityPct}%）`
            : `（相对光强：${nl.intensityPct}%）`;
        lines.push(`  * ${nl.nameZh}［${nl.categoryZh}］${trend}：${nl.description}`);
      }
    }
  }

  if (activeSet.has('transport_routes')) {
    lines.push(
      `- 【运输航道图层】途经 ${m.activeRouteCount} 条海运/贸易干线，合计约 ${m.totalAnnualVoyages} 航次/年。`,
    );
  }

  if (activeSet.has('mortality_catastrophe')) {
    lines.push(
      `- 【死亡浩劫图层】匹配 ${m.catastropheCount} 起战争/瘟疫/饥荒浩劫事件，累计估算死亡约 ${m.totalEstimatedDeaths.toLocaleString()} 人。`,
    );
  }

  if (activeSet.has('species_discovery')) {
    lines.push(`- 【物种发现图层】匹配 ${m.speciesCount} 项古典动植物文献记录。`);
  }

  if (noSpecialOverlay) {
    lines.push(
      `- 基础背景参考：覆盖人口节点 ${m.populationNodeCount} 处（峰值 ${
        m.peakDensityPerKm2 ?? '—'
      } 人/km²）、海运航线 ${m.activeRouteCount} 条（合计 ${m.totalAnnualVoyages} 航次/年）、重大伤亡事件 ${
        m.catastropheCount
      } 起。`,
    );
  }

  lines.push(`\n【与当前时空及激活图层匹配的数据与事件简表（共 ${overview.events.length} 条）】`);
  if (overview.events.length === 0) {
    lines.push('（当前选定地理范围、时间窗口与激活图层下暂无匹配的具体记录）');
  } else {
    for (const ev of overview.events) {
      const metricPart = ev.metricLabel ? ` | 指标：${ev.metricLabel}` : '';
      const sourcePart = ev.sourceCitation ? ` | 出处：${ev.sourceCitation}` : '';
      lines.push(
        `- [${ev.yearLabel}] 【${ev.categoryLabelZh}】${ev.titleZh}（地点：${ev.locationZh}${metricPart}）：${ev.summaryZh}${sourcePart}`,
      );
    }
  }

  if (relevantBooks.length > 0) {
    lines.push('\n【扩展参考书单（来自 data/booklists/books.json 与 atlas_bundle.json）】');
    for (const b of relevantBooks) {
      const bTitle = pickI18n(b.titleI18n, 'zh', b.title || '未命名文献');
      const bNote = pickI18n(b.noteI18n, 'zh', b.note || '');
      lines.push(
        `- ${bTitle}${b.author ? `（作者：${b.author}）` : ''}${bNote ? `：${bNote}` : ''}`,
      );
    }
  }

  return lines.join('\n');
}
