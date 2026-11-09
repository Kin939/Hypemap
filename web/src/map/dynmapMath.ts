import type { DynmapMapConfig, DynmapWorldConfig, MapDefinition, TownPoint } from '@/api/types'

/**
 * Геометрия Dynmap.
 *
 * Dynmap (начиная с 3.6) рендерит все карты через HD-пайплайн, поэтому в
 * /up/configuration для каждой карты приходят матрицы `worldtomap` и
 * `maptoworld` (3×3, row-major). Формулы ниже повторяют dynmap.js/hdmap.js и
 * LiveAtlas, чтобы игроки, маркеры и тайлы совпадали пиксель-в-пиксель.
 */

const FALLBACK_WORLD_TO_MAP = [4, 0, 0, 0, 0, 4, 0, 0, 0]
const FALLBACK_MAP_TO_WORLD = [0.25, 0, 0, 0, 0, 0, 0, 0.25, 0]

export function buildMapDefinition(world: DynmapWorldConfig, map: DynmapMapConfig): MapDefinition {
  const tileScale = map.tilescale || 0
  const tileSize = 128 << tileScale
  const nativeZoomLevels = Math.max(1, map.mapzoomout || 1)
  const extraZoomLevels = Math.max(0, map.mapzoomin || 0)
  const imageFormat = map['image-format'] || 'png'

  return {
    world: world.name,
    worldTitle: world.title || world.name,
    name: map.name,
    title: map.title || map.name,
    type: map.type || 'HDMapType',
    prefix: map.prefix || '',
    imageFormat,
    tileSize,
    nativeZoomLevels,
    extraZoomLevels,
    maxZoom: nativeZoomLevels + extraZoomLevels,
    minZoom: 0,
    nightAndDay: !!map.nightandday,
    background: map.background || '#0b1017',
    center: world.center || { x: 0, y: 64, z: 0 },
    projection: {
      worldToMap: (map.worldtomap as number[]) || FALLBACK_WORLD_TO_MAP,
      mapToWorld: (map.maptoworld as number[]) || FALLBACK_MAP_TO_WORLD,
      nativeZoomLevels,
      tileSize,
      prefix: map.prefix || '',
      imageFormat,
      nightAndDay: !!map.nightandday,
      maxZoom: nativeZoomLevels + extraZoomLevels,
      mapZoomIn: extraZoomLevels,
    },
  }
}

/** Мировые координаты (блоки) → LatLng для Leaflet (CRS.Simple). */
export function locationToLatLng(
  def: MapDefinition,
  location: { x: number; y: number; z: number },
): [number, number] {
  const p = def.projection
  const w = p.worldToMap
  const lat = w[3] * location.x + w[4] * location.y + w[5] * location.z
  const lng = w[0] * location.x + w[1] * location.y + w[2] * location.z
  const scale = 2 ** p.nativeZoomLevels
  return [-(p.tileSize - lat) / scale, lng / scale]
}

/** LatLng Leaflet → мировые координаты на заданном Y. */
export function latLngToLocation(
  def: MapDefinition,
  lat: number,
  lng: number,
  y = 64,
): { x: number; y: number; z: number } {
  const p = def.projection
  const m = p.mapToWorld
  const scale = 2 ** p.nativeZoomLevels
  const latMap = p.tileSize + lat * scale
  const lngMap = lng * scale
  const x = m[0] * lngMap + m[1] * latMap + m[2] * y
  const z = m[6] * lngMap + m[7] * latMap + m[8] * y
  return { x: round2(x), y, z: round2(z) }
}

/** Полигон поселения → массив LatLng с учётом Y-уровня зоны. */
export function polygonToLatLngs(def: MapDefinition, polygon: TownPoint[], y: number): [number, number][] {
  const out: [number, number][] = []
  for (const point of polygon) {
    out.push(locationToLatLng(def, { x: point.x, y, z: point.z }))
  }
  return out
}

/**
 * URL тайла в формате Dynmap:
 *   tiles/<world>/<prefix><_day>/<x >> 5>_<y >> 5>/<zz.._><x>_<y>.<fmt>
 * где x/y — индексы в «нативном» пиксельном пространстве (128 px на тайл).
 */
export function tileUrl(
  def: MapDefinition,
  coords: { x: number; y: number; z: number },
  isDay: boolean,
  base = '',
): string {
  const zoomOutLevel = Math.max(0, def.nativeZoomLevels - coords.z)
  const scale = 2 ** zoomOutLevel
  const x = scale * coords.x
  const y = -(scale * coords.y)
  const scaledX = Math.floor(x / 32)
  const scaledY = Math.floor(y / 32)
  const zoomPrefix = 'z'.repeat(zoomOutLevel) + (zoomOutLevel > 0 ? '_' : '')
  const nightDay = def.nightAndDay && isDay ? '_day' : ''
  const prefix = base.replace(/\/+$/, '')
  return (
    `${prefix}/tiles/${encodeURIComponent(def.world)}/${def.prefix}${nightDay}` +
    `/${scaledX}_${scaledY}/${zoomPrefix}${x}_${y}.${def.imageFormat}`
  )
}

/** Параметры L.TileLayer, соответствующие конфигурации Dynmap. */
export function tileLayerOptions(def: MapDefinition) {
  return {
    tileSize: def.tileSize,
    minZoom: def.minZoom,
    maxZoom: def.maxZoom,
    maxNativeZoom: def.nativeZoomLevels,
    minNativeZoom: 0,
    keepBuffer: 3,
    updateWhenIdle: false,
    detectRetina: false,
    // прозрачная заглушка вместо «битой» иконки
    errorTileUrl:
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  }
}

function round2(value: number): number {
  return Math.round(value * 10) / 10
}
