import type { PagesFunction } from '../_lib/types'
import { joinPath, proxy } from '../_lib/proxy'

/**
 * /api/* → плагин Hypemap (порт 8800 на сервере, через Cloudflare Tunnel).
 * Ответы не кешируются: админка должна видеть свежие данные сразу.
 */
export const onRequest: PagesFunction = async (context) => {
  const path = joinPath(context.params)
  return proxy(context, `/api/${path}`)
}
