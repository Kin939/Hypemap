package net.hypemap.api;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;

import com.sun.net.httpserver.HttpExchange;

import net.hypemap.util.Json;

/** Утилиты для {@link com.sun.net.httpserver.HttpServer}: JSON, CORS, query, тело запроса. */
public final class HttpSupport {

    private HttpSupport() {
    }

    public static Map<String, String> parseQuery(URI uri) {
        Map<String, String> out = new LinkedHashMap<>();
        String raw = uri.getRawQuery();
        if (raw == null || raw.isEmpty()) return out;
        for (String pair : raw.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            String key = eq < 0 ? pair : pair.substring(0, eq);
            String value = eq < 0 ? "" : pair.substring(eq + 1);
            out.put(urlDecode(key), urlDecode(value));
        }
        return out;
    }

    public static String readBody(HttpExchange exchange, int maxBytes) throws IOException {
        String declared = exchange.getRequestHeaders().getFirst("Content-Length");
        if (declared != null) {
            try {
                long length = Long.parseLong(declared.trim());
                if (length > maxBytes) {
                    throw new ApiException(413, "payload_too_large", "Слишком большой запрос");
                }
            } catch (NumberFormatException ignored) {
                // сервер сам разберётся
            }
        }
        try (InputStream in = exchange.getRequestBody()) {
            byte[] buf = in.readNBytes(maxBytes + 1);
            if (buf.length > maxBytes) {
                throw new ApiException(413, "payload_too_large", "Слишком большой запрос");
            }
            return new String(buf, StandardCharsets.UTF_8);
        }
    }

    public static void sendJson(HttpExchange exchange, int status, Object body, Map<String, String> headers)
            throws IOException {
        byte[] bytes = Json.write(body).getBytes(StandardCharsets.UTF_8);
        applyHeaders(exchange, headers);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(bytes);
        }
    }

    public static void sendEmpty(HttpExchange exchange, int status, Map<String, String> headers) throws IOException {
        applyHeaders(exchange, headers);
        exchange.sendResponseHeaders(status, -1);
        exchange.close();
    }

    public static Map<String, String> corsHeaders(String origin, java.util.Collection<String> allowedOrigins) {
        Map<String, String> headers = new HashMap<>();
        if (origin != null && !origin.isBlank() && allowedOrigins.contains(origin)) {
            headers.put("Access-Control-Allow-Origin", origin);
            headers.put("Access-Control-Allow-Credentials", "true");
            headers.put("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
            headers.put("Access-Control-Allow-Headers",
                    "Authorization,Content-Type,Accept,Cf-Access-Jwt-Assertion,X-Requested-With");
            headers.put("Access-Control-Max-Age", "600");
            headers.put("Vary", "Origin");
        }
        return headers;
    }

    public static String clientIp(HttpExchange exchange, boolean trustForwarded) {
        if (trustForwarded) {
            String cf = exchange.getRequestHeaders().getFirst("CF-Connecting-IP");
            if (cf != null && !cf.isBlank()) return cf.trim();
            String xff = exchange.getRequestHeaders().getFirst("X-Forwarded-For");
            if (xff != null && !xff.isBlank()) {
                int comma = xff.indexOf(',');
                return (comma < 0 ? xff : xff.substring(0, comma)).trim();
            }
        }
        return exchange.getRemoteAddress() == null ? "unknown"
                : exchange.getRemoteAddress().getAddress().getHostAddress();
    }

    private static void applyHeaders(HttpExchange exchange, Map<String, String> headers) {
        if (headers == null) return;
        for (Map.Entry<String, String> entry : headers.entrySet()) {
            exchange.getResponseHeaders().set(entry.getKey(), entry.getValue());
        }
        exchange.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
        exchange.getResponseHeaders().set("Referrer-Policy", "no-referrer");
    }

    private static String urlDecode(String value) {
        try {
            return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
        } catch (IllegalArgumentException ex) {
            return value;
        }
    }
}
