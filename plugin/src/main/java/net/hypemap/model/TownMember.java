package net.hypemap.model;

import java.util.Locale;

/** Игрок, привязанный к поселению. */
public final class TownMember {
    public String name;
    /** OWNER | MEMBER */
    public String role = "MEMBER";

    public TownMember() {
    }

    public TownMember(String name, String role) {
        this.name = name;
        this.role = role == null ? "MEMBER" : role.toUpperCase(Locale.ROOT);
    }

    public TownMember copy() {
        return new TownMember(name, role);
    }
}
