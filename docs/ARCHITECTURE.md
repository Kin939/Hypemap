# Архитектура Hypemap

## 1. Почему так

| Решение | Альтернатива | Почему выбрано |
| --- | --- | --- |
| Данные поселений в Java-плагине (SQLite), Dynmap — только рендер и маркеры | отдельная БД в Cloudflare (D1) / Supabase | один источник правды, нет второго деплоя и второго набора креденшелов; данные рядом с игроками, можно читать из кода сервера; Cloudflare-часть остаётся чистой статикой + прокси |
| Vue 3 + Vite + Leaflet, свой UI | iframe Dynmap / LiveAtlas как есть | полный контроль над дизайном и UX, свои полигоны, редактор и админка; тайлы всё равно берём у Dynmap |
| Pages + Pages Function как same-origin прокси | CORS + два домена | не нужен CORS, куки/JWT не утекают на сторонний origin, тайлы кешируются на edge Cloudflare |
| JWT-логин в плагине | только Cloudflare Access | админка работает и без Zero Trust (и на `localhost`); Access подключается сверху как второй слой |
| `com.sun.net.httpserver` из JDK | Javalin/Undertow/Spark | ноль зависимостей и ~0 конфликтов с класслоадером Paper; нагрузки «админка + карта» хватает с запасом |
| Собственный редактор вершин в `MapEngine` | leaflet-geoman | не тянем плагин рисования, поведение под наш сценарий (вставка в ребро, лассо, откат) |

## 2. Компоненты

```
┌──────────────────────── Minecraft-сервер (Paper 1.21.3) ────────────────────────┐
│                                                                                 │
│  Dynmap                          Hypemap                                        │
│  ├─ /tiles/...  (рендер)         ├─ ApiServer  :8800 (REST, JDK HttpServer)     │
│  ├─ /up/configuration            ├─ TownRepository / UserRepository / Audit     │
│  ├─ /up/world/<w>/<ts>           ├─ AuthService (PBKDF2 + JWT HS256 + Access)   │
│  └─ Marker API ◄─────────────────┤─ DynmapBridge (AreaMarker ↔ Town)             │
│                                  └─ PlayerCache (Bukkit API только в main thread)│
└─────────────────────────────────────────────────────────────────────────────────┘
        ▲                                       ▲
        │ cloudflared tunnel (ingress по path)  │
        └───────────────────┬───────────────────┘
                            │
              Cloudflare Pages (map.example.com)
              ├─ статика: web/dist (Vue SPA)
              └─ Functions: /api/* → :8800, /up/* и /tiles/* → :8123
```

Все три префикса проксируются на один хостнейм туннеля, различаются правилом `path` в
`config.yml` cloudflared (см. [DEPLOY.md](DEPLOY.md)).

## 3. Потоки данных

### Загрузка карты

1. `MapPage` параллельно запрашивает `GET /api/meta` (настройки, лимиты, флаги, статус Dynmap),
   `GET /api/auth/me` и `GET /api/towns`.
2. `stores/server.ts` берёт `GET /up/configuration` и собирает `MapDefinition`:
   мир → карта, `prefix`, `mapzoomout`, `mapzoomin`, `tilescale`, `image-format`, `worldtomap`,
   `maptoworld`.
3. `MapEngine` создаёт Leaflet-карту с `CRS.Simple`, добавляет `DynmapTileLayer`
   (переопределённый `getTileUrl` + `zoomReverse`), полигоны поселений и маркеры игроков.

Формулы (реализованы в `web/src/map/dynmapMath.ts`, повторяют `hdmap.js` Dynmap):

```
tileSize     = 128 << tilescale
maxZoom      = mapzoomin + mapzoomout          (Leaflet, zoomReverse: true)
maxNativeZoom= mapzoomout
URL тайла    = {prefix}{_day?}/{⌊x/32⌋}_{⌊-y/32⌋}/{z-prefix}{x}_{y}.{png|jpg}
world → px   lng = m[0]x + m[1]y + m[2]z ; lat = m[3]x + m[4]y + m[5]z   (m = worldtomap)
px → LatLng  LatLng(-((tileSize - lat) / 2^mapzoomout), lng / 2^mapzoomout)
LatLng → world  через maptoworld (для рисования и перетаскивания вершин)
```

Проекция не зависит от перспективы: работает и для `iso_*_90_*` (top-down), и для `iso_*_60_*`
(изометрия) — во втором случае высота `y` слегка смещает объекты, что и задумано.

### Игроки «в реальном времени»

`stores/players.ts` опрашивает `/up/world/<world>/<timestamp>` с интервалом
`updaterate` из `/up/configuration` (в миллисекундах, 1500…60000 мс).
`MapEngine.setPlayers` двигает маркеры через CSS-transition по проектным координатам,
поэтому движение плавное даже при опросе раз в 2 секунды. `AbortController` отменяет
зависшие запросы при смене мира/страницы.

### Создание и правка поселения

```
AdminEditorPage (черновик)  ──POST /api/towns──►  ApiHandlers.createTown
        │                                            │ TownValidator.apply()  (валидация)
        │                                            │ TownRepository.insert() (revision=1)
        │                                            │ AuditRepository.log()
        │                                            ▼
        │                                   DynmapBridge.requestSync()
        │                                            │ (следующий тик main thread)
        │                                            ▼
        │                          markerSet.createAreaMarker(...)
        │                          setCornerLocations(x[], z[])
        │                          setFillStyle(opacity, color)
        │                          setLineStyle(weight, opacity, color)
        ▼
  обновление Pinia-стора → перерисовка полигонов и карточки
```

`PUT /api/towns/{id}` инкрементирует `revision`, пишет снапшот в `town_history` и снова
просит синхронизацию маркеров. `POST /api/towns/{id}/restore` берёт снапшот ревизии,
применяет его и создаёт **новую** ревизию (история не переписывается).

### Рисование

`MapEngine.startEditing({ points, onChange })` — режим «одна карта, один черновик»:

| Действие | Реализация |
| --- | --- |
| клик по карте | добавить вершину в конец |
| перетаскивание маркера | `marker.on('drag')` → пересчёт `latLngToLocation` |
| правый клик по вершине | удалить вершину (минимум 3) |
| клик по «призрачной» точке в середине ребра | вставить вершину |
| лассо | тот же механизм кликов, но точки ставятся «по обводу» — отдельный режим `lasso`, ограничение 256 вершин из конфига |
| очистка / undo | хранение стека в компоненте `AdminEditorPage` |

Черновик (`web/src/admin/draft.ts`) — это `TownDraft`: примитивы + функции
`draftFromTown`, `draftToInput`, `validateDraft`, чтобы UI не знал о формате API.

## 4. Модель данных

```sql
towns(id TEXT PK, name, name_lc UNIQUE, world, visible, revision,
      created_at, updated_at, data JSON)
town_history(town_id, revision, action, actor, created_at, data JSON, PK(town_id, revision))
users(username PK, username_lc UNIQUE, password_hash, role, created_at, last_login_at)
audit(id AUTOINCREMENT, at, actor, action, town_id, details)
meta(key PK, value)          -- внутренние флаги, например последний известный confighash
```

`data` — сериализованный `Town` (Gson): полигон (`TownPoint[]` с `x/z`), цвета, прозрачности,
флаги, участники (`TownMember{name, role}`), `icon`, `minZoom/maxZoom`. Такое хранение даёт
гибкость схемы без миграций на каждое новое поле; `name_lc` и `visible` вынесены в колонки,
потому что по ним идёт поиск/фильтрация.

`Town.normalize()` — страховка от `null` в JSON (Gson не заполняет отсутствующие поля):
полигон, участники, флаги и цвета приводятся к безопасным значениям.

## 5. Безопасность

- **Пароли**: PBKDF2-HMAC-SHA256, 210 000 итераций, соль на пользователя, сравнение
  в постоянное время. Первый запуск создаёт `admin` со случайным паролем — он печатается
  в консоль сервера один раз.
- **Сессии**: JWT HS256 (`sub`, `role`, `exp`), секрет генерируется при первом старте и
  хранится в `plugins/Hypemap/secrets.yml` (права 600), TTL по умолчанию 12 часов.
- **Роли**: `ADMIN` — всё, `EDITOR` — CRUD поселений и история, `VIEWER` — только чтение.
  Проверка на сервере (`Route.role` + `ApiContext.requireRole`), не в UI.
- **Rate limit**: 8 неудачных попыток на пару «IP + логин» за 5 минут → 429.
- **Cloudflare Access** (опционально): режим `HYBRID` принимает `Cf-Access-Jwt-Assertion`,
  проверяет подпись по JWKS команды (кеш 60 минут), `aud` и e-mail из политики;
  e-mail из `auth.access.admin-emails` получает `ADMIN`.
- **Туннель**: плагин и Dynmap слушают только `127.0.0.1`; наружу — один хостнейм,
  который можно дополнительно закрыть Access + Service Token (страницы прокси передают
  `CF-Access-Client-Id/Secret`).
- **CSP** (Pages Functions): `default-src 'self'`, разрешены только same-origin запросы —
  XSS через сторонние скрипты не проходит. `X-Frame-Options: DENY`.
- **Лимиты**: тело запроса ≤ 256 КБ, полигон ≤ 256 точек, участников ≤ 64, имя 2…40 символов.

## 6. Производительность

- Одно соединение SQLite в WAL-режиме + `busy_timeout`, все операции под `synchronized`:
  сериализация записи, зато без пула и без гонок.
- HTTP-потоки никогда не трогают Bukkit API: `PlayerCache` обновляется таймером в главном
  потоке (5 с для онлайна, редко — для полного списка), `DynmapBridge.sync()` выполняется
  в главном потоке по запросу.
- Тайлы кешируются браузером (`max-age=604800`) и Cache API на edge; `/up/configuration` — 5 минут,
  `/up/world/*` — без кеша.
- Фронтенд: единый бандл ~680 КБ (Leaflet + Vue + lucide), `MapCanvas` вынесен в отдельный чанк.

## 7. Что осознанно не сделано

| Возможность | Почему и что нужно |
| --- | --- |
| Heatmap активности | у Dynmap нет истории изменений блоков; нужен слушатель `BlockBreak/Place` в плагине + таблица агрегатов по чанкам + слой `L.GridLayer` |
| Discord-уведомления | все события уже проходят через `AuditRepository` — достаточно вебхука в `AuditRepository.log()` |
| Вложенные области / дырки | в модели один контур; для «дырок» нужен `polygon[]` из нескольких контуров и `L.Polygon` с массивами |
| Импорт Towny/Lands | не требуется по условиям задачи |
| Реалтайм через WebSocket | Dynmap-совместимый polling каждые 2 с даёт тот же эффект при меньшей сложности |
