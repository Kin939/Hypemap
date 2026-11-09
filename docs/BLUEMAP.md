# BlueMap вместо Dynmap (Minecraft 26.x)

Hypemap умеет брать тайлы и игроков из **двух** рендереров: Dynmap и BlueMap.
Выбор автоматический — сайт сначала спрашивает Dynmap (`/up/configuration`), а если
его нет, пробует BlueMap (`/bluemap/settings.json`). Менять код фронтенда не нужно.

## Когда это нужно

Dynmap выпускает сборки Spigot/Paper **только до Minecraft 1.21.4** (и отдельные
сборки сообщества для 1.21.9–1.21.11). Начиная с 1.21.5 Spigot-плагин Dynmap
отключается сам:

```
[Dynmap] bukkit version incompatible!
[Dynmap] Dynmap is disabled (unsupported platform)
```

Начиная с Minecraft **26.1** (март 2026) версии нумеруются по году: 26.1, 26.2, 26.3…
BlueMap поддерживает эти версии официально (5.29 → 26.1–26.3), поэтому на таких
серверах карту рендерит он.

## 1. Установка BlueMap

1. Скачайте **BlueMap 5.29 для Paper**:
   [`bluemap-5.29-paper.jar`](https://cdn.modrinth.com/data/swbUV1cr/versions/uHQIrUdf/bluemap-5.29-paper.jar)
   (страница версии — [Modrinth](https://modrinth.com/plugin/bluemap/version/5.29-paper)).
   ⚠️ Нужен именно `-paper` файл: `-spigot`, `-fabric`, `-forge` под Paper не подойдут.
2. Положите jar в `plugins/` и перезапустите сервер. Появится папка `plugins/bluemap/`.
3. Включите веб-сервер — `plugins/bluemap/webserver.conf`:

   ```yaml
   enabled: true
   webroot: "bluemap/web"
   port: 8100
   ```

   Порт `8100` — тот, который открыт в панели хостинга (у нас это делается в разделе
   «Порты», см. [DEPLOY.md §5.4](DEPLOY.md)).
4. Перезапустите сервер. Проверка: `http://IP:8100/settings.json` отдаёт JSON.

## 2. Карты BlueMap

Настройки каждой карты — `plugins/bluemap/maps/<мир>.conf`. Для Hypemap важно:

```yaml
# вид сверху (по умолчанию включён)
flat-view: true

hires:
  enabled: true      # обязательно: lowres-тайлы строятся из hires-рендера
lowres:
  tile-size: 500
  lod-count: 3
  lod-factor: 5
```

`hires` отключать нельзя — без него BlueMap не отрендерит и `lowres`, а Hypemap берёт
именно `lowres` (готовые PNG), поэтому диск не забивается «тяжёлыми» hires-моделями
на стороне сайта.

Команды в консоли: `/bluemap` (статус), `/bluemap reload`, `/bluemap render <мир>`
(полный рендер, можно оставить на ночь).

## 3. Подключение к Hypemap

В Cloudflare → Workers & Pages → проект → **Settings → Variables and Secrets**:

```
HYPEMAP_ORIGIN        = https://api.ваш-домен       # плагин Hypemap (как обычно)
HYPEMAP_BLUEMAP_ORIGIN = https://map.ваш-домен      # веб-сервер BlueMap
TILES_CACHE_TTL       = 604800
```

Адрес BlueMap — **HTTPS на 443** (rProxy панели или Cloudflare Tunnel). Адрес вида
`http://IP:8100` не сработает: воркер Cloudflare ходит только на 80/443 — то же
ограничение, что и для Dynmap.

**Где взять эти адреса.** В панели хостинга: вкладка **rProxy** → **«создать»** → имя
(например `map`) + порт (например `8100`) → панель выдаёт готовый домен с бесплатным
SSL: `https://map.<домен>`. Его и вписывайте. Отдельно откройте этот адрес в браузере:
`https://map.<домен>/settings.json` должен вернуть JSON со списком карт — значит и
BlueMap, и прокси работают. Второй домен (лимит — 2 на сервер) отдайте плагину Hypemap:
`api` + порт `25960`.

**Что просит rProxy на первом шаге.** Панель показывает CNAME, который нужно создать
у себя в Cloudflare: имя = ваш домен, значение = длинный `…custom.dynmap.xyz`. Три
правила, иначе проверка «DNS ещё не обновился»:

1. **Берите поддомен**, а не корень: `map.hypemap.com` (в Cloudflare имя записи — `map`).
   На корне домена Cloudflare «схлопывает» CNAME в A-записи, и внешняя проверка CNAME
   его не увидит. Корень оставьте сайту (Worker).
2. **Proxy status = DNS only** (серое облако). С оранжевым облаком внешний сервис видит
   IP Cloudflare, а не ваш CNAME, и проверка не проходит.
3. У имени не должно быть других записей (A/AAAA/CNAME) — Cloudflare не даст создать
   CNAME рядом с ними, старые нужно удалить.

После создания подождите 1–2 минуты и нажмите «Проверить». Проверить самому можно на
`dnschecker.org` (тип CNAME) — там должно быть видно `…custom.dynmap.xyz`.

Если rProxy в панели недоступен — адрес можно получить туннелем `cloudflared`,
запущенным на любом включённом ПК: `service: http://IP:8100` (см.
[DEPLOY.md §5.4](DEPLOY.md)).

Если Dynmap на сервере нет, `HYPEMAP_DYNMAP_ORIGIN` не задавайте вовсе.

## 4. Проверка

| Что открыть | Ожидаемо |
| --- | --- |
| `https://сайт/_diag` | `"renderer": "bluemap"`, в `hints` — «BlueMap отвечает» |
| `https://сайт/bluemap/settings.json` | JSON со списком карт |
| `https://сайт/bluemap/maps/world/tiles/1/x0/z0.png` | PNG-тайл |
| сайт | тайлы, игроки, полигоны поселений |

## 5. Что работает и что нет

Работает:

- тайлы (lowres, все lod-уровни) с кешем на edge;
- игроки онлайн и их перемещение (`/maps/<id>/live/players.json`, опрос ~2 с);
- полигоны поселений, наведение, клик, карточка, поиск — рисует сам Hypemap;
- админка, роли, аудит — от рендерера не зависят.

Пока нет:

- маркеры поселений в **родном интерфейсе** BlueMap (аналог `MarkerAPI` не подключён —
  в Hypemap-интерфейсе маркеры есть всегда);
- переключатель «день/ночь»: BlueMap не отдаёт игровое время в `/live/*`;
- моментальное обновление тайлов: кеш edge держит их `TILES_CACHE_TTL` секунд.
  Если карта часто перерендеривается, поставьте `TILES_CACHE_TTL=3600`.

## 6. Как это устроено (для разработчика)

- `web/src/api/bluemap.ts` — контракт: `settings.json`, `maps/<id>/settings.json`, игроки.
- `web/src/map/bluemapMath.ts` — формулы BlueMap: путь тайла `x3/z1/2.png`, размер тайла
  `tileSize * lodFactor^(lod-1)`, выбор lod под текущий зум, синтетическая проекция
  `lat = -z`, `lng = x`.
- `web/src/map/BlueMapLayer.ts` — слой Leaflet: для каждого тайла рисует canvas 256×256
  и копирует в него нужный кусок lod-тайла BlueMap (в BlueMap шаг lod не степень двойки,
  поэтому «сшивать» приходится вручную).
- `worker/index.ts` и `functions/bluemap/[[path]].ts` — прокси `/bluemap/*` →
  `HYPEMAP_BLUEMAP_ORIGIN/*`: тайлы кешируются на 7 дней, `settings.json` — на 5 минут,
  `/live/*` — без кеша.
