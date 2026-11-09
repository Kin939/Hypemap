import type { PagesFunction } from '../_lib/types'
import { joinPath, proxy } from '../_lib/proxy'

/**
 * Pages-маршрут `/bluemap/*` → HYPEMAP_BLUEMAP_ORIGIN/*.
 * Нужен для Minecraft 26.x, где Dynmap не работает и карту рендерит BlueMap.
 */
export const onRequest: PagesFunction = async (context) => {
  const path = `/${joinPath(context.params)}`
  const ttl = Number(context.env.TILES_CACHE_TTL || 604800)

  if (path.includes('/tiles/')) {
    return proxy(context, path, {
      origin: 'bluemap',
      cacheTtl: Number.isFinite(ttl) && ttl > 0 ? ttl : 604800,
    })
  }
  if (path.endsWith('settings.json')) {
    return proxy(context, path, { origin: 'bluemap', cacheTtl: 300 })
  }
  return proxy(context, path, { origin: 'bluemap' })
}
