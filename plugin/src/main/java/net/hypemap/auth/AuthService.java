package net.hypemap.auth;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.Logger;

import net.hypemap.config.Settings;
import net.hypemap.model.User;
import net.hypemap.storage.AuditRepository;
import net.hypemap.storage.UserRepository;

/**
 * Логин по паролю (JWT HS256), проверка Access-JWT и rate limit.
 */
public final class AuthService {

    private final Settings settings;
    private final UserRepository users;
    private final AuditRepository audit;
    private final AccessJwtVerifier accessVerifier;
    private final Logger logger;
    private final Map<String, Deque<Long>> failedAttempts = new ConcurrentHashMap<>();

    public AuthService(Settings settings, UserRepository users, AuditRepository audit, Logger logger) {
        this.settings = settings;
        this.users = users;
        this.audit = audit;
        this.logger = logger;
        this.accessVerifier = new AccessJwtVerifier(settings, logger);
    }

    public AccessJwtVerifier accessVerifier() {
        return accessVerifier;
    }

    public Settings.AuthMode mode() {
        return settings.authMode;
    }

    /** Создаёт первого администратора, если таблица пуста. Возвращает пароль (или null). */
    public String bootstrapAdminIfEmpty() {
        if (users.count() > 0) return null;
        String password = PasswordHasher.randomPassword(16);
        String hash = PasswordHasher.hash(password, settings.passwordIterations);
        users.upsert("admin", hash, "ADMIN");
        logger.warning("========================================================");
        logger.warning(" Hypemap: создан администратор по умолчанию");
        logger.warning("   логин:  admin");
        logger.warning("   пароль: " + password);
        logger.warning(" Смените пароль: /hypemap passwd admin <новый-пароль>");
        logger.warning("========================================================");
        return password;
    }

    public static final class LoginResult {
        public final String token;
        public final long expiresAt;
        public final String username;
        public final String role;

        LoginResult(String token, long expiresAt, String username, String role) {
            this.token = token;
            this.expiresAt = expiresAt;
            this.username = username;
            this.role = role;
        }
    }

    public LoginResult login(String username, String password, String clientIp) {
        if (!settings.authMode.allowsLocalLogin()) {
            throw AuthException.forbidden("Локальный вход отключён (auth.mode = " + settings.authMode + ")");
        }
        String name = username == null ? "" : username.trim();
        if (name.isEmpty() || password == null || password.isEmpty()) {
            throw AuthException.unauthorized("Укажите логин и пароль");
        }
        String limitKey = (clientIp == null ? "?" : clientIp) + "|" + name.toLowerCase(Locale.ROOT);
        if (isRateLimited(limitKey)) {
            throw new AuthException(429, "too_many_attempts", "Слишком много попыток входа. Повторите позже.");
        }

        Optional<String> hash = users.passwordHash(name);
        boolean ok = hash.isPresent() && PasswordHasher.verify(password, hash.get());
        if (!ok) {
            registerFailure(limitKey);
            audit.log(name, "auth.login.failed", null, clientIp);
            throw AuthException.unauthorized("Неверный логин или пароль");
        }

        User user = users.find(name).orElseThrow(() -> AuthException.unauthorized("Пользователь не найден"));
        users.touchLogin(user.username);
        failedAttempts.remove(limitKey);
        audit.log(user.username, "auth.login", null, clientIp);

        long ttlSeconds = settings.tokenTtlMinutes * 60L;
        String token = JwtCodec.issue(user.username, user.role, ttlSeconds, settings.jwtSecret);
        return new LoginResult(token, System.currentTimeMillis() + ttlSeconds * 1000L, user.username, user.role);
    }

    /**
     * Определяет пользователя по заголовкам запроса.
     * Возвращает {@link ApiUser#anonymous()} если токенов нет (публичный доступ).
     */
    public ApiUser authenticate(String authorizationHeader, String accessAssertion) {
        if (accessAssertion != null && !accessAssertion.isBlank() && settings.authMode.allowsAccessJwt()) {
            Optional<ApiUser> user = accessVerifier.verify(accessAssertion);
            if (user.isPresent()) return user.get();
        }
        String bearer = bearerToken(authorizationHeader);
        if (bearer != null && settings.authMode.allowsLocalLogin()) {
            Optional<JwtCodec.Claims> claims = JwtCodec.verify(bearer, settings.jwtSecret);
            if (claims.isPresent()) {
                return ApiUser.local(claims.get().subject, claims.get().role);
            }
            throw AuthException.unauthorized("Токен недействителен или истёк");
        }
        return ApiUser.anonymous();
    }

    public static String bearerToken(String header) {
        if (header == null) return null;
        String value = header.trim();
        if (value.length() < 8) return null;
        if (!value.regionMatches(true, 0, "Bearer ", 0, 7)) return null;
        String token = value.substring(7).trim();
        return token.isEmpty() ? null : token;
    }

    public void changePassword(ApiUser user, String currentPassword, String newPassword) {
        if (user == null || "anonymous".equals(user.username)) {
            throw AuthException.unauthorized("Требуется вход");
        }
        if ("access".equals(user.source)) {
            throw AuthException.forbidden("Пароль управляется Cloudflare Access");
        }
        Optional<String> hash = users.passwordHash(user.username);
        if (hash.isEmpty() || !PasswordHasher.verify(currentPassword, hash.get())) {
            throw AuthException.forbidden("Текущий пароль неверен");
        }
        validatePassword(newPassword);
        users.upsert(user.username, PasswordHasher.hash(newPassword, settings.passwordIterations), user.role);
        audit.log(user.username, "auth.password.change", null, null);
    }

    public void setPassword(String username, String newPassword, String role, String actor) {
        validatePassword(newPassword);
        users.upsert(username, PasswordHasher.hash(newPassword, settings.passwordIterations), role);
        audit.log(actor, "user.upsert", null, username + " (" + role + ")");
    }

    public void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new AuthException(400, "weak_password", "Пароль должен быть не короче 8 символов");
        }
        if (password.length() > 200) {
            throw new AuthException(400, "weak_password", "Пароль слишком длинный");
        }
    }

    private boolean isRateLimited(String key) {
        Deque<Long> attempts = failedAttempts.get(key);
        if (attempts == null) return false;
        long threshold = System.currentTimeMillis() - settings.rateLimitWindowSeconds * 1000L;
        synchronized (attempts) {
            while (!attempts.isEmpty() && attempts.peekFirst() < threshold) attempts.pollFirst();
            return attempts.size() >= settings.rateLimitAttempts;
        }
    }

    private void registerFailure(String key) {
        Deque<Long> attempts = failedAttempts.computeIfAbsent(key, k -> new ArrayDeque<>());
        synchronized (attempts) {
            attempts.addLast(System.currentTimeMillis());
        }
        if (failedAttempts.size() > 5000) {
            // не даём словарю расти бесконечно
            failedAttempts.clear();
        }
    }
}
