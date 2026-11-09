package net.hypemap;

import org.bukkit.Bukkit;
import org.bukkit.command.PluginCommand;
import org.bukkit.scheduler.BukkitTask;

import net.hypemap.api.ApiServer;
import net.hypemap.api.TownValidator;
import net.hypemap.auth.AuthService;
import net.hypemap.commands.HypemapCommand;
import net.hypemap.config.Settings;
import net.hypemap.dynmap.DynmapBridge;
import net.hypemap.service.PlayerCache;
import net.hypemap.storage.AuditRepository;
import net.hypemap.storage.Database;
import net.hypemap.storage.TownRepository;
import net.hypemap.storage.UserRepository;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Hypemap — слой поселений (towns) поверх Dynmap.
 * <p>
 * Состав:
 * <ul>
 *   <li>SQLite-хранилище поселений + история ревизий + аудит;</li>
 *   <li>REST API на встроенном HTTP-сервере JDK (порт 8800 по умолчанию);</li>
 *   <li>синхронизация поселений в Dynmap через Marker API (AreaMarker);</li>
 *   <li>локальная аутентификация (JWT) с ролями ADMIN/EDITOR/VIEWER.</li>
 * </ul>
 */
public final class HypemapPlugin extends JavaPlugin {

    private Settings settings;
    private Database database;
    private TownRepository towns;
    private UserRepository users;
    private AuditRepository audit;
    private AuthService auth;
    private DynmapBridge dynmap;
    private PlayerCache playerCache;
    private ApiServer api;
    private TownValidator validator;

    private BukkitTask onlineCacheTask;
    private BukkitTask knownPlayersTask;

    @Override
    public void onEnable() {
        saveDefaultConfig();
        settings = Settings.load(this);

        database = new Database(this, settings.storageFile);
        try {
            database.init();
        } catch (RuntimeException ex) {
            getLogger().severe("Не удалось открыть базу данных: " + ex.getMessage());
            getServer().getPluginManager().disablePlugin(this);
            return;
        }

        audit = new AuditRepository(database);
        towns = new TownRepository(database, audit);
        users = new UserRepository(database);
        auth = new AuthService(settings, users, audit, getLogger());
        auth.bootstrapAdminIfEmpty();

        playerCache = new PlayerCache();
        playerCache.refreshOnline();

        dynmap = new DynmapBridge(this, settings);
        dynmap.init();

        validator = new TownValidator(settings, towns);
        api = new ApiServer(this, settings, towns, users, audit, auth, dynmap, playerCache, validator);
        api.start();

        HypemapCommand command = new HypemapCommand(this);
        PluginCommand pluginCommand = getCommand("hypemap");
        if (pluginCommand != null) {
            pluginCommand.setExecutor(command);
            pluginCommand.setTabCompleter(command);
        }

        scheduleCacheTasks();
        dynmap.requestSync();

        getLogger().info("Hypemap включён. Поселений в базе: " + towns.count());
    }

    @Override
    public void onDisable() {
        if (onlineCacheTask != null) {
            onlineCacheTask.cancel();
            onlineCacheTask = null;
        }
        if (knownPlayersTask != null) {
            knownPlayersTask.cancel();
            knownPlayersTask = null;
        }
        if (api != null) {
            api.stop();
            api = null;
        }
        if (dynmap != null) {
            dynmap.shutdown();
        }
        if (database != null) {
            database.close();
            database = null;
        }
        getLogger().info("Hypemap выключен.");
    }

    /** Полная перезагрузка конфига без перезапуска сервера. */
    public void reloadEverything() {
        if (api != null) api.stop();
        settings = Settings.load(this);
        auth = new AuthService(settings, users, audit, getLogger());
        dynmap = new DynmapBridge(this, settings);
        dynmap.init();
        validator = new TownValidator(settings, towns);
        api = new ApiServer(this, settings, towns, users, audit, auth, dynmap, playerCache, validator);
        api.start();
        dynmap.requestSync();
        scheduleCacheTasks();
    }

    private void scheduleCacheTasks() {
        if (onlineCacheTask != null) onlineCacheTask.cancel();
        if (knownPlayersTask != null) knownPlayersTask.cancel();
        onlineCacheTask = Bukkit.getScheduler().runTaskTimer(this, () -> {
            try {
                playerCache.refreshOnline();
            } catch (RuntimeException ex) {
                getLogger().warning("Не удалось обновить список онлайн-игроков: " + ex.getMessage());
            }
        }, 20L, 100L);
        knownPlayersTask = Bukkit.getScheduler().runTaskTimerAsynchronously(this,
                () -> {
                    try {
                        playerCache.refreshKnown();
                    } catch (RuntimeException ex) {
                        getLogger().fine("Кэш игроков не обновлён: " + ex.getMessage());
                    }
                }, 100L, 20L * 300L);
    }

    public Settings settings() {
        return settings;
    }

    public TownRepository towns() {
        return towns;
    }

    public UserRepository users() {
        return users;
    }

    public AuditRepository audit() {
        return audit;
    }

    public AuthService auth() {
        return auth;
    }

    public DynmapBridge dynmap() {
        return dynmap;
    }

    public PlayerCache playerCache() {
        return playerCache;
    }

    public ApiServer api() {
        return api;
    }

    public TownValidator validator() {
        return validator;
    }
}
