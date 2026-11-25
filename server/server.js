'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

// ---------- paths & config ----------
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CONTENT_DIR = path.join(ROOT, 'content');
const IMG_DIR = path.join(PUBLIC_DIR, 'img');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  const out = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m) out[m[1]] = m[2];
    }
  }
  return out;
}

const env = loadEnv();
const PORT = Number(env.PORT || process.env.PORT || 8080);
const PASSWORD = env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'ksartis2026';
const SECRET = env.SESSION_SECRET || process.env.SESSION_SECRET || 'dev-secret-change-me';
const COOKIE = 'ks_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

for (const dir of [PUBLIC_DIR, CONTENT_DIR, IMG_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ---------- helpers ----------
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeJson(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function hmac(value) {
  return crypto.createHmac('sha256', SECRET).update(value).digest('base64url');
}

function makeSession() {
  const exp = Date.now() + SESSION_TTL_MS;
  return `${exp}.${hmac(String(exp))}`;
}

function checkSession(cookieHeader) {
  if (!cookieHeader) return false;
  const pair = cookieHeader.split(';').map(s => s.trim()).find(s => s.startsWith(COOKIE + '='));
  if (!pair) return false;
  const token = decodeURIComponent(pair.slice(COOKIE.length + 1));
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = hmac(exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordOk(input) {
  const a = Buffer.from(String(input || ''));
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || '');
  res.writeHead(status, Object.assign({
    'Content-Length': buf.length,
    'X-Content-Type-Options': 'nosniff'
  }, headers));
  res.end(buf);
}

function sendJson(res, status, obj, headers = {}) {
  send(res, status, JSON.stringify(obj), Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }, headers));
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) { reject(new Error('too_large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  return p.startsWith(base) ? p : null;
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin' || rel === '/admin/') rel = '/admin.html';

  const file = safeJoin(PUBLIC_DIR, rel);
  if (!file) return send(res, 403, 'Forbidden');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      const fallback = safeJoin(PUBLIC_DIR, '/index.html');
      if (fallback && fs.existsSync(fallback) && !path.extname(rel)) {
        return streamFile(res, fallback, '/index.html');
      }
      return send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    streamFile(res, file, rel);
  });
}

function streamFile(res, file, rel) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const headers = { 'Content-Type': type };
  if (ext === '.jpg' || ext === '.png' || ext === '.webp') {
    headers['Cache-Control'] = 'public, max-age=3600';
  } else {
    headers['Cache-Control'] = 'no-store';
  }
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

// ---------- API ----------
async function handleApi(req, res, url) {
  const route = url.pathname;
  const authed = checkSession(req.headers.cookie);

  if (route === '/api/login' && req.method === 'POST') {
    const body = await readBody(req, 64 * 1024);
    let data = {};
    try { data = JSON.parse(body.toString('utf8')); } catch {}
    if (!passwordOk(data.password)) return sendJson(res, 401, { ok: false, error: 'Неверный пароль' });
    const token = makeSession();
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
    });
  }

  if (route === '/api/logout' && req.method === 'POST') {
    return sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
    });
  }

  if (route === '/api/session' && req.method === 'GET') {
    return sendJson(res, 200, { authed });
  }

  if (route === '/api/works' && req.method === 'GET') {
    const db = readJson(path.join(CONTENT_DIR, 'works.json'), { works: [] });
    const works = Array.isArray(db.works) ? db.works : [];
    const list = authed ? works : works.filter(w => w.published !== false);
    return sendJson(res, 200, { works: list });
  }

  if (route === '/api/works' && req.method === 'PUT') {
    if (!authed) return sendJson(res, 401, { ok: false, error: 'Нужен вход' });
    const body = await readBody(req, 2 * 1024 * 1024);
    let data;
    try { data = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: 'Некорректный JSON' }); }
    if (!data || !Array.isArray(data.works)) return sendJson(res, 400, { ok: false, error: 'Ожидается { works: [...] }' });
    const clean = data.works.map((w, i) => ({
      id: String(w.id || `work-${Date.now()}-${i}`).slice(0, 80),
      title: String(w.title || '').slice(0, 200),
      category: String(w.category || 'Прочее').slice(0, 60),
      description: String(w.description || '').slice(0, 2000),
      image: String(w.image || '').slice(0, 300),
      order: Number.isFinite(+w.order) ? +w.order : i + 1,
      published: w.published !== false
    }));
    writeJson(path.join(CONTENT_DIR, 'works.json'), { works: clean });
    return sendJson(res, 200, { ok: true, works: clean });
  }

  if (route === '/api/settings' && req.method === 'GET') {
    const all = readJson(path.join(CONTENT_DIR, 'settings.json'), {});
    if (authed) return sendJson(res, 200, all);
    const { brand, tagline, hero_title, hero_text, about, contacts, stats } = all;
    return sendJson(res, 200, { brand, tagline, hero_title, hero_text, about, contacts, stats });
  }

  if (route === '/api/settings' && req.method === 'PUT') {
    if (!authed) return sendJson(res, 401, { ok: false, error: 'Нужен вход' });
    const body = await readBody(req, 512 * 1024);
    let data;
    try { data = JSON.parse(body.toString('utf8')); } catch { return sendJson(res, 400, { ok: false, error: 'Некорректный JSON' }); }
    const file = path.join(CONTENT_DIR, 'settings.json');
    const current = readJson(file, {});
    writeJson(file, Object.assign({}, current, data));
    return sendJson(res, 200, { ok: true });
  }

  if (route === '/api/upload' && req.method === 'POST') {
    if (!authed) return sendJson(res, 401, { ok: false, error: 'Нужен вход' });
    const rawName = String(req.headers['x-file-name'] || 'image');
    const ext = path.extname(rawName).toLowerCase() || '.jpg';
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return sendJson(res, 400, { ok: false, error: 'Поддерживаются JPG, PNG, WEBP' });
    }
    const body = await readBody(req, 20 * 1024 * 1024);
    if (!body.length) return sendJson(res, 400, { ok: false, error: 'Пустой файл' });
    const base = path.basename(rawName, ext)
      .toLowerCase()
      .replace(/[^a-z0-9а-яё]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'image';
    const name = `${base}-${Date.now().toString(36)}${ext === '.jpeg' ? '.jpg' : ext}`;
    fs.writeFileSync(path.join(IMG_DIR, name), body);
    return sendJson(res, 200, { ok: true, path: `/img/${name}` });
  }

  if (route === '/api/upload' && req.method === 'DELETE') {
    if (!authed) return sendJson(res, 401, { ok: false, error: 'Нужен вход' });
    const body = await readBody(req, 16 * 1024);
    let data = {};
    try { data = JSON.parse(body.toString('utf8')); } catch {}
    const rel = String(data.path || '');
    const file = safeJoin(IMG_DIR, rel.replace(/^\/?img\//, ''));
    if (!file || path.dirname(file) !== IMG_DIR) return sendJson(res, 400, { ok: false, error: 'Некорректный путь' });
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { ok: false, error: 'Не найдено' });
}

// ---------- server ----------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url).catch(err => {
      const code = err && err.message === 'too_large' ? 413 : 500;
      sendJson(res, code, { ok: false, error: code === 413 ? 'Файл слишком большой' : 'Ошибка сервера' });
    });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log('');
  console.log('  Сайт:    http://localhost:' + PORT);
  console.log('  Админка: http://localhost:' + PORT + '/admin');
  console.log('  Пароль:  из файла .env (сейчас: ' + (PASSWORD === 'ksartis2026' ? 'ksartis2026 — смените!' : 'задан') + ')');
  console.log('  Локальная сеть: http://<IP-компьютера>:' + PORT);
  console.log('');
});
