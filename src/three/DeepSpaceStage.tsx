import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getSolarSystemBodies, getSpaceMissions } from '../shared/atlasDataLayer';
import { AppLanguage, CelestialBodySpec, SelectedEntity, SpaceStage } from '../types/history';
import {
  formatYearByLang,
  localizeCelestialBody,
  UI_TEXT,
} from '../i18n/translations';
import {
  clamp,
  computeCelestialBodyXZ,
  computeMissionTransferProgress,
  createSeededRandom,
  lerp,
} from '../utils/geoMath';

interface DeepSpaceStageProps {
  language: AppLanguage;
  currentYear: number;
  spaceStage: Exclude<SpaceStage, 'earth'>;
  focusedBodyId: string;
  cameraCommand: { id: number; kind: 'zoom_in' | 'zoom_out' | 'reset_north' } | null;
  onSpaceStageChange: (stage: SpaceStage, bodyId?: string) => void;
  onSelectEntity: (entity: SelectedEntity | null) => void;
}

const isSoftwareGl = (() => {
  if (typeof document === 'undefined') return false;
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param));
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
})();

function buildCelestialMaps(
  body: CelestialBodySpec,
  maxAnisotropy: number,
): { albedo: THREE.CanvasTexture; bump: THREE.CanvasTexture | null } {
  const w = 512;
  const h = 256;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  const rand = createSeededRandom(
    body.id.split('').reduce((acc, ch) => acc * 31 + ch.charCodeAt(0), 7919),
  );

  const base = new THREE.Color(body.baseColor);
  const sec = new THREE.Color(body.secondaryColor);

  // 1. Base latitudinal shading / atmospheric bands
  for (let y = 0; y < h; y++) {
    const v = y / h;
    const latFreq =
      body.id === 'jupiter' ? 18 : body.id === 'saturn' ? 14 : body.id === 'venus' ? 8 : 4;
    const wave =
      0.5 +
      0.35 * Math.sin(v * Math.PI * latFreq) +
      0.15 * Math.cos(v * Math.PI * (latFreq * 2.3 + 1.1));
    const mixT = clamp(wave * (body.id === 'jupiter' || body.id === 'saturn' ? 0.75 : 0.36), 0, 1);
    const r = Math.round(lerp(base.r, sec.r, mixT) * 255);
    const g = Math.round(lerp(base.g, sec.g, mixT) * 255);
    const b = Math.round(lerp(base.b, sec.b, mixT) * 255);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, w, 1);
  }

  let bumpCanvas: HTMLCanvasElement | null = null;
  let bumpCtx: CanvasRenderingContext2D | null = null;

  if (body.id === 'moon' || body.id === 'mercury' || body.id === 'mars') {
    bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = w;
    bumpCanvas.height = h;
    bumpCtx = bumpCanvas.getContext('2d')!;
    bumpCtx.fillStyle = '#808080';
    bumpCtx.fillRect(0, 0, w, h);
  }

  // 2. Domain-authentic selenographic / planetary surface features
  if (body.id === 'moon') {
    // Basaltic Lunar Maria (Mare Imbrium, Serenitatis, Tranquillitatis, Procellarum)
    const mariaSpots = [
      { x: 195, y: 86, r: 52, a: 0.46 },
      { x: 254, y: 96, r: 38, a: 0.44 },
      { x: 290, y: 124, r: 36, a: 0.42 },
      { x: 142, y: 114, r: 62, a: 0.4 },
      { x: 332, y: 132, r: 28, a: 0.38 },
      { x: 222, y: 148, r: 32, a: 0.35 },
    ];
    for (const m of mariaSpots) {
      const grad = ctx.createRadialGradient(m.x, m.y, m.r * 0.12, m.x, m.y, m.r);
      grad.addColorStop(0, `rgba(38, 45, 58, ${m.a})`);
      grad.addColorStop(0.62, `rgba(51, 60, 76, ${m.a * 0.68})`);
      grad.addColorStop(1, 'rgba(51, 60, 76, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine highland regolith grain
    for (let i = 0; i < 1200; i++) {
      const gx = rand() * w;
      const gy = rand() * h;
      const lum = rand() > 0.5 ? 'rgba(248,250,252,0.055)' : 'rgba(15,23,42,0.075)';
      ctx.fillStyle = lum;
      ctx.fillRect(gx, gy, 2, 2);
    }

    // Multi-scale impact craters with directional sunlight/shadow relief (no uniform white rings)
    for (let i = 0; i < 175; i++) {
      const cx = 14 + rand() * (w - 28);
      const cy = 18 + rand() * (h - 36);
      const cr = 1.6 + Math.pow(rand(), 2.5) * 13.5;

      // Sunlit far floor & shadowed near wall
      const bowl = ctx.createLinearGradient(cx - cr, cy - cr, cx + cr, cy + cr);
      bowl.addColorStop(0, 'rgba(15, 23, 42, 0.34)');
      bowl.addColorStop(0.48, 'rgba(51, 65, 85, 0.16)');
      bowl.addColorStop(0.88, 'rgba(226, 232, 240, 0.18)');
      bowl.addColorStop(1, 'rgba(241, 245, 249, 0.04)');
      ctx.fillStyle = bowl;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      if (bumpCtx) {
        const bGrad = bumpCtx.createRadialGradient(cx, cy, cr * 0.1, cx, cy, cr);
        bGrad.addColorStop(0, 'rgb(70,70,70)');
        bGrad.addColorStop(0.82, 'rgb(104,104,104)');
        bGrad.addColorStop(0.95, 'rgb(196,196,196)');
        bGrad.addColorStop(1, 'rgb(128,128,128)');
        bumpCtx.fillStyle = bGrad;
        bumpCtx.beginPath();
        bumpCtx.arc(cx, cy, cr, 0, Math.PI * 2);
        bumpCtx.fill();
      }
    }

    // Rayed crater (Tycho-like highland rays)
    const rx = 236;
    const ry = 192;
    for (let r = 0; r < 18; r++) {
      const ang = (r / 18) * Math.PI * 2 + rand() * 0.2;
      const len = 26 + rand() * 48;
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.11)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + Math.cos(ang) * len, ry + Math.sin(ang) * len * 0.65);
      ctx.stroke();
    }
  } else if (body.id === 'mars') {
    // Dark basaltic albedo regions (Syrtis Major / Valles Marineris)
    for (let i = 0; i < 18; i++) {
      const mx = rand() * w;
      const my = 48 + rand() * (h - 96);
      const mr = 16 + rand() * 34;
      const g = ctx.createRadialGradient(mx, my, 2, mx, my, mr);
      g.addColorStop(0, 'rgba(68, 28, 14, 0.34)');
      g.addColorStop(1, 'rgba(68, 28, 14, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
    }
    // Polar CO2 ice caps
    ctx.fillStyle = 'rgba(248, 250, 252, 0.82)';
    ctx.fillRect(0, 0, w, 11);
    ctx.fillRect(0, h - 10, w, 10);
  } else if (body.id === 'jupiter') {
    // Great Red Spot
    ctx.save();
    ctx.translate(310, 158);
    ctx.scale(1.65, 0.95);
    const grs = ctx.createRadialGradient(0, 0, 2, 0, 0, 16);
    grs.addColorStop(0, 'rgba(194, 65, 12, 0.88)');
    grs.addColorStop(0.7, 'rgba(234, 88, 12, 0.55)');
    grs.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = grs;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (body.id === 'earth') {
    // Simplified continental patches + polar caps for Solar System Earth sphere
    const continents = [
      { x: 285, y: 78, rx: 46, ry: 28 },
      { x: 278, y: 132, rx: 28, ry: 38 },
      { x: 358, y: 88, rx: 52, ry: 32 },
      { x: 128, y: 86, rx: 36, ry: 26 },
      { x: 156, y: 152, rx: 22, ry: 36 },
    ];
    for (const c of continents) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.rx, c.ry);
      const cg = ctx.createRadialGradient(0, 0, 0.15, 0, 0, 1);
      cg.addColorStop(0, 'rgba(52, 132, 78, 0.88)');
      cg.addColorStop(0.75, 'rgba(84, 142, 82, 0.65)');
      cg.addColorStop(1, 'rgba(84, 142, 82, 0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = 'rgba(241, 245, 249, 0.85)';
    ctx.fillRect(0, 0, w, 12);
    ctx.fillRect(0, h - 14, w, 14);
  } else if (body.id === 'mercury') {
    for (let i = 0; i < 110; i++) {
      const cx = 12 + rand() * (w - 24);
      const cy = 14 + rand() * (h - 28);
      const cr = 2 + Math.pow(rand(), 2) * 10;
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.18)';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.22)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  const albedo = new THREE.CanvasTexture(canvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.anisotropy = maxAnisotropy;
  albedo.needsUpdate = true;

  let bump: THREE.CanvasTexture | null = null;
  if (bumpCanvas) {
    bump = new THREE.CanvasTexture(bumpCanvas);
    bump.anisotropy = maxAnisotropy;
    bump.needsUpdate = true;
  }

  return { albedo, bump };
}

function createSaturnRingTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < 256; x++) {
    const u = x / 255;
    // Cassini Division gap around u = 0.63..0.69
    const cassini = u > 0.62 && u < 0.68 ? 0.08 : 1.0;
    const innerFade = clamp((u - 0.05) / 0.15, 0, 1);
    const outerFade = clamp((1 - u) / 0.12, 0, 1);
    const fineRipple = 0.72 + 0.28 * Math.sin(u * 68);
    const alpha = clamp(innerFade * outerFade * cassini * fineRipple * 0.85, 0, 0.9);
    ctx.fillStyle = `rgba(238, 214, 168, ${alpha.toFixed(3)})`;
    ctx.fillRect(x, 0, 1, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

const _tmpVec = new THREE.Vector3();
const _upVec = new THREE.Vector3(0, 1, 0);

export const DeepSpaceStage: React.FC<DeepSpaceStageProps> = ({
  language,
  currentYear,
  spaceStage,
  focusedBodyId,
  cameraCommand,
  onSpaceStageChange,
  onSelectEntity,
}) => {
  const ui = UI_TEXT[language];
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [bodyOverlays, setBodyOverlays] = useState<
    Array<{ body: CelestialBodySpec; x: number; y: number; visible: boolean }>
  >([]);

  const latestRef = useRef({
    currentYear,
    spaceStage,
    focusedBodyId,
    onSpaceStageChange,
    onSelectEntity,
  });
  latestRef.current = {
    currentYear,
    spaceStage,
    focusedBodyId,
    onSpaceStageChange,
    onSelectEntity,
  };

  const apiRef = useRef<{
    syncStage: () => void;
    applyCameraCommand: (kind: 'zoom_in' | 'zoom_out' | 'reset_north') => void;
  } | null>(null);

  const solarBodies = useMemo(() => getSolarSystemBodies(), []);
  const spaceMissions = useMemo(() => getSpaceMissions(), [currentYear]);

  const focusedBodySpec = useMemo(
    () =>
      solarBodies.find((b) => b.id === focusedBodyId) ??
      solarBodies.find((b) => b.id === 'moon')!,
    [focusedBodyId, solarBodies],
  );

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#05070C');
    scene.fog = new THREE.FogExp2('#05070C', 0.0014);

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.5, 2500);
    camera.position.set(0, 106, 88);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    // Mandatory studio environment map for PBR planetary materials & metallic rings
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 3-point warm/cool studio & solar lighting
    const hemiLight = new THREE.HemisphereLight(0xcbd5e1, 0x0f172a, 0.65);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.15);
    keyLight.position.set(160, 95, 140);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.55);
    rimLight.position.set(-140, -60, -130);
    scene.add(rimLight);

    // Seeded deep-space starfield
    const starRand = createSeededRandom(90421);
    const starCount = 1400;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const u = starRand() * 2 - 1;
      const theta = starRand() * Math.PI * 2;
      const r = 900 + starRand() * 650;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      starPos[i * 3] = r * s * Math.cos(theta);
      starPos[i * 3 + 1] = r * u;
      starPos[i * 3 + 2] = r * s * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      size: 1.4,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.58,
    });
    scene.add(new THREE.Points(starGeo, starMat));

    const bodiesList = getSolarSystemBodies();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const mapCache = new Map<
      string,
      { albedo: THREE.CanvasTexture; bump: THREE.CanvasTexture | null }
    >();
    for (const b of bodiesList) {
      mapCache.set(b.id, buildCelestialMaps(b, maxAniso));
    }
    const saturnRingTex = createSaturnRingTexture(maxAniso);

    // =========================================================================
    // 1. SOLAR SYSTEM ECLIPTIC GROUP
    // =========================================================================
    const solarRoot = new THREE.Group();
    scene.add(solarRoot);

    const polarGrid = new THREE.PolarGridHelper(66, 12, 8, 96, 0x16253b, 0x0d1726);
    solarRoot.add(polarGrid);

    const solarBodyGroups = new Map<string, THREE.Group>();
    const clickableMeshes: THREE.Object3D[] = [];

    for (const body of bodiesList) {
      const grp = new THREE.Group();
      grp.userData = { body };

      if (body.kind === 'star') {
        // Composite 3-part Sun (core + chromosphere + coronal aura)
        const core = new THREE.Mesh(
          new THREE.SphereGeometry(body.displayRadius, 36, 28),
          new THREE.MeshBasicMaterial({ color: 0xfef08a }),
        );
        const chromo = new THREE.Mesh(
          new THREE.SphereGeometry(body.displayRadius * 1.22, 32, 24),
          new THREE.MeshBasicMaterial({
            color: 0xf59e0b,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
          }),
        );
        const corona = new THREE.Mesh(
          new THREE.SphereGeometry(body.displayRadius * 1.64, 28, 20),
          new THREE.MeshBasicMaterial({
            color: 0xea580c,
            transparent: true,
            opacity: 0.12,
            depthWrite: false,
          }),
        );
        grp.add(core, chromo, corona);
      } else {
        if (!body.parentBodyId && body.orbitRadiusUnits > 0) {
          const pts: THREE.Vector3[] = [];
          for (let s = 0; s <= 160; s++) {
            const a = (s / 160) * Math.PI * 2;
            pts.push(
              new THREE.Vector3(
                Math.cos(a) * body.orbitRadiusUnits,
                0,
                Math.sin(a) * body.orbitRadiusUnits,
              ),
            );
          }
          const orbitLoop = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({
              color: body.id === 'earth' ? 0x38bdf8 : 0x26354d,
              transparent: true,
              opacity: body.id === 'earth' ? 0.72 : 0.52,
            }),
          );
          solarRoot.add(orbitLoop);
        }

        const maps = mapCache.get(body.id)!;
        const sphere = new THREE.Mesh(
          new THREE.SphereGeometry(body.displayRadius, 36, 28),
          new THREE.MeshStandardMaterial({
            map: maps.albedo,
            ...(maps.bump ? { bumpMap: maps.bump, bumpScale: 0.35 } : {}),
            roughness: 0.78,
            metalness: 0.05,
          }),
        );
        sphere.userData = { body };
        grp.add(sphere);
        clickableMeshes.push(sphere);

        if (body.hasRings) {
          const ringGeo = new THREE.RingGeometry(
            body.displayRadius * 1.35,
            body.displayRadius * 2.35,
            64,
          );
          // Radial UV mapping for Cassini Division texture
          const pos = ringGeo.attributes.position;
          const uv = ringGeo.attributes.uv;
          const innerR = body.displayRadius * 1.35;
          const outerR = body.displayRadius * 2.35;
          for (let i = 0; i < pos.count; i++) {
            const rx = pos.getX(i);
            const ry = pos.getY(i);
            const r = Math.hypot(rx, ry);
            uv.setXY(i, clamp((r - innerR) / (outerR - innerR), 0, 1), 0.5);
          }
          const ringMesh = new THREE.Mesh(
            ringGeo,
            new THREE.MeshStandardMaterial({
              map: saturnRingTex,
              side: THREE.DoubleSide,
              transparent: true,
              roughness: 0.65,
              depthWrite: false,
            }),
          );
          ringMesh.rotation.x = Math.PI * 0.43;
          grp.add(ringMesh);
        }

        if (body.id === 'earth') {
          const moonSpec = bodiesList.find((m) => m.id === 'moon');
          if (moonSpec) {
            const mPts: THREE.Vector3[] = [];
            for (let s = 0; s <= 64; s++) {
              const a = (s / 64) * Math.PI * 2;
              mPts.push(
                new THREE.Vector3(
                  Math.cos(a) * moonSpec.orbitRadiusUnits,
                  0,
                  Math.sin(a) * moonSpec.orbitRadiusUnits,
                ),
              );
            }
            grp.add(
              new THREE.LineLoop(
                new THREE.BufferGeometry().setFromPoints(mPts),
                new THREE.LineBasicMaterial({
                  color: 0x94a3b8,
                  transparent: true,
                  opacity: 0.55,
                }),
              ),
            );
          }
        }
      }

      solarRoot.add(grp);
      solarBodyGroups.set(body.id, grp);
    }

    const trajectoryGroup = new THREE.Group();
    solarRoot.add(trajectoryGroup);
    const probeConeGeo = new THREE.ConeGeometry(0.45, 1.35, 8);

    // =========================================================================
    // 2. CELESTIAL BODY ORBITAL & SURFACE INSPECTOR GROUP
    // =========================================================================
    const detailRoot = new THREE.Group();
    detailRoot.visible = false;
    scene.add(detailRoot);

    const detailMat = new THREE.MeshStandardMaterial({
      roughness: 0.84,
      metalness: 0.04,
      bumpScale: 0.85,
    });
    const detailSphere = new THREE.Mesh(new THREE.SphereGeometry(25, 64, 48), detailMat);
    detailSphere.rotation.y = -0.45;
    detailRoot.add(detailSphere);

    // Polar & inclined orbital telemetry reference rings (3-part composite inspector)
    const orbitRingInclined = new THREE.Mesh(
      new THREE.TorusGeometry(32.5, 0.11, 12, 128),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.48 }),
    );
    orbitRingInclined.rotation.x = Math.PI * 0.43;
    orbitRingInclined.rotation.y = 0.24;
    detailRoot.add(orbitRingInclined);

    const orbitRingEquatorial = new THREE.Mesh(
      new THREE.TorusGeometry(37.2, 0.08, 10, 128),
      new THREE.MeshBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.28 }),
    );
    orbitRingEquatorial.rotation.x = Math.PI * 0.5;
    detailRoot.add(orbitRingEquatorial);

    const detailSaturnRingGeo = new THREE.RingGeometry(33, 55, 96);
    {
      const pos = detailSaturnRingGeo.attributes.position;
      const uv = detailSaturnRingGeo.attributes.uv;
      for (let i = 0; i < pos.count; i++) {
        const r = Math.hypot(pos.getX(i), pos.getY(i));
        uv.setXY(i, clamp((r - 33) / 22, 0, 1), 0.5);
      }
    }
    const detailSaturnRing = new THREE.Mesh(
      detailSaturnRingGeo,
      new THREE.MeshStandardMaterial({
        map: saturnRingTex,
        side: THREE.DoubleSide,
        transparent: true,
        roughness: 0.6,
        depthWrite: false,
      }),
    );
    detailSaturnRing.rotation.x = Math.PI * 0.44;
    detailSaturnRing.visible = false;
    detailRoot.add(detailSaturnRing);

    // =========================================================================
    // CONTROLS & SOFTWARE-WEBGL PACED RENDERING
    // =========================================================================
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.07;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;

    let frameId = 0;
    let renderBusy = false;
    let renderDirty = false;
    let unmounted = false;
    let prevStage: SpaceStage | null = null;
    let prevFocusedId: string | null = null;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const poll = () => {
        if (unmounted) return;
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function updateDomProjections() {
      const { spaceStage: stg } = latestRef.current;
      if (stg !== 'solar_system') {
        setBodyOverlays([]);
        return;
      }
      const w = container?.clientWidth || window.innerWidth;
      const h = container?.clientHeight || window.innerHeight;
      camera.updateMatrixWorld();

      const next = bodiesList.map((b) => {
        const grp = solarBodyGroups.get(b.id);
        if (!grp) return { body: b, x: 0, y: 0, visible: false };
        _tmpVec.copy(grp.position);
        _tmpVec.y += b.displayRadius + (b.id === 'moon' ? 1.8 : 1.15);
        _tmpVec.project(camera);
        return {
          body: b,
          x: (_tmpVec.x * 0.5 + 0.5) * w,
          y: (-_tmpVec.y * 0.5 + 0.5) * h,
          visible: _tmpVec.z < 1 && _tmpVec.x > -0.98 && _tmpVec.x < 0.98,
        };
      });

      // Avoid Earth/Moon label collision on planar view
      const earthItem = next.find((n) => n.body.id === 'earth');
      const moonItem = next.find((n) => n.body.id === 'moon');
      if (
        earthItem &&
        moonItem &&
        Math.abs(earthItem.x - moonItem.x) < 48 &&
        Math.abs(earthItem.y - moonItem.y) < 26
      ) {
        moonItem.y = earthItem.y - 26;
        moonItem.x = earthItem.x + 28;
      }

      setBodyOverlays(next);
    }

    function drawImmediate() {
      if (unmounted) return;
      controls.update();
      renderer.render(scene, camera);
      updateDomProjections();
    }

    function requestRender() {
      if (unmounted) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (unmounted) return;
        renderDirty = false;
        drawImmediate();
        const done = () => {
          renderBusy = false;
          if (renderDirty) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    function syncStage() {
      const { currentYear: yr, spaceStage: stg, focusedBodyId: bodyId } = latestRef.current;
      const isSolar = stg === 'solar_system';
      solarRoot.visible = isSolar;
      detailRoot.visible = !isSolar;

      if (prevStage !== stg || prevFocusedId !== bodyId) {
        if (isSolar) {
          controls.target.set(0, 0, 0);
          controls.minDistance = 24;
          controls.maxDistance = 240;
          camera.position.set(0, 106, 88);
        } else {
          controls.target.set(0, 0, 0);
          controls.minDistance = 48;
          controls.maxDistance = 165;
          camera.position.set(0, 22, 98);
        }
        camera.lookAt(0, 0, 0);
        controls.update();
        prevStage = stg;
        prevFocusedId = bodyId;
      }

      if (isSolar) {
        for (const body of bodiesList) {
          const grp = solarBodyGroups.get(body.id);
          if (!grp) continue;
          const [bx, bz] = computeCelestialBodyXZ(body, yr, bodiesList);
          grp.position.set(bx, 0, bz);
        }

        while (trajectoryGroup.children.length > 0) {
          const ch = trajectoryGroup.children.pop()!;
          if ((ch as THREE.Line).geometry && ch !== undefined) {
            const g = (ch as THREE.Line).geometry;
            if (g !== probeConeGeo) g.dispose();
          }
        }

        for (const mission of getSpaceMissions()) {
          const prog = computeMissionTransferProgress(mission, yr);
          if (prog <= 0) continue;
          const originBody = bodiesList.find((b) => b.id === mission.originBodyId);
          const targetBody = bodiesList.find((b) => b.id === mission.targetBodyId);
          if (!originBody || !targetBody) continue;
          const [ox, oz] = computeCelestialBodyXZ(originBody, mission.launchYear, bodiesList);
          const [tx, tz] = computeCelestialBodyXZ(targetBody, mission.arrivalYear, bodiesList);
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(ox, 0, oz),
            new THREE.Vector3((ox + tx) * 0.5, 5.0, (oz + tz) * 0.5),
            new THREE.Vector3(tx, 0, tz),
          );
          const pts = curve.getPoints(48).slice(0, Math.max(2, Math.round(48 * prog)));
          const line = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            new THREE.LineBasicMaterial({ color: 0x38bdf8 }),
          );
          trajectoryGroup.add(line);

          const pPrev = pts[pts.length - 2];
          const pTip = pts[pts.length - 1];
          const dir = new THREE.Vector3().subVectors(pTip, pPrev).normalize();
          const cone = new THREE.Mesh(
            probeConeGeo,
            new THREE.MeshBasicMaterial({ color: 0x38bdf8 }),
          );
          cone.position.copy(pTip);
          cone.quaternion.setFromUnitVectors(_upVec, dir);
          trajectoryGroup.add(cone);
        }
      } else {
        const spec =
          bodiesList.find((b) => b.id === bodyId) ??
          bodiesList.find((b) => b.id === 'moon')!;
        const maps = mapCache.get(spec.id);
        detailMat.map = maps?.albedo ?? null;
        detailMat.bumpMap = maps?.bump ?? null;
        detailMat.needsUpdate = true;
        detailSaturnRing.visible = !!spec.hasRings;
      }

      drawImmediate();
      requestRender();
    }

    function applyCameraCommand(kind: 'zoom_in' | 'zoom_out' | 'reset_north') {
      if (kind === 'reset_north') {
        prevStage = null;
        syncStage();
        return;
      }
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
      const dist = dir.length();
      const nextDist = clamp(
        dist * (kind === 'zoom_out' ? 1.22 : 0.8),
        controls.minDistance,
        controls.maxDistance,
      );
      dir.normalize().multiplyScalar(nextDist);
      camera.position.copy(controls.target).add(dir);
      controls.update();

      if (latestRef.current.spaceStage === 'body_detail' && kind === 'zoom_out' && nextDist >= 142) {
        latestRef.current.onSpaceStageChange('solar_system', latestRef.current.focusedBodyId);
        return;
      }
      drawImmediate();
      requestRender();
    }

    // Raycast click on 3D planets
    const raycaster = new THREE.Raycaster();
    const downPt = new THREE.Vector2();
    const ndc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      downPt.set(e.clientX, e.clientY);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 5) return;
      if (latestRef.current.spaceStage !== 'solar_system') return;

      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(clickableMeshes, false);
      if (hits.length > 0) {
        const hitBody = hits[0].object.userData?.body as CelestialBodySpec | undefined;
        if (hitBody) {
          if (hitBody.id === 'earth') {
            latestRef.current.onSpaceStageChange('earth', 'earth');
          } else {
            latestRef.current.onSelectEntity(null);
            latestRef.current.onSpaceStageChange('body_detail', hitBody.id);
          }
        }
      }
    };

    const onWheel = (e: WheelEvent) => {
      const dist = camera.position.distanceTo(controls.target);
      if (latestRef.current.spaceStage === 'body_detail' && e.deltaY > 0 && dist > 120) {
        latestRef.current.onSpaceStageChange('solar_system', latestRef.current.focusedBodyId);
      } else if (latestRef.current.spaceStage === 'solar_system' && e.deltaY < 0 && dist < 42) {
        if (latestRef.current.focusedBodyId === 'earth') {
          latestRef.current.onSpaceStageChange('earth', 'earth');
        } else {
          latestRef.current.onSpaceStageChange(
            'body_detail',
            latestRef.current.focusedBodyId || 'moon',
          );
        }
      }
    };

    let lastW = width;
    let lastH = height;
    const onResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      if (w === lastW && h === lastH) return;
      lastW = w;
      lastH = h;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      drawImmediate();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
    controls.addEventListener('change', requestRender);
    window.addEventListener('resize', onResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    apiRef.current = { syncStage, applyCameraCommand };
    syncStage();

    return () => {
      unmounted = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('wheel', onWheel);
      controls.dispose();
      probeConeGeo.dispose();
      starGeo.dispose();
      starMat.dispose();
      saturnRingTex.dispose();
      mapCache.forEach(({ albedo, bump }) => {
        albedo.dispose();
        bump?.dispose();
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  useEffect(() => {
    apiRef.current?.syncStage();
  }, [currentYear, spaceStage, focusedBodyId]);

  useEffect(() => {
    if (!cameraCommand) return;
    apiRef.current?.applyCameraCommand(cameraCommand.kind);
  }, [cameraCommand]);

  const activeMissionCount = useMemo(
    () => spaceMissions.filter((m) => currentYear >= m.launchYear).length,
    [currentYear, spaceMissions],
  );

  const focusedLoc = localizeCelestialBody(focusedBodySpec, language);

  return (
    <div
      className="relative w-full h-full overflow-hidden bg-[#04060B]"
      data-testid={`deep-space-${spaceStage}`}
    >
      <div ref={mountRef} className="w-full h-full" />

      {/* Solar System Planar View Overlay */}
      {spaceStage === 'solar_system' && (
        <>
          {bodyOverlays.map(({ body, x, y, visible }) => {
            if (!visible) return null;
            const bLoc = localizeCelestialBody(body, language);
            return (
              <button
                key={body.id}
                type="button"
                aria-label={ui.celestialCoordAria(bLoc.name)}
                onClick={() => {
                  if (body.id === 'earth') {
                    onSpaceStageChange('earth', 'earth');
                  } else if (body.kind !== 'star') {
                    onSelectEntity(null);
                    onSpaceStageChange('body_detail', body.id);
                  } else {
                    onSelectEntity({ kind: 'celestial', body });
                  }
                }}
                style={{
                  transform: `translate3d(${Math.round(x)}px, ${Math.round(
                    y,
                  )}px, 0) translate(-50%, -100%)`,
                }}
                className="absolute top-0 left-0 z-10 px-2.5 py-1 rounded atlas-chassis text-xs font-medium text-slate-100 hover:border-sky-400/70 transition-colors whitespace-nowrap cursor-pointer"
              >
                {bLoc.name}
              </button>
            );
          })}

          <aside
            aria-label={ui.solarPanelAria}
            className="absolute top-15 left-4 z-10 w-80 max-w-[calc(100vw-2rem)] rounded-lg atlas-chassis atlas-reticle p-4 text-slate-200"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-white tracking-tight">
                  {ui.solarPanelTitle}
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">{ui.solarPanelSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => onSpaceStageChange('earth', 'earth')}
                className="px-3 py-1.5 rounded-md bg-sky-400 hover:bg-sky-300 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                {ui.returnEarthBtn}
              </button>
            </div>

            <div className="mt-3.5 pt-3 border-t border-white/[0.07]">
              <div className="text-[11px] text-slate-400 mb-2">{ui.selectBodyHint}</div>
              <div className="grid grid-cols-4 gap-1.5">
                {solarBodies.filter((b) => b.kind !== 'star').map((b) => {
                  const bLoc = localizeCelestialBody(b, language);
                  return (
                    <button
                      key={b.id}
                      type="button"
                      aria-label={ui.inspectBodyAria(bLoc.name)}
                      onClick={() => {
                        if (b.id === 'earth') {
                          onSpaceStageChange('earth', 'earth');
                        } else {
                          onSelectEntity(null);
                          onSpaceStageChange('body_detail', b.id);
                        }
                      }}
                      className="py-1.5 px-1.5 rounded-md atlas-well hover:border-sky-400/50 text-xs font-medium text-slate-200 hover:text-white transition-colors truncate cursor-pointer"
                    >
                      {bLoc.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3.5 pt-3 border-t border-white/[0.07] flex items-center justify-between text-xs text-slate-400">
              <span>{ui.activeMissionsLabel}</span>
              <span className="font-mono tabular-nums text-sky-300 font-semibold">
                {ui.activeMissionsUnit(activeMissionCount)}
              </span>
            </div>
          </aside>
        </>
      )}

      {/* Celestial Body Close-Up Inspector Overlay */}
      {spaceStage === 'body_detail' && (
        <aside
          aria-label={ui.bodyInspectorAria}
          className="absolute top-15 left-4 z-10 w-80 max-w-[calc(100vw-2rem)] rounded-lg atlas-chassis atlas-reticle p-4 text-slate-200"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white tracking-tight truncate">
                {focusedLoc.name} · {ui.bodyInspectorSuffix}
              </h2>
              <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                {focusedLoc.secondaryName}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onSpaceStageChange('solar_system', focusedBodySpec.id)}
                className="px-2.5 py-1.5 rounded-md atlas-well hover:border-sky-400/45 text-xs text-slate-200 hover:text-white transition-colors whitespace-nowrap cursor-pointer"
              >
                {ui.solarPlaneBtn}
              </button>
              <button
                type="button"
                onClick={() => onSpaceStageChange('earth', 'earth')}
                className="px-2.5 py-1.5 rounded-md bg-sky-400 hover:bg-sky-300 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                {ui.returnEarthBtn}
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-300 mt-3 leading-relaxed">{focusedLoc.description}</p>

          <div className="mt-3.5 pt-3 border-t border-white/[0.07] space-y-2 text-xs">
            <div className="flex items-center justify-between text-slate-400">
              <span>{ui.currentEpochLabel}</span>
              <span className="font-mono tabular-nums text-slate-100">
                {formatYearByLang(currentYear, language)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-400">
              <span>{ui.orbitersBasesLabel}</span>
              <span className="font-mono tabular-nums text-slate-100">{ui.zeroProbesUnit}</span>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

export default DeepSpaceStage;
