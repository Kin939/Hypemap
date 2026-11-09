package net.hypemap.api;

/** Обработчик одного маршрута. */
@FunctionalInterface
public interface Handler {
    Object handle(ApiContext ctx) throws Exception;
}
