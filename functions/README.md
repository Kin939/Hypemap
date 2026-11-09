# Cloudflare Pages Functions / Worker

Единственная задача — сделать Minecraft-сервер доступным с того же origin, что и сайт,
без открытых портов и без CORS. Логика общая для двух режимов:

- **Workers + Static Assets** (`npx wrangler deploy`) → точка входа `worker/index.ts`,
  этот каталог подключается как библиотека;
- **Pages** (`functions/` + `wrangler.pages.toml`) → работают файловые маршруты ниже.

| Файл | Маршрут | Поведение |
| --- | --- | --- |
| `api/[[path]].ts` | `/api/*` | прокси на `HYPEMAP_ORIGIN/api/*`, `no-store` |
| `up/[[path]].ts` | `/up/*` | прокси на Dynmap; `/up/configuration` кешируется 5 минут |
| `tiles/[[path]].ts` | `/tiles/*` | прокси на Dynmap; кеш 7 дней (Cache API), при сбое — прозрачный пиксель |
| `_middleware.ts` | всё | CSP, `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy` |
| `_lib/proxy.ts` | — | общая логика: заголовки, Service Token Cloudflare Access, кеш, ошибки |
| `_lib/types.ts` | — | минимальные типы Pages Functions (без `@cloudflare/workers-types` в сборке) |

## Переменные

| Имя | Тип | Назначение |
| --- | --- | --- |
| `HYPEMAP_ORIGIN` | var | `https://mc.example.com` — хостнейм туннеля |
| `TILES_CACHE_TTL` | var | кеш тайлов в секундах, по умолчанию `604800` |
| `ACCESS_CLIENT_ID` | secret | Service Token Cloudflare Access (если туннель закрыт) |
| `ACCESS_CLIENT_SECRET` | secret | Service Token secret |

Сборка фронтенда обязательна для обоих режимов:

```bash
cd web && npm ci && npm run build && cd ..

npx wrangler deploy                                        # Workers (wrangler.toml)
npx wrangler pages deploy web/dist --config wrangler.pages.toml --project-name hypemap  # Pages
```
