package net.hypemap.model;

/** Запись журнала действий (аудит). */
public final class AuditEntry {
    public long id;
    public String at;
    public String actor;
    public String action;
    public String townId;
    public String details;
}
