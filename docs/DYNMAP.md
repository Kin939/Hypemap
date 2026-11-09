# Настройка Dynmap

Hypemap использует Dynmap как **рендер тайлов** и как **хранилище маркеров**,
но не как интерфейс. Поэтому важно правильно включить top-down карту и Marker API.

## 1. Установка

Сначала посмотрите **точную версию сервера** (в панели — вкладка «Версии») и возьмите
сборку строго под неё: у Dynmap jar-файл свой на каждую линейку версий.

| Paper | Чем ставить | Ссылка |
| --- | --- | --- |
| 1.21 – 1.21.4 | **Dynmap 3.7-beta-8** (`…-spigot.jar`) — официальная сборка | [Modrinth](https://modrinth.com/plugin/dynmap/version/3.7-beta-8) |
| 1.21.9 – 1.21.11 | **Dynmap 3.7-beta-11**, сборки от мейнтейнера jacob1 (`…-spigot.jar`) | [jacob1/dynmap → Releases](https://github.com/jacob1/dynmap/releases) |
| 1.21.5 – 1.21.8 | **сборки нет вообще**: на этих версиях Spigot-плагин Dynmap сам отключается | см. примечание ниже |

> На [Modrinth](https://modrinth.com/plugin/dynmap/versions) кнопка «Download» по
> умолчанию предлагает самые свежие файлы — они **для Fabric/Forge**, а не для Paper.
> Для Paper нужен файл с `-spigot` в имени и ваша версия в фильтре слева.
> Древняя 3.3-beta-2 из GitHub Releases проекта не поддерживает 1.21 — не берите её.

**Примечание для 1.21.5 – 1.21.8 (и любых версий новее 1.21.4).** Это не «ещё не
выложили» — Spigot-плагин Dynmap на этих версиях **не запускается**: он загружается,
проверяет версию сервера и выключается сам. В консоли это выглядит так:

```
[dynmap] Enabling dynmap v3.7-beta-8
[Dynmap] bukkit version incompatible!
[Dynmap] Dynmap is disabled (unsupported platform)
```

Папка `plugins/dynmap/` при этом может так и не появиться. Сборки Dynmap 3.8, которые
есть для 1.21.9+, — это **Forge/Fabric**, для Paper они не подходят.

Поэтому на 1.21.5 – 1.21.8 реальных вариантов два:

1. **Переключить сервер на 1.21.4** (панель → «Версии» → выбрать → переустановить).
   Это официально поддерживаемая связка: Hypemap собран под Paper 1.21.x, Dynmap
   3.7-beta-8 работает. ⚠️ Обязательно сделайте бэкап: мир, в котором после обновления
   появились чанки версий 1.21.5+, на 1.21.4 может не загрузиться
   (`chunk saved with newer version`). Если сервер молодой — обычно проходит без проблем.
2. **Перейти на 1.21.9 – 1.21.11** и взять Spigot-сборку от мейнтейнера jacob1
   ([Releases](https://github.com/jacob1/dynmap/releases)) — она как раз под новые версии.

Установка одинаковая для всех вариантов:

1. Положите jar в `plugins/` (в панели: **Файлы → plugins → Загрузить**).
2. Перезапустите сервер (не `/reload`). Появится папка `plugins/dynmap/`.
3. Проверьте консоль: `[dynmap] version … is active` и `Web server started on …:8123`.
   Строка `unsupported version` означает, что сборка не подходит к вашей версии сервера.

Если папки `plugins/dynmap/` нет, значит jar не загрузился или не подошёл — смотрите
консоль, там будет `Could not load plugins/dynmap/...`.

## 2. `plugins/dynmap/configuration.txt`

Что важно поменять (остальное — значения по умолчанию):

```yaml
# слушаем только localhost: наружу отдаёт cloudflared
webserver-bindaddress: 127.0.0.1
webserver-port: 8123
disable-webserver: false

# интервал /up/world в миллисекундах (наш фронтенд читает его из /up/configuration)
updaterate: 2000

# головы игроков на карте (/tiles/faces/32x32/<nick>.png)
showplayerfacesinmenu: true

# кириллица в никах/названиях внутри родного UI Dynmap
cyrillic-support: true
```

> `webserver-bindaddress` закомментирован по умолчанию (0.0.0.0). Если оставить 0.0.0.0,
> Dynmap будет доступен напрямую по IP — для теста удобно, для продакшена закройте порт
> файрволом. Туннель работает и с `127.0.0.1`.

## 3. `plugins/dynmap/worlds.txt` — карта «сверху»

Dynmap рисует карту только по перспективам из `perspectives.txt`
(встроенный класс `org.dynmap.hdmap.IsoHDPerspective`). **Top-down** — это та же
перспектива с `inclination: 90`: `iso_S_90_lowres|medres|hires|vlowres`, а также
`iso_N_90_*`, `iso_E_90_*`, `iso_W_90_*`.

> Имя перспективы означает, **откуда** смотрит камера. Поэтому привычная ориентация
> «север сверху, восток справа» — это `iso_S_90_*` (камера с юга). `iso_N_90_*` даст
> перевёрнутую карту (юг сверху, восток слева). Проверяется матрицей `worldtomap`
> в `/up/configuration`: у `iso_S_90` это `[+scale,0,0, 0,0,-scale, 0,1,0]`.

```yaml
worlds:
  - name: world
    title: Мир
    maps:
      - class: org.dynmap.hdmap.HDMap
        name: flat
        title: Поверхность
        prefix: flat
        perspective: iso_S_90_medres
        shader: stdtexture
        lighting: shadows
        mapzoomin: 2
        # mapzoomout намеренно не задаём: Dynmap вычислит его из scale перспективы
        background: "#0b1017"
      - class: org.dynmap.hdmap.HDMap
        name: iso
        title: Изометрия
        prefix: iso
        perspective: iso_SE_60_hires
        shader: stdtexture
        lighting: shadows
        mapzoomin: 1

  - name: world_nether
    title: Нижний мир
    maps:
      - class: org.dynmap.hdmap.HDMap
        name: flat
        title: Нижний мир
        prefix: flat
        perspective: iso_S_90_medres
        shader: stdtexture
        lighting: nethershadows
        background: "#300806"
```

Что означают суффиксы: `vlowres → hires` меняют `scale` перспективы (сколько блоков
приходится на пиксель рендера) и, как следствие, число уровней зума. Начните с `_medres`;
если рендер слишком долгий — `_lowres`, если нужна детализация — `_hires` (дороже по CPU
и диску).

После правки: `/dynmap reload` (или рестарт) и полный рендер:

```
/dynmap fullrender world:flat
/dynmap fullrender world_nether:flat
```

Инкрементальный рендер идёт сам по мере изменения чанков (`renderinterval`).

## 4. Marker API

Hypemap подхватывает Dynmap через `softdepend: [dynmap]` и `DynmapCommonAPI`:
набор маркеров задаётся в `plugins/Hypemap/config.yml` → `dynmap.marker-set-id`
(по умолчанию `hypemap.towns`, подпись «Поселения»).

Для каждого поселения вызывается:

```java
AreaMarker marker = markerSet.createAreaMarker(id, name, false, world, xs, zs, false);
marker.setCornerLocations(xs, zs);
marker.setFillStyle(fillOpacity, parseColor(fillColor));
marker.setLineStyle(lineWeight, lineOpacity, parseColor(lineColor));
marker.setLabel(name);
marker.setRangeY(y + 20, y);
marker.setMinZoom(visible ? minZoom : 99);
```

Маркеры видны в родном интерфейсе Dynmap (`/tiles/_markers_/…json`) и в плагинах,
которые читают Marker API (например, карты в Discord-ботах). Состояние в SQLite —
источник правды: при старте плагин пересоздаёт набор (`delete-orphan-markers: true`
удаляет маркеры, которых нет в базе).

## 5. Что читает фронтенд

| URL | Что берём |
| --- | --- |
| `/up/configuration` | `worlds[].maps[]` (`type`, `prefix`, `mapzoomout`, `mapzoomin`, `tilescale`, `image-format`, `nightandday`), `worldtomap`/`maptoworld`, `updaterate`, `confighash` |
| `/up/world/<world>/<ts>` | `players[]`, `servertime`, `hasStorm`, `currentcount`, `maxcount` |
| `/tiles/<prefix>/<x>/<y>/<z>.png` | тайлы |
| `/tiles/faces/32x32/<nick>.png` | головы игроков |

`GET /up/configuration` у Dynmap отдаёт `type: "HDMapType"` для всех HD-карт.
Никакого `FlatMapType` в современных версиях нет — это важно, если вы ищете старые
примеры в интернете.

## 6. Диагностика

| Симптом | Причина / решение |
| --- | --- |
| Карта серая, тайлы 404 | не запускался `fullrender` для этого мира/карты, либо `prefix` в worlds.txt не совпадает с тем, что в URL |
| Полигоны «съехали» относительно карты | в `config.yml` `web.dynmap-url` и API указывают на разные серверы, либо карта изометрическая — для 60° высота `y` смещает точки, задайте `town.y` реалистично (по умолчанию 64) |
| Игроки не двигаются | `/up/world/...` возвращает 403/404 — проверьте `disable-webserver`, `allowed-origins` в `configuration.txt` (Dynmap 3.x проверяет Origin) |
| Нет голов игроков | `showplayerfacesinmenu: false` или игрок ни разу не заходил после установки Dynmap |
| Marker API недоступен | плагин загрузился раньше Dynmap → `softdepend` решает это, но после `/reload` порядок может сломаться; `/hypemap resync` |
