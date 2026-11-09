import type { Env, PagesContext } from '../functions/_lib/types'
import { jsonError, proxy } from '../functions/_lib/proxy'
import { withSecurityHeaders } from '../functions/_lib/security'

/**
 * Точка входа Cloudflare Workers с Static Assets (`wrangler deploy`).
 *
 * Зачем: Pages Functions работают только в Pages-проектах. Если сайт
 * создаётся как Worker (а современный дашборд Cloudflare предлагает именно это),
 * тот же прокси подключается здесь, а статика отдаётся биндингом ASSETS.
 *
 * Маршрутизация:
 *   /api/*   → HYPEMAP_ORIGIN/api/*        (плагин, no-store)
 *   /up/*    → HYPEMAP_ORIGIN/up/*         (Dynmap; configuration кеш 5 минут)
 *   /tiles/* → HYPEMAP_ORIGIN/tiles/*      (тайлы, кеш 7 дней, при сбое — пиксель)
 *   всё остальное → статика из web/dist (SPA-фолбэк для /admin, /towns…)
 */
interface WorkerExecutionContext {
  waitUntil(promise: Promise<unknown>): void
  passThroughOnException(): void
}

async function fetch(request: Request, env: Env, ctx: WorkerExecutionContext): Promise<Response> {
  const url = new URL(request.url)

  const context: PagesContext<Env> = {
    request,
    env,
    params: {},
    data: {},
    waitUntil: (promise) => ctx.waitUntil(promise),
    next: () => {
      if (!env.ASSETS) throw new Error('Не настроен биндинг ASSETS')
      return env.ASSETS.fetch(request)
    },
  }

  if (url.pathname.startsWith('/api/')) {
    return proxy(context, url.pathname)
  }

  if (url.pathname.startsWith('/up/')) {
    const isConfiguration = url.pathname === '/up/configuration'
    return proxy(context, url.pathname, {
      origin: 'dynmap',
      ...(isConfiguration ? { cacheTtl: 300 } : {}),
    })
  }

  if (url.pathname.startsWith('/tiles/')) {
    const parsed = Number(env.TILES_CACHE_TTL || 604800)
    return proxy(context, url.pathname, {
      origin: 'dynmap',
      cacheTtl: Number.isFinite(parsed) && parsed > 0 ? parsed : 604800,
      fallback: 'pixel',
    })
  }

  if (!env.ASSETS) {
    return jsonError(
      500,
      'assets_not_configured',
      'Не найден биндинг ASSETS: проверьте [assets] в wrangler.toml и что `npm run build` создал web/dist',
    )
  }

  const response = await env.ASSETS.fetch(request)
  const extra = new Headers()
  // Vite хеширует имена бандлов — их можно кешировать навсегда
  if (url.pathname.startsWith('/assets/')) {
    extra.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else if (url.pathname === '/' || url.pathname.endsWith('.html')) {
    extra.set('Cache-Control', 'no-cache')
  }
  return withSecurityHeaders(response, extra)
}

export default { fetch }
