import type { PagesFunction } from './_lib/types'

/**
 * Заголовки безопасности для статики и API.
 * CSP здесь строгий: все запросы идут на тот же origin (Pages),
 * Leaflet/Vue не требуют eval, но требуют inline-style.
 */
const CSP = [
  "default-src 'self'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

export const onRequest: PagesFunction = async (context) => {
  const response = await context.next()
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  headers.set('Content-Security-Policy', CSP)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
