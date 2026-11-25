// Cloudflare Pages Functions — API для админки и сайта.
// Хранение: KV (works, settings) + R2 (фото). Пароль и секрет — в переменных окружения.

const COOKIE = 'ks_session';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 дней
const MAX_UPLOAD = 20 * 1024 * 1024;

/* ---------------- утилиты ---------------- */

const enc = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }, headers)
  });
}

function b64url(bytes) {
  let bin = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return b64url(sig);
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const raw = request.headers.get('Cookie') || '';
  const hit = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}

async function isAuthed(request, env) {
  const token = getCookie(request, COOKIE);
  if (!token) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = await hmac(env.SESSION_SECRET, exp);
  return safeEqual(sig, expected);
}

async function readJson(env, key, fallback) {
  const raw = await env.WORKS.get(key);
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

function cleanWorks(list) {
  return list.map((w, i) => ({
    id: String(w.id || `work-${Date.now()}-${i}`).slice(0, 80),
    title: String(w.title || '').slice(0, 200),
    category: String(w.category || 'Прочее').slice(0, 60),
    description: String(w.description || '').slice(0, 2000),
    image: String(w.image || '').slice(0, 300),
    order: Number.isFinite(Number(w.order)) ? Number(w.order) : i + 1,
    published: w.published !== false
  }));
}

/* ---------------- обработчик ---------------- */

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = '/' + (Array.isArray(params.path) ? params.path.join('/') : (params.path || ''));
  const method = request.method;
  const authed = await isAuthed(request, env);

  const secure = url.protocol === 'https:' ? '; Secure' : '';

  /* --- вход / выход --- */
  if (path === '/login' && method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch {}
    if (!env.ADMIN_PASSWORD || !safeEqual(String(body.password || ''), env.ADMIN_PASSWORD)) {
      return json({ ok: false, error: 'Неверный пароль' }, 401);
    }
    const exp = String(Date.now() + SESSION_TTL * 1000);
    const sig = await hmac(env.SESSION_SECRET, exp);
    const cookie = `${COOKIE}=${encodeURIComponent(exp + '.' + sig)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL}${secure}`;
    return json({ ok: true }, 200, { 'Set-Cookie': cookie });
  }

  if (path === '/logout' && method === 'POST') {
    return json({ ok: true }, 200, {
      'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
    });
  }

  if (path === '/session' && method === 'GET') {
    return json({ authed });
  }

  /* --- работы --- */
  if (path === '/works' && method === 'GET') {
    const db = await readJson(env, 'works', { works: [] });
    const works = Array.isArray(db.works) ? db.works : [];
    const list = authed ? works : works.filter(w => w.published !== false);
    return json({ works: list });
  }

  if (path === '/works' && method === 'PUT') {
    if (!authed) return json({ ok: false, error: 'Нужен вход' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'Некорректный JSON' }, 400); }
    if (!body || !Array.isArray(body.works)) return json({ ok: false, error: 'Ожидается { works: [...] }' }, 400);
    const works = cleanWorks(body.works);
    await env.WORKS.put('works', JSON.stringify({ works }));
    return json({ ok: true, works });
  }

  /* --- настройки --- */
  if (path === '/settings' && method === 'GET') {
    const all = await readJson(env, 'settings', {});
    if (authed) return json(all);
    const { brand, tagline, hero_title, hero_text, about, contacts, stats } = all;
    return json({ brand, tagline, hero_title, hero_text, about, contacts, stats });
  }

  if (path === '/settings' && method === 'PUT') {
    if (!authed) return json({ ok: false, error: 'Нужен вход' }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: 'Некорректный JSON' }, 400); }
    const current = await readJson(env, 'settings', {});
    await env.WORKS.put('settings', JSON.stringify(Object.assign({}, current, body)));
    return json({ ok: true });
  }

  /* --- загрузка фото --- */
  if (path === '/upload' && method === 'POST') {
    if (!authed) return json({ ok: false, error: 'Нужен вход' }, 401);
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_UPLOAD) return json({ ok: false, error: 'Файл больше 20 МБ' }, 413);

    const rawName = String(request.headers.get('X-File-Name') || 'image');
    const dot = rawName.lastIndexOf('.');
    const ext = dot >= 0 ? rawName.slice(dot).toLowerCase() : '.jpg';
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      return json({ ok: false, error: 'Поддерживаются JPG, PNG, WEBP' }, 400);
    }
    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ ok: false, error: 'Пустой файл' }, 400);

    const base = (dot >= 0 ? rawName.slice(0, dot) : rawName)
      .toLowerCase().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'image';
    const name = `${base}-${Date.now().toString(36)}${ext === '.jpeg' ? '.jpg' : ext}`;

    await env.IMAGES.put('img/' + name, body, {
      httpMetadata: { contentType: ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg' }
    });
    return json({ ok: true, path: '/api/img/' + name });
  }

  if (path === '/upload' && method === 'DELETE') {
    if (!authed) return json({ ok: false, error: 'Нужен вход' }, 401);
    let body = {};
    try { body = await request.json(); } catch {}
    const rel = String(body.path || '').replace(/^\/?api\/img\//, '').replace(/^\/?img\//, '');
    if (!/^[\w.\-а-яё]+$/i.test(rel)) return json({ ok: false, error: 'Некорректный путь' }, 400);
    await env.IMAGES.delete('img/' + rel);
    return json({ ok: true });
  }

  /* --- выдача фото из R2 --- */
  if (path.startsWith('/img/') && method === 'GET') {
    const rel = path.slice('/img/'.length);
    if (!/^[\w.\-а-яё]+$/i.test(rel)) return new Response('Bad request', { status: 400 });
    const obj = await env.IMAGES.get('img/' + rel);
    if (!obj) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    headers.set('ETag', obj.httpEtag);
    return new Response(obj.body, { headers });
  }

  return json({ ok: false, error: 'Не найдено' }, 404);
}
