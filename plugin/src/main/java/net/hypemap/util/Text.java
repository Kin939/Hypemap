package net.hypemap.util;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/** Мелкие утилиты, которые не тянут за собой библиотеки. */
public final class Text {

    private static final DateTimeFormatter ISO =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss'Z'").withZone(ZoneOffset.UTC);

    private Text() {
    }

    public static String iso(long epochMillis) {
        return ISO.format(Instant.ofEpochMilli(epochMillis));
    }

    public static String trimToNull(String value) {
        if (value == null) return null;
        String t = value.trim();
        return t.isEmpty() ? null : t;
    }

    public static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
    }

    public static String slug(String value) {
        if (value == null) return "";
        String lower = value.trim().toLowerCase();
        StringBuilder sb = new StringBuilder(lower.length());
        boolean dash = false;
        for (char ch : lower.toCharArray()) {
            if (Character.isLetterOrDigit(ch)) {
                sb.append(ch);
                dash = false;
            } else if (!dash) {
                sb.append('-');
                dash = true;
            }
        }
        String out = sb.toString();
        while (out.startsWith("-")) out = out.substring(1);
        while (out.endsWith("-")) out = out.substring(0, out.length() - 1);
        return out;
    }
}
