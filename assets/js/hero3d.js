/* ==========================================================================
   Защита от БПЛА — 3D-сцена первого экрана «Попробуйте пробить».
   Ночной резервуарный парк под сетчатым перекрытием. Полотно — физическая
   модель (узлы и связи, интегрирование Верле): удар беспилотника продавливает
   его, сетка пружинит и возвращается, по ней расходится волна.

   Курсор над сценой — прицел: сетка под ним подсвечивается и слегка
   прогибается. Клик запускает беспилотник из-за камеры в эту точку — время
   на миг замедляется, аппарат вязнет в полотне, над точкой удара всплывает
   метка «Остановлено сеткой». Сами по себе аппараты прилетают с горизонта.
   Радар в углу героя показывает их реальные позиции.

   Модуль подключает main.js. Если WebGL недоступен, в разметке остаётся
   статичная SVG-картинка героя.
   ========================================================================== */
import * as THREE from './vendor/three.module.min.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;

/* ---- Палитра сцены ---- */
const C = {
  skyTop: 0x030303,
  skyMid: 0x0a0706,
  horizon: 0x160c07,    // он же цвет тумана
  glow: 0xff5a14,
  ground: 0x0b0a09,
  steel: 0x3b3733,
  mast: 0x77706a,
  mesh: 0xc4b6aa,
  hot: 0xff6a1a,
  threat: 0xff2d1f
};

/* ---- Перекрытие, м ---- */
const NX = 46;            // полуширина по x
const NZ = 31;            // полуглубина по z
const H0 = 26;            // высота подвеса по контуру
const SAG = 3.2;          // провис в центре
const GX = 70;            // узлов по x
const GZ = 47;            // узлов по z
const CELL = 1.3;         // ячейка рисунка сетки
const RADAR_R = 320;
const SWEEP = 1.25;       // рад/с, развёртка радара

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const DEG = Math.PI / 180;

/* Рельеф: ровная площадка, увалы на горизонте закрывают край земли */
function G(x, z) {
  const r = Math.hypot(x, z);
  return smooth(760, 1380, r) * (78 + 22 * Math.sin(x * 0.006 + 1.3) + 12 * Math.sin(z * 0.009 - 0.4) + 8 * Math.abs(Math.sin(x * 0.02 + z * 0.013)))
    + smooth(300, 700, r) * (10 + 7 * Math.sin(x * 0.011 - 0.6) + 5 * Math.sin(z * 0.017 + 1.1));
}
const restY = (x, z) => H0 - SAG * (1 - (x / NX) ** 2) * (1 - (z / NZ) ** 2);

const stage = document.getElementById('heroStage');
if (stage) {
  try { init(stage); } catch (err) { console.warn('3D-сцена недоступна:', err); }
}

function init(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 1.75));
  renderer.setClearColor(C.skyTop, 1);

  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'hero__canvas';
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(C.horizon, 0.0022);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.5, 2600);

  const uTime = { value: 0 };
  const uSweep = { value: 0 };
  const uReveal = { value: 0 };
  const uHover = { value: new THREE.Vector3(0, -999, 0) };
  const uHoverOn = { value: 0 };

  /* ---------------- свет ---------------- */
  scene.add(new THREE.HemisphereLight(0x6a5a4e, 0x060504, 0.5));
  const moon = new THREE.DirectionalLight(0xa8b6cc, 0.5);
  moon.position.set(-200, 260, 220);
  scene.add(moon);
  const rim = new THREE.DirectionalLight(0xff7a30, 1.2);
  rim.position.set(60, 70, -400);
  scene.add(rim);
  // тёплый свет площадки под сеткой: объект «живой», его есть что защищать
  const padLight = new THREE.PointLight(0xffa060, 900, 90, 1.5);
  padLight.position.set(0, 9, 4);
  scene.add(padLight);
  const flash = new THREE.PointLight(0xff7a2e, 0, 70, 1.8);
  scene.add(flash);

  /* ---------------- небо ---------------- */
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(2000, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(C.skyTop) },
        uMid: { value: new THREE.Color(C.skyMid) },
        uHor: { value: new THREE.Color(C.horizon) },
        uGlow: { value: new THREE.Color(C.glow) },
        uGlowDir: { value: new THREE.Vector2(0.25, -1).normalize() }
      },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uMid, uHor, uGlow;
        uniform vec2 uGlowDir;
        varying vec3 vDir;
        void main() {
          float h = vDir.y;
          vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.08, h));
          col = mix(col, uTop, smoothstep(0.06, 0.32, h));
          float toward = max(dot(normalize(vDir.xz), uGlowDir), 0.0);
          float band = exp(-max(h, 0.0) * 22.0) * (0.12 + 0.88 * pow(toward, 3.0));
          col += uGlow * band * 0.34;
          if (h < 0.0) col = uHor;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`
    })
  );
  sky.renderOrder = -2;
  scene.add(sky);

  /* ---------------- звёзды ---------------- */
  let starsMat;
  {
    const N = 900;
    const pos = new Float32Array(N * 3);
    const ph = new Float32Array(N);
    const sz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * Math.PI * 2;
      const cy = 0.1 + Math.pow(Math.random(), 0.8) * 0.9;
      const sy = Math.sqrt(1 - cy * cy);
      pos[i * 3] = 1800 * sy * Math.cos(u);
      pos[i * 3 + 1] = 1800 * cy;
      pos[i * 3 + 2] = 1800 * sy * Math.sin(u);
      ph[i] = Math.random() * 6.283;
      sz[i] = Math.random() < 0.05 ? 2.4 + Math.random() * 1.2 : 0.9 + Math.random() * 1.2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    starsMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime, uPx: { value: 1 } },
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime, uPx;
        varying float vA;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          float h = normalize(position).y;
          vA = (0.55 + 0.45 * sin(uTime * (0.6 + fract(aPhase) * 1.4) + aPhase)) * smoothstep(0.08, 0.35, h);
          gl_PointSize = aSize * uPx;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
          gl_FragColor = vec4(vec3(1.0, 0.93, 0.86), a * vA * 0.7);
          #include <colorspace_fragment>
        }`
    });
    const stars = new THREE.Points(g, starsMat);
    stars.renderOrder = -1;
    scene.add(stars);
  }

  /* ---------------- земля: тактическая сетка и развёртка радара ---------------- */
  const groundGeo = new THREE.PlaneGeometry(3000, 3000, COARSE ? 130 : 220, COARSE ? 130 : 220);
  groundGeo.rotateX(-Math.PI / 2);
  {
    const p = groundGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, G(p.getX(i), p.getZ(i)));
    groundGeo.computeVertexNormals();
  }
  const groundMat = new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1, metalness: 0 });
  groundMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSweep = uSweep;
    sh.uniforms.uReveal = uReveal;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        uniform float uSweep, uReveal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float dist = length(vWPos - cameraPosition);
          float r = length(vWPos.xz);
          vec2 g = vWPos.xz / 20.0;
          vec2 gl = abs(fract(g - 0.5) - 0.5) / max(fwidth(g), vec2(1e-4));
          float grid = 1.0 - min(min(gl.x, gl.y), 1.0);
          totalEmissiveRadiance += vec3(0.55, 0.26, 0.1) * grid * 0.07 * (1.0 - smoothstep(60.0, 520.0, dist));
          float rr = abs(fract(r / 80.0 - 0.5) - 0.5) * 80.0;
          float ring = 1.0 - smoothstep(0.0, fwidth(r) * 1.4 + 0.25, rr);
          float inR = 1.0 - smoothstep(${(RADAR_R - 20).toFixed(1)}, ${RADAR_R.toFixed(1)}, r);
          totalEmissiveRadiance += vec3(1.0, 0.42, 0.12) * ring * inR * 0.16 * uReveal * (1.0 - smoothstep(80.0, 700.0, dist));
          float ang = atan(vWPos.z, vWPos.x);
          float diff = mod(uSweep - ang, 6.2831853);
          float beam = (exp(-diff * 4.0) * smoothstep(0.0, 0.03, diff) + exp(-(6.2831853 - diff) * 40.0)) * inR * smoothstep(8.0, 40.0, r);
          totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * beam * 0.06 * uReveal;
        }`);
  };
  scene.add(new THREE.Mesh(groundGeo, groundMat));

  /* ---------------- объект под сеткой ---------------- */
  const tankMat = new THREE.MeshStandardMaterial({ color: C.steel, roughness: 0.5, metalness: 0.62 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x24211e, roughness: 0.7, metalness: 0.4 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2c2825, roughness: 0.6, metalness: 0.5 });
  [[-20, -9, 11, 15], [14, -12, 9.5, 13.5], [-2, 14, 7.5, 11], [27, 14, 6.5, 10], [-34, 16, 5.5, 8.5], [34, -14, 5, 8]].forEach(([x, z, r, h]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), tankMat);
    wall.position.y = h / 2;
    g.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.01, r * 0.16, 48), roofMat);
    roof.position.y = h + r * 0.08;
    g.add(roof);
    for (let k = 1; k < 5; k++) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.002, 0.06, 4, 64), bandMat);
      band.rotation.x = Math.PI / 2;
      band.position.y = (h * k) / 5;
      g.add(band);
    }
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.8, r + 1.1, 0.5, 48), bandMat);
    base.position.y = 0.25;
    g.add(base);
    const rail = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, 0.04, 4, 64), bandMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = h + 1.1;
    g.add(rail);
    scene.add(g);
  });
  {
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a443e, roughness: 0.5, metalness: 0.6 });
    const pipe = (a, b, y) => {
      const d = new THREE.Vector3().subVectors(b, a);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, d.length(), 10), pipeMat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.position.y = y;
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      scene.add(m);
    };
    pipe(new THREE.Vector3(-34, 0, 3), new THREE.Vector3(34, 0, 3), 1.2);
    pipe(new THREE.Vector3(-34, 0, 4.2), new THREE.Vector3(34, 0, 4.2), 0.8);
    pipe(new THREE.Vector3(5, 0, -30), new THREE.Vector3(5, 0, 3), 1.0);
    // насосная: корпус со светящимися окнами
    const hall = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 7), new THREE.MeshStandardMaterial({ color: 0x1d1a17, roughness: 0.9 }));
    hall.position.set(-24, 3, -26);
    scene.add(hall);
  }

  /* ---------------- светящиеся точки: общий шейдер ---------------- */
  function glowPoints(positions, color, size, steady) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
    const n = positions.length / 3;
    const ph = new Float32Array(n);
    for (let i = 0; i < n; i++) ph[i] = Math.random() * 6.283;
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 400 }, uSize: { value: size }, uTime },
      vertexShader: `
        attribute float aPhase;
        uniform float uScale, uSize, uTime;
        varying float vA;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vA = ${steady ? '0.6 + 0.25 * sin(uTime * 0.7 + aPhase)' : 'step(0.72, fract(uTime * 0.55 + aPhase / 6.283))'};
          gl_PointSize = clamp(uSize * uScale / -mv.z, 2.0, 22.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.2, 0.0, d);
          float halo = smoothstep(0.5, 0.0, d) * 0.5;
          gl_FragColor = vec4(uColor * (1.0 + core), (core + halo) * vA);
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    scene.add(pts);
    return mat;
  }
  // окна насосной и фонари площадки
  const lamps = [];
  for (let k = 0; k < 6; k++) lamps.push(-30 + k * 2.2, 3.4, -22.4);
  [[-40, 0], [-12, -28], [20, -2], [40, 22], [-18, 26], [8, 28], [42, -26]].forEach(([x, z]) => lamps.push(x, 6, z));
  const lampMat = glowPoints(lamps, 0xffb070, 1.8, true);

  /* ---------------- мачты, оттяжки, авиаогни ---------------- */
  const mastMat = new THREE.MeshStandardMaterial({ color: C.mast, roughness: 0.45, metalness: 0.7 });
  const MASTS = [[-NX, -NZ], [0, -NZ], [NX, -NZ], [NX, 0], [NX, NZ], [0, NZ], [-NX, NZ], [-NX, 0]];
  const mastGeo = new THREE.CylinderGeometry(0.24, 0.36, H0 + 1.6, 10);
  mastGeo.translate(0, (H0 + 1.6) / 2, 0);
  const guyPts = [];
  const beacons = [];
  MASTS.forEach(([x, z]) => {
    const m = new THREE.Mesh(mastGeo, mastMat);
    m.position.set(x, 0, z);
    scene.add(m);
    const top = new THREE.Vector3(x, H0, z);
    const out = new THREE.Vector2(x, z).normalize();
    const side = new THREE.Vector2(-out.y, out.x);
    [-0.5, 0.5].forEach((s) => {
      const dir = out.clone().add(side.clone().multiplyScalar(s)).normalize();
      guyPts.push(top, new THREE.Vector3(x + dir.x * 16, 0, z + dir.y * 16));
    });
    beacons.push(x, H0 + 1.8, z);
  });
  scene.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(guyPts),
    new THREE.LineBasicMaterial({ color: 0x6a6159, transparent: true, opacity: 0.55 })
  ));
  const beaconMat = glowPoints(beacons, 0xff2a1a, 3.2, false);

  /* ==================================================================
     ПОЛОТНО: узлы и связи, интегрирование Верле
     ================================================================== */
  const N = GX * GZ;
  const P = new Float32Array(N * 3);      // положения
  const Q = new Float32Array(N * 3);      // положения на прошлом шаге
  const pin = new Uint8Array(N);
  const heat = new Float32Array(N);       // накопленный разогрев от ударов
  const uvs = new Float32Array(N * 2);
  const at = (i, j) => j * GX + i;
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      const k = at(i, j);
      const x = -NX + (2 * NX * i) / (GX - 1);
      const z = -NZ + (2 * NZ * j) / (GZ - 1);
      P[k * 3] = Q[k * 3] = x;
      P[k * 3 + 1] = Q[k * 3 + 1] = restY(x, z);
      P[k * 3 + 2] = Q[k * 3 + 2] = z;
      pin[k] = i === 0 || j === 0 || i === GX - 1 || j === GZ - 1 ? 1 : 0;
      uvs[k * 2] = i / (GX - 1);
      uvs[k * 2 + 1] = j / (GZ - 1);
    }
  }
  // связи по сетке и по диагоналям — полотно держит форму и не «течёт»
  const CA = [];
  const CB = [];
  const add = (a, b) => { CA.push(a); CB.push(b); };
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      if (i < GX - 1) add(at(i, j), at(i + 1, j));
      if (j < GZ - 1) add(at(i, j), at(i, j + 1));
      if (i < GX - 1 && j < GZ - 1) { add(at(i, j), at(i + 1, j + 1)); add(at(i + 1, j), at(i, j + 1)); }
    }
  }
  const CN = CA.length;
  const ca = Int32Array.from(CA);
  const cb = Int32Array.from(CB);
  const rest = new Float32Array(CN);
  for (let c = 0; c < CN; c++) {
    const a = ca[c] * 3;
    const b = cb[c] * 3;
    // с небольшим запасом: сетка поддаётся удару, но дальше не тянется
    rest[c] = 1.006 * Math.hypot(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
  }
  const REST0 = Float32Array.from(P);   // форма покоя для «пружины» к натяжению

  const netIdx = [];
  for (let j = 0; j < GZ - 1; j++) {
    for (let i = 0; i < GX - 1; i++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1);
      netIdx.push(a, c, b, b, c, d);
    }
  }
  const roofGeo = new THREE.BufferGeometry();
  const roofPosAttr = new THREE.BufferAttribute(P, 3);
  roofPosAttr.setUsage(THREE.DynamicDrawUsage);
  roofGeo.setAttribute('position', roofPosAttr);
  roofGeo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const heatShown = new Float32Array(N);
  const heatAttr = new THREE.BufferAttribute(heatShown, 1);
  heatAttr.setUsage(THREE.DynamicDrawUsage);
  roofGeo.setAttribute('aHeat', heatAttr);
  roofGeo.setIndex(netIdx);
  roofGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, H0, 0), Math.hypot(NX, NZ) + 10);

  function netMaterial(cells, fadeBottom) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: {
        uTime, uSweep, uReveal, uHover, uHoverOn,
        uCells: { value: cells },
        uFade: { value: fadeBottom ? 1 : 0 },
        uSteel: { value: new THREE.Color(C.mesh) },
        uHot: { value: new THREE.Color(C.hot) },
        uFog: { value: new THREE.Color(C.horizon) }
      },
      vertexShader: `
        attribute float aHeat;
        varying vec2 vUv;
        varying float vHeat;
        varying vec3 vW;
        varying float vDist;
        void main() {
          vUv = uv;
          vHeat = aHeat;
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          vec4 mv = viewMatrix * w;
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uTime, uSweep, uReveal, uFade, uHoverOn;
        uniform vec2 uCells;
        uniform vec3 uSteel, uHot, uFog, uHover;
        varying vec2 vUv;
        varying float vHeat;
        varying vec3 vW;
        varying float vDist;
        float hexEdge(vec2 p) {
          vec2 r = vec2(1.0, 1.7320508);
          vec2 h = r * 0.5;
          vec2 a = mod(p, r) - h;
          vec2 b = mod(p - h, r) - h;
          vec2 gv = dot(a, a) < dot(b, b) ? a : b;
          gv = abs(gv);
          return 0.5 - max(dot(gv, normalize(r)), gv.x);
        }
        void main() {
          float e = hexEdge(vUv * uCells);
          float w = fwidth(e) * 1.2 + 0.04;
          float line = 1.0 - smoothstep(0.0, w, e);
          float rev = smoothstep(vUv.x - 0.15, vUv.x, uReveal * 1.15);
          float ang = atan(vW.z, vW.x);
          float beam = exp(-mod(uSweep - ang, 6.2831853) * 5.0) * 0.45;
          // прицел: пятно и бегущее кольцо под курсором
          float hd = length(vW.xz - uHover.xz);
          float hov = uHoverOn * (exp(-hd * hd / 26.0) + 0.7 * exp(-pow(hd - mod(uTime * 9.0, 14.0), 2.0) * 0.6) * (1.0 - smoothstep(4.0, 14.0, hd)));
          float heat = clamp(vHeat, 0.0, 1.8);
          float k = clamp(beam + heat + hov, 0.0, 1.0);
          vec3 col = mix(uSteel, uHot, k) * (1.0 + heat * 1.6 + hov * 0.8);
          float alpha = line * (0.36 + beam * 0.45 + heat * 0.8 + hov * 0.6) + 0.03 + heat * 0.07 + hov * 0.05;
          col = mix(col, uHot, (1.0 - line) * (0.2 + heat + hov));
          if (uFade > 0.5) alpha *= smoothstep(-0.05, 0.75, vUv.y);
          col = mix(col, uFog, (1.0 - exp(-vDist * vDist * 0.0000055)) * 0.8);
          gl_FragColor = vec4(col, alpha * rev);
          #include <colorspace_fragment>
        }`
    });
  }
  const roof = new THREE.Mesh(roofGeo, netMaterial(new THREE.Vector2(NX * 2 / CELL, NZ * 2 / (CELL * 1.732)), false));
  roof.renderOrder = 5;
  scene.add(roof);

  // экраны сзади и по бокам — от контура до земли
  function curtain(len, x, z, rotY) {
    const g = new THREE.PlaneGeometry(len, H0, Math.round(len / 4), 8);
    g.translate(0, H0 / 2, 0);
    g.setAttribute('aHeat', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count), 1));
    const m = new THREE.Mesh(g, netMaterial(new THREE.Vector2(len / CELL, H0 / (CELL * 1.732)), true));
    m.position.set(x, 0, z);
    m.rotation.y = rotY;
    m.renderOrder = 4;
    scene.add(m);
  }
  curtain(NX * 2, 0, -NZ, 0);
  curtain(NZ * 2, -NX, 0, Math.PI / 2);
  curtain(NZ * 2, NX, 0, -Math.PI / 2);

  /* ---------------- тросы: контур и несущие, идут за полотном ---------------- */
  const cableMat = new THREE.LineBasicMaterial({ color: C.hot, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const cables = [];
  function cable(ids) {
    const g = new THREE.BufferGeometry();
    const a = new THREE.BufferAttribute(new Float32Array(ids.length * 3), 3);
    a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', a);
    const l = new THREE.Line(g, cableMat);
    l.frustumCulled = false;
    l.renderOrder = 6;
    scene.add(l);
    cables.push({ g, ids });
  }
  const row = (j) => Array.from({ length: GX }, (_, i) => at(i, j));
  const col = (i) => Array.from({ length: GZ }, (_, j) => at(i, j));
  cable(row(0)); cable(row(GZ - 1)); cable(col(0)); cable(col(GX - 1));
  cable(row((GZ - 1) / 2 | 0)); cable(col((GX - 1) / 2 | 0));
  cable(row(Math.round((GZ - 1) / 4))); cable(row(Math.round((GZ - 1) * 3 / 4)));

  /* ---------------- физика полотна ---------------- */
  const hover = { on: false, x: 0, z: 0, k: 0 };
  function simulate(dt) {
    const dt2 = dt * dt;
    const damp = 0.97;
    for (let k = 0; k < N; k++) {
      if (pin[k]) continue;
      const o = k * 3;
      const vx = (P[o] - Q[o]) * damp;
      const vy = (P[o + 1] - Q[o + 1]) * damp;
      const vz = (P[o + 2] - Q[o + 2]) * damp;
      Q[o] = P[o]; Q[o + 1] = P[o + 1]; Q[o + 2] = P[o + 2];
      // лёгкая пружина к форме покоя: натянутое полотно всегда возвращается
      let ay = (REST0[o + 1] - P[o + 1]) * 9;
      let ax = (REST0[o] - P[o]) * 4;
      let az = (REST0[o + 2] - P[o + 2]) * 4;
      if (hover.k > 0.01) {
        const d2 = (P[o] - hover.x) ** 2 + (P[o + 2] - hover.z) ** 2;
        if (d2 < 60) ay -= 26 * hover.k * Math.exp(-d2 / 14);
      }
      P[o] += vx + ax * dt2;
      P[o + 1] += vy + ay * dt2;
      P[o + 2] += vz + az * dt2;
    }
    for (let it = 0; it < 5; it++) {
      for (let c = 0; c < CN; c++) {
        const a = ca[c], b = cb[c];
        const oa = a * 3, ob = b * 3;
        const dx = P[ob] - P[oa], dy = P[ob + 1] - P[oa + 1], dz = P[ob + 2] - P[oa + 2];
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        // связь только тянет: на сжатие сетка просто собирается складкой
        if (len <= rest[c]) continue;
        const s = (len - rest[c]) / len * 0.5;
        const wa = pin[a] ? 0 : 1, wb = pin[b] ? 0 : 1;
        const f = s * 2 / ((wa + wb) || 1);
        if (wa) { P[oa] += dx * f; P[oa + 1] += dy * f; P[oa + 2] += dz * f; }
        if (wb) { P[ob] -= dx * f; P[ob + 1] -= dy * f; P[ob + 2] -= dz * f; }
      }
    }
  }
  function nearest(x, z) {
    const i = clamp(Math.round((x + NX) / (2 * NX) * (GX - 1)), 1, GX - 2);
    const j = clamp(Math.round((z + NZ) / (2 * NZ) * (GZ - 1)), 1, GZ - 2);
    return at(i, j);
  }
  // удар: узлам вокруг точки даём скорость по направлению полёта
  const waves = [];
  function strike(x, z, dir, speed, t) {
    const R2 = 42;
    for (let k = 0; k < N; k++) {
      if (pin[k]) continue;
      const o = k * 3;
      const d2 = (P[o] - x) ** 2 + (P[o + 2] - z) ** 2;
      if (d2 > R2 * 4) continue;
      const w = Math.exp(-d2 / R2);
      const v = speed * w / 60;
      Q[o] = P[o] - dir.x * v;
      Q[o + 1] = P[o + 1] - dir.y * v;
      Q[o + 2] = P[o + 2] - dir.z * v;
      heat[k] = Math.min(2, heat[k] + 1.3 * w);
    }
    waves.push({ x, z, t });
    if (waves.length > 6) waves.shift();
  }
  function stepHeat(dt, t) {
    const decay = Math.exp(-dt * 1.5);
    for (let k = 0; k < N; k++) {
      heat[k] *= decay;
      let h = heat[k];
      for (const wv of waves) {
        const a = t - wv.t;
        if (a < 0 || a > 2.5) continue;
        const d = Math.hypot(P[k * 3] - wv.x, P[k * 3 + 2] - wv.z);
        h += 0.6 * Math.exp(-((d - a * 30) ** 2) / 14) * Math.exp(-a * 1.3);
      }
      heatShown[k] = h;
    }
    heatAttr.needsUpdate = true;
  }

  /* ---------------- дальний завод, факелы ---------------- */
  {
    const silMat = new THREE.MeshStandardMaterial({ color: 0x100d0b, roughness: 1 });
    const windows = [];
    for (let i = 0; i < 24; i++) {
      const x = rnd(-520, 520);
      const z = rnd(-620, -300);
      const w = rnd(12, 38);
      const h = rnd(6, 26);
      const d = rnd(12, 30);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), silMat);
      const y0 = G(x, z);
      b.position.set(x, y0 + h / 2 - 1, z);
      scene.add(b);
      if (Math.random() < 0.6) {
        const n = 2 + Math.floor(Math.random() * 5);
        for (let k = 0; k < n; k++) windows.push(x + rnd(-w / 2, w / 2), y0 + rnd(2, h - 1), z + d / 2 + 0.2);
      }
      if (Math.random() < 0.3) {
        const ch = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, h * 2.2, 10), silMat);
        ch.position.set(x + w * 0.3, y0 + h * 1.1, z);
        scene.add(ch);
        windows.push(x + w * 0.3, y0 + h * 2.2 + 1, z);
      }
    }
    glowPoints(windows, 0xffa050, 1.6, true);
  }
  const flares = [];
  [[90, -170, 46], [-230, -360, 60], [320, -420, 52]].forEach(([x, z, h]) => {
    const y0 = G(x, z);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.2, h, 10), new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.8 }));
    st.position.set(x, y0 + h / 2, z);
    scene.add(st);
    flares.push(new THREE.Vector3(x, y0 + h + 2.5, z));
  });
  const flareGeo = new THREE.BufferGeometry().setFromPoints(flares);
  const flareMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uScale: { value: 400 } },
    vertexShader: `
      uniform float uTime, uScale;
      varying float vF;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vF = 0.8 + 0.2 * sin(uTime * 9.0 + position.x) * sin(uTime * 5.3 + position.z);
        gl_PointSize = clamp(9.0 * uScale / -mv.z * vF, 3.0, 60.0);
      }`,
    fragmentShader: `
      varying float vF;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        c.y *= 0.75;
        float d = length(c);
        float core = smoothstep(0.16, 0.0, d);
        float halo = smoothstep(0.5, 0.0, d);
        vec3 col = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.85, 0.55), core);
        gl_FragColor = vec4(col, (core + halo * 0.55) * vF);
        #include <colorspace_fragment>
      }`
  });
  const flarePts = new THREE.Points(flareGeo, flareMat);
  flarePts.frustumCulled = false;
  scene.add(flarePts);
  const flareLight = new THREE.PointLight(0xff6a20, 450, 220, 1.6);
  flareLight.position.copy(flares[0]);
  scene.add(flareLight);

  /* ---------------- искры ---------------- */
  const SPARKS = 700;
  const spPos = new Float32Array(SPARKS * 3);
  const spVel = new Float32Array(SPARKS * 3);
  const spLife = new Float32Array(SPARKS);
  const spMax = new Float32Array(SPARKS);
  const spGeo = new THREE.BufferGeometry();
  spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  spGeo.setAttribute('aLife', new THREE.BufferAttribute(spLife, 1));
  const spMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: { value: 400 } },
    vertexShader: `
      attribute float aLife;
      uniform float uScale;
      varying float vL;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        vL = aLife;
        gl_PointSize = aLife > 0.0 ? clamp(1.1 * uScale / -mv.z * (0.5 + aLife), 1.5, 10.0) : 0.0;
      }`,
    fragmentShader: `
      varying float vL;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        vec3 col = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.9, 0.7), clamp(vL * 1.2, 0.0, 1.0));
        gl_FragColor = vec4(col, a * clamp(vL * 1.6, 0.0, 1.0));
        #include <colorspace_fragment>
      }`
  });
  const sparks = new THREE.Points(spGeo, spMat);
  sparks.frustumCulled = false;
  sparks.renderOrder = 8;
  scene.add(sparks);
  let spNext = 0;
  function burst(p, n, power) {
    for (let k = 0; k < n; k++) {
      const i = spNext;
      spNext = (spNext + 1) % SPARKS;
      spPos[i * 3] = p.x; spPos[i * 3 + 1] = p.y; spPos[i * 3 + 2] = p.z;
      const a = Math.random() * Math.PI * 2;
      const up = rnd(0.2, 1);
      const s = rnd(6, 22) * power;
      spVel[i * 3] = Math.cos(a) * s * (1 - up * 0.5);
      spVel[i * 3 + 1] = up * s * 0.9;
      spVel[i * 3 + 2] = Math.sin(a) * s * (1 - up * 0.5);
      spMax[i] = rnd(0.5, 1.4);
      spLife[i] = 1;
    }
  }
  function stepSparks(dt) {
    for (let i = 0; i < SPARKS; i++) {
      if (spLife[i] <= 0) continue;
      spVel[i * 3 + 1] -= 22 * dt;
      spVel[i * 3] *= 0.985; spVel[i * 3 + 2] *= 0.985;
      spPos[i * 3] += spVel[i * 3] * dt;
      spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt;
      spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
      spLife[i] -= dt / spMax[i];
    }
    spGeo.attributes.position.needsUpdate = true;
    spGeo.attributes.aLife.needsUpdate = true;
  }

  // медленные угли в воздухе
  const EMB = COARSE ? 140 : 260;
  const emPos = new Float32Array(EMB * 3);
  const emSeed = [];
  for (let i = 0; i < EMB; i++) emSeed.push({ x: rnd(-160, 160), z: rnd(-180, 120), y: rnd(0, 70), s: rnd(0.6, 2.2), ph: rnd(0, 6.28) });
  const emGeo = new THREE.BufferGeometry();
  emGeo.setAttribute('position', new THREE.BufferAttribute(emPos, 3));
  const embers = new THREE.Points(emGeo, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uScale: spMat.uniforms.uScale },
    vertexShader: `
      uniform float uScale;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(0.5 * uScale / -mv.z, 1.0, 4.0);
      }`,
    fragmentShader: `
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5));
        gl_FragColor = vec4(1.0, 0.5, 0.2, a * 0.6);
        #include <colorspace_fragment>
      }`
  }));
  embers.frustumCulled = false;
  scene.add(embers);

  /* ---------------- беспилотники ---------------- */
  const droneBody = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 0.5, metalness: 0.5 });
  const rotorMat = new THREE.MeshBasicMaterial({ color: 0x8c8580, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const navTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,220,200,1)');
    gr.addColorStop(0.18, 'rgba(255,70,40,.9)');
    gr.addColorStop(1, 'rgba(255,40,20,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
  })();
  const armGeo = new THREE.BoxGeometry(2.6, 0.1, 0.14);
  const bodyGeo = new THREE.BoxGeometry(0.9, 0.3, 1.3);
  const rotorGeo = new THREE.CircleGeometry(0.62, 20);
  rotorGeo.rotateX(-Math.PI / 2);
  function buildDrone() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(bodyGeo, droneBody));
    [45, -45].forEach((a) => {
      const arm = new THREE.Mesh(armGeo, droneBody);
      arm.rotation.y = a * DEG;
      g.add(arm);
    });
    const rotors = [];
    [[0.92, 0.92], [-0.92, 0.92], [0.92, -0.92], [-0.92, -0.92]].forEach(([x, z]) => {
      const r = new THREE.Mesh(rotorGeo, rotorMat);
      r.position.set(x, 0.12, z);
      g.add(r);
      rotors.push(r);
    });
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshBasicMaterial({ color: C.threat }));
    nav.position.set(0, -0.18, 0.66);
    g.add(nav);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: navTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    halo.position.copy(nav.position);
    g.add(halo);
    g.scale.setScalar(1.7);
    g.userData = { rotors, nav, halo };
    return g;
  }

  const TRAIL = 48;
  const trailMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(0xff3a22) } },
    vertexShader: `
      attribute float aK;
      varying float vK;
      void main() {
        vK = aK;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vK;
      void main() {
        gl_FragColor = vec4(uColor, vK * vK * 0.75);
        #include <colorspace_fragment>
      }`
  });

  const drones = [];
  let stopped = 0;
  let nextSpawn = 1.4;

  function bezier(p0, p1, p2, p3, u, out) {
    const a = 1 - u;
    return out.set(0, 0, 0)
      .addScaledVector(p0, a * a * a)
      .addScaledVector(p1, 3 * a * a * u)
      .addScaledVector(p2, 3 * a * u * u)
      .addScaledVector(p3, u * u * u);
  }

  function launch(p0, p1, p2, p3, dur, t, mine) {
    const mesh = buildDrone();
    scene.add(mesh);
    const tg = new THREE.BufferGeometry();
    const tp = new Float32Array(TRAIL * 3);
    const tk = new Float32Array(TRAIL);
    for (let i = 0; i < TRAIL; i++) { p0.toArray(tp, i * 3); tk[i] = i / (TRAIL - 1); }
    tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
    tg.setAttribute('aK', new THREE.BufferAttribute(tk, 1));
    const trail = new THREE.Line(tg, trailMat);
    trail.frustumCulled = false;
    scene.add(trail);
    drones.push({ mesh, trail, tp, p0, p1, p2, p3, t0: t, dur, mine, state: 'fly', hitT: 0, node: 0, pos: p0.clone(), prev: p0.clone() });
  }

  // сами по себе: заходят с горизонта и пикируют на площадку
  function spawnAmbient(t) {
    const az = rnd(-150, 40) * DEG;
    const R = rnd(280, 360);
    const h = rnd(38, 70);
    const tx = rnd(-NX + 9, NX - 9);
    const tz = rnd(-NZ + 7, NZ - 7);
    const p0 = new THREE.Vector3(Math.cos(az) * R, h, Math.sin(az) * R);
    const dir = new THREE.Vector3(tx, 0, tz).sub(p0).setY(0).normalize();
    const p3 = new THREE.Vector3(tx, H0, tz);
    const p2 = p3.clone().addScaledVector(dir, -rnd(22, 34)).setY(H0 + rnd(20, 30));
    const p1 = p0.clone().lerp(p2, 0.45).setY(h + rnd(-6, 10));
    launch(p0, p1, p2, p3, rnd(6.5, 8.5), t, false);
  }

  // выстрел зрителя: из-за плеча камеры в точку прицела
  const camRight = new THREE.Vector3();
  function spawnShot(target, t) {
    camRight.setFromMatrixColumn(camera.matrixWorld, 0);
    const p0 = camera.position.clone().addScaledVector(camRight, rnd(-14, 14)).add(new THREE.Vector3(0, rnd(6, 14), 0));
    const p3 = target.clone();
    const dist = p0.distanceTo(p3);
    const dir = p3.clone().sub(p0).normalize();
    const p1 = p0.clone().addScaledVector(dir, dist * 0.35).add(new THREE.Vector3(0, 10, 0));
    const p2 = p3.clone().add(new THREE.Vector3(0, 16, 0)).addScaledVector(dir.clone().setY(0).normalize(), -8);
    launch(p0, p1, p2, p3, clamp(dist / 120, 0.9, 1.8), t, true);
  }

  /* ---------------- метки «Остановлено сеткой» поверх сцены ---------------- */
  const tags = [];
  function tag(p, t, mine) {
    const el = document.createElement('span');
    el.className = 'hit-tag' + (mine ? ' hit-tag--mine' : '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<b>Остановлено сеткой</b><i>' + (mine ? 'ваш БПЛА · ' : '') + 'x ' + p.x.toFixed(0) + ' · z ' + p.z.toFixed(0) + '</i>';
    stage.appendChild(el);
    tags.push({ el, p: p.clone(), t });
  }
  const proj = new THREE.Vector3();
  function placeTags(t) {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    for (let i = tags.length - 1; i >= 0; i--) {
      const g = tags[i];
      const a = t - g.t;
      if (a > 2.4) { g.el.remove(); tags.splice(i, 1); continue; }
      proj.copy(g.p).setY(g.p.y + 3 + a * 3).project(camera);
      g.el.style.transform = 'translate(' + ((proj.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - proj.y) / 2 * h).toFixed(1) + 'px) translate(-50%,-100%)';
      g.el.style.opacity = String(a < 0.15 ? a / 0.15 : 1 - smooth(1.6, 2.4, a));
    }
  }

  /* ---------------- шаг беспилотников ---------------- */
  let slow = 1;       // замедление времени после удара зрителя
  let shake = 0;
  const tmpV = new THREE.Vector3();
  const lookV = new THREE.Vector3();
  function stepDrones(t, dt) {
    if (!REDUCED && t >= nextSpawn && drones.filter((d) => d.state === 'fly' && !d.mine).length < 3) {
      spawnAmbient(t);
      nextSpawn = t + rnd(2.4, 4.2);
    }
    for (let i = drones.length - 1; i >= 0; i--) {
      const d = drones[i];
      const m = d.mesh;
      const ud = m.userData;
      if (d.state === 'fly') {
        const u = clamp((t - d.t0) / d.dur, 0, 1);
        const k = d.mine ? u * u * (1.6 - 0.6 * u) : (u < 0.6 ? u * 0.82 / 0.6 : 0.82 + 0.18 * ((u - 0.6) / 0.4) ** 1.6);
        d.prev.copy(d.pos);
        bezier(d.p0, d.p1, d.p2, d.p3, k, d.pos);
        if (u >= 1) {
          // удар: полотно продавливается туда, куда летел аппарат
          d.node = nearest(d.p3.x, d.p3.z);
          const dir = lookV.subVectors(d.p3, d.prev).normalize();
          strike(d.p3.x, d.p3.z, dir, d.mine ? 360 : 260, t);
          d.state = 'hit';
          d.hitT = t;
          const o = d.node * 3;
          tmpV.set(P[o], P[o + 1], P[o + 2]);
          burst(tmpV, d.mine ? 160 : 90, d.mine ? 1.3 : 1);
          flash.position.copy(tmpV).setY(tmpV.y + 2);
          flash.userData.t = t;
          tag(tmpV, t, d.mine);
          marks.push({ x: tmpV.x, z: tmpV.z, t });
          stopped++;
          if (d.mine) { slow = 0.28; shake = 1; }
        }
        m.position.copy(d.pos);
        lookV.subVectors(d.pos, d.prev);
        if (lookV.lengthSq() > 1e-6) m.lookAt(tmpV.copy(d.pos).add(lookV.normalize()));
        ud.rotors.forEach((r, j) => { r.rotation.y += dt * (40 + j * 3); });
        const on = Math.sin(t * 12 + d.t0) > -0.2;
        ud.nav.material.color.setHex(on ? C.threat : 0x300806);
        ud.halo.scale.setScalar((on ? 1 : 0.35) * clamp(d.pos.distanceTo(camera.position) / 40, 0.5, 7));
      } else {
        // аппарат увяз в полотне и качается вместе с ним
        const a = t - d.hitT;
        const o = d.node * 3;
        m.position.set(P[o], P[o + 1] + 0.35, P[o + 2]);
        m.rotation.x += (0.6 - m.rotation.x) * 0.08;
        ud.nav.material.color.setHex(0x1a0503);
        ud.halo.visible = false;
        m.scale.setScalar(Math.max(0.001, 1.7 * (1 - smooth(2.4, 3.6, a))));
        if (a > 3.7) {
          scene.remove(m);
          scene.remove(d.trail);
          d.trail.geometry.dispose();
          drones.splice(i, 1);
          continue;
        }
      }
      const tp = d.tp;
      if (d.state === 'fly') {
        tp.copyWithin(0, 3);
        d.pos.toArray(tp, (TRAIL - 1) * 3);
      } else {
        for (let j = 0; j < TRAIL - 1; j++) {
          for (let c = 0; c < 3; c++) tp[j * 3 + c] += (tp[j * 3 + 3 + c] - tp[j * 3 + c]) * 0.2;
        }
      }
      d.trail.geometry.attributes.position.needsUpdate = true;
    }
  }

  function stepCables() {
    const rev = clamp(uReveal.value * 1.2, 0, 1);
    cables.forEach((c) => {
      const a = c.g.attributes.position.array;
      c.ids.forEach((k, n) => {
        a[n * 3] = P[k * 3];
        a[n * 3 + 1] = P[k * 3 + 1] + 0.05;
        a[n * 3 + 2] = P[k * 3 + 2];
      });
      c.g.setDrawRange(0, Math.round(c.ids.length * rev));
      c.g.attributes.position.needsUpdate = true;
    });
  }

  /* ---------------- радар в углу героя ---------------- */
  const radarBox = document.getElementById('radar');
  const radarCv = document.getElementById('radarCanvas');
  const rTracks = document.getElementById('rTracks');
  const rStopped = document.getElementById('rStopped');
  const rc = radarCv ? radarCv.getContext('2d') : null;
  const marks = [];
  let lastStopped = -1;
  let lastTracks = -1;

  function drawRadar(t) {
    const tracks = drones.filter((d) => d.state === 'fly').length;
    if (rTracks && tracks !== lastTracks) { rTracks.textContent = String(tracks); lastTracks = tracks; }
    if (rStopped && stopped !== lastStopped) {
      rStopped.textContent = String(stopped);
      if (lastStopped >= 0) { rStopped.classList.remove('is-bump'); void rStopped.offsetWidth; rStopped.classList.add('is-bump'); }
      lastStopped = stopped;
    }
    if (!rc) return;
    const px = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(radarCv.clientWidth * px);
    if (!W) return;
    if (radarCv.width !== W) { radarCv.width = W; radarCv.height = W; }
    const c = W / 2;
    const s = (c - 2) / RADAR_R;
    rc.clearRect(0, 0, W, W);
    rc.save();
    rc.translate(c, c);
    rc.lineWidth = px;
    rc.strokeStyle = 'rgba(255,140,80,.2)';
    [80, 160, 240, 320].forEach((r) => { rc.beginPath(); rc.arc(0, 0, r * s, 0, Math.PI * 2); rc.stroke(); });
    rc.beginPath(); rc.moveTo(-c, 0); rc.lineTo(c, 0); rc.moveTo(0, -c); rc.lineTo(0, c); rc.stroke();
    const sw = uSweep.value;
    for (let k = 0; k < 28; k++) {
      const a0 = sw - k * 0.035;
      rc.fillStyle = 'rgba(255,106,26,' + (0.32 * Math.exp(-k * 0.12)).toFixed(3) + ')';
      rc.beginPath();
      rc.moveTo(0, 0);
      rc.arc(0, 0, c, a0 - 0.036, a0);
      rc.closePath();
      rc.fill();
    }
    rc.strokeStyle = 'rgba(255,170,110,.85)';
    rc.beginPath(); rc.moveTo(0, 0); rc.lineTo(Math.cos(sw) * c, Math.sin(sw) * c); rc.stroke();
    rc.strokeStyle = '#ff6a1a';
    rc.lineWidth = 1.5 * px;
    rc.shadowColor = '#ff6a1a';
    rc.shadowBlur = 6 * px;
    rc.strokeRect(-NX * s * 2.2, -NZ * s * 2.2, NX * s * 4.4, NZ * s * 4.4);
    rc.shadowBlur = 0;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      const a = 1 - (t - m.t) / 6;
      if (a <= 0) { marks.splice(i, 1); continue; }
      rc.strokeStyle = 'rgba(255,150,70,' + a.toFixed(2) + ')';
      rc.lineWidth = 1.4 * px;
      const x = m.x * s * 2.2;
      const y = m.z * s * 2.2;
      const r = 3.2 * px;
      rc.beginPath(); rc.moveTo(x - r, y - r); rc.lineTo(x + r, y + r); rc.moveTo(x + r, y - r); rc.lineTo(x - r, y + r); rc.stroke();
    }
    drones.forEach((d) => {
      if (d.state !== 'fly') return;
      const ang = Math.atan2(d.pos.z, d.pos.x);
      let diff = (sw - ang) % (Math.PI * 2);
      if (diff < 0) diff += Math.PI * 2;
      const lit = d.mine ? 1 : 0.35 + 0.65 * Math.exp(-diff * 1.1);
      const r = Math.hypot(d.pos.x, d.pos.z);
      const rr = r < 60 ? r * 2.2 : 132 + (r - 60) * (RADAR_R - 132) / (RADAR_R - 60);
      rc.fillStyle = 'rgba(255,59,48,' + lit.toFixed(2) + ')';
      rc.shadowColor = '#ff3b30';
      rc.shadowBlur = 8 * px;
      rc.beginPath(); rc.arc(Math.cos(ang) * Math.min(rr, RADAR_R) * s, Math.sin(ang) * Math.min(rr, RADAR_R) * s, 3.2 * px, 0, Math.PI * 2); rc.fill();
      rc.shadowBlur = 0;
    });
    rc.restore();
  }

  /* ---------------- камера ---------------- */
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollK = 0;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let wide = true;

  function updateCamera(t) {
    mouse.x += (mouse.tx - mouse.x) * 0.04;
    mouse.y += (mouse.ty - mouse.y) * 0.04;
    const idle = REDUCED ? 0 : Math.sin(t * 0.05) * 0.06;
    const az = (wide ? 124 : 108) * DEG + idle + mouse.x * 0.05;
    const R = (wide ? 196 : 168) + scrollK * 40;
    camPos.set(Math.cos(az) * R, 58 + scrollK * 24 - mouse.y * 5, Math.sin(az) * R);
    const left = new THREE.Vector3(-Math.sin(az), 0, Math.cos(az));
    camLook.set(0, 12 + scrollK * 6, 0).addScaledVector(left, wide ? 46 : 0);
    if (shake > 0.001) {
      camPos.x += (Math.random() - 0.5) * shake * 1.6;
      camPos.y += (Math.random() - 0.5) * shake * 1.6;
    }
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sky.position.copy(camPos);
  }

  /* ---------------- прицел и выстрел ---------------- */
  const hero = stage.closest('.hero') || stage;
  const aim = document.getElementById('aim');
  const aimLabel = document.getElementById('aimLabel');
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const aimPoint = new THREE.Vector3();
  let aimValid = false;
  let pointer = null;

  // над текстом, кнопками и радаром прицела нет
  const blocked = (el) => !!(el && el.closest && el.closest('a,button,input,.hero__copy,.radar,.hero__foot,.hdr'));

  function pick(clientX, clientY) {
    const r = stage.getBoundingClientRect();
    if (clientY > r.bottom || clientY < r.top) return false;
    ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObject(roof, false)[0];
    if (hit) { aimPoint.copy(hit.point); return true; }
    return false;
  }

  hero.addEventListener('pointermove', (e) => {
    if (!COARSE && !REDUCED) {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
    }
    // на касаниях прицел не держим: палец листает страницу, выстрел — по тапу
    pointer = e.pointerType === 'touch' || blocked(e.target) ? null : { x: e.clientX, y: e.clientY };
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { pointer = null; });

  let lastShot = -1;
  hero.addEventListener('click', (e) => {
    if (REDUCED || blocked(e.target)) return;
    if (!pick(e.clientX, e.clientY)) return;
    if (tNow - lastShot < 0.35 || drones.filter((d) => d.mine && d.state === 'fly').length >= 4) return;
    lastShot = tNow;
    spawnShot(aimPoint, tNow);
    hero.classList.add('is-played');
  });

  function updateAim() {
    aimValid = !!pointer && pick(pointer.x, pointer.y);
    hover.on = aimValid;
    if (aimValid) { hover.x = aimPoint.x; hover.z = aimPoint.z; uHover.value.copy(aimPoint); }
    hover.k += ((aimValid ? 1 : 0) - hover.k) * 0.12;
    uHoverOn.value = hover.k;
    hero.classList.toggle('is-aiming', aimValid);
    if (aim) {
      if (aimValid) {
        const r = stage.getBoundingClientRect();
        const hr = hero.getBoundingClientRect();
        aim.style.transform = 'translate(' + (pointer.x - hr.left).toFixed(1) + 'px,' + (pointer.y - hr.top).toFixed(1) + 'px)';
        if (aimLabel) aimLabel.textContent = 'x ' + aimPoint.x.toFixed(1) + ' · z ' + aimPoint.z.toFixed(1) + ' · h ' + aimPoint.y.toFixed(1) + ' м';
        void r;
      }
    }
  }

  function readScroll() {
    const r = hero.getBoundingClientRect();
    scrollK = clamp(-r.top / Math.max(1, r.height), 0, 1);
  }
  window.addEventListener('scroll', () => { readScroll(); if (REDUCED) requestRender(); }, { passive: true });

  /* ---------------- размер ---------------- */
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    wide = camera.aspect >= 1.2;
    camera.fov = camera.aspect < 0.8 ? 62 : camera.aspect < 1.2 ? 52 : 40;
    camera.updateProjectionMatrix();
    const px = renderer.getPixelRatio();
    const scale = h * px * 0.5;
    [beaconMat, lampMat, flareMat, spMat].forEach((m) => { m.uniforms.uScale.value = scale; });
    starsMat.uniforms.uPx.value = px;
    requestRender();
  }

  function stepEmbers(t) {
    for (let i = 0; i < EMB; i++) {
      const e = emSeed[i];
      emPos[i * 3] = e.x + Math.sin(t * 0.3 + e.ph) * 3;
      emPos[i * 3 + 1] = (e.y + t * e.s) % 70;
      emPos[i * 3 + 2] = e.z + Math.cos(t * 0.25 + e.ph) * 3;
    }
    emGeo.attributes.position.needsUpdate = true;
  }

  /* ---------------- цикл ---------------- */
  let visible = true;
  let raf = 0;
  let tPrevReal = -1;
  let tNow = 0;          // «игровое» время: замедляется после удара зрителя
  let tReal = 0;

  function requestRender() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    const real = now / 1000;
    // потолок шага: после паузы вкладки сцена не «перематывается» рывком
    const dtReal = tPrevReal < 0 ? 1 / 60 : Math.min(window.__heroDtMax || 0.05, real - tPrevReal);
    tPrevReal = real;
    tReal += dtReal;
    slow += (1 - slow) * Math.min(1, dtReal * 2.2);
    shake *= Math.exp(-dtReal * 7);
    const dt = dtReal * slow;
    tNow += dt;
    const t = tNow;

    uTime.value = t;
    uReveal.value = REDUCED ? 1 : smooth(0.2, 2.6, tReal);
    uSweep.value = REDUCED ? 0.6 : t * SWEEP;

    updateCamera(tReal);
    updateAim();
    stepDrones(t, dt);
    if (!REDUCED) {
      // фиксированные подшаги по 1/120 с: полотно устойчиво при любой частоте кадров
      const n = Math.max(1, Math.ceil(dt * 120));
      for (let k = 0; k < n; k++) simulate(dt / n);
    }
    roofPosAttr.needsUpdate = true;
    stepHeat(dt, t);
    stepCables();
    stepSparks(dt);
    stepEmbers(t);
    const fa = t - (flash.userData.t ?? -10);
    flash.intensity = fa >= 0 && fa < 1.2 ? 1600 * Math.exp(-fa * 5) : 0;
    flareLight.intensity = 450 + 90 * Math.sin(t * 9) * Math.sin(t * 5.3);

    renderer.render(scene, camera);
    placeTags(t);
    drawRadar(t);
    if (!stage.classList.contains('is-live')) {
      stage.classList.add('is-live');
      if (radarBox) radarBox.classList.add('is-live');
      hero.classList.add('is-3d');
    }
    if (!REDUCED && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    if (visible) { tPrevReal = -1; requestRender(); }
  }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tPrevReal = -1; requestRender(); } });

  readScroll();
  resize();
  requestRender();
}
