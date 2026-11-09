import type { PagesFunction } from '../_lib/types'
import { joinPath, proxy } from '../_lib/proxy'

/**
 * /up/* → Dynmap (origin: HYPEMAP_DYNMAP_ORIGIN, иначе HYPEMAP_ORIGIN).
 * Конфигурация карт меняется редко — кешируем 5 минут,
 * а /up/world/<world>/<ts> всегда идёт напрямую (там живые игроки).
 */
export const onRequest: PagesFunction = async (context) => {
  const path = joinPath(context.params)
  const isConfiguration = path === 'configuration'
  return proxy(context, `/up/${path}`, {
    origin: 'dynmap',
    ...(isConfiguration ? { cacheTtl: 300 } : {}),
  })
}
