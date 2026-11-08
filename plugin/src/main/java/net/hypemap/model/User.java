package net.hypemap.model;

/** Пользователь панели управления (локальная аутентификация). */
public final class User {
    public String username;
    /** ADMIN | EDITOR | VIEWER */
    public String role;
    public long createdAt;
    public long lastLoginAt;

    public User() {
    }

    public User(String username, String role, long createdAt, long lastLoginAt) {
        this.username = username;
        this.role = role;
        this.createdAt = createdAt;
        this.lastLoginAt = lastLoginAt;
    }
}
