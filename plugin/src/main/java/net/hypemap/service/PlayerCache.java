package net.hypemap.service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.bukkit.Bukkit;
import org.bukkit.OfflinePlayer;
import org.bukkit.entity.Player;

/**
 * Кэш имён игроков для автодополнения в админке.
 * Обновляется в главном потоке, читается из HTTP-потоков без обращения к Bukkit API.
 */
public final class PlayerCache {

    private volatile Set<String> online = Set.of();
    private volatile List<String> known = List.of();
    private volatile List<String> worlds = List.of();
    private volatile long knownUpdatedAt = 0L;

    /** Вызывать из главного потока (например, раз в 5 секунд). */
    public void refreshOnline() {
        Set<String> names = new LinkedHashSet<>();
        for (Player player : Bukkit.getOnlinePlayers()) {
            names.add(player.getName());
        }
        online = Set.copyOf(names);

        List<String> worldNames = new ArrayList<>();
        for (org.bukkit.World world : Bukkit.getWorlds()) {
            worldNames.add(world.getName());
        }
        worlds = List.copyOf(worldNames);
    }

    public List<String> worlds() {
        return worlds;
    }

    /** Читает usercache — потенциально дорого, вызывать асинхронно/редко. */
    public void refreshKnown() {
        Set<String> names = new LinkedHashSet<>(online);
        try {
            for (OfflinePlayer player : Bukkit.getOfflinePlayers()) {
                String name = player.getName();
                if (name != null && !name.isBlank()) names.add(name);
                if (names.size() > 20000) break;
            }
        } catch (RuntimeException ignored) {
            // не критично, останутся только онлайн-игроки
        }
        List<String> sorted = new ArrayList<>(names);
        sorted.sort(Comparator.comparing(String::toLowerCase));
        known = List.copyOf(sorted);
        knownUpdatedAt = System.currentTimeMillis();
    }

    public Set<String> online() {
        return online;
    }

    public List<String> known() {
        return known;
    }

    public long knownUpdatedAt() {
        return knownUpdatedAt;
    }

    public List<String> search(String query, int limit) {
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        List<String> out = new ArrayList<>();
        for (String name : known) {
            if (needle.isEmpty() || name.toLowerCase(Locale.ROOT).contains(needle)) {
                out.add(name);
                if (out.size() >= limit) break;
            }
        }
        return out;
    }
}
