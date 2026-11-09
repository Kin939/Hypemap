package net.hypemap.config;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.bukkit.configuration.file.FileConfiguration;
import org.bukkit.plugin.java.JavaPlugin;

/**
 * Типизированный снимок config.yml.
 * <p>
 * Намеренно плоская структура: значения читаются один раз при загрузке/релоаде,
 * чтобы горячие HTTP-потоки не трогали {@link FileConfiguration} (он не потокобезопасен).
 */
public final class Settings {

    private final File dataFolder;

    // storage
    public final File storageFile;

    // api
    public final boolean apiEnabled;
    public final String apiBind;
    public final int apiPort;
    public final String apiPublicUrl;
    public final Set<String> allowedOrigins;
    public final boolean trustForwardedFor;
    public final int maxBodyBytes;
    public final int apiThreads;

    // auth
    public final AuthMode authMode;
    public final String jwtSecret;
    public final int tokenTtlMinutes;
    public final int passwordIterations;
    public final int rateLimitAttempts;
    public final int rateLimitWindowSeconds;
    public final String accessTeamDomain;
    public final String accessAudience;
    public final Set<String> accessAdminEmails;
    public final String accessDefaultRole;
    public final int jwksCacheMinutes;

    // towns
    public final int maxPolygonPoints;
    public final int maxMembers;
    public final int minNameLength;
    public final int maxNameLength;
    public final double defaultFillOpacity;
    public final double defaultLineOpacity;
    public final int defaultLineWeight;
    public final Set<String> townFlags;

    // dynmap
    public final boolean dynmapEnabled;
    public final String markerSetId;
    public final String markerSetLabel;
    public final boolean markerSetHidden;
    public final int markerMinZoom;
    public final int markerMaxZoom;
    public final boolean deleteOrphanMarkers;

    // web hints
    public final String siteTitle;
    public final String serverName;
    public final String dynmapUrl;
    public final String discordInvite;

    public enum AuthMode {
        LOCAL, ACCESS, HYBRID;

        public static AuthMode parse(String raw) {
            if (raw == null) return LOCAL;
            try {
                return valueOf(raw.trim().toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException ex) {
                return LOCAL;
            }
        }

        public boolean allowsLocalLogin() {
            return this == LOCAL || this == HYBRID;
        }

        public boolean allowsAccessJwt() {
            return this == ACCESS || this == HYBRID;
        }
    }

    private Settings(FileConfiguration c, File dataFolder) {
        this.dataFolder = dataFolder;
        this.storageFile = new File(dataFolder, c.getString("storage.file", "hypemap.db"));

        this.apiEnabled = c.getBoolean("api.enabled", true);
        this.apiBind = c.getString("api.bind", "127.0.0.1");
        this.apiPort = clamp(c.getInt("api.port", 8800), 1, 65535);
        this.apiPublicUrl = trimSlash(c.getString("api.public-url", ""));
        this.allowedOrigins = new LinkedHashSet<>(c.getStringList("api.allowed-origins"));
        this.trustForwardedFor = c.getBoolean("api.trust-forwarded-for", true);
        this.maxBodyBytes = clamp(c.getInt("api.max-body-bytes", 262144), 4096, 4 * 1024 * 1024);
        this.apiThreads = clamp(c.getInt("api.threads", 4), 1, 32);

        this.authMode = AuthMode.parse(c.getString("auth.mode", "LOCAL"));
        this.jwtSecret = c.getString("auth.jwt-secret", "");
        this.tokenTtlMinutes = clamp(c.getInt("auth.token-ttl-minutes", 720), 5, 60 * 24 * 30);
        this.passwordIterations = clamp(c.getInt("auth.password-iterations", 210000), 10000, 2_000_000);
        this.rateLimitAttempts = clamp(c.getInt("auth.rate-limit.attempts", 8), 1, 1000);
        this.rateLimitWindowSeconds = clamp(c.getInt("auth.rate-limit.window-seconds", 300), 10, 86400);
        this.accessTeamDomain = trimSlash(c.getString("auth.access.team-domain", ""));
        this.accessAudience = c.getString("auth.access.audience", "");
        this.accessAdminEmails = new LinkedHashSet<>();
        for (String mail : c.getStringList("auth.access.admin-emails")) {
            if (mail != null && !mail.isBlank()) this.accessAdminEmails.add(mail.trim().toLowerCase(Locale.ROOT));
        }
        this.accessDefaultRole = c.getString("auth.access.default-role", "EDITOR");
        this.jwksCacheMinutes = clamp(c.getInt("auth.access.jwks-cache-minutes", 60), 1, 1440);

        this.maxPolygonPoints = clamp(c.getInt("towns.max-polygon-points", 256), 3, 1024);
        this.maxMembers = clamp(c.getInt("towns.max-members", 64), 1, 512);
        this.minNameLength = clamp(c.getInt("towns.min-name-length", 2), 1, 32);
        this.maxNameLength = clamp(c.getInt("towns.max-name-length", 40), 3, 120);
        this.defaultFillOpacity = clamp(c.getDouble("towns.default-fill-opacity", 0.28), 0.0, 1.0);
        this.defaultLineOpacity = clamp(c.getDouble("towns.default-line-opacity", 1.0), 0.0, 1.0);
        this.defaultLineWeight = clamp(c.getInt("towns.default-line-weight", 2), 1, 10);
        this.townFlags = new LinkedHashSet<>();
        for (String flag : c.getStringList("towns.flags")) {
            if (flag != null && !flag.isBlank()) this.townFlags.add(flag.trim().toUpperCase(Locale.ROOT));
        }
        if (this.townFlags.isEmpty()) {
            this.townFlags.addAll(List.of("PVP", "PEACEFUL", "PUBLIC", "CAPITAL", "SHOP", "FARM", "MINING", "PORT"));
        }

        this.dynmapEnabled = c.getBoolean("dynmap.enabled", true);
        this.markerSetId = sanitizeMarkerId(c.getString("dynmap.marker-set-id", "hypemap.towns"));
        this.markerSetLabel = c.getString("dynmap.marker-set-label", "Поселения");
        this.markerSetHidden = c.getBoolean("dynmap.marker-set-hidden", false);
        this.markerMinZoom = clamp(c.getInt("dynmap.min-zoom", 0), 0, 20);
        this.markerMaxZoom = clamp(c.getInt("dynmap.max-zoom", 10), 0, 20);
        this.deleteOrphanMarkers = c.getBoolean("dynmap.delete-orphan-markers", true);

        this.siteTitle = c.getString("web.site-title", "Hypemap");
        this.serverName = c.getString("web.server-name", "Minecraft Server");
        this.dynmapUrl = trimSlash(c.getString("web.dynmap-url", ""));
        this.discordInvite = c.getString("web.discord-invite", "");
    }

    /**
     * Читает конфиг и, если нужно, генерирует секрет JWT и сохраняет его обратно.
     */
    public static Settings load(JavaPlugin plugin) {
        plugin.reloadConfig();
        FileConfiguration cfg = plugin.getConfig();
        String secret = cfg.getString("auth.jwt-secret", "");
        if (secret == null || secret.length() < 32) {
            secret = net.hypemap.util.Secrets.randomBase64(48);
            cfg.set("auth.jwt-secret", secret);
            plugin.saveConfig();
            plugin.getLogger().info("Сгенерирован новый секрет JWT (auth.jwt-secret).");
        }
        return new Settings(cfg, plugin.getDataFolder());
    }

    public File dataFolder() {
        return dataFolder;
    }

    public List<String> allowedOriginsList() {
        return new ArrayList<>(allowedOrigins);
    }

    private static String trimSlash(String value) {
        if (value == null) return "";
        String out = value.trim();
        while (out.endsWith("/")) out = out.substring(0, out.length() - 1);
        return out;
    }

    private static String sanitizeMarkerId(String id) {
        String out = (id == null || id.isBlank()) ? "hypemap.towns" : id.trim();
        StringBuilder sb = new StringBuilder(out.length());
        for (char ch : out.toCharArray()) {
            if (Character.isLetterOrDigit(ch) || ch == '.' || ch == '_' || ch == '-') sb.append(ch);
        }
        return sb.length() == 0 ? "hypemap.towns" : sb.toString();
    }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
