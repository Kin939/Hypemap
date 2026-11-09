package net.hypemap.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Optional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.hypemap.util.Json;

/**
 * Минимальный JWT (HS256) — только то, что нужно админке.
 * Без внешних библиотек: заголовок, полезная нагрузка, подпись HMAC-SHA256.
 */
public final class JwtCodec {

    private static final String ISSUER = "hypemap";
    private static final Base64.Encoder ENC = Base64.getUrlEncoder().withoutPadding();
    private static final Base64.Decoder DEC = Base64.getUrlDecoder();

    private JwtCodec() {
    }

    public static final class Claims {
        public String subject;
        public String role;
        public long issuedAt;
        public long expiresAt;

        public boolean isExpired(long nowSeconds) {
            return expiresAt <= nowSeconds;
        }
    }

    public static String issue(String subject, String role, long ttlSeconds, String secret) {
        long now = System.currentTimeMillis() / 1000L;
        JsonObject header = new JsonObject();
        header.addProperty("alg", "HS256");
        header.addProperty("typ", "JWT");

        JsonObject payload = new JsonObject();
        payload.addProperty("iss", ISSUER);
        payload.addProperty("sub", subject);
        payload.addProperty("role", role);
        payload.addProperty("iat", now);
        payload.addProperty("exp", now + ttlSeconds);

        String headerB64 = ENC.encodeToString(header.toString().getBytes(StandardCharsets.UTF_8));
        String payloadB64 = ENC.encodeToString(payload.toString().getBytes(StandardCharsets.UTF_8));
        String signingInput = headerB64 + "." + payloadB64;
        String signature = ENC.encodeToString(hmac(signingInput.getBytes(StandardCharsets.UTF_8), secret));
        return signingInput + "." + signature;
    }

    public static Optional<Claims> verify(String token, String secret) {
        if (token == null || secret == null || secret.isEmpty()) return Optional.empty();
        String[] parts = token.split("\\.");
        if (parts.length != 3) return Optional.empty();
        String signingInput = parts[0] + "." + parts[1];
        byte[] expected = hmac(signingInput.getBytes(StandardCharsets.UTF_8), secret);
        byte[] actual;
        try {
            actual = DEC.decode(parts[2]);
        } catch (IllegalArgumentException ex) {
            return Optional.empty();
        }
        if (!MessageDigest.isEqual(expected, actual)) return Optional.empty();

        try {
            JsonObject payload = JsonParser.parseString(
                    new String(DEC.decode(parts[1]), StandardCharsets.UTF_8)).getAsJsonObject();
            Claims claims = new Claims();
            claims.subject = payload.has("sub") ? payload.get("sub").getAsString() : null;
            claims.role = payload.has("role") ? payload.get("role").getAsString() : "VIEWER";
            claims.issuedAt = payload.has("iat") ? payload.get("iat").getAsLong() : 0L;
            claims.expiresAt = payload.has("exp") ? payload.get("exp").getAsLong() : 0L;
            String issuer = payload.has("iss") ? payload.get("iss").getAsString() : "";
            if (!ISSUER.equals(issuer) || claims.subject == null) return Optional.empty();
            if (claims.isExpired(System.currentTimeMillis() / 1000L)) return Optional.empty();
            return Optional.of(claims);
        } catch (RuntimeException ex) {
            return Optional.empty();
        }
    }

    private static byte[] hmac(byte[] data, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(data);
        } catch (Exception ex) {
            throw new IllegalStateException("HMAC недоступен", ex);
        }
    }

    public static String toJson(Claims claims) {
        return Json.write(claims);
    }
}
