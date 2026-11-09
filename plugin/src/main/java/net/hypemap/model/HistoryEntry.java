package net.hypemap.model;

/** Запись истории изменений поселения. */
public final class HistoryEntry {
    public String townId;
    public int revision;
    /** CREATE | UPDATE | RESTORE | VISIBILITY */
    public String action;
    public String actor;
    public String createdAt;
    /** Полный снимок поселения на момент ревизии. */
    public Town snapshot;
}
