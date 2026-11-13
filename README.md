# Clio Atlas · Global Historical Spatio-Temporal GIS

> **Charting the spatio-temporal evolution of human civilizations across a single-year precision 3D globe and deep-space ecliptic.**  
> **以单年精度时间标尺与真实测绘政区边界，在三维地球与深空黄道上重现人类文明演进。**  
> **Die raum-zeitliche Entwicklung menschlicher Zivilisationen mit einjähriger Präzision auf einem 3D-Globus und in der Ekliptik kartieren.**

[English](#english) · [简体中文](#简体中文) · [Deutsch](#deutsch) · [Privacy Policy](#privacy-policy)

---

## English

### Overview

**Clio Atlas** is a full-stack interactive historical geographic information platform designed for digital humanities, historical cartography, and quantitative spatio-temporal research. All historical datasets are automatically detected and aggregated on the backend, while the frontend loads the complete multi-civilization corpus onto one continuous global timeline (`/` for the interactive 3D Atlas, `/intro` for the static project overview and privacy policy).

Instead of rough hand-drawn polygons, Clio Atlas dissolves real OpenStreetMap administrative relations onto an anachronism-free dark vector globe—synchronizing polity borders, extensible historical flags, population density, pre-industrial nighttime radiance, coastline-verified maritime routes, primary-source species records, mortality catastrophes, and a 3D Solar System ecliptic stage.

### Features

- **Anachronism-Free 3D Globe & 2D World Map**: Powered by MapLibre GL JS 3D Globe projection and a sanitized CARTO Dark Matter vector pipeline that strips modern national borders, roads, buildings, and modern city labels while preserving crisp coastlines and hydrography.
- **Lossless OpenStreetMap Polity Parcels & Extensible Flags**: Historical territories bind canonical OpenStreetMap Relation/Way IDs (`R...` / `W...`) with dissolved internal municipal seams. Polity banners support built-in presets (`flagId`), XSS-sanitized inline vector markup (`flagSvg`), and external or Data-URI assets (`flagAsset`).
- **Backend Dataset Auto-Detection & 1-Year Chronometer**: Historical datasets are detected exclusively on the backend and loaded simultaneously into a unified global timeline whose `min/max` year bounds derive dynamically from active records, supporting 1-year tick zoom, astronomical year-zero skipping, and interval loop playback.
- **Multi-Dimensional Quantitative Thematic Overlays**: Freely stack Population Density (blue-to-umber), Pre-Industrial Nighttime Lights, coastline-safe Catmull-Rom Maritime Transport Routes, Primary-Source Species Discoveries (`classicalSourceName`), and smooth $C^2$ fade-envelope Mortality Catastrophes.
- **Three.js Solar System Ecliptic Stage**: Zooming out with the Moon & Deep Space layer active transitions smoothly into a 3D Solar System orbital plane with real-time Keplerian positions and planetary inspection.
- **Spatial Region Selector & Dual-Channel Gemini AI Analysis**: Draw bounding boxes, radial circles, or click territories to extract structured metrics and query **Gemini 4 Hydrogen** (`gemini-4-hydrogen`) via the server default channel—or configure a custom Gemini API key, optional base URL, and preferred Gemini model in the frontend channel selector.
- **Trilingual Localization**: Native UI, historical records, and AI prompt synthesis in **Chinese (`zh`)**, **English (`en`)**, and **German (`de`)**.

### Tech Stack

- **Frontend & UI**: React 19, TypeScript, Vite, Tailwind CSS 4, Motion, Lucide Icons
- **3D & Geospatial Engine**: MapLibre GL JS (3D Globe & 2D Mercator), CARTO Dark Matter Vector Tiles, Three.js, D3-Geo, TopoJSON, OpenStreetMap Administrative Boundaries
- **Edge Compute & Storage**: Cloudflare Pages, Cloudflare Pages Functions (Workers V8 Isolates), Cloudflare Workers KV (`ATLAS_DATA_KV`, `OSM_CACHE_KV`), Node.js / Express (Local Development Bridge)
- **AI & Data Validation**: Google Gemini API (`@google/genai` Server-Side SDK, default `gemini-4-hydrogen` + Custom API/Model Channel), JSON Schema Draft 2020-12

### Deployment

**Hosted on Cloudflare Pages / Workers.**

- Static frontend bundles and SPA routes (`/` and `/intro`) are served globally via **Cloudflare Pages**.
- All `/api/*` routes execute inside stateless **Cloudflare Pages Functions (Cloudflare Workers V8 Isolates)** backed by **Cloudflare Workers KV** bindings for persistent data imports and single-read composite OpenStreetMap geometry batches.

```bash
# Local development
npm install
npm run dev

# Production build & unit test suite
npm run build
npx tsx --test src/utils/geoMath.test.ts src/server/dataImportService.test.ts src/edge/pagesFunctions.test.ts
```

### Developer & Contact

- **Developer Email**: [devteamcontact@clioatlas.org](mailto:devteamcontact@clioatlas.org)
- **Developer GitHub**: [https://github.com/shanoa-source](https://github.com/shanoa-source)

---

## 简体中文

### 项目简介

**Clio Atlas（全球历史时空地理平台）** 是一套面向历史地理学、数字人文与定量时空分析的全栈交互式地理信息系统。所有历史时空数据集均在后端自动检测与聚合，前端一次性加载完整多文明历史序列至同一连续全球时间轴（`/` 为交互式三维地球主页，`/intro` 为静态项目简介与隐私政策页）。

平台摒弃失真的手绘近似多边形，直接基于真实 OpenStreetMap 行政关系与海岸线进行球面拓扑消缝，在剥离现代国界、公路与现代城市标签的暗色矢量底图上，同步呈现政权版图、可扩展历史旗帜、人口密度、前工业夜间光强、公海无穿陆航道、原典物种记述、战争与瘟疫浩劫以及 Three.js 太阳系深空视图。

### 核心功能（Features）

- **三维地球仪与二维世界地图双模纯净底图**：基于 MapLibre GL JS 三维球体引擎与深度净化的 CARTO Dark Matter 矢量瓦片，彻底剥离现代国界、道路建筑与现代地名干扰，保留高精度海岸线与水系。
- **真实 OpenStreetMap 政区消缝与可扩展历史旗帜**：所有历史辖区均绑定真实 OpenStreetMap Relation/Way 编号并自动消除内部行政接缝；旗帜系统支持内置纹章预设（`flagId`）、经安全清洗的自定义内联矢量（`flagSvg`）与外部图像资源（`flagAsset`）。
- **后端自动数据集检测与单年精度时间轴**：数据集仅在后端检测并聚合下发，前端加载全部数据集；时间轴根据数据动态推导有效纪年窗口，支持 1 年/格高精度缩放、自动跳过公元 0 年、时间段截取与循环播放。
- **多维定量专题图层叠加**：支持自由多选叠加人口密度（蓝至深棕梯度）、前工业夜间光照、经海岸防碰撞校验的 Catmull-Rom 海运干线、含跨文明原典名称（`classicalSourceName`）的物种发现记述，以及具备平滑淡入淡出包络的死亡浩劫热力层。
- **太阳系黄道深空天体舞台**：激活「月球与深空」图层后向外滚动缩放地球仪，可平滑切入 Three.js 太阳系黄道平面视图，检视天体运行轨道与近景详情。
- **空间选区耦合概览与双通道 Gemini 智能分析**：支持矩形框选、画圈测距与点选政区提取结构化概览；AI 分析默认使用服务端 **Gemini 4 Hydrogen**（`gemini-4-hydrogen`），同时提供前端自定义 API Key、网关 URL 与指定 Gemini 模型通道。
- **中英德三语原生支持**：界面交互、历史数据与 AI 对话提示词完整支持**中文（`zh`）**、**英语（`en`）**与**德语（`de`）**。

### 技术栈（Tech Stack）

- **前端与交互 UI**：React 19 · TypeScript · Vite · Tailwind CSS 4 · Motion · Lucide Icons
- **三维地理与深空引擎**：MapLibre GL JS (3D Globe & 2D Mercator) · CARTO Dark Matter Vector Tiles · Three.js · D3-Geo · TopoJSON · OpenStreetMap Boundaries
- **边缘计算与存储**：Cloudflare Pages · Cloudflare Pages Functions (Workers V8 Isolates) · Cloudflare Workers KV (`ATLAS_DATA_KV`, `OSM_CACHE_KV`) · Node.js / Express（本地开发桥接）
- **AI 与数据校验**：Google Gemini API（`@google/genai` 服务端 SDK · 默认 `gemini-4-hydrogen` + 自定义 API/模型通道）· JSON Schema Draft 2020-12

### 部署架构（Deployment）

**Hosted on Cloudflare Pages / Workers.**

- 前端静态资源与客户端路由（`/` 与 `/intro`）托管于 **Cloudflare Pages** 全球边缘网络。
- 全部 `/api/*` 后端接口运行于 **Cloudflare Pages Functions（Workers V8 隔离环境）**，结合 **Cloudflare Workers KV** 实现 OpenStreetMap 高精度政区边界批次缓存与运行时数据持久化。

### 开发者与联系方式

- **开发者邮箱**：[devteamcontact@clioatlas.org](mailto:devteamcontact@clioatlas.org)
- **开发者 GitHub**：[https://github.com/shanoa-source](https://github.com/shanoa-source)

---

## Deutsch

### Projektübersicht

**Clio Atlas** ist eine interaktive Full-Stack-Plattform für historische Geoinformatik, Digital Humanities und quantitative Raum-Zeit-Analysen. Sämtliche historischen Datensätze werden ausschließlich im Backend erkannt und zusammengeführt, während das Frontend den gesamten Datenbestand gleichzeitig auf einer durchgehenden globalen Zeitleiste lädt (`/` für den interaktiven 3D-Globus, `/intro` für die statische Projektübersicht und Datenschutzerklärung).

Anstelle ungenauer handgezeichneter Polygone verschmilzt Clio Atlas reale administrative OpenStreetMap-Relationen auf einem von modernen Staatsgrenzen, Straßen und heutigen Städtenamen bereinigten Vektorglobus – gekoppelt mit historischen Flaggen, Bevölkerungsdichte, vorindustrieller Nachtbeleuchtung, küstensicheren Seehandelsrouten, quellenbasierten Artenbelegen, Katastrophenverläufen sowie einer dreidimensionalen Sonnensystem-Ekliptikansicht.

### Kernfunktionen (Features)

- **Anachronismusfreier 3D-Globus & 2D-Weltkarte**: MapLibre GL JS 3D-Globus-Projektion kombiniert mit bereinigten CARTO Dark Matter Vektorkacheln ohne moderne Staatsgrenzen, Straßen oder heutige Ortsnamen bei präzisen Küsten- und Gewässerlinien.
- **Verlustfreie OpenStreetMap-Gebietsparzellen & erweiterbare Flaggen**: Historische Territorien binden kanonische OpenStreetMap-Relationen (`R...` / `W...`) mit aufgelösten Binnengrenzen. Herrschaftsbanner unterstützen integrierte Presets (`flagId`), bereinigtes Inline-SVG (`flagSvg`) sowie externe Bild-Assets (`flagAsset`).
- **Automatische Backend-Datensatzerkennung & Ein-Jahres-Chronometer**: Datensätze werden im Backend erkannt und vollständig in eine gemeinsame globale Zeitleiste geladen, deren Zeitgrenzen dynamisch aus den Daten abgeleitet werden – inklusive 1-Jahres-Auflösung, Überspringen des Jahres Null und Intervall-Schleifenwiedergabe.
- **Mehrdimensionale quantitative Themenebenen**: Frei kombinierbare Ebenen für Bevölkerungsdichte, vorindustrielle Nachtbeleuchtung, kollisionsgeprüfte Catmull-Rom-Seehandelsrouten, historische Artenbelege (`classicalSourceName`) und Katastrophen-Wärmekarten.
- **Three.js Sonnensystem- & Tiefraumbühne**: Nahtloser Übergang vom 3D-Erdglobus in die Ekliptikebene des Sonnensystems mit Echtzeit-Umlaufbahnen und Planeten-Nahansicht.
- **Räumliche Gebietsauswahl & Zweikanal-Gemini-KI-Analyse**: Rechteck-, Kreis- oder Parzellenauswahl zur Extraktion strukturierter Kennzahlen für kontextbezogene KI-Analysen über den Standard-Serverkanal (**Gemini 4 Hydrogen**, `gemini-4-hydrogen`) oder über einen eigenen Gemini-API-Schlüssel samt optionaler Basis-URL und wählbarem Gemini-Modell.
- **Dreisprachige Lokalisierung**: Vollständige Unterstützung für **Chinesisch (`zh`)**, **Englisch (`en`)** und **Deutsch (`de`)**.

### Technologie-Stack (Tech Stack)

- **Frontend & UI**: React 19, TypeScript, Vite, Tailwind CSS 4, Motion, Lucide Icons
- **3D- & Geodaten-Engine**: MapLibre GL JS (3D Globe & 2D Mercator), CARTO Dark Matter Vector Tiles, Three.js, D3-Geo, TopoJSON, OpenStreetMap Administrative Boundaries
- **Edge-Laufzeit & Speicher**: Cloudflare Pages, Cloudflare Pages Functions (Workers V8 Isolates), Cloudflare Workers KV (`ATLAS_DATA_KV`, `OSM_CACHE_KV`), Node.js / Express (Lokale Entwicklungsbrücke)
- **KI & Datenvalidierung**: Google Gemini API (`@google/genai` Server-SDK, Standard `gemini-4-hydrogen` + Eigener API-/Modellkanal), JSON Schema Draft 2020-12

### Bereitstellung (Deployment)

**Hosted on Cloudflare Pages / Workers.**

- Statische Assets und SPA-Routen (`/` und `/intro`) werden weltweit über **Cloudflare Pages** ausgeliefert.
- Alle `/api/*`-Endpunkte laufen serverlos in **Cloudflare Pages Functions (Workers V8 Isolates)** mit **Cloudflare Workers KV** für Edge-Caching von OpenStreetMap-Geometrien und persistente Datenimporte.

### Entwicklerkontakt

- **E-Mail**: [devteamcontact@clioatlas.org](mailto:devteamcontact@clioatlas.org)
- **GitHub**: [https://github.com/shanoa-source](https://github.com/shanoa-source)

---

## Privacy Policy

*Effective Date: November 2026 (Provided in English)*

1. **Data Minimization & No Tracking**: Clio Atlas does not require user accounts and does not deploy advertising trackers, behavioral profiling pixels, or third-party analytics cookies.
2. **Local Browser Storage & Custom API Credentials**: User interface preferences (such as display language) and optional user-supplied Gemini API configurations (custom API key, optional base URL, and selected model ID) are stored solely in your local browser (`localStorage`). When using the custom AI channel, credentials are transmitted over HTTPS exclusively to fulfill your active chat request and are never logged, cached, or persisted on our servers or in Cloudflare Workers KV.
3. **Cartographic & AI Service Requests**: Vector basemap tiles are loaded from CARTO, administrative boundary geometries are fetched from OpenStreetMap / Nominatim and cached at the edge, and user-initiated AI chat queries containing map context are processed via the Google Gemini API.
4. **Contact**: If you have any questions regarding this Privacy Policy, please contact the developer team at [devteamcontact@clioatlas.org](mailto:devteamcontact@clioatlas.org).
