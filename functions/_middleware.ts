import type { PagesFunction } from './_lib/types'
import { withSecurityHeaders } from './_lib/security'

/**
 * Заголовки безопасности для статики и API (режим Cloudflare Pages).
 * В режиме Workers то же самое делает `worker/index.ts` через `_lib/security.ts`.
 */
export const onRequest: PagesFunction = async (context) => {
  const response = await context.next()
  return withSecurityHeaders(response)
}
