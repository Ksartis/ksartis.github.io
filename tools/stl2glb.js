'use strict';
// Конвертер бинарного STL -> GLB (glTF 2.0), без зависимостей.
// Использование: node stl2glb.js <in.stl> <out.glb> [scaleTarget]

const fs = require('fs');

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error('usage: node stl2glb.js <in.stl> <out.glb>');
  process.exit(1);
}

const buf = fs.readFileSync(inPath);

// --- parse STL ---
let triangles = 0;
let isBinary = false;

if (buf.length >= 84) {
  const count = buf.readUInt32LE(80);
  if (84 + count * 50 === buf.length && count > 0) {
    isBinary = true;
    triangles = count;
  }
}

if (!isBinary) {
  // ASCII STL
  const text = buf.toString('utf8');
  const verts = [];
  const re = /vertex\s+([-\d.eE+]+)\s+([-\d.eE+]+)\s+([-\d.eE+]+)/g;
  let m;
  while ((m = re.exec(text))) {
    verts.push([parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);
  }
  triangles = Math.floor(verts.length / 3);
  const positions = new Float32Array(triangles * 9);
  const normals = new Float32Array(triangles * 9);
  for (let t = 0; t < triangles; t++) {
    const a = verts[t * 3], b = verts[t * 3 + 1], c = verts[t * 3 + 2];
    const n = faceNormal(a, b, c);
    for (let k = 0; k < 3; k++) {
      const v = verts[t * 3 + k];
      positions[t * 9 + k * 3] = v[0];
      positions[t * 9 + k * 3 + 1] = v[1];
      positions[t * 9 + k * 3 + 2] = v[2];
      normals[t * 9 + k * 3] = n[0];
      normals[t * 9 + k * 3 + 1] = n[1];
      normals[t * 9 + k * 3 + 2] = n[2];
    }
  }
  writeGlb(positions, normals, triangles);
  process.exit(0);
}

// binary
const positions = new Float32Array(triangles * 9);
const normals = new Float32Array(triangles * 9);
let off = 84;
for (let t = 0; t < triangles; t++) {
  const nx = buf.readFloatLE(off), ny = buf.readFloatLE(off + 4), nz = buf.readFloatLE(off + 8);
  off += 12;
  let a = [buf.readFloatLE(off), buf.readFloatLE(off + 4), buf.readFloatLE(off + 8)];
  let b = [buf.readFloatLE(off + 12), buf.readFloatLE(off + 16), buf.readFloatLE(off + 20)];
  const c = [buf.readFloatLE(off + 24), buf.readFloatLE(off + 28), buf.readFloatLE(off + 32)];
  off += 36 + 2;

  let n = faceNormal(a, b, c);
  // согласуем нормаль с сохранённой
  if (nx * n[0] + ny * n[1] + nz * n[2] < 0) {
    const tmp = b; b = a; a = tmp; // flip winding
    n = [-n[0], -n[1], -n[2]];
  }
  n = normalize(n);

  const tri = [a, b, c];
  for (let k = 0; k < 3; k++) {
    positions[t * 9 + k * 3] = tri[k][0];
    positions[t * 9 + k * 3 + 1] = tri[k][1];
    positions[t * 9 + k * 3 + 2] = tri[k][2];
    normals[t * 9 + k * 3] = n[0];
    normals[t * 9 + k * 3 + 1] = n[1];
    normals[t * 9 + k * 3 + 2] = n[2];
  }
}

writeGlb(positions, normals, triangles);

// --- helpers ---
function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}
function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function writeGlb(positions, normals, triCount) {
  // перевод Z-up -> Y-up и нормализация размера
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 2], z = -positions[i + 1]; // Z-up -> Y-up
    positions[i] = x; positions[i + 1] = y; positions[i + 2] = z;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i], y = normals[i + 2], z = -normals[i + 1];
    normals[i] = x; normals[i + 1] = y; normals[i + 2] = z;
  }

  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const scale = 1 / size;
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * scale;
    positions[i + 1] = (positions[i + 1] - cy) * scale;
    positions[i + 2] = (positions[i + 2] - cz) * scale;
  }

  const posBytes = positions.byteLength;
  const normBytes = normals.byteLength;
  const bin = Buffer.alloc(posBytes + normBytes);
  Buffer.from(positions.buffer, positions.byteOffset, posBytes).copy(bin, 0);
  Buffer.from(normals.buffer, normals.byteOffset, normBytes).copy(bin, posBytes);

  const count = positions.length / 3;
  const json = {
    asset: { version: '2.0', generator: 'ksartis stl2glb' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0, mode: 4 }] }],
    materials: [{
      pbrMetallicRoughness: {
        baseColorFactor: [0.72, 0.73, 0.76, 1],
        metallicFactor: 0.35,
        roughnessFactor: 0.42
      },
      doubleSided: true
    }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes, target: 34962 },
      { buffer: 0, byteOffset: posBytes, byteLength: normBytes, target: 34962 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
      { bufferView: 1, componentType: 5126, count, type: 'VEC3' }
    ]
  };

  let jsonStr = JSON.stringify(json);
  while (jsonStr.length % 4 !== 0) jsonStr += ' ';
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  const binPadded = Buffer.alloc(Math.ceil(bin.length / 4) * 4);
  bin.copy(binPadded);

  const total = 12 + 8 + jsonBuf.length + 8 + binPadded.length;
  const out = Buffer.alloc(total);
  let p = 0;
  out.write('glTF', p); p += 4;
  out.writeUInt32LE(2, p); p += 4;
  out.writeUInt32LE(total, p); p += 4;

  out.writeUInt32LE(jsonBuf.length, p); p += 4;
  out.write('JSON', p); p += 4;
  jsonBuf.copy(out, p); p += jsonBuf.length;

  out.writeUInt32LE(binPadded.length, p); p += 4;
  out.write('BIN\0', p); p += 4;
  binPadded.copy(out, p);

  fs.writeFileSync(outPath, out);
  console.log(`OK  ${triCount} треугольников, ${(out.length / 1024 / 1024).toFixed(2)} MB -> ${outPath}`);
}
