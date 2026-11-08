package net.hypemap.api;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import org.bukkit.Bukkit;

import net.hypemap.HypemapPlugin;
import net.hypemap.auth.AuthService;
import net.hypemap.config.Settings;
import net.hypemap.dynmap.DynmapBridge;
import net.hypemap.model.HistoryEntry;
import net.hypemap.model.Town;
import net.hypemap.model.User;
import net.hypemap.service.PlayerCache;
import net.hypemap.storage.AuditRepository;
import net.hypemap.storage.TownRepository;
import net.hypemap.storage.UserRepository;
import net.hypemap.util.Json;
import net.hypemap.util.Text;

/** Вся бизнес-логика REST API. */
public final class ApiHandlers {

    private final HypemapPlugin plugin;
    private final Settings settings;
    private final TownRepository towns;
    private final UserRepository users;
    private final AuditRepository audit;
    private final AuthService auth;
    private final DynmapBridge dynmap;
    private final PlayerCache players;
    private final TownValidator validator;

    public ApiHandlers(HypemapPlugin plugin, Settings settings, TownRepository towns, UserRepository users,
                       AuditRepository audit, AuthService auth, DynmapBridge dynmap, PlayerCache players,
                       TownValidator validator) {
        this.plugin = plugin;
        this.settings = settings;
        this.towns = towns;
        this.users = users;
        this.audit = audit;
        this.auth = auth;
        this.dynmap = dynmap;
        this.players = players;
        this.validator = validator;
    }

    // ------------------------------------------------------------------ public

    public Object health(ApiContext ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", "ok");
        out.put("time", Text.iso(System.currentTimeMillis()));
        out.put("towns", towns.count());
        out.put("dynmap", dynmap.available());
        return out;
    }

    public Object meta(ApiContext ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", settings.siteTitle);
        out.put("serverName", settings.serverName);
        out.put("version", plugin.getPluginMeta().getVersion());
        out.put("apiVersion", 1);

        Map<String, Object> server = new LinkedHashMap<>();
        server.put("name", settings.serverName);
        server.put("minecraft", safeMinecraftVersion());
        server.put("online", players.online().size());
        server.put("max", Bukkit.getMaxPlayers());
        server.put("worlds", players.worlds());
        server.put("players", new ArrayList<>(players.online()));
        out.put("server", server);

        Map<String, Object> dyn = new LinkedHashMap<>();
        dyn.put("available", dynmap.available());
        dyn.put("version", dynmap.coreVersion());
        dyn.put("markerSetId", dynmap.markerSetId());
        dyn.put("url", settings.dynmapUrl);
        out.put("dynmap", dyn);

        Map<String, Object> authInfo = new LinkedHashMap<>();
        authInfo.put("mode", settings.authMode.name());
        authInfo.put("localLogin", settings.authMode.allowsLocalLogin());
        authInfo.put("access", settings.authMode.allowsAccessJwt() && auth.accessVerifier().configured());
        out.put("auth", authInfo);

        Map<String, Object> limits = new LinkedHashMap<>();
        limits.put("maxPolygonPoints", settings.maxPolygonPoints);
        limits.put("maxMembers", settings.maxMembers);
        limits.put("minNameLength", settings.minNameLength);
        limits.put("maxNameLength", settings.maxNameLength);
        limits.put("maxBodyBytes", settings.maxBodyBytes);
        out.put("limits", limits);

        out.put("flags", new ArrayList<>(settings.townFlags));
        out.put("townCount", towns.count());
        out.put("defaults", Map.of(
                "fillColor", "#22c55e",
                "lineColor", "#16a34a",
                "fillOpacity", settings.defaultFillOpacity,
                "lineOpacity", settings.defaultLineOpacity,
                "lineWeight", settings.defaultLineWeight));
        out.put("discordInvite", settings.discordInvite);
        return out;
    }

    public Object login(ApiContext ctx) {
        LoginInput input = ctx.body(LoginInput.class);
        AuthService.LoginResult result = auth.login(input.username, input.password, HttpSupport.clientIp(
                ctx.exchange, settings.trustForwardedFor));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("token", result.token);
        out.put("expiresAt", result.expiresAt);
        out.put("user", Map.of("username", result.username, "role", result.role, "source", "local"));
        return out;
    }

    public Object me(ApiContext ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        boolean authenticated = !"anonymous".equals(ctx.user.username);
        out.put("authenticated", authenticated);
        if (authenticated) {
            Map<String, Object> user = new LinkedHashMap<>();
            user.put("username", ctx.user.username);
            user.put("role", ctx.user.role);
            user.put("source", ctx.user.source);
            user.put("email", ctx.user.email);
            out.put("user", user);
        }
        out.put("auth", Map.of("mode", settings.authMode.name(),
                "localLogin", settings.authMode.allowsLocalLogin()));
        return out;
    }

    // ------------------------------------------------------------------- towns

    public Object listTowns(ApiContext ctx) {
        boolean includeHidden = ctx.flag("includeHidden", false) && ctx.user.atLeastEditor();
        String world = ctx.queryValue("world");
        List<Town> list;
        if (includeHidden) {
            list = (world == null || world.isBlank()) ? towns.findAll() : towns.findByWorld(world);
        } else {
            list = towns.findVisible();
            if (world != null && !world.isBlank()) {
                List<Town> filtered = new ArrayList<>();
                for (Town town : list) {
                    if (town.world.equals(world)) filtered.add(town);
                }
                list = filtered;
            }
        }
        long updatedAt = 0L;
        for (Town town : list) updatedAt = Math.max(updatedAt, town.updatedAt);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("towns", list);
        out.put("count", list.size());
        out.put("updatedAt", Text.iso(updatedAt));
        out.put("serverTime", Text.iso(System.currentTimeMillis()));
        return out;
    }

    public Object getTown(ApiContext ctx) {
        Town town = findTown(ctx.pathParam("id"));
        if (!town.visible && !ctx.user.atLeastEditor()) {
            throw ApiException.notFound("Поселение не найдено");
        }
        return town;
    }

    public Object createTown(ApiContext ctx) {
        TownInput input = ctx.body(TownInput.class);
        Town town = validator.apply(input, null, ctx.user.username);
        towns.insert(town, ctx.user.username);
        dynmap.requestSync();
        return Result.created(town);
    }

    public Object updateTown(ApiContext ctx) {
        Town base = findTown(ctx.pathParam("id"));
        TownInput input = ctx.body(TownInput.class);
        Town updated = validator.apply(input, base, ctx.user.username);
        if (Json.write(updated).equals(Json.write(base))) {
            return base; // ничего не изменилось — не плодим ревизии
        }
        Town saved = towns.update(updated, ctx.user.username, "UPDATE");
        dynmap.requestSync();
        return saved;
    }

    public Object setVisibility(ApiContext ctx) {
        Town base = findTown(ctx.pathParam("id"));
        VisibilityInput input = ctx.body(VisibilityInput.class);
        if (input.visible == null) {
            throw ApiException.badRequest("invalid_body", "Ожидается поле visible (boolean)");
        }
        Town town = base.copy();
        town.visible = input.visible;
        Town saved = towns.update(town, ctx.user.username, "VISIBILITY");
        dynmap.requestSync();
        return saved;
    }

    public Object deleteTown(ApiContext ctx) {
        String id = ctx.pathParam("id");
        findTown(id);
        if (!towns.delete(id, ctx.user.username)) {
            throw ApiException.notFound("Поселение не найдено");
        }
        dynmap.requestSync();
        return null;
    }

    public Object townHistory(ApiContext ctx) {
        String id = ctx.pathParam("id");
        findTown(id);
        int limit = ctx.intQuery("limit", 30);
        List<HistoryEntry> history = towns.history(id, limit);
        // Снимки нужны только для сравнения/восстановления — отдаём их как есть.
        return Map.of("history", history, "count", history.size());
    }

    public Object restoreTown(ApiContext ctx) {
        String id = ctx.pathParam("id");
        Town current = findTown(id);
        RestoreInput input = ctx.body(RestoreInput.class);
        if (input.revision == null) {
            throw ApiException.badRequest("invalid_body", "Ожидается поле revision");
        }
        Town snapshot = towns.snapshot(id, input.revision)
                .orElseThrow(() -> ApiException.notFound("Ревизия не найдена"));
        snapshot.id = id;
        snapshot.createdAt = current.createdAt;
        snapshot.createdBy = current.createdBy;
        snapshot.revision = current.revision;
        snapshot.updatedAt = current.updatedAt;
        Town saved = towns.update(snapshot, ctx.user.username, "RESTORE");
        dynmap.requestSync();
        return saved;
    }

    // ----------------------------------------------------------------- players

    public Object knownPlayers(ApiContext ctx) {
        String query = ctx.queryValue("q");
        int limit = Math.max(1, Math.min(ctx.intQuery("limit", 20), 200));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("players", players.search(query, limit));
        out.put("online", new ArrayList<>(players.online()));
        return out;
    }

    // -------------------------------------------------------------------- users

    public Object listUsers(ApiContext ctx) {
        List<User> list = users.findAll();
        List<Map<String, Object>> out = new ArrayList<>();
        for (User user : list) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("username", user.username);
            item.put("role", user.role);
            item.put("createdAt", Text.iso(user.createdAt));
            item.put("lastLoginAt", user.lastLoginAt == 0 ? null : Text.iso(user.lastLoginAt));
            out.add(item);
        }
        return Map.of("users", out);
    }

    public Object upsertUser(ApiContext ctx) {
        UserInput input = ctx.body(UserInput.class);
        if (input.username == null || !input.username.matches("^[A-Za-z0-9_.-]{3,32}$")) {
            throw ApiException.badRequest("invalid_username", "Логин: 3-32 символа, буквы/цифры/._-");
        }
        String role = normalizeRole(input.role);
        if (input.password == null || input.password.length() < 8) {
            throw ApiException.badRequest("weak_password", "Пароль должен быть не короче 8 символов");
        }
        Optional<User> existing = users.find(input.username);
        if (existing.isPresent() && "ADMIN".equals(existing.get().role) && !"ADMIN".equals(role)
                && countAdmins() <= 1) {
            throw ApiException.conflict("last_admin", "Нельзя понизить последнего администратора");
        }
        auth.setPassword(input.username, input.password, role, ctx.user.username);
        return Map.of("username", input.username, "role", role);
    }

    public Object deleteUser(ApiContext ctx) {
        String username = ctx.pathParam("username");
        if (username.equalsIgnoreCase(ctx.user.username)) {
            throw ApiException.conflict("self_delete", "Нельзя удалить самого себя");
        }
        Optional<User> existing = users.find(username);
        if (existing.isEmpty()) throw ApiException.notFound("Пользователь не найден");
        if ("ADMIN".equals(existing.get().role) && countAdmins() <= 1) {
            throw ApiException.conflict("last_admin", "Нельзя удалить последнего администратора");
        }
        users.delete(username);
        audit.log(ctx.user.username, "user.delete", null, username);
        return null;
    }

    public Object changePassword(ApiContext ctx) {
        PasswordInput input = ctx.body(PasswordInput.class);
        auth.changePassword(ctx.user, input.currentPassword, input.newPassword);
        return Map.of("status", "ok");
    }

    // ------------------------------------------------------------------- audit

    public Object auditLog(ApiContext ctx) {
        int limit = ctx.intQuery("limit", 50);
        return Map.of("entries", audit.recent(limit));
    }

    public Object resyncDynmap(ApiContext ctx) {
        dynmap.requestSync();
        return Result.accepted(Map.of("status", "queued", "available", dynmap.available()));
    }

    // ------------------------------------------------------------------ helpers

    private Town findTown(String id) {
        return towns.find(id).orElseThrow(() -> ApiException.notFound("Поселение не найдено"));
    }

    private int countAdmins() {
        int count = 0;
        for (User user : users.findAll()) {
            if ("ADMIN".equals(user.role)) count++;
        }
        return count;
    }

    private String normalizeRole(String role) {
        String value = role == null ? "EDITOR" : role.trim().toUpperCase(Locale.ROOT);
        if (!value.equals("ADMIN") && !value.equals("EDITOR") && !value.equals("VIEWER")) {
            throw ApiException.badRequest("invalid_role", "Роль должна быть ADMIN, EDITOR или VIEWER");
        }
        return value;
    }

    private String safeMinecraftVersion() {
        try {
            return Bukkit.getMinecraftVersion();
        } catch (Throwable ex) {
            return Bukkit.getBukkitVersion();
        }
    }

    // --------------------------------------------------------------------- DTO

    public static final class LoginInput {
        public String username;
        public String password;
    }

    public static final class VisibilityInput {
        public Boolean visible;
    }

    public static final class RestoreInput {
        public Integer revision;
    }

    public static final class UserInput {
        public String username;
        public String password;
        public String role;
    }

    public static final class PasswordInput {
        public String currentPassword;
        public String newPassword;
    }
}
