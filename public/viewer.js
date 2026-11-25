'use strict';
/* Минимальный WebGL-вьюер: загрузка GLB, вращение, зум, авто-поворот. Без библиотек. */

(function () {
  const host = document.getElementById('viewer');
  const canvas = document.getElementById('viewer-canvas');
  if (!host || !canvas) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- матрицы ---------- */
  function mat4Identity() {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }
  function lookAt(eye, center, up) {
    let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
    let l = Math.hypot(zx, zy, zz) || 1;
    zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy;
    let xy = up[2] * zx - up[0] * zz;
    let xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1;
    xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;
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
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  }

  /* ---------- GLB ---------- */
  function parseGlb(buffer) {
    const dv = new DataView(buffer);
    if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('не GLB');
    let offset = 12;
    let json = null;
    let bin = null;
    while (offset < buffer.byteLength) {
      const len = dv.getUint32(offset, true);
      const type = dv.getUint32(offset + 4, true);
      const data = new Uint8Array(buffer, offset + 8, len);
      if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(data));
      else if (type === 0x004E4942) bin = data;
      offset += 8 + len + ((4 - (len % 4)) % 4);
    }
    if (!json || !bin) throw new Error('битый GLB');
    const prim = json.meshes[0].primitives[0];
    const readAcc = (idx) => {
      const acc = json.accessors[idx];
      const bv = json.bufferViews[acc.bufferView];
      const start = (bv.byteOffset || 0) + (acc.byteOffset || 0);
      if (acc.componentType !== 5126 || acc.type !== 'VEC3') throw new Error('формат не поддержан');
      return new Float32Array(bin.buffer, bin.byteOffset + start, acc.count * 3);
    };
    return {
      positions: readAcc(prim.attributes.POSITION),
      normals: readAcc(prim.attributes.NORMAL),
      count: json.accessors[prim.attributes.POSITION].count
    };
  }

  /* ---------- GL ---------- */
  const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) { host.classList.add('viewer--fallback'); return; }

  const VS = `
    attribute vec3 aPos;
    attribute vec3 aNormal;
    uniform mat4 uProj;
    uniform mat4 uView;
    varying vec3 vNormal;
    varying vec3 vWorld;
    void main() {
      vNormal = aNormal;
      vWorld = aPos;
      gl_Position = uProj * uView * vec4(aPos, 1.0);
    }
  `;
  const FS = `
    precision mediump float;
    varying vec3 vNormal;
    varying vec3 vWorld;
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
      vec3 base = vec3(0.565, 0.580, 0.620);
      vec3 col = base * (0.30 + 0.95 * d1 + 0.30 * d2 + 0.10 * d3);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5);
      col += vec3(0.85, 0.90, 1.0) * rim * 0.28;
      float spec = pow(max(dot(normalize(L1 + V), N), 0.0), 42.0);
      col += vec3(1.0) * spec * 0.22;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
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
    uEye: gl.getUniformLocation(prog, 'uEye')
  };

  let mesh = null;
  let ready = false;

  function upload(model) {
    const pbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
    gl.bufferData(gl.ARRAY_BUFFER, model.positions, gl.STATIC_DRAW);

    const nbuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
    gl.bufferData(gl.ARRAY_BUFFER, model.normals, gl.STATIC_DRAW);

    mesh = { pbuf, nbuf, count: model.count };
    ready = true;
    host.classList.add('is-ready');
  }

  /* ---------- сцена ---------- */
  const state = {
    yaw: 0.7,
    pitch: 0.35,
    dist: 3.0,
    targetDist: 3.0,
    vy: 0,
    vp: 0,
    auto: !reduceMotion,
    lastInteract: 0,
    dragging: false,
    lastX: 0,
    lastY: 0
  };

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function draw() {
    resize();
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    if (!ready) return;

    const aspect = canvas.width / Math.max(canvas.height, 1);
    const proj = perspective(35 * Math.PI / 180, aspect, 0.05, 50);
    const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
    const eye = [
      state.dist * cp * Math.sin(state.yaw),
      state.dist * sp,
      state.dist * cp * Math.cos(state.yaw)
    ];
    const view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
    const mvp = multiply(proj, view);

    gl.useProgram(prog);
    gl.uniformMatrix4fv(loc.uProj, false, proj);
    gl.uniformMatrix4fv(loc.uView, false, view);
    gl.uniform3fv(loc.uEye, eye);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.pbuf);
    gl.enableVertexAttribArray(loc.aPos);
    gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nbuf);
    gl.enableVertexAttribArray(loc.aNormal);
    gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
    return mvp;
  }

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

    if (state.auto && !state.dragging) {
      state.yaw += 0.35 * dt;
    }
    if (!state.dragging) {
      state.yaw += state.vy;
      state.pitch += state.vp;
      state.vy *= 0.94;
      state.vp *= 0.94;
      if (Math.abs(state.vy) < 1e-5) state.vy = 0;
      if (Math.abs(state.vp) < 1e-5) state.vp = 0;
    }
    state.pitch = Math.max(-1.35, Math.min(1.35, state.pitch));
    state.dist += (state.targetDist - state.dist) * 0.12;

    if (now - state.lastInteract > 4000 && !reduceMotion) state.auto = true;

    draw();
    rafId = requestAnimationFrame(loop);
  }

  /* ---------- управление ---------- */
  function onDown(e) {
    state.dragging = true;
    state.auto = false;
    state.lastInteract = performance.now();
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    host.classList.add('is-dragging');
    canvas.setPointerCapture(e.pointerId);
  }
  function onMove(e) {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastX;
    const dy = e.clientY - state.lastY;
    state.lastX = e.clientX;
    state.lastY = e.clientY;
    state.yaw -= dx * 0.008;
    state.pitch += dy * 0.008;
    state.vy = -dx * 0.0006;
    state.vp = dy * 0.0006;
    state.lastInteract = performance.now();
  }
  function onUp(e) {
    state.dragging = false;
    state.lastInteract = performance.now();
    host.classList.remove('is-dragging');
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
  }
  function onWheel(e) {
    e.preventDefault();
    state.auto = false;
    state.targetDist = Math.max(1.8, Math.min(6.0, state.targetDist * Math.exp(e.deltaY * 0.0012)));
    state.lastInteract = performance.now();
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('dblclick', () => {
    state.yaw = 0.7; state.pitch = 0.35; state.targetDist = 3.0; state.auto = true;
  });

  // touch: пинч
  let pinchStart = 0;
  let pinchDist = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchStart = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchDist = state.targetDist;
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchStart > 0) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      state.targetDist = Math.max(1.8, Math.min(6.0, pinchDist * (pinchStart / Math.max(d, 1))));
    }
  }, { passive: true });
  canvas.addEventListener('touchend', () => { pinchStart = 0; }, { passive: true });

  /* ---------- загрузка ---------- */
  fetch(host.dataset.model || 'models/otvod.glb')
    .then(r => { if (!r.ok) throw new Error('нет модели'); return r.arrayBuffer(); })
    .then(buf => { upload(parseGlb(buf)); start(); })
    .catch(() => { host.classList.add('viewer--fallback'); });

  document.addEventListener('ks-view', (e) => {
    if (e.detail === 'model') start(); else stop();
  });
})();
