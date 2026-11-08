# Hypemap — фронтенд

Vue 3 + TypeScript + Vite + Leaflet. Собственный tile layer к Dynmap, полигоны поселений,
живые игроки, админ-панель с редактором границ.

```bash
npm ci
npm run dev        # http://localhost:5173 (проксирует /api /up /tiles на 127.0.0.1:8080)
npm run mock       # стенд: мок API + мок Dynmap + демо-тайлы, http://localhost:8080
npm run tiles      # перегенерировать демо-тайлы (нужен, если mock/tiles пуст)
npm run build      # vue-tsc + vite build → dist
npm run typecheck
```

Демо-логин админки: `admin` / `admin` (мок, в памяти).

## Как это работает

| Файл | Ответственность |
| --- | --- |
| `src/map/dynmapMath.ts` | проекция world↔LatLng по матрицам Dynmap, URL тайлов, опции `TileLayer` |
| `src/map/MapEngine.ts` | обёртка Leaflet: тайлы, полигоны, маркеры игроков, редактор вершин |
| `src/stores/server.ts` | `/up/configuration` → `MapDefinition`, переключение миров/карт |
| `src/stores/players.ts` | опрос `/up/world/<world>/<ts>` с интервалом `updaterate` |
| `src/stores/towns.ts` | кеш поселений, поиск/фильтр, `focusRequest` для камеры |
| `src/stores/auth.ts` | JWT в localStorage, роли, авто-выход по 401 |
| `src/admin/draft.ts` | черновик поселения + валидация (общая для формы и карты) |
| `src/components/TownForm.vue` | форма: цвета, флаги, участники, зум-диапазон |
| `src/views/AdminEditorPage.vue` | черновик + карта + история ревизий + удаление |

## Правила проекции (кратко)

```
tileUrl: {prefix}/{⌊x/32⌋}_{⌊-y/32⌋}/{z-prefix}{x}_{y}.{png|jpg}
world→px: lng = m0*x + m1*y + m2*z ; lat = m3*x + m4*y + m5*z
px→LatLng: LatLng(-((tileSize - lat)/2^mapzoomout), lng/2^mapzoomout)
```

`zoomReverse: true`, `maxZoom = mapzoomin + mapzoomout`, `maxNativeZoom = mapzoomout`,
`CRS.Simple`. Полный разбор — `docs/ARCHITECTURE.md`.

## Стиль

Дизайн-система — `src/styles/main.css` (CSS-переменные, тёмная тема, `--accent`, радиусы,
классы `.topbar`, `.sidebar`, `.town-details`, `.admin-*`, `.map-toolbar`, `.field`, `.modal`).
Компоненты не содержат «магических» цветов — только токены.
