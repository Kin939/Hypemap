import type { Env } from './types'
import { originOf, originWarning } from './proxy'

/**
 * `/_diag` — страница самодиагностики для деплоя.
 *
 * Зачем: при настройке (особенно на хостинге с панелью без SSH) самое сложное —
 * понять, где именно порвалось: переменная в Cloudflare, порт в панели, `bind`
 * в плагине или `webserver-port` у Dynmap. Здесь сайт сам проверяет оба origin'а
 * и возвращает короткий список того, что не так.
 *
 * Ничего секретного не отдаёт: только адреса из переменных и HTTP-статусы.
 */

interface Probe {
  origin: string
  url: string
  status: number | null
  ok: boolean
  error?: string
}

const TIMEOUT_MS = 6000

async function probe(origin: string, path: string): Promise<Probe> {
  if (!origin) return { origin: '', url: '', status: null, ok: false, error: 'переменная не задана' }
  const url = `${origin}${path}`
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: '*/*' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    // Тело не нужно: достаточно кода ответа
    if (response.body) await response.body.cancel().catch(() => undefined)
    return { origin, url, status: response.status, ok: response.ok }
  } catch (error) {
    const message = (error as Error)?.name === 'TimeoutError'
      ? `нет ответа за ${TIMEOUT_MS / 1000} с`
      : String((error as Error)?.message || error)
    return { origin, url, status: null, ok: false, error: message }
  }
}

function bluemapHint(bluemap: Probe): string[] {
  if (!bluemap.origin) return []
  if (bluemap.status === null) {
    return [
      `BlueMap не отвечает (${bluemap.error}). Проверьте, что плагин BlueMap запущен ` +
      'и веб-сервер слушает порт из HYPEMAP_BLUEMAP_ORIGIN.',
    ]
  }
  if (!bluemap.ok) {
    return [`BlueMap ответил HTTP ${bluemap.status} на /settings.json — проверьте адрес и порт.`]
  }
  return []
}

function hintsFor(api: Probe, dynmap: Probe, bluemap?: Probe): string[] {
  const hints: string[] = []

  // Про порт предупреждаем только когда проверка реально не прошла:
  // если origin ответил, значит порт рабочий (например, локальный wrangler dev).
  if (!api.ok) {
    const warning = originWarning(api.origin)
    if (warning) hints.push(warning)
  }
  const bluemapWorks = bluemap?.ok === true
  if (!dynmap.ok && !bluemapWorks) {
    const warning = originWarning(dynmap.origin)
    if (warning) hints.push(warning)
  }

  if (!api.origin) {
    hints.push(
      'Не задан HYPEMAP_ORIGIN. Cloudflare → Workers & Pages → проект → Settings → ' +
      'Variables and Secrets → добавьте адрес плагина (HTTPS-адрес из rProxy панели или туннеля).',
    )
  } else if (api.status === null) {
    hints.push(
      `Плагин не отвечает (${api.error}). Проверьте: сервер запущен, в plugins/Hypemap/config.yml ` +
      'стоит bind: 0.0.0.0, порт открыт в панели и совпадает с адресом в HYPEMAP_ORIGIN. ' +
      'Если в адресе порт вроде 25960 — Cloudflare на него не сходит: нужен HTTPS-адрес (rProxy/туннель).',
    )
  } else if (api.status === 404) {
    hints.push(
      'Плагин ответил 404 — адрес ведёт не на Hypemap (или путь /api/health не проксируется). ' +
      'Проверьте, что порт в переменной — порт плагина, а не Dynmap.',
    )
  } else if (!api.ok) {
    hints.push(`Плагин ответил HTTP ${api.status} на /api/health — смотрите консоль сервера.`)
  }

  if (!dynmap.ok && !bluemapWorks) {
    if (!dynmap.origin) {
      hints.push('Dynmap: не задан ни HYPEMAP_DYNMAP_ORIGIN, ни HYPEMAP_ORIGIN — тайлы не загрузятся.')
    } else if (dynmap.status === null) {
      hints.push(
        `Dynmap не отвечает (${dynmap.error}). Проверьте webserver-port в ` +
        'plugins/dynmap/configuration.txt и соответствующий порт в панели. ' +
        'Если в адресе порт вроде 25814 — Cloudflare на него не сходит: нужен HTTPS-адрес.',
      )
    } else {
      hints.push(
        `Dynmap ответил HTTP ${dynmap.status} на /up/configuration — обычно это неверный ` +
        'webserver-port или адрес другого сервиса.',
      )
    }
  }

  // BlueMap — альтернативный рендерер: если он настроен, Dynmap не обязателен.
  const rendererHints = bluemap ? bluemapHint(bluemap) : []
  hints.push(...rendererHints)
  if (bluemap?.ok) {
    hints.push('BlueMap отвечает — тайлы и игроки будут браться из него.')
  }

  const rendererOk = api.ok && (dynmap.ok || bluemapWorks)
  if (rendererOk && hints.every((hint) => !/не отвечает|HTTP /.test(hint))) {
    hints.push('Прокси настроен верно: плагин и рендерер карты отвечают.')
  } else if (hints.length === 0) {
    hints.push('Адреса не заданы — см. docs/DEPLOY.md §5.')
  }
  return Array.from(new Set(hints))
}

export async function diag(env: Env): Promise<Response> {
  const apiOrigin = originOf(env, 'api')
  const dynmapOrigin = originOf(env, 'dynmap')
  const blueMapOrigin = originOf(env, 'bluemap')
  const [api, dynmap, bluemap] = await Promise.all([
    probe(apiOrigin, '/api/health'),
    dynmapOrigin ? probe(dynmapOrigin, '/up/configuration') : Promise.resolve(undefined),
    blueMapOrigin ? probe(blueMapOrigin, '/settings.json') : Promise.resolve(undefined),
  ])

  const renderer = bluemap?.ok ? 'bluemap' : dynmap?.ok ? 'dynmap' : undefined
  const payload = {
    ok: api.ok && Boolean(dynmap?.ok || bluemap?.ok),
    renderer,
    origins: { api, dynmap, bluemap },
    dynmap_origin_is_fallback: !env.HYPEMAP_DYNMAP_ORIGIN,
    tiles_cache_ttl: Number(env.TILES_CACHE_TTL || 604800),
    access_service_token: Boolean(env.ACCESS_CLIENT_ID && env.ACCESS_CLIENT_SECRET),
    hints: hintsFor(api, dynmap as Probe, bluemap),
  }

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}
