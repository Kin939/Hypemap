package net.hypemap.api;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

import org.bukkit.Bukkit;
import org.bukkit.World;

import net.hypemap.config.Settings;
import net.hypemap.model.Town;
import net.hypemap.model.TownMember;
import net.hypemap.model.TownPoint;
import net.hypemap.storage.TownRepository;
import net.hypemap.util.Text;

/** Валидация и нормализация входящих данных о поселении. */
public final class TownValidator {

    private static final Pattern COLOR = Pattern.compile("^#[0-9a-fA-F]{6}$");
    private static final Pattern PLAYER_NAME = Pattern.compile("^[A-Za-z0-9_.]{2,16}$");
    private static final double MAX_COORD = 30_000_000d;

    private final Settings settings;
    private final TownRepository towns;

    public TownValidator(Settings settings, TownRepository towns) {
        this.settings = settings;
        this.towns = towns;
    }

    /**
     * @param input данные запроса
     * @param base  существующее поселение (PUT) или {@code null} (POST)
     * @param actor имя пользователя из токена
     */
    public Town apply(TownInput input, Town base, String actor) {
        if (input == null) throw ApiException.badRequest("invalid_body", "Пустой запрос");
        Town town = base == null ? new Town() : base.copy();
        boolean creating = base == null;

        // ---- name
        if (input.name != null) {
            String name = input.name.trim();
            if (name.length() < settings.minNameLength || name.length() > settings.maxNameLength) {
                throw ApiException.badRequest("invalid_name",
                        "Имя должно быть от " + settings.minNameLength + " до " + settings.maxNameLength + " символов");
            }
            if (name.chars().anyMatch(Character::isISOControl)) {
                throw ApiException.badRequest("invalid_name", "Имя содержит недопустимые символы");
            }
            boolean changed = base == null || !name.equalsIgnoreCase(base.name);
            if (changed && towns.nameTaken(name, base == null ? null : base.id)) {
                throw ApiException.conflict("name_taken", "Поселение с таким названием уже существует");
            }
            town.name = name;
        } else if (creating) {
            throw ApiException.badRequest("name_required", "Укажите название поселения");
        }

        // ---- description
        if (input.description != null) {
            town.description = Text.truncate(input.description.trim(), 500);
        }

        // ---- world
        if (input.world != null && !input.world.isBlank()) {
            World world = Bukkit.getWorld(input.world.trim());
            if (world == null) {
                throw ApiException.badRequest("unknown_world", "Мир не найден: " + input.world);
            }
            if (creating || !world.getName().equals(town.world)) {
                town.world = world.getName();
            }
        } else if (creating) {
            throw ApiException.badRequest("world_required", "Укажите мир");
        }

        // ---- y
        if (input.y != null) {
            town.y = clamp(input.y, -512, 1024);
        }

        // ---- polygon
        if (input.polygon != null) {
            town.polygon = sanitizePolygon(input.polygon);
        } else if (creating) {
            throw ApiException.badRequest("polygon_required", "Нарисуйте границы поселения");
        }

        // ---- colors & styles
        if (input.fillColor != null) town.fillColor = color(input.fillColor);
        else if (creating) town.fillColor = "#22c55e";

        if (input.lineColor != null) town.lineColor = color(input.lineColor);
        else if (creating) town.lineColor = "#16a34a";

        town.fillOpacity = input.fillOpacity != null
                ? clamp(input.fillOpacity, 0, 1) : (creating ? settings.defaultFillOpacity : town.fillOpacity);
        town.lineOpacity = input.lineOpacity != null
                ? clamp(input.lineOpacity, 0, 1) : (creating ? settings.defaultLineOpacity : town.lineOpacity);
        town.lineWeight = input.lineWeight != null
                ? (int) clamp(input.lineWeight, 1, 10) : (creating ? settings.defaultLineWeight : town.lineWeight);

        // ---- members
        if (input.members != null) {
            town.members = sanitizeMembers(input.members);
        } else if (creating) {
            town.members = new ArrayList<>();
        }

        // ---- flags
        if (input.flags != null) {
            town.flags = sanitizeFlags(input.flags);
        } else if (creating) {
            town.flags = new ArrayList<>();
        }

        // ---- visibility & zoom
        if (input.visible != null) town.visible = input.visible;
        if (input.minZoom != null) town.minZoom = (int) clamp(input.minZoom, 0, 20);
        if (input.maxZoom != null) town.maxZoom = (int) clamp(input.maxZoom, 0, 20);
        if (town.maxZoom < town.minZoom) {
            int tmp = town.maxZoom;
            town.maxZoom = town.minZoom;
            town.minZoom = tmp;
        }
        if (input.icon != null) town.icon = Text.truncate(input.icon.trim(), 64);

        if (town.name == null || town.name.isBlank()) {
            throw ApiException.badRequest("name_required", "Укажите название поселения");
        }
        return town;
    }

    public List<TownPoint> sanitizePolygon(List<TownPoint> raw) {
        if (raw.size() < 3) {
            throw ApiException.badRequest("invalid_polygon", "Нужно минимум 3 вершины");
        }
        if (raw.size() > settings.maxPolygonPoints) {
            throw ApiException.badRequest("invalid_polygon",
                    "Слишком много вершин (максимум " + settings.maxPolygonPoints + ")");
        }
        List<TownPoint> points = new ArrayList<>(raw.size());
        for (TownPoint p : raw) {
            if (p == null || !Double.isFinite(p.x) || !Double.isFinite(p.z)) {
                throw ApiException.badRequest("invalid_polygon", "Некорректная вершина полигона");
            }
            if (Math.abs(p.x) > MAX_COORD || Math.abs(p.z) > MAX_COORD) {
                throw ApiException.badRequest("invalid_polygon", "Координаты вне допустимого диапазона");
            }
            TownPoint rounded = new TownPoint(round(p.x), round(p.z));
            if (!points.isEmpty()) {
                TownPoint last = points.get(points.size() - 1);
                if (Math.abs(last.x - rounded.x) < 0.05 && Math.abs(last.z - rounded.z) < 0.05) continue;
            }
            points.add(rounded);
        }
        // закрывающая точка = первой — убираем, контур замыкаем на клиенте
        if (points.size() > 3) {
            TownPoint first = points.get(0);
            TownPoint last = points.get(points.size() - 1);
            if (Math.abs(first.x - last.x) < 0.05 && Math.abs(first.z - last.z) < 0.05) {
                points.remove(points.size() - 1);
            }
        }
        if (points.size() < 3) {
            throw ApiException.badRequest("invalid_polygon", "Контур вырожден: нужно минимум 3 разные вершины");
        }
        if (Math.abs(area(points)) < 1.0) {
            throw ApiException.badRequest("invalid_polygon", "Площадь поселения слишком мала");
        }
        return points;
    }

    private List<TownMember> sanitizeMembers(List<TownMember> raw) {
        if (raw.size() > settings.maxMembers) {
            throw ApiException.badRequest("too_many_members",
                    "Слишком много игроков (максимум " + settings.maxMembers + ")");
        }
        Set<String> seen = new LinkedHashSet<>();
        List<TownMember> members = new ArrayList<>();
        for (TownMember m : raw) {
            if (m == null || m.name == null) continue;
            String name = m.name.trim();
            if (!PLAYER_NAME.matcher(name).matches()) {
                throw ApiException.badRequest("invalid_member", "Некорректный ник: " + name);
            }
            String key = name.toLowerCase(Locale.ROOT);
            if (!seen.add(key)) continue;
            String role = "OWNER".equalsIgnoreCase(m.role) ? "OWNER" : "MEMBER";
            members.add(new TownMember(name, role));
        }
        boolean hasOwner = members.stream().anyMatch(m -> "OWNER".equals(m.role));
        if (!members.isEmpty() && !hasOwner) {
            members.get(0).role = "OWNER";
        }
        return members;
    }

    private List<String> sanitizeFlags(List<String> raw) {
        List<String> flags = new ArrayList<>();
        for (String flag : raw) {
            if (flag == null || flag.isBlank()) continue;
            String normalized = flag.trim().toUpperCase(Locale.ROOT);
            if (!settings.townFlags.contains(normalized)) continue;
            if (!flags.contains(normalized)) flags.add(normalized);
        }
        return flags;
    }

    private String color(String value) {
        String trimmed = value.trim();
        if (!COLOR.matcher(trimmed).matches()) {
            throw ApiException.badRequest("invalid_color", "Цвет должен быть в формате #RRGGBB: " + value);
        }
        return trimmed.toLowerCase(Locale.ROOT);
    }

    private static double area(List<TownPoint> points) {
        double sum = 0;
        for (int i = 0; i < points.size(); i++) {
            TownPoint a = points.get(i);
            TownPoint b = points.get((i + 1) % points.size());
            sum += a.x * b.z - b.x * a.z;
        }
        return sum / 2.0;
    }

    private static double round(double value) {
        return Math.round(value * 10.0) / 10.0;
    }

    private static double clamp(double value, double min, double max) {
        return Math.max(min, Math.min(max, value));
    }
}
