package net.hypemap.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.spec.InvalidKeySpecException;
import java.util.Base64;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * PBKDF2-HMAC-SHA256 без внешних зависимостей.
 * Формат хранения: {@code pbkdf2$sha256$<iterations>$<salt>$<hash>} (Base64 URL-safe).
 */
public final class PasswordHasher {

    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int KEY_LENGTH_BITS = 256;
    private static final int SALT_BYTES = 16;

    private PasswordHasher() {
    }

    public static String hash(String password, int iterations) {
        byte[] salt = new byte[SALT_BYTES];
        new java.security.SecureRandom().nextBytes(salt);
        byte[] hash = pbkdf2(password.toCharArray(), salt, iterations, KEY_LENGTH_BITS);
        Base64.Encoder enc = Base64.getUrlEncoder().withoutPadding();
        return "pbkdf2$sha256$" + iterations + "$" + enc.encodeToString(salt) + "$" + enc.encodeToString(hash);
    }

    public static boolean verify(String password, String encoded) {
        if (password == null || encoded == null) return false;
        String[] parts = encoded.split("\\$");
        if (parts.length != 5 || !"pbkdf2".equals(parts[0]) || !"sha256".equals(parts[1])) return false;
        try {
            int iterations = Integer.parseInt(parts[2]);
            Base64.Decoder dec = Base64.getUrlDecoder();
            byte[] salt = dec.decode(parts[3]);
            byte[] expected = dec.decode(parts[4]);
            byte[] actual = pbkdf2(password.toCharArray(), salt, iterations, expected.length * 8);
            return MessageDigest.isEqual(expected, actual);
        } catch (RuntimeException ex) {
            return false;
        }
    }

    private static byte[] pbkdf2(char[] password, byte[] salt, int iterations, int keyLengthBits) {
        PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, keyLengthBits);
        try {
            return SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
        } catch (NoSuchAlgorithmException | InvalidKeySpecException ex) {
            throw new IllegalStateException("PBKDF2 недоступен: " + ex.getMessage(), ex);
        } finally {
            spec.clearPassword();
        }
    }

    public static String randomPassword(int length) {
        // без визуально похожих символов
        final String alphabet = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789";
        java.security.SecureRandom rnd = new java.security.SecureRandom();
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(alphabet.charAt(rnd.nextInt(alphabet.length())));
        }
        return sb.toString();
    }

    public static boolean isBlank(String value) {
        return value == null || value.getBytes(StandardCharsets.UTF_8).length == 0;
    }
}
