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

1. Скачайте `Dynmap-3.7-beta-8-spigot.jar` (или новее) со страницы релизов Dynmap,
   положите в `plugins/`, перезапустите сервер.
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
     perspective: iso_N_90_medres
     shader: stdtexture
     lighting: shadows
     mapzoomin: 2
   ```

4. `/dynmap reload`, затем `/dynmap fullrender world:flat` (рендер можно оставить на ночь).
5. Проверка: `curl -s http://127.0.0.1:8123/up/configuration | head -c 300`
   — в JSON должна быть карта с `"type":"HDMapType"`.

## 2. Плагин Hypemap

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

## 5. Cloudflare Pages

### 5.1 Деплой из CLI (быстрее всего)

```bash
# из корня репозитория (там, где лежат functions/ и wrangler.toml)
npx wrangler login
npx wrangler pages project create hypemap --production-branch main
npx wrangler pages deploy web/dist --project-name hypemap
```

Wrangler сам подхватит `functions/` (Pages Functions) и `wrangler.toml`.
В `wrangler.toml` поменяйте `HYPEMAP_ORIGIN` на свой хостнейм туннеля:

```toml
[vars]
HYPEMAP_ORIGIN = "https://mc.example.com"
TILES_CACHE_TTL = "604800"
```

Либо в dashboard: **Pages → hypemap → Settings → Environment variables**.

### 5.2 Деплой из Git (автосборка на каждый push)

**Pages → Create application → Connect to Git**:

| Поле | Значение |
| --- | --- |
| Framework preset | `None` |
| Build command | `cd web && npm ci && npm run build` |
| Build output directory | `web/dist` |
| Root directory | `/` (корень репозитория — нужен `functions/`) |
| Node version | `20` (переменная `NODE_VERSION`) |

### 5.3 Что делают Functions

| Путь | Куда | Кеш |
| --- | --- | --- |
| `/api/*` | `HYPEMAP_ORIGIN/api/*` | `no-store` |
| `/up/configuration` | `HYPEMAP_ORIGIN/up/configuration` | 5 минут (Cache API) |
| `/up/world/*` | `HYPEMAP_ORIGIN/up/world/*` | нет (живые игроки) |
| `/tiles/*` | `HYPEMAP_ORIGIN/tiles/*` | 7 дней на edge + браузер, при недоступности origin — прозрачный пиксель |

Логи: `npx wrangler pages deployment tail --project-name hypemap`.

> Тариф Free: 100 000 запросов/сутки на Functions. Кеш тайлов на edge сильно экономит
> и запросы, и трафик, но *каждый уникальный* тайл — это один запрос. Для очень больших
> миров имеет смысл вынести тайлы в R2 + кеширующий Worker (см. раздел «Масштабирование»).

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
