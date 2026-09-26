/* ==========================================================================
   Защита от БПЛА — 3D-схема защитной стенки из блоков ФБС.
   Порядок сборки: песчаная подушка → основание из блоков поперёк стены →
   два ряда вдоль стены → засыпка грунтом → стена над землёй.
   За стеной — защищаемый объект (шунтирующий реактор), перед ней — автокран.

   Сборкой управляет прокрутка раздела: main.js кладёт долю прохода
   в window.__wallProgress, границы этапов у них общие. Модель можно вращать.
   Модуль подгружает main.js, когда блок #wall подходит к экрану.
   foundation3d.js?still=1 — режим для рендера статичной картинки.
   ========================================================================== */
import * as THREE from './vendor/three.module.min.js';

const STILL = new URL(import.meta.url).searchParams.has('still');
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const QUIET = STILL || REDUCED;

/* ---- Размеры, м: блоки ФБС по ГОСТ 13579 ---- */
const H = 0.58;          // высота блока
const J = 0.02;          // растворный шов
const W = 0.40;          // ширина блока
const L_FULL = 2.38;     // ФБС 24.4.6
const L_HALF = 1.18;     // ФБС 12.4.6
const STEP = H + J;

const WALL_LEN = 4 * L_FULL + 3 * J;
const WALL_X0 = -WALL_LEN / 2;
const GREY_COURSES = 4;

const Y_ROW2 = -H;               // верх второго чёрного ряда — уровень земли
const Y_ROW1 = Y_ROW2 - STEP;
const Y_FOOT = Y_ROW1 - STEP;
const SAND_T = 0.15;
const Y_SAND = Y_FOOT - SAND_T;

const FOOT_N = 23;
const FOOT_LEN = FOOT_N * W + (FOOT_N - 1) * J;

/* Грунт: куб с разрезом, фундамент выходит из его левой грани.
   За стеной (z < 0) — площадка реактора, перед стеной (z > 0) — площадка крана */
const SOIL = { x0: -0.8, x1: 9.2, z0: -6.4, z1: 8.3, depth: 2.6, top: -0.004 };
const SOIL_LAYERS = [            // сверху вниз: толщина, цвет
  [0.30, 0x3a2c22],
  [0.70, 0x4a3727],
  [0.80, 0x5a432e],
  [0.80, 0x6a5037]
];
const SOIL_LOW = (Y_SAND - (SOIL.top - SOIL.depth)) / SOIL.depth;  // дно котлована

const COL = {
  black: 0x1e1c1b, blackEdge: 0x6a5446,
  grey: 0xb9b3ad, greyEdge: 0x6d655e,
  sand: 0xb89a66, surface: 0x2b2927, soilEdge: 0x4a3526,
  accent: 0xff6a1a,
  body: 0x3a3632, cab: 0x4a4540, dark: 0x161413, glass: 0x1f2a30,
  timber: 0x5a4533, alu: 0x9aa0a4,
  tank: 0x6a706d, porcelain: 0x6e3a1f, gravel: 0x4a4540, curb: 0x5a5550
};

/* ---- Сценарий сборки в долях прохода по разделу (0…1) ----
   Границы этапов совпадают с WALL_STEPS в main.js */
const T = { sand: 0.02, foot: 0.1, row1: 0.26, row2: 0.38, fill: 0.5, wall: 0.64, done: 0.9 };
const DROP = 0.035;
const FILL = 0.11;
const END = 1;

/* ---- Камера ---- */
const TARGET = new THREE.Vector3(2.4, -0.3, 0.8);
const DEG = Math.PI / 180;
const VIEW = { theta: -32 * DEG, phi: 60 * DEG };
const ORBIT = 34 * DEG;          // за время сборки камера облетает стенку
const LIMIT = { thMin: -88 * DEG, thMax: 25 * DEG, phMin: 44 * DEG, phMax: 74 * DEG };
const BASE_R = 34;
const REF_ASPECT = 16 / 9;

const stage = document.getElementById('wallStage');
if (stage) {
  try { init(stage); } catch (err) { console.warn('3D-схема недоступна:', err); }
}

function init(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.touchAction = 'pan-y';          // вертикальный свайп листает страницу
  const still = stage.querySelector('.asm__still');
  if (still) still.after(canvas); else stage.prepend(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, REF_ASPECT, 0.5, 120);

  /* ---------------- свет ---------------- */
  scene.add(new THREE.HemisphereLight(0xdcd8d4, 0x17130f, 1.0));

  const sun = new THREE.DirectionalLight(0xfff1e2, 2.1);
  sun.position.set(-7, 14, 10);
  sun.target.position.set(1, 0, -1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 50 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const fill = new THREE.DirectionalLight(0xffffff, 0.25);
  fill.position.set(10, 6, -6);
  scene.add(fill);
  // оранжевый контровой свет, как на первом экране
  const rim = new THREE.DirectionalLight(0xff6a1a, 1.1);
  rim.position.set(6, 5, -14);
  scene.add(rim);

  /* ---------------- материалы ---------------- */
  const concrete = noiseTexture(128, 206, 255, 60);
  const soilTex = noiseTexture(256, 170, 255, 480);

  const blockMat = (color) => new THREE.MeshStandardMaterial({
    color, map: concrete, roughness: 0.92, metalness: 0,
    // грани чуть «отодвинуты», чтобы контурные линии не мерцали
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
  });

  const MAT = { foot: blockMat(COL.black), rows: blockMat(COL.black), wall: blockMat(COL.grey), stack: blockMat(COL.grey) };
  const EDGE_COL = { foot: COL.blackEdge, rows: COL.blackEdge, wall: COL.greyEdge, stack: COL.greyEdge };
  const EDGE = {};
  for (const k in EDGE_COL) EDGE[k] = new THREE.LineBasicMaterial({ color: EDGE_COL[k] });

  const std = (color, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  /* ---------------- блоки ---------------- */
  const geoCache = new Map();
  function boxGeo(x, y, z) {
    const key = x + '|' + y + '|' + z;
    if (!geoCache.has(key)) {
      const g = new THREE.BoxGeometry(x, y, z);
      geoCache.set(key, { g, e: new THREE.EdgesGeometry(g) });
    }
    return geoCache.get(key);
  }
  function block(x, y, z, part) {
    const { g, e } = boxGeo(x, y, z);
    const m = new THREE.Mesh(g, MAT[part]);
    m.castShadow = true;
    m.receiveShadow = true;
    m.add(new THREE.LineSegments(e, EDGE[part]));
    return m;
  }

  // Всё, что «падает» на место во время сборки
  const pieces = [];
  function drop(obj, x, y, z, t) {
    obj.position.set(x, y, z);
    obj.userData.y = y;
    obj.userData.t = t;
    pieces.push(obj);
    scene.add(obj);
  }

  // Ряд вдоль стены: A — четыре целых блока, B — половинки по краям (перевязка швов)
  function course(yBottom, pattern, part, t0, dt) {
    const lens = pattern === 'A' ? [L_FULL, L_FULL, L_FULL, L_FULL] : [L_HALF, L_FULL, L_FULL, L_FULL, L_HALF];
    let x = WALL_X0;
    lens.forEach((len, i) => {
      drop(block(len, H, W, part), x + len / 2, yBottom + H / 2, 0, t0 + i * dt);
      x += len + J;
    });
  }

  // 1. Песчаная подушка
  const sandGeo = new THREE.BoxGeometry(FOOT_LEN + 0.5, SAND_T, L_HALF + 0.5);
  sandGeo.translate(0, SAND_T / 2, 0);
  const sandTex = soilTex.clone();
  sandTex.repeat.set(6, 0.4);
  sandTex.needsUpdate = true;
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ color: COL.sand, map: sandTex, roughness: 1 }));
  sand.position.y = Y_SAND;
  sand.receiveShadow = true;
  scene.add(sand);

  // 2. Основание: короткие блоки ПОПЕРЁК стены
  let fx = -FOOT_LEN / 2;
  for (let i = 0; i < FOOT_N; i++) {
    drop(block(W, H, L_HALF, 'foot'), fx + W / 2, Y_FOOT + H / 2, 0, T.foot + i * 0.0055);
    fx += W + J;
  }

  // 3. Два ряда вдоль стены — ниже уровня земли
  course(Y_ROW1, 'A', 'rows', T.row1, 0.018);
  course(Y_ROW2, 'B', 'rows', T.row2, 0.016);

  // 4. Стена над землёй
  for (let k = 0; k < GREY_COURSES; k++) {
    course(J + k * STEP, k % 2 ? 'B' : 'A', 'wall', T.wall + k * 0.05, 0.01);
  }

  /* ---------------- грунт в разрезе ---------------- */
  const soil = new THREE.Group();
  soil.position.y = SOIL.top - SOIL.depth;
  const sx = SOIL.x1 - SOIL.x0;
  const sz = SOIL.z1 - SOIL.z0;
  const surface = new THREE.MeshStandardMaterial({ color: COL.surface, roughness: 1 });
  let yy = 0;
  for (let i = SOIL_LAYERS.length - 1; i >= 0; i--) {
    const [t, color] = SOIL_LAYERS[i];
    const tex = soilTex.clone();
    tex.repeat.set(9, t * 3);
    tex.needsUpdate = true;
    const side = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 1 });
    // порядок граней BoxGeometry: +x, −x, +y, −y, +z, −z
    const mats = i === 0 ? [side, side, surface, side, side, side] : side;
    const layer = new THREE.Mesh(new THREE.BoxGeometry(sx, t, sz), mats);
    layer.position.set(SOIL.x0 + sx / 2, yy + t / 2, SOIL.z0 + sz / 2);
    layer.receiveShadow = true;
    soil.add(layer);
    yy += t;
  }
  const soilOutline = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, SOIL.depth, sz)),
    new THREE.LineBasicMaterial({ color: COL.soilEdge })
  );
  soilOutline.position.set(SOIL.x0 + sx / 2, SOIL.depth / 2, SOIL.z0 + sz / 2);
  soil.add(soilOutline);
  scene.add(soil);

  // Уровень земли: оранжевая линия по срезу грунта и пунктир на выступающем фундаменте
  const ground = new THREE.Group();
  const greenMat = new THREE.MeshBasicMaterial({ color: COL.accent });
  const t2 = 0.045;
  const gy = SOIL.top + t2 / 2;
  const bar = (len, x, z, alongX) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : t2, t2, alongX ? t2 : len), greenMat);
    m.position.set(x, gy, z);
    ground.add(m);
  };
  bar(sz, SOIL.x0 - 0.01, SOIL.z0 + sz / 2, false);
  bar(sx, SOIL.x0 + sx / 2, SOIL.z1 + 0.01, true);
  for (let x = WALL_X0; x < SOIL.x0 - 0.05; x += 0.3) {
    bar(Math.min(0.18, SOIL.x0 - x), x + 0.09, W / 2 + 0.03, true);
  }
  scene.add(ground);

  /* ---------------- объект за стеной, техника перед ней ---------------- */
  const reactor = buildReactor();
  reactor.position.set(2.3, 0, -3.5);
  // кран стоит поперёк стены кабиной от неё и подаёт блок через заднюю часть
  const crane = buildCrane(new THREE.Vector3(6.9, 0, 4.4), Math.PI / 2, new THREE.Vector3(3.4, 6.0, 0.25));
  const stack = buildStack();
  stack.position.set(2.6, 0, 4.4);
  const tripod = buildTripod();
  tripod.position.set(0.2, 0, 2.4);
  // объект и техника стоят на площадке с самого начала
  [reactor, crane, stack, tripod].forEach((g) => scene.add(g));

  // pos — где стоит кран, rotY — разворот (кабина смотрит в −x локальной оси),
  // tipWorld — оголовок стрелы над стеной
  function buildCrane(pos, rotY, tipWorld) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.rotation.y = rotY;
    g.updateMatrixWorld(true);
    const body = std(COL.body), cab = std(COL.cab), dark = std(COL.dark, 0.6);
    const glass = std(COL.glass, 0.25), accent = std(COL.accent, 0.7);
    const add = (geo, mat, x, y, z, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    const wheel = new THREE.CylinderGeometry(0.5, 0.5, 0.36, 24);
    wheel.rotateX(Math.PI / 2);
    for (const x of [-2.2, 1.0, 2.25]) for (const z of [-1.0, 1.0]) add(wheel, dark, x, 0.5, z);
    add(new THREE.BoxGeometry(6.4, 0.42, 1.9), body, 0.1, 1.02, 0);          // рама
    add(new THREE.BoxGeometry(1.7, 1.55, 2.2), cab, -2.45, 2.0, 0);            // кабина
    add(new THREE.BoxGeometry(0.04, 0.62, 1.9), glass, -3.31, 2.3, 0);         // лобовое стекло
    add(new THREE.BoxGeometry(0.8, 0.5, 0.04), glass, -2.35, 2.35, 1.11);
    add(new THREE.BoxGeometry(0.8, 0.5, 0.04), glass, -2.35, 2.35, -1.11);
    add(new THREE.BoxGeometry(1.72, 0.12, 2.22), accent, -2.45, 1.52, 0);      // фирменная полоса
    add(new THREE.BoxGeometry(4.2, 0.5, 1.7), body, 0.95, 1.46, 0);            // платформа
    add(new THREE.BoxGeometry(1.3, 0.75, 1.5), cab, 1.9, 2.0, 0);              // поворотная часть
    for (const x of [-1.2, 2.9]) for (const s of [-1, 1]) {                    // выносные опоры
      add(new THREE.BoxGeometry(0.22, 0.2, 0.95), dark, x, 1.0, s * 1.35);
      add(new THREE.BoxGeometry(0.16, 0.95, 0.16), dark, x, 0.5, s * 1.78);
      add(new THREE.BoxGeometry(0.5, 0.06, 0.5), dark, x, 0.03, s * 1.78, false);
    }

    // Стрела: от поворотной части к точке над стеной
    const pivot = new THREE.Vector3(1.9, 2.3, 0);
    const tip = g.worldToLocal(tipWorld.clone());
    const mid = pivot.clone().lerp(tip, 0.58);
    g.add(beam(pivot, mid, 0.5, body));
    g.add(beam(pivot.clone().lerp(tip, 0.5), tip, 0.36, body));
    add(new THREE.BoxGeometry(0.46, 0.4, 0.46), dark, tip.x, tip.y, tip.z);

    // Подвешенный блок: трос, крюк, стропы
    const hang = new THREE.Group();
    hang.position.copy(tip);
    hang.rotation.y = -rotY;         // блок висит вдоль стены
    const rope = new THREE.LineBasicMaterial({ color: COL.dark });
    const line = (...pts) => hang.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), rope));
    const hook = new THREE.Vector3(0, -1.4, 0);
    line(new THREE.Vector3(0, -0.2, 0), hook);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), dark);
    m.position.copy(hook);
    hang.add(m);
    const topY = -2.2;
    line(hook, new THREE.Vector3(-0.85, topY, 0));
    line(hook, new THREE.Vector3(0.85, topY, 0));
    const hb = block(L_FULL, H, W, 'stack');
    hb.position.set(0, topY - H / 2, 0);
    hang.add(hb);
    g.add(hang);
    g.userData.hang = hang;
    return g;
  }

  function buildStack() {
    const g = new THREE.Group();
    const timber = std(COL.timber, 0.9);
    const spacer = new THREE.BoxGeometry(0.1, 0.1, 1.9);
    [0, 1].forEach((lvl) => {
      const y0 = lvl * (0.1 + H);
      for (const x of [-0.8, 0.8]) {
        const s = new THREE.Mesh(spacer, timber);
        s.position.set(x, y0 + 0.05, 0);
        s.castShadow = true;
        g.add(s);
      }
      (lvl === 0 ? [-0.55, 0, 0.55] : [-0.28, 0.28]).forEach((z) => {
        const b = block(L_FULL, H, W, 'stack');
        b.position.set(0, y0 + 0.1 + H / 2, z);
        g.add(b);
      });
    });
    return g;
  }

  // Шунтирующий реактор: бак с радиаторами, вводы, расширитель; стоит на маслоприёмнике
  function buildReactor() {
    const g = new THREE.Group();
    const tank = std(COL.tank, 0.55, 0.25), dark = std(COL.dark, 0.6);
    const porcelain = std(COL.porcelain, 0.35, 0.05), alu = std(COL.alu, 0.4, 0.4);
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // маслоприёмник: бетонный бортик, внутри щебень
    add(new THREE.BoxGeometry(4.8, 0.16, 3.7), std(COL.curb, 0.95), 0, 0.08, 0);
    const gravelTex = soilTex.clone();
    gravelTex.repeat.set(3, 2);
    gravelTex.needsUpdate = true;
    add(new THREE.BoxGeometry(4.5, 0.02, 3.4), new THREE.MeshStandardMaterial({ color: COL.gravel, map: gravelTex, roughness: 1 }), 0, 0.17, 0);
    // рама-салазки и бак
    for (const z of [-0.5, 0.5]) add(new THREE.BoxGeometry(3.0, 0.22, 0.22), dark, 0, 0.29, z);
    const TOP = 0.4 + 2.1;
    add(new THREE.BoxGeometry(3.0, 2.1, 1.6), tank, 0, 0.4 + 1.05, 0);
    add(new THREE.BoxGeometry(3.14, 0.12, 1.74), tank, 0, TOP + 0.06, 0);
    // радиаторы по длинным сторонам
    const fin = new THREE.BoxGeometry(0.04, 1.5, 0.46);
    const header = new THREE.BoxGeometry(1.0, 0.09, 0.09);
    for (const s of [-1, 1]) for (const bx of [-0.75, 0.75]) {
      for (let i = 0; i < 8; i++) add(fin, tank, bx - 0.42 + i * 0.12, 1.45, s * 1.16);
      add(header, dark, bx, 2.24, s * 0.86);
      add(header, dark, bx, 0.66, s * 0.86);
    }
    // вводы: высоковольтный и нейтраль — фарфоровые юбки на стержне
    const bushing = (x, z, h) => {
      add(new THREE.CylinderGeometry(0.2, 0.24, 0.2, 18), alu, x, TOP + 0.22, z);
      add(new THREE.CylinderGeometry(0.08, 0.08, h, 12), porcelain, x, TOP + 0.3 + h / 2, z);
      const shed = new THREE.CylinderGeometry(0.19, 0.19, 0.035, 18);
      for (let y = 0.1; y < h - 0.05; y += 0.13) add(shed, porcelain, x, TOP + 0.3 + y, z);
      add(new THREE.CylinderGeometry(0.1, 0.1, 0.14, 12), alu, x, TOP + 0.37 + h, z);
    };
    bushing(-0.7, 0.1, 1.7);
    bushing(0.75, 0.25, 0.8);
    // расширитель на стойках
    const cons = new THREE.CylinderGeometry(0.3, 0.3, 1.9, 20);
    cons.rotateZ(Math.PI / 2);
    add(cons, tank, 0.35, TOP + 1.0, -0.55);
    for (const x of [-0.35, 1.05]) add(new THREE.BoxGeometry(0.08, 0.72, 0.08), dark, x, TOP + 0.48, -0.55);
    return g;
  }

  function buildTripod() {
    const g = new THREE.Group();
    const alu = std(COL.alu, 0.4, 0.3), dark = std(COL.dark, 0.5), accent = std(COL.accent, 0.6);
    const head = new THREE.Vector3(0, 1.38, 0);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + i * (2 * Math.PI / 3);
      const foot = new THREE.Vector3(Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
      g.add(rod(foot, head, 0.022, alu));
    }
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 20), dark);
    plate.position.set(0, 1.41, 0);
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.17), dark);
    bodyM.position.set(0, 1.6, 0);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 16), dark);
    scope.rotation.z = Math.PI / 2;
    scope.position.set(0, 1.66, 0.11);
    const badge = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.06, 0.18), accent);
    badge.position.set(0, 1.5, 0);
    [plate, bodyM, scope, badge].forEach((m) => { m.castShadow = true; g.add(m); });
    return g;
  }

  /* ---------------- геометрия-помощники ---------------- */
  function beam(from, to, thick, mat) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.BoxGeometry(thick, len, thick);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    return m;
  }
  function rod(from, to, r, mat) {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(r, r, len, 8);
    geo.translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    return m;
  }

  /* ---------------- метка «Уровень земли» поверх сцены ---------------- */
  const ANCHOR = {
    ground: new THREE.Vector3(WALL_X0, 0, W / 2 + 0.03)
  };
  const overlay = Array.from(stage.querySelectorAll('[data-anchor]'));
  const tmp = new THREE.Vector3();

  function placeOverlay() {
    for (const el of overlay) {
      const a = ANCHOR[el.dataset.anchor];
      if (!a) continue;
      tmp.copy(a).project(camera);
      const x = (tmp.x + 1) / 2 * view.w;
      const y = (1 - tmp.y) / 2 * view.h;
      el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) ' + (el.dataset.shift || 'translate(-50%,-50%)');
    }
  }

  /* ---------------- управление камерой ---------------- */
  // угол складывается из облёта по прокрутке и поворота рукой
  let userTheta = 0;
  let userPhi = 0;
  let touched = false;
  let R = BASE_R;
  const view = { w: 1, h: 1 };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function touch() {
    if (touched) return;
    touched = true;
    stage.classList.add('is-touched');
  }

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, mouse: e.pointerType === 'mouse' };
    canvas.setPointerCapture(e.pointerId);
    touch();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    userTheta -= dx * 0.0065;
    if (drag.mouse) userPhi -= dy * 0.004;
    requestRender();
  });
  const release = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  stage.addEventListener('keydown', (e) => {
    const step = 8 * DEG;
    const keys = {
      ArrowLeft: () => { userTheta += step; },
      ArrowRight: () => { userTheta -= step; },
      ArrowUp: () => { userPhi -= step / 2; },
      ArrowDown: () => { userPhi += step / 2; }
    };
    if (!keys[e.key]) return;
    e.preventDefault();
    touch();
    keys[e.key]();
    requestRender();
  });

  function updateCamera(p, idle) {
    const base = VIEW.theta + ORBIT * (0.5 - p);
    // поворот рукой держим в пределах, чтобы не уйти под грунт и за стенку
    userTheta = clamp(userTheta, LIMIT.thMin - base, LIMIT.thMax - base);
    const th = base + userTheta + idle;
    const phi = clamp(VIEW.phi - 6 * DEG * (1 - p) + userPhi, LIMIT.phMin, LIMIT.phMax);
    userPhi = phi - (VIEW.phi - 6 * DEG * (1 - p));
    camera.position.set(
      TARGET.x + R * Math.sin(phi) * Math.sin(th),
      TARGET.y + R * Math.cos(phi),
      TARGET.z + R * Math.sin(phi) * Math.cos(th)
    );
    camera.lookAt(TARGET);
  }

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    view.w = w;
    view.h = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // на узком экране отъезжаем меньше, чем требует пропорция: по бокам сцены на десктопе много воздуха
    R = BASE_R * Math.max(1, 0.75 * REF_ASPECT / camera.aspect);
    requestRender();
  }

  /* ---------------- сборка по прокрутке ---------------- */
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const unit = (v) => Math.min(1, Math.max(0, v));

  function applyProgress(p) {
    for (const piece of pieces) {
      const k = unit((p - piece.userData.t) / DROP);
      piece.visible = k > 0;
      piece.position.y = piece.userData.y + (1 - easeOut(k)) * 1.1;
    }
    sand.scale.y = Math.max(0.001, easeOut(unit((p - T.sand) / 0.05)));
    const f = easeInOut(unit((p - T.fill) / FILL));
    soil.scale.y = SOIL_LOW + (1 - SOIL_LOW) * f;
    ground.visible = f >= 1;
    stage.classList.toggle('is-ground', f >= 1);
    // пока идут ряды над землёй, кран подаёт блок; потом блок на стреле не нужен
    crane.userData.hang.visible = p < T.done;
  }

  /* ---------------- цикл отрисовки ---------------- */
  let visible = false;
  let raf = 0;
  let shown = QUIET ? END : 0;     // сглаженная доля: сборка догоняет прокрутку плавно

  function requestRender() {
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;
    const target = QUIET ? END : clamp(window.__wallProgress || 0, 0, 1);
    const gap = target - shown;
    shown += gap * 0.14;
    // после прыжка по якорю не тянем всю сборку заново — догоняем почти сразу
    if (Math.abs(gap) > 0.25) shown = target - Math.sign(gap) * 0.25;
    if (Math.abs(target - shown) < 0.0005) shown = target;
    applyProgress(shown);

    const t = now / 1000;
    const idle = QUIET ? 0 : Math.sin(t * 0.3) * 0.035;
    if (!QUIET) crane.userData.hang.rotation.z = Math.sin(t * 0.9) * 0.02;

    updateCamera(shown, idle);
    renderer.render(scene, camera);
    placeOverlay();

    if (!stage.classList.contains('is-live')) {
      stage.classList.add('is-live');
      if (STILL) document.title = 'READY';
    }
    if (!QUIET) raf = requestAnimationFrame(frame);
  }

  new ResizeObserver(resize).observe(stage);

  new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1].isIntersecting;
    requestRender();
  }).observe(stage);

  resize();
}

/* Шумовая текстура для бетона и грунта, чтобы поверхности не были «пластиковыми» */
function noiseTexture(size, min, max, dots) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = min + Math.random() * (max - min);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < dots; i++) {
    const v = Math.round(min - 30 + Math.random() * 40);
    g.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, 0.6 + Math.random() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
