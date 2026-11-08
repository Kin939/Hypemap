# Hypemap — плагин

Paper 1.21.3, Java 21, Maven. Хранит поселения в SQLite, отдаёт REST API и синхронизирует
границы в Dynmap через Marker API.

## Сборка

```bash
mvn -B clean package     # → target/Hypemap-1.0.0.jar
```

Зависимости: `paper-api` (provided), `gson`, `sqlite-jdbc` — обе шифруются в jar
(maven-shade-plugin), поэтому на сервере ничего доустанавливать не нужно.

## Структура

```
net.hypemap
├── HypemapPlugin       onEnable/onDisable, таймеры синхронизации и кеша игроков
├── config.Settings     config.yml → типизированные поля (работает и после /hypemap reload)
├── model               Town, TownPoint, TownMember, HistoryEntry, AuditEntry, User
├── storage             Database (SQLite+WAL), TownRepository, UserRepository, AuditRepository
├── auth                PasswordHasher (PBKDF2), JwtCodec (HS256), AccessJwtVerifier, AuthService
├── api                 ApiServer (com.sun.net.httpserver), Route/Handler, TownValidator, HttpSupport
├── dynmap.DynmapBridge Marker API: createAreaMarker/setCornerLocations/setFillStyle/setLineStyle
├── service.PlayerCache кеш игроков, обновляется только в главном потоке
└── commands            /hypemap info|reload|resync|passwd|role|users|backup
```

Правила, которые важно не нарушать при доработке:

1. Из HTTP-потоков **нельзя** обращаться к Bukkit API напрямую — только через `PlayerCache`
   и `DynmapBridge.requestSync()`.
2. Все обращения к SQLite — внутри `synchronized (database)`.
3. Никаких `null` в полях `Town` после десериализации: `Town.normalize()` обязателен.
4. Любое изменение поселения завершается `dynmap.requestSync()`.

## Конфиг

`src/main/resources/config.yml` — полностью документирован, копируется в
`plugins/Hypemap/config.yml` при первом запуске и никогда не перезаписывается.

## Тесты

Пока нет: логика покрыта сквозными проверками через `web/mock` (мок API повторяет контракт)
и ручным чек-листом из `docs/DEPLOY.md`. Для добавления — JUnit 5 + `paper-api` в `test` scope,
`TownValidator` и `TownRepository` тестируются без запуска сервера.
