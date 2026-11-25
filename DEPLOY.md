# Публикация на Cloudflare

Всё бесплатно. Нужен аккаунт Cloudflare.

## 0. Что понадобится

- Node.js (уже есть)
- аккаунт Cloudflare: https://dash.cloudflare.com/sign-up
- желательно домен (можно позже)

## 1. Войти в Cloudflare

В терминале:

```powershell
cd G:\opencode\2026-11-25-001\site
npx wrangler login
```

Откроется браузер — разрешите доступ.

## 2. Создать хранилище

```powershell
# список ключей/настроек
npx wrangler kv namespace create WORKS

# фотографии
npx wrangler r2 bucket create ksartis-images
```

Команда `kv namespace create` выведет `id = "..."` — вставьте его в `wrangler.toml`
вместо `ВСТАВЬТЕ_ID_KV`.

## 3. Первый деплой

```powershell
npx wrangler pages deploy public --project-name ksartis
```

Появится ссылка вида `https://ksartis.pages.dev` — сайт уже работает,
но список работ пока пустой.

## 4. Залить работы и настройки

```powershell
npx wrangler kv key put --binding=WORKS "works" --path=content/works.json --remote
npx wrangler kv key put --binding=WORKS "settings" --path=content/settings.json --remote
```

## 5. Задать пароль администратора

```powershell
npx wrangler pages secret put ADMIN_PASSWORD --project-name ksartis
npx wrangler pages secret put SESSION_SECRET --project-name ksartis
```

- `ADMIN_PASSWORD` — ваш пароль для `/admin`
- `SESSION_SECRET` — любая длинная случайная строка (например, 40 символов)

После изменения секретов деплой можно повторить:

```powershell
npx wrangler pages deploy public --project-name ksartis
```

## 6. Проверка

1. Открыть `https://ksartis.pages.dev`
2. Открыть `https://ksartis.pages.dev/admin`, войти паролем
3. Заменить фото, сохранить
4. Обновить главную — изменения на месте

Фото теперь хранятся в R2 и отдаются по адресу `/api/img/...`.
Работы и настройки — в KV.

## 7. Свой домен

1. Cloudflare → Workers & Pages → проект `ksartis` → Custom domains
2. Добавить `ksartis.ru`
3. У регистратора домена прописать NS-серверы Cloudflare (или CNAME, если домен
   уже в Cloudflare)

HTTPS включится автоматически.

## Обновление сайта

Код/вёрстка:

```powershell
npx wrangler pages deploy public --project-name ksartis
```

Контент (работы, фото) — через `/admin`, деплой не нужен.

## Важно

- Не коммитьте `.env` и `content/` в публичный репозиторий: там ваши данные.
- Пароль и `SESSION_SECRET` хранятся только в Cloudflare как секреты.
- Локальный сервер (`node server/server.js`) продолжает работать для разработки.
