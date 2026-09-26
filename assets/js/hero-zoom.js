/* ==========================================================================
   Защита от БПЛА — первый экран «От нити до планеты».

   Экран открывается макросъёмкой: камера в нескольких миллиметрах от стальной
   проволоки защитной сетки — видны свитые жилы и блики. Прокрутка отдаляет
   камеру без склеек: проволока → ячейки → полотно → объект под сеткой →
   промзона → ночной город → Башкортостан → Россия из космоса. В финале
   от Уфы расходятся дуги к городам — «работаем по всей России».

   Масштаб меняется на девять порядков, поэтому миров два:
   — «ближний» в метрах, центр — узел сетки над резервуарным парком;
   — «дальний» в километрах: Земля с ночными огнями (снимок NASA Black
     Marble 2016, общественное достояние).
   На высоте 8–30 км ближний мир растворяется в дальнем.

   Модуль подключает main.js (?scene=zoom или data-scene="zoom" у .hero).
   Режим прокрутки — класс is-rewind на .hero; без него сцена сразу
   показывает финальный кадр с планетой.
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
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;

let seed = 1917;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + rand() * (b - a);
const gauss = () => {
  let u = 0;
  for (let i = 0; i < 4; i++) u += rand();
  return (u - 2) / 0.58;
};

/* ---- Хронометраж по доле прокрутки p ---- */
const P_ZOOM = 0.84;       // к этому моменту камера в космосе
const P_DONE = 0.84;       // проявляется заголовок
const L0 = -2.35;          // lg высоты камеры, м: 4,5 мм
const L1 = 7.28;           // ≈ 19 000 км: планета целиком
const LA = 4.5, LB = 5.05; // здесь ближний мир растворяется в дальнем

/* ---- Сетка, м ---- */
const S = 0.07;            // ячейка: ширина шестигранника
const RW = 0.0012;         // радиус проволоки
const GROUND = -23;        // земля под центром полотна
const NX = 46, NZ = 31, SAG = 3;

/* ---- Земля, км ---- */
const R = 6371;
const UFA = [54.74, 55.97];
const CITIES = [
  [55.75, 37.62], [59.93, 30.34], [55.79, 49.12], [53.2, 50.15], [58.01, 56.25],
  [56.84, 60.6], [55.16, 61.4], [57.15, 65.53], [54.99, 73.37], [55.03, 82.92],
  [51.77, 55.1], [48.7, 44.5], [45.04, 38.98], [56.33, 44.0], [61.25, 73.4],
  [56.01, 92.87], [52.29, 104.3], [64.54, 40.54], [47.23, 39.72], [68.97, 33.07]
];
// точка на сфере — в той же развёртке, что и SphereGeometry с равнопромежуточной картой
function geo(lat, lon, r) {
  const phi = ((lon + 180) / 360) * Math.PI * 2;
  const th = ((90 - lat) / 180) * Math.PI;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th)).multiplyScalar(r);
}

const stage = document.getElementById('heroStage');
const hero = stage && stage.closest('.hero');

/* Склейка геометрий в одну: меньше вызовов отрисовки */
function merger() {
  const pos = [], nor = [], uv = [], idx = [];
  return {
    add(g, m) {
      g.applyMatrix4(m);
      const base = pos.length / 3;
      pos.push(...g.attributes.position.array);
      nor.push(...g.attributes.normal.array);
      uv.push(...g.attributes.uv.array);
      g.index.array.forEach((i) => idx.push(i + base));
      g.dispose();
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      return g;
    }
  };
}

/* Карта нормалей свитой пряди: шесть жил винтом вокруг оси проволоки */
function strandNormalMap() {
  const N = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const img = g.createImageData(N, N);
  const h = (t) => Math.sqrt(Math.abs(Math.sin(Math.PI * t)));
  for (let py = 0; py < N; py++) {
    for (let px = 0; px < N; px++) {
      const t = 6 * (px / N) + py / N;
      const dt = (h(t + 0.01) - h(t - 0.01)) / 0.02;
      const nx = -dt * 6 * 0.09;
      const ny = -dt * 0.03;
      const l = Math.hypot(nx, ny, 1);
      const o = (py * N + px) * 4;
      img.data[o] = (nx / l * 0.5 + 0.5) * 255;
      img.data[o + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const HEX_GLSL = `
  float hexE(vec2 p) {
    vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(p, r) - h;
    vec2 b = mod(p - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    gv = abs(gv);
    return 0.5 - max(dot(gv, normalize(r)), gv.x);
  }`;

function init() {
  const scroll = hero.classList.contains('is-rewind') && !REDUCED;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, COARSE ? 1.5 : 1.75));
  renderer.setClearColor(0x050404, 1);
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.className = 'hero__canvas';
  stage.appendChild(canvas);

  const uTime = { value: 0 };
  const uScale = { value: 500 };

  /* ==================================================================
     БЛИЖНИЙ МИР, метры
     ================================================================== */
  const near = new THREE.Scene();
  near.fog = new THREE.FogExp2(0x070605, 0.004);
  const camN = new THREE.PerspectiveCamera(40, 16 / 9, 0.0001, 100);

  // окружение для металла: тёмное небо, тёплая полоса огней у горизонта
  {
    const pm = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `varying vec3 vD; void main(){
        float h = vD.y;
        vec3 c = mix(vec3(0.04, 0.035, 0.03), vec3(0.09, 0.1, 0.12), smoothstep(0.0, 0.8, h));
        c += vec3(1.0, 0.45, 0.12) * exp(-abs(h + 0.05) * 14.0) * 0.9;
        c += vec3(1.0, 0.6, 0.3) * smoothstep(0.93, 1.0, dot(vD, normalize(vec3(-0.5, -0.3, 0.6)))) * 3.0;
        c += vec3(0.7, 0.8, 1.0) * smoothstep(0.96, 1.0, dot(vD, normalize(vec3(0.4, 0.8, -0.3)))) * 2.0;
        gl_FragColor = vec4(c, 1.0); }`
    })));
    near.environment = pm.fromScene(env, 0.02).texture;
    pm.dispose();
  }

  near.add(new THREE.HemisphereLight(0x5a6070, 0x0a0806, 0.6));
  const moon = new THREE.DirectionalLight(0xb8c6de, 1.6);
  moon.position.set(-3, 6, 2);
  near.add(moon);
  // лампа у самой проволоки: блик ползёт по жилам в макроплане
  const glint = new THREE.PointLight(0xffa060, 0.006, 0.4, 2);
  near.add(glint);
  // свет площадки снизу
  const siteLight = new THREE.PointLight(0xffa060, 4000, 160, 1.6);
  siteLight.position.set(0, GROUND + 9, 0);
  near.add(siteLight);

  /* ---- проволока крупным планом: геометрия вокруг центра ---- */
  const wireGroup = new THREE.Group();
  {
    const Rv = 0.57735;
    const edges = new Map();
    const verts = new Map();
    const off = -0.5 * S;       // центр мира — середина вертикального ребра
    const PATCH = 0.55;
    const n = Math.ceil(PATCH / S) + 2;
    for (let j = -n; j <= n; j++) {
      for (let i = -n; i <= n; i++) {
        [[i, j * 1.7320508], [i + 0.5, j * 1.7320508 + 0.8660254]].forEach(([cx, cz]) => {
          if (Math.hypot(cx * S + off, cz * S) > PATCH) return;
          const v = [];
          for (let k = 0; k < 6; k++) {
            const a = (30 + 60 * k) * DEG;
            v.push([(cx + Rv * Math.cos(a)) * S + off, (cz + Rv * Math.sin(a)) * S]);
          }
          for (let k = 0; k < 6; k++) {
            const A = v[k], B = v[(k + 1) % 6];
            const key = Math.round((A[0] + B[0]) * 5000) + ':' + Math.round((A[1] + B[1]) * 5000);
            if (!edges.has(key)) edges.set(key, [A, B]);
            verts.set(Math.round(A[0] * 10000) + ':' + Math.round(A[1] * 10000), A);
          }
        });
      }
    }
    const mw = merger();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0);
    const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), d3 = new THREE.Vector3();
    const ONE = new THREE.Vector3(1, 1, 1);
    edges.forEach(([A, B]) => {
      a3.set(A[0], 0, A[1]);
      b3.set(B[0], 0, B[1]);
      d3.subVectors(b3, a3);
      const len = d3.length();
      q.setFromUnitVectors(Y, d3.normalize());
      m4.compose(a3.clone().add(b3).multiplyScalar(0.5), q, ONE);
      mw.add(new THREE.CylinderGeometry(RW, RW, len, 14, 1, true), m4);
    });
    const mk = merger();
    verts.forEach(([x, z]) => {
      m4.makeTranslation(x, 0, z);
      mk.add(new THREE.SphereGeometry(RW * 1.55, 14, 10), m4);
    });
    const nm = strandNormalMap();
    nm.repeat.set(1, (Rv * S) / 0.02);
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0xb9b5ae, metalness: 0.95, roughness: 0.3, normalMap: nm, normalScale: new THREE.Vector2(1, 1), envMapIntensity: 1.4
    });
    wireGroup.add(new THREE.Mesh(mw.build(), wireMat));
    wireGroup.add(new THREE.Mesh(mk.build(), new THREE.MeshStandardMaterial({ color: 0x8f8a84, metalness: 0.9, roughness: 0.4, envMapIntensity: 1.2 })));
    near.add(wireGroup);
  }

  /* ---- полотно целиком: рисунок сетки в шейдере ---- */
  const uPatch = { value: 1 };
  const canopyY = (x, z) => SAG * (1 - (1 - (x / NX) ** 2) * (1 - (z / NZ) ** 2));
  {
    const g = new THREE.PlaneGeometry(NX * 2, NZ * 2, 96, 64);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, canopyY(p.getX(i), p.getZ(i)));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uPatch, uTime },
      vertexShader: `
        varying vec3 vW;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: `
        uniform float uPatch;
        varying vec3 vW;
        ${HEX_GLSL}
        void main() {
          vec2 q = (vW.xz + vec2(${(0.5 * S).toFixed(4)}, 0.0)) / ${S.toFixed(4)};
          float e = hexE(q);
          float w = ${(RW / S).toFixed(5)};
          float fw = max(fwidth(e), 1e-6);
          // проволока толще пикселя — обычная линия; тоньше — бледнеет, но не рябит
          float thick = clamp((w - e) / fw + 0.5, 0.0, 1.0);
          float thin = clamp(2.0 * w / fw, 0.0, 1.0) * clamp(1.0 - e / fw, 0.0, 1.0);
          float line = mix(thin, thick, smoothstep(0.6, 1.4, w / fw));
          // ячейка мельче пары пикселей — полотно видно как ровную полупрозрачную ткань
          float far = smoothstep(0.12, 0.35, fw);
          float cov = mix(line, 0.16, far);
          float across = clamp(e / w, 0.0, 1.0);
          vec3 col = mix(vec3(0.78, 0.76, 0.72) * (1.0 - across * across * 0.7), vec3(0.62, 0.58, 0.54), far);
          // снизу полотно подсвечено площадкой
          col += vec3(1.0, 0.5, 0.2) * 0.25 * exp(-dot(vW.xz, vW.xz) / 900.0);
          float hole = 1.0 - uPatch * (1.0 - smoothstep(0.42, 0.55, length(vW.xz)));
          gl_FragColor = vec4(col, cov * hole);
          #include <colorspace_fragment>
        }`
    });
    const canopy = new THREE.Mesh(g, m);
    canopy.renderOrder = 2;
    near.add(canopy);
    // несущие тросы по контуру
    const pts = [];
    const edge = (x0, z0, x1, z1) => {
      for (let i = 0; i < 40; i++) {
        const t0 = i / 40, t1 = (i + 1) / 40;
        const xa = lerp(x0, x1, t0), za = lerp(z0, z1, t0), xb = lerp(x0, x1, t1), zb = lerp(z0, z1, t1);
        pts.push(new THREE.Vector3(xa, canopyY(xa, za), za), new THREE.Vector3(xb, canopyY(xb, zb), zb));
      }
    };
    edge(-NX, -NZ, NX, -NZ); edge(NX, -NZ, NX, NZ); edge(NX, NZ, -NX, NZ); edge(-NX, NZ, -NX, -NZ);
    edge(-NX, 0, NX, 0); edge(0, -NZ, 0, NZ);
    near.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0xff8a3d, transparent: true, opacity: 0.8 })));
  }

  /* ---- земля и объект ---- */
  {
    const g = new THREE.PlaneGeometry(240000, 240000);
    g.rotateX(-Math.PI / 2);
    const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x050404, roughness: 0.95, metalness: 0 }));
    ground.position.y = GROUND;
    near.add(ground);
  }
  const lights = [];   // [x, y, z, r, g, b, size]
  const lamp = (x, y, z, warm, size) => {
    const c = new THREE.Color().setHSL(0.06 + warm * 0.05, 1.0, 0.48 + warm * 0.17);
    lights.push(x, y, z, c.r, c.g, c.b, size);
  };
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0x5c5751, metalness: 0.65, roughness: 0.42, envMapIntensity: 1 });
    const roofM = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.5, roughness: 0.6 });
    const tank = (x, z, r, h) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40, 1), steel);
      w.position.set(x, GROUND + h / 2, z);
      near.add(w);
      const c = new THREE.Mesh(new THREE.ConeGeometry(r * 1.01, r * 0.18, 40), roofM);
      c.position.set(x, GROUND + h + r * 0.09, z);
      near.add(c);
    };
    // под сеткой
    [[-22, -8, 10, 14], [14, -10, 9, 13], [-2, 13, 8, 12], [26, 12, 7, 11], [-34, 15, 6, 9], [34, -17, 5, 9]].forEach((t) => tank(...t));
    // мачты и оттяжки
    const mastM = new THREE.MeshStandardMaterial({ color: 0x77706a, metalness: 0.7, roughness: 0.45 });
    const guys = [];
    [[-NX, -NZ], [0, -NZ], [NX, -NZ], [NX, 0], [NX, NZ], [0, NZ], [-NX, NZ], [-NX, 0]].forEach(([x, z]) => {
      const top = canopyY(x, z) + 1.5;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.38, top - GROUND, 10), mastM);
      m.position.set(x, (top + GROUND) / 2, z);
      near.add(m);
      const o = new THREE.Vector2(x, z).normalize();
      guys.push(new THREE.Vector3(x, top, z), new THREE.Vector3(x + o.x * 18, GROUND, z + o.y * 18));
      lamp(x, top + 0.4, z, 0, 1.4);
    });
    near.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(guys), new THREE.LineBasicMaterial({ color: 0x6a6159 })));
    // соседние парки, цеха, трубопроводы
    const shed = new THREE.MeshStandardMaterial({ color: 0x1e1b18, roughness: 0.9 });
    for (let c = 0; c < 7; c++) {
      const cx = rr(-900, 900), cz = rr(-900, 900);
      if (Math.hypot(cx, cz) < 180) continue;
      const n = 3 + Math.floor(rand() * 5);
      for (let k = 0; k < n; k++) tank(cx + (k % 3) * 34 + rr(-4, 4), cz + Math.floor(k / 3) * 34 + rr(-4, 4), rr(8, 14), rr(10, 16));
      for (let k = 0; k < 6; k++) lamp(cx + rr(-30, 90), GROUND + 9, cz + rr(-30, 70), rand(), 1.5);
    }
    for (let k = 0; k < 40; k++) {
      const x = rr(-1400, 1400), z = rr(-1400, 1400);
      if (Math.hypot(x, z) < 120) continue;
      const w = rr(20, 90), h = rr(6, 22), d = rr(15, 60);
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), shed);
      b.position.set(x, GROUND + h / 2, z);
      b.rotation.y = rand() < 0.5 ? 0 : Math.PI / 2;
      near.add(b);
      for (let q = 0; q < 4; q++) lamp(x + rr(-w / 2, w / 2), GROUND + h + 0.5, z + rr(-d / 2, d / 2), rand(), 1.2);
    }
    // огни площадки под сеткой
    for (let k = 0; k < 24; k++) lamp(rr(-44, 44), GROUND + 7, rr(-29, 29), rand() * 0.5, 1.3);
  }

  /* ---- дороги и город: тысячи огней ---- */
  {
    // шоссе от объекта к городу и лучами от центра города
    const C0 = new THREE.Vector2(3800, -2600);
    const road = (x0, z0, x1, z1, step, bend) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.floor(len / step);
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const b = Math.sin(t * Math.PI) * bend;
        const x = lerp(x0, x1, t) + b * (z1 - z0) / len;
        const z = lerp(z0, z1, t) - b * (x1 - x0) / len;
        lamp(x + rr(-3, 3), GROUND + 9, z + rr(-3, 3), rand() * 0.6, 1.1);
      }
    };
    road(-60, 40, C0.x, C0.y, 45, 900);
    road(-1500, 60, 1500, 90, 40, 60);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2 + rr(-0.2, 0.2);
      const L = rr(45000, 80000);
      road(C0.x, C0.y, C0.x + Math.cos(a) * L, C0.y + Math.sin(a) * L, 70, rr(-2500, 2500));
    }
    // кварталы: огни ложатся на сетку улиц, у каждого района — своя
    const clusters = [[C0.x, C0.y, 4200, 0.55, 0.3]];
    for (let k = 0; k < 40; k++) {
      const a = rand() * Math.PI * 2, d = rr(4000, 70000);
      clusters.push([C0.x + Math.cos(a) * d, C0.y + Math.sin(a) * d, rr(400, 1800), rr(0.015, 0.05), rr(0, 1.5)]);
    }
    const total = COARSE ? 32000 : 60000;
    const wsum = clusters.reduce((s, c) => s + c[3], 0);
    clusters.forEach(([cx, cz, sp, w, rot]) => {
      const n = Math.round((total * w) / wsum);
      const ca = Math.cos(rot), sa = Math.sin(rot);
      for (let i = 0; i < n; i++) {
        let u = gauss() * sp, v = gauss() * sp;
        if (rand() < 0.5) u = Math.round(u / 140) * 140; else v = Math.round(v / 140) * 140;
        lamp(cx + u * ca - v * sa, GROUND + 6, cz + u * sa + v * ca, rand(), 1.2 + rand() * 1.4);
      }
    });
  }
  {
    const n = lights.length / 7;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const sz = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set(lights.slice(i * 7, i * 7 + 3), i * 3);
      col.set(lights.slice(i * 7 + 3, i * 7 + 6), i * 3);
      sz[i] = lights[i * 7 + 6];
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
    const pts = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale },
      vertexShader: `
        attribute float aSize;
        attribute vec3 color;
        uniform float uScale;
        varying vec3 vC;
        varying float vA;
        varying float vSz;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = aSize * uScale / -mv.z;
          // далёкий огонь не меньше полутора пикселей — просто тускнеет
          vA = clamp(px / 1.5, 0.5, 1.0);
          vSz = clamp(px * 3.0, 1.5, 28.0);
          gl_PointSize = vSz;
          vC = color;
        }`,
      fragmentShader: `
        varying vec3 vC;
        varying float vA;
        varying float vSz;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a = a * a * 0.8 + smoothstep(0.14, 0.0, d);
          // точка в пару пикселей — сплошная, иначе она гаснет
          a = mix(0.9, a, smoothstep(2.0, 6.0, vSz));
          gl_FragColor = vec4(vC * 1.4, a * vA);
          #include <colorspace_fragment>
        }`
    }));
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    near.add(pts);
  }

  /* ==================================================================
     ДАЛЬНИЙ МИР, километры
     ================================================================== */
  const far = new THREE.Scene();
  const camF = new THREE.PerspectiveCamera(40, 16 / 9, 1, 200000);
  const earthTex = new THREE.TextureLoader().load('/assets/img/earth-night.webp', (tx) => { earthLights(tx.image); requestRender(); });
  earthTex.colorSpace = THREE.SRGBColorSpace;
  earthTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const uArc = { value: 0 };
  const uGlow = { value: 1 };
  {
    const earth = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 80), new THREE.ShaderMaterial({
      uniforms: { uTex: { value: earthTex }, uGlow },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D uTex;
        uniform float uGlow;
        varying vec2 vUv;
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec3 t = texture2D(uTex, vUv).rgb;
          // на снимке суша подсвечена луной синим, огни — жёлтые: разводим их в фирменную гамму
          float light = clamp((t.r + t.g) * 0.5 - t.b * 0.55, 0.0, 1.0);
          float land = clamp(t.b * 1.6 - light, 0.0, 1.0);
          vec3 col = vec3(0.1, 0.085, 0.075) * land * (0.5 + 0.9 * uGlow) + vec3(0.012, 0.012, 0.016);
          // вблизи снимок размыт — там огни дают точки, а карта светит только издалека
          col += (vec3(1.0, 0.48, 0.14) * pow(light, 1.2) * 1.7 + vec3(1.0, 0.85, 0.6) * pow(light, 3.0) * 1.2) * uGlow;
          float f = clamp(dot(vN, vV), 0.0, 1.0);
          col *= 0.35 + 0.65 * smoothstep(0.0, 0.5, f);
          col += vec3(1.0, 0.45, 0.15) * pow(1.0 - f, 5.0) * 0.35;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`
    }));
    far.add(earth);
    // атмосфера: тонкое свечение по краю диска
    const atm = new THREE.Mesh(new THREE.SphereGeometry(R * 1.03, 96, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vN;
        varying vec3 vV;
        void main() {
          float f = 1.0 - abs(dot(vN, vV));
          float a = pow(f, 7.0) * 2.2;
          vec3 col = mix(vec3(1.0, 0.42, 0.12), vec3(0.45, 0.55, 1.0), smoothstep(0.85, 1.0, f));
          gl_FragColor = vec4(col * a, a);
          #include <colorspace_fragment>
        }`
    }));
    far.add(atm);
    // звёзды
    const N = 2600;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3(gauss(), gauss(), gauss()).normalize().multiplyScalar(90000);
      v.toArray(sp, i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xfff0e0, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.75, depthWrite: false }));
    far.add(stars);

    // Уфа и дуги к городам
    const ufa = geo(UFA[0], UFA[1], R);
    const arcPos = [];
    const arcT = [];
    const ends = [];
    CITIES.forEach(([lat, lon]) => {
      const b = geo(lat, lon, R);
      const ang = ufa.angleTo(b);
      const lift = 60 + ang * R * 0.18;
      const n = 64;
      for (let i = 0; i < n; i++) {
        [i, i + 1].forEach((k) => {
          const t = k / n;
          const v = new THREE.Vector3().copy(ufa).normalize().multiplyScalar(Math.sin((1 - t) * ang))
            .add(b.clone().normalize().multiplyScalar(Math.sin(t * ang))).divideScalar(Math.sin(ang))
            .multiplyScalar(R + 4 + lift * Math.sin(t * Math.PI));
          arcPos.push(v.x, v.y, v.z);
          arcT.push(t);
        });
      }
      ends.push(b.clone().multiplyScalar(1.001));
    });
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.Float32BufferAttribute(arcPos, 3));
    ag.setAttribute('aT', new THREE.Float32BufferAttribute(arcT, 1));
    far.add(new THREE.LineSegments(ag, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uArc },
      vertexShader: `
        attribute float aT;
        varying float vT;
        void main() {
          vT = aT;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uArc;
        varying float vT;
        void main() {
          if (vT > uArc) discard;
          float head = exp(-(uArc - vT) * 18.0);
          gl_FragColor = vec4(vec3(1.0, 0.5, 0.16) * (1.0 + head * 2.0), 0.35 + head * 0.65);
          #include <colorspace_fragment>
        }`
    })));
    // точки: Уфа — крупная и пульсирует, города загораются, когда к ним приходит дуга
    const mp = [ufa.clone().multiplyScalar(1.001), ...ends];
    const mg = new THREE.BufferGeometry().setFromPoints(mp);
    mg.setAttribute('aHome', new THREE.Float32BufferAttribute(mp.map((_, i) => (i === 0 ? 1 : 0)), 1));
    const marks = new THREE.Points(mg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uArc, uTime },
      vertexShader: `
        attribute float aHome;
        uniform float uArc, uTime;
        varying float vA;
        varying float vHome;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          vHome = aHome;
          vA = aHome > 0.5 ? 1.0 : smoothstep(0.92, 1.0, uArc);
          gl_PointSize = aHome > 0.5 ? 26.0 + 8.0 * sin(uTime * 3.0) : 9.0;
        }`,
      fragmentShader: `
        varying float vA;
        varying float vHome;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.16, 0.0, d);
          float ring = vHome > 0.5 ? smoothstep(0.05, 0.0, abs(d - 0.4)) * 0.8 : 0.0;
          float halo = smoothstep(0.5, 0.0, d) * 0.35;
          gl_FragColor = vec4(vec3(1.0, 0.55, 0.2) * (1.0 + core * 1.5), (core + ring + halo) * vA);
          #include <colorspace_fragment>
        }`
    }));
    marks.frustumCulled = false;
    marks.renderOrder = 4;
    far.add(marks);
  }

  /* ---- огни городов точками: карта размыта вблизи, точки остаются чёткими ----
     Берём яркие пиксели снимка от Европы до Сибири и ставим в каждый огонёк */
  function earthLights(img) {
    const LAT0 = 75, LAT1 = 30, LON0 = 15, LON1 = 150, PX = img.width / 360;
    const cv = document.createElement('canvas');
    const w = Math.round((LON1 - LON0) * PX), h = Math.round((LAT0 - LAT1) * PX);
    cv.width = w;
    cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, Math.round((LON0 + 180) * PX), Math.round((90 - LAT0) * PX), w, h, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    const pos = [];
    const br = [];
    const v = new THREE.Vector3();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const l = ((d[o] + d[o + 1]) * 0.5 - d[o + 2] * 0.55) / 255;
        if (l < 0.1) continue;
        const n = l > 0.45 ? 3 : l > 0.25 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const lat = LAT0 - (y + rand()) / PX;
          const lon = LON0 + (x + rand()) / PX;
          v.copy(geo(lat, lon, R + 0.5));
          pos.push(v.x, v.y, v.z);
          br.push(Math.min(1, l * 1.6) * rr(0.6, 1));
        }
      }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    pg.setAttribute('aB', new THREE.Float32BufferAttribute(br, 1));
    const pts = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uScale },
      vertexShader: `
        attribute float aB;
        uniform float uScale;
        varying float vB;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float px = 2.5 * uScale / -mv.z;
          vB = aB * clamp(px, 0.35, 1.0);
          gl_PointSize = clamp(px * 2.0, 1.4, 6.0) * (0.7 + aB * 0.6);
        }`,
      fragmentShader: `
        varying float vB;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(mix(vec3(1.0, 0.45, 0.12), vec3(1.0, 0.85, 0.6), vB) * 1.3, a * a * vB);
          #include <colorspace_fragment>
        }`
    }));
    pts.frustumCulled = false;
    pts.renderOrder = 3;
    far.add(pts);
  }

  /* ---- смешивание миров: ближний рисуем в текстуру и накладываем ---- */
  const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadMat = new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false,
    uniforms: { tDiffuse: { value: rt.texture }, uOpacity: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        gl_FragColor = vec4(c.rgb, uOpacity);
        #include <colorspace_fragment>
      }`
  });
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), quadMat));

  /* ---------------- камеры ---------------- */
  // система координат у Уфы: x — восток, y — вверх, z — юг (как в ближнем мире)
  const ufaN = geo(UFA[0], UFA[1], 1).normalize();
  const east = new THREE.Vector3(0, 1, 0).cross(ufaN).normalize();
  const north = ufaN.clone().cross(east).normalize();
  const south = north.clone().negate();
  const ufaP = ufaN.clone().multiplyScalar(R);
  // финал: камера южнее Уфы, над горизонтом видна вся Россия
  const finalDir = ufaN.clone().multiplyScalar(Math.cos(28 * DEG)).addScaledVector(south, Math.sin(28 * DEG)).applyAxisAngle(ufaN, 12 * DEG).normalize();

  let narrowView = false;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  const dirA = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fPos = new THREE.Vector3();
  const fLook = new THREE.Vector3();
  const fRight = new THREE.Vector3();
  const fUp = new THREE.Vector3();

  function viewDir(L, t) {
    const el = L < -1.5 ? 16 : L < 0.5 ? lerp(16, 45, smooth(-1.5, 0.5, L)) : lerp(45, 82, smooth(0.5, 3.4, L));
    const az = 35 + (L + 2.4) * 16 + Math.sin(t * 0.13) * 2 + mouse.x * 4;
    const e = (el - mouse.y * 3) * DEG, a = az * DEG;
    return dirA.set(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  }

  function placeNear(L, t) {
    const d = Math.pow(10, L);
    viewDir(L, t);
    camN.position.copy(dirA).multiplyScalar(d);
    camN.up.set(0, 1, 0);
    camN.lookAt(0, 0, 0);
    camN.near = Math.max(d * 0.02, 0.00005);
    camN.far = d * 4000 + 400;
    camN.updateProjectionMatrix();
    near.fog.density = 1 / (d * 14 + 160);
    glint.position.set(0.012 * Math.sin(t * 0.6), 0.01, 0.02 * Math.cos(t * 0.4) + 0.01);
    // проволоку рисуем геометрией, пока камера близко
    wireGroup.visible = d < 1.1;
    uPatch.value = 1 - smooth(0.6, 1.1, d);
  }

  function placeFar(L, t) {
    const h = Math.pow(10, L) / 1000;
    viewDir(Math.min(L, 4.5), t);
    const mapped = tmp.set(0, 0, 0).addScaledVector(east, dirA.x).addScaledVector(ufaN, dirA.y).addScaledVector(south, dirA.z).normalize();
    const g = smooth(5.3, 7.0, L);
    const dir = mapped.lerp(finalDir, g).normalize();
    if (g > 0) dir.applyAxisAngle(ufaN, Math.sin(t * 0.05) * 0.03 * g + mouse.x * 0.03 * g);
    // цель: от точки на поверхности к центру планеты
    fLook.copy(ufaP).multiplyScalar(1 - smooth(5.6, 7.1, L));
    fPos.copy(ufaP).addScaledVector(dir, h);
    // на орбите камера держит высоту над планетой и заходит на центр
    if (g > 0) fPos.lerp(fRight.copy(dir).multiplyScalar(R + h), g);
    camF.position.copy(fPos);
    camF.up.copy(ufaN);
    camF.lookAt(fLook);
    // финальная компоновка: планета справа (на телефоне — сверху), слева текст
    const o = smooth(6.4, 7.28, L);
    if (o > 0) {
      camF.updateMatrixWorld();
      fRight.setFromMatrixColumn(camF.matrixWorld, 0);
      fUp.setFromMatrixColumn(camF.matrixWorld, 1);
      if (narrowView) fLook.addScaledVector(fUp, -R * 0.75 * o);
      else fLook.addScaledVector(fRight, -R * 0.95 * o);
      camF.lookAt(fLook);
    }
    const dist = camF.position.length();
    camF.near = Math.max(0.05, (dist - R) * 0.05);
    camF.far = dist + R * 2 + 100000;
    camF.updateProjectionMatrix();
  }

  /* ---------------- надписи ---------------- */
  const kEl = hero.querySelector('.rw__k');
  const clockEl = document.getElementById('rwClock');
  const stateEl = document.getElementById('rwState');
  const hintEl = hero.querySelector('.rw-hint');
  if (kEl) kEl.lastChild.nodeValue = 'Высота камеры';
  if (hintEl) hintEl.lastChild.nodeValue = 'Прокрутите — отдалите камеру';
  let lastA = '';
  let lastS = '';
  const fmt = (d) => {
    if (d < 0.01) return [(d * 1000).toFixed(1).replace('.', ','), 'мм'];
    if (d < 1) return [String(Math.round(d * 100)), 'см'];
    if (d < 1000) return [d < 10 ? d.toFixed(1).replace('.', ',') : String(Math.round(d)), 'м'];
    const km = d / 1000;
    return [km < 10 ? km.toFixed(1).replace('.', ',') : Math.round(km).toLocaleString('ru-RU'), 'км'];
  };
  // подпись «Уфа» над меткой на глобусе: HTML поверх сцены, следует за точкой
  const ufaTag = document.createElement('div');
  ufaTag.className = 'ufa-tag';
  ufaTag.setAttribute('aria-hidden', 'true');
  ufaTag.innerHTML = '<span class="ufa-tag__box"><b>Уфа</b><i>Башкортостан · 54,7° с. ш. 56,0° в. д.</i></span>';
  stage.appendChild(ufaTag);
  const ufaV = new THREE.Vector3();
  let ufaShown = -1;
  function placeUfaTag(L) {
    // видна с орбиты и только пока Уфа на обращённой к нам стороне планеты
    const k = smooth(5.9, 6.5, L) * (tmp.subVectors(camF.position, ufaP).dot(ufaN) > 0 ? 1 : 0);
    if (k !== ufaShown) { ufaTag.style.opacity = k.toFixed(3); ufaShown = k; }
    if (k <= 0) return;
    ufaV.copy(ufaP).multiplyScalar(1.001).project(camF);
    const x = ((ufaV.x + 1) / 2) * stage.clientWidth;
    const y = ((1 - ufaV.y) / 2) * stage.clientHeight;
    ufaTag.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
  }

  function hud(L, p) {
    const d = Math.pow(10, L);
    const [v, u] = fmt(d);
    const a = v + '|' + u;
    if (clockEl && a !== lastA) {
      clockEl.firstChild.nodeValue = v;
      clockEl.lastChild.innerHTML = '&nbsp;' + u;
      lastA = a;
    }
    const s = d < 0.03 ? 'Проволока ⌀ 2,4 мм · 6 жил' : d < 0.6 ? 'Ячейка сетки 70 мм' : d < 25 ? 'Сетчатое полотно' : d < 700 ? 'Защищённый объект'
      : d < 6000 ? 'Промзона' : d < 150000 ? 'Уфа' : d < 1500000 ? 'Башкортостан' : 'Россия · объекты по всей стране';
    if (stateEl && s !== lastS) { stateEl.textContent = s; lastS = s; }
    hero.classList.toggle('is-moving', p > 0.015);
    hero.classList.toggle('is-done', p >= P_DONE);
    // шапка не мешает смотреть: прячем её, пока камера отдаляется
    document.documentElement.classList.toggle('is-hero-playing', p < P_DONE);
  }

  /* ---------------- прокрутка ---------------- */
  let pTarget = scroll ? 0 : 1;
  let p = pTarget;
  function readScroll() {
    if (!scroll) return;
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

  function resize() {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    const px = renderer.getPixelRatio();
    rt.setSize(Math.round(w * px), Math.round(h * px));
    const asp = w / h;
    narrowView = asp < 1.05;
    const fov = asp < 0.8 ? 60 : asp < 1.05 ? 50 : 40;
    [camN, camF].forEach((c) => { c.aspect = asp; c.fov = fov; c.updateProjectionMatrix(); });
    uScale.value = (h * px) / (2 * Math.tan((fov * DEG) / 2));
    requestRender();
  }

  /* ---------------- цикл ---------------- */
  let visible = true;
  let raf = 0;
  let tPrev = -1;
  let t = 0;
  let arcT0 = -1;

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
    p += (pTarget - p) * (1 - Math.exp(-dt * 4));
    if (Math.abs(pTarget - p) < 0.0004) p = pTarget;
    mouse.x += (mouse.tx - mouse.x) * 0.05;
    mouse.y += (mouse.ty - mouse.y) * 0.05;

    const u = clamp(p / P_ZOOM, 0, 1);
    const L = scroll ? L0 + (L1 - L0) * (u * u * (3 - 2 * u)) : L1;

    // дуги к городам рисуются, когда камера вышла на орбиту
    if (L > 7.1) { if (arcT0 < 0) arcT0 = t; } else arcT0 = -1;
    uArc.value = arcT0 < 0 ? 0 : clamp((t - arcT0) / 2.6, 0, 1.2);
    if (REDUCED || !scroll) uArc.value = 1.2;

    uGlow.value = 0.1 + 0.9 * smooth(6.1, 6.9, L);
    const fade = 1 - smooth(LA, LB, L);    // доля ближнего мира
    if (fade > 0) placeNear(L, t);
    if (fade < 1) placeFar(L, t);
    if (fade >= 1) {
      renderer.setRenderTarget(null);
      renderer.render(near, camN);
    } else if (fade <= 0) {
      renderer.setRenderTarget(null);
      renderer.render(far, camF);
    } else {
      renderer.setRenderTarget(rt);
      renderer.render(near, camN);
      renderer.setRenderTarget(null);
      renderer.render(far, camF);
      quadMat.uniforms.uOpacity.value = fade;
      renderer.autoClear = false;
      renderer.render(quadScene, quadCam);
      renderer.autoClear = true;
    }
    if (fade < 1) placeUfaTag(L); else if (ufaShown !== 0) { ufaTag.style.opacity = '0'; ufaShown = 0; }
    if (scroll) hud(L, p);

    if (!stage.classList.contains('is-live')) {
      stage.classList.add('is-live');
      hero.classList.add('is-3d');
    }
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

if (stage && hero) {
  try { init(); } catch (err) {
    console.warn('3D-сцена недоступна:', err);
    hero.classList.remove('is-rewind');
  }
}
