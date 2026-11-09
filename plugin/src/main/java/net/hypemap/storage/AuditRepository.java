package net.hypemap.storage;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

import net.hypemap.model.AuditEntry;
import net.hypemap.util.Text;

/** Журнал действий в админке: кто, что и когда менял. */
public final class AuditRepository {

    private final Database db;

    public AuditRepository(Database db) {
        this.db = db;
    }

    public void log(String actor, String action, String townId, String details) {
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "INSERT INTO audit (at, actor, action, town_id, details) VALUES (?,?,?,?,?)")) {
                ps.setLong(1, System.currentTimeMillis());
                ps.setString(2, actor == null ? "anonymous" : actor);
                ps.setString(3, action);
                ps.setString(4, townId);
                ps.setString(5, details);
                ps.executeUpdate();
            } catch (SQLException ex) {
                throw new StorageException("Не удалось записать аудит", ex);
            }
        }
    }

    public List<AuditEntry> recent(int limit) {
        List<AuditEntry> out = new ArrayList<>();
        synchronized (db) {
            try (PreparedStatement ps = db.connection().prepareStatement(
                    "SELECT id, at, actor, action, town_id, details FROM audit ORDER BY at DESC LIMIT ?")) {
                ps.setInt(1, Math.max(1, Math.min(limit, 500)));
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        AuditEntry e = new AuditEntry();
                        e.id = rs.getLong(1);
                        e.at = Text.iso(rs.getLong(2));
                        e.actor = rs.getString(3);
                        e.action = rs.getString(4);
                        e.townId = rs.getString(5);
                        e.details = rs.getString(6);
                        out.add(e);
                    }
                }
            } catch (SQLException ex) {
                throw new StorageException("Не удалось прочитать аудит", ex);
            }
        }
        return out;
    }
}
