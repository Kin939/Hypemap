#!/usr/bin/env python3
"""Собирает zip-архив проекта Hypemap (исходники + инструкция).

Используется локально и в CI:

    python3 scripts/make-bundle.py                      # → Hypemap-1.0.0-project.zip
    python3 scripts/make-bundle.py --jar plugin/target/Hypemap-1.0.0.jar \
                                   --out dist/Hypemap-1.0.0-full.zip

Если передан --jar, готовый плагин кладётся в корень архива рядом с инструкцией —
получается «всё в одном файле».
"""
from __future__ import annotations

import argparse
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Каталоги, которые не нужны в архиве (сборка, зависимости, сгенерированные ассеты)
EXCLUDE_DIRS = {
    ".git",
    ".github",
    ".wrangler",
    ".vscode",
    ".idea",
    "node_modules",
    "dist",
    "target",
    "__pycache__",
    "tiles",          # web/mock/tiles — генерируются `npm run tiles`
}

# Файлы, которые не нужны
EXCLUDE_SUFFIXES = {".pyc", ".log", ".zip", ".jar"}
EXCLUDE_NAMES = {".DS_Store", ".env", ".env.local", "secrets.yml"}

INSTRUCTION = """\
Hypemap — карта поселений для Minecraft (Paper 1.21.3 + Dynmap)
===============================================================

В АРХИВЕ
  plugin/      исходники плагина (Maven)   → из него получается Hypemap-1.0.0.jar
  web/         сайт (Vue 3 + Vite + Leaflet)
  functions/   прокси для Cloudflare Pages
  docs/        документация: ARCHITECTURE, API, DEPLOY, DYNMAP
  README.md    обзор проекта

ЕСЛИ НУЖЕН ТОЛЬКО ПЛАГИН
  Готовый Hypemap-1.0.0.jar лежит на странице релиза рядом с этим архивом:
  https://github.com/Kin939/Hypemap/releases/tag/v1.0.0

  1) Скачайте Hypemap-1.0.0.jar
  2) Положите в папку plugins/ на сервере (рядом с Dynmap)
  3) Перезапустите сервер
  4) В консоли появится логин admin и одноразовый пароль — сохраните его
  5) Введите в игре:  /hypemap passwd admin <новый-пароль>

ТРЕБОВАНИЯ
  Paper 1.21.3 (или 1.21.x) и Java 21
  Dynmap 3.7-beta-8 или новее (без него плагин работает, но не рисует границы)

ЕСЛИ ХОЧЕТСЯ СОБРАТЬ ПЛАГИН САМОМУ
  cd plugin
  mvn -B clean package        # нужны JDK 21 и Maven 3.9+
  # результат: plugin/target/Hypemap-1.0.0.jar

САЙТ
  cd web
  npm ci
  npm run build               # папка web/dist — её и выкладывают на Cloudflare Pages

ПОДРОБНАЯ ИНСТРУКЦИЯ
  docs/DEPLOY.md — по шагам: Dynmap → плагин → Cloudflare Tunnel → Pages → Access
  docs/DYNMAP.md — как включить карту «сверху» (перспектива iso_S_90_*)

ЛОКАЛЬНОЕ ДЕМО БЕЗ СЕРВЕРА
  cd web && npm ci && npm run tiles && npm run build && npm run mock
  Откройте http://localhost:8080 , вход в админку: admin / admin
"""


def iter_files(base: pathlib.Path):
    for path in sorted(base.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(base)
        if any(part in EXCLUDE_DIRS for part in relative.parts[:-1]):
            continue
        if path.suffix in EXCLUDE_SUFFIXES or path.name in EXCLUDE_NAMES:
            continue
        yield path, relative


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default=str(ROOT.parent / "Hypemap-1.0.0-project.zip"))
    parser.add_argument("--jar", default=None, help="готовый jar, который положить в корень")
    args = parser.parse_args()

    output = pathlib.Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)

    count = 0
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.writestr("ЧИТАЙ-МЕНЯ.txt", INSTRUCTION)
        count += 1

        if args.jar:
            jar = pathlib.Path(args.jar)
            archive.write(jar, arcname=jar.name)
            count += 1

        for path, relative in iter_files(ROOT):
            archive.write(path, arcname=str(relative))
            count += 1

    size = output.stat().st_size / 1024
    print(f"Готово: {output} — {count} файлов, {size:.0f} КБ")


if __name__ == "__main__":
    main()
