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
| `bluemap/[[path]].ts` | `/bluemap/*` | прокси на `HYPEMAP_BLUEMAP_ORIGIN`; тайлы 7 дней, `settings.json` 5 минут, `/live/*` без кеша |
| `_middleware.ts` | всё | CSP, заголовки безопасности, а также `/_diag` |
| `_lib/diag.ts` | `/_diag` | самодиагностика: запрос к обоим origin'ам + подсказки (в воркере вызывается из `worker/index.ts`) |
| `_lib/proxy.ts` | — | общая логика: заголовки, Service Token Cloudflare Access, кеш, ошибки |
| `_lib/types.ts` | — | минимальные типы Pages Functions (без `@cloudflare/workers-types` в сборке) |

## Переменные

| Имя | Тип | Назначение |
| --- | --- | --- |
| `HYPEMAP_ORIGIN` | var | `https://mc.example.com` — адрес плагина (туннель или rProxy панели) |
| `HYPEMAP_DYNMAP_ORIGIN` | var | адрес Dynmap, если он на другом хосте/порту; иначе берётся `HYPEMAP_ORIGIN` |
| `HYPEMAP_BLUEMAP_ORIGIN` | var | адрес BlueMap, если карту рендерит он (Minecraft 26.x); Dynmap тогда не нужен |
| `TILES_CACHE_TTL` | var | кеш тайлов в секундах, по умолчанию `604800` |
| `ACCESS_CLIENT_ID` | secret | Service Token Cloudflare Access (если туннель закрыт) |
| `ACCESS_CLIENT_SECRET` | secret | Service Token secret |

Сборка фронтенда обязательна для обоих режимов:

```bash
cd web && npm ci && npm run build && cd ..

npx wrangler deploy                                        # Workers (wrangler.toml)
npx wrangler pages deploy web/dist --config wrangler.pages.toml --project-name hypemap  # Pages
```
