'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ---------- header ---------- */
const header = $('#header');
const burger = $('#burger');
const nav = $('#nav');

function onScroll() {
  if (!header) return;
  header.classList.toggle('is-scrolled', window.scrollY > 8);
}
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

if (burger && nav) {
  burger.addEventListener('click', () => {
    const open = nav.classList.toggle('is-open');
    burger.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
  });
  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') {
      nav.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
    }
  });
}

/* ---------- reveal on scroll ---------- */
const revealEls = $$('.section__head, .mini, .card, .steps li, .timeline li, .edu, .contacts__links');
revealEls.forEach(el => el.classList.add('reveal'));
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('is-in'), Math.min(i * 40, 160));
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  revealEls.forEach(el => io.observe(el));
} else {
  revealEls.forEach(el => el.classList.add('is-in'));
}

/* ---------- works ---------- */
const grid = $('#works-grid');
const filters = $('#filters');
const emptyMsg = $('#works-empty');
let WORKS = [];
let ACTIVE = 'Все';

function renderWorks() {
  if (!grid) return;
  const list = ACTIVE === 'Все' ? WORKS : WORKS.filter(w => w.category === ACTIVE);
  grid.textContent = '';

  if (!list.length) {
    if (emptyMsg) emptyMsg.hidden = false;
    return;
  }
  if (emptyMsg) emptyMsg.hidden = true;

  const frag = document.createDocumentFragment();
  list.forEach((w, i) => {
    const card = document.createElement('article');
    card.className = 'work';

    const media = document.createElement('div');
    media.className = 'work__img';
    media.tabIndex = 0;
    media.setAttribute('role', 'button');
    media.setAttribute('aria-label', 'Открыть фото: ' + w.title);
    const img = document.createElement('img');
    img.src = w.image || '/img/placeholder.svg';
    img.alt = w.title;
    img.loading = i < 3 ? 'eager' : 'lazy';
    media.appendChild(img);

    const open = () => openLightbox(w.image, w.title);
    media.addEventListener('click', open);
    media.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });

    const body = document.createElement('div');
    body.className = 'work__body';

    const cat = document.createElement('span');
    cat.className = 'work__cat';
    cat.textContent = w.category || '';

    const title = document.createElement('h3');
    title.className = 'work__title';
    title.textContent = w.title;

    const desc = document.createElement('p');
    desc.className = 'work__desc';
    desc.textContent = w.description || '';

    const line = document.createElement('span');
    line.className = 'work__line';

    body.append(cat, title, desc, line);
    card.append(media, body);
    frag.appendChild(card);
  });
  grid.appendChild(frag);
}

function renderFilters() {
  if (!filters) return;
  const cats = ['Все'];
  WORKS.forEach(w => { if (w.category && !cats.includes(w.category)) cats.push(w.category); });

  filters.textContent = '';
  cats.forEach(cat => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (cat === ACTIVE ? ' is-active' : '');
    b.textContent = cat;
    b.addEventListener('click', () => {
      ACTIVE = cat;
      $$('.chip', filters).forEach(x => x.classList.toggle('is-active', x === b));
      renderWorks();
    });
    filters.appendChild(b);
  });
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('status ' + res.status);
  const ct = res.headers.get('content-type') || '';
  if (ct.indexOf('json') === -1) throw new Error('not json');
  return res.json();
}

async function loadWorks() {
  let data = null;
  // 1) локальный сервер с админкой, 2) статическая версия для GitHub Pages
  try { data = await fetchJson('/api/works'); } catch (e1) {
    try { data = await fetchJson('data/works.json'); } catch (e2) { data = null; }
  }
  WORKS = data && Array.isArray(data.works)
    ? data.works.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
    : [];
  renderFilters();
  renderWorks();
}

/* ---------- lightbox ---------- */
const lb = $('#lightbox');
const lbImg = $('#lb-img');
const lbCap = $('#lb-cap');
const lbClose = $('#lb-close');

function openLightbox(src, caption) {
  if (!lb || !src) return;
  lbImg.src = src;
  lbImg.alt = caption || '';
  lbCap.textContent = caption || '';
  lb.hidden = false;
  document.body.style.overflow = 'hidden';
  if (lbClose) lbClose.focus();
}

function closeLightbox() {
  if (!lb) return;
  lb.hidden = true;
  lbImg.src = '';
  document.body.style.overflow = '';
}

if (lb) {
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
  if (lbClose) lbClose.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lb.hidden) closeLightbox();
  });
}

/* ---------- settings ---------- */
async function loadSettings() {
  let s = null;
  try { s = await fetchJson('/api/settings'); } catch (e1) {
    try { s = await fetchJson('data/settings.json'); } catch (e2) { s = null; }
  }
  if (s) {

    $$('[data-brand]').forEach(el => { if (s.brand) el.textContent = s.brand; });

    const heroTitle = $('[data-hero-title]');
    const heroText = $('[data-hero-text]');
    const about = $('[data-about]');
    if (heroTitle && s.hero_title) heroTitle.textContent = s.hero_title;
    if (heroText && s.hero_text) heroText.textContent = s.hero_text;
    if (about && s.about) about.textContent = s.about;

    if (Array.isArray(s.stats) && s.stats.length) {
      const box = $('[data-stats]');
      if (box) {
        box.textContent = '';
        s.stats.slice(0, 4).forEach(item => {
          const li = document.createElement('li');
          const b = document.createElement('b');
          b.textContent = item.value || '';
          const sp = document.createElement('span');
          sp.textContent = item.label || '';
          li.append(b, sp);
          box.appendChild(li);
        });
      }
    }

    if (s.contacts) {
      const box = $('[data-contacts]');
      if (box) {
        box.textContent = '';
        const c = s.contacts;
        if (c.telegram) {
          const a = document.createElement('a');
          a.className = 'btn btn--accent';
          a.href = c.telegram;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'Telegram · ' + (c.telegram_label || c.telegram);
          box.appendChild(a);
        }
        if (c.whatsapp) {
          const a = document.createElement('a');
          a.className = 'btn btn--accent';
          a.href = 'https://wa.me/' + String(c.whatsapp).replace(/\D/g, '');
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = 'WhatsApp';
          box.appendChild(a);
        }
        if (c.email) {
          const a = document.createElement('a');
          a.className = 'btn btn--outline';
          a.href = 'mailto:' + c.email;
          a.textContent = c.email;
          box.appendChild(a);
        }
      }
    }

    document.title = (s.brand || 'ksartis') + ' — ' + (s.tagline || 'инженер-конструктор');
  }
}

/* ---------- 3D tabs ---------- */
const viewTabs = $$('.viewer__tab');
const modelCanvas = $('#viewer-canvas');
const boxCanvas = $('#box-canvas');
const viewerHost = document.getElementById('viewer');
const badge = $('[data-badge]');

function set3DView(view) {
  viewTabs.forEach(t => {
    const active = t.dataset.view === view;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', String(active));
  });
  if (modelCanvas) modelCanvas.hidden = view !== 'model';
  if (boxCanvas) boxCanvas.hidden = view !== 'box';
  if (viewerHost) viewerHost.classList.toggle('is-box', view === 'box');
  if (badge) badge.textContent = view === 'box' ? '3D · клик по детали' : '3D · вращайте';
  document.dispatchEvent(new CustomEvent('ks-view', { detail: view }));
}

viewTabs.forEach(t => t.addEventListener('click', () => set3DView(t.dataset.view)));
if (viewTabs.length) set3DView('model');

// для проверки: /?view=box открывает разборку
const params = new URLSearchParams(location.search);
if (params.get('view') === 'box') {
  set3DView('box');
  document.dispatchEvent(new CustomEvent('ks-explode'));
}

/* ---------- полный экран ---------- */
const fsBtn = $('#viewer-fs');
if (fsBtn) {
  if (!document.fullscreenEnabled && !viewerHost.requestFullscreen) {
    fsBtn.hidden = true;
  } else {
    fsBtn.addEventListener('click', () => {
      if (document.fullscreenElement) {
        document.exitFullscreen && document.exitFullscreen();
      } else if (viewerHost.requestFullscreen) {
        viewerHost.requestFullscreen().catch(() => {});
      }
    });
    document.addEventListener('fullscreenchange', () => {
      const on = !!document.fullscreenElement;
      viewerHost.classList.toggle('is-fs', on);
      fsBtn.textContent = on ? '✕' : '⤢';
      fsBtn.title = on ? 'Свернуть' : 'На весь экран';
      window.dispatchEvent(new Event('resize'));
    });
  }
}
/* ---------- init ---------- */
const yearEl = $('#year');
if (yearEl) yearEl.textContent = '© ' + new Date().getFullYear();

loadSettings();
loadWorks();
