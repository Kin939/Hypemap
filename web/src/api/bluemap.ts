/**
 * BlueMap: HTTP-контракт.
 *
 * BlueMap отдаёт (всё относительно своего корня, у нас — `/bluemap/`):
 *   settings.json                     — список карт: { maps: [{ id, name, sorting }] }
 *   maps/<id>/settings.json           — параметры карты: lowres { tileSize, lodFactor, lodCount }, startPos
 *   maps/<id>/tiles/<lod>/x../z...png — тайлы (от lod 1, lod 0 — hires, нам не нужен)
 *   maps/<id>/live/players.json       — игроки онлайн
 *
 * Hypemap показывает карту как обычный top-down слой, поэтому берёт только lowres-тайлы.
 */

export const BLUEMAP_BASE = '/bluemap'

export interface BlueMapMapEntry {
  id: string
  name?: string
  sorting?: number
}

export interface BlueMapSettings {
  maps?: BlueMapMapEntry[]
}

export interface BlueMapSize {
  x: number
  z: number
}

/** Параметры lowres-сетки конкретной карты (как их отдаёт сам BlueMap). */
export interface BlueMapGrid {
  /** Сторона тайла в пикселях и в блоках на lod 1 (обычно 500). */
  tileSize: number
  /** Во сколько раз каждый следующий lod крупнее по площади (обычно 5). */
  lodFactor: number
  /** Сколько всего lod-уровней (обычно 3). */
  lodCount: number
}

export interface BlueMapMapSettings {
  name?: string
  sorting?: number
  lowres?: {
    tileSize?: BlueMapSize | number
    lodFactor?: number
    lodCount?: number
  }
  startPos?: { x?: number; z?: number }
  flatView?: boolean
  perspectiveView?: boolean
}

export interface BlueMapPlayer {
  uuid?: string
  name: string
  foreign?: boolean
  position?: { x: number; y: number; z: number }
  rotation?: { yaw?: number; pitch?: number; roll?: number }
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BLUEMAP_BASE}${path}`, { signal, credentials: 'same-origin' })
  if (!response.ok) throw new Error(`BlueMap ${path} → HTTP ${response.status}`)
  return (await response.json()) as T
}

export function fetchBlueMapSettings(signal?: AbortSignal): Promise<BlueMapSettings> {
  return getJson<BlueMapSettings>('/settings.json', signal)
}

export function fetchBlueMapMapSettings(id: string, signal?: AbortSignal): Promise<BlueMapMapSettings> {
  return getJson<BlueMapMapSettings>(`/maps/${encodeURIComponent(id)}/settings.json`, signal)
}

export function fetchBlueMapPlayers(id: string, signal?: AbortSignal): Promise<BlueMapPlayer[]> {
  return getJson<BlueMapPlayer[]>(`/maps/${encodeURIComponent(id)}/live/players.json`, signal)
}

/** Нормализует lowres-настройки: BlueMap может отдать tileSize числом или объектом. */
export function toGrid(settings: BlueMapMapSettings): BlueMapGrid {
  const lowres = settings.lowres ?? {}
  const raw = lowres.tileSize
  const tileSize =
    typeof raw === 'number' ? raw : Math.max(raw?.x ?? 0, raw?.z ?? 0) || 500
  return {
    tileSize: tileSize > 0 ? tileSize : 500,
    lodFactor: lowres.lodFactor && lowres.lodFactor > 1 ? lowres.lodFactor : 5,
    lodCount: lowres.lodCount && lowres.lodCount > 0 ? lowres.lodCount : 3,
  }
}
