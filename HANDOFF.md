# HANDOFF — проект ksartis

Файл для передачи работы другому чату/разработчику. Обновлять при изменениях.

## Что это

Сайт-визитка инженера-конструктора литейного производства.

- **Живой сайт:** https://ksartis.github.io/
- **Репозиторий:** https://github.com/Ksartis/ksartis.github.io (public)
- **Локальная папка:** `G:\opencode\2026-11-25-001\site`
- **Ветка:** `main`, деплой автоматический (GitHub Actions)
- **Домен:** пока нет. В планах `ksartis.ru` (почта `me@ksartis.ru` уже на нём)

## Стек

- Чистая статика: HTML + CSS + JS, без фреймворков.
- Локальный сервер: Node.js без зависимостей (`server/server.js`), он же админка.
- 3D: собственный WebGL-вьюер (`public/viewer.js`, `public/box-viewer.js`), без three.js.
- Геометрия ящика: **manifold-3d** (настоящие булевы операции), сборка скриптом на этапе разработки.
- Хостинг: GitHub Pages + Actions. Админка на Pages не работает (только локально).

## Быстрый старт

```powershell
cd G:\opencode\2026-11-25-001\site
node server\server.js          # http://localhost:8080, админка /admin
```

или двойной клик по `start.bat`.

Статическая копия (как на GitHub, без админки):

```powershell
node tools\serve-static.js 8090   # http://localhost:8090
```

Пароль админки — в `.env` (`ADMIN_PASSWORD`), локально, в git не попадает.

## Структура

```
site/
├─ public/                 статика (её и публикуем)
│  ├─ index.html           страница
│  ├─ style.css            стили
│  ├─ app.js               рендер работ, табы 3D, fullscreen
│  ├─ viewer.js            вьюер отливки (GLB, один меш)
│  ├─ box-viewer.js        разборка ящика (мультимеш, инструменты)
│  ├─ admin.html/.js/.css  локальная админка
│  ├─ data/                works.json + settings.json (сборка, коммитится)
│  ├─ img/                 10 фото работ (clean-01..10.jpg) + og-image
│  └─ models/              otvod.glb (отливка), corebox.glb (ящик)
├─ content/                ИСХОДНЫЕ данные: works.json, settings.json
├─ server/server.js        локальный сервер + API + админка
├─ functions/api/[[path]].js  API для Cloudflare (не используется, задел)
├─ tools/
│  ├─ export-static.js     content → public/data
│  ├─ stl2glb.js           STL → GLB (отливка)
│  ├─ build-corebox.mjs    сборка ящика через manifold-3d
│  ├─ make-images.ps1      подготовка фото (ресайз)
│  ├─ make-og.ps1          картинка 1200×630 для Telegram
│  └─ serve-static.js      статический сервер для проверки
├─ .github/workflows/pages.yml  деплой public/ на Pages
├─ wrangler.toml           задел под Cloudflare
├─ DEPLOY.md, GITHUB.md, README.md
└─ .env                    локальные секреты (в git нет)
```

## Как менять контент

1. Править `content/works.json` (работы) и `content/settings.json` (тексты, контакты, цифры).
2. Собрать статику: `node tools\export-static.js`.
3. Закоммитить и запушить:

```powershell
git add -A
git commit -m "обновил работы"
git push
```

Через ~1 минуту обновится сайт. Ассеты подключаются с версией `?v=...` в `index.html` — при правках CSS/JS **менять версию**, иначе браузер держит кеш 10 минут.

Либо локально: `node server/server.js` → `/admin` → править, фото загружаются в `public/img`.

## 3D: что и как

### Отливка (hero, таб «Модель»)
- `public/models/otvod.glb`, собран из STL: `node tools/stl2glb.js вход.stl public/models/имя.glb`.
- Вьюер: `viewer.js`, вращение/зум, авто-поворот.

### Стержневой ящик (hero, таб «Разборка»)
- Геометрия собирается **с вычитанием объёмов**:
  `node tools/build-corebox.mjs` → `public/models/corebox.glb`.
- Состав: `lower` (нижняя половина), `upper` (верхняя половина с набивочным отверстием), `core` (стержень со знаками).
- Размеры в скрипте: ящик 1.40 × 0.70 × 1.10, стержень 1.00 × 0.30 × 0.70, знаки Ø0.14, зазор 0.006.
- Вьюер `box-viewer.js`: выбор детали (чипы), перетаскивание вдоль оси, слайдер, кнопки «Разобрать/Собрать», кнопка полного экрана.
- Требуется `npm install` (manifold-3d), `node_modules` в git нет.

## Что сделано / решения

- 10 работ, фото без имён заказчиков (чертежи и сканы со штампами исключены — принципиально).
- Цифры: **8+ лет**, **20+ компаний**, **300+ заказов**. «800 моделей / 130 чертежей» убраны как непоказательные.
- Опыт: 2016 диплом с отличием → технолог в цехе и конструктор на производстве оснастки → с 2022 частная практика.
- Декоративные номера разделов убраны.
- Текст hero разбит на две строки (`white-space: pre-line`).
- Мобильная вёрстка: 390 px без горизонтального скролла (проверено).
- Telegram-превью: `og-image.jpg` + OG-теги на адрес `https://ksartis.github.io/`.

## Открытые вопросы

- Домен `ksartis.ru`: подключить (CNAME + A-записи, затем поменять og:url/og:image).
- Репозиторий публичный. Приватный + Pages требует GitHub Pro; альтернатива — Cloudflare Pages (задел в `functions/` и `wrangler.toml` есть).
- Проверить геометрию ящика с реальным чертежом: пропорции и знаки сейчас типовые.
- В админке нет загрузки 3D-моделей — только фото.

## Осторожно

- Никаких персональных данных и счетов в репозитории.
- Не коммитить `.env`.
- Фото работ — только чистые рендеры; чертежи со штампами не публиковать.
