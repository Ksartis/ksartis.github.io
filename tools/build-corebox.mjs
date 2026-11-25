// Сборка разъёмного стержневого ящика настоящими булевыми операциями (manifold-3d).
// Результат — GLB с тремя деталями: нижняя половина, верхняя половина, стержень.

import Module from 'manifold-3d';
import fs from 'node:fs';
import path from 'node:path';

const wasm = await Module();
wasm.setup();
const { Manifold } = wasm;

/* ---------- размеры (единицы условные) ---------- */
const OUT_X = 1.40, OUT_Y = 0.70, OUT_Z = 1.10;
const CORE_X = 1.00, CORE_Y = 0.30, CORE_Z = 0.70;
const PRINT_D = 0.14, PRINT_L = 0.18;   // знаки: диаметр и вылет
const GAP = 0.006;                       // зазор между стержнем и полостью

/* ---------- инструменты ---------- */
function box(x, y, z, tx = 0, ty = 0, tz = 0) {
  return Manifold.cube([x, y, z], true).translate([tx, ty, tz]);
}
function cylZ(d, h, tx, ty, tz) {
  // цилиндр вдоль Z
  return Manifold.cylinder(h, d / 2, d / 2, 48, true).rotate([90, 0, 0]).translate([tx, ty, tz]);
}
function cylX(d, h, tx, ty, tz) {
  return Manifold.cylinder(h, d / 2, d / 2, 48, true).rotate([0, 90, 0]).translate([tx, ty, tz]);
}

/* ---------- полость: стержень + знаки ---------- */
const coreBlock = box(CORE_X, CORE_Y, CORE_Z);
const printL = cylX(PRINT_D, PRINT_L, -(CORE_X / 2 + PRINT_L / 2), 0, 0);
const printR = cylX(PRINT_D, PRINT_L, (CORE_X / 2 + PRINT_L / 2), 0, 0);
const cavity = coreBlock.add(printL).add(printR);

/* ---------- половины ящика ---------- */
const outer = box(OUT_X, OUT_Y, OUT_Z);
const lowerBlank = box(OUT_X, OUT_Y / 2, OUT_Z, 0, -OUT_Y / 4, 0);
const upperBlank = box(OUT_X, OUT_Y / 2, OUT_Z, 0, OUT_Y / 4, 0);

// набивочное отверстие сверху: через верхнюю стенку в полость
const fillHole = box(0.62, 0.30, 0.46, 0, 0.22, 0);

const lower = lowerBlank.subtract(cavity);
const upper = upperBlank.subtract(cavity).subtract(fillHole);

/* ---------- стержень (с зазором) ---------- */
const core = box(CORE_X - GAP * 2, CORE_Y - GAP * 2, CORE_Z - GAP * 2)
  .add(cylX(PRINT_D - GAP * 2, PRINT_L - GAP, -(CORE_X / 2 + PRINT_L / 2), 0, 0))
  .add(cylX(PRINT_D - GAP * 2, PRINT_L - GAP, (CORE_X / 2 + PRINT_L / 2), 0, 0));

/* ---------- в GLB ---------- */
function meshToArrays(m) {
  const mesh = m.getMesh();
  const verts = mesh.vertProperties;      // xyz
  const numProp = mesh.numProp;
  const tris = mesh.triVerts;
  const pos = [];
  const nor = [];
  for (let i = 0; i < tris.length; i += 3) {
    const i0 = tris[i] * numProp, i1 = tris[i + 1] * numProp, i2 = tris[i + 2] * numProp;
    const a = [verts[i0], verts[i0 + 1], verts[i0 + 2]];
    const b = [verts[i1], verts[i1 + 1], verts[i1 + 2]];
    const c = [verts[i2], verts[i2 + 1], verts[i2 + 2]];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const p of [a, b, c]) {
      pos.push(p[0], p[1], p[2]);
      nor.push(nx, ny, nz);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nor), count: pos.length / 3 };
}

const parts = [
  { name: 'lower', color: [0.64, 0.66, 0.70, 1], data: meshToArrays(lower) },
  { name: 'upper', color: [0.72, 0.74, 0.78, 1], data: meshToArrays(upper) },
  { name: 'core', color: [0.78, 0.68, 0.46, 1], data: meshToArrays(core) }
];

// общий бинарный буфер
let offset = 0;
const bufferViews = [];
const accessors = [];
const binParts = [];

parts.forEach((p, i) => {
  const posBytes = Buffer.from(p.data.positions.buffer, p.data.positions.byteOffset, p.data.positions.byteLength);
  const norBytes = Buffer.from(p.data.normals.buffer, p.data.normals.byteOffset, p.data.normals.byteLength);

  // min/max
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const a = p.data.positions;
  for (let k = 0; k < a.length; k += 3) {
    if (a[k] < minX) minX = a[k]; if (a[k] > maxX) maxX = a[k];
    if (a[k + 1] < minY) minY = a[k + 1]; if (a[k + 1] > maxY) maxY = a[k + 1];
    if (a[k + 2] < minZ) minZ = a[k + 2]; if (a[k + 2] > maxZ) maxZ = a[k + 2];
  }
  p.bbox = { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2] };

  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: posBytes.length, target: 34962 });
  accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: p.data.count, type: 'VEC3', min: [minX, minY, minZ], max: [maxX, maxY, maxZ] });
  binParts.push(posBytes); offset += posBytes.length;

  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: norBytes.length, target: 34962 });
  accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: p.data.count, type: 'VEC3' });
  binParts.push(norBytes); offset += norBytes.length;
});

// выравнивание до 4 байт
if (offset % 4 !== 0) {
  const pad = Buffer.alloc(4 - (offset % 4));
  binParts.push(pad);
  offset += pad.length;
}

const json = {
  asset: { version: '2.0', generator: 'ksartis manifold corebox' },
  scene: 0,
  scenes: [{ nodes: parts.map((_, i) => i) }],
  nodes: parts.map((p, i) => ({ mesh: i, name: p.name })),
  meshes: parts.map((p, i) => ({
    name: p.name,
    primitives: [{
      attributes: { POSITION: i * 2, NORMAL: i * 2 + 1 },
      material: i,
      mode: 4
    }]
  })),
  materials: parts.map(p => ({
    name: p.name,
    pbrMetallicRoughness: {
      baseColorFactor: p.color,
      metallicFactor: 0.25,
      roughnessFactor: 0.55
    },
    doubleSided: true
  })),
  buffers: [{ byteLength: offset }],
  bufferViews,
  accessors
};

let jsonStr = JSON.stringify(json);
while (jsonStr.length % 4 !== 0) jsonStr += ' ';
const jsonBuf = Buffer.from(jsonStr, 'utf8');
const bin = Buffer.concat(binParts);

const total = 12 + 8 + jsonBuf.length + 8 + bin.length;
const out = Buffer.alloc(total);
let p = 0;
out.write('glTF', p); p += 4;
out.writeUInt32LE(2, p); p += 4;
out.writeUInt32LE(total, p); p += 4;
out.writeUInt32LE(jsonBuf.length, p); p += 4;
out.write('JSON', p); p += 4;
jsonBuf.copy(out, p); p += jsonBuf.length;
out.writeUInt32LE(bin.length, p); p += 4;
out.write('BIN\0', p); p += 4;
bin.copy(out, p);

const dst = path.resolve('public/models/corebox.glb');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, out);

console.log('OK', dst, (out.length / 1024 / 1024).toFixed(2), 'MB');
parts.forEach(p => console.log(' ', p.name, p.data.count, 'вершин, bbox', JSON.stringify(p.bbox.min), JSON.stringify(p.bbox.max)));
