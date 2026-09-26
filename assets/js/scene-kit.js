/* ==========================================================================
   Защита от БПЛА — общий набор 3D-моделей: площадка со срезом грунта,
   мачты, сетка «палаткой», резервуар, трансформатор, стенки из блоков
   и контейнеров, бункер, навес, дрон, объекты отраслей.
   Им пользуются живая схема подбора защиты (cfg3d.js) и рендер
   картинок для блоков «Решения» и «Объекты» (tools/sol-render.js).
   ========================================================================== */
import * as THREE from './vendor/three.module.min.js';

export const DEG = Math.PI / 180;
export const COL = {
  concrete: 0xb9b3ad, concreteEdge: 0x6d655e,
  dark: 0x1e1c1b, darkEdge: 0x6a5446,
  surface: 0x2b2927, soilEdge: 0x4a3526,
  accent: 0xff6a1a,
  steel: 0x3a3632, steel2: 0x4a4540, black: 0x161413,
  tank: 0x6a706d, tankLight: 0x8b908c, porcelain: 0x6e3a1f, alu: 0x9aa0a4,
  glass: 0x1f2a30, timber: 0x5a4533
};
export const SOIL_LAYERS = [[0.12, 0x3a2c22], [0.27, 0x4a3727], [0.3, 0x5a432e], [0.31, 0x6a5037]];

/* ---------------- текстуры ---------------- */
export function noiseTexture(size, min, max, dots) {
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
export const concreteTex = noiseTexture(128, 200, 255, 60);
export const soilTex = noiseTexture(256, 170, 255, 480);
export const rep = (tex, x, y) => { const t = tex.clone(); t.repeat.set(x, y); t.needsUpdate = true; return t; };

// Сетка двойного кручения — тот же рисунок, что у SVG-паттерна #hexmesh
export function meshTexture() {
  const c = document.createElement('canvas');
  c.width = 224; c.height = 400;
  const g = c.getContext('2d');
  g.scale(4, 4);
  g.strokeStyle = '#fff';
  g.lineWidth = 3.4;
  g.lineJoin = 'round';
  g.stroke(new Path2D('M28 66 0 50V16L28 0l28 16v34L28 66v34'));
  g.stroke(new Path2D('M28 0v34L0 50v34l28 16 28-16V50L28 34'));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
export function netMat(sx, sz, cell = 0.9) {
  const tex = meshTexture();
  tex.repeat.set(sx / cell, sz / (cell * 100 / 56));
  return new THREE.MeshStandardMaterial({
    color: 0xff8a3d, map: tex, emissive: 0xff5a14, emissiveMap: tex, emissiveIntensity: 0.55,
    transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.3
  });
}

// Гофра морского контейнера
export function corrugTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 4;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 64, 0);
  [[0, 150], [0.18, 255], [0.42, 235], [0.58, 120], [0.82, 90], [1, 150]].forEach(([p, v]) =>
    grd.addColorStop(p, 'rgb(' + v + ',' + v + ',' + v + ')'));
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function textTexture(text, color, w = 512, h = 128) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  g.font = '700 ' + Math.round(h * 0.62) + 'px "JetBrains Mono", Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------------- материалы и примитивы ---------------- */
export const std = (color, roughness = 0.8, metalness = 0, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
export const concreteMat = (color = COL.concrete, rx = 1, ry = 1) => std(color, 0.92, 0, {
  map: rep(concreteTex, rx, ry), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1
});
export const accentMat = std(COL.accent, 0.55, 0.1, { emissive: COL.accent, emissiveIntensity: 0.35 });
export const glowMat = new THREE.MeshBasicMaterial({ color: COL.accent });

export function add(parent, geo, mat, x = 0, y = 0, z = 0, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function box(parent, sx, sy, sz, mat, x, y, z, edge) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  const m = add(parent, g, mat, x, y, z);
  if (edge != null) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: edge })));
  return m;
}
export const Y = new THREE.Vector3(0, 1, 0);
export function orient(m, a, b) {
  const d = new THREE.Vector3().subVectors(b, a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(Y, d.normalize());
  return m;
}
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export function rod(parent, a, b, r, mat, seg = 8) {
  const m = add(parent, new THREE.CylinderGeometry(r, r, a.distanceTo(b), seg), mat);
  return orient(m, a, b);
}
export function beam(parent, a, b, w, mat, h = w) {
  const m = add(parent, new THREE.BoxGeometry(w, a.distanceTo(b), h), mat);
  return orient(m, a, b);
}
export function wire(parent, pts, color = 0x2a2522) {
  parent.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color })));
}

/* Площадка: срез грунта слоями, верх — тёмная планировка,
   видимые верхние кромки (+z и +x) подсвечены оранжевым */
export function plinth(parent, sx, sz, depth, edge = 0.06) {
  const g = new THREE.Group();
  const top = std(COL.surface, 1, 0, { map: rep(soilTex, sx / 6, sz / 6) });
  let y = -depth;
  for (let i = SOIL_LAYERS.length - 1; i >= 0; i--) {
    const [f, color] = SOIL_LAYERS[i];
    const t = f * depth;
    const side = std(color, 1, 0, { map: rep(soilTex, sx / 3, t) });
    const mats = i === 0 ? [side, side, top, side, side, side] : side;
    const m = add(g, new THREE.BoxGeometry(sx, t, sz), mats, 0, y + t / 2, 0, false);
    m.receiveShadow = true;
    y += t;
  }
  const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, depth, sz)),
    new THREE.LineBasicMaterial({ color: COL.soilEdge }));
  outline.position.y = -depth / 2;
  g.add(outline);
  add(g, new THREE.BoxGeometry(sx + edge, edge, edge), glowMat, 0, 0, sz / 2 + edge / 2 - 0.004, false);
  add(g, new THREE.BoxGeometry(edge, edge, sz + edge), glowMat, sx / 2 + edge / 2 - 0.004, 0, 0, false);
  parent.add(g);
  return g;
}

/* Решётчатая мачта: четыре пояса, раскосы, огонь светоограждения */
export function latticeMast(parent, x, z, h, base, top, r = 0.07, levels = 8) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const mat = std(0x6a625b, 0.5, 0.5);
  const at = (i, sx, sz) => {
    const t = i / levels, w = (base + (top - base) * t) / 2;
    return V(sx * w, t * h, sz * w);
  };
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  corners.forEach(([sx, sz]) => rod(g, at(0, sx, sz), at(levels, sx, sz), r, mat, 6));
  for (let i = 0; i < levels; i++) {
    for (let c = 0; c < 4; c++) {
      const [ax, az] = corners[c], [bx, bz] = corners[(c + 1) % 4];
      const lo = i % 2 ? at(i, ax, az) : at(i, bx, bz);
      const hi = i % 2 ? at(i + 1, bx, bz) : at(i + 1, ax, az);
      rod(g, lo, hi, r * 0.5, mat, 5);
      rod(g, at(i + 1, ax, az), at(i + 1, bx, bz), r * 0.5, mat, 5);
    }
  }
  box(g, top * 1.4, 0.2, top * 1.4, std(COL.black, 0.6), 0, h + 0.1, 0);
  add(g, new THREE.SphereGeometry(r * 2.4, 16, 12), glowMat, 0, h + 0.35, 0, false);
  add(g, new THREE.BoxGeometry(base * 1.3, 0.3, base * 1.3), concreteMat(0x7a746c), 0, 0.15, 0);
  parent.add(g);
  return g;
}

/* Трансформатор / реактор с радиаторами и вводами */
export function transformer(parent, x, z, s = 1, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  g.scale.setScalar(s);
  const tank = std(COL.tank, 0.55, 0.25), dark = std(COL.black, 0.6);
  const porcelain = std(COL.porcelain, 0.35, 0.05), alu = std(COL.alu, 0.4, 0.4);
  box(g, 4.4, 0.16, 3.3, concreteMat(0x5a5550), 0, 0.08, 0);
  for (const zz of [-0.5, 0.5]) box(g, 3.0, 0.22, 0.22, dark, 0, 0.27, zz);
  const TOP = 2.5;
  box(g, 3.0, 2.1, 1.6, tank, 0, 1.45, 0);
  box(g, 3.14, 0.12, 1.74, tank, 0, TOP + 0.06, 0);
  const fin = new THREE.BoxGeometry(0.04, 1.5, 0.46);
  for (const sd of [-1, 1]) for (const bx of [-0.75, 0.75]) {
    for (let i = 0; i < 8; i++) add(g, fin, tank, bx - 0.42 + i * 0.12, 1.45, sd * 1.16);
    box(g, 1.0, 0.09, 0.09, dark, bx, 2.24, sd * 0.86);
    box(g, 1.0, 0.09, 0.09, dark, bx, 0.66, sd * 0.86);
  }
  const bushing = (bx, bz, h) => {
    add(g, new THREE.CylinderGeometry(0.2, 0.24, 0.2, 18), alu, bx, TOP + 0.22, bz);
    add(g, new THREE.CylinderGeometry(0.08, 0.08, h, 12), porcelain, bx, TOP + 0.3 + h / 2, bz);
    const shed = new THREE.CylinderGeometry(0.19, 0.19, 0.035, 18);
    for (let yy = 0.1; yy < h - 0.05; yy += 0.13) add(g, shed, porcelain, bx, TOP + 0.3 + yy, bz);
    add(g, new THREE.CylinderGeometry(0.1, 0.1, 0.14, 12), alu, bx, TOP + 0.37 + h, bz);
  };
  bushing(-0.9, 0.2, 1.5);
  bushing(0, 0.2, 1.5);
  bushing(0.9, 0.2, 1.5);
  const cons = new THREE.CylinderGeometry(0.3, 0.3, 1.9, 20);
  cons.rotateZ(Math.PI / 2);
  add(g, cons, tank, 0.35, TOP + 1.0, -0.55);
  for (const bx of [-0.35, 1.05]) box(g, 0.08, 0.72, 0.08, dark, bx, TOP + 0.48, -0.55);
  parent.add(g);
  return g;
}

/* Вертикальный резервуар: пояса, крыша, винтовая лестница, ограждение */
export function tank(parent, x, z, R, h, mat) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const shell = mat || std(COL.tankLight, 0.45, 0.35);
  const dark = std(COL.steel, 0.6, 0.4);
  add(g, new THREE.CylinderGeometry(R, R, h, 64), shell, 0, h / 2, 0);
  add(g, new THREE.CylinderGeometry(R + 0.2, R + 0.25, 0.25, 64), concreteMat(0x7a746c), 0, 0.12, 0);
  for (let i = 1; i < 4; i++) {
    const ring = new THREE.TorusGeometry(R + 0.02, 0.04, 6, 72);
    ring.rotateX(Math.PI / 2);
    add(g, ring, dark, 0, (h * i) / 4, 0, false);
  }
  add(g, new THREE.ConeGeometry(R + 0.05, R * 0.16, 64), shell, 0, h + R * 0.08, 0);
  // ограждение по краю крыши
  const rail = new THREE.TorusGeometry(R - 0.05, 0.035, 6, 72);
  rail.rotateX(Math.PI / 2);
  add(g, rail, dark, 0, h + 0.75, 0, false);
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    rod(g, V(Math.cos(t) * (R - 0.05), h, Math.sin(t) * (R - 0.05)), V(Math.cos(t) * (R - 0.05), h + 0.75, Math.sin(t) * (R - 0.05)), 0.025, dark, 4);
  }
  // винтовая лестница по стенке
  const a0 = 0.15 * Math.PI, a1 = a0 + 0.62 * Math.PI, rr = R + 0.45;
  const steps = 26;
  const helix = [];
  for (let i = 0; i <= steps; i++) {
    const t = a0 + ((a1 - a0) * i) / steps, yy = (h * i) / steps;
    helix.push(V(Math.cos(t) * (rr + 0.35), yy + 0.9, Math.sin(t) * (rr + 0.35)));
    if (i < steps) {
      const st = add(g, new THREE.BoxGeometry(0.7, 0.06, 0.3), dark, Math.cos(t) * rr, yy + 0.1, Math.sin(t) * rr);
      st.rotation.y = -t;
    }
  }
  add(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 60, 0.03, 6), dark, 0, 0, 0, false);
  parent.add(g);
  return g;
}

/* ---------------- конструкции и объекты ---------------- */
/* 02 — Противоосколочная стенка из блоков ФБС вокруг трансформатора */
export function buildBlocks(root) {
  const BH = 0.58, J = 0.02, BW = 0.6, L = 2.38, HL = 1.18, STEP = BH + J;
  const mat = concreteMat(COL.concrete);
  const blk = (len, x, y, z, alongX) =>
    box(root, alongX ? len : BW, BH, alongX ? BW : len, mat, x, y + BH / 2, z, COL.concreteEdge);
  const run = (x0, z0, pattern, y, alongX, skip = -1) => {
    let s = 0;
    pattern.forEach((len, i) => {
      if (i !== skip) {
        const c = s + len / 2;
        blk(len, alongX ? x0 + c : x0, y, alongX ? z0 : z0 + c, alongX);
      }
      s += len + J;
    });
  };
  const back = { A: [L, L, L, L], B: [HL, L, L, L, HL] };
  const side = { A: [L, L], B: [HL, L, HL] };
  const WL = 4 * L + 3 * J;
  const COURSES = 5;
  box(root, WL + 0.4, 0.12, 0.9, concreteMat(0x5a5550), 0, 0.06, -3.1);
  for (let k = 0; k < COURSES; k++) {
    const y = 0.12 + k * STEP;
    const p = k % 2 ? 'B' : 'A';
    run(-WL / 2, -3.1, back[p], y, true, k === COURSES - 1 ? 2 : -1);
    run(-WL / 2 + BW / 2, -3.1 + BW / 2 + J, side[p], y, false);
    run(WL / 2 - BW / 2, -3.1 + BW / 2 + J, side[p], y, false);
  }
  // последний блок опускается краном на место
  const slotX = -WL / 2 + 2 * (L + J) + L / 2;
  const ghostY = 0.12 + (COURSES - 1) * STEP + 1.6;
  const gb = box(root, L, BH, BW, std(COL.accent, 0.6, 0, { transparent: true, opacity: 0.35, emissive: COL.accent, emissiveIntensity: 0.5, depthWrite: false }), slotX, ghostY + BH / 2, -3.1);
  gb.castShadow = false;
  gb.add(new THREE.LineSegments(new THREE.EdgesGeometry(gb.geometry), new THREE.LineBasicMaterial({ color: 0xffb27a })));
  const rope = std(COL.black, 0.6);
  const hook = V(slotX, ghostY + BH + 1.1, -3.1);
  rod(root, hook, V(slotX, ghostY + BH + 2.0, -3.1), 0.03, rope, 4);
  box(root, 0.22, 0.26, 0.22, std(COL.accent, 0.5), hook.x, hook.y, hook.z);
  rod(root, hook, V(slotX - 0.85, ghostY + BH, -3.1), 0.02, rope, 4);
  rod(root, hook, V(slotX + 0.85, ghostY + BH, -3.1), 0.02, rope, 4);

  transformer(root, 0, -0.1, 0.95);
  // штабель блоков на площадке
  const timber = std(COL.timber, 0.9);
  for (const x of [4.1, 5.7]) box(root, 0.1, 0.1, 2.2, timber, x, 0.05, 3.2);
  [2.55, 3.2, 3.85].forEach((z) => blk(L, 5.9 - L / 2, 0.1, z, true));
}

/* 03 — Железобетонный модульный бункер */
export function buildBunker(root) {
  box(root, 10, 0.3, 5.2, concreteMat(0x6e6862, 3, 2), 0, 0.15, 0, 0x4a4540);
  const MW = 2.7, MH = 2.9, MD = 3.6, y0 = 0.3;
  const mat = concreteMat(0xa9a39c, 2, 2);
  [-1, 0, 1].forEach((i) => box(root, MW - 0.03, MH, MD, mat, i * MW, y0 + MH / 2, 0, COL.concreteEdge));
  const zf = MD / 2;
  // дверь в стальной раме
  box(root, 1.2, 2.1, 0.08, accentMat, -MW - 0.35, y0 + 1.05, zf + 0.04);
  box(root, 1.0, 1.95, 0.1, std(0x3a322b, 0.45, 0.6), -MW - 0.35, y0 + 1.0, zf + 0.06);
  box(root, 0.08, 0.3, 0.08, std(COL.alu, 0.3, 0.8), -MW + 0.05, y0 + 1.0, zf + 0.14);
  for (const yy of [0.35, 1.65]) box(root, 0.16, 0.08, 0.06, std(COL.black), -MW - 0.82, y0 + yy, zf + 0.12);
  // надпись
  const label = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.575),
    new THREE.MeshStandardMaterial({ map: textTexture('УКРЫТИЕ', '#ff8a3d'), transparent: true, emissive: 0xff6a1a, emissiveIntensity: 0.25, emissiveMap: textTexture('УКРЫТИЕ', '#ff8a3d') }));
  label.position.set(0, y0 + 1.7, zf + 0.01);
  root.add(label);
  // вентрешётка
  box(root, 1.4, 0.7, 0.06, std(COL.steel, 0.5, 0.5), MW, y0 + 1.9, zf + 0.03);
  for (let i = 0; i < 5; i++) box(root, 1.3, 0.05, 0.08, std(0x5a5550, 0.5, 0.5), MW, y0 + 1.63 + i * 0.13, zf + 0.07);
  // приямок у двери и ступени
  box(root, 1.6, 0.15, 0.9, concreteMat(0x8a847e), -MW - 0.35, 0.3 + 0.075, zf + 0.45);
  // крыша: вентиляционные трубы с грибками, монтажные петли
  const roofY = y0 + MH;
  [[-MW, -0.6], [MW, 0.7]].forEach(([x, z]) => {
    add(root, new THREE.CylinderGeometry(0.16, 0.16, 1.1, 20), std(COL.steel2, 0.45, 0.6), x, roofY + 0.55, z);
    add(root, new THREE.ConeGeometry(0.42, 0.3, 24), std(COL.steel, 0.5, 0.5), x, roofY + 1.3, z);
    add(root, new THREE.CylinderGeometry(0.2, 0.2, 0.08, 20), accentMat, x, roofY + 1.12, z);
  });
  const loop = new THREE.TorusGeometry(0.16, 0.035, 8, 16, Math.PI);
  [-1, 0, 1].forEach((i) => [-1, 1].forEach((sz) => {
    add(root, loop, std(COL.alu, 0.4, 0.7), i * MW + sz * 0.7, roofY, sz * 1.1);
  }));
  // мешки с песком у входа
  const bag = new THREE.CapsuleGeometry(0.2, 0.45, 4, 10);
  bag.rotateZ(Math.PI / 2);
  bag.scale(1, 0.55, 1);
  const bagMat = std(0x6b5a44, 1);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 4 - r; i++) {
    add(root, bag, bagMat, -MW - 2.4 + i * 0.72 + r * 0.36, 0.42 + r * 0.22, zf + 0.9);
  }
}

/* Морской контейнер 20 футов: гофра, фитинги, запорные штанги на торце +x */
export const CONT = { L: 6.06, H: 2.59, W: 2.44 };
const corr = corrugTexture();
export function container(root, x, y, z, color, rotY = 0) {
  const L = CONT.L, CH = CONT.H, CW = CONT.W;
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  const side = std(color, 0.7, 0.35, { map: rep(corr, L / 0.28, 1), bumpMap: rep(corr, L / 0.28, 1), bumpScale: 3 });
  const end = std(color, 0.7, 0.35, { map: rep(corr, CW / 0.28, 1), bumpMap: rep(corr, CW / 0.28, 1), bumpScale: 3 });
  const topM = std(color, 0.8, 0.3);
  const m = add(g, new THREE.BoxGeometry(L, CH, CW), [end, end, topM, topM, side, side], 0, CH / 2, 0);
  m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x1a1512 })));
  const frame = std(new THREE.Color(color).multiplyScalar(0.55).getHex(), 0.6, 0.4);
  for (const sy of [0.06, CH - 0.06]) for (const sz of [-1, 1]) box(g, L, 0.12, 0.1, frame, 0, sy, sz * (CW / 2 - 0.02));
  const cast = std(0x1f1b18, 0.5, 0.5);
  for (const sx of [-1, 1]) for (const sy of [0.09, CH - 0.09]) for (const sz of [-1, 1])
    box(g, 0.18, 0.18, 0.18, cast, sx * (L / 2 - 0.07), sy, sz * (CW / 2 - 0.07));
  // двери и запорные штанги на торце +x
  const bar = std(0x2a2522, 0.4, 0.7);
  for (const zz of [-0.85, -0.35, 0.35, 0.85]) rod(g, V(L / 2 + 0.06, 0.2, zz), V(L / 2 + 0.06, CH - 0.2, zz), 0.035, bar, 6);
  box(g, 0.03, CH - 0.2, 0.03, std(0x1a1512), L / 2 + 0.02, CH / 2, 0);
  root.add(g);
  return g;
}

/* 04 — Стенка из морских контейнеров в два яруса */
export function buildContainers(root) {
  const L = CONT.L, CH = CONT.H, gap = 0.2;
  const bottom = [[-(L + gap), 0x66625d], [0, 0x9a5130], [L + gap, 0x7a746c]];
  bottom.forEach(([x, c]) => container(root, x, 0, 0, c));
  container(root, -(L + gap) / 2, CH + 0.02, 0, 0xd9591c);
  container(root, (L + gap) / 2, CH + 0.02, 0, 0x6f6a64);
  // защищаемое оборудование за стенкой
  transformer(root, -3.5, -4.0, 0.8);
  box(root, 2.2, 2.4, 2.0, std(0x4f5a55, 0.6, 0.3), 4.5, 1.2, -4.0, 0x2a2522);
}

/* 05 — Стальной каркас-навес с сетчатой кровлей */
export function buildFrame(root, withUnit = true) {
  const xs = [-6, -2, 2, 6], zs = [-2.7, 2.7], CH = 5;
  const steel = std(0x3e3a36, 0.5, 0.55);
  const light = std(0x57524d, 0.5, 0.5);
  xs.forEach((x) => zs.forEach((z) => {
    box(root, 0.7, 0.3, 0.7, concreteMat(0x7a746c), x, 0.15, z);
    box(root, 0.5, 0.04, 0.5, std(COL.black, 0.5, 0.6), x, 0.32, z);
    box(root, 0.3, CH - 0.3, 0.3, steel, x, 0.3 + (CH - 0.3) / 2, z);
  }));
  zs.forEach((z) => {
    box(root, 12.6, 0.4, 0.26, steel, 0, CH + 0.2, z);
    box(root, 12, 0.14, 0.14, light, 0, CH - 0.7, z);
    // решётчатый пояс фермы
    for (let i = 0; i < 24; i++) {
      const x0 = -6 + i * 0.5;
      rod(root, V(x0, i % 2 ? CH : CH - 0.7, z), V(x0 + 0.5, i % 2 ? CH - 0.7 : CH, z), 0.035, light, 5);
    }
  });
  xs.forEach((x) => box(root, 0.24, 0.34, 5.8, steel, x, CH + 0.2, 0));
  for (let x = -5; x <= 5; x += 2) box(root, 0.1, 0.12, 5.6, light, x, CH + 0.36, 0);
  // связи по торцам и задней линии
  [[-6, -2, -2.7], [2, 6, -2.7]].forEach(([a, b, z]) => {
    rod(root, V(a, 0.35, z), V(b, CH - 0.7, z), 0.05, light, 6);
    rod(root, V(b, 0.35, z), V(a, CH - 0.7, z), 0.05, light, 6);
  });
  [-6, 6].forEach((x) => {
    rod(root, V(x, 0.35, -2.7), V(x, CH - 0.7, 2.7), 0.05, light, 6);
    rod(root, V(x, 0.35, 2.7), V(x, CH - 0.7, -2.7), 0.05, light, 6);
  });
  // сетчатая кровля и кромка
  const roof = new THREE.PlaneGeometry(12.8, 6.2);
  roof.rotateX(-Math.PI / 2);
  add(root, roof, netMat(12.8, 6.2, 0.55), 0, CH + 0.46, 0);
  add(root, roof, new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }), 0, CH + 0.45, 0, false);
  [[12.8, 0.08, 0, 3.1], [12.8, 0.08, 0, -3.1]].forEach(([l, w, x, z]) => box(root, l, w, w, accentMat, x, CH + 0.46, z));
  [-6.4, 6.4].forEach((x) => box(root, 0.08, 0.08, 6.2, accentMat, x, CH + 0.46, 0));
  // под навесом — трансформатор и шкаф
  if (!withUnit) return;
  transformer(root, -1.2, 0, 0.9);
  box(root, 1.2, 1.9, 0.7, std(0x5f6560, 0.5, 0.3), 3.8, 0.95, -1.2, 0x2a2522);
  box(root, 1.2, 0.08, 0.72, accentMat, 3.8, 1.5, -1.2);
}

/* Дрон — спрайт для анимации поверх картинки с сеткой */
export function buildUav(root) {
  const body = std(0x2a2724, 0.45, 0.5), arm = std(0x3a3632, 0.5, 0.5);
  const red = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
  box(root, 0.7, 0.2, 0.34, body, 0, 0, 0);
  box(root, 0.4, 0.12, 0.28, std(0x3d3935, 0.4, 0.5), 0.05, 0.14, 0);
  add(root, new THREE.CylinderGeometry(0.08, 0.1, 0.22, 12), std(0x1a1816, 0.5), 0, -0.2, 0);
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(([sx, sz]) => {
    const tip = V(sx * 0.62, 0.02, sz * 0.62);
    beam(root, V(0, 0, 0), tip, 0.06, arm);
    add(root, new THREE.CylinderGeometry(0.07, 0.07, 0.14, 12), body, tip.x, 0.08, tip.z);
    const d = add(root, new THREE.CylinderGeometry(0.28, 0.28, 0.01, 32), new THREE.MeshStandardMaterial({ color: 0xb7aca2, transparent: true, opacity: 0.3, depthWrite: false }), tip.x, 0.16, tip.z, false);
    d.renderOrder = 2;
    add(root, new THREE.SphereGeometry(0.04, 10, 8), red, tip.x, -0.02, tip.z, false);
  });
  add(root, new THREE.SphereGeometry(0.06, 12, 10), red, 0.36, 0.02, 0, false);
}

export function buildTek(root) {
  const shell = std(COL.tankLight, 0.45, 0.35);
  add(root, new THREE.CylinderGeometry(0.42, 0.42, 3.8, 32), shell, -0.9, 1.9, -0.8);
  add(root, new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), shell, -0.9, 3.8, -0.8);
  [1.1, 2.1, 3.1].forEach((y) => add(root, new THREE.CylinderGeometry(0.62, 0.62, 0.07, 32), accentMat, -0.9, y, -0.8));
  add(root, new THREE.CylinderGeometry(1.0, 1.0, 1.2, 40), shell, 0.8, 0.6, 0.7);
  add(root, new THREE.ConeGeometry(1.02, 0.2, 40), shell, 0.8, 1.3, 0.7);
  add(root, new THREE.CylinderGeometry(0.55, 0.55, 0.9, 32), std(0x7c817e, 0.5, 0.3), 1.2, 0.45, -1.3);
  rod(root, V(-0.5, 0.5, -0.8), V(0.8, 0.5, -0.8), 0.07, std(COL.steel2, 0.5, 0.5));
  rod(root, V(0.8, 0.5, -0.8), V(0.8, 0.5, -0.3), 0.07, std(COL.steel2, 0.5, 0.5));
}

export function buildEnergy(root) {
  transformer(root, 0, 0, 0.78, 0.0);
}

export function buildIndustry(root) {
  const wall = concreteMat(0x8a847e, 2, 1);
  box(root, 3.4, 1.4, 2.4, wall, -0.1, 0.7, 0.2, COL.concreteEdge);
  const roofM = std(0x4a4540, 0.7, 0.3);
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Shape();
    s.moveTo(0, 0); s.lineTo(1.133, 0); s.lineTo(1.133, 0.6); s.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: 2.4, bevelEnabled: false });
    const m = add(root, g, roofM, -1.8 + i * 1.133, 1.4, -1.0);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x2a2522 })));
    const glass = add(root, new THREE.PlaneGeometry(0.6, 2.3), std(COL.accent, 0.4, 0, { emissive: COL.accent, emissiveIntensity: 0.6 }), -1.8 + (i + 1) * 1.133 - 0.02, 1.7, 0.2, false);
    glass.rotation.y = -Math.PI / 2;
  }
  add(root, new THREE.CylinderGeometry(0.22, 0.28, 3.8, 20), concreteMat(0x9a948e), 1.35, 1.9, -1.35);
  add(root, new THREE.CylinderGeometry(0.235, 0.235, 0.22, 20), accentMat, 1.35, 3.3, -1.35);
  for (let i = 0; i < 4; i++) box(root, 0.5, 0.35, 0.04, std(0x1f2a30, 0.3, 0.2), -1.3 + i * 0.8, 0.8, 1.41);
}

export function buildLogistics(root) {
  const wall = std(0x6a6560, 0.7, 0.3);
  box(root, 3.2, 1.6, 2.4, wall, -0.2, 0.8, -0.3, 0x2a2522);
  const s = new THREE.Shape();
  s.moveTo(-1.3, 0); s.lineTo(1.3, 0); s.lineTo(0, 0.7); s.lineTo(-1.3, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 3.3, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  const roof = add(root, g, std(0x3d3935, 0.7, 0.3), -1.85, 1.6, -0.3);
  roof.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0x1a1512 })));
  [-0.9, 0.3].forEach((x) => {
    box(root, 0.9, 1.1, 0.04, std(0x2a2522, 0.6, 0.5), x, 0.55, 0.92);
    box(root, 1.0, 0.07, 0.07, accentMat, x, 1.14, 0.94);
  });
  const crate = std(0xa57f4f, 0.9);
  [[1.7, 0.3, 1.3], [1.7, 0.3, 0.6], [1.7, 0.85, 1.0]].forEach(([x, y, z]) => box(root, 0.55, 0.5, 0.55, crate, x, y + 0.02, z, 0x5a4533));
  box(root, 1.4, 0.08, 1.8, std(COL.timber, 0.9), 1.7, 0.04, 1.0);
}

export function buildTelecom(root) {
  latticeMast(root, -0.4, -0.4, 4.4, 1.0, 0.3, 0.05, 7);
  const dish = (y, rot) => {
    const g = new THREE.Group();
    g.position.set(-0.4, y, -0.4);
    g.rotation.y = rot;
    const d = add(g, new THREE.SphereGeometry(0.42, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2), std(0xd8d2cb, 0.5, 0.2), 0, 0, 0.55);
    d.rotation.x = Math.PI / 2;
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), std(COL.steel), 0, 0, 0.3).rotation.x = Math.PI / 2;
    root.add(g);
  };
  dish(3.2, 0.5);
  dish(2.4, 1.6);
  box(root, 1.2, 0.9, 0.8, std(0x5f6560, 0.6, 0.3), 1.2, 0.45, 1.1, 0x2a2522);
  box(root, 1.22, 0.08, 0.82, accentMat, 1.2, 0.72, 1.1);
}

export function buildTransport(root) {
  const sleeper = concreteMat(0x7a746c);
  for (let x = -1.98; x <= 2; x += 0.44) box(root, 0.2, 0.08, 1.5, sleeper, x, 0.04, 1.0);
  const rail = std(0x9aa0a4, 0.3, 0.8);
  [0.62, 1.38].forEach((z) => box(root, 4.4, 0.1, 0.08, rail, 0, 0.13, z));
  // опора контактной сети
  const pole = std(0x57524d, 0.5, 0.5);
  box(root, 0.18, 3.2, 0.18, pole, 1.6, 1.6, -0.2);
  beam(root, V(1.6, 2.9, -0.2), V(1.6, 2.9, 1.0), 0.08, pole);
  rod(root, V(1.6, 3.2, -0.2), V(1.6, 2.9, 1.0), 0.025, pole, 4);
  add(root, new THREE.BoxGeometry(4.2, 0.035, 0.035), accentMat, 0, 2.7, 1.0, false);
  // тяговая подстанция
  box(root, 2.2, 1.4, 1.2, concreteMat(0x8a847e), -1.0, 0.7, -1.5, COL.concreteEdge);
  box(root, 2.24, 0.1, 1.24, accentMat, -1.0, 1.1, -1.5);
  box(root, 0.5, 0.9, 0.04, std(0x3a322b, 0.5, 0.5), -0.4, 0.45, -0.88);
}

/* ---------------- сетка «палаткой» ----------------
   Полотно натянуто между мачтами (или порталами) и спускается по оттяжкам
   к анкерам с трёх сторон; лицевая сторона (+z) открыта.
   cx — центр по x, A и B — половины пролёта, MH — высота опор,
   GX и GZ — вынос анкеров боковых и задних оттяжек. */
const filmMat = new THREE.MeshBasicMaterial({ color: COL.accent, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false });

// поверхность между верхней и нижней кромкой, top(u) и bot(u) при u ∈ [0, 1]
function netSurface(parent, top, bot, cell, segU = 40, segV = 10) {
  const geo = new THREE.PlaneGeometry(1, 1, segU, segV);
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    p.copy(bot(u)).lerp(top(u), v);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  const len = Math.max(top(0).distanceTo(top(1)), bot(0).distanceTo(bot(1)));
  const slant = top(0.5).distanceTo(bot(0.5));
  const g = new THREE.Group();
  const net = add(g, geo, netMat(len, slant, cell));
  net.receiveShadow = false;
  add(g, geo, filmMat, 0, 0, 0, false);
  parent.add(g);
  return g;
}

function tube(parent, fn, r, mat, n = 40) {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(fn(i / n));
  return add(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n * 2, r, 8), mat);
}

export function tent(parent, o) {
  const { cx = 0, A, B, MH, SX = 2.4, SY = 1.3, GX = 4.6, GZ = 4.2, cell = 1.0, posts = true } = o;
  const g = new THREE.Group();
  parent.add(g);
  const roofY = (u, v) => MH - SX * (1 - u * u) - SY * (1 - v * v);
  const R = (u, v) => V(cx + u * A, roofY(u, v), v * B);   // точка полотна, u и v ∈ [−1, 1]
  const s = (t) => 2 * t - 1;

  const mastGroup = new THREE.Group();
  g.add(mastGroup);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  if (posts) corners.forEach(([sx, sz]) => latticeMast(mastGroup, cx + sx * A, sz * B, MH, 1.4, 0.45, 0.07, 9));

  // оттяжки и анкеры: боковая — по ребру ската, задняя/передняя — наружу по z
  const guyMat = std(0x5a524b, 0.6, 0.4), anchorMat = concreteMat(0x7a746c);
  const anchor = (x, z) => { box(g, 0.8, 0.5, 0.8, anchorMat, x, 0.25, z); return V(x, 0.3, z); };
  corners.forEach(([sx, sz]) => {
    const top = V(cx + sx * A, MH - 0.3, sz * B);
    rod(g, top, anchor(cx + sx * (A + GX), sz * B), 0.035, guyMat, 4);
    rod(g, top, anchor(cx + sx * A, sz * (B + GZ)), 0.035, guyMat, 4);
  });

  // полотно: кровля, задний и боковые скаты, угловые клинья
  const skin = new THREE.Group();
  g.add(skin);
  const roof = new THREE.PlaneGeometry(2 * A, 2 * B, 52, 30);
  roof.rotateX(-Math.PI / 2);
  const rp = roof.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i), z = rp.getZ(i);
    rp.setXYZ(i, cx + x, roofY(x / A, z / B), z);
  }
  roof.computeVertexNormals();
  const roofNet = add(skin, roof, netMat(2 * A, 2 * B, cell));
  roofNet.receiveShadow = false;
  add(skin, roof, filmMat, 0, 0, 0, false);

  const ground = (x, z) => V(x, 0.02, z);
  const back = netSurface(skin, (t) => R(s(t), -1), (t) => ground(cx + s(t) * A, -B - GZ), cell);
  const left = netSurface(skin, (t) => R(-1, s(t)), (t) => ground(cx - A - GX, s(t) * B), cell);
  const right = netSurface(skin, (t) => R(1, s(t)), (t) => ground(cx + A + GX, s(t) * B), cell);
  const wedge = (sx) => netSurface(skin, () => V(cx + sx * A, MH, -B),
    (t) => ground(cx + sx * A, -B - GZ).lerp(ground(cx + sx * (A + GX), -B), t), cell, 16, 10);
  wedge(-1);
  wedge(1);

  // тросы по кромкам кровли и нижние тросы скатов
  const cables = new THREE.Group();
  g.add(cables);
  const edgeMat = std(0x8a5a3a, 0.5, 0.4);
  tube(cables, (t) => R(s(t), 1), 0.09, accentMat);
  tube(cables, (t) => R(s(t), -1), 0.09, accentMat);
  tube(cables, (t) => R(1, s(t)), 0.09, accentMat);
  tube(cables, (t) => R(-1, s(t)), 0.09, accentMat);
  tube(cables, (t) => R(s(t), 0).add(V(0, 0.02, 0)), 0.045, edgeMat);
  tube(cables, (t) => R(0, s(t)).add(V(0, 0.02, 0)), 0.045, edgeMat);
  tube(cables, (t) => ground(cx + s(t) * A, -B - GZ), 0.06, edgeMat, 4);
  tube(cables, (t) => ground(cx - A - GX, s(t) * B), 0.06, edgeMat, 4);
  const rightFoot = tube(cables, (t) => ground(cx + A + GX, s(t) * B), 0.06, edgeMat, 4);

  return { group: g, masts: mastGroup, skin, right: [right, rightFoot], roofY, R };
}

/* Портал ОРУ: две стойки и ригель — существующая опора для полотна */
export function portal(parent, x, z, h, span) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const mat = std(0x6a625b, 0.5, 0.5);
  for (const sz of [-1, 1]) {
    latticeMast(g, 0, sz * span / 2, h, 0.9, 0.5, 0.05, 8);
  }
  const top = new THREE.Group();
  g.add(top);
  for (const dy of [0, -0.6]) for (const dx of [-0.25, 0.25]) rod(top, V(dx, h + dy, -span / 2), V(dx, h + dy, span / 2), 0.05, mat, 6);
  for (let zz = -span / 2; zz < span / 2 - 0.1; zz += 0.8) {
    rod(top, V(-0.25, h, zz), V(-0.25, h - 0.6, zz + 0.8), 0.03, mat, 4);
    rod(top, V(0.25, h, zz), V(0.25, h - 0.6, zz + 0.8), 0.03, mat, 4);
  }
  parent.add(g);
  return g;
}

/* Стенка из блоков ФБС вдоль оси z: n блоков в ряду, courses рядов, перевязка швов */
export function fbsWall(parent, x, z0, n, courses) {
  const g = new THREE.Group();
  g.position.set(x, 0, z0);
  const BH = 0.58, J = 0.02, BW = 0.6, L = 2.38, HL = 1.18;
  const mat = concreteMat(COL.concrete);
  const blk = (len, y, zc) => box(g, BW, BH, len, mat, 0, y + BH / 2, zc, COL.concreteEdge);
  box(g, 0.9, 0.12, n * (L + J) + 0.3, concreteMat(0x5a5550), 0, 0.06, (n * (L + J)) / 2 - J / 2);
  for (let k = 0; k < courses; k++) {
    const y = 0.12 + k * (BH + J);
    const lens = k % 2 ? [HL, ...Array(n - 1).fill(L), HL] : Array(n).fill(L);
    let zz = 0;
    lens.forEach((len) => { blk(len, y, zz + len / 2); zz += len + J; });
  }
  parent.add(g);
  return g;
}

/* Человек в оранжевом жилете и каске */
export function person(parent, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const dark = std(0x2a2724, 0.8), vest = std(COL.accent, 0.6, 0, { emissive: COL.accent, emissiveIntensity: 0.2 });
  for (const sz of [-0.11, 0.11]) add(g, new THREE.CapsuleGeometry(0.08, 0.7, 4, 8), dark, 0, 0.43, sz);
  add(g, new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), vest, 0, 1.15, 0);
  for (const sz of [-0.27, 0.27]) add(g, new THREE.CapsuleGeometry(0.06, 0.5, 4, 8), dark, 0, 1.1, sz);
  add(g, new THREE.SphereGeometry(0.13, 16, 12), std(0xb08a6a, 0.8), 0, 1.62, 0);
  add(g, new THREE.SphereGeometry(0.15, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std(0xf2eee8, 0.4), 0, 1.66, 0);
  parent.add(g);
  return g;
}

/* Грузовик: проезд техники через разборный участок */
export function truck(parent, x, z, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const body = std(0x3a3632, 0.7), cab = std(0x4a4540, 0.6), dark = std(COL.black, 0.6);
  const wheel = new THREE.CylinderGeometry(0.45, 0.45, 0.32, 20);
  wheel.rotateX(Math.PI / 2);
  for (const wx of [-1.9, -0.6, 1.7]) for (const wz of [-0.95, 0.95]) add(g, wheel, dark, wx, 0.45, wz);
  box(g, 5.2, 0.35, 1.8, body, 0, 0.85, 0);
  box(g, 1.5, 1.6, 2.1, cab, 2.0, 1.8, 0);
  box(g, 0.04, 0.6, 1.8, std(COL.glass, 0.25), 2.76, 2.1, 0);
  box(g, 1.52, 0.12, 2.12, accentMat, 2.0, 1.3, 0);
  box(g, 3.4, 1.8, 2.2, std(0x57524d, 0.7), -0.8, 1.95, 0, 0x2a2522);
  parent.add(g);
  return g;
}

/* ---------------- свет и камера ---------------- */
export function addLights(scene, bbox, shadowSize = 4096) {
  const S = bbox.getSize(new THREE.Vector3()).length() / 2;
  const c = bbox.getCenter(new THREE.Vector3());
  scene.add(new THREE.HemisphereLight(0xdcd8d4, 0x17130f, 1.25));
  const sun = new THREE.DirectionalLight(0xfff1e2, 2.2);
  sun.position.set(c.x - 0.55 * S, c.y + 1.1 * S, c.z + 0.75 * S);
  sun.target.position.copy(c);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -S * 1.2, right: S * 1.2, top: S * 1.2, bottom: -S * 1.2, near: 0.1, far: S * 5 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.3);
  fill.position.set(c.x + S, c.y + 0.5 * S, c.z - 0.5 * S);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff6a1a, 1.3);
  rim.position.set(c.x + 0.5 * S, c.y + 0.4 * S, c.z - 1.2 * S);
  scene.add(rim);
  return { sun };
}

/* Камера под углом az/el (в градусах), дальность и центр — чтобы bbox
   вписался в кадр с полями margin */
export function fitCamera(camera, box, view, aspect) {
  camera.fov = view.fov;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
  const dir = V(Math.sin(view.az * DEG) * Math.cos(view.el * DEG), Math.sin(view.el * DEG), Math.cos(view.az * DEG) * Math.cos(view.el * DEG));
  const target = box.getCenter(new THREE.Vector3());
  let r = box.getSize(new THREE.Vector3()).length() * 1.6;
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(V(x, y, z));
  const m = 1 - (view.margin ?? 0.05) * 2;
  const place = () => {
    camera.position.copy(target).addScaledVector(dir, r);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  for (let i = 0; i < 12; i++) {
    place();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    corners.forEach((c) => {
      const p = c.clone().project(camera);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
    });
    const halfH = r * Math.tan((view.fov * DEG) / 2);
    const right = V(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = V(0, 1, 0).applyQuaternion(camera.quaternion);
    target.addScaledVector(right, ((x0 + x1) / 2) * halfH * aspect).addScaledVector(up, ((y0 + y1) / 2) * halfH);
    r *= Math.max((x1 - x0) / 2, (y1 - y0) / 2) / m;
  }
  place();
  return { target, r, dir };
}
