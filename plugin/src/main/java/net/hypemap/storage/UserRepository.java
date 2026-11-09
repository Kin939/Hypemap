package net.hypemap.storage;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

import net.hypemap.model.User;

/** Пользователи админки (локальный режим аутентификации). */
public final class UserRepository {

    private final Database db;

    public UserRepository(Database db) {
        this.db = db;
    }

    public List<User> findAll() {
        List<User> out = new ArrayList<>();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "SELECT username, role, created_at, last_login_at FROM users ORDER BY username_lc ASC");
                 ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    out.add(new User(rs.getString(1), rs.getString(2), rs.getLong(3), rs.getLong(4)));
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать пользователей", ex);
            }
        }
        return out;
    }

    public Optional<String> passwordHash(String username) {
        if (username == null) return Optional.empty();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "SELECT password_hash FROM users WHERE username_lc = ?")) {
                ps.setString(1, username.trim().toLowerCase(Locale.ROOT));
                try (ResultSet rs = ps.executeQuery()) {
                    return rs.next() ? Optional.ofNullable(rs.getString(1)) : Optional.empty();
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать пользователя", ex);
            }
        }
    }

    public Optional<User> find(String username) {
        if (username == null) return Optional.empty();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "SELECT username, role, created_at, last_login_at FROM users WHERE username_lc = ?")) {
                ps.setString(1, username.trim().toLowerCase(Locale.ROOT));
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return Optional.empty();
                    return Optional.of(new User(rs.getString(1), rs.getString(2), rs.getLong(3), rs.getLong(4)));
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать пользователя", ex);
            }
        }
    }

    public void upsert(String username, String passwordHash, String role) {
        long now = System.currentTimeMillis();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "INSERT INTO users (username, username_lc, password_hash, role, created_at, last_login_at)" +
                            " VALUES (?,?,?,?,?,0)" +
                            " ON CONFLICT(username_lc) DO UPDATE SET password_hash = excluded.password_hash, role = excluded.role")) {
                ps.setString(1, username);
                ps.setString(2, username.trim().toLowerCase(Locale.ROOT));
                ps.setString(3, passwordHash);
                ps.setString(4, role);
                ps.setLong(5, now);
                ps.executeUpdate();
            } catch (SQLException ex) {
                throw new StorageException("Не удалось сохранить пользователя", ex);
            }
        }
    }

    public boolean delete(String username) {
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement("DELETE FROM users WHERE username_lc = ?")) {
                ps.setString(1, username.trim().toLowerCase(Locale.ROOT));
                return ps.executeUpdate() > 0;
            } catch (SQLException ex) {
                throw new StorageException("Не удалось удалить пользователя", ex);
            }
        }
    }

    public void touchLogin(String username) {
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "UPDATE users SET last_login_at = ? WHERE username_lc = ?")) {
                ps.setLong(1, System.currentTimeMillis());
                ps.setString(2, username.trim().toLowerCase(Locale.ROOT));
                ps.executeUpdate();
            } catch (SQLException ex) {
                throw new StorageException("Не удалось обновить время входа", ex);
            }
        }
    }

    public int count() {
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement("SELECT COUNT(*) FROM users");
                 ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            } catch (SQLException ex) {
                throw new StorageException("Не удалось посчитать пользователей", ex);
            }
        }
    }
}
