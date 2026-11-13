import { getTerritoryRegions } from '../shared/atlasDataLayer';
import {
  AppLanguage,
  CelestialBodySpec,
  ImportedMortalityCatastropheRecord,
  ImportedNightLightNodeRecord,
  ImportedPolityRecord,
  ImportedPopulationNodeRecord,
  ImportedSpeciesDiscoveryRecord,
  ImportedTransportRouteRecord,
  MortalityCatastrophe,
  NightLightNode,
  OverlayLayerId,
  PolityPhase,
  PopulationDensityNode,
  SpeciesDiscovery,
  TransportRoute,
} from '../types/history';

export interface LanguageOption {
  code: AppLanguage;
  shortLabel: string;
  nativeLabel: string;
  htmlLang: string;
}

/**
 * Strictly limited to Chinese, English, and German per product specification.
 */
export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', shortLabel: 'EN', nativeLabel: 'English', htmlLang: 'en' },
  { code: 'zh', shortLabel: '中文', nativeLabel: '中文', htmlLang: 'zh-CN' },
  { code: 'de', shortLabel: 'DE', nativeLabel: 'Deutsch', htmlLang: 'de' },
] as const;

export function normalizeAppLanguage(val: unknown): AppLanguage {
  if (val === 'en' || val === 'de' || val === 'zh') {
    return val;
  }
  return 'en';
}

export function formatYearByLang(year: number, lang: AppLanguage, compact = false): string {
  const y = Math.round(year);
  if (lang === 'zh') {
    if (y < 0) {
      return compact ? `${Math.abs(y)} BCE` : `公元前 ${Math.abs(y)} 年`;
    }
    const ce = y === 0 ? 1 : y;
    return compact ? `${ce} CE` : `公元 ${ce} 年`;
  }
  if (lang === 'de') {
    if (y < 0) {
      return `${Math.abs(y)} v. Chr.`;
    }
    const ce = y === 0 ? 1 : y;
    return `${ce} n. Chr.`;
  }
  // English ('en')
  if (y < 0) {
    return `${Math.abs(y)} BCE`;
  }
  const ce = y === 0 ? 1 : y;
  return `${ce} CE`;
}

export function formatCompactCountByLang(val: number, lang: AppLanguage): string {
  if (val <= 0) return '—';
  if (lang === 'zh') {
    if (val >= 10000) {
      return `${(val / 10000).toFixed(1)}万`;
    }
    return val.toLocaleString('en-US');
  }
  if (lang === 'de') {
    if (val >= 1000) {
      return `${(val / 1000).toFixed(1).replace('.', ',')} Tsd.`;
    }
    return val.toLocaleString('de-DE');
  }
  if (val >= 1000) {
    return `${(val / 1000).toFixed(1)}k`;
  }
  return val.toLocaleString('en-US');
}

export function formatNumberByLang(val: number, lang: AppLanguage): string {
  if (lang === 'de') return val.toLocaleString('de-DE');
  return val.toLocaleString('en-US');
}

const LAYER_LABELS: Record<
  AppLanguage,
  Record<OverlayLayerId, { label: string; subtitle: string }>
> = {
  zh: {
    population_density: {
      label: '人口密度',
      subtitle: '定量密度热区（15–160+ 人/km²）',
    },
    night_lights: {
      label: '夜晚光照',
      subtitle: '聚落人口分布与工矿夜光辐射',
    },
    transport_routes: {
      label: '运输航道',
      subtitle: '真实海峡海角样条航线与频次着色',
    },
    species_discovery: {
      label: '物种发现',
      subtitle: '新动植物发现地点与博物命名提示',
    },
    mortality_catastrophe: {
      label: '死亡浩劫',
      subtitle: '伤亡人数定量热区与平滑淡入淡出',
    },
    space_race: {
      label: '月球与深空',
      subtitle: '滚轮缩至太阳系平面与探测器轨迹',
    },
  },
  en: {
    population_density: {
      label: 'Population Density',
      subtitle: 'Quantitative thermal field (15–160+ /km²)',
    },
    night_lights: {
      label: 'Nighttime Lights',
      subtitle: 'Urban lamps, beacons & smelting furnaces',
    },
    transport_routes: {
      label: 'Maritime Routes',
      subtitle: 'True strait splines & annual voyage scale',
    },
    species_discovery: {
      label: 'Species Discovery',
      subtitle: 'Classical flora/fauna records & taxonomy',
    },
    mortality_catastrophe: {
      label: 'Mortality & Wars',
      subtitle: 'Casualty thermal field with smooth fade',
    },
    space_race: {
      label: 'Lunar & Deep Space',
      subtitle: 'Scroll out to Solar System ecliptic plane',
    },
  },
  de: {
    population_density: {
      label: 'Bevölkerungsdichte',
      subtitle: 'Quantitative Wärmekarte (15–160+ /km²)',
    },
    night_lights: {
      label: 'Nachtbeleuchtung',
      subtitle: 'Öllampen, Leuchtfeuer & Schmelzöfen',
    },
    transport_routes: {
      label: 'Seehandelsrouten',
      subtitle: 'Reale Meerengen-Splines & Fahrtenfrequenz',
    },
    species_discovery: {
      label: 'Artenentdeckung',
      subtitle: 'Antike Flora-/Faunafunde & Taxonomie',
    },
    mortality_catastrophe: {
      label: 'Opfer & Katastrophen',
      subtitle: 'Opferzahlen-Wärmefeld mit sanftem Übergang',
    },
    space_race: {
      label: 'Mond & Tiefraum',
      subtitle: 'Herauszoomen zur Sonnensystem-Ekliptik',
    },
  },
};

export function getOverlayLayerName(id: OverlayLayerId, lang: AppLanguage): string {
  return LAYER_LABELS[lang][id]?.label ?? id;
}

export function getOverlayLayerSubtitle(id: OverlayLayerId, lang: AppLanguage): string {
  return LAYER_LABELS[lang][id]?.subtitle ?? '';
}

export function getBasePolityLayerName(lang: AppLanguage): string {
  if (lang === 'en') return 'Polities & Historical Flags';
  if (lang === 'de') return 'Herrschaften & Historische Flaggen';
  return '政权与历史旗帜';
}

export function getShortPolityLayerName(lang: AppLanguage): string {
  if (lang === 'en') return 'Polities & Flags';
  if (lang === 'de') return 'Herrschaften & Flaggen';
  return '政权与旗帜';
}

const NIGHT_CATEGORY_LABELS: Record<AppLanguage, Record<NightLightNode['category'], string>> = {
  zh: {
    urban_lamps: '城区密集油灯群',
    harbor_beacon: '海港导航灯塔与船坞夜火',
    smelting_furnace: '昼夜银铅矿冶炼炉群',
    sanctuary_flame: '圣域长明圣火与祭坛',
  },
  en: {
    urban_lamps: 'Urban Olive-Oil Lamps',
    harbor_beacon: 'Harbor Beacons & Dockyards',
    smelting_furnace: '24h Silver Smelting Furnaces',
    sanctuary_flame: 'Sanctuary Altar Flames',
  },
  de: {
    urban_lamps: 'Städtische Öllampen',
    harbor_beacon: 'Hafenleuchtfeuer & Werften',
    smelting_furnace: '24h-Silberschmelzöfen',
    sanctuary_flame: 'Heiligtums- & Altarfeuer',
  },
};

export function localizeNightLightCategory(
  cat: NightLightNode['category'],
  lang: AppLanguage,
): string {
  return NIGHT_CATEGORY_LABELS[lang][cat];
}

export const UI_TEXT = {
  zh: {
    pageTitle: 'Clio-Atlas',
    brandShort: 'Clio-Atlas',
    bootAriaLabel: '正在校准三维地球与高精度历史政区地块',
    bootSubtitle: '全球历史时空地理观测系统',
    bootStageEngine: '正在校准三维球面矢量引擎',
    bootStageParcels: '正在同步高精度政区与海岸地块',
    bootStageDissolve: '正在融合拓扑疆界与渲染地表图层',
    bootStageReady: '精细政区地块校准完成',
    bootParcelLabel: '精细地块单元',
    introNavLabel: '简介',
    introNavAria: '查看项目简介与隐私政策 (/intro)',
    aiChannelAria: '配置 AI 接口与 Gemini 模型通道',
    aiChannelDefaultShort: '默认通道',
    aiChannelCustomShort: '自定义通道',
    aiModalTitle: 'AI 接口与 Gemini 模型通道',
    aiModalSubtitle: '可在平台默认 Gemini 4 Hydrogen 通道与您自己的 API 密钥及模型之间切换',
    aiModeDefault: '默认服务端通道',
    aiModeDefaultDesc: '使用服务端默认密钥与 Gemini 4 Hydrogen 模型',
    aiModeCustom: '自定义 API 与模型',
    aiModeCustomDesc: '使用您自己的 Gemini API Key、可选网关地址与指定模型',
    aiApiKeyLabel: '自定义 Gemini API Key',
    aiApiKeyPlaceholder: '粘贴您的 Gemini API Key（如 AIza...）',
    aiBaseUrlLabel: '自定义 API 端点 URL（可选）',
    aiBaseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    aiModelPresetLabel: '选择 Gemini 模型',
    aiModelCustomOption: '手动输入其他 Gemini 模型 ID…',
    aiModelCustomLabel: '自定义模型 ID',
    aiModelCustomPlaceholder: '例如 gemini-4-hydrogen 或 gemini-4-argon',
    aiLocalNotice: '自定义配置保存在当前浏览器本地，对话请求通过服务端代理通道执行。',
    aiResetBtn: '恢复默认通道',
    aiSaveBtn: '保存配置',
    aiErrEmptyKey: '开启自定义通道时请填写您的 Gemini API Key。',
    aiErrInvalidModel: '请填写有效的 Gemini 模型 ID（不支持已废弃的 1.5 / 2.0 旧版模型）。',
    aiErrInvalidUrl: '自定义端点地址必须以 https:// 或 http:// 开头。',
    coordAria: '实时地理坐标',
    deepSpaceCoord: '黄道深空天体坐标系',
    layerTriggerDefault: '图层叠加',
    openLayerMenuAria: '展开图层叠加菜单',
    clearAllLayersAria: '清空全部叠加图层',
    layerMenuAria: '专题图层多选列表',
    multiSelectHint: '支持多选叠加显示',
    selectedCount: (n: number, total: number) => `已选 ${n} / ${total}`,
    selectAllTerrestrial: '叠加全部地表层',
    clearLayersBtn: '清空叠加图层',
    languageMenuAria: '切换界面语言',
    projectionGroupAria: '投影维度切换',
    globe3d: '3D 地球仪',
    globe3dAria: '切换为三维地球仪',
    map2d: '2D 世界地图',
    map2dAria: '切换为二维世界地图',
    zoomInAria: '放大视图',
    zoomOutAria: '缩小视图',
    resetNorthAria: '重置北向与默认视野',
    // Map overlays
    boxModeBanner: '矩形框选模式：在地图上按住左键拖拽划定区域',
    circleModeBanner: '画圈选择模式：从圆心按住左键向外拖拽设定半径',
    cancelBtn: '取消',
    inspectPolityAria: (name: string) => `查看政权详情：${name}`,
    speciesDiscoveryPrefix: '发现/记述：',
    speciesAria: (name: string) => `物种发现：${name}`,
    scrollToSolarHint: '向下滚动滚轮缩小地球可进入太阳系黄道平面',
    enterSolarBtn: '进入太阳系视图',
    customBoxName: '自定义框选区域',
    customCircleName: '自定义画圈区域',
    // Popover & Scale Legends
    scaleLegendAria: '数值色标',
    mortScaleTitle: '伤亡人数热力梯度',
    mortScaleUnit: '死亡人数',
    mortTicks: ['≤6.6千', '2.8万', '5.2万', '≥7.8万'] as const,
    mortLowLabel: '局部伤亡 (浅红)',
    mortHighLabel: '特大浩劫 (深红)',
    popScaleTitle: '人口密度热力梯度',
    popScaleUnit: '人 / km²',
    popLowLabel: '低密边疆 (蓝)',
    popHighLabel: '高密城邦核心 (深棕)',
    nightScaleTitle: '夜间聚落与工矿光强',
    nightScaleUnit: '相对辐射',
    nightMaxTickUnit: '160+ 人/km²',
    nightLowLabel: '稀疏村社微光',
    nightHighLabel: '高密城区与昼夜冶炉',
    routeScaleTitle: '海运航道年频次',
    routeScaleUnit: '航次 / 年',
    routeLowLabel: '低频航线 (白)',
    routeHighLabel: '高频干线 (深红)',
    inspectorAria: '选中对象详情',
    closeInspectorAria: '关闭详情卡片',
    controlledTerritories: (n: number) => `控制辖区 ${n} 处`,
    unboundedSphereLabel: '无界疆域（核心区 · 辐射带 · 荒原衰减）',
    clickedTerritoryLabel: '当前点击政区：',
    sourceCitationLabel: '文献出处：',
    recordedScholarLabel: '记述学者：',
    surveyLocationLabel: '考察地点：',
    annualRouteIntensityLabel: '当年航运/陆运强度',
    annualVoyagesValue: (n: number) => `约 ${n} 航次/年`,
    cargoLabel: '承运物资：',
    estimatedDeathsLabel: '史料估算死亡规模',
    estimatedDeathsValue: (n: string) => `约 ${n} 人`,
    // Timeline Dock
    timelineSectionAria: '全球历史时间轴',
    expandTimelineAria: '展开时间轴',
    collapseTimelineAria: '收起时间轴',
    expandTimelineBtn: '展开时间标尺',
    collapseTimelineBtn: '收起标尺',
    resolutionLabel: (step: number) => `精度 ${step} 年/格`,
    stepBack10Aria: '前移十年',
    stepBack1Aria: '前移一年',
    stepForward1Aria: '后移一年',
    stepForward10Aria: '后移十年',
    oneYearShort: '1年',
    pauseAria: '暂停时间演进',
    playAria: '播放时间演进',
    pauseBtn: '暂停',
    playBtn: '播放',
    loopPlayBtn: '循环播放',
    speedAria: (spd: number) => `切换播放倍速，当前 ${spd} 倍速`,
    rangeToggleAria: '切换时间段选取工具',
    rangeToggleBtn: '区间选取',
    rangeStartAria: '区间起始年份',
    rangeEndAria: '区间结束年份',
    clearRangeAria: '清除时间段选取',
    jumpLabel: '跳转',
    jumpInputAria: '输入年份（负数为公元前）',
    oneYearTickAria: '切换一年最高精度',
    oneYearTickBtn: '1年/格',
    zoomInTimelineAria: '放大时间轴精度',
    zoomOutTimelineAria: '缩小时间轴跨度',
    rulerAria: '历史年份标尺',
    leftHandleAria: '拖动区间左边界',
    rightHandleAria: '拖动区间右边界',
    // Right Overview & Chat Sidebar
    expandSidebarAria: '展开区域概览与对话栏',
    expandSidebarBtn: '概览与对话',
    sidebarAria: '区域概览与历史对话栏',
    sidebarHeading: '区域概览',
    boxSelectAria: '矩形框选区域',
    boxSelectBtn: '框选',
    circleSelectAria: '画圈选择区域',
    circleSelectBtn: '画圈',
    clearRegionAria: '清除选中区域',
    clearRegionBtn: '清除',
    collapseSidebarAria: '收起右侧菜单栏',
    overviewSectionAria: '选中区域概览区',
    layersPrefix: '图层：',
    metricTerritories: '涉及辖区',
    metricTerritoriesUnit: '处',
    metricPeakPop: '人口峰值',
    metricPeakLight: '峰值光强',
    metricVoyages: '海运频次',
    metricVoyagesUnit: '次/年',
    metricCasualties: '伤亡估算',
    eventsTableHeading: '历史事件与图层简表',
    eventsCountLabel: (n: number) => `共 ${n} 条`,
    emptyEventsHint:
      '当前区域、时间范围与叠加图层下暂无匹配记录。可使用「框选 / 画圈」重新划定区域或调整时间轴。',
    chatSectionAria: 'AI 历史对话区',
    chatHeading: 'AI 对话分析',
    scopeRegionShort: '选区',
    scopeGlobalShort: '全局',
    clearChatBtn: '清空',
    clearChatAria: '清空对话记录',
    chatLogAria: 'AI 历史问答消息流',
    chatEmptyRegionHint: (region: string, time: string, layers: string) =>
      `已锁定「${region}」（${time}）与叠加图层「${layers}」，AI 将围绕该范围及激活图层强相关作答：`,
    chatEmptyGlobalHint: (time: string, layers: string) =>
      `当前基于全局时间轴（${time}）与叠加图层「${layers}」作答；如需限定区域请点击上方「框选 / 画圈」。`,
    contextBadgePrefix: '上下文 · ',
    globalTimelineBadge: '全局时间轴',
    sendingHint: '正在结合当前区域、时间范围与叠加图层生成分析…',
    inputPlaceholderRegion: (layers: string) => `结合选区与「${layers}」提问…`,
    inputPlaceholderGlobal: (layers: string) => `结合当前时间与「${layers}」提问…`,
    chatInputAria: '向 AI 提问当前地图内容',
    sendAria: '发送问题',
    sendBtn: '发送',
    networkError: '网络或服务异常，请稍后重试。',
    // Deep Space Stage
    celestialCoordAria: (name: string) => `天体坐标：${name}`,
    solarPanelAria: '太阳系黄道平面控制面板',
    solarPanelTitle: '太阳系黄道平面视图',
    solarPanelSubtitle: '天体运行轨道与深空探测器任务态势',
    returnEarthBtn: '返回地球',
    selectBodyHint: '选择星球放大检视轨道与地表探测器',
    inspectBodyAria: (name: string) => `放大检视${name}`,
    activeMissionsLabel: '当前年份在途 / 在轨任务',
    activeMissionsUnit: (n: number) => `${n} 项`,
    bodyInspectorAria: '天体近景检视面板',
    bodyInspectorSuffix: '轨道与地表检视',
    solarPlaneBtn: '太阳系平面',
    currentEpochLabel: '当前检索纪年',
    orbitersBasesLabel: '环绕轨道器 / 地表着陆基地',
    zeroProbesUnit: '0 具',
  },
  en: {
    pageTitle: 'Clio-Atlas',
    brandShort: 'Clio-Atlas',
    bootAriaLabel: 'Calibrating 3D Earth and historical territory parcels',
    bootSubtitle: 'Global Spatio-Temporal Historical Observatory',
    bootStageEngine: 'Calibrating 3D Geodesic Vector Engine',
    bootStageParcels: 'Syncing High-Precision Coastal & Polity Parcels',
    bootStageDissolve: 'Dissolving Topological Seams & Uploading Tiles',
    bootStageReady: 'Fine-Grained Parcel Calibration Complete',
    bootParcelLabel: 'Precision Parcels',
    introNavLabel: 'Intro',
    introNavAria: 'Open project overview and privacy policy (/intro)',
    aiChannelAria: 'Configure AI API and Gemini model channel',
    aiChannelDefaultShort: 'Default API',
    aiChannelCustomShort: 'Custom API',
    aiModalTitle: 'AI API & Gemini Model Channel',
    aiModalSubtitle:
      'Switch between the default server Gemini 4 Hydrogen channel and your own Gemini API key & model',
    aiModeDefault: 'Default Server Channel',
    aiModeDefaultDesc: 'Uses server credentials with Gemini 4 Hydrogen by default',
    aiModeCustom: 'Custom API & Model',
    aiModeCustomDesc: 'Use your own Gemini API key, optional base URL, and selected model',
    aiApiKeyLabel: 'Custom Gemini API Key',
    aiApiKeyPlaceholder: 'Paste your Gemini API Key (e.g. AIza...)',
    aiBaseUrlLabel: 'Custom API Base URL (Optional)',
    aiBaseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    aiModelPresetLabel: 'Select Gemini Model',
    aiModelCustomOption: 'Enter custom Gemini model ID…',
    aiModelCustomLabel: 'Custom Model ID',
    aiModelCustomPlaceholder: 'e.g. gemini-4-hydrogen or gemini-4-argon',
    aiLocalNotice:
      'Saved locally in your browser and routed securely through the server API endpoint.',
    aiResetBtn: 'Reset to Default',
    aiSaveBtn: 'Save Channel',
    aiErrEmptyKey: 'Please enter your Gemini API Key when using the custom channel.',
    aiErrInvalidModel:
      'Enter a valid active Gemini model ID (deprecated 1.5 / 2.0 models are unsupported).',
    aiErrInvalidUrl: 'Custom Base URL must start with https:// or http://.',
    coordAria: 'Live Geographic Coordinates',
    deepSpaceCoord: 'Ecliptic Deep-Space Frame',
    layerTriggerDefault: 'Layers',
    openLayerMenuAria: 'Open layer overlay menu',
    clearAllLayersAria: 'Clear all overlaid layers',
    layerMenuAria: 'Thematic layer multi-select menu',
    multiSelectHint: 'Stack multiple layers',
    selectedCount: (n: number, total: number) => `${n} / ${total} active`,
    selectAllTerrestrial: 'All Surface Layers',
    clearLayersBtn: 'Clear Overlays',
    languageMenuAria: 'Switch interface language',
    projectionGroupAria: 'Projection mode switch',
    globe3d: '3D Globe',
    globe3dAria: 'Switch to 3D Globe',
    map2d: '2D Map',
    map2dAria: 'Switch to 2D World Map',
    zoomInAria: 'Zoom in',
    zoomOutAria: 'Zoom out',
    resetNorthAria: 'Reset north and default view',
    // Map overlays
    boxModeBanner: 'Box Selection: Hold & drag on the map to define a bounding box',
    circleModeBanner: 'Circle Selection: Drag outward from center to set radius',
    cancelBtn: 'Cancel',
    inspectPolityAria: (name: string) => `Inspect polity: ${name}`,
    speciesDiscoveryPrefix: 'Recorded by: ',
    speciesAria: (name: string) => `Species record: ${name}`,
    scrollToSolarHint: 'Scroll down to zoom out into the Solar System ecliptic plane',
    enterSolarBtn: 'Solar System View',
    customBoxName: 'Custom Box Selection',
    customCircleName: 'Custom Circle Selection',
    // Popover & Scale Legends
    scaleLegendAria: 'Quantitative Color Scale',
    mortScaleTitle: 'Casualty Thermal Scale',
    mortScaleUnit: 'Fatalities',
    mortTicks: ['≤6.6k', '28k', '52k', '≥78k'] as const,
    mortLowLabel: 'Localized (Light Red)',
    mortHighLabel: 'Catastrophic (Deep Red)',
    popScaleTitle: 'Population Density',
    popScaleUnit: 'pers. / km²',
    popLowLabel: 'Sparse Frontier (Blue)',
    popHighLabel: 'Urban Core (Deep Brown)',
    nightScaleTitle: 'Nighttime Radiance',
    nightScaleUnit: 'Rel. Intensity',
    nightMaxTickUnit: '160+ /km²',
    nightLowLabel: 'Rural Glow',
    nightHighLabel: 'Urban & Furnaces',
    routeScaleTitle: 'Maritime Frequency',
    routeScaleUnit: 'voyages / yr',
    routeLowLabel: 'Low Freq. (White)',
    routeHighLabel: 'Trunk Line (Crimson)',
    inspectorAria: 'Selected Feature Details',
    closeInspectorAria: 'Close detail card',
    controlledTerritories: (n: number) => `${n} territories controlled`,
    unboundedSphereLabel: 'Unbounded Sphere (Core · Influence · Frontier Fade)',
    clickedTerritoryLabel: 'Clicked Territory: ',
    sourceCitationLabel: 'Sources: ',
    recordedScholarLabel: 'Scholar: ',
    surveyLocationLabel: 'Location: ',
    annualRouteIntensityLabel: 'Annual Route Traffic',
    annualVoyagesValue: (n: number) => `~${n} voyages/yr`,
    cargoLabel: 'Cargo: ',
    estimatedDeathsLabel: 'Estimated Fatalities',
    estimatedDeathsValue: (n: string) => `~${n} deaths`,
    // Timeline Dock
    timelineSectionAria: 'Global Historical Timeline',
    expandTimelineAria: 'Expand timeline',
    collapseTimelineAria: 'Collapse timeline',
    expandTimelineBtn: 'Show Timeline',
    collapseTimelineBtn: 'Hide Timeline',
    resolutionLabel: (step: number) => `Res. ${step} yr/tick`,
    stepBack10Aria: 'Step back 10 years',
    stepBack1Aria: 'Step back 1 year',
    stepForward1Aria: 'Step forward 1 year',
    stepForward10Aria: 'Step forward 10 years',
    oneYearShort: '1y',
    pauseAria: 'Pause playback',
    playAria: 'Play timeline',
    pauseBtn: 'Pause',
    playBtn: 'Play',
    loopPlayBtn: 'Loop',
    speedAria: (spd: number) => `Toggle playback speed, currently ${spd}x`,
    rangeToggleAria: 'Toggle time interval selection',
    rangeToggleBtn: 'Interval',
    rangeStartAria: 'Interval start year',
    rangeEndAria: 'Interval end year',
    clearRangeAria: 'Clear time interval',
    jumpLabel: 'Year',
    jumpInputAria: 'Enter year (negative for BCE)',
    oneYearTickAria: 'Toggle 1-year finest resolution',
    oneYearTickBtn: '1y/tick',
    zoomInTimelineAria: 'Zoom in timeline resolution',
    zoomOutTimelineAria: 'Zoom out timeline span',
    rulerAria: 'Historical year ruler',
    leftHandleAria: 'Drag interval start handle',
    rightHandleAria: 'Drag interval end handle',
    // Right Overview & Chat Sidebar
    expandSidebarAria: 'Expand region overview and AI chat',
    expandSidebarBtn: 'Overview & Chat',
    sidebarAria: 'Region overview and historical chat sidebar',
    sidebarHeading: 'Region Overview',
    boxSelectAria: 'Rectangle box select region',
    boxSelectBtn: 'Box',
    circleSelectAria: 'Circle select region',
    circleSelectBtn: 'Circle',
    clearRegionAria: 'Clear selected region',
    clearRegionBtn: 'Clear',
    collapseSidebarAria: 'Collapse right sidebar',
    overviewSectionAria: 'Selected region overview',
    layersPrefix: 'Layers: ',
    metricTerritories: 'Territories',
    metricTerritoriesUnit: '',
    metricPeakPop: 'Peak Pop.',
    metricPeakLight: 'Peak Light',
    metricVoyages: 'Voyages',
    metricVoyagesUnit: '/yr',
    metricCasualties: 'Casualties',
    eventsTableHeading: 'Events & Layer Summary',
    eventsCountLabel: (n: number) => `${n} items`,
    emptyEventsHint:
      'No matching records for the current region, timeframe, and active layers. Use Box/Circle or adjust the timeline.',
    chatSectionAria: 'AI Historical Chat',
    chatHeading: 'AI Analysis',
    scopeRegionShort: 'Region',
    scopeGlobalShort: 'Global',
    clearChatBtn: 'Clear',
    clearChatAria: 'Clear chat messages',
    chatLogAria: 'AI historical Q&A stream',
    chatEmptyRegionHint: (region: string, time: string, layers: string) =>
      `Scoped to "${region}" (${time}) with active layers "${layers}". AI answers focus strictly on this selection and layers:`,
    chatEmptyGlobalHint: (time: string, layers: string) =>
      `Answering from global timeline (${time}) and overlaid layers "${layers}". Use Box / Circle above to lock a region.`,
    contextBadgePrefix: 'Context · ',
    globalTimelineBadge: 'Global Timeline',
    sendingHint: 'Synthesizing regional, temporal & active-layer analysis…',
    inputPlaceholderRegion: (layers: string) => `Ask about region & "${layers}"…`,
    inputPlaceholderGlobal: (layers: string) => `Ask about "${layers}"…`,
    chatInputAria: 'Ask AI about the current map state',
    sendAria: 'Send question',
    sendBtn: 'Send',
    networkError: 'Network or service error. Please try again.',
    // Deep Space Stage
    celestialCoordAria: (name: string) => `Celestial body: ${name}`,
    solarPanelAria: 'Solar System ecliptic control panel',
    solarPanelTitle: 'Solar System Ecliptic Plane',
    solarPanelSubtitle: 'Planetary orbits & deep-space mission status',
    returnEarthBtn: 'Return to Earth',
    selectBodyHint: 'Select a celestial body to inspect orbits & surface probes',
    inspectBodyAria: (name: string) => `Inspect ${name}`,
    activeMissionsLabel: 'Active / En-Route Missions',
    activeMissionsUnit: (n: number) => `${n}`,
    bodyInspectorAria: 'Celestial body close-up inspector',
    bodyInspectorSuffix: 'Orbit & Surface View',
    solarPlaneBtn: 'Solar Plane',
    currentEpochLabel: 'Current Epoch',
    orbitersBasesLabel: 'Orbiters / Surface Bases',
    zeroProbesUnit: '0',
  },
  de: {
    pageTitle: 'Clio-Atlas',
    brandShort: 'Clio-Atlas',
    bootAriaLabel: '3D-Globus und historische Gebiete werden kalibriert',
    bootSubtitle: 'Globales Historisches Raum-Zeit-Observatorium',
    bootStageEngine: '3D-Geodäsie-Vektor-Engine wird kalibriert',
    bootStageParcels: 'Hochpräzise Küsten- & Herrschaftsparzellen laden',
    bootStageDissolve: 'Topologische Grenzen verschmelzen & GPU-Upload',
    bootStageReady: 'Feinparzellen-Kalibrierung abgeschlossen',
    bootParcelLabel: 'Präzisionsparzellen',
    introNavLabel: 'Info',
    introNavAria: 'Projektübersicht und Privacy Policy öffnen (/intro)',
    aiChannelAria: 'KI-API- und Gemini-Modellkanal konfigurieren',
    aiChannelDefaultShort: 'Standard-API',
    aiChannelCustomShort: 'Eigene API',
    aiModalTitle: 'KI-API & Gemini-Modellkanal',
    aiModalSubtitle:
      'Wechseln Sie zwischen dem Standard-Serverkanal (Gemini 4 Hydrogen) und Ihrem eigenen API-Schlüssel & Modell',
    aiModeDefault: 'Standard-Serverkanal',
    aiModeDefaultDesc: 'Nutzt Server-Zugangsdaten mit Standardmodell Gemini 4 Hydrogen',
    aiModeCustom: 'Eigene API & Modell',
    aiModeCustomDesc: 'Eigenen Gemini-API-Schlüssel, optionale Basis-URL und Modell verwenden',
    aiApiKeyLabel: 'Eigener Gemini-API-Schlüssel',
    aiApiKeyPlaceholder: 'Gemini-API-Schlüssel einfügen (z. B. AIza...)',
    aiBaseUrlLabel: 'Eigene API-Basis-URL (Optional)',
    aiBaseUrlPlaceholder: 'https://generativelanguage.googleapis.com',
    aiModelPresetLabel: 'Gemini-Modell auswählen',
    aiModelCustomOption: 'Andere Gemini-Modell-ID eingeben…',
    aiModelCustomLabel: 'Benutzerdefinierte Modell-ID',
    aiModelCustomPlaceholder: 'z. B. gemini-4-hydrogen oder gemini-4-argon',
    aiLocalNotice:
      'Wird lokal im Browser gespeichert und über den Server-Endpunkt weitergeleitet.',
    aiResetBtn: 'Standard wiederherstellen',
    aiSaveBtn: 'Speichern',
    aiErrEmptyKey: 'Bitte geben Sie für den eigenen Kanal Ihren Gemini-API-Schlüssel ein.',
    aiErrInvalidModel:
      'Gültige aktive Gemini-Modell-ID eingeben (veraltete 1.5 / 2.0 Modelle nicht unterstützt).',
    aiErrInvalidUrl: 'Die Basis-URL muss mit https:// oder http:// beginnen.',
    coordAria: 'Aktuelle Geokoordinaten',
    deepSpaceCoord: 'Ekliptikales Tiefraumsystem',
    layerTriggerDefault: 'Ebenen',
    openLayerMenuAria: 'Ebenen-Menü öffnen',
    clearAllLayersAria: 'Alle aktiven Ebenen zurücksetzen',
    layerMenuAria: 'Mehrfachauswahl thematischer Ebenen',
    multiSelectHint: 'Mehrfachüberlagerung aktiv',
    selectedCount: (n: number, total: number) => `${n} / ${total} aktiv`,
    selectAllTerrestrial: 'Alle Erdschichten',
    clearLayersBtn: 'Zurücksetzen',
    languageMenuAria: 'Sprache wechseln',
    projectionGroupAria: 'Projektionsmodus wechseln',
    globe3d: '3D-Globus',
    globe3dAria: 'Zum 3D-Globus wechseln',
    map2d: '2D-Karte',
    map2dAria: 'Zur 2D-Weltkarte wechseln',
    zoomInAria: 'Vergrößern',
    zoomOutAria: 'Verkleinern',
    resetNorthAria: 'Nordausrichtung zurücksetzen',
    // Map overlays
    boxModeBanner: 'Rechteckauswahl: Auf der Karte ziehen, um ein Gebiet einzugrenzen',
    circleModeBanner: 'Kreisauswahl: Vom Mittelpunkt ziehen, um den Radius festzulegen',
    cancelBtn: 'Abbrechen',
    inspectPolityAria: (name: string) => `Herrschaftsdetails: ${name}`,
    speciesDiscoveryPrefix: 'Beschrieben: ',
    speciesAria: (name: string) => `Artenfund: ${name}`,
    scrollToSolarHint: 'Nach unten scrollen, um in die Ekliptikebene des Sonnensystems zu wechseln',
    enterSolarBtn: 'Sonnensystem',
    customBoxName: 'Rechteckauswahl',
    customCircleName: 'Kreisauswahl',
    // Popover & Scale Legends
    scaleLegendAria: 'Quantitative Farbskala',
    mortScaleTitle: 'Opferzahlen-Wärmeskala',
    mortScaleUnit: 'Todesopfer',
    mortTicks: ['≤6,6k', '28k', '52k', '≥78k'] as const,
    mortLowLabel: 'Lokal (Hellrot)',
    mortHighLabel: 'Katastrophe (Dunkelrot)',
    popScaleTitle: 'Bevölkerungsdichte',
    popScaleUnit: 'Einw. / km²',
    popLowLabel: 'Grenzraum (Blau)',
    popHighLabel: 'Polis-Kern (Dunkelbraun)',
    nightScaleTitle: 'Nächtliche Lichtstärke',
    nightScaleUnit: 'Rel. Strahlung',
    nightMaxTickUnit: '160+ /km²',
    nightLowLabel: 'Dorflicht',
    nightHighLabel: 'Stadt & Schmelzöfen',
    routeScaleTitle: 'Seehandelsfrequenz',
    routeScaleUnit: 'Fahrten / J.',
    routeLowLabel: 'Niedrig (Weiß)',
    routeHighLabel: 'Hauptlinie (Tiefrot)',
    inspectorAria: 'Objektdetails',
    closeInspectorAria: 'Detailkarte schließen',
    controlledTerritories: (n: number) => `${n} kontrollierte Gebiete`,
    unboundedSphereLabel: 'Grenzloser Einflussraum (Kern · Strahlung · Auslauf)',
    clickedTerritoryLabel: 'Angeklicktes Gebiet: ',
    sourceCitationLabel: 'Quellen: ',
    recordedScholarLabel: 'Gelehrter: ',
    surveyLocationLabel: 'Fundort: ',
    annualRouteIntensityLabel: 'Jährliche Verkehrsdichte',
    annualVoyagesValue: (n: number) => `ca. ${n} Fahrten/J.`,
    cargoLabel: 'Frachtgüter: ',
    estimatedDeathsLabel: 'Geschätzte Opferzahl',
    estimatedDeathsValue: (n: string) => `ca. ${n} Opfer`,
    // Timeline Dock
    timelineSectionAria: 'Globale historische Zeitleiste',
    expandTimelineAria: 'Zeitleiste einblenden',
    collapseTimelineAria: 'Zeitleiste ausblenden',
    expandTimelineBtn: 'Zeitleiste zeigen',
    collapseTimelineBtn: 'Ausblenden',
    resolutionLabel: (step: number) => `Aufl. ${step} J./Str.`,
    stepBack10Aria: '10 Jahre zurück',
    stepBack1Aria: '1 Jahr zurück',
    stepForward1Aria: '1 Jahr vor',
    stepForward10Aria: '10 Jahre vor',
    oneYearShort: '1J',
    pauseAria: 'Wiedergabe pausieren',
    playAria: 'Zeitleiste abspielen',
    pauseBtn: 'Pause',
    playBtn: 'Start',
    loopPlayBtn: 'Schleife',
    speedAria: (spd: number) => `Geschwindigkeit wechseln, aktuell ${spd}x`,
    rangeToggleAria: 'Zeitraumauswahl umschalten',
    rangeToggleBtn: 'Zeitraum',
    rangeStartAria: 'Startjahr des Zeitraums',
    rangeEndAria: 'Endjahr des Zeitraums',
    clearRangeAria: 'Zeitraum zurücksetzen',
    jumpLabel: 'Jahr',
    jumpInputAria: 'Jahr eingeben (negativ = v. Chr.)',
    oneYearTickAria: '1-Jahres-Feinauflösung umschalten',
    oneYearTickBtn: '1J/Str.',
    zoomInTimelineAria: 'Zeitleiste vergrößern',
    zoomOutTimelineAria: 'Zeitleiste verkleinern',
    rulerAria: 'Historische Jahresskala',
    leftHandleAria: 'Linke Zeitraumgrenze ziehen',
    rightHandleAria: 'Rechte Zeitraumgrenze ziehen',
    // Right Overview & Chat Sidebar
    expandSidebarAria: 'Übersicht und KI-Chat öffnen',
    expandSidebarBtn: 'Übersicht & Chat',
    sidebarAria: 'Regionsübersicht und Historien-Chat',
    sidebarHeading: 'Übersicht',
    boxSelectAria: 'Gebiet per Rechteck auswählen',
    boxSelectBtn: 'Rechteck',
    circleSelectAria: 'Gebiet per Kreis auswählen',
    circleSelectBtn: 'Kreis',
    clearRegionAria: 'Gebietsauswahl aufheben',
    clearRegionBtn: 'Löschen',
    collapseSidebarAria: 'Seitenleiste einklappen',
    overviewSectionAria: 'Übersicht des ausgewählten Gebiets',
    layersPrefix: 'Ebenen: ',
    metricTerritories: 'Gebiete',
    metricTerritoriesUnit: '',
    metricPeakPop: 'Max. Dichte',
    metricPeakLight: 'Max. Licht',
    metricVoyages: 'Seefahrten',
    metricVoyagesUnit: '/J.',
    metricCasualties: 'Opferzahl',
    eventsTableHeading: 'Ereignisse & Ebenendaten',
    eventsCountLabel: (n: number) => `${n} Einträge`,
    emptyEventsHint:
      'Keine Einträge für dieses Gebiet, diesen Zeitraum und die aktiven Ebenen. Nutzen Sie Rechteck/Kreis oder die Zeitleiste.',
    chatSectionAria: 'Historischer KI-Dialog',
    chatHeading: 'KI-Analyse',
    scopeRegionShort: 'Gebiet',
    scopeGlobalShort: 'Global',
    clearChatBtn: 'Leeren',
    clearChatAria: 'Chatverlauf löschen',
    chatLogAria: 'KI-Nachrichtenverlauf',
    chatEmptyRegionHint: (region: string, time: string, layers: string) =>
      `Fokus auf „${region}“ (${time}) und Ebenen „${layers}“. Antworten beziehen sich strikt auf diese Auswahl:`,
    chatEmptyGlobalHint: (time: string, layers: string) =>
      `Globale Ansicht (${time}) mit Ebenen „${layers}“. Nutzen Sie oben „Rechteck / Kreis“ zur Gebietsauswahl.`,
    contextBadgePrefix: 'Kontext · ',
    globalTimelineBadge: 'Globale Zeitleiste',
    sendingHint: 'Analysiere Gebiet, Zeitraum und aktive Ebenen…',
    inputPlaceholderRegion: (layers: string) => `Frage zu Gebiet & „${layers}“…`,
    inputPlaceholderGlobal: (layers: string) => `Frage zu „${layers}“…`,
    chatInputAria: 'Frage zum aktuellen Kartenausschnitt stellen',
    sendAria: 'Frage absenden',
    sendBtn: 'Senden',
    networkError: 'Netzwerk- oder Serverfehler. Bitte erneut versuchen.',
    // Deep Space Stage
    celestialCoordAria: (name: string) => `Himmelskörper: ${name}`,
    solarPanelAria: 'Steuerfeld Sonnensystem-Ekliptik',
    solarPanelTitle: 'Ekliptikebene des Sonnensystems',
    solarPanelSubtitle: 'Planetenbahnen & Tiefraummissionen',
    returnEarthBtn: 'Zurück zur Erde',
    selectBodyHint: 'Himmelskörper wählen für Orbit- & Oberflächenansicht',
    inspectBodyAria: (name: string) => `${name} untersuchen`,
    activeMissionsLabel: 'Aktive Missionen im Jahr',
    activeMissionsUnit: (n: number) => `${n}`,
    bodyInspectorAria: 'Nahansicht Himmelskörper',
    bodyInspectorSuffix: 'Orbit & Oberfläche',
    solarPlaneBtn: 'Ekliptik',
    currentEpochLabel: 'Aktuelles Jahr',
    orbitersBasesLabel: 'Orbiter / Oberflächenbasen',
    zeroProbesUnit: '0',
  },
} as const;

// ============================================================================
// DATASET ENTITY TRANSLATIONS (English & German)
// ============================================================================

const POLITY_I18N: Record<
  string,
  Record<'en' | 'de', { name: string; eraSubtitle: string; capitalName: string; summary: string }>
> = {
  athens_polis_persian_wars: {
    en: {
      name: 'Polis of Athens',
      eraSubtitle: '500 BCE – 479 BCE · Cleisthenic Democracy & Greco-Persian Wars',
      capitalName: 'Athens',
      summary:
        'Following Cleisthenes’ democratic reforms, Athens won the Battle of Marathon (490 BCE), tapped the rich Laurion silver veins (483 BCE) to build 200 triremes, and secured naval supremacy at Salamis (480 BCE).',
    },
    de: {
      name: 'Polis Athen',
      eraSubtitle: '500–479 v. Chr. · Kleisthenische Demokratie & Perserkriege',
      capitalName: 'Athen',
      summary:
        'Nach den demokratischen Reformen des Kleisthenes siegte Athen bei Marathon (490 v. Chr.), baute ab 483 v. Chr. mit Laurion-Silber eine Triremenflotte und errang 480 v. Chr. bei Salamis die Seeherrschaft.',
    },
  },
  delian_league_delos_treasury: {
    en: {
      name: 'Delian League',
      eraSubtitle: '478 BCE – 455 BCE · Delos Sanctuary Treasury & Maritime Hegemony',
      capitalName: 'Athens / Sanctuary of Delos',
      summary:
        'Founded in 478 BCE under Aristides and Cimon, uniting Aegean islands, Hellespontine straits, and Ionian poleis; the twin victory at the Eurymedon (c. 466 BCE) cleared Persian fleets from the eastern Mediterranean.',
    },
    de: {
      name: 'Attischer Seebund',
      eraSubtitle: '478–455 v. Chr. · Bundeskasse auf Delos & Seehegemonie',
      capitalName: 'Athen / Heiligtum von Delos',
      summary:
        '478 v. Chr. unter Aristeides und Kimon gegründet, vereinte der Bund Ägäisinseln, Hellespont und ionische Poleis; die Doppelschlacht am Eurymedon (um 466 v. Chr.) sicherte die östliche Ägäis.',
    },
  },
  athenian_empire_periclean_peak: {
    en: {
      name: 'Athenian Empire (Arche)',
      eraSubtitle: '454 BCE – 432 BCE · Acropolis Treasury & Periclean Golden Age',
      capitalName: 'Acropolis of Athens',
      summary:
        'In 454 BCE the League treasury moved to the Athenian Acropolis, organizing over 200 tribute-paying poleis across five districts (Ionia, Hellespont, Thrace, Caria, Islands) and completing the Long Walls to Piraeus.',
    },
    de: {
      name: 'Athenisches Seereich (Arche)',
      eraSubtitle: '454–432 v. Chr. · Bundesschatz auf der Akropolis & Perikleische Blütezeit',
      capitalName: 'Akropolis von Athen',
      summary:
        '454 v. Chr. wurde der Bundesschatz auf die Athener Akropolis verlegt; über 200 tributpflichtige Poleis in fünf Tributbezirken sowie die Langen Mauern nach Piräus sicherten das Reich.',
    },
  },
  peloponnesian_war_archidamian_sicilian: {
    en: {
      name: 'Wartime Athenian Empire',
      eraSubtitle: '431 BCE – 413 BCE · Peloponnesian War, Great Plague & Sicilian Expedition',
      capitalName: 'Athens–Piraeus Fortress',
      summary:
        'With the outbreak of the Peloponnesian War in 431 BCE, Athens relied on its Long Walls and fleet against Sparta, enduring the Great Plague (430 BCE), losing Amphipolis (424 BCE), subjugating Melos (416 BCE), and suffering catastrophe in Sicily (413 BCE).',
    },
    de: {
      name: 'Athenisches Reich im Peloponnesischen Krieg',
      eraSubtitle: '431–413 v. Chr. · Seeblockade, Große Pest & Sizilienexpedition',
      capitalName: 'Festung Athen–Piräus',
      summary:
        'Ab 431 v. Chr. stützte sich Athen gegen Sparta auf die Langen Mauern und seine Flotte, überstand die Pest von 430 v. Chr., verlor Amphipolis (424 v. Chr.), unterwarf Melos (416 v. Chr.) und scheiterte 413 v. Chr. vor Syrakus.',
    },
  },
  ionian_war_fall_of_athens: {
    en: {
      name: 'Besieged Athens (Ionian War)',
      eraSubtitle: '412 BCE – 404 BCE · Allied Revolts, Aegospotami & Surrender',
      capitalName: 'Athens',
      summary:
        'After the Sicilian disaster, Ionian allies and Euboea revolted while Samos anchored the democratic fleet; defeat at Aegospotami (405 BCE) severed the Pontic grain lifeline, forcing starved Athens to surrender in 404 BCE.',
    },
    de: {
      name: 'Belagertes Athen (Dekeleisch-Ionischer Krieg)',
      eraSubtitle: '412–404 v. Chr. · Bundesgenossenabfall, Aigospotamoi & Kapitulation',
      capitalName: 'Athen',
      summary:
        'Nach der Katastrophe in Sizilien fielen Ionien und Euböa ab; nach der Vernichtung der Flotte bei Aigospotamoi (405 v. Chr.) und der Blockade des Getreidewegs kapitulierte das ausgehungerte Athen 404 v. Chr.',
    },
  },
};

export function localizePolity(
  phase: PolityPhase,
  lang: AppLanguage,
): { name: string; secondaryName: string; eraSubtitle: string; capitalName: string; summary: string } {
  const rec = phase as ImportedPolityRecord;
  if (lang === 'zh') {
    return {
      name: rec.nameZh,
      secondaryName: rec.nameEn,
      eraSubtitle: rec.eraSubtitleI18n?.zh || rec.eraSubtitle,
      capitalName: rec.capitalNameI18n?.zh || rec.capitalName,
      summary: rec.summaryI18n?.zh || rec.historicalSummary,
    };
  }
  const embeddedName = lang === 'de' ? rec.nameDe || rec.nameEn : rec.nameEn;
  const embeddedEra = rec.eraSubtitleI18n?.[lang];
  const embeddedCap = rec.capitalNameI18n?.[lang];
  const embeddedSum = rec.summaryI18n?.[lang];
  const t = POLITY_I18N[phase.id]?.[lang];

  return {
    name: (lang === 'de' && rec.nameDe ? rec.nameDe : t?.name) || embeddedName || phase.nameZh,
    secondaryName:
      lang === 'de'
        ? phase.nameEn
        : embeddedEra || t?.eraSubtitle || embeddedCap || phase.capitalName,
    eraSubtitle: embeddedEra || t?.eraSubtitle || phase.eraSubtitle,
    capitalName: embeddedCap || t?.capitalName || phase.capitalName,
    summary: embeddedSum || t?.summary || phase.historicalSummary,
  };
}

const TERRITORY_NAME_I18N: Record<string, Record<'en' | 'de', string>> = {
  attica_salamis_core: {
    en: 'Attica Mainland, Piraeus Harbors & Salamis',
    de: 'Attika, Häfen von Piräus & Insel Salamis',
  },
  euboea_cleruchy: {
    en: 'Euboea (Chalcis, Eretria & Oreus Cleruchies)',
    de: 'Euböa (Kleruchien Chalkis, Eretria & Oreos)',
  },
  lemnos_imbros_skyros: {
    en: 'Lemnos, Imbros & Skyros Cleruchy Chain',
    de: 'Nordägäische Kleruchien Lemnos, Imbros & Skyros',
  },
  cyclades_delos_archipelago: {
    en: 'Cyclades Archipelago & Delos Tribute District',
    de: 'Kykladen-Archipel & Tributbezirk Delos',
  },
  ionia_lesbos_chios_coast: {
    en: 'Lesbos, Chios & Ionian Coastal Poleis',
    de: 'Lesbos, Chios & Ionische Küstenpoleis',
  },
  samos_democratic_bastion: {
    en: 'Samos (Autonomous Naval Ally & Fleet Base)',
    de: 'Samos (Autonomer Flottenverbündeter & Hauptquartier)',
  },
  chalcidice_thrace_tribute: {
    en: 'Chalcidice, Thasos & Amphipolis (Thracian District)',
    de: 'Chalkidike, Thasos & Amphipolis (Thrakischer Bezirk)',
  },
  hellespont_propontis_bosporus: {
    en: 'Thracian Chersonese, Hellespont & Byzantium',
    de: 'Thrakische Chersones, Hellespont & Byzantion',
  },
  caria_rhodes_dorian_hexapolis: {
    en: 'Caria, Halicarnassus, Kos & Rhodes District',
    de: 'Karien, Halikarnassos, Kos & Rhodos',
  },
  aegina_saronic_control: {
    en: 'Aegina (Saronic Gulf Cleruchy)',
    de: 'Ägina (Kleruchie im Saronischen Golf)',
  },
  boeotia_megara_land_hegemony: {
    en: 'Boeotia & Megarid Land Hegemony',
    de: 'Böotien & Megaris (Landhegemonie)',
  },
  melos_cleruchy: {
    en: 'Melos (416 BCE Athenian Siege & Cleruchy)',
    de: 'Melos (Athenische Kleruchie ab 416 v. Chr.)',
  },
};

export function localizeTerritoryName(
  territoryId: string | undefined,
  fallbackZh: string,
  lang: AppLanguage,
): string {
  if (!territoryId) return fallbackZh;
  const matched = getTerritoryRegions().find((t) => t.id === territoryId);
  if (lang === 'zh') {
    return matched?.nameI18n?.zh || matched?.nameZh || fallbackZh;
  }
  if (matched?.nameI18n?.[lang]) {
    return matched.nameI18n[lang]!;
  }
  return TERRITORY_NAME_I18N[territoryId]?.[lang] ?? fallbackZh;
}

const POP_NODE_I18N: Record<string, Record<'en' | 'de', { name: string; note: string }>> = {
  pop_urban_athens_piraeus: {
    en: {
      name: 'Urban Athens–Piraeus Long Walls Corridor',
      note: 'Attica peaked at ~315,000 inhabitants (432 BCE), falling to ~180,000 by 404 BCE',
    },
    de: {
      name: 'Stadtraum Athen–Piräus & Lange Mauern',
      note: 'Höchststand Attikas ca. 315.000 Einw. (432 v. Chr.), Rückgang auf ca. 180.000 bis 404 v. Chr.',
    },
  },
  pop_laurion_silver_district: {
    en: {
      name: 'Laurion Silver Mines & Thorikos District',
      note: 'Peak mining and smelting workforce of ~20,000–25,000 laborers',
    },
    de: {
      name: 'Silberrevier Laurion & Bergbaustadt Thorikos',
      note: 'Zur Blütezeit ca. 20.000–25.000 Bergbau- und Hüttenarbeiter',
    },
  },
  pop_eleusis_marathon_plains: {
    en: {
      name: 'Eleusis, Mesogeia & Marathon Plains',
      note: 'Rural Attic demes agricultural belt',
    },
    de: {
      name: 'Agrarebenen von Eleusis, Mesogeia & Marathon',
      note: 'Ländlicher Siedlungsgürtel der attischen Demen',
    },
  },
  pop_euboea_allies: {
    en: {
      name: 'Euboea (Chalcis & Eretria)',
      note: 'Overseas grain/pasturelands & 4,000 Athenian cleruchs',
    },
    de: {
      name: 'Euböa (Chalkis & Eretria)',
      note: 'Überseeische Weidegebiete & Siedlungsland von 4.000 Kleruchen',
    },
  },
  pop_ionia_samos_chios: {
    en: {
      name: 'Ionian Coast, Chios & Samos Poleis',
      note: 'Wealthy commercial poleis & major League contributors',
    },
    de: {
      name: 'Ionische Küste, Chios & Samos',
      note: 'Wohlhabende Handelsstädte der ostägäischen Tributzone',
    },
  },
  pop_cyclades_islands: {
    en: {
      name: 'Cycladic Island Poleis',
      note: 'Arid island terrain supporting low-to-moderate densities',
    },
    de: {
      name: 'Inselwelt der Kykladen',
      note: 'Felsige Inseltopographie mit niedriger bis mittlerer Siedlungsdichte',
    },
  },
  pop_chalcidice_thrace_sparse: {
    en: {
      name: 'Thrace & Chalcidice Timber-Mining Frontier',
      note: 'Shipbuilding timber frontier & river-mouth colonies',
    },
    de: {
      name: 'Thrakien & Chalkidike (Holz- und Bergbaugrenze)',
      note: 'Schiffbauholz-Region und Flussmündungskolonien geringer Dichte',
    },
  },
  pop_hellespont_byzantium: {
    en: {
      name: 'Hellespont Straits & Byzantium Gateway',
      note: 'Port settlements guarding the Pontic grain choke point',
    },
    de: {
      name: 'Hellespont & Meerengenpforte Byzantion',
      note: 'Hafenstädte entlang der Schwarzmeer-Getreideroute',
    },
  },
};

export function localizePopulationNode(
  node: PopulationDensityNode,
  lang: AppLanguage,
): { name: string; note: string } {
  const rec = node as ImportedPopulationNodeRecord;
  if (lang === 'zh') {
    return {
      name: rec.nameI18n?.zh || node.nameZh,
      note: rec.noteI18n?.zh || node.estimatedTotalNote,
    };
  }
  const t = POP_NODE_I18N[node.id]?.[lang];
  return {
    name: rec.nameI18n?.[lang] || t?.name || node.nameZh,
    note: rec.noteI18n?.[lang] || t?.note || node.estimatedTotalNote,
  };
}

const NIGHT_LIGHT_I18N: Record<string, Record<'en' | 'de', { name: string; description: string }>> =
  {
    light_athens_acropolis_agora: {
      en: {
        name: 'Acropolis Golden Lamp & Agora Olive-Oil Lamps',
        description:
          'Dense terracotta olive-oil lamps across urban Athens, Panathenaic torchlight processions, and Callimachus’ perpetual golden lamp in the Erechtheion.',
      },
      de: {
        name: 'Goldene Lampe der Akropolis & Agora-Öllampen',
        description:
          'Dichte Terrakotta-Olivenöllampen im Stadtraum, Fackelzüge der Panathenäen und die ewige Goldlampe des Kallimachos im Erechtheion.',
      },
    },
    light_piraeus_harbor_beacons: {
      en: {
        name: 'Piraeus Naval Harbors Beacons & Ship-Shed Fires',
        description:
          'Stone brazier lighthouses and nighttime trireme dockyard work fires across Kantharos, Zea, and Munichia harbors.',
      },
      de: {
        name: 'Leuchtfeuer & Triremenwerften von Piräus',
        description:
          'Steinerne Feuerkörbe zur Hafenansteuerung und nächtliche Werftfeuer in den drei Militär- und Handelshäfen von Piräus.',
      },
    },
    light_laurion_furnaces: {
      en: {
        name: 'Laurion 24-Hour Cupellation Silver Smelting Furnaces',
        description:
          'Hundreds of continuous silver-lead cupellation furnaces in SE Attica—the brightest pre-industrial metallurgical glow in the Classical Aegean.',
      },
      de: {
        name: '24h-Silber-Treiböfen im Bergbaurevier Laurion',
        description:
          'Hunderte Tag und Nacht brennende Kupellationsöfen in Südostattika – das stärkste vorindustrielle Hüttenlicht der Ägäis.',
      },
    },
    light_sounion_cape_beacon: {
      en: {
        name: 'Cape Sounion Temple Headland Navigation Beacon',
        description:
          'Vital headland fire guiding grain merchantmen safely past the reefs of southern Attica at night.',
      },
      de: {
        name: 'Kap-Sunion-Leuchtfeuer am Poseidontempel',
        description:
          'Wichtiges Navigationsfeuer für Getreideschiffe bei der nächtlichen Umrundung der Klippen Südattikas.',
      },
    },
    light_delos_sanctuary: {
      en: {
        name: 'Delos Sanctuary of Apollo Festival Altar Fires',
        description:
          'Sacred island center of the Ionian world with all-night choral vigils and sacrificial altar flames.',
      },
      de: {
        name: 'Altarfeuer im Apollon-Heiligtum auf Delos',
        description:
          'Kultisches Zentrum der Ägäis mit nächtlichen Chorgesängen und Opferfeuern während der Delia-Feste.',
      },
    },
    light_miletus_samos_ports: {
      en: {
        name: 'Samos & Miletus Eastern Aegean Port Lights',
        description:
          'Commercial harbor lamps and Athenian expeditionary fleet anchorage campfires in Samos and Ionia.',
      },
      de: {
        name: 'Hafenlichter von Samos & Milet (Ostägäis)',
        description:
          'Handelshäfen und nächtliche Lagerfeuer der athenischen Flottenbasis auf Samos während des Ionischen Krieges.',
      },
    },
    light_byzantium_hellespont_beacons: {
      en: {
        name: 'Byzantium & Sestos Strait Night Beacons',
        description:
          'Signal fire towers guiding vessels through the swift currents of the Bosporus and Hellespont.',
      },
      de: {
        name: 'Meerengen-Leuchtfeuer von Byzantion & Sestos',
        description:
          'Leuchtfeuertürme zur Sicherung der Strömungspassagen an Bosporus und Hellespont.',
      },
    },
  };

export function localizeNightLightNode(
  node: NightLightNode,
  lang: AppLanguage,
): { name: string; categoryLabel: string; description: string } {
  const rec = node as ImportedNightLightNodeRecord;
  const categoryLabel = localizeNightLightCategory(node.category, lang);
  if (lang === 'zh') {
    return {
      name: rec.nameI18n?.zh || node.nameZh,
      categoryLabel,
      description: rec.descriptionI18n?.zh || node.description,
    };
  }
  const t = NIGHT_LIGHT_I18N[node.id]?.[lang];
  return {
    name: rec.nameI18n?.[lang] || t?.name || node.nameZh,
    categoryLabel,
    description: rec.descriptionI18n?.[lang] || t?.description || node.description,
  };
}

const ROUTE_I18N: Record<
  string,
  Record<'en' | 'de', { name: string; origin: string; destination: string; cargo: string }>
> = {
  route_piraeus_chalcis_grain: {
    en: {
      name: 'Attica–Euboea Coastal Supply Line',
      origin: 'Chalcis / Eretria (Euboea)',
      destination: 'Piraeus (via Cape Sounion)',
      cargo: 'Livestock, barley, cheese & daily provisions',
    },
    de: {
      name: 'Küstenversorgungsroute Attika–Euböa',
      origin: 'Chalkis / Eretria (Euböa)',
      destination: 'Piräus (um Kap Sunion)',
      cargo: 'Vieh, Gerste, Käse und tägliche Versorgungsgüter',
    },
  },
  route_laurion_piraeus_silver: {
    en: {
      name: 'Laurion–Piraeus Silver Bullion & Charcoal Line',
      origin: 'Thorikos Harbor (Laurion)',
      destination: 'Piraeus (via Cape Sounion)',
      cargo: 'Refined silver bullion (Athenian owl coinage) & smelting pine charcoal',
    },
    de: {
      name: 'Silber- & Holzkohleroute Laurion–Piräus',
      origin: 'Hafen Thorikos (Laurion)',
      destination: 'Piräus (um Kap Sunion)',
      cargo: 'Feinsilberbarren (Eulen-Tetradrachmen) und Kiefernholzkohle',
    },
  },
  route_ionia_delos_piraeus_tribute: {
    en: {
      name: 'Ionia–Delos–Piraeus League Tribute Trunk Line',
      origin: 'Miletus / Samos (Ionia)',
      destination: 'Piraeus (via Delos, Kea Channel & Sounion)',
      cargo: 'Annual Delian tribute silver, olive oil, Milesian woolens & Chian wine',
    },
    de: {
      name: 'Tributhauptroute Ionien–Delos–Piräus',
      origin: 'Milet / Samos (Ionien)',
      destination: 'Piräus (über Delos, Kea-Kanal & Kap Sunion)',
      cargo: 'Jährliche Bundestribute, Olivenöl, milesische Wolle und Wein',
    },
  },
  route_pontus_hellespont_grain_lifeline: {
    en: {
      name: 'Bosporan Kingdom–Hellespont–Athens Black Sea Grain Lifeline',
      origin: 'Panticapaeum (Kerch) / Byzantium',
      destination: 'Piraeus Grain Emporion (via Bosporus, Hellespont & Sounion)',
      cargo: 'Pontic hard wheat, salted fish, flax & hides (~50% of Athenian grain imports)',
    },
    de: {
      name: 'Schwarzmeer-Getreidelebensader (Bosporos–Hellespont–Athen)',
      origin: 'Pantikapaion (Kertsch) / Byzantion',
      destination: 'Getreidehafen Piräus (über Bosporus, Hellespont & Kap Sunion)',
      cargo: 'Pontischer Hartweizen, Salzfisch, Flachs & Sklaven (rund 50 % des Getreideimports)',
    },
  },
  route_egypt_cyprus_levant_expedition: {
    en: {
      name: 'Nile Delta–Cyprus–Rhodes–Athens Levant Sea Lane',
      origin: 'Canopus / Naucratis (Egypt)',
      destination: 'Piraeus (via Cyprus, Rhodes & Cape Sounion)',
      cargo: 'Egyptian wheat, papyrus rolls, linen sailcloth & Phoenician glassware',
    },
    de: {
      name: 'Ostmittelmeerroute Nildelta–Zypern–Rhodos–Athen',
      origin: 'Kanopus / Naukratis (Ägypten)',
      destination: 'Piräus (über Zypern, Rhodos & Kap Sunion)',
      cargo: 'Ägyptischer Weizen, Papyrusrollen, Segelleinen und phönizisches Glas',
    },
  },
  route_amphipolis_thrace_timber: {
    en: {
      name: 'Strymon (Amphipolis)–Athens Naval Timber Route',
      origin: 'Eion / Amphipolis (Thrace)',
      destination: 'Piraeus Shipyards (via Mount Athos & Sounion)',
      cargo: 'Macedonian & Thracian fir oars, pine keel timber, pitch & Pangaeum gold',
    },
    de: {
      name: 'Schiffbauholz-Route Strymon (Amphipolis)–Athen',
      origin: 'Eion / Amphipolis (Thrakien)',
      destination: 'Marinewerften Piräus (um Berg Athos & Kap Sunion)',
      cargo: 'Tannenruderholz, Kiefernkiele, Pech und Gold vom Pangaion',
    },
  },
  route_magna_graecia_sicily_west: {
    en: {
      name: 'Piraeus–Corcyra–Magna Graecia & Syracuse Western Sea Lane',
      origin: 'Piraeus (via Capes Maleas & Matapan, Corcyra)',
      destination: 'Great Harbor of Syracuse (Sicily)',
      cargo: 'Attic red-figure pottery exports, Sicilian grain & expeditionary naval transit',
    },
    de: {
      name: 'Westroute Piräus–Kerkyra–Magna Graecia & Syrakus',
      origin: 'Piräus (um Kap Malea, Kap Tainaron & Kerkyra)',
      destination: 'Großer Hafen von Syrakus (Sizilien)',
      cargo: 'Attische rotfigurige Keramik, sizilisches Getreide & Flottentransit',
    },
  },
};

export function localizeTransportRoute(
  route: TransportRoute,
  lang: AppLanguage,
): { name: string; origin: string; destination: string; cargo: string } {
  const rec = route as ImportedTransportRouteRecord;
  if (lang === 'zh') {
    return {
      name: rec.nameI18n?.zh || route.nameZh,
      origin: rec.originNameI18n?.zh || route.originName,
      destination: rec.destinationNameI18n?.zh || route.destinationName,
      cargo: rec.cargoSummaryI18n?.zh || route.cargoSummary,
    };
  }
  const t = ROUTE_I18N[route.id]?.[lang];
  return {
    name: rec.nameI18n?.[lang] || t?.name || route.nameZh,
    origin: rec.originNameI18n?.[lang] || t?.origin || route.originName,
    destination: rec.destinationNameI18n?.[lang] || t?.destination || route.destinationName,
    cargo: rec.cargoSummaryI18n?.[lang] || t?.cargo || route.cargoSummary,
  };
}

const SPECIES_I18N: Record<
  string,
  Record<'en' | 'de', { commonName: string; discoverer: string; location: string; note: string }>
> = {
  sp_attic_sacred_olive: {
    en: {
      commonName: 'Sacred Moriai Olive Cultivar of Attica',
      discoverer: 'Recorded by Herodotus & Theophrastus',
      location: 'Acropolis Erechtheion & Academy Grove (Athens)',
      note: 'After the Persian sack of the Acropolis in 480 BCE, Athena’s scorched sacred olive sprouted a cubit-long shoot overnight (Herodotus 8.55); propagated Moriai trees supplied Panathenaic prize oil.',
    },
    de: {
      commonName: 'Heilige Moriai-Olive Attikas',
      discoverer: 'Überliefert durch Herodot & Theophrast',
      location: 'Akropolis-Erechtheion & Hain der Akademie (Athen)',
      note: 'Nach der persischen Zerstörung der Akropolis 480 v. Chr. trieb Athenas verbrannter Ölbaum über Nacht neu aus (Herodot 8.55); Moriai-Ableger lieferten das Preisöl der Panathenäen.',
    },
  },
  sp_hymettus_thyme_anaxagoras: {
    en: {
      commonName: 'Mount Hymettus Conehead Thyme',
      discoverer: 'Anaxagoras of Clazomenae (in Athens)',
      location: 'Mount Hymettus (Eastern Attica)',
      note: 'Examined by Anaxagoras in his treatise on plant respiration and seed generation (spermata) across the limestone slopes famed for Attic honey.',
    },
    de: {
      commonName: 'Kopfiger Thymian vom Hymettos',
      discoverer: 'Anaxagoras von Klazomenai (in Athen)',
      location: 'Hymettos-Gebirge (Ostattika)',
      note: 'Naturphilosophische Untersuchung zu Pflanzenatmung und Samenlehre (Spermata) an den Kalkhängen des berühmten attischen Honiggebirges.',
    },
  },
  sp_nile_crocodile_herodotus: {
    en: {
      commonName: 'Nile Crocodile (Etymology of Krokodeilos)',
      discoverer: 'Herodotus of Halicarnassus (Athens Recension)',
      location: 'Lake Moeris / Nile Delta',
      note: 'Presented in Herodotus’ public readings in Athens, establishing the Ionian term krokodeilos (“pebble-worm lizard”) in Western zoology.',
    },
    de: {
      commonName: 'Nilkrokodil (Begriffsprägung Krokodeilos)',
      discoverer: 'Herodot von Halikarnassos (Athener Vorlesung)',
      location: 'Moiris-See / Nildelta',
      note: 'Nach Ägyptenreisen in Athen vorgetragen; etablierte das ionische Wort Krokodeilos („Kiesel-Eidechse“) als zoologischen Fachbegriff.',
    },
  },
  sp_pontic_sturgeon_herodotus: {
    en: {
      commonName: 'Pontic Beluga & European Sturgeon',
      discoverer: 'Herodotus (Pontic Grain Route Natural History)',
      location: 'Olbia / Borysthenes Estuary (Northern Black Sea)',
      note: 'Documented along Athens’ Black Sea grain and salted-fish trade network as the giant boneless cartilaginous fish Antakaios.',
    },
    de: {
      commonName: 'Europäischer Hausen / Schwarzmeer-Stör',
      discoverer: 'Herodot (entlang der pontischen Getreideroute)',
      location: 'Olbia an der Borysthenes-Mündung (Nördliches Schwarzes Meer)',
      note: 'Im Zuge des athenischen Schwarzmeerhandels erstmals auf Griechisch als riesiger grätenloser Knorpelfisch Antakaios beschrieben.',
    },
  },
  sp_kos_sea_squill_hippocrates: {
    en: {
      commonName: 'Medicinal Sea Squill & Oriental Hellebore',
      discoverer: 'Hippocrates of Kos (Delian League Medical School)',
      location: 'Asclepieion of Kos',
      note: 'Systematically classified in the Hippocratic Corpus (De Victu, De Morbis) for cardiac-active bulb extracts and purgative pharmacology.',
    },
    de: {
      commonName: 'Medizinische Meerzwiebel & Orientalische Nieswurz',
      discoverer: 'Hippokratische Schule von Kos',
      location: 'Asklepieion auf Kos',
      note: 'Systematische pharmakologische Klassifikation ägäischer Heilpflanzen im Corpus Hippocraticum (De Victu & De Morbis).',
    },
  },
  sp_attic_hemlock: {
    en: {
      commonName: 'Poison Hemlock',
      discoverer: 'Recorded by Aristophanes & Theophrastus',
      location: 'Mount Cithaeron Valleys (Northern Attic Border)',
      note: 'Attested in Aristophanes’ comedies and Theophrastus’ Historia Plantarum for the peripheral neurotoxic alkaloid action of Conium maculatum (Kōneion).',
    },
    de: {
      commonName: 'Gefleckter Schierling',
      discoverer: 'Überliefert durch Aristophanes & Theophrast',
      location: 'Täler des Kithairon (Nordgrenze Attikas)',
      note: 'Bei Aristophanes und in Theophrasts Historia Plantarum hinsichtlich der lähmenden Alkaloidwirkung des Schierlings (Kōneion) bezeugt.',
    },
  },
  sp_aegean_murex_cuttlefish_democritus: {
    en: {
      commonName: 'Purple Dye Murex & Common Cuttlefish',
      discoverer: 'Democritus of Abdera',
      location: 'Coast of Abdera (Thracian Tribute District)',
      note: 'Anatomically dissected and classified under “bloodless animals” (Anaima) in Democritus’ three-book zoological treatise.',
    },
    de: {
      commonName: 'Purpurschnecke & Gewöhnlicher Tintenfisch',
      discoverer: 'Demokrit von Abdera',
      location: 'Küste von Abdera (Thrakischer Tributbezirk)',
      note: 'Erstmals unter der Kategorie „blutlose Tiere“ (Anaima) von Demokrit anatomisch untersucht und klassifiziert.',
    },
  },
};

export function localizeSpecies(
  sp: SpeciesDiscovery,
  lang: AppLanguage,
): { commonName: string; discoverer: string; location: string; note: string } {
  const rec = sp as ImportedSpeciesDiscoveryRecord;
  if (lang === 'zh') {
    return {
      commonName: rec.commonNameI18n?.zh || sp.commonNameZh,
      discoverer: rec.discovererI18n?.zh || sp.discovererZh,
      location: rec.locationNameI18n?.zh || sp.locationNameZh,
      note: rec.historicalNoteI18n?.zh || sp.historicalNote,
    };
  }
  const t = SPECIES_I18N[sp.id]?.[lang];
  return {
    commonName: rec.commonNameI18n?.[lang] || t?.commonName || sp.commonNameZh,
    discoverer: rec.discovererI18n?.[lang] || t?.discoverer || sp.discovererEn,
    location: rec.locationNameI18n?.[lang] || t?.location || sp.locationNameZh,
    note: rec.historicalNoteI18n?.[lang] || t?.note || sp.historicalNote,
  };
}

const CATASTROPHE_I18N: Record<
  string,
  Record<'en' | 'de', { name: string; location: string; note: string }>
> = {
  cat_marathon_battle: {
    en: {
      name: 'Battle of Marathon Casualties',
      location: 'Plain of Marathon (Eastern Attica)',
      note: '192 Athenian hoplites fell (buried in the Soros tumulus) alongside ~6,400 Persian landing troops.',
    },
    de: {
      name: 'Gefallene der Schlacht bei Marathon',
      location: 'Ebene von Marathon (Ostattika)',
      note: '192 gefallene athenische Hopliten (bestattet im Soros-Grabhügel) sowie ca. 6.400 gefallene persische Landungstruppen.',
    },
  },
  cat_salamis_plataea_persian_invasion: {
    en: {
      name: 'Xerxes’ Invasion of Greece (Sack of Athens, Salamis & Plataea)',
      location: 'Salamis Straits, Athens & Plain of Plataea',
      note: 'Attica was twice torched by Persian forces; over 300 warships sank at Salamis, followed by tens of thousands killed at Plataea and Mycale.',
    },
    de: {
      name: 'Perserfeldzug des Xerxes (Brand Athens, Salamis & Plataiai)',
      location: 'Sund von Salamis, Athen & Ebene von Plataiai',
      note: 'Zweimalige Verwüstung Attikas, über 300 versenkte Kriegsschiffe bei Salamis und zehntausende Gefallene bei Plataiai (479 v. Chr.).',
    },
  },
  cat_egyptian_expedition_disaster: {
    en: {
      name: 'Destruction of the Delian League Egyptian Expedition',
      location: 'Prosopitis Island (Nile Delta)',
      note: '200 Athenian and allied triremes sent to aid Inaros against Persia were besieged for 18 months in Nile channels and largely wiped out.',
    },
    de: {
      name: 'Untergang der Ägyptischen Expedition des Seebundes',
      location: 'Insel Prosopitis (Nildelta)',
      note: '200 Triremen Athens und seiner Verbündeten wurden nach 18-monatiger Belagerung im Nildelta nahezu vollständig aufgerieben.',
    },
  },
  cat_plague_of_athens: {
    en: {
      name: 'Great Plague of Athens (Wartime Long Walls Epidemic)',
      location: 'Urban Athens–Piraeus Long Walls & Laurion Camps',
      note: 'Wartime crowding of rural refugees inside the Long Walls fueled a devastating epidemic entering via Piraeus, killing ~25–33% of the population.',
    },
    de: {
      name: 'Große Pest von Athen (Kriegsseuche hinter den Langen Mauern)',
      location: 'Athen–Piräus (Lange Mauern) & Revier Laurion',
      note: 'Durch Flüchtlingsüberfüllung hinter den Langen Mauern breitete sich die Epidemie von Piräus aus und forderte ein Viertel bis ein Drittel der Bevölkerung.',
    },
  },
  cat_scione_melos_sieges: {
    en: {
      name: 'Sieges & Subjugation of Scione and Melos',
      location: 'Melos Island & Scione (Pallene Peninsula)',
      note: 'Tight Athenian naval blockades induced severe siege famine; adult male citizens were executed and inhabitants enslaved upon surrender.',
    },
    de: {
      name: 'Belagerungshungersnot & Unterwerfung von Skione und Melos',
      location: 'Insel Melos & Skione (Halbinsel Pallene)',
      note: 'Strikte athenische Seeblockaden führten zu schwerer Hungersnot; nach dem Fall wurden die erwachsenen Männer hingerichtet.',
    },
  },
  cat_sicilian_expedition_catastrophe: {
    en: {
      name: 'Sicilian Expedition Disaster (Syracuse Quarries & Assinarus River)',
      location: 'Syracuse Latomiae Quarries & Assinarus Retreat (Eastern Sicily)',
      note: 'Over 40,000 Athenian and allied troops and 200+ triremes under Nicias and Demosthenes were destroyed; 7,000 prisoners perished in stone quarries.',
    },
    de: {
      name: 'Katastrophe der Sizilienexpedition (Steinbrüche von Syrakus & Assinaros)',
      location: 'Steinbrüche von Syrakus & Rückzugslinie am Assinaros (Ostsizilien)',
      note: 'Über 40.000 Soldaten und mehr als 200 Triremen unter Nikias und Demosthenes gingen verloren; 7.000 Gefangene starben in den Latomien.',
    },
  },
  cat_arginusae_aegospotami_athens_famine: {
    en: {
      name: 'Arginusae, Battle of Aegospotami & Siege Famine of Athens',
      location: 'Aegospotami (Hellespont), Laurion & Besieged Athens',
      note: 'Destruction of Athens’ last 170 triremes at Aegospotami (405 BCE) and Lysander’s blockade of Piraeus triggered catastrophic famine inside Athens.',
    },
    de: {
      name: 'Arginusen, Aigospotamoi & Belagerungshungersnot in Athen',
      location: 'Aigospotamoi (Hellespont), Laurion & belagertes Athen',
      note: 'Nach dem Verlust der letzten 170 Triremen bei Aigospotamoi (405 v. Chr.) schnitt Lysanders Blockade von Piräus Athen aus und löste Hungersnot aus.',
    },
  },
};

export function localizeCatastrophe(
  cat: MortalityCatastrophe,
  lang: AppLanguage,
): { name: string; categoryLabel: string; location: string; note: string } {
  const rec = cat as ImportedMortalityCatastropheRecord;
  const categoryLabel =
    lang === 'zh'
      ? cat.causeCategory === 'plague'
        ? '瘟疫浩劫'
        : cat.causeCategory === 'siege_famine'
          ? '围城饥荒'
          : '战争伤亡'
      : lang === 'de'
        ? cat.causeCategory === 'plague'
          ? 'Seuche'
          : cat.causeCategory === 'siege_famine'
            ? 'Belagerung'
            : 'Kriegsopfer'
        : cat.causeCategory === 'plague'
          ? 'Epidemic'
          : cat.causeCategory === 'siege_famine'
            ? 'Siege Famine'
            : 'Warfare';

  if (lang === 'zh') {
    return {
      name: rec.nameI18n?.zh || cat.nameZh,
      categoryLabel,
      location: rec.locationNameI18n?.zh || cat.locationNameZh,
      note: rec.historicalNoteI18n?.zh || cat.historicalNote,
    };
  }
  const t = CATASTROPHE_I18N[cat.id]?.[lang];
  return {
    name: rec.nameI18n?.[lang] || t?.name || cat.nameZh,
    categoryLabel,
    location: rec.locationNameI18n?.[lang] || t?.location || cat.locationNameZh,
    note: rec.historicalNoteI18n?.[lang] || t?.note || cat.historicalNote,
  };
}

const CELESTIAL_I18N: Record<string, Record<'en' | 'de', { name: string; description: string }>> = {
  sun: {
    en: { name: 'Sun', description: 'Central star of the Solar System and origin of the ecliptic frame.' },
    de: { name: 'Sonne', description: 'Zentralstern des Sonnensystems und Ursprung der Ekliptikebene.' },
  },
  mercury: {
    en: { name: 'Mercury', description: 'Innermost rocky planet marked by impact basins and lobate scarps.' },
    de: { name: 'Merkur', description: 'Innerster Gesteinsplanet mit dichten Einschlagbecken und Steilstufen.' },
  },
  venus: {
    en: { name: 'Venus', description: 'Terrestrial planet shrouded in dense sulfuric acid cloud decks.' },
    de: { name: 'Venus', description: 'Erdähnlicher Planet unter einer dichten Schwefelsäure-Wolkendecke.' },
  },
  earth: {
    en: { name: 'Earth', description: 'Homeworld of human civilization; click to return to the 3D Globe.' },
    de: { name: 'Erde', description: 'Heimatwelt der menschlichen Zivilisation; Klick kehrt zum 3D-Globus zurück.' },
  },
  moon: {
    en: { name: 'Moon', description: 'Earth’s natural satellite; zoom in to inspect lunar orbiters and landing sites.' },
    de: { name: 'Mond', description: 'Natürlicher Erdtrabant; Nahansicht für Mondorbiter und Landebasen.' },
  },
  mars: {
    en: { name: 'Mars', description: 'Iron-oxide terrestrial planet targeted by deep-space orbiters and rovers.' },
    de: { name: 'Mars', description: 'Eisenoxidreicher Gesteinsplanet im Fokus von Orbitern und Rovern.' },
  },
  jupiter: {
    en: { name: 'Jupiter', description: 'Largest gas giant featuring zonal cloud bands and an intense magnetosphere.' },
    de: { name: 'Jupiter', description: 'Größter Gasriese mit ausgeprägten Wolkenbändern und starker Magnetosphäre.' },
  },
  saturn: {
    en: { name: 'Saturn', description: 'Gas giant encircled by an extensive icy planetary ring system.' },
    de: { name: 'Saturn', description: 'Gasriese mit einem ausgedehnten Ringsystem aus Wassereispartikeln.' },
  },
};

export function localizeCelestialBody(
  body: CelestialBodySpec,
  lang: AppLanguage,
): { name: string; secondaryName: string; description: string } {
  if (lang === 'zh') {
    return { name: body.nameZh, secondaryName: body.nameEn, description: body.descriptionZh };
  }
  const t = CELESTIAL_I18N[body.id]?.[lang];
  return {
    name: t?.name ?? body.nameEn,
    secondaryName: lang === 'de' ? body.nameEn : body.nameZh,
    description: t?.description ?? body.descriptionZh,
  };
}
