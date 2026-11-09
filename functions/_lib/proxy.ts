import type { Env, PagesContext } from './types'

/** Заголовки, которые имеет смысл пробрасывать на origin (и обратно не отдавать). */
const FORWARD_REQUEST_HEADERS = [
  'accept',
  'accept-language',
  'content-type',
  'authorization',
  'cookie',
  'cf-access-jwt-assertion',
  'cf-access-authenticated-user-email',
  'x-requested-with',
  'range',
  'if-none-match',
]

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'upgrade',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
])

const TRANSPARENT_PIXEL = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
  0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a,
  0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4,
  0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

export type OriginKind = 'api' | 'dynmap'

/**
 * Адрес origin'а. Для Dynmap можно указать отдельный (другой порт/хост) —
 * это нужно, когда сервер стоит на хостинге без Cloudflare Tunnel.
 */
export function originOf(env: Env, kind: OriginKind = 'api'): string {
  const raw = kind === 'dynmap' ? env.HYPEMAP_DYNMAP_ORIGIN || env.HYPEMAP_ORIGIN : env.HYPEMAP_ORIGIN
  return (raw || '').trim().replace(/\/+$/, '')
}

export function jsonError(status: number, code: string, message: string, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  })
}

export interface ProxyOptions {
  /** Кешировать GET-ответы через Cache API (тайлы, /up/configuration). */
  cacheTtl?: number
  /** Что вернуть, если origin недоступен. */
  fallback?: 'pixel' | 'json'
  /** Какой origin использовать: плагин (api) или Dynmap. */
  origin?: OriginKind
}

/**
 * Проксирует запрос на туннель (Minecraft-сервер) и нормализует ответ.
 * Браузер всегда общается с одним origin (Pages), поэтому CORS не нужен.
 */
export async function proxy(
  context: PagesContext<Env>,
  pathname: string,
  options: ProxyOptions = {},
): Promise<Response> {
  const { request, env } = context
  const kind = options.origin ?? 'api'
  const origin = originOf(env, kind)

  if (!origin) {
    return jsonError(
      500,
      'origin_not_configured',
      kind === 'dynmap'
        ? 'Не задан HYPEMAP_ORIGIN (или HYPEMAP_DYNMAP_ORIGIN) — адрес сервера с Dynmap'
        : 'Не задан HYPEMAP_ORIGIN — адрес плагина Hypemap',
    )
  }

  const incoming = new URL(request.url)
  const targetUrl = `${origin}${pathname}${incoming.search}`
  const cacheable = options.cacheTtl !== undefined && (request.method === 'GET' || request.method === 'HEAD')
  const cache = caches.default
  const cacheKey = new Request(new URL(`${pathname}${incoming.search}`, incoming.origin).toString(), {
    method: 'GET',
  })

  if (cacheable) {
    const hit = await cache.match(cacheKey)
    if (hit) {
      const response = new Response(hit.body, hit)
      response.headers.set('x-hypemap-cache', 'HIT')
      return response
    }
  }

  const headers = new Headers()
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name)
    if (value) headers.set(name, value)
  }
  const clientIp = request.headers.get('cf-connecting-ip')
  if (clientIp) headers.set('x-forwarded-for', clientIp)
  if (env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET) {
    headers.set('CF-Access-Client-Id', env.ACCESS_CLIENT_ID)
    headers.set('CF-Access-Client-Secret', env.ACCESS_CLIENT_SECRET)
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = request.body
    // @ts-expect-error — нужно для стриминга тела в Workers
    init.duplex = 'half'
  }

  let upstream: Response
  try {
    upstream = await fetch(targetUrl, init)
  } catch (error) {
    if (options.fallback === 'pixel') {
      return new Response(TRANSPARENT_PIXEL, {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=60' },
      })
    }
    return jsonError(502, 'upstream_unreachable', `Туннель недоступен: ${(error as Error).message}`)
  }

  const responseHeaders = new Headers()
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) responseHeaders.set(key, value)
  })

  if (pathname.startsWith('/api/')) {
    responseHeaders.set('cache-control', 'no-store')
  } else if (options.cacheTtl !== undefined) {
    responseHeaders.set('cache-control', `public, max-age=${options.cacheTtl}, immutable`)
    responseHeaders.set('x-hypemap-cache', 'MISS')
  }

  const response = new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  })

  if (cacheable && upstream.ok) {
    context.waitUntil(cache.put(cacheKey, response.clone()))
  }

  return response
}

/** Собирает путь из catch-all параметра Pages (`[[path]]`). */
export function joinPath(params: Record<string, string | string[]>): string {
  const value = params.path
  if (!value) return ''
  if (Array.isArray(value)) return value.join('/')
  return value
}
