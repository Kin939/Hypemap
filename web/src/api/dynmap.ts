import { request } from './http'
import type { DynmapConfiguration, DynmapWorldUpdate } from './types'

/**
 * Dynmap отдаёт состояние через обычные JSON-эндпоинты:
 *   /up/configuration          — миры, карты, геометрия проекции, тайлы
 *   /up/world/<world>/<ts>     — игроки и дельта-события с отметки ts
 * В продакшене всё это проксируется Pages Function (same-origin), поэтому
 * относительные пути работают без CORS.
 */
const DYNMAP_BASE = (import.meta.env.VITE_DYNMAP_BASE || '').replace(/\/+$/, '')

export async function fetchConfiguration(signal?: AbortSignal): Promise<DynmapConfiguration> {
  const response = await fetch(`${DYNMAP_BASE}/up/configuration`, { signal, credentials: 'same-origin' })
  if (!response.ok) {
    throw new Error(`Dynmap /up/configuration вернул HTTP ${response.status}`)
  }
  return (await response.json()) as DynmapConfiguration
}

export async function fetchWorldUpdate(
  world: string,
  timestamp: number,
  signal?: AbortSignal,
): Promise<DynmapWorldUpdate> {
  const response = await fetch(
    `${DYNMAP_BASE}/up/world/${encodeURIComponent(world)}/${timestamp}`,
    { signal, credentials: 'same-origin' },
  )
  if (!response.ok) {
    throw new Error(`Dynmap /up/world вернул HTTP ${response.status}`)
  }
  return (await response.json()) as DynmapWorldUpdate
}

export function dynmapBase(): string {
  return DYNMAP_BASE
}

/** Иконка-голова игрока, которую рисует сам Dynmap (без внешних CDN). */
export function playerFaceUrl(name: string, size = 32): string {
  return `${DYNMAP_BASE}/tiles/faces/${size}x${size}/${encodeURIComponent(name)}.png`
}
