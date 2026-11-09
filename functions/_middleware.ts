import type { PagesFunction } from './_lib/types'
import { diag } from './_lib/diag'
import { withSecurityHeaders } from './_lib/security'

/**
 * Заголовки безопасности для статики и API (режим Cloudflare Pages).
 * В режиме Workers то же самое делает `worker/index.ts` через `_lib/security.ts`.
 */
export const onRequest: PagesFunction = async (context) => {
  // `/_diag` есть только в воркере — здесь повторяем, чтобы Pages-режим не отдавал 404.
  if (new URL(context.request.url).pathname === '/_diag') {
    return diag(context.env)
  }
  const response = await context.next()
  return withSecurityHeaders(response)
}
