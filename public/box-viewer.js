'use strict';
/* Интерактивная разборка стержневого ящика: стенки, основание, крышка, отъёмная часть, стержень. */

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
  function modelMatrix(cx, cy, cz, sx, sy, sz) {
    return new Float32Array([
      sx, 0, 0, 0,
      0, sy, 0, 0,
      0, 0, sz, 0,
      cx, cy, cz, 1
    ]);
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
      vec3 L1 = normalize(vec3(0.55, 0.85, 0.65));
      vec3 L2 = normalize(vec3(-0.75, 0.25, 0.45));
      vec3 L3 = normalize(vec3(0.0, -0.9, 0.2));
      float d1 = max(dot(N, L1), 0.0);
      float d2 = max(dot(N, L2), 0.0);
      float d3 = max(dot(N, L3), 0.0);
      vec3 col = uColor * (0.32 + 0.92 * d1 + 0.30 * d2 + 0.10 * d3);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
      col += vec3(0.85, 0.90, 1.0) * rim * 0.22;
      float spec = pow(max(dot(normalize(L1 + V), N), 0.0), 40.0);
      col += vec3(1.0) * spec * 0.18;
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
    // нормаль, 4 вершины (обход)
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
      for (const v of tri) { verts.push(v[0], v[1], v[2], n[0], n[1], n[2]); }
    }
  }
  const meshData = new Float32Array(verts);
  const vbuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, meshData, gl.STATIC_DRAW);
  const STRIDE = 6 * 4;

  /* ---------- сборка ящика ---------- */
  // pos — центр, size — габарит, dir — куда разъезжается, dist — насколько
  const PARTS = [
    { name: 'Основание', pos: [0, -0.42, 0], size: [1.30, 0.10, 0.95], color: [0.62, 0.63, 0.67], dir: [0, -1, 0], dist: 0.42 },
    { name: 'Задняя стенка', pos: [0, -0.05, -0.42], size: [1.30, 0.64, 0.10], color: [0.68, 0.69, 0.72], dir: [0, 0, -1], dist: 0.46 },
    { name: 'Левая стенка', pos: [-0.60, -0.05, 0], size: [0.10, 0.64, 0.95], color: [0.68, 0.69, 0.72], dir: [-1, 0, 0], dist: 0.46 },
    { name: 'Правая стенка', pos: [0.60, -0.05, 0], size: [0.10, 0.64, 0.95], color: [0.68, 0.69, 0.72], dir: [1, 0, 0], dist: 0.46 },
    { name: 'Отъёмная часть', pos: [0, -0.05, 0.42], size: [1.30, 0.64, 0.10], color: [0.90, 0.34, 0.18], dir: [0, 0, 1], dist: 0.56 },
    { name: 'Крышка', pos: [0, 0.30, 0], size: [1.36, 0.10, 1.00], color: [0.74, 0.75, 0.78], dir: [0, 1, 0], dist: 0.46 },
    { name: 'Стержень', pos: [0, -0.12, 0], size: [0.86, 0.34, 0.58], color: [0.76, 0.66, 0.45], dir: [0, 0.4, 0], dist: 0.18 }
  ];
  for (const p of PARTS) { p.progress = 0; p.target = 0; p.base = [p.pos[0], p.pos[1], p.pos[2]]; }

  /* ---------- состояние ---------- */
  const state = {
    yaw: 0.62, pitch: 0.42, dist: 4.2, targetDist: 4.2,
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
    const eye = [state.dist * cp * Math.sin(state.yaw), state.dist * sp + 0.05, state.dist * cp * Math.cos(state.yaw)];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniform3fv(loc.uEye, eye);

    for (const p of PARTS) {
      const o = offsetOf(p);
      const m = modelMatrix(p.base[0] + o[0], p.base[1] + o[1], p.base[2] + o[2], p.size[0], p.size[1], p.size[2]);
      const nm = new Float32Array([1 / p.size[0], 0, 0, 0, 1 / p.size[1], 0, 0, 0, 1 / p.size[2]]);
      gl.uniformMatrix4fv(loc.uModel, false, m);
      gl.uniformMatrix3fv(loc.uNormalMat, false, nm);
      gl.uniform3fv(loc.uColor, p.color);

      gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, STRIDE, 0);
      gl.enableVertexAttribArray(loc.aNormal);
      gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, STRIDE, 12);
      gl.drawArrays(gl.TRIANGLES, 0, 36);
    }
    return { eye, proj, view };
  }

  /* ---------- клик по детали ---------- */
  function rayFrom(eye, proj, view, ndcX, ndcY) {
    // обратная матрица proj*view
    const m = multiply(proj, view);
    const inv = invert(m);
    if (!inv) return null;
    const p0 = transform(inv, [ndcX, ndcY, -1, 1]);
    const p1 = transform(inv, [ndcX, ndcY, 1, 1]);
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return { o: [p0[0], p0[1], p0[2]], d: [d[0] / len, d[1] / len, d[2] / len] };
  }
  function transform(m, v) {
    return [
      m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
      m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
      m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
      m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
    ];
  }
  function invert(m) {
    const a = m;
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

    // клик — выбрать деталь
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const eye = [state.dist * cp * Math.sin(state.yaw), state.dist * sp + 0.05, state.dist * cp * Math.cos(state.yaw)];
    const proj = perspective(34 * Math.PI / 180, canvas.width / Math.max(canvas.height, 1), 0.05, 60);
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const ray = rayFrom(eye, proj, view, ndcX, ndcY);
    if (!ray) return;

    let best = null, bestT = Infinity;
    for (const p of PARTS) {
      const o = offsetOf(p);
      const c = [p.base[0] + o[0], p.base[1] + o[1], p.base[2] + o[2]];
      const t = rayBox(ray.o, ray.d, c, p.size);
      if (t < bestT) { bestT = t; best = p; }
    }
    if (best) { best.target = best.target > 0.5 ? 0 : 1; state.auto = false; }
  }
  function onWheel(e) {
    e.preventDefault();
    state.auto = false;
    state.targetDist = Math.max(2.8, Math.min(7.0, state.targetDist * Math.exp(e.deltaY * 0.0012)));
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
      state.targetDist = Math.max(2.8, Math.min(7.0, pinchDist * (pinchStart / Math.max(d, 1))));
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinchStart = 0; }, { passive: true });

  /* ---------- кнопки ---------- */
  const allBtn = document.getElementById('explode-all');
  const resetBtn = document.getElementById('explode-reset');
  if (allBtn) allBtn.addEventListener('click', () => {
    PARTS.forEach(p => { p.target = 1; });
    state.auto = false; state.lastInteract = performance.now();
  });
  if (resetBtn) resetBtn.addEventListener('click', () => {
    PARTS.forEach(p => { p.target = 0; });
    state.auto = true; state.lastInteract = performance.now();
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

  if (location.hash === '#explode') {
    PARTS.forEach(p => { p.target = 1; p.progress = 1; });
    state.auto = false;
  }

  document.addEventListener('ks-view', (e) => {
    if (e.detail === 'box') start(); else stop();
  });

  if (allBtn) allBtn.addEventListener('click', start);
  if (resetBtn) resetBtn.addEventListener('click', start);
})();
