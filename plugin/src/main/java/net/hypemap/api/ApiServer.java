package net.hypemap.api;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import net.hypemap.HypemapPlugin;
import net.hypemap.auth.ApiUser;
import net.hypemap.auth.AuthException;
import net.hypemap.auth.AuthService;
import net.hypemap.config.Settings;
import net.hypemap.dynmap.DynmapBridge;
import net.hypemap.service.PlayerCache;
import net.hypemap.storage.AuditRepository;
import net.hypemap.storage.StorageException;
import net.hypemap.storage.TownRepository;
import net.hypemap.storage.UserRepository;

/**
 * Встроенный HTTP-сервер REST API.
 * <p>
 * Осознанно используется {@code com.sun.net.httpserver} из JDK: ноль зависимостей,
 * не нужен Javalin/Undertow, а производительности с запасом хватает для админки и карты.
 * Сервер слушает localhost и публикуется наружу через Cloudflare Tunnel.
 */
public final class ApiServer {

    private final HypemapPlugin plugin;
    private final Settings settings;
    private final AuthService auth;
    private final ApiHandlers handlers;
    private final List<Route> routes = new ArrayList<>();

    private HttpServer server;
    private ExecutorService executor;

    public ApiServer(HypemapPlugin plugin, Settings settings, TownRepository towns, UserRepository users,
                     AuditRepository audit, AuthService auth, DynmapBridge dynmap, PlayerCache players,
                     TownValidator validator) {
        this.plugin = plugin;
        this.settings = settings;
        this.auth = auth;
        this.handlers = new ApiHandlers(plugin, settings, towns, users, audit, auth, dynmap, players, validator);
        registerRoutes();
    }

    private void registerRoutes() {
        // public
        get("/api/health", null, handlers::health);
        get("/api/meta", null, handlers::meta);
        post("/api/auth/login", null, handlers::login);
        get("/api/auth/me", null, handlers::me);
        get("/api/towns", null, handlers::listTowns);
        get("/api/towns/{id}", null, handlers::getTown);

        // editor
        post("/api/towns", "EDITOR", handlers::createTown);
        put("/api/towns/{id}", "EDITOR", handlers::updateTown);
        patch("/api/towns/{id}/visibility", "EDITOR", handlers::setVisibility);
        get("/api/towns/{id}/history", "EDITOR", handlers::townHistory);
        get("/api/players", "EDITOR", handlers::knownPlayers);
        post("/api/auth/password", "AUTH", handlers::changePassword);

        // admin
        delete("/api/towns/{id}", "ADMIN", handlers::deleteTown);
        post("/api/towns/{id}/restore", "ADMIN", handlers::restoreTown);
        post("/api/dynmap/resync", "ADMIN", handlers::resyncDynmap);
        get("/api/users", "ADMIN", handlers::listUsers);
        post("/api/users", "ADMIN", handlers::upsertUser);
        delete("/api/users/{username}", "ADMIN", handlers::deleteUser);
        get("/api/audit", "ADMIN", handlers::auditLog);
    }

    private void get(String pattern, String role, Handler handler) {
        routes.add(new Route("GET", pattern, role, handler));
    }

    private void post(String pattern, String role, Handler handler) {
        routes.add(new Route("POST", pattern, role, handler));
    }

    private void put(String pattern, String role, Handler handler) {
        routes.add(new Route("PUT", pattern, role, handler));
    }

    private void patch(String pattern, String role, Handler handler) {
        routes.add(new Route("PATCH", pattern, role, handler));
    }

    private void delete(String pattern, String role, Handler handler) {
        routes.add(new Route("DELETE", pattern, role, handler));
    }

    public void start() {
        if (!settings.apiEnabled) {
            plugin.getLogger().warning("REST API отключён (api.enabled = false).");
            return;
        }
        try {
            server = HttpServer.create(new InetSocketAddress(settings.apiBind, settings.apiPort), 64);
            AtomicInteger counter = new AtomicInteger();
            executor = Executors.newFixedThreadPool(settings.apiThreads, runnable -> {
                Thread thread = new Thread(runnable, "Hypemap-API-" + counter.incrementAndGet());
                thread.setDaemon(true);
                return thread;
            });
            server.setExecutor(executor);
            server.createContext("/", this::handle);
            server.start();
            plugin.getLogger().info("REST API слушает http://" + settings.apiBind + ":" + settings.apiPort + "/api");
            if (settings.apiBind.equals("127.0.0.1") || settings.apiBind.equals("localhost")) {
                plugin.getLogger().info("Наружу публикуется через Cloudflare Tunnel (см. docs/DEPLOY.md).");
            }
        } catch (IOException ex) {
            plugin.getLogger().severe("Не удалось запустить REST API: " + ex.getMessage());
        }
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
        if (executor != null) {
            executor.shutdown();
            try {
                executor.awaitTermination(3, TimeUnit.SECONDS);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
            executor = null;
        }
    }

    public boolean running() {
        return server != null;
    }

    // ------------------------------------------------------------------ routing

    private void handle(HttpExchange exchange) {
        String origin = exchange.getRequestHeaders().getFirst("Origin");
        Map<String, String> cors = HttpSupport.corsHeaders(origin, settings.allowedOrigins);
        try {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                HttpSupport.sendEmpty(exchange, 204, cors);
                return;
            }

            String path = exchange.getRequestURI().getPath();
            if (path == null || path.isEmpty()) path = "/";
            String[] segments = Route.split(path);

            if (segments.length == 1 && "api".equalsIgnoreCase(segments[0])) {
                HttpSupport.sendJson(exchange, 200, Map.of(
                        "name", settings.siteTitle,
                        "version", plugin.getPluginMeta().getVersion(),
                        "docs", "/api/meta"), cors);
                return;
            }

            Map<String, String> params = new LinkedHashMap<>();
            Route matched = null;
            for (Route route : routes) {
                Map<String, String> candidate = new LinkedHashMap<>();
                if (route.matches(exchange.getRequestMethod(), segments, candidate)) {
                    matched = route;
                    params = candidate;
                    break;
                }
            }
            if (matched == null) {
                HttpSupport.sendJson(exchange, 404, error("not_found", "Маршрут не найден: "
                        + exchange.getRequestMethod() + " " + path), cors);
                return;
            }

            ApiUser user;
            try {
                user = auth.authenticate(
                        exchange.getRequestHeaders().getFirst("Authorization"),
                        exchange.getRequestHeaders().getFirst("Cf-Access-Jwt-Assertion"));
            } catch (AuthException ex) {
                HttpSupport.sendJson(exchange, ex.status(), error(ex.code(), ex.getMessage()), cors);
                return;
            }

            String body = "";
            String method = exchange.getRequestMethod();
            if ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)
                    || "PATCH".equalsIgnoreCase(method)) {
                body = HttpSupport.readBody(exchange, settings.maxBodyBytes);
            }

            ApiContext ctx = new ApiContext(exchange, user, params,
                    HttpSupport.parseQuery(exchange.getRequestURI()), body, origin);

            if (matched.role() != null) {
                if ("AUTH".equals(matched.role())) {
                    ctx.requireAuthenticated();
                } else {
                    ctx.requireRole(matched.role());
                }
            }

            Object result = matched.handler().handle(ctx);
            if (result == null) {
                HttpSupport.sendEmpty(exchange, 204, cors);
            } else if (result instanceof Result custom) {
                if (custom.body == null) {
                    HttpSupport.sendEmpty(exchange, custom.status, cors);
                } else {
                    HttpSupport.sendJson(exchange, custom.status, custom.body, cors);
                }
            } else {
                HttpSupport.sendJson(exchange, 200, result, cors);
            }
        } catch (ApiException ex) {
            safeError(exchange, cors, ex.status(), ex.code(), ex.getMessage());
        } catch (AuthException ex) {
            safeError(exchange, cors, ex.status(), ex.code(), ex.getMessage());
        } catch (StorageException ex) {
            plugin.getLogger().warning("Ошибка хранилища: " + ex.getMessage());
            safeError(exchange, cors, 500, "storage_error", "Ошибка базы данных");
        } catch (Throwable ex) {
            plugin.getLogger().warning("Необработанная ошибка API: " + ex);
            safeError(exchange, cors, 500, "internal_error", "Внутренняя ошибка сервера");
        } finally {
            exchange.close();
        }
    }

    private void safeError(HttpExchange exchange, Map<String, String> cors, int status, String code, String message) {
        try {
            HttpSupport.sendJson(exchange, status, error(code, message), cors);
        } catch (IOException ignored) {
            // клиент уже отключился
        }
    }

    private static Map<String, Object> error(String code, String message) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("code", code);
        error.put("message", message == null ? "" : message);
        return Map.of("error", error);
    }
}
