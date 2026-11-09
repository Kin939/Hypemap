package net.hypemap.dynmap;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

import org.bukkit.Bukkit;
import org.bukkit.plugin.RegisteredServiceProvider;
import org.bukkit.scheduler.BukkitTask;

import net.hypemap.HypemapPlugin;
import net.hypemap.config.Settings;
import net.hypemap.model.Town;
import net.hypemap.model.TownPoint;
import net.hypemap.util.Text;

/**
 * Мост к Dynmap Marker API через рефлексию.
 * <p>
 * Рефлексия выбрана осознанно: плагин не зависит от конкретной версии dynmap-api
 * (3.6 / 3.7 / 3.8), а при отсутствии Dynmap просто логирует предупреждение.
 * Все вызовы Marker API выполняются в главном потоке сервера.
 */
public final class DynmapBridge {

    private final HypemapPlugin plugin;
    private final Settings settings;

    private boolean available;
    private String coreVersion = "";
    private Object markerApi;
    private Object markerSet;

    private Method apiGetMarkerAPI;
    private Method apiMarkerApiInitialized;
    private Method apiCoreVersion;

    private Method markerGetSet;
    private Method markerCreateSet;

    private Method setCreateAreaMarker;
    private Method setFindAreaMarker;
    private Method setGetAreaMarkers;
    private Method setGetMarkers;

    private Method areaGetMarkerID;
    private Method areaDelete;
    private Method areaSetLabel;
    private Method areaSetDescription;
    private Method areaSetFillStyle;
    private Method areaSetLineStyle;
    private Method areaSetCornerLocations;
    private Method areaSetRangeY;
    private Method areaSetMinZoom;
    private Method areaSetMaxZoom;

    private BukkitTask retryTask;
    private final AtomicBoolean syncQueued = new AtomicBoolean(false);

    public DynmapBridge(HypemapPlugin plugin, Settings settings) {
        this.plugin = plugin;
        this.settings = settings;
    }

    public void init() {
        if (!settings.dynmapEnabled) {
            plugin.getLogger().info("Интеграция с Dynmap отключена в конфиге.");
            return;
        }
        if (tryHook()) return;

        // Dynmap мог ещё не успеть инициализировать Marker API — пробуем 60 секунд.
        final int[] attempts = {0};
        retryTask = Bukkit.getScheduler().runTaskTimer(plugin, () -> {
            attempts[0]++;
            if (tryHook()) {
                if (retryTask != null) retryTask.cancel();
            } else if (attempts[0] > 30) {
                plugin.getLogger().warning("Dynmap не найден или Marker API недоступен — маркеры не будут создаваться.");
                if (retryTask != null) retryTask.cancel();
            }
        }, 20L, 20L);
    }

    private boolean tryHook() {
        try {
            Class<?> commonApi = Class.forName("org.dynmap.DynmapCommonAPI");
            @SuppressWarnings({"rawtypes", "unchecked"})
            RegisteredServiceProvider<?> registration = Bukkit.getServicesManager().getRegistration((Class) commonApi);
            if (registration == null) return false;
            Object api = registration.getProvider();
            apiGetMarkerAPI = commonApi.getMethod("getMarkerAPI");
            apiMarkerApiInitialized = commonApi.getMethod("markerAPIInitialized");
            apiCoreVersion = commonApi.getMethod("getDynmapCoreVersion");

            Object initialized = apiMarkerApiInitialized.invoke(api);
            if (!Boolean.TRUE.equals(initialized)) return false;

            markerApi = apiGetMarkerAPI.invoke(api);
            if (markerApi == null) return false;

            try {
                Object version = apiCoreVersion.invoke(api);
                coreVersion = version == null ? "" : version.toString();
            } catch (ReflectiveOperationException ignored) {
                coreVersion = "";
            }

            Class<?> markerApiClass = Class.forName("org.dynmap.markers.MarkerAPI");
            Class<?> markerSetClass = Class.forName("org.dynmap.markers.MarkerSet");
            Class<?> areaMarkerClass = Class.forName("org.dynmap.markers.AreaMarker");

            markerGetSet = markerApiClass.getMethod("getMarkerSet", String.class);
            markerCreateSet = markerApiClass.getMethod("createMarkerSet", String.class, String.class,
                    java.util.Set.class, boolean.class);

            setCreateAreaMarker = markerSetClass.getMethod("createAreaMarker", String.class, String.class,
                    boolean.class, String.class, double[].class, double[].class, boolean.class);
            setFindAreaMarker = markerSetClass.getMethod("findAreaMarker", String.class);
            setGetAreaMarkers = markerSetClass.getMethod("getAreaMarkers");
            setGetMarkers = markerSetClass.getMethod("getMarkers");

            areaGetMarkerID = areaMarkerClass.getMethod("getMarkerID");
            areaDelete = areaMarkerClass.getMethod("deleteMarker");
            areaSetLabel = areaMarkerClass.getMethod("setLabel", String.class);
            areaSetDescription = areaMarkerClass.getMethod("setDescription", String.class);
            areaSetFillStyle = areaMarkerClass.getMethod("setFillStyle", double.class, int.class);
            areaSetLineStyle = areaMarkerClass.getMethod("setLineStyle", int.class, double.class, int.class);
            areaSetCornerLocations = areaMarkerClass.getMethod("setCornerLocations", double[].class, double[].class);
            areaSetRangeY = areaMarkerClass.getMethod("setRangeY", double.class, double.class);
            areaSetMinZoom = areaMarkerClass.getMethod("setMinZoom", int.class);
            areaSetMaxZoom = areaMarkerClass.getMethod("setMaxZoom", int.class);

            markerSet = markerGetSet.invoke(markerApi, settings.markerSetId);
            if (markerSet == null) {
                markerSet = markerCreateSet.invoke(markerApi, settings.markerSetId, settings.markerSetLabel,
                        null, true);
            }
            if (markerSet == null) return false;

            available = true;
            plugin.getLogger().info("Dynmap подключён (core " + (coreVersion.isEmpty() ? "n/a" : coreVersion)
                    + "), набор маркеров: " + settings.markerSetId);
            return true;
        } catch (ClassNotFoundException ex) {
            return false;
        } catch (ReflectiveOperationException | RuntimeException ex) {
            plugin.getLogger().warning("Не удалось подключиться к Dynmap: " + ex);
            return false;
        }
    }

    public boolean available() {
        return available;
    }

    public String coreVersion() {
        return coreVersion;
    }

    public String markerSetId() {
        return settings.markerSetId;
    }

    /** Ставит синхронизацию в очередь (схлопывает частые вызовы в один). */
    public void requestSync() {
        if (!available) return;
        if (!syncQueued.compareAndSet(false, true)) return;
        Bukkit.getScheduler().runTask(plugin, () -> {
            syncQueued.set(false);
            try {
                sync(plugin.towns().findAll());
            } catch (RuntimeException ex) {
                plugin.getLogger().warning("Ошибка синхронизации маркеров: " + ex.getMessage());
            }
        });
    }

    /** Полная синхронизация: создать/обновить/удалить маркеры. Должно вызываться в главном потоке. */
    public void sync(List<Town> towns) {
        if (!available) return;
        try {
            Map<String, Object> existing = new HashMap<>();
            @SuppressWarnings("unchecked")
            Set<Object> markers = (Set<Object>) setGetAreaMarkers.invoke(markerSet);
            for (Object marker : markers) {
                Object id = areaGetMarkerID.invoke(marker);
                if (id != null) existing.put(id.toString(), marker);
            }

            Set<String> alive = new HashSet<>();
            for (Town town : towns) {
                if (!town.visible) continue;
                alive.add(town.id);
                try {
                    upsert(town, existing.get(town.id));
                } catch (ReflectiveOperationException ex) {
                    plugin.getLogger().warning("Не удалось создать маркер для «" + town.name + "»: " + ex);
                }
            }

            if (settings.deleteOrphanMarkers) {
                for (Map.Entry<String, Object> entry : existing.entrySet()) {
                    if (!alive.contains(entry.getKey())) {
                        areaDelete.invoke(entry.getValue());
                    }
                }
            }
        } catch (ReflectiveOperationException ex) {
            plugin.getLogger().warning("Ошибка Marker API Dynmap: " + ex);
            available = false;
        }
    }

    private void upsert(Town town, Object existing) throws ReflectiveOperationException {
        double[] xs = new double[town.polygon.size()];
        double[] zs = new double[town.polygon.size()];
        for (int i = 0; i < town.polygon.size(); i++) {
            TownPoint point = town.polygon.get(i);
            xs[i] = point.x;
            zs[i] = point.z;
        }

        Object marker = existing;
        if (marker == null) {
            marker = setCreateAreaMarker.invoke(markerSet, town.id, town.name, false, town.world, xs, zs, true);
            if (marker == null) {
                plugin.getLogger().warning("Dynmap отказался создать маркер для «" + town.name + "»");
                return;
            }
        } else {
            areaSetCornerLocations.invoke(marker, xs, zs);
        }

        areaSetLabel.invoke(marker, town.name);
        areaSetDescription.invoke(marker, description(town));
        areaSetFillStyle.invoke(marker, town.fillOpacity, parseColor(town.fillColor));
        areaSetLineStyle.invoke(marker, town.lineWeight, town.lineOpacity, parseColor(town.lineColor));
        areaSetMinZoom.invoke(marker, town.minZoom);
        areaSetMaxZoom.invoke(marker, town.maxZoom);
        areaSetRangeY.invoke(marker, town.y, town.y);
    }

    private String description(Town town) {
        StringBuilder sb = new StringBuilder();
        sb.append("<div class=\"hypemap-tooltip\">");
        sb.append("<div class=\"hypemap-tooltip__title\">").append(escape(town.name)).append("</div>");
        if (town.description != null && !town.description.isBlank()) {
            sb.append("<div class=\"hypemap-tooltip__desc\">").append(escape(town.description)).append("</div>");
        }
        if (!town.members.isEmpty()) {
            List<String> names = new ArrayList<>();
            for (var member : town.members) {
                names.add(escape(member.name));
            }
            sb.append("<div class=\"hypemap-tooltip__members\">")
                    .append(String.join(", ", names))
                    .append("</div>");
        }
        if (!town.flags.isEmpty()) {
            sb.append("<div class=\"hypemap-tooltip__flags\">")
                    .append(escape(String.join(" · ", town.flags)))
                    .append("</div>");
        }
        sb.append("</div>");
        return sb.toString();
    }

    private static String escape(String value) {
        return Text.truncate(value == null ? "" : value, 200)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    public static int parseColor(String hex) {
        if (hex == null) return 0x22c55e;
        String value = hex.startsWith("#") ? hex.substring(1) : hex;
        try {
            return Integer.parseInt(value, 16) & 0xFFFFFF;
        } catch (NumberFormatException ex) {
            return 0x22c55e;
        }
    }

    public void shutdown() {
        if (retryTask != null) {
            retryTask.cancel();
            retryTask = null;
        }
    }
}
