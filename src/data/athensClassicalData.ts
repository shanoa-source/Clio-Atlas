import {
  CelestialBodySpec,
  MortalityCatastrophe,
  NightLightNode,
  PolityPhase,
  PopulationDensityNode,
  SpaceMission,
  SpeciesDiscovery,
  TerritoryRegion,
  TransportRoute,
} from '../types/history';

/**
 * 数据窗口常量：严格限定于古典时期雅典（500 BCE – 404 BCE，提洛同盟与伯罗奔尼撒战争时期）
 * 其他时代或政权的数据完全留空，确保政权出现前（< -500）与结束后（> -404）不渲染任何国境线。
 */
export const ATHENS_DATA_START_YEAR = -500;
export const ATHENS_DATA_END_YEAR = -404;

export const ATHENS_POLITY_PHASES: PolityPhase[] = [
  {
    id: 'athens_polis_persian_wars',
    nameZh: '雅典城邦',
    nameEn: 'Polis of Athens',
    eraSubtitle: '500 BCE – 479 BCE · 克里斯提尼民主改革与希波战争期',
    startYear: -500,
    endYear: -479,
    representativeColor: '#2563EB',
    borderColor: '#93C5FD',
    flagId: 'archaic_owl',
    flagLabel: '古风晚期雅典娜圣鸮与橄榄枝旗徽',
    capitalName: '雅典 (Athens)',
    capitalCoords: [23.7275, 37.9838],
    historicalSummary:
      '克里斯提尼确立十部落民主制后，雅典于公元前 490 年取得马拉松大捷，公元前 483 年启用劳里厄姆新银矿扩建三列桨战船舰队，公元前 480 年在萨拉米斯海战奠定爱琴海制海权。',
    sourceCitation: 'Herodotus, Histories 5.66–9.114; Seshat / Cliopatria Classical Dataset',
  },
  {
    id: 'delian_league_delos_treasury',
    nameZh: '提洛同盟',
    nameEn: 'Delian League',
    eraSubtitle: '478 BCE – 455 BCE · 提洛岛金库盟主与反波斯海上同盟',
    startYear: -478,
    endYear: -455,
    representativeColor: '#0891B2',
    borderColor: '#67E8F9',
    flagId: 'delian_alliance',
    flagLabel: '提洛阿波罗圣星与三列桨海盟旗',
    capitalName: '雅典 / 提洛圣所',
    capitalCoords: [23.7275, 37.9838],
    historicalSummary:
      '公元前 478 年阿里斯提德与客蒙主持组建提洛同盟，环爱琴海诸岛、赫勒斯滂海峡与小亚细亚爱奥尼亚城邦入盟纳贡，欧里梅敦战役（约 466 BCE）肃清东地中海波斯舰队。',
    sourceCitation: 'Thucydides 1.96–100; Athenian Tribute Lists (ATL Vol. I–IV)',
  },
  {
    id: 'athenian_empire_periclean_peak',
    nameZh: '雅典海上帝国',
    nameEn: 'Athenian Empire (Arche)',
    eraSubtitle: '454 BCE – 432 BCE · 同盟金库迁驻雅典卫城与伯里克利全盛期',
    startYear: -454,
    endYear: -432,
    representativeColor: '#4F46E5',
    borderColor: '#A5B4FC',
    flagId: 'imperial_athens',
    flagLabel: '古典盛期 ΑΘΕ 四德拉克马银币猫头鹰帝国徽旗',
    capitalName: '雅典卫城 (Acropolis)',
    capitalCoords: [23.7275, 37.9838],
    historicalSummary:
      '公元前 454 年提洛同盟金库迁至雅典帕特农卫城，辖区划分为爱奥尼亚、赫勒斯滂、色雷斯、卡里亚与诸岛五大贡区，逾两百座城邦纳贡，雅典与比雷埃夫斯长墙竣工。',
    sourceCitation: 'Thucydides 1.110–117; M. H. Hansen (2006) Inventory of Archaic and Classical Poleis',
  },
  {
    id: 'peloponnesian_war_archidamian_sicilian',
    nameZh: '雅典帝国（伯罗奔尼撒战时）',
    nameEn: 'Wartime Athenian Empire',
    eraSubtitle: '431 BCE – 413 BCE · 陆海对峙、大瘟疫与西西里远征',
    startYear: -431,
    endYear: -413,
    representativeColor: '#D97706',
    borderColor: '#FCD34D',
    flagId: 'strategoi_wartime',
    flagLabel: '伯罗奔尼撒战时雅典十将军盾徽军旗',
    capitalName: '雅典—比雷埃夫斯要塞',
    capitalCoords: [23.7275, 37.9838],
    historicalSummary:
      '公元前 431 年伯罗奔尼撒战争爆发，雅典依托长墙与海上霸权长期抗衡斯巴达，历经公元前 430 年大瘟疫、前 424 年失守安菲波利斯、前 416 年吞并米洛斯，至前 413 年西西里远征军覆没。',
    sourceCitation: 'Thucydides 2.1–7.87; Cliopatria Classical Mediterranean Polities',
  },
  {
    id: 'ionian_war_fall_of_athens',
    nameZh: '雅典城邦（伊奥尼亚战争晚期）',
    nameEn: 'Besieged Athens',
    eraSubtitle: '412 BCE – 404 BCE · 盟邦离叛、羊河惨败与长墙拆毁',
    startYear: -412,
    endYear: -404,
    representativeColor: '#DC2626',
    borderColor: '#FCA5A5',
    flagId: 'ionian_siege',
    flagLabel: '萨摩斯民主舰队与雅典守城残旗',
    capitalName: '雅典 (Athens)',
    capitalCoords: [23.7275, 37.9838],
    historicalSummary:
      '西西里惨败后爱奥尼亚诸城与优卑亚相继离叛，萨摩斯一度成为雅典舰队民主大本营；公元前 405 年羊河之战舰队全毁，黑海粮道断绝，公元前 404 年雅典在饥荒围困下投降，提洛同盟解体。',
    sourceCitation: 'Thucydides 8.1–109; Xenophon, Hellenica 1.1–2.2.23',
  },
];

/**
 * 政权领土测绘定义：零手写多边形坐标，100% 绑定与 CARTO 矢量底图同源的 OpenStreetMap 官方高精度 Relation IDs，
 * 实现海岸线、比雷埃夫斯三军港、欧里波斯海峡及爱琴海诸岛像素级严丝合缝贴合。
 */
export const ATHENS_TERRITORY_REGIONS: TerritoryRegion[] = [
  {
    id: 'attica_salamis_core',
    nameZh: '阿提卡本土、比雷埃夫斯三军港与萨拉米斯岛',
    validFrom: -500,
    validTo: -404,
    tier: 'metropolis',
    osmIds: [
      'R4477554', // 东阿提卡（马拉松、劳里厄姆、苏尼翁角）
      'R2604796', // 雅典中心城区（卫城与市政广场）
      'R2607262', // 北雅典分区
      'R2612469', // 南雅典法勒隆海岸分区
      'R2612423', // 西雅典分区
      'R2616826', // 比雷埃夫斯港区（坎塔罗斯、泽阿、穆尼基亚三港高精度岸线）
      'R2079232', // 厄琉息斯（Eleusis）
      'R2077504', // 阿斯普罗皮戈斯（特里亚平原）
      'R2083698', // 曼德拉—基塞龙山南麓边疆（不含麦加拉）
      'R2077371', // 菲利（帕尔奈斯山要塞区）
      'R957707',  // 萨拉米斯岛（Salamis Island）
    ],
  },
  {
    id: 'euboea_cleruchy',
    nameZh: '优卑亚岛（卡尔基斯、埃雷特里亚与奥雷奥斯屯田区）',
    validFrom: -500,
    validTo: -411,
    tier: 'cleruchy',
    osmIds: [
      'R3301815', // 优卑亚全岛高精度海岸线（5959 顶点）
    ],
  },
  {
    id: 'lemnos_imbros_skyros',
    nameZh: '利姆诺斯、伊姆布罗斯与斯基罗斯北爱琴屯田岛链',
    validFrom: -499,
    validTo: -405,
    tier: 'cleruchy',
    osmIds: [
      'R537221',  // 利姆诺斯岛（Lemnos）
      'R1815263', // 伊姆布罗斯岛（Imbros / Gökçeada）
      'R965446',  // 斯基罗斯岛（Skyros）
    ],
  },
  {
    id: 'cyclades_delos_archipelago',
    nameZh: '基克拉泽斯群岛与提洛圣岛贡区',
    validFrom: -478,
    validTo: -405,
    tier: 'allied_tribute',
    osmIds: [
      'R531131', // 提洛岛（Delos 圣所金库所在地）
      'R531101', // 安德罗斯岛（Andros）
      'R531102', // 蒂诺斯岛（Tinos）
      'R531115', // 米科诺斯岛（Mykonos）
      'R453091', // 纳克索斯岛（Naxos）
      'R453214', // 帕罗斯岛（Paros）
      'R531999', // 锡罗斯岛（Syros）
      'R531990', // 凯阿岛（Kea）
      'R531997', // 基斯诺斯岛（Kythnos）
      'R532001', // 塞里福斯岛（Serifos）
      'R531978', // 锡夫诺斯岛（Sifnos）
      'R542011', // 伊奥斯岛（Ios）
      'R453964', // 锡拉岛（Thera）
    ],
  },
  {
    id: 'ionia_lesbos_chios_coast',
    nameZh: '莱斯沃斯、希俄斯与小亚细亚爱奥尼亚海岸城邦',
    validFrom: -478,
    validTo: -412,
    tier: 'allied_tribute',
    osmIds: [
      'R6830778', // 莱斯沃斯岛（Lesbos）
      'R3188280', // 希俄斯岛（Chios）
      'R1268452', // 福卡亚（Phocaea / Foça）
      'R1268454', // 埃律特赖（Erythrae / Çeşme）
      'R1269192', // 克拉佐美奈与忒奥斯（Clazomenae / Urla）
      'R1841225', // 以弗所（Ephesus / Selçuk）
      'R1814656', // 米卡勒与潘伊奥尼翁海岸（Kuşadası）
      'R1814655', // 米利都与迪迪马半岛（Miletus / Didim）
    ],
  },
  {
    id: 'samos_democratic_bastion',
    nameZh: '萨摩斯岛（提洛核心海军盟邦及前 411–405 年舰队大本营）',
    validFrom: -478,
    validTo: -405,
    tier: 'allied_tribute',
    osmIds: [
      'R452381', // 萨摩斯岛（Samos）
    ],
  },
  {
    id: 'chalcidice_thrace_tribute',
    nameZh: '卡尔基季基三指半岛、萨索斯与安菲波利斯（色雷斯贡区）',
    validFrom: -478,
    validTo: -424,
    tier: 'allied_tribute',
    osmIds: [
      'R568383',  // 卡尔基季基三指半岛（Chalcidice）
      'R2346618', // 安菲波利斯与斯特律蒙河口（Amphipolis）
      'R537593',  // 萨索斯岛（Thasos）
      'R537592',  // 萨莫色雷斯岛（Samothrace）
    ],
  },
  {
    id: 'hellespont_propontis_bosporus',
    nameZh: '色雷斯切索尼斯、赫勒斯滂与拜占庭海峡贡区',
    validFrom: -478,
    validTo: -405,
    tier: 'allied_tribute',
    osmIds: [
      'R1815219', // 切索尼斯南端塞斯托斯与埃莱乌斯（Eceabat）
      'R1815220', // 色雷斯切索尼斯半岛主体与羊河口（Gelibolu）
      'R1815245', // 赫勒斯滂亚洲岸阿比多斯与拉姆普萨库斯（Lapseki）
      'R1814782', // 普罗庞提斯基齐库斯半岛（Cyzicus / Erdek）
      'R1766104', // 古拜占庭历史半岛与金角湾南岸（Byzantium / Fatih）
    ],
  },
  {
    id: 'caria_rhodes_dorian_hexapolis',
    nameZh: '卡里亚哈利卡纳苏斯、科斯岛与罗得岛贡区',
    validFrom: -468,
    validTo: -411,
    tier: 'allied_tribute',
    osmIds: [
      'R1827275', // 哈利卡纳苏斯半岛（Halicarnassus / Bodrum）
      'R536480',  // 科斯岛（Kos）
      'R452614',  // 罗得岛（Rhodes）
    ],
  },
  {
    id: 'aegina_saronic_control',
    nameZh: '埃伊纳岛（萨罗尼克湾近海屯田屏障）',
    validFrom: -457,
    validTo: -404,
    tier: 'cleruchy',
    osmIds: [
      'R543490', // 埃伊纳岛（Aegina）
    ],
  },
  {
    id: 'boeotia_megara_land_hegemony',
    nameZh: '维奥蒂亚与麦加拉陆上霸权保护带',
    validFrom: -457,
    validTo: -446,
    tier: 'allied_tribute',
    osmIds: [
      'R557546',  // 维奥蒂亚（Boeotia）
      'R2083711', // 麦加拉地峡（Megara）
    ],
  },
  {
    id: 'melos_cleruchy',
    nameZh: '米洛斯岛（公元前 416 年雅典围城吞并屯田区）',
    validFrom: -416,
    validTo: -405,
    tier: 'cleruchy',
    osmIds: [
      'R531969', // 米洛斯岛（Melos）
    ],
  },
];

/**
 * 人口密度区域（仅古典雅典与提洛同盟范围，500 BCE – 404 BCE）
 */
export const ATHENS_POPULATION_REGIONS: PopulationDensityNode[] = [
  {
    id: 'pop_urban_athens_piraeus',
    nameZh: '雅典城区—比雷埃夫斯长墙核心带',
    center: [23.727, 37.978],
    radiusDegLon: 0.16,
    radiusDegLat: 0.12,
    validFrom: -500,
    validTo: -404,
    densityKeyframes: [
      [-500, 96],
      [-478, 118],
      [-454, 146],
      [-432, 165],
      [-428, 118],
      [-415, 130],
      [-404, 88],
    ],
    estimatedTotalNote: '阿提卡峰值约 315,000 人（前 432 年），战后降至约 180,000 人',
    thermalSubZones: [
      { coords: [23.728, 37.978], radiusLon: 0.085, radiusLat: 0.068, weightFactor: 1.0 }, // 雅典卫城与城区
      { coords: [23.686, 37.960], radiusLon: 0.065, radiusLat: 0.052, weightFactor: 0.92 }, // 雅典—比雷埃夫斯长墙走廊
      { coords: [23.646, 37.946], radiusLon: 0.062, radiusLat: 0.050, weightFactor: 0.95 }, // 比雷埃夫斯港城区
      { coords: [23.748, 38.055], radiusLon: 0.095, radiusLat: 0.075, weightFactor: 0.72 }, // 阿卡奈（Acharnes）大村社
      { coords: [23.502, 37.964], radiusLon: 0.072, radiusLat: 0.052, weightFactor: 0.65 }, // 萨拉米斯岛屯田聚落
    ],
  },
  {
    id: 'pop_laurion_silver_district',
    nameZh: '劳里厄姆银矿与索里科斯工矿区',
    center: [24.015, 37.735],
    radiusDegLon: 0.12,
    radiusDegLat: 0.11,
    validFrom: -500,
    validTo: -404,
    densityKeyframes: [
      [-500, 42],
      [-483, 98],
      [-450, 112],
      [-413, 38],
      [-404, 26],
    ],
    estimatedTotalNote: '盛期矿冶劳力约 20,000–25,000 人',
    thermalSubZones: [
      { coords: [24.022, 37.728], radiusLon: 0.068, radiusLat: 0.062, weightFactor: 1.0 }, // 劳里厄姆与马罗内亚核心矿井带
      { coords: [24.046, 37.746], radiusLon: 0.052, radiusLat: 0.048, weightFactor: 0.88 }, // 索里科斯工矿城与洗矿场
      { coords: [23.955, 37.752], radiusLon: 0.065, radiusLat: 0.055, weightFactor: 0.68 }, // 阿纳维索斯与苏尼翁北麓
    ],
  },
  {
    id: 'pop_eleusis_marathon_plains',
    nameZh: '厄琉息斯与马拉松农业平原',
    center: [23.86, 37.94],
    radiusDegLon: 0.24,
    radiusDegLat: 0.18,
    validFrom: -500,
    validTo: -404,
    densityKeyframes: [
      [-500, 58],
      [-454, 76],
      [-431, 44],
      [-421, 64],
      [-413, 35],
      [-404, 32],
    ],
    estimatedTotalNote: '阿提卡乡区自治村社（Demes）农业人口带',
    thermalSubZones: [
      { coords: [23.545, 38.052], radiusLon: 0.095, radiusLat: 0.065, weightFactor: 0.92 }, // 厄琉息斯与特里亚平原
      { coords: [23.905, 37.915], radiusLon: 0.105, radiusLat: 0.085, weightFactor: 0.88 }, // 梅索盖亚（Mesogeia）内陆农业盆地
      { coords: [23.962, 38.132], radiusLon: 0.082, radiusLat: 0.068, weightFactor: 0.85 }, // 马拉松四联城平原
    ],
  },
  {
    id: 'pop_euboea_allies',
    nameZh: '优卑亚岛（卡尔基斯与埃雷特里亚）',
    center: [23.78, 38.52],
    radiusDegLon: 0.42,
    radiusDegLat: 0.32,
    validFrom: -500,
    validTo: -411,
    densityKeyframes: [
      [-500, 46],
      [-454, 62],
      [-431, 68],
      [-411, 56],
    ],
    estimatedTotalNote: '雅典海外牧场与四千骑士屯田区',
    thermalSubZones: [
      { coords: [23.625, 38.468], radiusLon: 0.11, radiusLat: 0.085, weightFactor: 1.0 },  // 卡尔基斯与莱兰托斯平原
      { coords: [23.805, 38.402], radiusLon: 0.11, radiusLat: 0.082, weightFactor: 0.90 }, // 埃雷特里亚
      { coords: [23.120, 38.925], radiusLon: 0.12, radiusLat: 0.085, weightFactor: 0.76 }, // 奥雷奥斯/希斯提亚亚屯田区
      { coords: [24.425, 38.025], radiusLon: 0.09, radiusLat: 0.072, weightFactor: 0.72 }, // 卡律斯托斯
    ],
  },
  {
    id: 'pop_ionia_samos_chios',
    nameZh: '爱奥尼亚海岸及希俄斯、萨摩斯诸大邦',
    center: [26.85, 37.95],
    radiusDegLon: 0.45,
    radiusDegLat: 0.45,
    validFrom: -478,
    validTo: -405,
    densityKeyframes: [
      [-478, 52],
      [-454, 68],
      [-432, 74],
      [-412, 58],
      [-405, 48],
    ],
    estimatedTotalNote: '提洛同盟高额纳贡富庶商业城邦带',
    thermalSubZones: [
      { coords: [26.860, 37.735], radiusLon: 0.12, radiusLat: 0.075, weightFactor: 1.0 },  // 萨摩斯岛
      { coords: [26.075, 38.375], radiusLon: 0.11, radiusLat: 0.135, weightFactor: 0.95 }, // 希俄斯岛
      { coords: [26.320, 39.160], radiusLon: 0.16, radiusLat: 0.120, weightFactor: 0.90 }, // 莱斯沃斯岛（米蒂利尼与梅西姆纳）
      { coords: [27.345, 37.945], radiusLon: 0.13, radiusLat: 0.105, weightFactor: 0.92 }, // 以弗所与凯斯特河谷
      { coords: [27.295, 37.515], radiusLon: 0.11, radiusLat: 0.095, weightFactor: 0.85 }, // 米利都半岛
      { coords: [26.680, 38.320], radiusLon: 0.13, radiusLat: 0.090, weightFactor: 0.78 }, // 克拉佐美奈与埃律特赖
      { coords: [28.100, 36.220], radiusLon: 0.14, radiusLat: 0.140, weightFactor: 0.80 }, // 罗得岛三大城邦
    ],
  },
  {
    id: 'pop_cyclades_islands',
    nameZh: '基克拉泽斯群岛岛屿区',
    center: [25.25, 37.18],
    radiusDegLon: 0.40,
    radiusDegLat: 0.35,
    validFrom: -478,
    validTo: -405,
    densityKeyframes: [
      [-478, 22],
      [-454, 28],
      [-416, 20],
      [-405, 18],
    ],
    estimatedTotalNote: '岛屿岩石地貌限制，呈低至中低人口密度',
    thermalSubZones: [
      { coords: [25.475, 37.055], radiusLon: 0.095, radiusLat: 0.115, weightFactor: 1.0 }, // 纳克索斯岛
      { coords: [25.195, 37.065], radiusLon: 0.080, radiusLat: 0.080, weightFactor: 0.92 }, // 帕罗斯岛
      { coords: [24.865, 37.845], radiusLon: 0.095, radiusLat: 0.105, weightFactor: 0.88 }, // 安德罗斯岛
      { coords: [25.165, 37.565], radiusLon: 0.080, radiusLat: 0.070, weightFactor: 0.82 }, // 蒂诺斯与提洛岛
      { coords: [24.335, 37.625], radiusLon: 0.065, radiusLat: 0.065, weightFactor: 0.78 }, // 凯阿岛
    ],
  },
  {
    id: 'pop_chalcidice_thrace_sparse',
    nameZh: '色雷斯与卡尔基季基林矿边疆带',
    center: [23.62, 40.38],
    radiusDegLon: 0.45,
    radiusDegLat: 0.32,
    validFrom: -478,
    validTo: -424,
    densityKeyframes: [
      [-478, 14],
      [-437, 26],
      [-424, 22],
    ],
    estimatedTotalNote: '森林木材产地与河口殖民点，整体密度偏低',
    thermalSubZones: [
      { coords: [23.355, 40.295], radiusLon: 0.13, radiusLat: 0.10, weightFactor: 1.0 },  // 奥林索斯与波提狄亚
      { coords: [23.865, 40.815], radiusLon: 0.12, radiusLat: 0.09, weightFactor: 0.92 }, // 安菲波利斯与斯特律蒙河谷
      { coords: [24.655, 40.685], radiusLon: 0.10, radiusLat: 0.09, weightFactor: 0.85 }, // 萨索斯岛
    ],
  },
  {
    id: 'pop_hellespont_byzantium',
    nameZh: '赫勒斯滂海峡与拜占庭航运门户',
    center: [27.45, 40.58],
    radiusDegLon: 0.45,
    radiusDegLat: 0.30,
    validFrom: -478,
    validTo: -405,
    densityKeyframes: [
      [-478, 28],
      [-450, 45],
      [-410, 42],
      [-405, 34],
    ],
    estimatedTotalNote: '黑海谷物咽喉要道沿岸港口聚落',
    thermalSubZones: [
      { coords: [28.955, 41.012], radiusLon: 0.085, radiusLat: 0.065, weightFactor: 1.0 },  // 拜占庭古城半岛
      { coords: [27.885, 40.395], radiusLon: 0.115, radiusLat: 0.080, weightFactor: 0.88 }, // 基齐库斯半岛
      { coords: [26.535, 40.365], radiusLon: 0.115, radiusLat: 0.095, weightFactor: 0.86 }, // 色雷斯切索尼斯与塞斯托斯
      { coords: [26.685, 40.315], radiusLon: 0.110, radiusLat: 0.085, weightFactor: 0.82 }, // 拉姆普萨库斯与阿比多斯
    ],
  },
];

/**
 * 夜晚光照节点（500 BCE – 404 BCE 前工业时代人类夜间光源演进）
 */
export const ATHENS_NIGHT_LIGHTS: NightLightNode[] = [
  {
    id: 'light_athens_acropolis_agora',
    nameZh: '雅典卫城长明金灯与市政广场夜间油灯群',
    category: 'urban_lamps',
    coords: [23.7275, 37.9755],
    spreadDeg: 0.18,
    validFrom: -500,
    validTo: -404,
    intensityKeyframes: [
      [-500, 0.52],
      [-480, 0.25],
      [-454, 0.88],
      [-432, 1.00],
      [-429, 0.68],
      [-404, 0.42],
    ],
    description: '城区密集陶制橄榄油灯、泛雅典娜节火炬游行与厄瑞克忒翁神庙卡利马科斯黄金长明灯。',
  },
  {
    id: 'light_piraeus_harbor_beacons',
    nameZh: '比雷埃夫斯三军港导航灯塔与船坞夜火',
    category: 'harbor_beacon',
    coords: [23.642, 37.942],
    spreadDeg: 0.14,
    validFrom: -493,
    validTo: -404,
    intensityKeyframes: [
      [-493, 0.45],
      [-460, 0.82],
      [-431, 0.96],
      [-415, 1.00],
      [-404, 0.30],
    ],
    description: '地中海最大军商复合港口的石砌火盆导航塔与三列桨船坞夜间修造火光。',
  },
  {
    id: 'light_laurion_furnaces',
    nameZh: '劳里厄姆银矿昼夜连续吹炼熔炉群',
    category: 'smelting_furnace',
    coords: [24.045, 37.712],
    spreadDeg: 0.16,
    validFrom: -500,
    validTo: -404,
    intensityKeyframes: [
      [-500, 0.28],
      [-483, 0.92],
      [-445, 0.95],
      [-413, 0.22],
      [-404, 0.15],
    ],
    description: '阿提卡东南角数百座杯灰法银铅冶炼炉昼夜不息的炉火，是古典时期爱琴海最显著的工业夜光。',
  },
  {
    id: 'light_sounion_cape_beacon',
    nameZh: '苏尼翁角波塞冬神庙海岬领航烽火',
    category: 'harbor_beacon',
    coords: [24.0245, 37.6502],
    spreadDeg: 0.08,
    validFrom: -490,
    validTo: -404,
    intensityKeyframes: [
      [-490, 0.48],
      [-444, 0.80],
      [-413, 0.88],
      [-404, 0.35],
    ],
    description: '指引爱琴海谷物商船夜间绕行阿提卡南端暗礁的关键航海火标。',
  },
  {
    id: 'light_delos_sanctuary',
    nameZh: '提洛岛阿波罗圣域祭坛夜火',
    category: 'sanctuary_flame',
    coords: [25.267, 37.396],
    spreadDeg: 0.10,
    validFrom: -478,
    validTo: -405,
    intensityKeyframes: [
      [-478, 0.72],
      [-454, 0.55],
      [-426, 0.78],
      [-405, 0.40],
    ],
    description: '环爱琴海宗教与同盟节庆中心，提洛大祭期间通宵举行合唱与圣火仪式。',
  },
  {
    id: 'light_miletus_samos_ports',
    nameZh: '萨摩斯与米利都东爱琴海港灯火',
    category: 'urban_lamps',
    coords: [27.02, 37.68],
    spreadDeg: 0.22,
    validFrom: -478,
    validTo: -405,
    intensityKeyframes: [
      [-478, 0.58],
      [-445, 0.76],
      [-411, 0.85],
      [-405, 0.42],
    ],
    description: '东爱琴海盟邦商港与伊奥尼亚战争期间雅典远征舰队驻泊营火。',
  },
  {
    id: 'light_byzantium_hellespont_beacons',
    nameZh: '拜占庭与塞斯托斯海峡夜航灯标',
    category: 'harbor_beacon',
    coords: [28.978, 41.008],
    spreadDeg: 0.20,
    validFrom: -478,
    validTo: -405,
    intensityKeyframes: [
      [-478, 0.50],
      [-450, 0.78],
      [-410, 0.84],
      [-405, 0.30],
    ],
    description: '控制黑海—爱琴海急流航道的博斯普鲁斯与赫勒斯滂海峡沿岸引航火塔。',
  },
];

/**
 * 运输航道可视化（仅古典雅典 500 BCE – 404 BCE）
 */
export const ATHENS_TRANSPORT_ROUTES: TransportRoute[] = [
  {
    id: 'route_piraeus_chalcis_grain',
    nameZh: '阿提卡—优卑亚近海补给航道',
    routeType: 'maritime',
    originName: '卡尔基斯 / 埃雷特里亚 (优卑亚)',
    destinationName: '比雷埃夫斯 (绕行苏尼翁角)',
    openedYear: -500,
    closedYear: -411,
    cargoSummary: '牲畜、大麦、奶酪与日常民生物资渡运',
    waypoints: [
      [23.69, 38.38],   // 埃雷特里亚近海锚地
      [23.86, 38.29],   // 南优卑亚湾中线深水航道
      [24.06, 38.15],   // 马拉松外海佩塔利伊湾水道
      [24.14, 37.95],   // 拉菲那—卡律斯托斯海峡
      [24.21, 37.70],   // 马克罗尼索斯岛东侧凯阿水道
      [24.02, 37.57],   // 绕行阿提卡最南端苏尼翁角（Cape Sounion）外海
      [23.82, 37.67],   // 萨罗尼克湾开阔航道
      [23.67, 37.84],   // 法勒隆湾外进港航道
      [23.625, 37.925], // 比雷埃夫斯军商港入口
    ],
    usageKeyframes: [
      [-500, 95],
      [-460, 210],
      [-431, 290],
      [-413, 340],
      [-411, 80],
    ],
    sourceCitation: 'Thucydides 2.14, 7.28; Moreno (2007) Feeding the Democracy',
  },
  {
    id: 'route_laurion_piraeus_silver',
    nameZh: '劳里厄姆—比雷埃夫斯白银与矿用木炭专线',
    routeType: 'maritime',
    originName: '索里科斯港 (劳里厄姆银矿区)',
    destinationName: '比雷埃夫斯港 (绕行苏尼翁角)',
    openedYear: -493,
    closedYear: -404,
    cargoSummary: '提纯银锭（铸造雅典猫头鹰四德拉克马银币）与冶炼松炭返运',
    waypoints: [
      [24.085, 37.735], // 索里科斯港外湾
      [24.088, 37.655], // 马克罗尼索斯海峡西侧深水线
      [24.025, 37.580], // 绕行苏尼翁角波塞冬神庙外海
      [23.880, 37.625], // 阿纳维索斯外海
      [23.760, 37.730], // 萨罗尼克湾东水道
      [23.668, 37.845], // 比雷埃夫斯南进港线
      [23.625, 37.925], // 比雷埃夫斯港入口
    ],
    usageKeyframes: [
      [-493, 60],
      [-483, 240],
      [-450, 280],
      [-413, 55],
      [-404, 25],
    ],
    sourceCitation: 'Herodotus 7.144; Conophagos (1980) Le Laurium antique',
  },
  {
    id: 'route_ionia_delos_piraeus_tribute',
    nameZh: '爱奥尼亚—提洛岛—比雷埃夫斯同盟贡金干线',
    routeType: 'maritime',
    originName: '米利都 / 萨摩斯 (爱奥尼亚)',
    destinationName: '比雷埃夫斯 (经提洛岛、凯阿水道与苏尼翁角)',
    openedYear: -478,
    closedYear: -405,
    cargoSummary: '提洛同盟年度贡金、橄榄油、米利都羊毛织物与葡萄酒',
    waypoints: [
      [27.14, 37.46],   // 米利都湾外海锚地
      [26.92, 37.62],   // 萨摩斯海峡南口
      [26.25, 37.52],   // 伊卡里亚海航道
      [25.25, 37.34],   // 提洛岛南侧圣港航道
      [24.92, 37.58],   // 锡罗斯岛北侧水道
      [24.44, 37.76],   // 凯阿岛北侧深水航道
      [24.20, 37.68],   // 凯阿—马克罗尼索斯海峡
      [24.02, 37.57],   // 绕行阿提卡南端苏尼翁角
      [23.82, 37.67],   // 萨罗尼克湾航道
      [23.67, 37.84],   // 比雷埃夫斯外海
      [23.625, 37.925], // 比雷埃夫斯港入口
    ],
    usageKeyframes: [
      [-478, 120],
      [-454, 275],
      [-425, 330],
      [-412, 145],
      [-405, 40],
    ],
    sourceCitation: 'Athenian Tribute Lists (ATL); Thucydides 1.96, 2.13',
  },
  {
    id: 'route_pontus_hellespont_grain_lifeline',
    nameZh: '博斯普鲁斯王国—赫勒斯滂—雅典黑海谷物生命线',
    routeType: 'maritime',
    originName: '潘提卡彭 (刻赤海峡) / 拜占庭',
    destinationName: '比雷埃夫斯谷物码头 (经博斯普鲁斯、赫勒斯滂、卡菲雷아斯海峡与苏尼翁角)',
    openedYear: -476,
    closedYear: -405,
    cargoSummary: '黑海硬粒小麦、咸鱼、亚麻与奴隶（雅典约半数进口口粮来源）',
    waypoints: [
      [36.60, 45.05],   // 刻赤海峡（潘提卡彭外海口）
      [35.25, 44.50],   // 克里米亚东南外海
      [33.75, 44.08],   // 绕行克里米亚最南端萨雷奇角外海
      [31.30, 42.85],   // 西黑海深水航线（远离保加利亚与色雷斯陆岸）
      [29.15, 41.28],   // 博斯普鲁斯海峡黑海北口
      [29.06, 41.12],   // 博斯普鲁斯海峡中段水道
      [29.00, 40.99],   // 拜占庭金角湾外口进入马尔马拉海
      [28.45, 40.82],   // 普罗庞提斯（马尔马拉海）东段中线
      [27.60, 40.68],   // 普罗庞提斯西段深水航道
      [27.00, 40.52],   // 赫勒斯滂海峡（达达尼尔）东北入口
      [26.68, 40.38],   // 羊河口与拉姆普萨库斯水道
      [26.40, 40.16],   // 塞斯托斯—阿比多斯海峡窄口
      [26.15, 39.98],   // 赫勒斯滂爱琴海出口
      [25.72, 39.75],   // 伊姆布罗斯岛东南水道
      [25.18, 39.20],   // 北爱琴海中央航道
      [24.82, 38.55],   // 斯基罗斯岛东侧外海
      [24.66, 38.05],   // 卡菲雷阿斯海峡（优卑亚与安德罗斯之间）
      [24.24, 37.66],   // 凯阿水道
      [24.02, 37.57],   // 绕行苏尼翁角（Cape Sounion）
      [23.82, 37.67],   // 萨罗尼克湾中线
      [23.67, 37.84],   // 比雷埃夫斯进港航道
      [23.625, 37.925], // 比雷埃夫斯谷物码头入口
    ],
    usageKeyframes: [
      [-476, 110],
      [-450, 310],
      [-435, 420],
      [-415, 450],
      [-410, 380],
      [-405, 30],
    ],
    sourceCitation: 'Demosthenes, Against Leptines 20.31; Moreno (2007); Xenophon, Hellenica 1.1.35',
  },
  {
    id: 'route_egypt_cyprus_levant_expedition',
    nameZh: '尼罗河三角洲—塞浦路斯—雅典东地中海航线',
    routeType: 'maritime',
    originName: '卡诺普斯 / 瑙克拉提斯海口 (埃及)',
    destinationName: '比雷埃夫斯 (经塞浦路斯、罗得岛与苏尼翁角)',
    openedYear: -460,
    closedYear: -412,
    cargoSummary: '埃及小麦、书写纸莎草卷、亚麻帆布与腓尼基玻璃器',
    waypoints: [
      [30.12, 31.42],   // 尼罗河卡诺普斯河口外海
      [32.10, 33.65],   // 东地中海航道
      [33.75, 34.62],   // 塞浦路斯基提翁南外海
      [32.35, 34.45],   // 绕行塞浦路斯帕福斯南外海
      [30.20, 35.65],   // 吕基亚南外海深水线
      [28.42, 36.28],   // 罗得岛东岸林多斯外海
      [28.28, 36.52],   // 绕行罗得岛北岬角外海
      [27.95, 36.50],   // 锡米湾南外海
      [27.15, 36.32],   // 蒂洛斯与卡尔帕索斯北深水航道
      [26.30, 36.20],   // 绕行阿斯蒂帕莱亚岛南侧开阔海域
      [25.55, 36.18],   // 圣托里尼（锡拉）南侧克里特海北航道
      [24.75, 36.32],   // 米洛斯岛南外海深水线
      [24.08, 36.95],   // 米尔托翁海东航道（塞里福斯与基斯诺斯西外海）
      [24.01, 37.57],   // 绕行苏尼翁角
      [23.81, 37.67],   // 萨罗尼克湾
      [23.67, 37.84],   // 比雷埃夫斯进港航道
      [23.625, 37.925], // 比雷埃夫斯港入口
    ],
    usageKeyframes: [
      [-460, 185],
      [-454, 55],
      [-445, 135],
      [-425, 115],
      [-412, 35],
    ],
    sourceCitation: 'Thucydides 1.104, 1.109; Philochorus FGrH 328 F 119',
  },
  {
    id: 'route_amphipolis_thrace_timber',
    nameZh: '斯特律蒙河（安菲波利斯）—雅典造船木材航道',
    routeType: 'maritime',
    originName: '埃伊翁 / 安菲波利斯海口 (色雷斯)',
    destinationName: '比雷埃夫斯海军造船厂 (绕行阿托斯角与苏尼翁角)',
    openedYear: -454,
    closedYear: -424,
    cargoSummary: '马其顿与色雷斯冷杉长桨木、龙骨松木、沥青及潘盖翁山黄金',
    waypoints: [
      [23.88, 40.73],   // 斯特律蒙湾埃伊翁港外海
      [24.22, 40.54],   // 萨索斯与阿托斯之间出湾水道
      [24.58, 40.15],   // 绕行阿托斯圣山海岬东外海
      [24.68, 39.25],   // 斯基罗斯北外海
      [24.75, 38.48],   // 优卑亚东岸外海
      [24.65, 38.05],   // 卡菲雷阿斯海峡
      [24.23, 37.66],   // 凯阿水道
      [24.02, 37.57],   // 绕行苏尼翁角
      [23.82, 37.67],   // 萨罗尼克湾
      [23.67, 37.84],   // 比雷埃夫斯南水道
      [23.625, 37.925], // 比雷埃夫斯军港入口
    ],
    usageKeyframes: [
      [-454, 95],
      [-437, 235],
      [-430, 260],
      [-424, 45],
    ],
    sourceCitation: 'Thucydides 4.108.1; Meiggs (1982) Trees and Timber in the Ancient Mediterranean World',
  },
  {
    id: 'route_magna_graecia_sicily_west',
    nameZh: '比雷埃夫斯—科孚—大希腊（图里伊与叙拉古）西航线',
    routeType: 'maritime',
    originName: '比雷埃夫斯 (绕行马莱阿角、泰纳隆角与科孚)',
    destinationName: '叙拉古大港 (经雅皮吉亚角与卡拉布里亚沿岸)',
    openedYear: -444,
    closedYear: -413,
    cargoSummary: '阿提卡红绘陶瓶出口、西西里谷物进口及西西里远征舰队航路',
    waypoints: [
      [23.625, 37.925], // 比雷埃夫斯港出发
      [23.68, 37.72],   // 埃伊纳岛东侧萨罗尼克湾水道
      [23.66, 37.38],   // 绕行阿尔戈利斯半岛东端斯基拉伊翁角
      [23.38, 36.75],   // 米尔托翁海（莫奈姆瓦夏东外海）
      [23.25, 36.36],   // 绕行伯罗奔尼撒东南端马莱阿角（Cape Maleas）
      [22.92, 36.04],   // 基西拉岛南侧深水航道
      [22.42, 36.24],   // 绕行马尼半岛最南端泰纳隆角（Cape Matapan）
      [21.55, 36.62],   // 麦西尼亚阿克里塔斯角西南外海
      [20.95, 37.25],   // 皮洛斯与斯特罗法泽斯外海
      [20.38, 37.85],   // 扎金索斯岛西外海
      [20.15, 38.55],   // 凯法利尼亚与莱夫卡达西侧爱奥尼亚海
      [19.72, 39.38],   // 科孚岛（科尔库拉）西南集结外海
      [19.48, 39.88],   // 奥特朗托海峡横渡线
      [18.42, 39.68],   // 意大利鞋跟雅皮吉亚角外海
      [17.35, 39.42],   // 塔兰托湾图里伊—克罗顿近海航线
      [17.32, 38.92],   // 绕行拉키尼乌姆角（克罗顿南岬）
      [16.65, 38.22],   // 卡拉布里亚南岸洛克里外海
      [15.85, 37.82],   // 绕行意大利鞋尖斯帕蒂文托角与雷吉乌姆外海
      [15.48, 37.45],   // 西西里东岸卡塔尼亚外海
      [15.33, 37.05],   // 叙拉古大港外入口
    ],
    usageKeyframes: [
      [-444, 65],
      [-433, 120],
      [-427, 175],
      [-415, 395],
      [-413, 20],
    ],
    sourceCitation: 'Thucydides 6.30–44, 7.42; Beazley Attic Red-Figure Vase Trade Archive',
  },
];

/**
 * 新动植物的发现、分类记录与古希腊命名（严格限定于 500 BCE – 404 BCE）
 */
export const ATHENS_SPECIES_DISCOVERIES: SpeciesDiscovery[] = [
  {
    id: 'sp_attic_sacred_olive',
    commonNameZh: '阿提卡圣橄榄品系（莫里亚圣树）',
    scientificName: 'Olea europaea var. moria',
    classicalGreekName: 'Μορίαι ἐλαῖαι (Moriai elaiai)',
    kingdom: 'plantae',
    discovererZh: '希罗多德记述 / 泰奥弗拉斯托斯考证',
    discovererEn: 'Recorded by Herodotus & Theophrastus',
    discoveryYear: -480,
    locationNameZh: '雅典卫城厄瑞克忒翁与阿卡德米圣林',
    coords: [23.712, 37.992],
    historicalNote:
      '公元前 480 年波斯大军焚毁雅典卫城次日，雅典娜圣橄榄残干一夜抽出新枝一肘长（希罗多德《历史》8.55 见证记载）；其嫁接繁衍的“莫里亚（Moriai）”圣树所榨橄榄油专供泛雅典娜赛会奖品陶罐。',
    sourceCitation: 'Herodotus, Histories 8.55; Theophrastus, Historia Plantarum 2.3.3; Aristotle, Ath. Pol. 60.2',
  },
  {
    id: 'sp_hymettus_thyme_anaxagoras',
    commonNameZh: '希梅托斯头状百里香（阿提卡蜜源种）',
    scientificName: 'Thymus capitatus (Coridothymus)',
    classicalGreekName: 'Θύμον Ὑμήττιον (Thymon Hymettion)',
    kingdom: 'plantae',
    discovererZh: '阿那克萨哥拉（驻雅典自然哲学家）',
    discovererEn: 'Anaxagoras of Clazomenae (in Athens)',
    discoveryYear: -465,
    locationNameZh: '希梅托斯山脉 (阿提卡东部)',
    coords: [23.816, 37.946],
    historicalNote:
      '阿那克萨哥拉旅居雅典三十年间提出植物具有呼吸与“同素体种子（Spermata）”发生理论，对希梅托斯石灰岩山地芳香灌木百里香的形态与繁殖展开早期博物学辨析。',
    sourceCitation: 'Theophrastus, Historia Plantarum 3.1.4 (citing Anaxagoras DK 59 A116–117)',
  },
  {
    id: 'sp_nile_crocodile_herodotus',
    commonNameZh: '尼罗鳄（“砾石蜥蜴”命名起源）',
    scientificName: 'Crocodylus niloticus',
    classicalGreekName: 'Κροκόδειλος (Krokodeilos)',
    kingdom: 'animalia',
    discovererZh: '希罗多德（旅居雅典讲学并定名）',
    discovererEn: 'Herodotus of Halicarnassus (Athens Lecture Recension)',
    discoveryYear: -448,
    locationNameZh: '莫里斯湖 / 尼罗河三角洲',
    coords: [30.84, 29.32],
    historicalNote:
      '希罗多德实地考察埃及后在雅典公开朗诵其考察录（前 445 年获雅典公民大会嘉奖），正式将爱奥尼亚语“砾石墙上的蜥蜴（Krokodeilos）”确立为尼罗鳄的西方分类学专名。',
    sourceCitation: 'Herodotus, Histories 2.68–70; Plutarch, De Herodoti malignitate 26',
  },
  {
    id: 'sp_pontic_sturgeon_herodotus',
    commonNameZh: '黑海欧洲鳇 / 大西洋鲟',
    scientificName: 'Acipenser sturio / Huso huso',
    classicalGreekName: 'Ἀντακαῖος (Antakaios)',
    kingdom: 'animalia',
    discovererZh: '希罗多德（随雅典黑海粮道航线记录）',
    discovererEn: 'Herodotus (Pontic Grain Route Natural History)',
    discoveryYear: -443,
    locationNameZh: '博里斯梯尼河口奥尔比亚 (黑海北岸)',
    coords: [31.90, 46.69],
    historicalNote:
      '依托雅典帝国开辟的黑海谷物与腌鱼贸易航线，希罗多德首次以希腊文命名并形态描述黑海无刺巨型软骨鱼类“安塔凯奥斯（Antakaios）”。',
    sourceCitation: 'Herodotus, Histories 4.53; GBIF Classical Ichthyology Cross-walk',
  },
  {
    id: 'sp_kos_sea_squill_hippocrates',
    commonNameZh: '药用海葱与东方铁筷子',
    scientificName: 'Drimia maritima & Helleborus orientalis',
    classicalGreekName: 'Σκίλλα & Ἑλλέβορος (Skilla & Helleboros)',
    kingdom: 'plantae',
    discovererZh: '希波克拉底学派（提洛同盟科斯岛医家）',
    discovererEn: 'Hippocrates of Kos (Delian League Medical School)',
    discoveryYear: -430,
    locationNameZh: '科斯岛阿斯克勒庇俄斯医馆',
    coords: [27.288, 36.894],
    historicalNote:
      '提洛同盟盟邦科斯岛的希波克拉底学派在《论饮食》与《论疾病》中对爱琴海鳞茎植物海葱与铁筷子建立系统的药用植物分类命名体系。',
    sourceCitation: 'Hippocratic Corpus, De Victu & De Morbis (c. 430–410 BCE)',
  },
  {
    id: 'sp_attic_hemlock',
    commonNameZh: '毒参（斑点毒芹）',
    scientificName: 'Conium maculatum',
    classicalGreekName: 'Κώνειον (Kōneion)',
    kingdom: 'plantae',
    discovererZh: '阿里斯托芬 / 泰奥弗拉斯托斯记述',
    discovererEn: 'Recorded by Aristophanes & Theophrastus',
    discoveryYear: -424,
    locationNameZh: '基塞龙山麓阴湿谷地 (阿提卡北界)',
    coords: [23.32, 38.18],
    historicalNote:
      '古典时期传世文献由阿里斯托芬喜剧与泰奥弗拉斯托斯《植物志》明确记述毒参（Kōneion）的外周神经麻痹生物碱药理特征。',
    sourceCitation: 'Aristophanes, Frogs 123–126; Theophrastus, Historia Plantarum 9.8.3; Plato, Phaedo 117a–118a',
  },
  {
    id: 'sp_aegean_murex_cuttlefish_democritus',
    commonNameZh: '染料紫螺与欧洲乌贼（无脊椎解剖分类）',
    scientificName: 'Bolinus brandaris & Sepia officinalis',
    classicalGreekName: 'Πορφύρα & Σηπία (Porphyra & Sepia)',
    kingdom: 'animalia',
    discovererZh: '德谟克利特（提洛同盟阿布德拉学者）',
    discovererEn: 'Democritus of Abdera',
    discoveryYear: -412,
    locationNameZh: '阿布德拉海岸 (北爱琴海色雷斯贡区)',
    coords: [24.973, 40.933],
    historicalNote:
      '曾游学雅典的原子论与博物学家德谟克利特撰写《论动物起因》三卷，首次以“无血动物（Anaima）”范畴解剖并分类命名爱琴海头足类乌贼与腹足纲紫螺。',
    sourceCitation: 'Democritus DK 68 A151–155; Aristotle, Parts of Animals 665a30',
  },
];

/**
 * 人口与死亡浩劫模式（严格限定于 500 BCE – 404 BCE）
 */
export const ATHENS_MORTALITY_CATASTROPHES: MortalityCatastrophe[] = [
  {
    id: 'cat_marathon_battle',
    nameZh: '马拉松平原会战伤亡',
    causeCategory: 'warfare',
    startYear: -490,
    endYear: -490,
    locationNameZh: '马拉松平原 (阿提卡东岸)',
    coords: [23.962, 38.128],
    spreadDeg: 0.095,
    estimatedDeaths: 6600,
    historicalNote: '雅典重装步兵阵亡 192 人（葬于马拉松冢），波斯登陆军阵亡约 6,400 人。',
    sourceCitation: 'Herodotus, Histories 6.117',
    thermalSubZones: [
      { coords: [23.972, 38.128], radiusLon: 0.048, radiusLat: 0.042, weightFactor: 1.0 },
      { coords: [23.992, 38.152], radiusLon: 0.040, radiusLat: 0.036, weightFactor: 0.72 },
    ],
  },
  {
    id: 'cat_salamis_plataea_persian_invasion',
    nameZh: '薛西斯侵希战争（雅典焚城、萨拉米斯海战与普拉提亚会战）',
    causeCategory: 'warfare',
    startYear: -480,
    endYear: -479,
    locationNameZh: '萨拉米斯岛、雅典与普拉提亚平原',
    coords: [23.505, 37.962],
    spreadDeg: 0.24,
    estimatedDeaths: 78000,
    historicalNote:
      '波斯大军两度焚掠阿提卡，萨拉米斯海战逾三百艘战船沉没，次年普拉提亚与米卡勒决战造成数万水陆兵员阵亡。',
    sourceCitation: 'Herodotus, Histories 8.84–96, 9.70; Brecke Conflict Catalog',
    thermalSubZones: [
      { coords: [23.495, 37.958], radiusLon: 0.076, radiusLat: 0.056, weightFactor: 1.0 },  // 萨拉米斯岛与东岸
      { coords: [23.325, 38.222], radiusLon: 0.125, radiusLat: 0.088, weightFactor: 0.96 }, // 普拉提亚决战平原
      { coords: [23.695, 37.968], radiusLon: 0.068, radiusLat: 0.055, weightFactor: 0.85 }, // 雅典—比雷埃夫斯焚城带
    ],
  },
  {
    id: 'cat_egyptian_expedition_disaster',
    nameZh: '提洛同盟埃及远征军覆没',
    causeCategory: 'warfare',
    startYear: -460,
    endYear: -454,
    locationNameZh: '普罗索皮提斯岛 (尼罗河三角洲)',
    coords: [31.08, 30.65],
    spreadDeg: 0.26,
    estimatedDeaths: 28000,
    historicalNote:
      '雅典及提洛同盟派遣两百艘三列桨战船赴埃及助伊那罗斯反抗波斯，在尼罗河支流被围困十八个月后大部覆灭。',
    sourceCitation: 'Thucydides 1.104, 1.109–110',
    thermalSubZones: [
      { coords: [31.08, 30.65], radiusLon: 0.18, radiusLat: 0.16, weightFactor: 1.0 },
      { coords: [31.22, 30.18], radiusLon: 0.15, radiusLat: 0.14, weightFactor: 0.80 },
    ],
  },
  {
    id: 'cat_plague_of_athens',
    nameZh: '雅典大瘟疫（伯罗奔尼撒战时围城疫灾）',
    causeCategory: 'plague',
    startYear: -430,
    endYear: -426,
    locationNameZh: '雅典城区—比雷埃夫斯长墙瘟疫带与劳里厄姆矿区',
    coords: [23.705, 37.968],
    spreadDeg: 0.18,
    estimatedDeaths: 88000,
    historicalNote:
      '阿提卡乡民涌入长墙避难导致极度拥挤，疫病自比雷埃夫斯港爆发并两度席卷全城及工矿营地，夺走约四分之一至三分之一人口。',
    sourceCitation: 'Thucydides 2.47–54, 3.87; Littman (2009) The Plague of Athens',
    thermalSubZones: [
      { coords: [23.727, 37.977], radiusLon: 0.085, radiusLat: 0.068, weightFactor: 1.0 },  // 雅典高密疫区核心
      { coords: [23.685, 37.960], radiusLon: 0.072, radiusLat: 0.056, weightFactor: 1.0 },  // 长墙难民棚户带
      { coords: [23.646, 37.946], radiusLon: 0.065, radiusLat: 0.052, weightFactor: 0.96 }, // 比雷埃夫斯疫源港城区
      { coords: [24.018, 37.732], radiusLon: 0.078, radiusLat: 0.068, weightFactor: 0.78 }, // 劳里厄姆银矿战时损耗区
    ],
  },
  {
    id: 'cat_scione_melos_sieges',
    nameZh: '斯基奥涅与米洛斯围城饥荒与屠戮',
    causeCategory: 'siege_famine',
    startYear: -421,
    endYear: -416,
    locationNameZh: '米洛斯岛与帕勒涅半岛斯基奥涅',
    coords: [24.442, 36.726],
    spreadDeg: 0.11,
    estimatedDeaths: 4500,
    historicalNote:
      '雅典对离叛的斯基奥涅与拒绝入盟的米洛斯实施严密海上封锁饥荒围困，城破后成年男子尽数处决。',
    sourceCitation: 'Thucydides 5.32, 5.84–116',
    thermalSubZones: [
      { coords: [24.442, 36.726], radiusLon: 0.078, radiusLat: 0.058, weightFactor: 1.0 },  // 米洛斯岛全岛围困热区
      { coords: [23.555, 39.958], radiusLon: 0.072, radiusLat: 0.052, weightFactor: 0.85 }, // 卡尔基季基帕勒涅半岛斯基奥涅
    ],
  },
  {
    id: 'cat_sicilian_expedition_catastrophe',
    nameZh: '西西里远征惨败（叙拉古采石场战俘营与阿西纳罗斯河）',
    causeCategory: 'warfare',
    startYear: -415,
    endYear: -413,
    locationNameZh: '叙拉古战俘营与阿西纳罗斯河退却线 (西西里东岸)',
    coords: [15.255, 37.078],
    spreadDeg: 0.22,
    estimatedDeaths: 44000,
    historicalNote:
      '尼基阿斯与德摩斯梯尼统率的雅典及盟邦两支远征大军逾四万人、二百余艘战船在叙拉古海陆突围失败，七千战俘困死石矿营。',
    sourceCitation: 'Thucydides 7.75–87',
    thermalSubZones: [
      { coords: [15.262, 37.082], radiusLon: 0.095, radiusLat: 0.082, weightFactor: 1.0 },  // 叙拉古厄皮波莱与石矿战俘营
      { coords: [15.165, 36.985], radiusLon: 0.088, radiusLat: 0.075, weightFactor: 0.86 }, // 卡基帕里斯河败退走廊
      { coords: [15.075, 36.895], radiusLon: 0.092, radiusLat: 0.075, weightFactor: 0.94 }, // 阿西纳罗斯河覆没现场
    ],
  },
  {
    id: 'cat_arginusae_aegospotami_athens_famine',
    nameZh: '阿吉努塞风暴、羊河之战与雅典围城大饥荒',
    causeCategory: 'siege_famine',
    startYear: -406,
    endYear: -404,
    locationNameZh: '赫勒斯滂羊河口、劳里厄姆矿区与被围困的雅典城',
    coords: [26.555, 40.355],
    spreadDeg: 0.22,
    estimatedDeaths: 29000,
    historicalNote:
      '前 405 年羊河之战雅典最后 170 艘战船覆没；德凯莱亚长期驻军瘫痪劳里厄姆银矿，吕山德封锁比雷埃夫斯港引发雅典城内大饥荒。',
    sourceCitation: 'Xenophon, Hellenica 1.6.34, 2.1.28, 2.2.10–21',
    thermalSubZones: [
      { coords: [26.555, 40.355], radiusLon: 0.115, radiusLat: 0.085, weightFactor: 1.0 },  // 赫勒斯滂切索尼斯羊河口岸滩
      { coords: [26.765, 39.045], radiusLon: 0.095, radiusLat: 0.075, weightFactor: 0.78 }, // 阿吉努塞与莱斯沃斯对岸
      { coords: [23.715, 37.972], radiusLon: 0.085, radiusLat: 0.068, weightFactor: 0.90 }, // 雅典围城大饥荒核心
      { coords: [24.015, 37.735], radiusLon: 0.075, radiusLat: 0.065, weightFactor: 0.82 }, // 德凯莱亚战期劳里厄姆荒废矿带
    ],
  },
];

/**
 * 太阳系天体参数（用于“月球与深空竞赛模式”滚轮缩小地球自动切入太阳系平面图，并支持放大任意星球查看轨道/地表探测器）
 */
export const SOLAR_SYSTEM_BODIES: CelestialBodySpec[] = [
  {
    id: 'sun',
    nameZh: '太阳',
    nameEn: 'Sun',
    kind: 'star',
    orbitRadiusUnits: 0,
    orbitalPeriodYears: 1,
    displayRadius: 3.4,
    baseColor: '#F59E0B',
    secondaryColor: '#FEF3C7',
    initialPhaseRad: 0,
    descriptionZh: '太阳系中心恒星，黄道面坐标系原点。',
  },
  {
    id: 'mercury',
    nameZh: '水星',
    nameEn: 'Mercury',
    kind: 'planet',
    orbitRadiusUnits: 9.5,
    orbitalPeriodYears: 0.2408,
    displayRadius: 0.72,
    baseColor: '#94A3B8',
    secondaryColor: '#64748B',
    initialPhaseRad: 0.8,
    descriptionZh: '距日最近岩石行星，表面遍布撞击盆地与陡坎。',
  },
  {
    id: 'venus',
    nameZh: '金星',
    nameEn: 'Venus',
    kind: 'planet',
    orbitRadiusUnits: 15.0,
    orbitalPeriodYears: 0.6152,
    displayRadius: 1.15,
    baseColor: '#EAB308',
    secondaryColor: '#FEF08A',
    initialPhaseRad: 2.1,
    descriptionZh: '浓密硫酸云层覆盖的类地行星。',
  },
  {
    id: 'earth',
    nameZh: '地球',
    nameEn: 'Earth',
    kind: 'planet',
    orbitRadiusUnits: 22.5,
    orbitalPeriodYears: 1.0,
    displayRadius: 1.32,
    baseColor: '#2563EB',
    secondaryColor: '#10B981',
    initialPhaseRad: 3.8,
    descriptionZh: '人类文明母星，放大检视地球可返回三维地球视图。',
  },
  {
    id: 'moon',
    nameZh: '月球',
    nameEn: 'Moon',
    kind: 'moon',
    parentBodyId: 'earth',
    orbitRadiusUnits: 3.2,
    orbitalPeriodYears: 0.0748,
    displayRadius: 0.54,
    baseColor: '#CBD5E1',
    secondaryColor: '#64748B',
    initialPhaseRad: 1.2,
    descriptionZh: '地球天然卫星，支持放大检视环月轨道器与月表着陆基地。',
  },
  {
    id: 'mars',
    nameZh: '火星',
    nameEn: 'Mars',
    kind: 'planet',
    orbitRadiusUnits: 31.5,
    orbitalPeriodYears: 1.8808,
    displayRadius: 0.96,
    baseColor: '#DC2626',
    secondaryColor: '#9A3412',
    initialPhaseRad: 5.1,
    descriptionZh: '氧化铁风化层红色行星，深空巡视器与轨道中继核心目标天体。',
  },
  {
    id: 'jupiter',
    nameZh: '木星',
    nameEn: 'Jupiter',
    kind: 'planet',
    orbitRadiusUnits: 44.0,
    orbitalPeriodYears: 11.862,
    displayRadius: 2.35,
    baseColor: '#D97706',
    secondaryColor: '#FDE68A',
    initialPhaseRad: 1.6,
    descriptionZh: '太阳系最大气态巨行星，具显著纬向云带与强磁层。',
  },
  {
    id: 'saturn',
    nameZh: '土星',
    nameEn: 'Saturn',
    kind: 'planet',
    orbitRadiusUnits: 57.5,
    orbitalPeriodYears: 29.457,
    displayRadius: 2.0,
    baseColor: '#CA8A04',
    secondaryColor: '#FEF9C3',
    hasRings: true,
    initialPhaseRad: 4.4,
    descriptionZh: '拥有壮观冰质行星环系统的气态巨行星。',
  },
];

/**
 * 深空与月球探测任务表：严格遵循用户要求仅填充古典时期雅典（500 BCE – 404 BCE）数据，航天器记录保持为空数组。
 */
export const SPACE_MISSIONS: SpaceMission[] = [];
