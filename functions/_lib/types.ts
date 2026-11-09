/**
 * Минимальные типы Cloudflare Pages Functions.
 * Мы не тянем @cloudflare/workers-types в сборку фронтенда — этих описаний
 * достаточно, чтобы код был читаемым и типизированным.
 */

/** Биндинг Static Assets (режим Workers). */
export interface AssetsFetcher {
  fetch(request: Request): Promise<Response>
}

export interface Env {
  /** Публичный адрес плагина Hypemap (без слэша на конце), например https://mc.example.com */
  HYPEMAP_ORIGIN?: string
  /**
   * Публичный адрес Dynmap, если он отличается от HYPEMAP_ORIGIN
   * (типичный случай: хостинг выдал два разных порта, туннеля нет).
   * Может быть http:// — запрос делает edge, браузер видит только HTTPS сайта.
   */
  HYPEMAP_DYNMAP_ORIGIN?: string
  /** Статика web/dist — только в режиме Workers (`[assets]` в wrangler.toml). */
  ASSETS?: AssetsFetcher
  /** Service Token для Cloudflare Access (если туннель закрыт Access'ом). */
  ACCESS_CLIENT_ID?: string
  ACCESS_CLIENT_SECRET?: string
  /** Время кеширования тайлов в секундах (по умолчанию 604800 = 7 дней). */
  TILES_CACHE_TTL?: string
}

export interface PagesContext<E = Env> {
  request: Request
  env: E
  params: Record<string, string | string[]>
  data: Record<string, unknown>
  waitUntil(promise: Promise<unknown>): void
  next(): Promise<Response>
}

export type PagesFunction<E = Env> = (context: PagesContext<E>) => Response | Promise<Response>
