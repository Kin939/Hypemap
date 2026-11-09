package net.hypemap.model;

/** Вершина полигона поселения в координатах мира (x, z). */
public final class TownPoint {
    public double x;
    public double z;

    public TownPoint() {
    }

    public TownPoint(double x, double z) {
        this.x = x;
        this.z = z;
    }

    public TownPoint copy() {
        return new TownPoint(x, z);
    }
}
