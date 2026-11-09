package net.hypemap.auth;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.util.Base64;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.logging.Logger;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.hypemap.config.Settings;

/**
 * Проверка Cf-Access-Jwt-Assertion (Cloudflare Access) по JWKS.
 * <p>
 * Используется, если {@code auth.mode: ACCESS} или {@code HYBRID}.
 * Никаких зависимостей — только JDK (java.net.http + java.security) и Gson.
 */
public final class AccessJwtVerifier {

    private final Settings settings;
    private final Logger logger;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    private volatile Map<String, PublicKey> keys = Map.of();
    private volatile long keysFetchedAt = 0L;

    public AccessJwtVerifier(Settings settings, Logger logger) {
        this.settings = settings;
        this.logger = logger;
    }

    public boolean configured() {
        return !settings.accessTeamDomain.isBlank() && !settings.accessAudience.isBlank();
    }

    public Optional<ApiUser> verify(String token) {
        if (!configured() || token == null || token.isBlank()) return Optional.empty();
        String[] parts = token.split("\\.");
        if (parts.length != 3) return Optional.empty();
        Base64.Decoder dec = Base64.getUrlDecoder();

        JsonObject header;
        JsonObject payload;
        try {
            header = JsonParser.parseString(new String(dec.decode(parts[0]), StandardCharsets.UTF_8)).getAsJsonObject();
            payload = JsonParser.parseString(new String(dec.decode(parts[1]), StandardCharsets.UTF_8)).getAsJsonObject();
        } catch (RuntimeException ex) {
            return Optional.empty();
        }

        String kid = header.has("kid") ? header.get("kid").getAsString() : null;
        String alg = header.has("alg") ? header.get("alg").getAsString() : "";
        if (!"RS256".equals(alg)) return Optional.empty();

        PublicKey key = publicKey(kid);
        if (key == null) return Optional.empty();

        String signingInput = parts[0] + "." + parts[1];
        try {
            Signature signature = Signature.getInstance("SHA256withRSA");
            signature.initVerify(key);
            signature.update(signingInput.getBytes(StandardCharsets.UTF_8));
            if (!signature.verify(dec.decode(parts[2]))) {
                logger.warning("Access JWT: неверная подпись");
                return Optional.empty();
            }
        } catch (Exception ex) {
            logger.warning("Access JWT: ошибка проверки подписи: " + ex.getMessage());
            return Optional.empty();
        }

        long now = System.currentTimeMillis() / 1000L;
        long exp = payload.has("exp") ? payload.get("exp").getAsLong() : 0L;
        if (exp <= now) {
            logger.warning("Access JWT истёк");
            return Optional.empty();
        }
        String issuer = payload.has("iss") ? payload.get("iss").getAsString() : "";
        if (!issuer.equalsIgnoreCase("https://" + settings.accessTeamDomain)) {
            logger.warning("Access JWT: неожиданный iss " + issuer);
            return Optional.empty();
        }
        if (!audienceMatches(payload)) {
            logger.warning("Access JWT: AUD не совпадает с настройками");
            return Optional.empty();
        }

        String email = payload.has("email") ? payload.get("email").getAsString().toLowerCase(Locale.ROOT) : null;
        if (email == null) {
            // Сервисные токены приходят без email — используем common_name.
            email = payload.has("common_name") ? payload.get("common_name").getAsString() : "access-token";
        }
        String role = settings.accessAdminEmails.contains(email) ? "ADMIN" : settings.accessDefaultRole;
        return Optional.of(ApiUser.access(email, role));
    }

    private boolean audienceMatches(JsonObject payload) {
        if (!payload.has("aud")) return false;
        JsonElement aud = payload.get("aud");
        if (aud.isJsonArray()) {
            JsonArray arr = aud.getAsJsonArray();
            for (JsonElement el : arr) {
                if (settings.accessAudience.equals(el.getAsString())) return true;
            }
            return false;
        }
        return settings.accessAudience.equals(aud.getAsString());
    }

    private PublicKey publicKey(String kid) {
        Map<String, PublicKey> current = keys;
        if (current.isEmpty() || System.currentTimeMillis() - keysFetchedAt > settings.jwksCacheMinutes * 60_000L) {
            refreshKeys();
            current = keys;
        }
        if (kid != null && current.containsKey(kid)) return current.get(kid);
        // fallback: единственный ключ
        return current.size() == 1 ? current.values().iterator().next() : null;
    }

    private synchronized void refreshKeys() {
        if (System.currentTimeMillis() - keysFetchedAt < 5_000L) return;
        String url = "https://" + settings.accessTeamDomain + "/cdn-cgi/access/certs";
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                logger.warning("Не удалось получить JWKS Access: HTTP " + response.statusCode());
                return;
            }
            JsonObject root = JsonParser.parseString(response.body()).getAsJsonObject();
            JsonArray keyArray = root.has("keys") ? root.getAsJsonArray("keys") : new JsonArray();
            Map<String, PublicKey> parsed = new HashMap<>();
            for (JsonElement el : keyArray) {
                JsonObject jwk = el.getAsJsonObject();
                String kid = jwk.has("kid") ? jwk.get("kid").getAsString() : "";
                String kty = jwk.has("kty") ? jwk.get("kty").getAsString() : "";
                if (!"RSA".equals(kty)) continue;
                BigInteger modulus = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.get("n").getAsString()));
                BigInteger exponent = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.get("e").getAsString()));
                PublicKey key = KeyFactory.getInstance("RSA")
                        .generatePublic(new RSAPublicKeySpec(modulus, exponent));
                parsed.put(kid, key);
            }
            keys = Map.copyOf(parsed);
            keysFetchedAt = System.currentTimeMillis();
            logger.info("JWKS Cloudflare Access обновлён: ключей " + keys.size());
        } catch (Exception ex) {
            logger.warning("Ошибка загрузки JWKS Access: " + ex.getMessage());
        }
    }
}
