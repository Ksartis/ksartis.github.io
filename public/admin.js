'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const loginView = $('#login-view');
const appView = $('#app-view');
const loginForm = $('#login-form');
const loginError = $('#login-error');
const passwordInput = $('#password');
const logoutBtn = $('#logout');

let WORKS = [];
let SETTINGS = {};
let IS_AUTHED = false;

/* ---------- session ---------- */
async function checkSession() {
  try {
    const res = await fetch('/api/session');
    const data = await res.json();
    IS_AUTHED = !!data.authed;
  } catch { IS_AUTHED = false; }
  updateView();
}

function updateView() {
  if (IS_AUTHED) {
    loginView.hidden = true;
    appView.hidden = false;
    logoutBtn.hidden = false;
    loadWorks();
    loadSettings();
  } else {
    loginView.hidden = false;
    appView.hidden = true;
    logoutBtn.hidden = true;
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.hidden = true;
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: passwordInput.value })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        loginError.textContent = data.error || 'Не удалось войти';
        loginError.hidden = false;
        return;
      }
      passwordInput.value = '';
      IS_AUTHED = true;
      updateView();
    } catch {
      loginError.textContent = 'Сервер недоступен';
      loginError.hidden = false;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch {}
    IS_AUTHED = false;
    updateView();
  });
}

/* ---------- tabs ---------- */
$$('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('[data-tab]').forEach(b => b.classList.toggle('is-active', b === btn));
    $('#tab-works').hidden = btn.dataset.tab !== 'works';
    $('#tab-settings').hidden = btn.dataset.tab !== 'settings';
  });
});

/* ---------- works ---------- */
const worksList = $('#works-list');
const worksStatus = $('#works-status');

function setStatus(el, text, isError) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-error', !!isError);
  if (text) setTimeout(() => { el.textContent = ''; }, 4000);
}

async function loadWorks() {
  try {
    const res = await fetch('/api/works');
    if (res.status === 401) { IS_AUTHED = false; updateView(); return; }
    const data = await res.json();
    WORKS = (data.works || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
    renderWorks();
  } catch {
    setStatus(worksStatus, 'Не удалось загрузить работы', true);
  }
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function renderWorks() {
  if (!worksList) return;
  worksList.textContent = '';

  WORKS.forEach((w, idx) => {
    const card = el('article', 'work-edit');
    card.dataset.idx = String(idx);

    // media
    const media = el('div', 'work-edit__media');
    const thumb = el('div', 'work-edit__thumb');
    const img = el('img');
    img.src = w.image || '/img/placeholder.svg';
    img.alt = w.title || '';
    thumb.appendChild(img);

    const fileLabel = el('label', 'btn btn--ghost file-btn', 'Заменить фото');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp';
    fileInput.addEventListener('change', () => uploadImage(fileInput, idx, img));
    fileLabel.appendChild(fileInput);
    media.append(thumb, fileLabel);

    // fields
    const body = el('div', 'work-edit__body');
    const row = el('div', 'work-edit__row');

    const fTitle = field('Название', 'input', w.title);
    fTitle.input.dataset.field = 'title';
    const fCat = field('Категория', 'input', w.category, 'cat-list');
    fCat.input.dataset.field = 'category';
    const fOrder = field('Порядок', 'input', w.order);
    fOrder.input.type = 'number';
    fOrder.input.dataset.field = 'order';

    row.append(fTitle.wrap, fCat.wrap, fOrder.wrap);

    const fDesc = field('Описание', 'textarea', w.description);
    fDesc.input.dataset.field = 'description';
    fDesc.input.rows = 3;

    const foot = el('div', 'work-edit__foot');
    const pubLabel = document.createElement('label');
    const pub = document.createElement('input');
    pub.type = 'checkbox';
    pub.checked = w.published !== false;
    pub.dataset.field = 'published';
    pubLabel.append(pub, document.createTextNode(' Опубликовано'));

    const del = el('button', 'work-edit__del', 'Удалить');
    del.type = 'button';
    del.addEventListener('click', () => {
      if (!confirm('Удалить работу «' + (w.title || 'без названия') + '»?')) return;
      WORKS.splice(idx, 1);
      renderWorks();
      setStatus(worksStatus, 'Удалено — не забудьте сохранить');
    });

    foot.append(pubLabel, del);
    body.append(row, fDesc.wrap, foot);

    card.append(media, body);
    worksList.appendChild(card);
  });

  if (!WORKS.length) {
    worksList.appendChild(el('p', 'adm__hint', 'Пока нет работ. Нажмите «Добавить работу».'));
  }
}

function field(labelText, tag, value, listId) {
  const wrap = el('label', 'field');
  wrap.appendChild(el('span', null, labelText));
  const input = document.createElement(tag);
  if (tag === 'textarea') input.value = value || '';
  else input.value = value == null ? '' : value;
  if (listId) input.setAttribute('list', listId);
  wrap.appendChild(input);
  return { wrap, input };
}

async function uploadImage(fileInput, idx, imgEl) {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    setStatus(worksStatus, 'Файл больше 20 МБ', true);
    fileInput.value = '';
    return;
  }
  setStatus(worksStatus, 'Загружаю фото…');
  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': file.name },
      body: file
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка загрузки');
    WORKS[idx].image = data.path;
    imgEl.src = data.path;
    setStatus(worksStatus, 'Фото загружено. Нажмите «Сохранить», чтобы применить.');
  } catch (e) {
    setStatus(worksStatus, e.message || 'Не удалось загрузить фото', true);
  } finally {
    fileInput.value = '';
  }
}

function collectWorks() {
  const cards = $$('.work-edit');
  const out = [];
  cards.forEach(card => {
    const idx = Number(card.dataset.idx);
    const base = WORKS[idx] || {};
    const get = (name) => {
      const node = card.querySelector('[data-field="' + name + '"]');
      if (!node) return undefined;
      if (node.type === 'checkbox') return node.checked;
      if (node.type === 'number') return Number(node.value) || 0;
      return node.value;
    };
    out.push({
      id: base.id,
      title: get('title') || '',
      category: get('category') || 'Прочее',
      description: get('description') || '',
      image: base.image || '',
      order: get('order') || out.length + 1,
      published: get('published') !== false
    });
  });
  return out;
}

const addBtn = $('#add-work');
if (addBtn) {
  addBtn.addEventListener('click', () => {
    WORKS.push({
      id: 'work-' + Date.now().toString(36),
      title: 'Новая работа',
      category: 'Прочее',
      description: '',
      image: '',
      order: WORKS.length + 1,
      published: false
    });
    renderWorks();
    const last = worksList.lastElementChild;
    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

const saveBtn = $('#save-works');
if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    const payload = collectWorks();
    try {
      const res = await fetch('/api/works', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ works: payload })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка сохранения');
      WORKS = data.works.slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      renderWorks();
      setStatus(worksStatus, 'Сохранено');
    } catch (e) {
      setStatus(worksStatus, e.message || 'Не удалось сохранить', true);
    }
  });
}

/* ---------- settings ---------- */
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    SETTINGS = await res.json();
    fillSettings();
  } catch {}
}

function fillSettings() {
  const s = SETTINGS || {};
  const c = s.contacts || {};
  const map = {
    's-brand': s.brand || '',
    's-tagline': s.tagline || '',
    's-hero-title': s.hero_title || '',
    's-hero-text': s.hero_text || '',
    's-about': s.about || '',
    's-tg': c.telegram || '',
    's-tg-label': c.telegram_label || '',
    's-email': c.email || '',
    's-wa': c.whatsapp || ''
  };
  Object.keys(map).forEach(id => {
    const input = document.getElementById(id);
    if (input) input.value = map[id];
  });

  const statsBox = $('#stats-list');
  if (statsBox) {
    statsBox.textContent = '';
    const stats = Array.isArray(s.stats) ? s.stats.slice(0, 4) : [];
    while (stats.length < 4) stats.push({ value: '', label: '' });
    stats.forEach((st, i) => {
      const wrap = el('div', 'adm__grid2');
      const v = field('Цифра ' + (i + 1), 'input', st.value);
      v.input.dataset.stat = 'value';
      v.input.dataset.i = String(i);
      const l = field('Подпись ' + (i + 1), 'input', st.label);
      l.input.dataset.stat = 'label';
      l.input.dataset.i = String(i);
      wrap.append(v.wrap, l.wrap);
      statsBox.appendChild(wrap);
    });
  }
}

const saveSettingsBtn = $('#save-settings');
if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener('click', async () => {
    const status = $('#settings-status');
    const stats = [];
    for (let i = 0; i < 4; i++) {
      const v = document.querySelector('[data-stat="value"][data-i="' + i + '"]');
      const l = document.querySelector('[data-stat="label"][data-i="' + i + '"]');
      if (v || l) stats.push({ value: v ? v.value : '', label: l ? l.value : '' });
    }
    const payload = {
      brand: $('#s-brand').value,
      tagline: $('#s-tagline').value,
      hero_title: $('#s-hero-title').value,
      hero_text: $('#s-hero-text').value,
      about: $('#s-about').value,
      contacts: {
        telegram: $('#s-tg').value,
        telegram_label: $('#s-tg-label').value,
        email: $('#s-email').value,
        whatsapp: $('#s-wa').value
      },
      stats: stats.filter(x => x.value || x.label)
    };
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Ошибка');
      SETTINGS = Object.assign({}, SETTINGS, payload);
      setStatus(status, 'Сохранено');
    } catch (e) {
      setStatus(status, e.message || 'Не удалось сохранить', true);
    }
  });
}

/* ---------- boot ---------- */
checkSession();
