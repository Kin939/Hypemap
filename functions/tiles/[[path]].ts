import type { PagesFunction } from '../_lib/types'
import { joinPath, proxy } from '../_lib/proxy'

/**
 * /tiles/* → Dynmap (origin: HYPEMAP_DYNMAP_ORIGIN, иначе HYPEMAP_ORIGIN):
 * тайлы, аватарки игроков, JSON маркеров.
 * Тайлы неизменяемы: кешируем на неделю на edge и в браузере.
 */
export const onRequest: PagesFunction = async (context) => {
  const ttl = Number(context.env.TILES_CACHE_TTL || 604800)
  const path = joinPath(context.params)
  return proxy(context, `/tiles/${path}`, {
    origin: 'dynmap',
    cacheTtl: Number.isFinite(ttl) && ttl > 0 ? ttl : 604800,
    fallback: 'pixel',
  })
}
