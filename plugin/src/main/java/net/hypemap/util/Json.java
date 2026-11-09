package net.hypemap.util;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonSyntaxException;

/** Единая конфигурация Gson для API и хранилища. */
public final class Json {

    private static final Gson GSON = new GsonBuilder()
            .disableHtmlEscaping()
            .serializeNulls()
            .create();

    private Json() {
    }

    public static Gson gson() {
        return GSON;
    }

    public static String write(Object value) {
        return GSON.toJson(value);
    }

    public static <T> T read(String json, Class<T> type) throws JsonSyntaxException {
        return GSON.fromJson(json, type);
    }
}
