package net.hypemap.model;

import java.util.Locale;

/** Роль игрока внутри поселения. */
public enum MemberRole {
    OWNER, MEMBER;

    public static MemberRole parse(String raw) {
        if (raw == null) return MEMBER;
        try {
            return valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return MEMBER;
        }
    }
}
