/**
 * Заголовки безопасности. Один источник правды и для Pages Functions
 * (functions/_middleware.ts), и для воркера (worker/index.ts).
 *
 * CSP строгий: всё общается только с тем же origin, поэтому Leaflet/Vue
 * не требуется ничего внешнего — но нужен 'unsafe-inline' для style,
 * потому что Leaflet выставляет inline-стили элементам карты.
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

export function withSecurityHeaders(response: Response, extra?: Headers): Response {
  const headers = new Headers(response.headers)
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  headers.set('Content-Security-Policy', CSP)
  if (extra) {
    extra.forEach((value, key) => headers.set(key, value))
  }
  // 204/304 не могут иметь тело
  const body = response.status === 204 || response.status === 304 ? null : response.body
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
