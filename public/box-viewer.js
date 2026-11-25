'use strict';
/* Разъёмный стержневой ящик: две половины + стержень.
   Геометрия — из manifold-3d (настоящее вычитание), файл /models/corebox.glb.
   Управление: выбор детали, перетаскивание вдоль оси, слайдер, кнопки. */

(function () {
  const host = document.getElementById('viewer');
  const canvas = document.getElementById('box-canvas');
  if (!host || !canvas) return;

  const gl = canvas.getContext('webgl', { antialias: true, alpha: true });
  if (!gl) { return; }

  /* ---------- матрицы ---------- */
  const perspective = (fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  };
  function lookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
      -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
      -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1
    ]);
  }
  function multiply(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function invert(a) {
    const b00 = a[0] * a[5] - a[1] * a[4], b01 = a[0] * a[6] - a[2] * a[4], b02 = a[0] * a[7] - a[3] * a[4];
    const b03 = a[1] * a[6] - a[2] * a[5], b04 = a[1] * a[7] - a[3] * a[5], b05 = a[2] * a[7] - a[3] * a[6];
    const b06 = a[8] * a[13] - a[9] * a[12], b07 = a[8] * a[14] - a[10] * a[12], b08 = a[8] * a[15] - a[11] * a[12];
    const b09 = a[9] * a[14] - a[10] * a[13], b10 = a[9] * a[15] - a[11] * a[13], b11 = a[10] * a[15] - a[11] * a[14];
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    return new Float32Array([
      (a[5] * b11 - a[6] * b10 + a[7] * b09) * det, (a[2] * b10 - a[1] * b11 - a[3] * b09) * det,
      (a[13] * b05 - a[14] * b04 + a[15] * b03) * det, (a[10] * b04 - a[9] * b05 - a[11] * b03) * det,
      (a[6] * b08 - a[4] * b11 - a[7] * b07) * det, (a[0] * b11 - a[2] * b08 + a[3] * b07) * det,
      (a[14] * b02 - a[12] * b05 - a[15] * b01) * det, (a[8] * b05 - a[10] * b02 + a[11] * b01) * det,
      (a[4] * b10 - a[5] * b08 + a[7] * b06) * det, (a[1] * b08 - a[0] * b10 - a[3] * b06) * det,
      (a[12] * b04 - a[13] * b02 + a[15] * b00) * det, (a[9] * b02 - a[8] * b04 - a[11] * b00) * det,
      (a[5] * b07 - a[4] * b09 - a[6] * b06) * det, (a[0] * b09 - a[1] * b07 + a[2] * b06) * det,
      (a[13] * b01 - a[12] * b03 - a[14] * b00) * det, (a[8] * b03 - a[9] * b01 + a[10] * b00) * det
    ]);
  }
  const transform = (m, v) => [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12] * v[3],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13] * v[3],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14] * v[3],
    m[3] * v[0] + m[7] * v[1] + m[11] * v[2] + m[15] * v[3]
  ];

  /* ---------- шейдеры ---------- */
  const VS = `
    attribute vec3 aPos; attribute vec3 aNormal;
    uniform mat4 uProj, uView; uniform vec3 uOffset;
    varying vec3 vNormal; varying vec3 vWorld;
    void main(){
      vec3 p = aPos + uOffset;
      vWorld = p; vNormal = aNormal;
      gl_Position = uProj * uView * vec4(p, 1.0);
    }`;
  const FS = `
    precision mediump float;
    varying vec3 vNormal; varying vec3 vWorld;
    uniform vec3 uColor, uEye; uniform float uSelected, uAlpha;
    void main(){
      vec3 N = normalize(vNormal);
      vec3 V = normalize(uEye - vWorld);
      vec3 L1 = normalize(vec3(0.55,0.90,0.60));
      vec3 L2 = normalize(vec3(-0.80,0.20,0.40));
      vec3 L3 = normalize(vec3(0.10,-0.85,0.25));
      float d1 = max(dot(N,L1),0.0), d2 = max(dot(N,L2),0.0), d3 = max(dot(N,L3),0.0);
      vec3 col = uColor * (0.34 + 0.90*d1 + 0.28*d2 + 0.10*d3);
      float rim = pow(1.0 - max(dot(N,V),0.0), 2.2);
      col += vec3(0.86,0.90,1.0) * rim * 0.20;
      float spec = pow(max(dot(normalize(L1+V), N), 0.0), 44.0);
      col += vec3(1.0) * spec * 0.18;
      if (uAlpha < 0.99) {
        col *= 0.86;
        col += vec3(0.55, 0.60, 0.72) * rim * 0.45;
      }
      col = mix(col, vec3(0.90,0.34,0.18), uSelected * (uAlpha < 0.99 ? 0.06 : 0.14));
      col += vec3(0.08,0.06,0.05) * uSelected;
      col *= 0.90 + 0.10 * smoothstep(-0.6, 0.3, vWorld.y);
      gl_FragColor = vec4(col, uAlpha);
    }`;

  function compile(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog); gl.useProgram(prog);

  const loc = {};
  ['aPos', 'aNormal', 'uProj', 'uView', 'uOffset', 'uColor', 'uEye', 'uSelected', 'uAlpha'].forEach(n => {
    loc[n] = n[0] === 'a' ? gl.getAttribLocation(prog, n) : gl.getUniformLocation(prog, n);
  });

  /* ---------- GLB ---------- */
  function parseGlb(buffer) {
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('не GLB');
    let off = 12, json = null, bin = null;
    while (off < buffer.byteLength) {
      const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
      const data = new Uint8Array(buffer, off + 8, len);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(data));
      else if (type === 0x004E4942) bin = data;
      off += 8 + len + ((4 - (len % 4)) % 4);
    }
    const read = (idx) => {
      const acc = json.accessors[idx], bv = json.bufferViews[acc.bufferView];
      const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      return new Float32Array(bin.buffer, bin.byteOffset + start, acc.count * 3);
    };
    const parts = [];
    json.meshes.forEach((mesh, mi) => {
      const node = (json.nodes || []).find(n => n.mesh === mi) || {};
      mesh.primitives.forEach(prim => {
        const positions = read(prim.attributes.POSITION);
        const normals = read(prim.attributes.NORMAL);
        const mat = (json.materials || [])[prim.material] || {};
        const col = (mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorFactor) || [0.7, 0.7, 0.72, 1];
        let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < positions.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            if (positions[i + k] < min[k]) min[k] = positions[i + k];
            if (positions[i + k] > max[k]) max[k] = positions[i + k];
          }
        }
        parts.push({
          name: node.name || ('part' + parts.length),
          positions, normals, count: positions.length / 3,
          color: [col[0], col[1], col[2]],
          bboxMin: min, bboxMax: max,
          center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
          size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]]
        });
      });
    });
    return parts;
  }

  /* ---------- детали и оси ---------- */
  const AXIS = {
    lower: { dir: [0, -1, 0], max: 0.55, label: 'Нижняя половина' },
    upper: { dir: [0, 1, 0], max: 0.55, label: 'Верхняя половина' },
    core: { dir: [0, 1, 0], max: 0.30, label: 'Стержень' }
  };

  let PARTS = [];
  let selected = null;
  let ready = false;
  let pendingExplode = false;

  function setupParts(list) {
    PARTS = list.map(p => {
      const conf = AXIS[p.name] || { dir: [0, 1, 0], max: 0.35, label: p.name };
      const posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, p.positions, gl.STATIC_DRAW);
      const norBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, norBuf);
      gl.bufferData(gl.ARRAY_BUFFER, p.normals, gl.STATIC_DRAW);
      return Object.assign({}, p, {
        posBuf, norBuf, dir: conf.dir, max: conf.max, label: conf.label, visible: true, alpha: 1, transparent: false,
        offset: 0, target: 0
      });
    });
    ready = true;
    if (pendingExplode) PARTS.forEach(p => { p.target = 1; p.offset = 1; });
    buildChips();
    host.classList.add('is-ready');
  }

  /* ---------- камера ---------- */
  const state = { yaw: 0.62, pitch: 0.34, dist: 4.2, targetDist: 4.2, panX: 0, panY: 0, dragging: false, lastX: 0, lastY: 0, moved: 0, mode: null, auto: true, lastInteract: 0 };
  let inputMode = 'orbit';

  function camera() {
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const dir = [cp * Math.sin(state.yaw), sp, cp * Math.cos(state.yaw)];
    const base = [state.dist * dir[0], state.dist * dir[1], state.dist * dir[2]];
    const v0 = lookAt(base, [0, 0, 0], [0, 1, 0]);
    const right = [v0[0], v0[4], v0[8]];
    const up = [v0[1], v0[5], v0[9]];
    const off = [
      right[0] * state.panX + up[0] * state.panY,
      right[1] * state.panX + up[1] * state.panY,
      right[2] * state.panX + up[2] * state.panY
    ];
    const eye = [base[0] + off[0], base[1] + off[1], base[2] + off[2]];
    const center = [off[0], off[1], off[2]];
    const view = lookAt(eye, center, [0, 1, 0]);
    const proj = perspective(34 * Math.PI / 180, canvas.width / Math.max(canvas.height, 1), 0.05, 60);
    return { eye, view, proj };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function offsetVec(p) {
    return [p.dir[0] * p.max * p.offset, p.dir[1] * p.max * p.offset, p.dir[2] * p.max * p.offset];
  }

  function draw() {
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    if (!ready) return;

    const { eye, view, proj } = camera();
    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniform3fv(loc.uEye, eye);

    function paint(p) {
      const o = offsetVec(p);
      gl.uniform3fv(loc.uOffset, o);
      gl.uniform3fv(loc.uColor, p.color);
      gl.uniform1f(loc.uSelected, p === selected ? 1 : 0);
      gl.uniform1f(loc.uAlpha, p.alpha);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.posBuf);
      gl.enableVertexAttribArray(loc.aPos);
      gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, p.norBuf);
      gl.enableVertexAttribArray(loc.aNormal);
      gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, p.count);
    }

    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const p of PARTS) { if (p.visible && p.alpha >= 1) paint(p); }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    for (const p of PARTS) { if (p.visible && p.alpha < 1) paint(p); }
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  /* ---------- пикинг ---------- */
  function rayFrom(ndcX, ndcY) {
    const { view, proj } = camera();
    const inv = invert(multiply(proj, view));
    if (!inv) return null;
    const p0 = transform(inv, [ndcX, ndcY, -1, 1]);
    const p1 = transform(inv, [ndcX, ndcY, 1, 1]);
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    return { o: [p0[0], p0[1], p0[2]], d: [d[0] / len, d[1] / len, d[2] / len] };
  }
  function rayBox(ray, c, s) {
    let tmin = -Infinity, tmax = Infinity;
    for (let i = 0; i < 3; i++) {
      const mn = c[i] - s[i] / 2, mx = c[i] + s[i] / 2;
      if (Math.abs(ray.d[i]) < 1e-8) { if (ray.o[i] < mn || ray.o[i] > mx) return Infinity; }
      else {
        let t1 = (mn - ray.o[i]) / ray.d[i], t2 = (mx - ray.o[i]) / ray.d[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) return Infinity;
      }
    }
    return tmin > 0 ? tmin : (tmax > 0 ? tmax : Infinity);
  }
  function pick(ndcX, ndcY) {
    const ray = rayFrom(ndcX, ndcY);
    if (!ray) return null;
    let best = null, bestT = Infinity;
    for (const p of PARTS) {
      if (!p.visible) continue;
      const o = offsetVec(p);
      const c = [p.center[0] + o[0], p.center[1] + o[1], p.center[2] + o[2]];
      const t = rayBox(ray, c, p.size);
      if (t < bestT) { bestT = t; best = p; }
    }
    return best;
  }

  /* ---------- экранная ось ---------- */
  function axisScreenDir(p) {
    const { eye, view, proj } = camera();
    const m = multiply(proj, view);
    const c = [p.center[0] + offsetVec(p)[0], p.center[1] + offsetVec(p)[1], p.center[2] + offsetVec(p)[2]];
    const e = [c[0] + p.dir[0] * p.max, c[1] + p.dir[1] * p.max, c[2] + p.dir[2] * p.max];
    const toPx = (v) => {
      const q = transform(m, [v[0], v[1], v[2], 1]);
      return [(q[0] / q[3] * 0.5 + 0.5) * canvas.clientWidth, (1 - (q[1] / q[3] * 0.5 + 0.5)) * canvas.clientHeight];
    };
    const a = toPx(c), b = toPx(e);
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len, len };
  }

  /* ---------- интерфейс ---------- */
  const bar = document.getElementById('box-bar');
  const chipsBox = document.getElementById('box-parts');
  const slider = document.getElementById('box-slider');
  const sliderName = document.getElementById('box-part-name');

  // высота шторки -> отступ холста
  const barEl = document.getElementById('box-bar');
  function syncBarHeight() {
    if (barEl) host.style.setProperty('--bar-h', barEl.offsetHeight + 'px');
  }
  if (barEl && 'ResizeObserver' in window) new ResizeObserver(syncBarHeight).observe(barEl);
  window.addEventListener('resize', syncBarHeight);

  function buildChips() {
    if (!chipsBox) return;
    chipsBox.textContent = '';
    PARTS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'part-chip';
      b.textContent = p.label;
      b.dataset.name = p.name;
      b.addEventListener('click', () => select(p, true));
      chipsBox.appendChild(b);
    });
    select(PARTS[0], false);
  }

  function select(p, syncSlider) {
    selected = p;
    if (chipsBox) {
      Array.from(chipsBox.children).forEach(b => b.classList.toggle('is-active', b.dataset.name === p.name));
    }
    if (slider && syncSlider !== false) slider.value = String(Math.round(p.offset * 1000));
    if (sliderName) sliderName.textContent = p.label;
    refreshVisibilityUI();
    syncGhost();
  }

  const ghostBtn = document.getElementById('box-ghost');

  function syncGhost() {
    if (ghostBtn) ghostBtn.classList.toggle('is-active', !!(selected && selected.alpha < 1));
  }

  if (ghostBtn) ghostBtn.addEventListener('click', () => {
    if (!selected) return;
    selected.alpha = selected.alpha < 1 ? 1 : 0.75;
    syncGhost();
    state.lastInteract = performance.now();
    start();
  });

  const toggleBtn = document.getElementById('box-toggle-visible');
  const showAllBtn = document.getElementById('box-show-all');

  function refreshVisibilityUI() {
    if (toggleBtn && selected) toggleBtn.textContent = selected.visible ? 'Скрыть' : 'Показать';
    if (showAllBtn) showAllBtn.disabled = !PARTS.some(p => !p.visible);
    if (chipsBox) {
      Array.from(chipsBox.children).forEach(b => {
        const p = PARTS.find(x => x.name === b.dataset.name);
        b.classList.toggle('is-off', !!(p && !p.visible));
      });
    }
  }

  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    if (!selected) return;
    selected.visible = !selected.visible;
    refreshVisibilityUI();
    start();
  });
  if (showAllBtn) showAllBtn.addEventListener('click', () => {
    PARTS.forEach(p => { p.visible = true; });
    refreshVisibilityUI();
    start();
  });

  if (slider) {
    slider.addEventListener('input', () => {
      if (!selected) return;
      selected.offset = Number(slider.value) / 1000;
      selected.target = selected.offset;
      state.auto = false;
      state.lastInteract = performance.now();
    });
  }

  const barHandle = document.getElementById('box-toggle-bar');

  function syncBarHandle() {
    if (!barHandle) return;
    const collapsed = host.classList.contains('is-bar-collapsed');
    barHandle.textContent = collapsed ? '⌃' : '⌄';
    barHandle.setAttribute('aria-expanded', String(!collapsed));
    barHandle.setAttribute('aria-label', collapsed ? 'Развернуть панель' : 'Свернуть панель');
  }

  if (barHandle) {
    barHandle.addEventListener('click', () => {
      host.classList.toggle('is-bar-collapsed');
      syncBarHandle();
      state.lastInteract = performance.now();
    });
  }

  document.addEventListener('ks-bar', (e) => {
    if (typeof e.detail !== 'boolean') return;
    host.classList.toggle('is-bar-collapsed', e.detail);
    syncBarHandle();
  });

  /* ---------- мышь / тач ---------- */
  function localXY(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  }

  function onDown(e) {
    const panByMouse = e.button === 2 || e.button === 1 || (e.button === 0 && e.shiftKey);
    state.mode = (panByMouse || inputMode === 'pan') ? 'pan' : 'orbit';
    state.moved = 0;
    state.lastX = e.clientX; state.lastY = e.clientY;
    state.auto = false;
    host.classList.add('is-dragging');
    canvas.style.cursor = 'grabbing';
    canvas.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!state.mode) {
      const { x, y, w, h } = localXY(e);
      const hit = pick((x / w) * 2 - 1, 1 - (y / h) * 2);
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      return;
    }
    const dx = e.clientX - state.lastX, dy = e.clientY - state.lastY;
    state.lastX = e.clientX; state.lastY = e.clientY;
    state.moved += Math.abs(dx) + Math.abs(dy);
    if (state.mode === 'pan') {
      const k = state.dist * 0.0016;
      state.panX -= dx * k;
      state.panY += dy * k;
    } else {
      state.yaw -= dx * 0.008;
      state.pitch = Math.max(-1.3, Math.min(1.3, state.pitch + dy * 0.008));
    }
    state.lastInteract = performance.now();
  }

  function onUp(e) {
    const wasDrag = state.moved > 6;
    state.mode = null;
    host.classList.remove('is-dragging');
    canvas.style.cursor = 'grab';
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    state.lastInteract = performance.now();

    if (wasDrag || e.button === 2 || inputMode === 'pan') return;

    // клик без перетаскивания — выбрать деталь
    const { x, y, w, h } = localXY(e);
    const hit = pick((x / w) * 2 - 1, 1 - (y / h) * 2);
    if (hit) select(hit, true);
  }
  function onWheel(e) {
    e.preventDefault();
    state.auto = false;
    state.targetDist = Math.max(2.8, Math.min(7.5, state.targetDist * Math.exp(e.deltaY * 0.0012)));
    state.lastInteract = performance.now();
  }

  canvas.addEventListener('pointerdown', (e) => { if (pinching || (e.pointerType === 'touch' && !e.isPrimary)) return; onDown(e); });
  canvas.addEventListener('pointermove', (e) => { if (pinching) return; onMove(e); });
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  /* пинч двумя пальцами */
  let pinchStart = 0, pinchDist = 0, pinching = false, lastCx = 0, lastCy = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinching = true;
      state.mode = null;
      pinchStart = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchDist = state.targetDist;
      lastCx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      lastCy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      state.auto = false;
      state.lastInteract = performance.now();
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart > 0) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      state.targetDist = Math.max(2.8, Math.min(7.5, pinchDist * (pinchStart / Math.max(d, 1))));
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const k = state.dist * 0.0016;
      state.panX -= (cx - lastCx) * k;
      state.panY += (cy - lastCy) * k;
      lastCx = cx; lastCy = cy;
      state.lastInteract = performance.now();
    }
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!e.touches || e.touches.length < 2) { pinching = false; pinchStart = 0; }
  }, { passive: true });

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
  let prev = performance.now(), running = false, rafId = 0;
  function start() { if (!running) { running = true; prev = performance.now(); rafId = requestAnimationFrame(loop); } }
  function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }

  function loop(now) {
    if (!running) return;
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    if (state.auto) state.yaw += 0.12 * dt;
    if (now - state.lastInteract > 8000 && !selected) state.auto = true;
    state.dist += (state.targetDist - state.dist) * 0.1;
    for (const p of PARTS) {
      const k = Math.min(1, dt * 6);
      p.offset += (p.target - p.offset) * k;
      if (Math.abs(p.target - p.offset) < 0.001) p.offset = p.target;
    }
    if (selected && slider && document.activeElement !== slider) {
      slider.value = String(Math.round(selected.offset * 1000));
    }
    draw();
    rafId = requestAnimationFrame(loop);
  }

  document.addEventListener('ks-explode', () => {
    if (!ready) { pendingExplode = true; return; }
    PARTS.forEach(p => { p.target = 1; });
    state.auto = false;
    start();
  });

  document.addEventListener('ks-view', (e) => {
    if (e.detail === 'box') { start(); if (bar) bar.hidden = false; } else { stop(); if (bar) bar.hidden = true; }
  });

  canvas.addEventListener('dblclick', () => {
    state.yaw = 0.62; state.pitch = 0.34; state.targetDist = 4.2;
    state.panX = 0; state.panY = 0; state.auto = true;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('ks-mode', (e) => {
    if (e.detail === 'pan' || e.detail === 'orbit') inputMode = e.detail;
  });

  fetch('models/corebox.glb')
    .then(r => { if (!r.ok) throw new Error('нет модели'); return r.arrayBuffer(); })
    .then(buf => setupParts(parseGlb(buf)))
    .catch(() => {});
})();
