package net.hypemap.storage;

/** Обёртка над SQLException, чтобы не тащить checked-исключения через все слои. */
public class StorageException extends RuntimeException {
    public StorageException(String message, Throwable cause) {
        super(message, cause);
    }

    public StorageException(String message) {
        super(message);
    }
}
