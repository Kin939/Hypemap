package net.hypemap.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Поселение (зона на карте).
 * <p>
 * Класс сериализуется Gson'ом в колонку {@code data} таблицы {@code towns},
 * поэтому имена полей = имена полей JSON API (camelCase).
 */
public final class Town {
    public String id;
    public String name;
    public String description = "";
    public String world = "world";
    /** Y-уровень, на котором рисуется полигон (важно для изометрических карт Dynmap). */
    public double y = 64;
    public List<TownPoint> polygon = new ArrayList<>();
    public String fillColor = "#22c55e";
    public String lineColor = "#16a34a";
    public double fillOpacity = 0.28;
    public double lineOpacity = 1.0;
    public int lineWeight = 2;
    public List<TownMember> members = new ArrayList<>();
    public List<String> flags = new ArrayList<>();
    public boolean visible = true;
    public int minZoom = 0;
    public int maxZoom = 10;
    public String icon = "";
    public long createdAt;
    public long updatedAt;
    public String createdBy = "";
    public String updatedBy = "";
    public int revision = 1;

    public Town copy() {
        Town t = new Town();
        t.id = id;
        t.name = name;
        t.description = description == null ? "" : description;
        t.world = world;
        t.y = y;
        if (polygon != null) {
            for (TownPoint p : polygon) {
                if (p != null) t.polygon.add(p.copy());
            }
        }
        t.fillColor = fillColor;
        t.lineColor = lineColor;
        t.fillOpacity = fillOpacity;
        t.lineOpacity = lineOpacity;
        t.lineWeight = lineWeight;
        if (members != null) {
            for (TownMember m : members) {
                if (m != null) t.members.add(m.copy());
            }
        }
        t.flags = flags == null ? new ArrayList<>() : new ArrayList<>(flags);
        t.visible = visible;
        t.minZoom = minZoom;
        t.maxZoom = maxZoom;
        t.icon = icon;
        t.createdAt = createdAt;
        t.updatedAt = updatedAt;
        t.createdBy = createdBy;
        t.updatedBy = updatedBy;
        t.revision = revision;
        return t;
    }

    /**
     * Приводит десериализованное поселение к безопасному виду:
     * null-поля заменяются пустыми коллекциями (данные могли прийти из старой версии).
     */
    public Town normalize() {
        if (name == null) name = "";
        if (description == null) description = "";
        if (world == null) world = "world";
        if (polygon == null) polygon = new ArrayList<>();
        if (members == null) members = new ArrayList<>();
        if (flags == null) flags = new ArrayList<>();
        if (fillColor == null) fillColor = "#22c55e";
        if (lineColor == null) lineColor = "#16a34a";
        if (icon == null) icon = "";
        if (id == null) id = "";
        return this;
    }

    /** Центр масс полигона — используется для подписи и для «перелета» к поселению. */
    public double[] centroid() {
        if (polygon.isEmpty()) return new double[]{0, 0};
        double sx = 0;
        double sz = 0;
        for (TownPoint p : polygon) {
            sx += p.x;
            sz += p.z;
        }
        return new double[]{sx / polygon.size(), sz / polygon.size()};
    }

    public boolean isOwner(String playerName) {
        for (TownMember m : members) {
            if (m.name.equalsIgnoreCase(playerName) && "OWNER".equalsIgnoreCase(m.role)) return true;
        }
        return false;
    }
}
