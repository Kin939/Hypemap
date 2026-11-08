package net.hypemap.api;

import java.util.Map;

/** Маршрут: метод + шаблон пути (/api/towns/{id}) + минимальная роль + обработчик. */
public final class Route {

    private final String method;
    private final String[] segments;
    private final String role;
    private final Handler handler;

    public Route(String method, String pattern, String role, Handler handler) {
        this.method = method.toUpperCase();
        this.segments = split(pattern);
        this.role = role;
        this.handler = handler;
    }

    public String method() {
        return method;
    }

    public String role() {
        return role;
    }

    public Handler handler() {
        return handler;
    }

    public boolean matches(String requestMethod, String[] requestSegments, Map<String, String> params) {
        if (!method.equalsIgnoreCase(requestMethod)) return false;
        if (segments.length != requestSegments.length) return false;
        for (int i = 0; i < segments.length; i++) {
            String pattern = segments[i];
            if (pattern.startsWith("{") && pattern.endsWith("}")) {
                String value = requestSegments[i];
                if (value == null || value.isEmpty()) return false;
                params.put(pattern.substring(1, pattern.length() - 1), value);
            } else if (!pattern.equalsIgnoreCase(requestSegments[i])) {
                return false;
            }
        }
        return true;
    }

    public static String[] split(String path) {
        String trimmed = path;
        while (trimmed.startsWith("/")) trimmed = trimmed.substring(1);
        while (trimmed.endsWith("/") && trimmed.length() > 0) trimmed = trimmed.substring(0, trimmed.length() - 1);
        if (trimmed.isEmpty()) return new String[0];
        return trimmed.split("/");
    }
}
