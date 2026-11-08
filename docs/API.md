# REST API

Базовый путь: `/api`. В продакшене всё идёт через Pages Function (same-origin),
локально — напрямую `http://127.0.0.1:8800/api` или через мок (`npm run mock`).

- Формат: JSON (`Content-Type: application/json; charset=utf-8`).
- Аутентификация: `Authorization: Bearer <JWT>` либо `Cf-Access-Jwt-Assertion` (режим `HYBRID`).
- Ошибки: `{ "error": { "code": "invalid_town", "message": "..." } }`
  Коды статусов: 400/401/403/404/409/413/429/500.
- Время: `createdAt`/`updatedAt`/`serverTime` — ISO-8601 (UTC), `expiresAt` — epoch ms.

## Права

| Роль | Что доступно |
| --- | --- |
| аноним | `meta`, `health`, список и карточка видимых поселений, `login`, `me` |
| `VIEWER` | то же (роль нужна для будущих «личных» данных) |
| `EDITOR` | + создание/правка/видимость/история, `players`, смена своего пароля |
| `ADMIN` | + удаление, откат ревизий, `resync`, `users`, `audit` |

## Служебные

### `GET /api/health`

```json
{ "status": "ok", "towns": 3, "dynmap": true }
```

### `GET /api/meta`

```json
{
  "title": "Hypemap",
  "serverName": "Hypemap Demo Realm",
  "version": "1.0.0",
  "apiVersion": 1,
  "server": { "name": "…", "minecraft": "1.21.3", "online": 5, "max": 40,
              "worlds": ["world"], "players": ["Elyra", "Kraft"] },
  "dynmap": { "available": true, "version": "3.7-beta-8",
              "markerSetId": "hypemap.towns", "url": "https://map.example.com" },
  "auth": { "mode": "LOCAL", "localLogin": true, "access": false },
  "limits": { "maxPolygonPoints": 256, "maxMembers": 64, "minNameLength": 2,
              "maxNameLength": 40, "maxBodyBytes": 262144 },
  "flags": ["PVP", "PEACEFUL", "PUBLIC", "CAPITAL", "SHOP", "FARM", "MINING", "PORT"],
  "townCount": 3,
  "defaults": { "fillColor": "#22c55e", "lineColor": "#16a34a",
                "fillOpacity": 0.28, "lineOpacity": 1.0, "lineWeight": 2 },
  "discordInvite": ""
}
```

## Аутентификация

### `POST /api/auth/login`

```bash
curl -s -X POST https://map.example.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"…"}'
```

```json
{ "token": "eyJhbGciOiJIUzI1NiIs…", "expiresAt": 1762560000000,
  "user": { "username": "admin", "role": "ADMIN", "source": "local" } }
```

`401` — неверные данные, `429` — сработал rate limit (8 попыток / 5 минут).

### `GET /api/auth/me`

```json
{ "authenticated": true,
  "user": { "username": "admin", "role": "ADMIN", "source": "local", "email": null },
  "auth": { "mode": "LOCAL", "localLogin": true } }
```

### `POST /api/auth/password` *(любая авторизованная роль)*

```json
{ "currentPassword": "old", "newPassword": "new-strong-password" }
```

## Поселения

### `GET /api/towns?includeHidden=1&world=world`

`includeHidden` учитывается только для EDITOR/ADMIN. Ответ:

```json
{
  "towns": [{
    "id": "t_1enqupjw",
    "name": "Аурелия",
    "description": "Столица долины…",
    "world": "world",
    "y": 64,
    "polygon": [{ "x": 96, "z": 122 }, { "x": 148, "z": 96 }, { "x": 180, "z": 138 }],
    "fillColor": "#38bdf8",
    "lineColor": "#0ea5e9",
    "fillOpacity": 0.28,
    "lineOpacity": 1.0,
    "lineWeight": 2,
    "members": [{ "name": "Elyra", "role": "OWNER" }, { "name": "Kraft", "role": "MEMBER" }],
    "flags": ["CAPITAL", "SHOP"],
    "visible": true,
    "minZoom": 0,
    "maxZoom": 10,
    "icon": "",
    "createdAt": 1761300000000,
    "updatedAt": 1761300000000,
    "createdBy": "Elyra",
    "updatedBy": "admin",
    "revision": 1
  }],
  "count": 1,
  "updatedAt": "2026-10-24T10:00:00Z",
  "serverTime": "2026-11-08T21:14:00Z"
}
```

### `GET /api/towns/{id}`

Одно поселение. Скрытое поселение анонимному клиенту отдаёт `404`.

### `POST /api/towns` *(EDITOR)*

```bash
curl -s -X POST https://map.example.com/api/towns \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{
        "name": "Аурелия",
        "description": "Столица долины",
        "polygon": [{"x":96,"z":122},{"x":148,"z":96},{"x":180,"z":138}],
        "fillColor": "#38bdf8",
        "lineColor": "#0ea5e9",
        "flags": ["CAPITAL"],
        "members": [{"name":"Elyra","role":"OWNER"}],
        "visible": true
      }'
```

Обязательны `name` и `polygon` (≥ 3 вершины, ≤ `limits.maxPolygonPoints`).
Ответ — созданный объект (`201`), `409` — имя занято, `400` — ошибка валидации.

### `PUT /api/towns/{id}` *(EDITOR)*

Тело как у `POST`, но любое поле можно опустить — оно останется прежним.
Инкрементирует `revision`, пишет снапшот в историю, обновляет маркер Dynmap.

### `DELETE /api/towns/{id}` *(ADMIN)*

`204 No Content`. Удаляет маркер из Marker Set.

### `PATCH /api/towns/{id}/visibility` *(EDITOR)*

```json
{ "visible": false }
```

Скрытое поселение пропадает из публичного списка и с карты, но остаётся в админке
(`?includeHidden=1`) и в Dynmap (маркер получает `setMinZoom` выше максимального,
чтобы не рисоваться).

### `GET /api/towns/{id}/history?limit=30` *(EDITOR)*

```json
{
  "history": [{
    "townId": "t_1enqupjw",
    "revision": 3,
    "action": "UPDATE",
    "actor": "admin",
    "createdAt": "2026-11-08T20:00:00Z",
    "snapshot": { "...": "полная копия Town" }
  }],
  "count": 1
}
```

### `POST /api/towns/{id}/restore` *(ADMIN)*

```json
{ "revision": 1 }
```

Применяет снапшот как **новую** ревизию (история не переписывается).

## Игроки

### `GET /api/players?q=el&limit=12` *(EDITOR)*

Автодополнение для добавления участников:

```json
{ "players": ["Elyra"], "online": ["Elyra", "Kraft"] }
```

## Пользователи и аудит *(ADMIN)*

| Метод | Путь | Тело / ответ |
| --- | --- | --- |
| `GET` | `/api/users` | `{ "users": [{ "username": "admin", "role": "ADMIN", "createdAt": "…", "lastLoginAt": null }] }` |
| `POST` | `/api/users` | `{ "username": "mayor", "password": "≥8 символов", "role": "EDITOR" }` (создаёт или обновляет) |
| `DELETE` | `/api/users/{username}` | `204`; нельзя удалить себя и последнего ADMIN |
| `GET` | `/api/audit?limit=50` | `{ "entries": [{ "id": 12, "at": "…", "actor": "admin", "action": "town.update", "townId": "t_…", "details": "Аурелия" }] }` |
| `POST` | `/api/dynmap/resync` | `202 { "status": "queued", "available": true }` |

## CORS

Same-origin через Pages — CORS не нужен. Для прямых запросов (dev) плагин отвечает
заголовками `Access-Control-Allow-Origin` только для `api.allowed-origins` из `config.yml`
и корректно обрабатывает `OPTIONS`.
