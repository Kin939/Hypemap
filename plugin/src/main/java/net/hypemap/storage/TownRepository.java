package net.hypemap.storage;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

import net.hypemap.model.HistoryEntry;
import net.hypemap.model.Town;
import net.hypemap.util.Text;

/**
 * CRUD + история версий поселений.
 * <p>
 * Поселение целиком хранится в колонке {@code data} как JSON, отдельные колонки
 * (name, world, visible, revision) нужны для индексов, сортировки и фильтрации.
 */
public final class TownRepository {

    private final Database db;
    private final AuditRepository audit;

    public TownRepository(Database db, AuditRepository audit) {
        this.db = db;
        this.audit = audit;
    }

    public List<Town> findAll() {
        return query("SELECT data FROM towns ORDER BY name_lc ASC", null);
    }

    public List<Town> findVisible() {
        return query("SELECT data FROM towns WHERE visible = 1 ORDER BY name_lc ASC", null);
    }

    public List<Town> findByWorld(String world) {
        return query("SELECT data FROM towns WHERE world = ? ORDER BY name_lc ASC", world);
    }

    public Optional<Town> find(String id) {
        if (id == null) return Optional.empty();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement("SELECT data FROM towns WHERE id = ?")) {
                ps.setString(1, id);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return Optional.empty();
                    return Optional.ofNullable(parse(rs.getString(1)));
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать поселение " + id, ex);
            }
        }
    }

    public Optional<Town> findByName(String name) {
        if (name == null) return Optional.empty();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement("SELECT data FROM towns WHERE name_lc = ?")) {
                ps.setString(1, name.trim().toLowerCase(Locale.ROOT));
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return Optional.empty();
                    return Optional.ofNullable(parse(rs.getString(1)));
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать поселение " + name, ex);
            }
        }
    }

    public boolean nameTaken(String name, String exceptId) {
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "SELECT id FROM towns WHERE name_lc = ? AND id <> ?")) {
                ps.setString(1, name.trim().toLowerCase(Locale.ROOT));
                ps.setString(2, exceptId == null ? "" : exceptId);
                try (ResultSet rs = ps.executeQuery()) {
                    return rs.next();
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось проверить имя поселения", ex);
            }
        }
    }

    public int count() {
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement("SELECT COUNT(*) FROM towns");
                 ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            } catch (SQLException ex) {
                throw new StorageException("Не удалось посчитать поселения", ex);
            }
        }
    }

    public Town insert(Town town, String actor) {
        long now = System.currentTimeMillis();
        if (town.id == null || town.id.isBlank()) {
            town.id = UUID.randomUUID().toString();
        }
        town.revision = 1;
        town.createdAt = now;
        town.updatedAt = now;
        town.createdBy = actor == null ? "system" : actor;
        town.updatedBy = town.createdBy;

        synchronized (db) {
            Connection conn = db.connection();
            try {
                conn.setAutoCommit(false);
                try (PreparedStatement ps = conn.prepareStatement(
                        "INSERT INTO towns (id, name, name_lc, world, visible, revision, created_at, updated_at, data)" +
                                " VALUES (?,?,?,?,?,?,?,?,?)")) {
                    ps.setString(1, town.id);
                    ps.setString(2, town.name);
                    ps.setString(3, town.name.trim().toLowerCase(Locale.ROOT));
                    ps.setString(4, town.world);
                    ps.setInt(5, town.visible ? 1 : 0);
                    ps.setInt(6, town.revision);
                    ps.setLong(7, town.createdAt);
                    ps.setLong(8, town.updatedAt);
                    ps.setString(9, net.hypemap.util.Json.write(town));
                    ps.executeUpdate();
                }
                insertHistory(conn, town, "CREATE", actor, now);
                conn.commit();
            } catch (SQLException ex) {
                rollback(conn);
                throw new StorageException("Не удалось создать поселение", ex);
            } finally {
                restoreAutoCommit(conn);
            }
        }
        audit.log(actor, "town.create", town.id, town.name);
        return town;
    }

    public Town update(Town town, String actor, String action) {
        synchronized (db) {
            Connection conn = db.connection();
            int nextRevision = town.revision + 1;
            long now = System.currentTimeMillis();
            town.revision = nextRevision;
            town.updatedAt = now;
            town.updatedBy = actor == null ? "system" : actor;
            try {
                conn.setAutoCommit(false);
                try (PreparedStatement ps = conn.prepareStatement(
                        "UPDATE towns SET name = ?, name_lc = ?, world = ?, visible = ?, revision = ?, updated_at = ?, data = ?" +
                                " WHERE id = ?")) {
                    ps.setString(1, town.name);
                    ps.setString(2, town.name.trim().toLowerCase(Locale.ROOT));
                    ps.setString(3, town.world);
                    ps.setInt(4, town.visible ? 1 : 0);
                    ps.setInt(5, town.revision);
                    ps.setLong(6, town.updatedAt);
                    ps.setString(7, net.hypemap.util.Json.write(town));
                    ps.setString(8, town.id);
                    if (ps.executeUpdate() == 0) {
                        throw new StorageException("Поселение не найдено: " + town.id);
                    }
                }
                insertHistory(conn, town, action, actor, now);
                conn.commit();
            } catch (SQLException ex) {
                rollback(conn);
                throw new StorageException("Не удалось обновить поселение", ex);
            } finally {
                restoreAutoCommit(conn);
            }
        }
        audit.log(actor, "town." + (action == null ? "update" : action.toLowerCase(Locale.ROOT)), town.id, town.name);
        return town;
    }

    public boolean delete(String id, String actor) {
        synchronized (db) {
            Connection conn = db.connection();
            try (PreparedStatement ps = conn.prepareStatement("DELETE FROM towns WHERE id = ?")) {
                ps.setString(1, id);
                if (ps.executeUpdate() == 0) return false;
            } catch (SQLException ex) {
                throw new StorageException("Не удалось удалить поселение", ex);
            }
        }
        audit.log(actor, "town.delete", id, null);
        return true;
    }

    public List<HistoryEntry> history(String townId, int limit) {
        List<HistoryEntry> out = new ArrayList<>();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "SELECT revision, action, actor, created_at, data FROM town_history WHERE town_id = ?" +
                            " ORDER BY revision DESC LIMIT ?")) {
                ps.setString(1, townId);
                ps.setInt(2, Math.max(1, Math.min(limit, 200)));
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        HistoryEntry e = new HistoryEntry();
                        e.townId = townId;
                        e.revision = rs.getInt(1);
                        e.action = rs.getString(2);
                        e.actor = rs.getString(3);
                        e.createdAt = Text.iso(rs.getLong(4));
                        e.snapshot = parse(rs.getString(5));
                        out.add(e);
                    }
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать историю", ex);
            }
        }
        return out;
    }

    public Optional<Town> snapshot(String townId, int revision) {
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "SELECT data FROM town_history WHERE town_id = ? AND revision = ?")) {
                ps.setString(1, townId);
                ps.setInt(2, revision);
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) return Optional.empty();
                    return Optional.ofNullable(parse(rs.getString(1)));
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать ревизию", ex);
            }
        }
    }

    private static Town parse(String json) {
        Town town = net.hypemap.util.Json.read(json, Town.class);
        return town == null ? null : town.normalize();
    }

    private void insertHistory(Connection conn, Town town, String action, String actor, long now) throws SQLException {
        try (PreparedStatement ps = conn.prepareStatement(
                "INSERT OR REPLACE INTO town_history (town_id, revision, action, actor, created_at, data)" +
                        " VALUES (?,?,?,?,?,?)")) {
            ps.setString(1, town.id);
            ps.setInt(2, town.revision);
            ps.setString(3, action == null ? "UPDATE" : action);
            ps.setString(4, actor == null ? "system" : actor);
            ps.setLong(5, now);
            ps.setString(6, net.hypemap.util.Json.write(town));
            ps.executeUpdate();
        }
    }

    private List<Town> query(String sql, String param) {
        List<Town> out = new ArrayList<>();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(sql)) {
                if (param != null) ps.setString(1, param);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        Town town = parse(rs.getString(1));
                        if (town != null) out.add(town);
                    }
                }
            } catch (SQLException ex) {
                throw new StorageException("Ошибка выборки поселений", ex);
            }
        }
        return out;
    }

    private static void rollback(Connection conn) {
        try {
            conn.rollback();
        } catch (SQLException ignored) {
            // no-op
        }
    }

    private static void restoreAutoCommit(Connection conn) {
        try {
            conn.setAutoCommit(true);
        } catch (SQLException ignored) {
            // no-op
        }
    }
}
