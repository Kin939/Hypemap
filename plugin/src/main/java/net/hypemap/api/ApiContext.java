package net.hypemap.api;

import java.io.IOException;
import java.util.Map;

import com.sun.net.httpserver.HttpExchange;

import net.hypemap.auth.ApiUser;
import net.hypemap.util.Json;

/** Контекст одного запроса: пользователь, параметры пути/строки, тело. */
public final class ApiContext {

    public final HttpExchange exchange;
    public final ApiUser user;
    public final Map<String, String> pathParams;
    public final Map<String, String> query;
    public final String origin;
    public final String method;
    public final String path;
    private final String body;

    public ApiContext(HttpExchange exchange, ApiUser user, Map<String, String> pathParams,
                      Map<String, String> query, String body, String origin) {
        this.exchange = exchange;
        this.user = user;
        this.pathParams = pathParams;
        this.query = query;
        this.body = body;
        this.origin = origin;
        this.method = exchange.getRequestMethod();
        this.path = exchange.getRequestURI().getPath();
    }

    public String pathParam(String name) {
        return pathParams.get(name);
    }

    public String rawBody() {
        return body;
    }

    public <T> T body(Class<T> type) {
        if (body == null || body.isBlank()) {
            throw ApiException.badRequest("empty_body", "Ожидается JSON-тело запроса");
        }
        try {
            T parsed = Json.read(body, type);
            if (parsed == null) throw ApiException.badRequest("invalid_body", "Пустой JSON");
            return parsed;
        } catch (com.google.gson.JsonSyntaxException ex) {
            throw ApiException.badRequest("invalid_json", "Некорректный JSON: " + ex.getMessage());
        }
    }

    public String queryValue(String name) {
        return query.get(name);
    }

    public boolean flag(String name, boolean def) {
        String value = query.get(name);
        if (value == null) return def;
        return value.isEmpty() || "1".equals(value) || "true".equalsIgnoreCase(value) || "yes".equalsIgnoreCase(value);
    }

    public int intQuery(String name, int def) {
        String value = query.get(name);
        if (value == null || value.isBlank()) return def;
        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException ex) {
            return def;
        }
    }

    public void requireRole(String role) {
        if ("ADMIN".equals(role)) {
            if (!user.isAdmin()) throw net.hypemap.auth.AuthException.forbidden("Требуются права администратора");
            return;
        }
        if ("EDITOR".equals(role)) {
            if (!user.atLeastEditor()) throw net.hypemap.auth.AuthException.forbidden("Требуются права редактора");
            return;
        }
        if (!user.atLeastEditor()) throw net.hypemap.auth.AuthException.forbidden("Недостаточно прав");
    }

    public void requireAuthenticated() {
        if ("anonymous".equals(user.username)) {
            throw net.hypemap.auth.AuthException.unauthorized("Требуется вход");
        }
    }
}
