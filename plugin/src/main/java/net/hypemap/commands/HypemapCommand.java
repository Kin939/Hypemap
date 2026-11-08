package net.hypemap.commands;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.bukkit.command.Command;
import org.bukkit.command.CommandExecutor;
import org.bukkit.command.CommandSender;
import org.bukkit.command.TabCompleter;

import net.hypemap.HypemapPlugin;
import net.hypemap.model.User;
import net.hypemap.util.Json;

/** Команда /hypemap (алиас /hm). */
public final class HypemapCommand implements CommandExecutor, TabCompleter {

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").withZone(ZoneOffset.UTC);

    private final HypemapPlugin plugin;

    public HypemapCommand(HypemapPlugin plugin) {
        this.plugin = plugin;
    }

    @Override
    public boolean onCommand(CommandSender sender, Command command, String label, String[] args) {
        if (args.length == 0 || "help".equalsIgnoreCase(args[0])) {
            help(sender, label);
            return true;
        }
        switch (args[0].toLowerCase(Locale.ROOT)) {
            case "reload" -> {
                plugin.reloadEverything();
                sender.sendMessage("§a[Hypemap] Конфиг перезагружен, API перезапущен.");
            }
            case "resync" -> {
                plugin.dynmap().requestSync();
                sender.sendMessage("§a[Hypemap] Синхронизация маркеров с Dynmap поставлена в очередь.");
            }
            case "info" -> {
                sender.sendMessage("§7Версия: §f" + plugin.getPluginMeta().getVersion());
                sender.sendMessage("§7Поселений: §f" + plugin.towns().count());
                sender.sendMessage("§7Dynmap: §f" + (plugin.dynmap().available()
                        ? "подключён (" + plugin.dynmap().coreVersion() + ")" : "не найден"));
                sender.sendMessage("§7API: §f" + (plugin.api() != null && plugin.api().running()
                        ? "http://" + plugin.settings().apiBind + ":" + plugin.settings().apiPort + "/api" : "выключен"));
                sender.sendMessage("§7Режим авторизации: §f" + plugin.settings().authMode);
            }
            case "passwd" -> {
                if (args.length < 3) {
                    sender.sendMessage("§cИспользование: /" + label + " passwd <логин> <пароль>");
                    return true;
                }
                try {
                    String role = plugin.users().find(args[1]).map(u -> u.role).orElse("EDITOR");
                    plugin.auth().setPassword(args[1], args[2], role, sender.getName());
                    sender.sendMessage("§a[Hypemap] Пароль для «" + args[1] + "» обновлён (роль " + role + ").");
                } catch (RuntimeException ex) {
                    sender.sendMessage("§c[Hypemap] " + ex.getMessage());
                }
            }
            case "role" -> {
                if (args.length < 3) {
                    sender.sendMessage("§cИспользование: /" + label + " role <логин> <ADMIN|EDITOR|VIEWER>");
                    return true;
                }
                String role = args[2].toUpperCase(Locale.ROOT);
                if (!List.of("ADMIN", "EDITOR", "VIEWER").contains(role)) {
                    sender.sendMessage("§cНеизвестная роль: " + role);
                    return true;
                }
                User existing = plugin.users().find(args[1]).orElse(null);
                if (existing == null) {
                    sender.sendMessage("§cПользователь не найден: " + args[1]);
                    return true;
                }
                String hash = plugin.users().passwordHash(args[1]).orElse(null);
                if (hash == null) {
                    sender.sendMessage("§cУ пользователя нет пароля — задайте через passwd.");
                    return true;
                }
                plugin.users().upsert(existing.username, hash, role);
                sender.sendMessage("§a[Hypemap] Роль «" + existing.username + "» теперь " + role + ".");
            }
            case "users" -> {
                sender.sendMessage("§7Пользователи панели:");
                for (User user : plugin.users().findAll()) {
                    sender.sendMessage("§f - " + user.username + " §7(" + user.role + ")");
                }
            }
            case "backup" -> {
                try {
                    File dir = new File(plugin.getDataFolder(), "backups");
                    if (!dir.exists() && !dir.mkdirs()) {
                        sender.sendMessage("§cНе удалось создать каталог backups");
                        return true;
                    }
                    File file = new File(dir, "towns-" + STAMP.format(Instant.now()) + ".json");
                    Files.writeString(file.toPath(), Json.write(plugin.towns().findAll()), StandardCharsets.UTF_8);
                    sender.sendMessage("§a[Hypemap] Бэкап: §f" + file.getName());
                } catch (IOException ex) {
                    sender.sendMessage("§c[Hypemap] Ошибка бэкапа: " + ex.getMessage());
                }
            }
            default -> help(sender, label);
        }
        return true;
    }

    private void help(CommandSender sender, String label) {
        sender.sendMessage("§8§m--------------------------------");
        sender.sendMessage("§bHypemap §7— карта поселений");
        sender.sendMessage("§f/" + label + " info §7— состояние плагина");
        sender.sendMessage("§f/" + label + " reload §7— перезагрузить конфиг");
        sender.sendMessage("§f/" + label + " resync §7— пересоздать маркеры в Dynmap");
        sender.sendMessage("§f/" + label + " passwd <логин> <пароль> §7— сменить пароль");
        sender.sendMessage("§f/" + label + " role <логин> <роль> §7— изменить роль");
        sender.sendMessage("§f/" + label + " users §7— список пользователей");
        sender.sendMessage("§f/" + label + " backup §7— экспорт поселений в JSON");
        sender.sendMessage("§8§m--------------------------------");
    }

    @Override
    public List<String> onTabComplete(CommandSender sender, Command command, String alias, String[] args) {
        if (args.length == 1) {
            return filter(Arrays.asList("info", "reload", "resync", "passwd", "role", "users", "backup", "help"), args[0]);
        }
        if (args.length == 2 && ("passwd".equalsIgnoreCase(args[0]) || "role".equalsIgnoreCase(args[0]))) {
            List<String> names = new ArrayList<>();
            for (User user : plugin.users().findAll()) names.add(user.username);
            return filter(names, args[1]);
        }
        if (args.length == 3 && "role".equalsIgnoreCase(args[0])) {
            return filter(Arrays.asList("ADMIN", "EDITOR", "VIEWER"), args[2]);
        }
        return List.of();
    }

    private static List<String> filter(List<String> options, String prefix) {
        String lower = prefix == null ? "" : prefix.toLowerCase(Locale.ROOT);
        List<String> out = new ArrayList<>();
        for (String option : options) {
            if (option.toLowerCase(Locale.ROOT).startsWith(lower)) out.add(option);
        }
        return out;
    }
}
