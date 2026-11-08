package net.hypemap.auth;

/** Ошибка аутентификации/авторизации, которую API превращает в 401/403. */
public class AuthException extends RuntimeException {

    private final int status;
    private final String code;

    public AuthException(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public static AuthException unauthorized(String message) {
        return new AuthException(401, "unauthorized", message);
    }

    public static AuthException forbidden(String message) {
        return new AuthException(403, "forbidden", message);
    }

    public int status() {
        return status;
    }

    public String code() {
        return code;
    }
}
