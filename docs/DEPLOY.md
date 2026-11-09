# Развёртывание Hypemap

Полный путь: Dynmap → сборка плагина → Cloudflare Tunnel → Cloudflare Pages → (опционально) Access.
Всё, что требует JDK/Maven, выполняется **на вашей машине** — в этом репозитории уже лежит
готовый Maven-проект, компиляция занимает ~1 минуту.

Обозначения: `map.example.com` — публичный сайт (Pages), `mc.example.com` — хостнейм туннеля.

## 0. Что понадобится

| Что | Версия |
| --- | --- |
| Paper | 1.21.3 (подойдёт 1.21.x) |
| Java | 21 (обязательно для Paper 1.21.3) |
| Maven | 3.9+ (или GitHub Actions, см. §2.2) |
| Dynmap | 3.7-beta-8+ |
| Node.js | 20+ (сборка фронтенда) |
| Домен в Cloudflare | NS-серверы Cloudflare |
| `cloudflared` | последняя версия |

## 1. Dynmap

1. Скачайте Dynmap под **свою** версию сервера (таблица в [DYNMAP.md §1](DYNMAP.md)):
   для 1.21–1.21.4 — [`Dynmap-3.7-beta-8-spigot.jar`](https://cdn.modrinth.com/data/fRQREgAc/versions/ImNNT17B/Dynmap-3.7-beta-8-spigot.jar)
   (11,7 МБ), для 1.21.9–1.21.11 — сборки [jacob1/dynmap](https://github.com/jacob1/dynmap/releases),
   для 1.21.5–1.21.8 Spigot-сборки Dynmap не существует — плагин отключается сам
   (`Dynmap is disabled (unsupported platform)`), нужен переход на 1.21.4 или 1.21.9+
   (подробности в DYNMAP.md).
   Положите jar в `plugins/`, перезапустите сервер: появится `plugins/dynmap/`.
2. В `plugins/dynmap/configuration.txt`:

   ```yaml
   webserver-bindaddress: 127.0.0.1
   webserver-port: 8123
   updaterate: 2000
   cyrillic-support: true
   showplayerfacesinmenu: true
   ```

3. В `plugins/dynmap/worlds.txt` добавьте top-down карту (полный пример — в
   [DYNMAP.md](DYNMAP.md)):

   ```yaml
   - class: org.dynmap.hdmap.HDMap
     name: flat
     title: Поверхность
     prefix: flat
     perspective: iso_S_90_medres
     shader: stdtexture
     lighting: shadows
     mapzoomin: 2
   ```

4. `/dynmap reload`, затем `/dynmap fullrender world:flat` (рендер можно оставить на ночь).
5. Проверка: `curl -s http://127.0.0.1:8123/up/configuration | head -c 300`
   — в JSON должна быть карта с `"type":"HDMapType"`.

## 2. Плагин Hypemap

> Hypemap **не рисует тайлы сам** — он показывает поверх карты Dynmap. Без Dynmap
> сайт откроется, но напишет «Не удалось загрузить конфигурацию Dynmap», а `/api/health`
> вернёт `"dynmap": false`. Поэтому шаг 1 обязателен.

### 2.1 Сборка локально

```bash
git clone https://github.com/Kin939/Hypemap.git
cd Hypemap/plugin
mvn -B clean package
# → target/Hypemap-1.0.0.jar
```

Если Maven нет:

```bash
# Debian/Ubuntu
sudo apt install -y openjdk-21-jdk maven
# macOS
brew install openjdk@21 maven
# Windows: Adoptium JDK 21 + Apache Maven, затем в PowerShell то же `mvn -B clean package`
```

Типичные ошибки сборки:

| Ошибка | Решение |
| --- | --- |
| `invalid target release: 21` | Maven работает на старой JDK — выставьте `JAVA_HOME` на JDK 21 |
| `Could not resolve io.papermc.paper:paper-api` | нужен доступ к `repo.papermc.io` (корпоративный прокси/файрвол) |
| `package does not exist: com.sun.net.httpserver` | JDK, а не JRE: нужен полный JDK |

### 2.2 Сборка в GitHub Actions (если JDK нет под рукой)

В репозитории есть workflow `.github/workflows/build.yml`: он собирает плагин и фронтенд
и складывает `Hypemap-1.0.0.jar` + `web-dist.zip` в артефакты запуска.
Откройте вкладку **Actions → Build → Run workflow**, скачайте артефакт.

### 2.3 Установка

```bash
cp target/Hypemap-1.0.0.jar /path/to/server/plugins/
```

Перезапустите сервер. В консоли появится:

```
[Hypemap] Хранилище готово: hypemap.db
[Hypemap] REST API слушает http://127.0.0.1:8800/api
========================================================
 Hypemap: создан администратор по умолчанию
   логин:  admin
   пароль: <16 случайных символов>
========================================================
```

**Сразу сохраните пароль** и смените его:

```
/hypemap passwd admin <новый-пароль>
```

Полезные команды: `/hypemap info`, `/hypemap reload`, `/hypemap resync`,
`/hypemap role <логин> ADMIN|EDITOR|VIEWER`, `/hypemap users`, `/hypemap backup`.

> Если Dynmap ещё не загрузился, плагин это переживёт: маркеры синхронизируются
> по `/hypemap resync` или автоматически при следующем изменении.

### 2.4 `plugins/Hypemap/config.yml`

Минимум, что нужно поправить:

```yaml
api:
  bind: 127.0.0.1        # наружу — только через туннель
  port: 8800
  public-url: 'https://map.example.com'
  allowed-origins:
    - 'https://map.example.com'
    - 'http://localhost:5173'   # dev-режим Vite

auth:
  mode: LOCAL            # LOCAL | ACCESS | HYBRID
  # jwt-secret генерируется сам и хранится в plugins/Hypemap/secrets.yml

web:
  site-title: 'Hypemap'
  server-name: 'Ваш сервер'
  dynmap-url: 'https://mc.example.com'
```

`plugins/Hypemap/secrets.yml` содержит секрет подписи JWT — не коммитьте его, не показывайте.

### 2.5 Проверка API

```bash
curl -s http://127.0.0.1:8800/api/health
# {"status":"ok","towns":0,"dynmap":true}

curl -s -X POST http://127.0.0.1:8800/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"<пароль>"}'
```

## 3. Cloudflare Tunnel

Туннель даёт публичный HTTPS на ваш сервер **без открытых портов**.

> **Не обязателен.** Если сервер в панели хостинга без SSH (только FTP) и `cloudflared`
> поставить некуда — пропустите этот раздел и сразу перейдите к
> [§5.4](#54-хостинг-без-ssh-два-порта-вместо-туннеля): там два открытых TCP-порта
> и **HTTPS-адреса из rProxy панели** (или туннель с другой машины).

```bash
# 1. установка (Debian/Ubuntu)
curl -L -o cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb

# 2. авторизация и создание туннеля
cloudflared tunnel login                 # откроет браузер, выберите домен
cloudflared tunnel create hypemap        # запомните UUID из вывода
cloudflared tunnel route dns hypemap mc.example.com
```

`/etc/cloudflared/config.yml`:

```yaml
tunnel: hypemap
credentials-file: /etc/cloudflared/<UUID>.json

ingress:
  # API плагина
  - hostname: mc.example.com
    path: ^/api(/.*)?$
    service: http://127.0.0.1:8800
  # всё остальное — Dynmap (тайлы, /up/*, аватарки)
  - hostname: mc.example.com
    service: http://127.0.0.1:8123
  - service: http_status:404
```

```bash
sudo mkdir -p /etc/cloudflared && sudo cp config.yml /etc/cloudflared/
sudo cp ~/.cloudflared/<UUID>.json /etc/cloudflared/   # и укажите путь в credentials-file
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

Проверка:

```bash
curl -s https://mc.example.com/api/health
curl -s https://mc.example.com/up/configuration | head -c 200
curl -sI https://mc.example.com/tiles/ | head -1
```

> Важно: **сначала `path`-правило для `/api`, потом общее** — cloudflared берёт первое
> совпадение. Если перепутать, `/api/*` уйдёт в Dynmap и вернёт 404.

## 4. Сборка фронтенда

```bash
cd web
npm ci
npm run build          # vue-tsc + vite build → web/dist
```

Переменные окружения для сборки (`.env.production`, необязательно — по умолчанию всё
same-origin):

```
VITE_API_BASE=
VITE_DYNMAP_BASE=
VITE_SITE_TITLE=Hypemap
```

## 5. Cloudflare: Workers + Static Assets (по умолчанию) или Pages

В репозитории два конфига — под оба типа проектов:

| Файл | Тип проекта | Команда деплоя |
| --- | --- | --- |
| `wrangler.toml` | **Workers + Static Assets** (так сейчас предлагает дашборд) | `npx wrangler deploy` |
| `wrangler.pages.toml` | Pages (Pages Functions из `functions/`) | `npx wrangler pages deploy web/dist --config wrangler.pages.toml --project-name hypemap` |

Логика прокси в обоих режимах одна (`functions/_lib/proxy.ts`): `worker/index.ts` —
точка входа для Workers, `functions/*/[[path]].ts` — для Pages.

### 5.1 Workers (то, что вы сейчас настраиваете)

`wrangler.toml` уже содержит `main`, `[assets]` и переменные. **Обязательно нужен шаг сборки**,
иначе `wrangler deploy` падает с ошибкой
`Could not detect a directory containing static files` — каталога `web/dist` просто нет.

В дашборде **Workers & Pages → ваш проект → Settings → Build**:

| Поле | Значение |
| --- | --- |
| Build command | `cd web && npm ci && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` (корень репозитория) |
| `NODE_VERSION` (переменная) | `20` или выше |

В **Settings → Variables and Secrets** добавьте:

```
HYPEMAP_ORIGIN        = https://mc.example.com   # адрес плагина (туннель или rProxy панели)
HYPEMAP_DYNMAP_ORIGIN = https://map.example.com  # НЕ обязательно: адрес Dynmap, если он отдельный
TILES_CACHE_TTL       = 604800
```

`HYPEMAP_DYNMAP_ORIGIN` нужен только когда Dynmap живёт на другом хосте/порту, чем
плагин. Тогда `/up/*` и `/tiles/*` идут на него, а `/api/*` — на `HYPEMAP_ORIGIN`.
Не задан — оба маршрута используют `HYPEMAP_ORIGIN` (случай одного туннеля/reverse-proxy).

Вручную с машины:

```bash
cd web && npm ci && npm run build && cd ..
npx wrangler login
npx wrangler deploy            # читает wrangler.toml
```

Что получается: статику отдаёт edge-слой Static Assets (без запуска воркера, SPA-фолбэк
для `/admin`, `/towns` включён), а `/api/*`, `/up/*`, `/tiles/*` проксирует воркер.

### 5.2 Pages (альтернатива)

Дашборд: **Workers & Pages → Create → Pages → Connect to Git**:

| Поле | Значение |
| --- | --- |
| Build command | `cd web && npm ci && npm run build` |
| Build output directory | `web/dist` |
| Root directory | `/` (нужен каталог `functions/`) |

CLI: `npx wrangler pages deploy web/dist --config wrangler.pages.toml --project-name hypemap`.

> В Pages-проекте не должно быть `main`/`[assets]` в конфиге — поэтому для Pages
> используется отдельный `wrangler.pages.toml`.

### 5.3 Что делают прокси-маршруты (одинаково в обоих режимах)

| Путь | Куда | Кеш |
| --- | --- | --- |
| `/api/*` | `HYPEMAP_ORIGIN/api/*` | `no-store` |
| `/up/configuration` | `DYNMAP_ORIGIN/up/configuration` | 5 минут (Cache API) |
| `/up/world/*` | `DYNMAP_ORIGIN/up/world/*` | нет (живые игроки) |
| `/tiles/*` | `DYNMAP_ORIGIN/tiles/*` | 7 дней на edge + браузер, при недоступности origin — прозрачный пиксель |

`DYNMAP_ORIGIN` = `HYPEMAP_DYNMAP_ORIGIN`, а если он не задан — `HYPEMAP_ORIGIN`.

Логи: `npx wrangler pages deployment tail` (Pages) или `npx wrangler tail` (Workers).

> Лимиты Free-тарифа: у Workers — 100 000 запросов/сутки, у Pages — 100 000 запросов Functions.
> Кеш тайлов на edge экономит и запросы, и трафик, но каждый уникальный тайл — это запрос.
> Для очень больших миров тайлы стоит вынести в R2 (см. «Масштабирование»).

### 5.4 Хостинг без SSH: rProxy панели вместо туннеля

Сервер арендован в панели (пример — [hosting-minecraft.pro](https://hosting-minecraft.pro/)),
SSH не выдают: только FTP/SFTP и консоль. `cloudflared` поставить некуда, значит туннеля
не будет. И тут есть важное ограничение Cloudflare:

> **Воркер ходит только на 80 и 443.** Нестандартный порт (например `25960`) он
> молча заменит на порт схемы, поэтому `HYPEMAP_ORIGIN = http://5.9.235.227:25960`
> не работает: запрос уйдёт на `5.9.235.227:80`. Исключение — домен назначения лежит
> **в той же зоне Cloudflare**, что и воркер.

Вывод: нужен **HTTPS-адрес на 443**, а не `IP:порт`. Взять его можно тремя способами.

#### Вариант A — rProxy в панели (рекомендуется)

У hosting-minecraft.pro (и у большинства Pterodactyl-панелей) есть раздел **rProxy**:
он публикует ваш порт как домен **за Cloudflare и с бесплатным SSL**. Лимит — 2 домена
на сервер, как раз под плагин и Dynmap.

1. Панель → **rProxy** → **создать**: имя (например `map`) + порт Dynmap (`25814`) → создать.
   Получите адрес вида `https://map.<домен>.xyz`.
2. Ещё раз **создать**: имя (например `api`) + порт плагина (`25960`) → `https://api.<домен>.xyz`.
3. Пропишите в Cloudflare → Workers & Pages → проект → **Settings → Variables and Secrets**:

```
HYPEMAP_ORIGIN        = https://api.<домен>.xyz     # rProxy → порт плагина
HYPEMAP_DYNMAP_ORIGIN = https://map.<домен>.xyz     # rProxy → порт Dynmap
TILES_CACHE_TTL       = 604800
```

4. Откройте в браузере `https://api.<домен>.xyz/api/health` → `{"status":"ok",...}`
   и `https://map.<домен>.xyz/up/configuration` → JSON.
5. Откройте `https://ваш-сайт/_diag` — там видно статусы обоих адресов и подсказки.

#### Вариант B — туннель с любой машины

`cloudflared` не обязан стоять на Minecraft-сервере: туннель может жить на вашем ПК
или Raspberry Pi и ходить к серверу по интернету. В конфиге туннеля тогда просто
указывается публичный адрес:

```yaml
ingress:
  - hostname: mc.example.com          # плагин
    service: http://5.9.235.227:25960
  - hostname: map.example.com         # Dynmap
    service: http://5.9.235.227:25814
  - service: http_status:404
```

Переменные — обычные `https://`-адреса туннеля (см. §3). Минус: машина с `cloudflared`
должна быть включена.

#### Вариант C — порт напрямую (без прокси)

Годится только если хостинг отдаёт HTTP на **80** (или у вас есть свой домен в той же
зоне Cloudflare, куда можно направить A-запись на IP сервера). Тогда в переменной
пишется `http://IP` без порта, а Dynmap/плагин слушают именно 80 — на общих тарифах
так не бывает, поэтому вариант редкий.

#### Что поправить в конфигах в любом случае

По FTP, затем перезапуск сервера.

`plugins/Hypemap/config.yml`

```yaml
api:
  bind: 0.0.0.0            # 127.0.0.1 работает только с туннелем на той же машине
  port: 25960              # порт из панели (раздел «Порты»)
  public-url: 'https://ваш-сайт'
  allowed-origins:
    - 'https://ваш-сайт'
```

`plugins/dynmap/configuration.txt` → `webserver-port: 25814` (порт из панели).

Порты в панели (раздел **«Порты»**) при этом нужны — они «двери» к плагину и Dynmap,
но в переменных Cloudflare указываются не они, а HTTPS-адреса rProxy/туннеля.

## 6. Cloudflare Access (опционально, но рекомендуется)

Два независимых сценария — можно включить оба.

### 6.1 Закрыть `/admin` на сайте

1. Zero Trust → **Access → Applications → Add an application → Self-hosted**.
2. Application domain: `map.example.com`, path: `admin`.
3. Policy: `Allow` → `Emails` → список админов (или `One-time PIN`).

Теперь до `/admin` не дойдёт никто без входа в Access. Плагин при этом продолжает
требовать свой JWT — это второй слой (defense in depth).

### 6.2 Закрыть туннель сервисным токеном

Чтобы `mc.example.com` не был публичным:

1. Zero Trust → **Access → Service Auth → Create service token** → сохраните
   `Client ID` и `Client Secret`.
2. Access → Applications → добавьте приложение на `mc.example.com` с политикой
   `Service Auth` (и, при желании, `Allow` для своего IP).
3. В Pages: **Settings → Environment variables → Add secret**:

   ```
   ACCESS_CLIENT_ID      = <client id>
   ACCESS_CLIENT_SECRET  = <client secret>
   ```

Pages Functions передают эти заголовки в каждом запросе к туннелю (см. `functions/_lib/proxy.ts`).

### 6.3 Access-идентичность внутри API (режим HYBRID)

Если хотите, чтобы в аудите были e-mail из Access:

```yaml
auth:
  mode: HYBRID
  access:
    team-domain: 'yourteam.cloudflareaccess.com'
    audience: '<Application Audience (AUD) Tag>'
    admin-emails: ['you@example.com']
    default-role: EDITOR
```

Плагин проверяет `Cf-Access-Jwt-Assertion` по JWKS команды (кеш 60 минут), `aud` и e-mail.

## 7. Проверка после деплоя

- [ ] `https://map.example.com/` — открывается карта с тайлами Dynmap
- [ ] тайлы грузятся (`/tiles/...` → 200, в DevTools есть `x-hypemap-cache`)
- [ ] игроки двигаются, клик по игроку показывает ник и координаты
- [ ] полигоны поселений на месте, клик открывает карточку
- [ ] `/admin` → вход под `admin` → создание поселения
- [ ] созданное поселение появилось на карте и в `/dynmap` (родной UI)
- [ ] перетаскивание вершины сохраняется после перезагрузки
- [ ] `DELETE` возвращает 403 под ролью EDITOR (проверка ролей работает)
- [ ] `https://map.example.com/api/health` → `{"status":"ok",...}`
- [ ] `https://map.example.com/_diag` → `"ok": true` (если `false` — в поле `hints` прямо написано, что не так)

> `/_diag` открыт всем: он показывает адреса origin'ов и HTTP-статусы, без секретов.
> Не хотите публичности — закройте его политикой Cloudflare Access (§6.1) или удалите
> маршрут в `worker/index.ts`.

## 8. Обновления и бэкапы

```bash
# обновление плагина
cd Hypemap/plugin && git pull && mvn -B clean package
# остановить сервер → заменить jar → запустить

# обновление фронтенда
cd web && npm ci && npm run build && cd ..
npx wrangler pages deploy web/dist --project-name hypemap
```

Бэкап данных: файл `plugins/Hypemap/hypemap.db` (+ `-wal`, `-shm`) или
`/hypemap backup` — выгрузит JSON со всеми поселениями в `plugins/Hypemap/backups/`.
История ревизий лежит в самой базе (`town_history`), поэтому откат возможен и без бэкапа.

## 9. Диагностика

| Симптом | Причина | Решение |
| --- | --- | --- |
| `502 upstream_unreachable` | cloudflared не запущен или неверный порт | `systemctl status cloudflared`, `cloudflared tunnel info hypemap` |
| `/api/*` отдаёт HTML Dynmap | правило `path` в ingress не сработало | переставьте правила, `^/api(/.*)?$` должно быть первым |
| `Could not detect a directory containing static files` при `wrangler deploy` | не выполнен шаг сборки: нет `web/dist` | Build command = `cd web && npm ci && npm run build`, deploy = `npx wrangler deploy` |
| `Configuration file for Pages projects does not support 'main'` | Pages-проект читает `wrangler.toml` от Workers | деплойте Pages с `--config wrangler.pages.toml` |
| Сайт открылся, `/api/health` → 502 `upstream_unreachable` | не задан `HYPEMAP_ORIGIN` или туннель не поднят | Variables в дашборде + `systemctl status cloudflared` |
| Сайт пишет «Не удалось загрузить конфигурацию Dynmap», `/api/health` → `"dynmap": false` | Dynmap не установлен или не загрузился | нет папки `plugins/dynmap/` → поставьте Dynmap под свою версию ([DYNMAP.md §1](DYNMAP.md)) |
| В консоли `[Dynmap] bukkit version incompatible!` / `Dynmap is disabled (unsupported platform)` | версия сервера новее 1.21.4, Spigot-сборки Dynmap для неё нет | перейти на 1.21.4 (с бэкапом) или на 1.21.9+ со сборкой jacob1 — [DYNMAP.md §1](DYNMAP.md) |
| Карта серая (пиксель вместо тайлов), `/api/health` работает | не задан/неверен `HYPEMAP_DYNMAP_ORIGIN` либо закрыт порт Dynmap | откройте адрес Dynmap из переменной (`…/up/configuration`); проверьте `webserver-port` и порт в панели; см. `/_diag` |
| `/api/health` → 502, в сообщении «порт 25960» | адрес с нестандартным портом: Workers ходят только на 80/443 | HTTPS-адрес из rProxy панели или туннель (§5.4) |
| `/_diag` → `"ok": false` | смотрите поле `hints` — там перечислены конкретные причины | исправьте то, что указано, и обновите страницу |
| Карта серая | нет тайлов | `fullrender`, проверьте `prefix` в worlds.txt |
| `401` при сохранении | истёк JWT (12 ч) | войдите заново; проверьте часы на сервере |
| `403` на удаление | роль EDITOR | `/hypemap role <логин> ADMIN` |
| Поселения есть, а маркеров в Dynmap нет | Dynmap не инициализировал Marker API | `/hypemap resync`, проверьте `dynmap.enabled: true` |
| Тайлы 200, но пустые | `background`/`image-format` карты | проверьте `image-format: png` и `fullrender` |
| Сайт открывается, но запросы блокирует CSP | сторонний скрипт/шрифт | CSP в `functions/_middleware.ts` |
| 429 при входе | rate limit 8 попыток / 5 мин | подождите или перезапустите сервер |

## 10. Масштабирование (когда вырастет)

- **Тайлы в R2**: заливайте `web/tiles` в бакет R2 и отдавайте через Worker с `Cache-Control: immutable` — снимает нагрузку с сервера и лимит запросов Functions.
- **Несколько миров**: Hypemap уже группирует поселения по `world`, фронтенд переключает карты из `/up/configuration`.
- **Несколько редакторов**: роли `EDITOR`/`ADMIN`, аудит и история ревизий готовы.
- **SSE/WebSocket**: если нужен реалтайм быстрее 1–2 секунд, `/api/stream` можно добавить поверх `com.sun.net.httpserver` (chunked response) без смены стека.
