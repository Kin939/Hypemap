package net.hypemap.storage;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;

import org.bukkit.plugin.java.JavaPlugin;

/**
 * Тонкая обёртка над SQLite.
 * <p>
 * Используется одно соединение и один монитор ({@code synchronized (database)}).
 * Для нагрузки «админка + публичная карта» этого более чем достаточно,
 * зато нет пула соединений и лишних зависимостей.
 */
public final class Database implements AutoCloseable {

    private final JavaPlugin plugin;
    private final File file;
    private Connection connection;

    public Database(JavaPlugin plugin, File file) {
        this.plugin = plugin;
        this.file = file;
    }

    public synchronized void init() {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException ex) {
            throw new StorageException("Драйвер SQLite не найден в jar плагина", ex);
        }
        File parent = file.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new StorageException("Не удалось создать каталог " + parent);
        }
        try {
            connection = DriverManager.getConnection("jdbc:sqlite:" + file.getAbsolutePath());
            try (Statement st = connection.createStatement()) {
                st.execute("PRAGMA journal_mode=WAL");
                st.execute("PRAGMA synchronous=NORMAL");
                st.execute("PRAGMA busy_timeout=5000");
                st.execute("PRAGMA foreign_keys=ON");
                st.executeUpdate("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
                st.executeUpdate("CREATE TABLE IF NOT EXISTS towns (" +
                        "id TEXT PRIMARY KEY," +
                        "name TEXT NOT NULL," +
                        "name_lc TEXT NOT NULL," +
                        "world TEXT NOT NULL," +
                        "visible INTEGER NOT NULL DEFAULT 1," +
                        "revision INTEGER NOT NULL DEFAULT 1," +
                        "created_at INTEGER NOT NULL," +
                        "updated_at INTEGER NOT NULL," +
                        "data TEXT NOT NULL)");
                st.executeUpdate("CREATE UNIQUE INDEX IF NOT EXISTS idx_towns_name ON towns(name_lc)");
                st.executeUpdate("CREATE TABLE IF NOT EXISTS town_history (" +
                        "town_id TEXT NOT NULL," +
                        "revision INTEGER NOT NULL," +
                        "action TEXT NOT NULL," +
                        "actor TEXT," +
                        "created_at INTEGER NOT NULL," +
                        "data TEXT NOT NULL," +
                        "PRIMARY KEY (town_id, revision))");
                st.executeUpdate("CREATE TABLE IF NOT EXISTS users (" +
                        "username TEXT PRIMARY KEY," +
                        "username_lc TEXT NOT NULL," +
                        "password_hash TEXT NOT NULL," +
                        "role TEXT NOT NULL," +
                        "created_at INTEGER NOT NULL," +
                        "last_login_at INTEGER NOT NULL DEFAULT 0)");
                st.executeUpdate("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_name ON users(username_lc)");
                st.executeUpdate("CREATE TABLE IF NOT EXISTS audit (" +
                        "id INTEGER PRIMARY KEY AUTOINCREMENT," +
                        "at INTEGER NOT NULL," +
                        "actor TEXT," +
                        "action TEXT NOT NULL," +
                        "town_id TEXT," +
                        "details TEXT)");
                st.executeUpdate("CREATE INDEX IF NOT EXISTS idx_audit_at ON audit(at DESC)");
            }
        } catch (SQLException ex) {
            throw new StorageException("Не удалось инициализировать " + file, ex);
        }
        plugin.getLogger().info("Хранилище готово: " + file.getName());
    }

    /**
     * Все обращения к БД должны происходить внутри {@code synchronized (database) { ... }}.
     */
    public Connection connection() {
        if (connection == null) throw new StorageException("База не инициализирована");
        return connection;
    }

    @Override
    public synchronized void close() {
        if (connection != null) {
            try {
                connection.close();
            } catch (SQLException ex) {
                plugin.getLogger().warning("Ошибка при закрытии БД: " + ex.getMessage());
            } finally {
                connection = null;
            }
        }
    }
}
