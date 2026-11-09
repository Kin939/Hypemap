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
  /** Публичный адрес туннеля с Minecraft-сервером (без слэша на конце). */
  HYPEMAP_ORIGIN?: string
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
