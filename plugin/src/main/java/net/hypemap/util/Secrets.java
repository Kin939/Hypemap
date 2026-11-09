package net.hypemap.util;

import java.security.SecureRandom;
import java.util.Base64;

/** Криптостойкие случайные значения. */
public final class Secrets {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Secrets() {
    }

    public static String randomBase64(int bytes) {
        byte[] buf = new byte[bytes];
        RANDOM.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }

    public static String randomHex(int bytes) {
        byte[] buf = new byte[bytes];
        RANDOM.nextBytes(buf);
        StringBuilder sb = new StringBuilder(bytes * 2);
        for (byte b : buf) sb.append(String.format("%02x", b));
        return sb.toString();
    }
}
