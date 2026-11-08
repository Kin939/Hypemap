package net.hypemap.api;

/** Ответ с нестандартным HTTP-статусом. */
public final class Result {
    public final int status;
    public final Object body;

    public Result(int status, Object body) {
        this.status = status;
        this.body = body;
    }

    public static Result created(Object body) {
        return new Result(201, body);
    }

    public static Result accepted(Object body) {
        return new Result(202, body);
    }
}
