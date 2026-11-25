# Публикация на GitHub Pages

Версия без админки: сайт статический, работы берутся из `public/data/works.json`,
изменения вносятся в файлы и отправляются в репозиторий.

## 1. Создать репозиторий

На github.com → **New repository**:

- имя: `ksartis` (тогда адрес будет `https://ВАШ_ЛОГИН.github.io/ksartis/`)
  или `ВАШ_ЛОГИН.github.io` (тогда сайт сразу на корне);
- видимость: **Public** (для бесплатного GitHub Pages);
- без README, без .gitignore.

## 2. Подключить и запушить

```powershell
cd G:\opencode\2026-11-25-001\site
git remote add origin https://github.com/ВАШ_ЛОГИН/ksartis.git
git push -u origin main
```

При первом пуше GitHub попросит логин и **Personal Access Token**
(Settings → Developer settings → Personal access tokens → Fine-grained tokens →
права `Contents: Read and write` на этот репозиторий).

Альтернатива — GitHub CLI:

```powershell
winget install --id GitHub.cli
gh auth login
gh repo create ksartis --public --source=. --push
```

## 3. Включить Pages

Репозиторий → **Settings** → **Pages**:

- Source: **Deploy from a branch**
- Branch: **main**, папка **/ (root)**

Через 1–2 минуты сайт откроется по адресу
`https://ВАШ_ЛОГИН.github.io/ksartis/`.

## 4. Как обновлять сайт

1. Меняем работы/тексты в `content/*.json` или в `public/*`.
2. Пересобрать данные:

```powershell
node tools\export-static.js
```

3. Отправить изменения:

```powershell
git add -A
git commit -m "обновил работы"
git push
```

GitHub Pages обновится сам за минуту.

## Важно

- Файл `.env` в репозиторий не попадает (см. `.gitignore`).
- Админка (`/admin`) на GitHub Pages не работает — она только для локального сервера.
- Чтобы менять работы, нужен локальный запуск: `start.bat`.
