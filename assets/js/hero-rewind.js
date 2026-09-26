/* ==========================================================================
   Защита от БПЛА — первый экран «Взрыв наоборот».

   Экран открывается остановленным кадром: беспилотник только что ударил
   в защитную стенку из бетонных блоков, обломки, искры, пыль и огненный шар
   висят в воздухе. Прокрутка отматывает время назад: огонь стягивается
   в точку, обломки возвращаются на свои места, дрон собирается из осколков
   и улетает задом наперёд. Стенка «сваривается» по трещинам, камера
   отъезжает — и проявляется заголовок.

   Стенка заранее расколота на неровные куски: узлы решётки внутри блока
   случайно сдвинуты, поэтому соседние куски стыкуются без зазоров. Полёт
   каждого куска считает вершинный шейдер от одного числа — «сколько времени
   прошло после удара» (uK: 1 — остановленный кадр, 0 — удара ещё не было).

   Модуль подключает main.js. Режим прокрутки включается классом is-rewind
   на .hero (его ставит main.js); без него — например, при «уменьшении
   движения» — сцена сразу показывает целую стенку. Если WebGL недоступен,
   в разметке остаётся статичная картинка.
   ========================================================================== */
import * as THREE from './vendor/three.module.min.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const NARROW = window.matchMedia('(max-width: 900px)');

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const DEG = Math.PI / 180;

// детерминированный генератор: стенка раскалывается одинаково при каждой загрузке
let seed = 20240917;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + rand() * (b - a);

/* ---- Хронометраж по доле прокрутки p ---- */
const P_REWIND = 0.62;     // к этому моменту обломки на местах
const P_DRONE = 0.8;       // дрон улетел
const P_DONE = 0.84;       // проявляется заголовок
const T_FROZEN = 0.12;     // «секунд после удара» в остановленном кадре

/* ---- Стенка, м ---- */
const BW = 2.4, BH = 1.2, BD = 1.2;
const COLS = 6, ROWS = 4;
const IMPACT = new THREE.Vector3(1.3, 2.9, BD / 2);
const FIRE = IMPACT.clone().add(new THREE.Vector3(0, 0, 0.8));
const DRONE_FROM = new THREE.Vector3(9, 7.5, 26).normalize();   // откуда пришёл дрон

const C = {
  bg: 0x050404,
  fog: 0x070504,
  concrete: 0x8f8a83,
  metal: 0x2b2926,
  hot: new THREE.Color(0xff6a1a)
};

const stage = document.getElementById('heroStage');
const hero = stage && stage.closest('.hero');
if (stage && hero) {
  try { init(); } catch (err) {
    console.warn('3D-сцена недоступна:', err);
    hero.classList.remove('is-rewind');
  }
}

/* Раскол блока: решётка nx×ny×nz, внутренние узлы сдвинуты случайно.
   Узел на грани блока сдвигается только вдоль грани — наружные стороны
   остаются плоскими. Возвращает куски с гранями-четырёхугольниками. */
function fracture(out, x0, y0, z0, w, h, d, nx, ny, nz) {
  const L = [];
  const id = (i, j, k) => (k * (ny + 1) + j) * (nx + 1) + i;
  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        let x = x0 + (w * i) / nx;
        let y = y0 + (h * j) / ny;
        let z = z0 + (d * k) / nz;
        if (i > 0 && i < nx) x += (rand() - 0.5) * 0.92 * w / nx;
        if (j > 0 && j < ny) y += (rand() - 0.5) * 0.92 * h / ny;
        if (k > 0 && k < nz) z += (rand() - 0.5) * 0.92 * d / nz;
        L[id(i, j, k)] = new THREE.Vector3(x, y, z);
      }
    }
  }
  const SIDES = [
    [[[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]], (i) => i > 0],
    [[[1, 0, 0], [1, 0, 1], [1, 1, 1], [1, 1, 0]], (i, j, k) => i < nx - 1],
    [[[0, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, 0]], (i, j) => j > 0],
    [[[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]], (i, j) => j < ny - 1],
    [[[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], (i, j, k) => k > 0],
    [[[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]], (i, j, k) => k < nz - 1]
  ];
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const center = new THREE.Vector3();
        for (let c = 0; c < 8; c++) center.add(L[id(i + (c & 1), j + ((c >> 1) & 1), k + (c >> 2))]);
        center.multiplyScalar(1 / 8);
        const faces = SIDES.map(([q, inner]) => ({
          pts: q.map(([a, b, c]) => L[id(i + a, j + b, k + c)]),
          inner: inner(i, j, k) ? 1 : 0
        }));
        out.push({ center, faces });
      }
    }
  }
}

/* Осколок дрона: неровный тетраэдр */
function shard(center, size) {
  const p = [];
  for (let n = 0; n < 4; n++) {
    p.push(center.clone().add(new THREE.Vector3(rr(-1, 1), rr(-0.4, 0.4), rr(-1, 1)).multiplyScalar(size)));
  }
  return {
    center: p[0].clone().add(p[1]).add(p[2]).add(p[3]).multiplyScalar(0.25),
    faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]].map((f) => ({ pts: f.map((n) => p[n]), inner: 1 }))
  };
}

/* Геометрия кусков: у каждой вершины — центр куска, куда он улетел,
   ось и угол вращения, запаздывание при сборке и «жар» излома */
function buildChunks(chunks) {
  let nv = 0;
  chunks.forEach((c) => c.faces.forEach((f) => { nv += f.pts.length === 4 ? 6 : 3; }));
  const pos = new Float32Array(nv * 3);
  const cen = new Float32Array(nv * 3);
  const off = new Float32Array(nv * 3);
  const axs = new Float32Array(nv * 3);
  const prm = new Float32Array(nv * 4);
  const fuv = new Float32Array(nv * 2);
  let v = 0;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const fc = new THREE.Vector3();
  const QUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const put = (c, p, uv, inner) => {
    p.toArray(pos, v * 3);
    c.center.toArray(cen, v * 3);
    c.off.toArray(off, v * 3);
    c.axis.toArray(axs, v * 3);
    prm[v * 4] = c.spin;
    prm[v * 4 + 1] = c.lag;
    prm[v * 4 + 2] = c.heat;
    prm[v * 4 + 3] = inner;
    fuv[v * 2] = uv[0];
    fuv[v * 2 + 1] = uv[1];
    v++;
  };
  chunks.forEach((c) => {
    c.faces.forEach((f) => {
      const tris = f.pts.length === 4 ? [[0, 1, 2], [0, 2, 3]] : [[0, 1, 2]];
      fc.set(0, 0, 0);
      f.pts.forEach((p) => fc.add(p));
      fc.multiplyScalar(1 / f.pts.length).sub(c.center);
      tris.forEach((t) => {
        let [a, b, d] = t;
        // обход против часовой снаружи куска
        e1.subVectors(f.pts[b], f.pts[a]);
        e2.subVectors(f.pts[d], f.pts[a]);
        if (e1.cross(e2).dot(fc) < 0) [b, d] = [d, b];
        [a, b, d].forEach((n) => put(c, f.pts[n], f.pts.length === 4 ? QUV[n] : [0.5, 0.5], f.inner));
      });
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3));
  g.setAttribute('aOff', new THREE.BufferAttribute(off, 3));
  g.setAttribute('aAxis', new THREE.BufferAttribute(axs, 3));
  g.setAttribute('aP', new THREE.BufferAttribute(prm, 4));
  g.setAttribute('aFuv', new THREE.BufferAttribute(fuv, 2));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 3), 40);
  return g;
}

function init() {
  const rewind = hero.classList.contains('is-rewind') && !REDUCED;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 1.75));
  renderer.setClearColor(C.bg, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'hero__canvas';
  stage.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(C.fog, 0.021);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.3, 400);

  const uK = { value: rewind ? 1 : 0 };      // 1 — остановленный кадр, 0 — удара не было
  const uTime = { value: 0 };
  const uLock = { value: 0 };                // вспышка «сварки» трещин в момент сборки
  const uScale = { value: 500 };             // пиксели на метр на единичной дистанции

  /* ---------------- свет ---------------- */
  scene.add(new THREE.HemisphereLight(0x6a6c72, 0x0e0b08, 1.4));
  // холодный «лунный» ключ: бетон остаётся серым, огонь даёт тёплые отсветы
  const key = new THREE.DirectionalLight(0xc4d0e2, 3.2);
  key.position.set(-9, 14, 12);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff6a1a, 0.9);
  rim.position.set(7, 6, -12);
  scene.add(rim);
  const fireLight = new THREE.PointLight(0xffa864, 0, 46, 1.6);
  fireLight.position.copy(FIRE);
  scene.add(fireLight);
  const backLight = new THREE.PointLight(0xff5a14, 0, 12, 1.2);
  backLight.position.set(IMPACT.x, IMPACT.y, -6);
  scene.add(backLight);

  /* ---------------- земля ---------------- */
  {
    const g = new THREE.PlaneGeometry(400, 400);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.72, metalness: 0.3 });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // тень у основания стенки
            float dz = abs(vW.z);
            float inX = 1.0 - smoothstep(${(COLS * BW / 2).toFixed(1)}, ${(COLS * BW / 2 + 2).toFixed(1)}, abs(vW.x));
            diffuseColor.rgb *= 1.0 - 0.7 * inX * (1.0 - smoothstep(0.6, 3.5, dz));
            // бетонная площадка: плиты 4×4 м с тёмными швами
            vec2 g = abs(fract(vW.xz / 4.0 - 0.5) - 0.5) * 4.0;
            float seam = 1.0 - smoothstep(0.02, 0.06, min(g.x, g.y));
            diffuseColor.rgb *= 1.0 - 0.45 * seam;
          }`);
    };
    scene.add(new THREE.Mesh(g, m));
  }

  /* ---------------- материал кусков ---------------- */
  function chunkMaterial(color, rough) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.05, flatShading: true });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uK = uK;
      sh.uniforms.uTime = uTime;
      sh.uniforms.uLock = uLock;
      sh.uniforms.uHot = { value: C.hot };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec3 aCenter;
          attribute vec3 aOff;
          attribute vec3 aAxis;
          attribute vec4 aP;
          attribute vec2 aFuv;
          uniform float uK, uTime;
          varying vec2 vFuv;
          varying vec3 vRest;
          varying float vInner, vHeat, vKK;
          vec3 rotA(vec3 v, vec3 a, float ang) {
            float c = cos(ang), s = sin(ang);
            return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
          }`)
        .replace('#include <begin_vertex>', `
          // kk — «время» этого куска: дальние трещины смыкаются раньше, центр удара — последним
          float kk = smoothstep(aP.y, 1.0, uK);
          float drift = kk * aP.z;
          float ang = aP.x * kk + drift * 0.08 * sin(uTime * 0.35 + aP.x * 9.0);
          vec3 transformed = aCenter + rotA(position - aCenter, aAxis, ang) + aOff * kk
            + drift * 0.08 * vec3(sin(uTime * 0.3 + aP.x * 5.0), cos(uTime * 0.27 + aP.x * 7.0), sin(uTime * 0.23 + aP.x * 3.0));
          vFuv = aFuv;
          vRest = position;
          vInner = aP.w;
          vHeat = aP.z;
          vKK = kk;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uLock;
          uniform vec3 uHot;
          varying vec2 vFuv;
          varying vec3 vRest;
          varying float vInner, vHeat, vKK;
          float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
          float vn(vec3 p) {
            vec3 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                       mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
          }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // бетон: пятна, мелкие раковины; свежий излом светлее
            float n = vn(vRest * 2.3) * 0.5 + vn(vRest * 9.0) * 0.3 + h3(floor(vRest * 70.0)) * 0.2;
            diffuseColor.rgb *= (0.72 + 0.5 * n) * mix(1.0, 1.22, vInner);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            vec2 fe = min(vFuv, 1.0 - vFuv);
            float ed = min(fe.x, fe.y);
            float lw = fwidth(ed);
            float crack = (1.0 - smoothstep(lw * 0.6, lw * 1.8 + 0.006, ed)) * step(ed, 0.49);
            float hot = vInner * vHeat * vKK;
            totalEmissiveRadiance += uHot * (hot * hot * 1.3 + crack * (vHeat * vKK * 0.9 + uLock * 2.2));
          }`);
    };
    return m;
  }

  /* ---------------- стенка ---------------- */
  const chunks = [];
  const W = COLS * BW;
  const GAP = 0.025;
  for (let r = 0; r < ROWS; r++) {
    // перевязка швов: чётные ряды начинаются с полублока
    const cuts = [];
    let x = -W / 2;
    if (r % 2) { cuts.push([x, BW / 2]); x += BW / 2; }
    while (x < W / 2 - 0.01) {
      const w = Math.min(BW, W / 2 - x);
      cuts.push([x, w]);
      x += w;
    }
    cuts.forEach(([x0, w]) => {
      const cx = x0 + w / 2;
      const cy = r * BH + BH / 2;
      const near = Math.hypot(cx - IMPACT.x, cy - IMPACT.y) < 3.4;
      const nx = Math.max(2, Math.round((w / BW) * (near ? 6 : 4)));
      fracture(chunks, x0 + GAP, r * BH + GAP, -BD / 2 + GAP, w - 2 * GAP, BH - 2 * GAP, BD - 2 * GAP, nx, near ? 3 : 2, near ? 3 : 2);
    });
  }
  const tmp = new THREE.Vector3();
  chunks.forEach((c) => {
    const d = tmp.subVectors(c.center, IMPACT);
    const dist = d.length();
    const s = Math.exp(-(dist * dist) / 9);
    c.axis = new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
    c.heat = s;
    if (s > 0.1) {
      // обломки: веером от точки удара, лицевая сторона — к зрителю, тыльная — насквозь назад
      const dir = new THREE.Vector3(d.x + rr(-0.6, 0.6), d.y * 0.9 + 0.5 + rr(-0.5, 0.6), (c.center.z > 0 ? 0.8 : -0.7) + rr(0, 0.6)).normalize();
      let m = rr(1.6, 6.5) * (0.45 + s);
      if (rand() < 0.12) m *= 1.8;
      c.off = dir.multiplyScalar(m);
      if (c.center.z + c.off.z > 4.8) c.off.multiplyScalar((4.8 - c.center.z) / c.off.z);
      if (c.center.y + c.off.y < 0.35) c.off.y = 0.35 - c.center.y + rr(0, 0.6);
      c.spin = rr(1.5, 6) * s + 0.4;
      c.lag = rr(0, 0.12);
    } else {
      // трещины: куски чуть сдвинуты и повёрнуты
      c.off = d.clone().normalize().multiplyScalar(s * 1.3 + rr(0.02, 0.07)).add(new THREE.Vector3(0, 0, rr(0, 0.05)));
      c.spin = rr(0.03, 0.12) * (s * 6 + 0.3);
      c.lag = rr(0.28, 0.6);
    }
  });
  const wall = new THREE.Mesh(buildChunks(chunks), chunkMaterial(C.concrete, 0.93));
  wall.frustumCulled = false;
  scene.add(wall);

  /* ---------------- осколки дрона ---------------- */
  const shards = [];
  for (let n = 0; n < 70; n++) {
    const c = shard(IMPACT.clone().add(new THREE.Vector3(rr(-1.1, 1.1), rr(-0.15, 0.15), rr(0.2, 2.2))), rr(0.08, 0.28));
    const dir = new THREE.Vector3(rr(-1, 1), rr(-0.4, 1), rr(0.1, 1.2)).normalize();
    c.off = dir.multiplyScalar(rr(2, 11));
    if (c.center.z + c.off.z > 4.8) c.off.multiplyScalar((4.8 - c.center.z) / c.off.z);
    c.axis = new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
    c.spin = rr(3, 12);
    c.lag = 0;
    c.heat = rr(0.3, 0.9);
    shards.push(c);
  }
  const shardMesh = new THREE.Mesh(buildChunks(shards), chunkMaterial(C.metal, 0.5));
  shardMesh.material.metalness = 0.5;
  shardMesh.frustumCulled = false;
  scene.add(shardMesh);

  /* ---------------- огненный шар ---------------- */
  const fireMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime, uK },
    vertexShader: `
      uniform float uTime, uK;
      varying vec3 vN;
      varying vec3 vV;
      varying float vD;
      float h3(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float vn(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                   mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
      }
      void main() {
        float d = vn(position * 1.8 + uTime * 0.25) * 0.6 + vn(position * 4.5 - uTime * 0.4) * 0.3;
        vD = d;
        vec3 p = position * (1.0 + d * 0.55);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uK;
      varying vec3 vN;
      varying vec3 vV;
      varying float vD;
      void main() {
        float f = clamp(dot(vN, vV), 0.0, 1.0);
        float core = pow(f, 3.0);
        vec3 col = mix(vec3(0.5, 0.06, 0.01), vec3(1.0, 0.42, 0.08), f);
        col = mix(col, vec3(1.0, 0.86, 0.6), core * (0.4 + vD));
        float a = (0.25 + 0.75 * f) * (0.55 + vD * 0.8) * smoothstep(0.0, 0.12, uK);
        gl_FragColor = vec4(col * a * 1.3, a);
        #include <colorspace_fragment>
      }`
  });
  const fire = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 5), fireMat);
  fire.position.copy(FIRE);
  scene.add(fire);

  const glowTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,200,140,1)');
    gr.addColorStop(0.2, 'rgba(255,110,30,.55)');
    gr.addColorStop(0.55, 'rgba(255,70,10,.14)');
    gr.addColorStop(1, 'rgba(255,60,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  glow.position.copy(FIRE);
  scene.add(glow);

  /* ---------------- частицы: искры, дым, пыль ----------------
     Положение каждой — функция uK: p = центр + смещение·k − «провис»·k² */
  function particles(n, gen, opts) {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const sd = new Float32Array(n * 2);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      FIRE.toArray(pos, i * 3);
      gen(v, i);
      v.toArray(vel, i * 3);
      sd[i * 2] = rand();
      sd[i * 2 + 1] = rand();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 2));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uK, uTime, uScale, uFire: { value: FIRE } },
      vertexShader: `
        attribute vec3 aVel;
        attribute vec2 aSeed;
        uniform float uK, uTime, uScale;
        uniform vec3 uFire;
        varying float vA;
        varying vec3 vC;
        varying float vS;
        void main() {
          float k = uK;
          vec3 p = position + aVel * k - vec3(0.0, ${opts.drop.toFixed(2)}, 0.0) * k * k * aSeed.x
            + k * ${opts.drift.toFixed(2)} * vec3(sin(uTime * 0.2 + aSeed.y * 30.0), cos(uTime * 0.17 + aSeed.x * 20.0), sin(uTime * 0.13 + aSeed.y * 11.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float heat = exp(-dot(p - uFire, p - uFire) / ${opts.heatR.toFixed(1)});
          vS = aSeed.y;
          ${opts.color}
          vA = smoothstep(0.0, 0.1, k) * ${opts.alpha};
          gl_PointSize = clamp(${opts.size} * uScale / -mv.z, 1.0, ${opts.maxPx.toFixed(1)});
        }`,
      fragmentShader: `
        varying float vA;
        varying vec3 vC;
        varying float vS;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = ${opts.soft ? 'smoothstep(0.5, 0.0, d) * smoothstep(0.5, 0.15, d)' : 'smoothstep(0.5, 0.1, d)'};
          if (a < 0.01) discard;
          gl_FragColor = vec4(vC, a * vA);
          #include <colorspace_fragment>
        }`
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    pts.renderOrder = opts.order || 0;
    scene.add(pts);
    return pts;
  }
  // искры: мелкие раскалённые точки, от белого к оранжевому
  particles(COARSE ? 900 : 1800, (v) => {
    v.set(rr(-1, 1), rr(-0.5, 1), rr(-0.2, 1.2)).normalize().multiplyScalar(Math.pow(rand(), 0.6) * 16 + 1);
    if (v.z + FIRE.z > 7) v.z = 7 - FIRE.z - rr(0, 2);
  }, {
    additive: true, drop: 2.5, drift: 0.05, heatR: 30, alpha: '1.0', size: '(0.05 + aSeed.x * 0.07)', maxPx: 7, order: 4,
    color: 'vC = mix(vec3(1.0, 0.35, 0.05), vec3(1.0, 0.9, 0.7), aSeed.y) * 2.0;'
  });
  // хвосты искр — «смаз» по направлению полёта
  {
    const n = COARSE ? 500 : 1000;
    const pos = new Float32Array(n * 6);
    const g = new THREE.BufferGeometry();
    const ends = new Float32Array(n * 2);
    const vels = new Float32Array(n * 6);
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(rr(-1, 1), rr(-0.3, 1), rr(-0.1, 1.2)).normalize().multiplyScalar(rr(3, 17));
      if (v.z + FIRE.z > 7) v.z = 7 - FIRE.z - rr(0, 2);
      for (let e = 0; e < 2; e++) {
        FIRE.toArray(pos, (i * 2 + e) * 3);
        v.toArray(vels, (i * 2 + e) * 3);
        ends[i * 2 + e] = e;
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vels, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    const streaks = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uK },
      vertexShader: `
        attribute vec3 aVel;
        attribute float aEnd;
        uniform float uK;
        varying float vE;
        void main() {
          float k = max(uK - aEnd * 0.1, 0.0);
          vE = (1.0 - aEnd) * smoothstep(0.0, 0.15, uK);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position + aVel * k, 1.0);
        }`,
      fragmentShader: `
        varying float vE;
        void main() {
          gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * 1.6, vE * 0.8);
          #include <colorspace_fragment>
        }`
    }));
    streaks.frustumCulled = false;
    scene.add(streaks);
  }
  // дым: крупные мягкие клубы, подсвеченные огнём изнутри
  particles(COARSE ? 140 : 240, (v) => {
    v.set(rr(-1, 1), rr(-0.2, 1), rr(-0.3, 1)).normalize().multiplyScalar(rr(0.8, 6.5));
  }, {
    additive: false, soft: true, drop: -1.2, drift: 0.25, heatR: 7, alpha: '0.42', size: '(1.2 + aSeed.x * 2.4) * (0.4 + 0.6 * k)', maxPx: 900, order: 2,
    color: 'vC = mix(vec3(0.09, 0.075, 0.065), vec3(1.0, 0.42, 0.12), heat * 0.95);'
  });
  // бетонная пыль: тысячи мелких частиц, ловят свет огня
  particles(COARSE ? 1500 : 3200, (v) => {
    v.set(rr(-1, 1), rr(-0.4, 1), rr(-0.4, 1.2)).normalize().multiplyScalar(Math.pow(rand(), 0.5) * 12 + 0.5);
    if (v.z + FIRE.z > 7) v.z = 7 - FIRE.z - rr(0, 2);
  }, {
    additive: true, drop: 1.0, drift: 0.12, heatR: 20, alpha: '0.55', size: '(0.02 + aSeed.x * 0.035)', maxPx: 4, order: 3,
    color: 'vC = mix(vec3(0.35, 0.3, 0.27), vec3(1.0, 0.5, 0.2), heat);'
  });

  /* ---------------- дрон ---------------- */
  const drone = new THREE.Group();
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0x302d2a, roughness: 0.5, metalness: 0.55 });
    const s = new THREE.Shape();
    s.moveTo(0, 1.3);
    s.lineTo(-1.35, -0.85);
    s.lineTo(-0.25, -0.65);
    s.lineTo(0, -0.95);
    s.lineTo(0.25, -0.65);
    s.lineTo(1.35, -0.85);
    s.closePath();
    const wingG = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.03, bevelSegments: 1 });
    wingG.rotateX(Math.PI / 2);
    drone.add(new THREE.Mesh(wingG, mat));
    const body = new THREE.CylinderGeometry(0.1, 0.16, 2.1, 12);
    body.rotateX(Math.PI / 2);
    const bm = new THREE.Mesh(body, mat);
    bm.position.set(0, -0.06, 0.1);
    drone.add(bm);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.42, 0.5), mat);
    fin.position.set(0, 0.16, -0.72);
    drone.add(fin);
    const tail = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    tail.position.set(0, -0.05, -1.0);
    tail.scale.setScalar(1.1);
    drone.add(tail);
    drone.visible = false;
    scene.add(drone);
  }

  /* ---------------- камера ---------------- */
  // A — остановленный кадр вплотную к удару, B — финал: стенка справа, слева текст
  const camA = { pos: new THREE.Vector3(-3.2, 2.2, 18.5), look: new THREE.Vector3(-1.4, 2.8, 0.6) };
  const camB = { pos: new THREE.Vector3(-10.5, 1.5, 15.5), look: new THREE.Vector3(-3.6, 2.9, 0) };
  const camAn = { pos: new THREE.Vector3(-1.6, 2.6, 21), look: new THREE.Vector3(1.0, 2.0, 0.6) };
  const camBn = { pos: new THREE.Vector3(-8, 4.2, 21), look: new THREE.Vector3(0.6, 0.2, 0) };
  let narrowView = false;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const cPos = new THREE.Vector3();
  const cLook = new THREE.Vector3();

  function placeCamera(p, t) {
    const A = narrowView ? camAn : camA;
    const B = narrowView ? camBn : camB;
    const e = smooth(0.04, 0.92, p);
    cPos.lerpVectors(A.pos, B.pos, e);
    cLook.lerpVectors(A.look, B.look, e);
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;
    const idle = REDUCED ? 0 : 1;
    cPos.x += mouse.x * (0.9 + e * 1.5) + idle * Math.sin(t * 0.21) * 0.25;
    cPos.y += -mouse.y * (0.4 + e * 0.8) + idle * Math.sin(t * 0.17) * 0.12;
    camera.position.copy(cPos);
    camera.lookAt(cLook);
  }

  /* ---------------- хронометр и подсказка ---------------- */
  const clockEl = document.getElementById('rwClock');
  const stateEl = document.getElementById('rwState');
  let lastClock = '';
  let lastState = '';
  function hud(p, droneQ) {
    let tSec;
    let state;
    if (uK.value > 0.0005) {
      tSec = T_FROZEN * uK.value;
      state = p < 0.01 ? 'Кадр остановлен' : 'Перемотка назад';
    } else {
      tSec = -1.6 * droneQ;
      state = 'Удар не состоялся';
    }
    const txt = (tSec >= 0 ? '+' : '−') + Math.abs(tSec).toFixed(3).replace('.', ',');
    if (clockEl && txt !== lastClock) { clockEl.firstChild.nodeValue = txt; lastClock = txt; }
    if (stateEl && state !== lastState) { stateEl.textContent = state; lastState = state; }
    hero.classList.toggle('is-moving', p > 0.015);
    hero.classList.toggle('is-done', p >= P_DONE);
    // шапка не мешает смотреть: прячем её, пока время отматывается
    document.documentElement.classList.toggle('is-hero-playing', p < P_DONE);
  }

  /* ---------------- прокрутка ---------------- */
  let pTarget = rewind ? 0 : 1;
  let p = pTarget;
  function readScroll() {
    if (!rewind) return;
    const r = hero.getBoundingClientRect();
    const travel = NARROW.matches ? window.innerHeight * 0.8 : Math.max(1, r.height - window.innerHeight);
    pTarget = clamp(-r.top / travel, 0, 1);
    requestRender();
  }
  window.addEventListener('scroll', readScroll, { passive: true });

  hero.addEventListener('pointermove', (e) => {
    if (COARSE || REDUCED) return;
    mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  /* ---------------- размер ---------------- */
  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    narrowView = camera.aspect < 1.05;
    camera.fov = camera.aspect < 0.8 ? 58 : camera.aspect < 1.05 ? 48 : 36;
    camera.updateProjectionMatrix();
    uScale.value = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * DEG) / 2));
    requestRender();
  }

  /* ---------------- цикл ---------------- */
  let visible = true;
  let raf = 0;
  let tPrev = -1;
  let t = 0;
  let lockT = -10;
  let wasOpen = uK.value > 0.001;
  const back = DRONE_FROM.clone();

  function requestRender() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    const real = now / 1000;
    const dt = tPrev < 0 ? 1 / 60 : Math.min(window.__heroDtMax || 0.05, real - tPrev);
    tPrev = real;
    t += dt;
    uTime.value = t;

    // прокрутка сглажена: обломки не дёргаются от колёсика
    p += (pTarget - p) * (1 - Math.exp(-dt * 5));
    if (Math.abs(pTarget - p) < 0.0005) p = pTarget;

    const r = clamp(p / P_REWIND, 0, 1);
    uK.value = rewind ? 0.5 + 0.5 * Math.cos(Math.PI * r) : 0;
    const k = uK.value;

    // сборка: трещины вспыхивают и остывают
    const open = k > 0.001;
    if (wasOpen && !open) lockT = t;
    wasOpen = open;
    uLock.value = Math.exp(-(t - lockT) * 1.6) * (t - lockT < 4 ? 1 : 0);

    // огонь
    const fk = Math.pow(k, 0.55);
    fire.visible = k > 0.002;
    fire.scale.setScalar(0.05 + 1.7 * fk);
    glow.visible = fire.visible;
    glow.scale.setScalar(1 + 10 * fk * (0.94 + 0.06 * Math.sin(t * 7)));
    fireLight.intensity = 170 * fk * (0.9 + 0.1 * Math.sin(t * 11) * Math.sin(t * 4.3));
    backLight.intensity = 110 + 220 * fk;
        shardMesh.visible = k > 0.004;

    // дрон собирается в точке удара и уходит туда, откуда пришёл
    const q = smooth(P_REWIND, P_DRONE, p);
    drone.visible = rewind && k <= 0.004 && q < 0.999;
    if (drone.visible) {
      drone.position.copy(IMPACT).addScaledVector(back, 1.3 + Math.pow(q, 1.7) * 70);
      drone.lookAt(IMPACT);
    }

    placeCamera(p, t);
    renderer.render(scene, camera);
    if (rewind) hud(p, q);

    if (!stage.classList.contains('is-live')) {
      stage.classList.add('is-live');
      hero.classList.add('is-3d');
    }
    // остановленный кадр «дышит», готовая сцена плавает от курсора — рисуем всё время,
    // пока экран на виду; при «уменьшении движения» — только по событиям
    if (!REDUCED && visible && !document.hidden) raf = requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(stage);
  new IntersectionObserver((es) => {
    visible = es[es.length - 1].isIntersecting;
    if (visible) { tPrev = -1; requestRender(); }
  }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tPrev = -1; requestRender(); } });

  readScroll();
  p = pTarget;
  resize();
  requestRender();
}
