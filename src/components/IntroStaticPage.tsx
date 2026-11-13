import React from 'react';
import { ArrowUpRight, Globe, Mail } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../i18n/translations';
import { AppLanguage } from '../types/history';

interface IntroStaticPageProps {
  language: AppLanguage;
  onChangeLanguage: (lang: AppLanguage) => void;
  onLaunchAtlas: () => void;
}

interface IntroLocalizedCopy {
  navOverview: string;
  navFeatures: string;
  navStack: string;
  navDeployment: string;
  navPrivacy: string;
  launchCta: string;
  heroMeta: string;
  projectName: string;
  slogan: string;
  overviewHeading: string;
  overviewParagraphs: string[];
  metrics: Array<{ value: string; unit: string; label: string }>;
  featuresHeading: string;
  featuresSub: string;
  features: Array<{ index: string; title: string; body: string }>;
  stackHeading: string;
  stackSub: string;
  stackRows: Array<{ category: string; items: string }>;
  deploymentHeading: string;
  deploymentTitle: string;
  deploymentBody: string;
  deploymentSpecs: Array<{ label: string; value: string }>;
  contactHeading: string;
  emailLabel: string;
  githubLabel: string;
  footerReturnCta: string;
}

const INTRO_COPY: Record<AppLanguage, IntroLocalizedCopy> = {
  zh: {
    navOverview: '项目简介',
    navFeatures: '核心能力',
    navStack: '技术栈',
    navDeployment: '边缘部署',
    navPrivacy: 'Privacy Policy',
    launchCta: '进入三维地图',
    heroMeta: 'Hosted on Cloudflare Pages & Workers · 全球历史地理信息系统',
    projectName: 'Clio-Atlas · 全球历史时空地理平台',
    slogan: '以单年精度时间标尺与真实测绘政区边界，在三维地球与深空黄道上重现人类文明演进。',
    overviewHeading: '项目简介',
    overviewParagraphs: [
      'Clio Atlas 是一套面向历史地理研究、数字人文与时空可视化的全栈交互地理信息平台。系统在后端自动检测并聚合全部历史时空数据集，前端统一加载至同一连续全球时间轴，无需在界面手动拆分或切换单一文明子库。',
      '平台底层摒弃失真的手绘近似多边形，直接基于 OpenStreetMap 真实行政关系与海岸线数据进行拓扑消缝融合，在剥离现代国界、公路与建筑干扰的纯净暗色球面底图上，同步耦合政权疆域、历史旗帜、人口密度、前工业夜间光强、公海航运样条、原典物种记述、战争与瘟疫浩劫以及太阳系深空轨道视图。',
    ],
    metrics: [
      { value: '1', unit: 'yr / tick', label: '最高时间轴缩放精度（自动跳过公元 0 年）' },
      { value: '6', unit: 'layers', label: '可自由多选叠加的定量专题图层与深空视图' },
      { value: '3D / 2D', unit: 'projection', label: 'MapLibre 球面投影与平面世界地图无缝切换' },
      { value: '3', unit: 'languages', label: '全站与 AI 分析原生支持中文、英语、德语' },
    ],
    featuresHeading: 'Features · 核心能力',
    featuresSub: '平台当前已上线的全部核心交互、测绘渲染与智能分析能力',
    features: [
      {
        index: '01.',
        title: '三维地球仪与二维世界地图双模纯净底图',
        body: '基于 MapLibre GL JS 三维球体投影与定制净化的 CARTO Dark Matter 矢量瓦片，彻底剥离现代国界线、现代道路建筑与现代城市标签，仅保留高精度海岸线、水系与海洋地貌。',
      },
      {
        index: '02.',
        title: '真实 OpenStreetMap 政区消缝与可扩展历史旗帜',
        body: '所有历史政区均绑定真实 OpenStreetMap Relation/Way 编号并在球面上消融内部相邻行政接缝；政权旗帜同时支持内置纹章预设、经安全清洗的自定义内联矢量 flagSvg 以及外部图像 flagAsset。',
      },
      {
        index: '03.',
        title: '后端自动数据集检测与单年精度时间轴',
        body: '所有时空数据集由后端统一检测与聚合下发，前端一次加载完整全球历史序列；时间轴根据数据动态推导起止纪年，支持滚轮缩放至 1 年/格精度、区间截取与区间循环播放。',
      },
      {
        index: '04.',
        title: '多维定量专题热力、公海样条航道与原典物种考证',
        body: '支持人口密度（蓝至深棕）、前工业夜间光照、经球面陆地防碰撞校验的 Catmull-Rom 海运干线、含跨文明原典名称（classicalSourceName）的物种记述，以及具备淡入淡出包络的伤亡浩劫热区。',
      },
      {
        index: '05.',
        title: '太阳系黄道深空天体舞台',
        body: '开启「月球与深空」图层并向外缩放地球仪即可平滑切入 Three.js 太阳系黄道平面视图，实时计算行星与卫星公转轨道位置及深空任务转移轨迹。',
      },
      {
        index: '06.',
        title: '空间选区耦合概览与双通道 Gemini 智能分析',
        body: '支持在球面上矩形框选、画圈测距或点选辖区以提取定量概览；AI 对话默认通过服务端调用 Gemini 4 Hydrogen，并开放前端自定义 API Key、网关地址与 Gemini 模型配置通道。',
      },
    ],
    stackHeading: 'Tech Stack · 技术架构',
    stackSub: '面向边缘无服务器环境与高帧率 WebGL 渲染构建的现代全栈技术栈',
    stackRows: [
      {
        category: '前端框架与交互界面',
        items: 'React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion · Lucide Icons',
      },
      {
        category: '三维地理与深空渲染引擎',
        items: 'MapLibre GL JS (3D Globe & Mercator) · CARTO Dark Matter Vector Tiles · Three.js · D3-Geo · TopoJSON · OpenStreetMap Boundaries',
      },
      {
        category: '边缘计算与持久化存储',
        items: 'Cloudflare Pages · Cloudflare Pages Functions (Workers V8 Isolates) · Cloudflare Workers KV · Node.js / Express (本地开发桥接)',
      },
      {
        category: '人工智能与数据契约校验',
        items: 'Google Gemini API (@google/genai 服务端 SDK · 默认 Gemini 4 Hydrogen + 自定义 API/模型通道) · JSON Schema Draft 2020-12',
      },
    ],
    deploymentHeading: 'Deployment · 部署架构',
    deploymentTitle: 'Hosted on Cloudflare Pages / Workers',
    deploymentBody:
      '本项目生产环境全量托管于 Cloudflare 全球边缘网络。前端静态资源由 Cloudflare Pages 分发，全部 /api/* 接口运行于无状态 Cloudflare Pages Functions（Workers V8 隔离环境），并通过 Workers KV 命名空间持久化缓存高精度 OpenStreetMap 政区多边形与运行时导入数据。',
    deploymentSpecs: [
      { label: '托管平台', value: 'Hosted on Cloudflare Pages / Workers' },
      { label: '边缘存储绑定', value: 'Cloudflare Workers KV (ATLAS_DATA_KV · OSM_CACHE_KV)' },
      { label: '前端路由策略', value: '/ 交互式时空地球仪 · /intro 静态项目概览与隐私政策' },
    ],
    contactHeading: '开发者与开源仓库',
    emailLabel: '开发者联系邮箱',
    githubLabel: '开发者 GitHub',
    footerReturnCta: '立即启动三维历史时空地图',
  },
  en: {
    navOverview: 'Overview',
    navFeatures: 'Features',
    navStack: 'Tech Stack',
    navDeployment: 'Deployment',
    navPrivacy: 'Privacy Policy',
    launchCta: 'Launch 3D Atlas',
    heroMeta: 'Hosted on Cloudflare Pages & Workers · Global Historical GIS',
    projectName: 'Clio-Atlas · Global Historical Spatio-Temporal GIS',
    slogan:
      'Charting the spatio-temporal evolution of human civilizations across a single-year precision 3D globe and deep-space ecliptic.',
    overviewHeading: 'Project Overview',
    overviewParagraphs: [
      'Clio Atlas is a full-stack interactive historical geographic information platform built for digital humanities, historical cartography, and quantitative spatio-temporal analysis. Historical datasets are detected and aggregated exclusively on the backend, while the frontend loads the complete multi-civilization corpus onto one unified global timeline.',
      'Rather than relying on rough hand-drawn polygons, Clio Atlas dissolves real OpenStreetMap administrative relations onto an anachronism-free dark vector globe—synchronizing polity borders, extensible historical flags, population density, pre-industrial nighttime radiance, land-verified maritime splines, primary-source species records, mortality catastrophes, and a Three.js Solar System ecliptic stage.',
    ],
    metrics: [
      { value: '1', unit: 'yr / tick', label: 'Finest timeline zoom resolution with astronomical year-zero skip' },
      { value: '6', unit: 'layers', label: 'Composable quantitative thematic overlays & deep-space view' },
      { value: '3D / 2D', unit: 'projection', label: 'Seamless MapLibre 3D Globe and 2D Mercator world map' },
      { value: '3', unit: 'languages', label: 'Full UI, dataset & AI analysis in Chinese, English, and German' },
    ],
    featuresHeading: 'Features',
    featuresSub: 'Core cartographic, analytical, and edge-native capabilities live on the platform',
    features: [
      {
        index: '01.',
        title: 'Anachronism-Free 3D Globe & 2D World Map',
        body: 'Powered by MapLibre GL JS 3D Globe projection and a sanitized CARTO Dark Matter vector pipeline that strips modern national borders, roads, buildings, and modern city labels while preserving crisp coastlines and hydrography.',
      },
      {
        index: '02.',
        title: 'Lossless OpenStreetMap Polity Parcels & Extensible Flags',
        body: 'Every territory binds canonical OpenStreetMap Relation/Way IDs with dissolved internal municipal seams. Polity banners support built-in vector presets, XSS-sanitized inline flagSvg markup, and external/Data-URI flagAsset imagery.',
      },
      {
        index: '03.',
        title: 'Backend Dataset Auto-Detection & 1-Year Chronometer',
        body: 'Datasets are discovered on the backend and loaded simultaneously into a continuous global timeline whose min/max year bounds derive dynamically from active records, supporting 1-year tick zoom and interval loop playback.',
      },
      {
        index: '04.',
        title: 'Quantitative Thematic Heatmaps, Sea Lanes & Classical Species',
        body: 'Stack population density (blue-to-umber), pre-industrial night lights, coastline-safe Catmull-Rom maritime routes, source-attested species records with classicalSourceName, and smooth C² fade-envelope mortality heatmaps.',
      },
      {
        index: '05.',
        title: 'Three.js Solar System Ecliptic Stage',
        body: 'Zooming out with the Moon & Deep Space layer active transitions smoothly from the terrestrial globe into a 3D Solar System plane featuring Keplerian orbital positions and planetary close-up inspection.',
      },
      {
        index: '06.',
        title: 'Spatial Region Selector & Dual-Channel Gemini Analysis',
        body: 'Draw bounding boxes, radial circles, or click territories to extract structured metrics and query Gemini 4 Hydrogen by default—or switch to your own Gemini API key, custom gateway URL, and preferred Gemini model.',
      },
    ],
    stackHeading: 'Tech Stack',
    stackSub: 'Engineered for high-frame-rate WebGL cartography and zero-cold-start Edge execution',
    stackRows: [
      {
        category: 'Frontend & Interface',
        items: 'React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion · Lucide Icons',
      },
      {
        category: '3D & Geospatial Engine',
        items: 'MapLibre GL JS (3D Globe & Mercator) · CARTO Dark Matter Vector Tiles · Three.js · D3-Geo · TopoJSON · OpenStreetMap Boundaries',
      },
      {
        category: 'Edge Compute & Storage',
        items: 'Cloudflare Pages · Cloudflare Pages Functions (Workers V8 Isolates) · Cloudflare Workers KV · Node.js / Express (Local Dev Bridge)',
      },
      {
        category: 'AI & Data Governance',
        items: 'Google Gemini API (@google/genai Server-Side SDK · Default Gemini 4 Hydrogen + Custom API/Model Channel) · JSON Schema Draft 2020-12',
      },
    ],
    deploymentHeading: 'Deployment',
    deploymentTitle: 'Hosted on Cloudflare Pages / Workers',
    deploymentBody:
      'Clio Atlas runs on the global Cloudflare edge network. Static assets are served via Cloudflare Pages, all /api/* endpoints execute inside Cloudflare Pages Functions (Workers V8 isolates), and Cloudflare Workers KV namespaces provide edge-cached OpenStreetMap boundary batches and persistent data imports.',
    deploymentSpecs: [
      { label: 'Edge Hosting', value: 'Hosted on Cloudflare Pages / Workers' },
      { label: 'KV State Bindings', value: 'Cloudflare Workers KV (ATLAS_DATA_KV · OSM_CACHE_KV)' },
      { label: 'Application Routes', value: '/ Interactive 3D Globe · /intro Project Overview & Privacy Policy' },
    ],
    contactHeading: 'Developer & Open Source',
    emailLabel: 'Developer Email',
    githubLabel: 'Developer GitHub',
    footerReturnCta: 'Open Interactive 3D Atlas',
  },
  de: {
    navOverview: 'Überblick',
    navFeatures: 'Funktionen',
    navStack: 'Tech-Stack',
    navDeployment: 'Bereitstellung',
    navPrivacy: 'Privacy Policy',
    launchCta: '3D-Atlas starten',
    heroMeta: 'Hosted on Cloudflare Pages & Workers · Historisches Raum-Zeit-GIS',
    projectName: 'Clio-Atlas · Globale Historische Raum-Zeit-GIS-Plattform',
    slogan:
      'Die raum-zeitliche Entwicklung menschlicher Zivilisationen mit einjähriger Präzision auf einem 3D-Globus und in der Ekliptik kartieren.',
    overviewHeading: 'Projektübersicht',
    overviewParagraphs: [
      'Clio Atlas ist eine interaktive Full-Stack-Plattform für historische Geoinformatik, Digital Humanities und quantitative Raum-Zeit-Visualisierung. Sämtliche historischen Datensätze werden ausschließlich im Backend erkannt und zusammengeführt, während das Frontend alle Datenbestände gleichzeitig auf einer durchgehenden globalen Zeitleiste lädt.',
      'Anstelle ungenauer handgezeichneter Polygone verschmilzt Clio Atlas reale administrative OpenStreetMap-Relationen auf einem von modernen Staatsgrenzen, Straßen und Ortsnamen bereinigten Vektorglobus – gekoppelt mit historischen Flaggen, Bevölkerungsdichte, vorindustrieller Nachtbeleuchtung, kollisionsgeprüften Seehandelsrouten, quellenbasierten Artennamen sowie einer 3D-Sonnensystemansicht.',
    ],
    metrics: [
      { value: '1', unit: 'Jahr / Schritt', label: 'Höchste Zeitleistenauflösung ohne astronomisches Jahr Null' },
      { value: '6', unit: 'Ebenen', label: 'Frei kombinierbare quantitative Themenebenen & Tiefraumansicht' },
      { value: '3D / 2D', unit: 'Projektion', label: 'Nahtloser Wechsel zwischen 3D-Globus und 2D-Weltkarte' },
      { value: '3', unit: 'Sprachen', label: 'Vollständige Unterstützung für Chinesisch, Englisch und Deutsch' },
    ],
    featuresHeading: 'Features · Kernfunktionen',
    featuresSub: 'Aktuell auf der Plattform verfügbare Kartographie-, Analyse- und Edge-Funktionen',
    features: [
      {
        index: '01.',
        title: 'Anachronismusfreier 3D-Globus & 2D-Weltkarte',
        body: 'Basiert auf der MapLibre GL JS 3D-Globus-Projektion und bereinigten CARTO Dark Matter Vektorkacheln ohne moderne Ländergrenzen, Straßennetze oder heutige Städtenamen bei gestochen scharfen Küsten- und Flussläufen.',
      },
      {
        index: '02.',
        title: 'Präzise OpenStreetMap-Gebietsparzellen & erweiterbare Flaggen',
        body: 'Historische Territorien referenzieren kanonische OpenStreetMap-Relationen mit aufgelösten Binnengrenzen. Herrschaftsbanner unterstützen integrierte Presets, bereinigtes Inline-SVG (flagSvg) sowie Bild-Assets (flagAsset).',
      },
      {
        index: '03.',
        title: 'Backend-Datensatzerkennung & Ein-Jahres-Chronometer',
        body: 'Datensätze werden automatisch im Backend erkannt und komplett in eine einheitliche Zeitleiste geladen; Zeitgrenzen leiten sich dynamisch aus den Daten ab – inklusive 1-Jahres-Zoom und Intervall-Schleifenwiedergabe.',
      },
      {
        index: '04.',
        title: 'Quantitative Wärmekarten, Seehandelsrouten & Originalquellen-Arten',
        body: 'Überlagerung von Bevölkerungsdichte, vorindustriellen Lichtquellen, küstensicheren Catmull-Rom-Seerouten, historischen Artenbelegen (classicalSourceName) sowie Katastrophen- und Seuchenverläufen.',
      },
      {
        index: '05.',
        title: 'Three.js Sonnensystem- & Tiefraumbühne',
        body: 'Bei aktivierter Mond- & Tiefraumebene führt das Herauszoomen nahtlos in die dreidimensionale Ekliptikebene des Sonnensystems mit Echtzeit-Umlaufbahnen und Planeten-Nahansichten.',
      },
      {
        index: '06.',
        title: 'Räumliche Gebietsauswahl & Zweikanal-Gemini-Analyse',
        body: 'Rechteck-, Umkreis- oder Parzellenauswahl extrahiert präzise Kennzahlen für kontextbezogene KI-Analysen über den Standardkanal (Gemini 4 Hydrogen) oder einen eigenen API-Schlüssel samt frei wählbarem Gemini-Modell.',
      },
    ],
    stackHeading: 'Tech Stack · Technologie-Stack',
    stackSub: 'Entwickelt für flüssige WebGL-Darstellung und verzögerungsarme Ausführung am Netzwerkrand',
    stackRows: [
      {
        category: 'Frontend & Oberfläche',
        items: 'React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion · Lucide Icons',
      },
      {
        category: '3D- & Geodaten-Engine',
        items: 'MapLibre GL JS (3D Globe & Mercator) · CARTO Dark Matter Vector Tiles · Three.js · D3-Geo · TopoJSON · OpenStreetMap Boundaries',
      },
      {
        category: 'Edge-Laufzeit & Speicher',
        items: 'Cloudflare Pages · Cloudflare Pages Functions (Workers V8 Isolates) · Cloudflare Workers KV · Node.js / Express (Lokale Entwicklungsbrücke)',
      },
      {
        category: 'KI & Datenvalidierung',
        items: 'Google Gemini API (@google/genai Server-SDK · Standard Gemini 4 Hydrogen + Eigener API-/Modellkanal) · JSON Schema Draft 2020-12',
      },
    ],
    deploymentHeading: 'Deployment · Bereitstellung',
    deploymentTitle: 'Hosted on Cloudflare Pages / Workers',
    deploymentBody:
      'Die produktive Bereitstellung erfolgt vollständig über das globale Edge-Netzwerk von Cloudflare. Statische Assets werden über Cloudflare Pages ausgeliefert, sämtliche /api/*-Routen laufen in Cloudflare Pages Functions (Workers V8 Isolates) mit angebundenem Cloudflare Workers KV für OpenStreetMap-Geometrien und Datenimporte.',
    deploymentSpecs: [
      { label: 'Hosting-Plattform', value: 'Hosted on Cloudflare Pages / Workers' },
      { label: 'Edge-KV-Bindungen', value: 'Cloudflare Workers KV (ATLAS_DATA_KV · OSM_CACHE_KV)' },
      { label: 'Anwendungsrouten', value: '/ Interaktiver 3D-Globus · /intro Projektübersicht & Privacy Policy' },
    ],
    contactHeading: 'Entwicklerkontakt & Open Source',
    emailLabel: 'Entwickler-E-Mail',
    githubLabel: 'Entwickler-GitHub',
    footerReturnCta: 'Interaktiven 3D-Atlas öffnen',
  },
};

export const IntroStaticPage: React.FC<IntroStaticPageProps> = ({
  language,
  onChangeLanguage,
  onLaunchAtlas,
}) => {
  const t = INTRO_COPY[language];

  const handleLaunchClick = (e: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    e.preventDefault();
    onLaunchAtlas();
  };

  return (
    <div
      data-testid="intro-static-page"
      data-lang={language}
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#07090F] text-slate-100 select-text"
    >
      {/* Top Bar Contract: Single Row, 3 Zones (Wordmark | 4–5 Nav Links | 1 Primary CTA) */}
      <header className="sticky top-0 z-30 border-b border-slate-800/80 bg-[#07090F]/90 backdrop-blur-md">
        <div className="mx-auto max-w-[1120px] px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="/"
            onClick={handleLaunchClick}
            className="text-base font-bold tracking-tight text-slate-100 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            Clio-Atlas
          </a>

          <nav
            aria-label="Intro sections"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400"
          >
            <a
              href="#overview"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navOverview}
            </a>
            <a
              href="#features"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navFeatures}
            </a>
            <a
              href="#stack"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navStack}
            </a>
            <a
              href="#deployment"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navDeployment}
            </a>
            <a
              href="#privacy"
              className="hover:text-slate-100 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              {t.navPrivacy}
            </a>
          </nav>

          <button
            type="button"
            onClick={handleLaunchClick}
            data-testid="intro-launch-atlas-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>{t.launchCta}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-6 py-12 sm:py-16 space-y-20">
        {/* Hero & Project Overview */}
        <section id="overview" className="scroll-mt-24 space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="text-xs text-slate-400 tracking-wide">{t.heroMeta}</div>

            {/* Interactive Trilingual Switcher (placed in Hero workspace toolbar per Top Bar Contract) */}
            <div
              role="group"
              aria-label="Language selector"
              data-testid="intro-lang-switcher"
              className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-900/90 border border-slate-800"
            >
              {SUPPORTED_LANGUAGES.map((opt) => {
                const active = opt.code === language;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    data-testid={`intro-lang-${opt.code}`}
                    aria-pressed={active}
                    onClick={() => onChangeLanguage(opt.code)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-sky-500/20 text-sky-200 ring-1 ring-inset ring-sky-400/40'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {opt.nativeLabel}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4 max-w-3xl">
            <h1
              className="font-bold tracking-tight text-slate-50 text-balance leading-[1.15]"
              style={{ fontSize: 'clamp(2.1rem, 3.8vw, 3.25rem)' }}
            >
              {t.projectName}
            </h1>
            <p className="text-lg sm:text-xl font-medium text-sky-300/95 leading-relaxed text-balance">
              {t.slogan}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800/80 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-4">
              <h2 className="text-sm font-semibold text-slate-300 tracking-wide">
                {t.overviewHeading}
              </h2>
            </div>
            <div className="lg:col-span-8 space-y-4 text-[15px] text-slate-300 leading-7 max-w-[68ch]">
              {t.overviewParagraphs.map((para, idx) => (
                <p key={idx}>{para}</p>
              ))}
            </div>
          </div>

          {/* Quantitative Capability Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {t.metrics.map((m, idx) => (
              <div
                key={idx}
                className="p-5 rounded-lg bg-[#0C101B] border border-slate-800/80 space-y-1.5"
              >
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-semibold font-mono tabular-nums text-slate-100">
                    {m.value}
                  </span>
                  <span className="text-xs font-mono text-slate-400">{m.unit}</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{m.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="scroll-mt-24 pt-12 border-t border-slate-800/80 space-y-8">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
              {t.featuresHeading}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed">{t.featuresSub}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {t.features.map((feat) => (
              <article
                key={feat.index}
                className="p-6 rounded-lg bg-[#0C101B] border border-slate-800/80 space-y-2.5"
              >
                <div className="flex items-baseline gap-2.5">
                  <span className="text-xs font-mono tabular-nums text-sky-400 font-semibold shrink-0">
                    {feat.index}
                  </span>
                  <h3 className="text-base font-semibold text-slate-100 leading-snug">
                    {feat.title}
                  </h3>
                </div>
                <p className="text-sm text-slate-300/90 leading-relaxed">{feat.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Tech Stack & Deployment Section */}
        <section id="stack" className="scroll-mt-24 pt-12 border-t border-slate-800/80 space-y-12">
          <div className="space-y-6">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-100">
                {t.stackHeading}
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed">{t.stackSub}</p>
            </div>

            <div className="rounded-lg border border-slate-800/80 bg-[#0C101B] divide-y divide-slate-800/80">
              {t.stackRows.map((row) => (
                <div
                  key={row.category}
                  className="p-5 grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-6 items-baseline"
                >
                  <div className="md:col-span-4 text-sm font-semibold text-slate-200">
                    {row.category}
                  </div>
                  <div className="md:col-span-8 text-sm text-slate-300 font-mono leading-relaxed">
                    {row.items}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Deployment & Developer Contact Split */}
          <div id="deployment" className="scroll-mt-24 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 p-6 rounded-lg bg-[#0C101B] border border-slate-800/80 flex flex-col justify-between space-y-5">
              <div className="space-y-2.5">
                <div className="text-xs text-slate-400">{t.deploymentHeading}</div>
                <h3 className="text-xl font-semibold text-slate-100 tracking-tight">
                  {t.deploymentTitle}
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">{t.deploymentBody}</p>
              </div>

              <dl className="pt-4 border-t border-slate-800/80 space-y-2.5 text-xs">
                {t.deploymentSpecs.map((spec) => (
                  <div
                    key={spec.label}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1"
                  >
                    <dt className="text-slate-400">{spec.label}</dt>
                    <dd className="font-mono text-slate-200">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="lg:col-span-5 p-6 rounded-lg bg-[#0C101B] border border-slate-800/80 flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-100">{t.contactHeading}</h3>

                <div className="space-y-3 text-sm">
                  <div className="space-y-1">
                    <div className="text-xs text-slate-400">{t.emailLabel}</div>
                    <a
                      href="mailto:devteamcontact@clioatlas.org"
                      data-testid="intro-dev-email"
                      className="inline-flex items-center gap-2 font-mono text-sky-300 hover:text-sky-200 hover:underline underline-offset-4 transition-colors"
                    >
                      <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>devteamcontact@clioatlas.org</span>
                    </a>
                  </div>

                  <div className="space-y-1 pt-2 border-t border-slate-800/70">
                    <div className="text-xs text-slate-400">{t.githubLabel}</div>
                    <a
                      href="https://github.com/shanoa-source"
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="intro-dev-github"
                      className="inline-flex items-center gap-1.5 font-mono text-sky-300 hover:text-sky-200 hover:underline underline-offset-4 transition-colors"
                    >
                      <span>https://github.com/shanoa-source</span>
                      <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    </a>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleLaunchClick}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer"
              >
                {t.footerReturnCta}
              </button>
            </div>
          </div>
        </section>

        {/* Privacy Policy Section — Strictly English Only per User Specification */}
        <section
          id="privacy"
          lang="en"
          data-testid="intro-privacy-policy"
          className="scroll-mt-24 pt-12 border-t border-slate-800/80 space-y-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold tracking-tight text-slate-100">
              Privacy Policy
            </h2>
            <span className="text-xs font-mono text-slate-400">
              Effective Date: November 2026 · English Version Only
            </span>
          </div>

          <div className="p-6 rounded-lg bg-[#0C101B] border border-slate-800/80 space-y-4 text-sm text-slate-300 leading-relaxed">
            <p>
              <strong>1. Data Minimization &amp; No Tracking:</strong> Clio Atlas does not require
              user registration and does not use advertising trackers, behavioral profiling pixels,
              or third-party analytics cookies.
            </p>
            <p>
              <strong>2. Local Browser Storage &amp; Custom API Credentials:</strong> Interface
              preferences (such as selected language) and optional user-supplied Gemini API
              credentials (custom API key, custom base URL, and selected model identifier) are
              stored exclusively in your browser&apos;s local storage (<code>localStorage</code>).
              When you submit an AI analysis query using a custom channel, your credentials are
              forwarded over HTTPS solely to execute that single request and are never logged,
              cached, or persisted in Cloudflare Workers KV or server storage.
            </p>
            <p>
              <strong>3. Cartographic &amp; AI Service Requests:</strong> Basemap vector tiles are
              fetched from CARTO, historical administrative boundary geometries are resolved from
              OpenStreetMap / Nominatim and cached at the edge, and AI chat prompts containing map
              context are processed via the Google Gemini API.
            </p>
            <p>
              <strong>4. Contact:</strong> For privacy inquiries or data requests, please contact
              the development team at{' '}
              <a
                href="mailto:devteamcontact@clioatlas.org"
                className="font-mono text-sky-300 hover:text-sky-200 underline underline-offset-4"
              >
                devteamcontact@clioatlas.org
              </a>
              .
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800/80 py-8 px-6 text-xs text-slate-500">
        <div className="mx-auto max-w-[1120px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>Clio-Atlas · Hosted on Cloudflare Pages / Workers</div>
          <div className="flex flex-wrap items-center gap-4 font-mono">
            <a
              href="mailto:devteamcontact@clioatlas.org"
              className="hover:text-slate-300 transition-colors"
            >
              devteamcontact@clioatlas.org
            </a>
            <span aria-hidden="true">·</span>
            <a
              href="https://github.com/shanoa-source"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-slate-300 transition-colors"
            >
              github.com/shanoa-source
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};
