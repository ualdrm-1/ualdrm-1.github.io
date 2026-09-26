/* ==========================================================================
   Защита от БПЛА — 3D-схема в блоке «Подбор защиты».
   Площадка с выбранным объектом; конструкции появляются по выбору в форме,
   дроны заходят с четырёх направлений: защита останавливает аппарат
   (оранжевая вспышка) или он поражает цель (красная).

   Выбор передаёт main.js: window.__cfg и событие cfg:change
   ({ kind, layers }). Модуль подгружается, когда блок подходит к экрану;
   без WebGL остаётся плоская SVG-схема.
   ========================================================================== */
import * as THREE from './vendor/three.module.min.js';
import * as K from '/assets/js/scene-kit.js?v=40082cd5';

const { V, std, box, plinth, latticeMast, transformer, tank, tent, portal, fbsWall, container, person, truck } = K;
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const OK = 0xff6a1a, BAD = 0xff3b30;

/* ---- Компоновка площадки, м ---- */
const NET = { cx: 3, A: 9, B: 5.5, MH: 10.5, GX: 3.8, GZ: 3.6, SX: 2.2, SY: 1.2 };
const UNIT = V(9, 0, 1.5);           // отдельное оборудование
const OBJ = V(0.5, 0, 0);            // защищаемый объект
const STAFF = V(-16.5, 0, 2.6);      // персонал
const WALL_X = 22.6;                 // периметр: стенки слева и справа
const VIEW = { az: 26, el: 27, fov: 26, margin: 0.02 };

const stage = document.getElementById('cfgStage');
if (stage) {
  try { init(stage); } catch (err) { console.warn('3D-схема подбора недоступна:', err); }
}

function init(stage) {
  const screen = stage.closest('.cfg__screen');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  screen.classList.add('is-3d');      // SVG-схема уходит, место занимает 3D

  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  plinth(root, 48, 27, 2.0, 0.14);

  /* ---------------- слои ---------------- */
  const layers = {};
  const layer = (name) => {
    const g = new THREE.Group();
    g.userData = { k: 0, on: false };
    g.visible = false;
    root.add(g);
    layers[name] = g;
    return g;
  };

  // защищаемый объект по типу площадки
  const scaled = (build, s, x = OBJ.x, z = OBJ.z) => (g) => {
    const w = new THREE.Group();
    w.position.set(x, 0, z);
    w.scale.setScalar(s);
    build(w);
    g.add(w);
  };
  const KINDS = {
    tek: (g) => tank(g, OBJ.x, OBJ.z, 3.6, 4.5),
    energy: (g) => transformer(g, OBJ.x, OBJ.z, 1.3),
    industry: scaled(K.buildTek, 2.2),
    logistics: scaled(K.buildLogistics, 2.2),
    telecom: scaled(K.buildTelecom, 1.45),
    transport: scaled(K.buildTransport, 2.2)
  };
  for (const k in KINDS) KINDS[k](layer('kind-' + k));

  // отдельное оборудование — всегда на площадке
  transformer(root, UNIT.x, UNIT.z, 0.9);

  // персонал; когда есть бункер — люди в укрытии
  const people = layer('people');
  person(people, STAFF.x - 1.2, STAFF.z + 0.4, 0.6);
  person(people, STAFF.x + 0.4, STAFF.z - 0.2, -0.4);
  person(people, STAFF.x + 1.6, STAFF.z + 0.8, 2.2);

  // сетка «палаткой»; опоры — новые мачты или существующие порталы
  const net = layer('net');
  const T = tent(net, { ...NET, posts: false });
  const masts = layer('masts');
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sz]) =>
    latticeMast(masts, NET.cx + sx * NET.A, sz * NET.B, NET.MH, 1.4, 0.45, 0.07, 9));
  const portals = layer('portals');
  [-1, 1].forEach((sx) => portal(portals, NET.cx + sx * NET.A, 0, NET.MH, 2 * NET.B));

  // разборный участок: правый скат свёрнут, в проём въезжает грузовик
  const gate = layer('gate');
  const rollX = NET.cx + NET.A + 0.2;
  const roll = new THREE.CylinderGeometry(0.42, 0.42, 2 * NET.B, 20);
  roll.rotateX(Math.PI / 2);
  K.add(gate, roll, std(0xc2450a, 0.6, 0.2, { emissive: OK, emissiveIntensity: 0.25 }), rollX, T.roofY(1, 0) - 0.3, 0);
  const bollard = new THREE.CylinderGeometry(0.16, 0.16, 1.1, 12);
  for (const sz of [-1, 1]) {
    K.add(gate, bollard, K.accentMat, NET.cx + NET.A + NET.GX, 0.55, sz * (NET.B - 0.6));
  }
  truck(gate, NET.cx + NET.A + 3.2, 0.4, Math.PI);

  // навес над отдельным оборудованием
  const roofL = layer('roof');
  const canopy = new THREE.Group();
  canopy.position.copy(UNIT);
  canopy.scale.set(0.62, 1.05, 0.72);
  K.buildFrame(canopy, false);
  roofL.add(canopy);

  // периметр: блоки ФБС или морские контейнеры
  const blocks = layer('blocks');
  for (const sx of [-1, 1]) fbsWall(blocks, sx * WALL_X, -6.5, 7, 4);
  const conts = layer('containers');
  const CL = K.CONT.L + 0.2;
  for (const sx of [-1, 1]) {
    const cols = sx < 0 ? [0x9a5130, 0x66625d, 0x7a746c] : [0x7a746c, 0x9a5130, 0x66625d];
    [-3.3, -3.3 + CL, -3.3 + 2 * CL].forEach((z, i) => container(conts, sx * WALL_X, 0, z, cols[i], Math.PI / 2));
    container(conts, sx * WALL_X, K.CONT.H + 0.02, -3.3 + CL / 2, sx < 0 ? 0xd9591c : 0x6f6a64, Math.PI / 2);
    container(conts, sx * WALL_X, K.CONT.H + 0.02, -3.3 + 1.5 * CL, 0x6f6a64, Math.PI / 2);
  }

  // бункер-укрытие
  const bunker = layer('bunker');
  const bw = new THREE.Group();
  bw.position.set(STAFF.x, 0, STAFF.z - 1.6);
  bw.scale.setScalar(0.85);
  K.buildBunker(bw);
  bunker.add(bw);

  /* ---------------- угрозы ---------------- */
  const uavProto = new THREE.Group();
  K.buildUav(uavProto);
  uavProto.scale.setScalar(2.4);
  uavProto.traverse((o) => { o.castShadow = false; });

  const flashGeo = new THREE.TorusGeometry(1, 0.07, 8, 48);
  const coreGeo = new THREE.SphereGeometry(0.7, 16, 12);
  const threats = [0, 1, 2, 3].map(() => {
    const g = new THREE.Group();
    scene.add(g);
    const uav = uavProto.clone();
    g.add(uav);
    const lineMat = new THREE.LineDashedMaterial({ color: OK, dashSize: 0.7, gapSize: 0.55, transparent: true, opacity: 0.55 });
    const line = new THREE.Line(new THREE.BufferGeometry(), lineMat);
    g.add(line);
    const ringMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
    const ring = new THREE.Mesh(flashGeo, ringMat);
    const coreMat = new THREE.MeshBasicMaterial({ color: OK, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    const core = new THREE.Mesh(coreGeo, coreMat);
    ring.renderOrder = core.renderOrder = 10;   // вспышку видно и за объектом
    g.add(ring, core);
    return { g, uav, line, ring, core, curve: null, ok: true };
  });

  // Откуда заходит аппарат и где его останавливает защита — как в SVG-схеме
  function threatPaths(L) {
    const lineAt = (a, b, x) => a.clone().lerp(b, (a.x - x) / (a.x - b.x));
    const res = [];
    // 1. сверху на объект
    {
      const from = V(28, 26, -14), to = V(OBJ.x, 4.2, OBJ.z);
      const u = (OBJ.x - NET.cx) / NET.A, v = OBJ.z / NET.B;
      res.push(L.net ? { from, to: T.R(u, v), ok: true } : { from, to, ok: false });
    }
    // 2. на отдельное оборудование
    {
      const from = V(32, 17, 13), to = V(UNIT.x, 3.2, UNIT.z);
      if (L.net) res.push({ from, to: T.R((UNIT.x - NET.cx) / NET.A, UNIT.z / NET.B), ok: true });
      else if (L.roof) res.push({ from, to: V(UNIT.x, 5.9, UNIT.z), ok: true });
      else res.push({ from, to, ok: false });
    }
    // 3. низко над землёй через периметр
    {
      const from = V(40, 2.4, 13), to = V(OBJ.x + 2, 1.8, 2.4);
      res.push(L.blocks || L.containers ? { from, to: lineAt(from, to, WALL_X + 1.3), ok: true, low: true } : { from, to, ok: false, low: true });
    }
    // 4. по персоналу
    {
      const from = V(-36, 22, -12), to = V(STAFF.x, 1.3, STAFF.z);
      res.push(L.bunker ? { from, to: V(STAFF.x, 3.6, STAFF.z - 1.6), ok: true } : { from, to, ok: false });
    }
    return res;
  }

  function setThreats(L) {
    threatPaths(L).forEach((p, i) => {
      const t = threats[i];
      const mid = p.from.clone().lerp(p.to, 0.5);
      mid.y += p.low ? 0.6 : 5;
      t.curve = new THREE.QuadraticBezierCurve3(p.from, mid, p.to);
      t.ok = p.ok;
      const col = p.ok ? OK : BAD;
      t.line.geometry.dispose();
      t.line.geometry = new THREE.BufferGeometry().setFromPoints(t.curve.getPoints(60));
      t.line.computeLineDistances();
      t.line.material.color.setHex(col);
      t.ring.material.color.setHex(col);
      t.core.material.color.setHex(col);
      t.ring.position.copy(p.to);
      t.core.position.copy(p.to);
    });
  }

  /* ---------------- состояние из формы ---------------- */
  function apply(state) {
    if (!state) return;
    const L = state.layers || {};
    const want = {
      net: L.net, masts: L.masts, portals: L.portals, gate: L.gate, roof: L.roof,
      blocks: L.blocks, containers: L.containers, bunker: L.bunker, people: !L.bunker
    };
    for (const k in KINDS) want['kind-' + k] = state.kind === k;
    for (const name in layers) layers[name].userData.on = !!want[name];
    T.right.forEach((m) => { m.visible = !L.gate; });
    setThreats(L);
    if (REDUCED) for (const name in layers) layers[name].userData.k = want[name] ? 1 : 0;
    wake();
  }

  /* ---------------- свет и камера ---------------- */
  const bbox = new THREE.Box3().setFromObject(root);
  bbox.max.y = Math.max(bbox.max.y, NET.MH + 1);
  K.addLights(scene, bbox, 2048);
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 16 / 9, 0.5, 400);
  let rig = null;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    rig = K.fitCamera(camera, bbox, VIEW, w / h);
    wake();
  }

  // лёгкий поворот площадки за указателем
  let px = 0, py = 0, tx = 0, ty = 0;
  if (!REDUCED) {
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
      wake();
    });
    stage.addEventListener('pointerleave', () => { tx = 0; ty = 0; wake(); });
  }

  function placeCamera() {
    if (!rig) return;
    const az = (VIEW.az + px * 5) * K.DEG, el = (VIEW.el - py * 3) * K.DEG;
    const dir = V(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.position.copy(rig.target).addScaledVector(dir, rig.r);
    camera.lookAt(rig.target);
  }

  /* ---------------- анимация ---------------- */
  const CYCLE = 4.4, FLY = 2.7, FLASH = 1.0;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  const tan = new THREE.Vector3();
  let visible = false, raf = 0, last = 0, idleUntil = 0;

  function wake() {
    idleUntil = performance.now() + 1500;
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = 0;
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    let moving = false;

    for (const name in layers) {
      const g = layers[name], u = g.userData;
      const goal = u.on ? 1 : 0;
      if (u.k !== goal) {
        u.k = goal > u.k ? Math.min(1, u.k + dt * 1.6) : Math.max(0, u.k - dt * 2.6);
        moving = true;
      }
      g.visible = u.k > 0.001;
      const e = ease(u.k);
      g.position.y = (1 - e) * (u.on ? 9 : 2);
      g.scale.y = u.on ? 1 : Math.max(0.001, e);
    }

    px += (tx - px) * 0.08;
    py += (ty - py) * 0.08;
    if (Math.abs(tx - px) + Math.abs(ty - py) > 0.002) moving = true;
    placeCamera();

    const time = now / 1000;
    threats.forEach((t, i) => {
      if (!t.curve) return;
      if (REDUCED) {
        t.uav.position.copy(t.curve.getPoint(0.72));
        t.ring.material.opacity = t.core.material.opacity = 0;
        return;
      }
      const c = (time + i * 1.1) % CYCLE;
      if (c < FLY) {
        const p = c / FLY;
        t.uav.visible = true;
        t.curve.getPoint(p, t.uav.position);
        t.curve.getTangent(p, tan);
        t.uav.rotation.set(0, Math.atan2(-tan.z, tan.x), Math.asin(Math.max(-1, Math.min(1, tan.y))) * 0.6);
        t.ring.material.opacity = t.core.material.opacity = 0;
      } else {
        t.uav.visible = false;
        const f = Math.min(1, (c - FLY) / FLASH);
        const s = 0.4 + ease(f) * 3.2;
        t.ring.scale.setScalar(s);
        t.ring.lookAt(camera.position);
        t.ring.material.opacity = (1 - f) * 0.95;
        t.core.scale.setScalar(0.6 + f * 1.4);
        t.core.material.opacity = (1 - f) * 0.8;
      }
    });

    renderer.render(scene, camera);
    if (visible && (!REDUCED || moving || now < idleUntil)) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible) wake();
  }, { rootMargin: '100px 0px' }).observe(stage);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  document.addEventListener('cfg:change', (e) => apply(e.detail));

  apply(window.__cfg);
  for (const name in layers) layers[name].userData.k = layers[name].userData.on ? 1 : 0;
  resize();
}
