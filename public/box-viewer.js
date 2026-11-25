'use strict';
/* Интерактивная разборка стержневого ящика: каждая деталь собрана из примитивов. */

(function () {
  const host = document.getElementById('box-viewer') || document.getElementById('viewer');
  const canvas = document.getElementById('box-canvas');
  if (!host || !canvas) return;

  const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!gl) { host.classList.add('viewer--fallback'); return; }

  /* ---------- матрицы ---------- */
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
      1
    ]);
  }
  function multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
      }
    }
    return o;
  }

  /* ---------- шейдеры ---------- */
  const VS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    uniform mat4 uProj;
    uniform mat4 uView;
    uniform mat4 uModel;
    uniform mat3 uNormalMat;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vec4 world = uModel * vec4(aPos, 1.0);
      vWorld = world.xyz;
      vNormal = uNormalMat * aNormal;
      gl_Position = uProj * uView * world;
    }
  `;
  const FS = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vWorld;
    uniform vec3 uColor;
    uniform vec3 uEye;
    void main() {
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uEye - vWorld);
      vec3 L1 = normalize(vec3(0.55, 0.90, 0.60));
      vec3 L2 = normalize(vec3(-0.80, 0.20, 0.40));
      vec3 L3 = normalize(vec3(0.10, -0.85, 0.25));
      float d1 = max(dot(N, L1), 0.0);
      float d2 = max(dot(N, L2), 0.0);
      float d3 = max(dot(N, L3), 0.0);
      vec3 col = uColor * (0.34 + 0.90 * d1 + 0.28 * d2 + 0.10 * d3);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.2);
      col += vec3(0.86, 0.90, 1.0) * rim * 0.20;
      float spec = pow(max(dot(normalize(L1 + V), N), 0.0), 44.0);
      col += vec3(1.0) * spec * 0.20;
      // затемнение у нижней части деталей — мягкая «тень»
      col *= 0.90 + 0.10 * smoothstep(-0.55, 0.25, vWorld.y);
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const loc = {
    aPos: gl.getAttribLocation(prog, 'aPos'),
    aNormal: gl.getAttribLocation(prog, 'aNormal'),
    uProj: gl.getUniformLocation(prog, 'uProj'),
    uView: gl.getUniformLocation(prog, 'uView'),
    uModel: gl.getUniformLocation(prog, 'uModel'),
    uNormalMat: gl.getUniformLocation(prog, 'uNormalMat'),
    uColor: gl.getUniformLocation(prog, 'uColor'),
    uEye: gl.getUniformLocation(prog, 'uEye')
  };

  /* ---------- куб ---------- */
  const faces = [
    [[0, 0, 1], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
    [[0, 0, -1], [[0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5]]],
    [[1, 0, 0], [[0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5]]],
    [[-1, 0, 0], [[-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5]]],
    [[0, 1, 0], [[-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]],
    [[0, -1, 0], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [-0.5, -0.5, 0.5]]]
  ];
  const verts = [];
  for (const [n, quad] of faces) {
    const [a, b, c, d] = quad;
    for (const tri of [[a, b, c], [a, c, d]]) {
      for (const v of tri) verts.push(v[0], v[1], v[2], n[0], n[1], n[2]);
    }
  }
  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
  const STRIDE = 24;

  /* ---------- геометрия ящика ---------- */
  // Считаем от стержня: полость ящика = габарит стержня + зазор
  const T = 0.10;              // толщина стенок
  const CORE_X = 1.18;         // стержень: ширина
  const CORE_Z = 0.88;         // стержень: глубина
  const CORE_H = 0.47;         // стержень: высота
  const GAP = 0.01;            // зазор на сторону

  const IN_X = CORE_X + 2 * GAP;   // 1.20 — полость по X
  const IN_Z = CORE_Z + 2 * GAP;   // 0.90 — полость по Z
  const OUT_X = IN_X + 2 * T;      // 1.40
  const OUT_Z = IN_Z + 2 * T;      // 1.10

  const BASE_H = 0.07;
  const H = 0.50;                  // высота стенок
  const baseTop = -0.325;
  const baseMid = baseTop - BASE_H / 2;
  const wallMid = baseTop + H / 2;
  const coverBottom = baseTop + H;
  const coverMid = coverBottom + BASE_H / 2;

  const STEEL = [0.66, 0.68, 0.72];
  const STEEL_DARK = [0.56, 0.58, 0.62];
  const ACCENT = [0.90, 0.34, 0.18];
  const SAND = [0.78, 0.68, 0.46];

  const PARTS = [
    {
      name: 'Основание', color: STEEL_DARK, pos: [0, baseMid, 0], dir: [0, -1, 0], dist: 0.44,
      boxes: [
        { c: [0, 0, 0], s: [OUT_X + 0.04, BASE_H, OUT_Z + 0.04] },
        { c: [-0.58, -BASE_H / 2 - 0.02, -0.44], s: [0.12, 0.04, 0.12] },
        { c: [0.58, -BASE_H / 2 - 0.02, -0.44], s: [0.12, 0.04, 0.12] },
        { c: [-0.58, -BASE_H / 2 - 0.02, 0.44], s: [0.12, 0.04, 0.12] },
        { c: [0.58, -BASE_H / 2 - 0.02, 0.44], s: [0.12, 0.04, 0.12] }
      ]
    },
    {
      // наружная стенка: панель + рёбра снаружи (внутрь не заходят)
      name: 'Левая стенка', color: STEEL, pos: [-(IN_X / 2 + T / 2), wallMid, 0], dir: [-1, 0, 0], dist: 0.56,
      boxes: [
        { c: [0, 0, 0], s: [T, H, IN_Z] },
        { c: [-T / 2 - 0.025, 0, -0.38], s: [0.05, H - 0.05, 0.06] },
        { c: [-T / 2 - 0.025, 0, -0.13], s: [0.05, H - 0.05, 0.06] },
        { c: [-T / 2 - 0.025, 0, 0.13], s: [0.05, H - 0.05, 0.06] },
        { c: [-T / 2 - 0.025, 0, 0.38], s: [0.05, H - 0.05, 0.06] },
        { c: [0, H / 2 - 0.02, 0], s: [T + 0.03, 0.04, IN_Z] }
      ]
    },
    {
      name: 'Правая стенка', color: STEEL, pos: [(IN_X / 2 + T / 2), wallMid, 0], dir: [1, 0, 0], dist: 0.56,
      boxes: [
        { c: [0, 0, 0], s: [T, H, IN_Z] },
        { c: [T / 2 + 0.025, 0, -0.38], s: [0.05, H - 0.05, 0.06] },
        { c: [T / 2 + 0.025, 0, -0.13], s: [0.05, H - 0.05, 0.06] },
        { c: [T / 2 + 0.025, 0, 0.13], s: [0.05, H - 0.05, 0.06] },
        { c: [T / 2 + 0.025, 0, 0.38], s: [0.05, H - 0.05, 0.06] },
        { c: [0, H / 2 - 0.02, 0], s: [T + 0.03, 0.04, IN_Z] }
      ]
    },
    {
      name: 'Задняя стенка', color: STEEL, pos: [0, wallMid, -(IN_Z / 2 + T / 2)], dir: [0, 0, -1], dist: 0.56,
      boxes: [
        { c: [0, 0, 0], s: [IN_X, H, T] },
        { c: [-0.35, 0, -T / 2 - 0.025], s: [0.06, H - 0.05, 0.05] },
        { c: [0, 0, -T / 2 - 0.025], s: [0.06, H - 0.05, 0.05] },
        { c: [0.35, 0, -T / 2 - 0.025], s: [0.06, H - 0.05, 0.05] },
        { c: [0, H / 2 - 0.02, 0], s: [IN_X, 0.04, T + 0.03] }
      ]
    },
    {
      name: 'Отъёмная часть', color: ACCENT, pos: [0, wallMid, IN_Z / 2 + T / 2], dir: [0, 0, 1], dist: 0.64,
      boxes: [
        { c: [0, 0, 0], s: [IN_X, H, T] },
        { c: [-0.34, 0.02, 0.10], s: [0.16, 0.05, 0.08] },
        { c: [0.34, 0.02, 0.10], s: [0.16, 0.05, 0.08] },
        { c: [-0.34, 0.02, 0.16], s: [0.05, 0.05, 0.05] },
        { c: [0.34, 0.02, 0.16], s: [0.05, 0.05, 0.05] },
        { c: [-0.50, -0.16, -0.06], s: [0.05, 0.06, 0.08] },
        { c: [0.50, -0.16, -0.06], s: [0.05, 0.06, 0.08] }
      ]
    },
    {
      name: 'Крышка', color: [0.74, 0.75, 0.78], pos: [0, coverMid, 0], dir: [0, 1, 0], dist: 0.52,
      boxes: [
        { c: [0, 0, 0], s: [OUT_X + 0.04, BASE_H, OUT_Z + 0.04] },
        { c: [-0.60, -BASE_H / 2 - 0.015, -0.48], s: [0.10, 0.03, 0.10] },
        { c: [0.60, -BASE_H / 2 - 0.015, -0.48], s: [0.10, 0.03, 0.10] },
        { c: [-0.60, -BASE_H / 2 - 0.015, 0.48], s: [0.10, 0.03, 0.10] },
        { c: [0.60, -BASE_H / 2 - 0.015, 0.48], s: [0.10, 0.03, 0.10] },
        { c: [0, BASE_H / 2 + 0.03, 0], s: [0.38, 0.05, 0.14] },
        { c: [-0.12, BASE_H / 2 + 0.07, 0], s: [0.05, 0.04, 0.10] },
        { c: [0.12, BASE_H / 2 + 0.07, 0], s: [0.05, 0.04, 0.10] }
      ]
    },
    {
      // стержень по габариту полости: 1.18 x 0.88, высота 0.43 + бобышка
      name: 'Стержень', color: SAND, pos: [0, baseTop + CORE_H / 2, 0], dir: [0, 1, 0], dist: 0.30,
      boxes: [
        { c: [0, 0, 0], s: [CORE_X, CORE_H, CORE_Z] },
        { c: [0, 0.25, 0], s: [0.34, 0.03, 0.26] },
        { c: [-0.46, CORE_H / 2 + 0.015, -0.32], s: [0.08, 0.03, 0.08] },
        { c: [0.46, CORE_H / 2 + 0.015, -0.32], s: [0.08, 0.03, 0.08] },
        { c: [-0.46, CORE_H / 2 + 0.015, 0.32], s: [0.08, 0.03, 0.08] },
        { c: [0.46, CORE_H / 2 + 0.015, 0.32], s: [0.08, 0.03, 0.08] }
      ]
    }
  ];

  for (const p of PARTS) { p.progress = 0; p.target = 0; }

  /* ---------- состояние ---------- */
  const state = {
    yaw: 0.62, pitch: 0.38, dist: 4.7, targetDist: 4.7,
    dragging: false, lastX: 0, lastY: 0, moved: 0,
    auto: true, lastInteract: 0
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = host.clientWidth, h = host.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function offsetOf(p) {
    return [p.dir[0] * p.dist * p.progress, p.dir[1] * p.dist * p.progress, p.dir[2] * p.dist * p.progress];
  }
  function boxCenter(p, b) {
    const o = offsetOf(p);
    return [p.pos[0] + o[0] + b.c[0], p.pos[1] + o[1] + b.c[1], p.pos[2] + o[2] + b.c[2]];
  }

  function draw() {
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    const aspect = canvas.width / Math.max(canvas.height, 1);
    const proj = perspective(34 * Math.PI / 180, aspect, 0.05, 60);
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const eye = [state.dist * cp * Math.sin(state.yaw), state.dist * sp + 0.02, state.dist * cp * Math.cos(state.yaw)];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniform3fv(loc.uEye, eye);

    gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, STRIDE, 12);

    for (const p of PARTS) {
      gl.uniform3fv(loc.uColor, p.color);
      for (const b of p.boxes) {
        const c = boxCenter(p, b);
        const m = new Float32Array([
          b.s[0], 0, 0, 0,
          0, b.s[1], 0, 0,
          0, 0, b.s[2], 0,
          c[0], c[1], c[2], 1
        ]);
        const nm = new Float32Array([1 / b.s[0], 0, 0, 0, 1 / b.s[1], 0, 0, 0, 1 / b.s[2]]);
        gl.uniformMatrix4fv(loc.uModel, false, m);
        gl.uniformMatrix3fv(loc.uNormalMat, false, nm);
        gl.drawArrays(gl.TRIANGLES, 0, 36);
      }
    }
    return { eye, proj, view };
  }

  /* ---------- клик ---------- */
  function transform(m, v) {
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
      m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
    ];
  }
  function invert(a) {
    const b00 = a[0] * a[5] - a[1] * a[4];
    const b01 = a[0] * a[6] - a[2] * a[4];
    const b02 = a[0] * a[7] - a[3] * a[4];
    const b03 = a[1] * a[6] - a[2] * a[5];
    const b04 = a[1] * a[7] - a[3] * a[5];
    const b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12];
    const b07 = a[8] * a[14] - a[10] * a[12];
    const b08 = a[8] * a[15] - a[11] * a[12];
    const b09 = a[9] * a[14] - a[10] * a[13];
    const b10 = a[9] * a[15] - a[11] * a[13];
    const b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    return new Float32Array([
      (a[5] * b11 - a[6] * b10 + a[7] * b09) * det,
      (a[2] * b10 - a[1] * b11 - a[3] * b09) * det,
      (a[13] * b05 - a[14] * b04 + a[15] * b03) * det,
      (a[10] * b04 - a[9] * b05 - a[11] * b03) * det,
      (a[6] * b08 - a[4] * b11 - a[7] * b07) * det,
      (a[0] * b11 - a[2] * b08 + a[3] * b07) * det,
      (a[14] * b02 - a[12] * b05 - a[15] * b01) * det,
      (a[8] * b05 - a[10] * b02 + a[11] * b01) * det,
      (a[4] * b10 - a[5] * b08 + a[7] * b06) * det,
      (a[1] * b08 - a[0] * b10 - a[3] * b06) * det,
      (a[12] * b04 - a[13] * b02 + a[15] * b00) * det,
      (a[9] * b02 - a[8] * b04 - a[11] * b00) * det,
      (a[5] * b07 - a[4] * b09 - a[6] * b06) * det,
      (a[0] * b09 - a[1] * b07 + a[2] * b06) * det,
      (a[13] * b01 - a[12] * b03 - a[14] * b00) * det,
      (a[8] * b03 - a[9] * b01 + a[10] * b00) * det
    ]);
  }
  function rayBox(o, d, center, size) {
    let tmin = -Infinity, tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      const min = center[i] - size[i] / 2;
      const max = center[i] + size[i] / 2;
      if (Math.abs(d[i]) < 1e-8) {
        if (o[i] < min || o[i] > max) return Infinity;
      } else {
        let t1 = (min - o[i]) / d[i];
        let t2 = (max - o[i]) / d[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return Infinity;
      }
    }
    return tmin > 0 ? tmin : (tmax > 0 ? tmax : Infinity);
  }

  /* ---------- управление ---------- */
  function onDown(e) {
    state.dragging = true; state.auto = false; state.moved = 0;
    state.lastX = e.clientX; state.lastY = e.clientY;
    host.classList.add('is-dragging');
    canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX, dy = e.clientY - state.lastY;
    state.lastX = e.clientX; state.lastY = e.clientY;
    state.moved += Math.abs(dx) + Math.abs(dy);
    state.yaw -= dx * 0.008;
    state.pitch = Math.max(-1.3, Math.min(1.3, state.pitch + dy * 0.008));
    state.lastInteract = performance.now();
  }
  function onUp(e) {
    const wasDrag = state.moved > 6;
    state.dragging = false;
    host.classList.remove('is-dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    state.lastInteract = performance.now();
    if (wasDrag) return;

    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;

    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const eye = [state.dist * cp * Math.sin(state.yaw), state.dist * sp + 0.02, state.dist * cp * Math.cos(state.yaw)];
    const proj = perspective(34 * Math.PI / 180, canvas.width / Math.max(canvas.height, 1), 0.05, 60);
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const inv = invert(multiply(proj, view));
    if (!inv) return;
    const p0 = transform(inv, [ndcX, ndcY, -1, 1]);
    const p1 = transform(inv, [ndcX, ndcY, 1, 1]);
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const ray = { o: [p0[0], p0[1], p0[2]], d: [d[0] / len, d[1] / len, d[2] / len] };

    let best = null, bestT = Infinity;
    for (const p of PARTS) {
      for (const b of p.boxes) {
        const t = rayBox(ray.o, ray.d, boxCenter(p, b), b.s);
        if (t < bestT) { bestT = t; best = p; }
      }
    }
    if (best) { best.target = best.target > 0.5 ? 0 : 1; state.auto = false; }
  }
  function onWheel(e) {
    e.preventDefault();
    state.auto = false;
    state.targetDist = Math.max(3.0, Math.min(8.0, state.targetDist * Math.exp(e.deltaY * 0.0012)));
    state.lastInteract = performance.now();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  let pinchStart = 0, pinchDist = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStart = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchDist = state.targetDist;
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart > 0) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      state.targetDist = Math.max(3.0, Math.min(8.0, pinchDist * (pinchStart / Math.max(d, 1))));
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinchStart = 0; }, { passive: true });

  /* ---------- кнопки ---------- */
  const allBtn = document.getElementById('explode-all');
  const resetBtn = document.getElementById('explode-reset');
  if (allBtn) allBtn.addEventListener('click', () => {
    PARTS.forEach(p => { p.target = 1; });
    state.auto = false; state.lastInteract = performance.now();
    start();
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    PARTS.forEach(p => { p.target = 0; });
    state.auto = true; state.lastInteract = performance.now();
    start();
  });

  /* ---------- цикл ---------- */
  let prev = performance.now();
  let running = false;
  let rafId = 0;

  function start() {
    if (running) return;
    running = true;
    prev = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;

    if (state.auto && !state.dragging) state.yaw += 0.16 * dt;
    if (now - state.lastInteract > 6000) state.auto = true;
    state.dist += (state.targetDist - state.dist) * 0.1;

    for (const p of PARTS) {
      const k = Math.min(1, dt * 4.5);
      p.progress += (p.target - p.progress) * k;
      if (Math.abs(p.target - p.progress) < 0.001) p.progress = p.target;
    }

    draw();
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('ks-view', (e) => {
    if (e.detail === 'box') start(); else stop();
  });

  if (location.hash === '#explode') {
    PARTS.forEach(p => { p.target = 1; p.progress = 1; });
    state.auto = false;
    start();
  }
})();
