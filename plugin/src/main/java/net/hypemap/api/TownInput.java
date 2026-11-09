package net.hypemap.api;

import java.util.List;

import net.hypemap.model.TownMember;
import net.hypemap.model.TownPoint;

/**
 * Тело запроса POST/PUT /api/towns.
 * Все поля nullable: на PUT отсутствующие поля означают «не менять».
 */
public final class TownInput {
    public String name;
    public String description;
    public String world;
    public Double y;
    public List<TownPoint> polygon;
    public String fillColor;
    public String lineColor;
    public Double fillOpacity;
    public Double lineOpacity;
    public Integer lineWeight;
    public List<TownMember> members;
    public List<String> flags;
    public Boolean visible;
    public Integer minZoom;
    public Integer maxZoom;
    public String icon;
}
