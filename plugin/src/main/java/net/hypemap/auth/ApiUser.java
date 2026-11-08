package net.hypemap.auth;

import java.util.Locale;

/** Аутентифицированный пользователь API. */
public final class ApiUser {

    public final String username;
    /** ADMIN | EDITOR | VIEWER */
    public final String role;
    /** local | access */
    public final String source;
    public final String email;

    private ApiUser(String username, String role, String source, String email) {
        this.username = username;
        this.role = role == null ? "VIEWER" : role.toUpperCase(Locale.ROOT);
        this.source = source;
        this.email = email;
    }

    public static ApiUser local(String username, String role) {
        return new ApiUser(username, role, "local", null);
    }

    public static ApiUser access(String email, String role) {
        return new ApiUser(email, role, "access", email);
    }

    public static ApiUser anonymous() {
        return new ApiUser("anonymous", "VIEWER", "none", null);
    }

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }

    public boolean atLeastEditor() {
        return "ADMIN".equals(role) || "EDITOR".equals(role);
    }
}
