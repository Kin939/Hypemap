import type { MapDefinition } from '@/api/types'
import { BLUEMAP_BASE, type BlueMapGrid, type BlueMapMapEntry, type BlueMapMapSettings } from '@/api/bluemap'

/**
 * Геометрия BlueMap.
 *
 * BlueMap использует lod-уровни с шагом `lodFactor` (по умолчанию 5, то есть
 * не степень двойки), поэтому тайлы нельзя отдать в Leaflet напрямую — их
 * «сшивает» отдельный слой (см. `BlueMapLayer.ts`). Здесь собраны формулы:
 *
 *   размер тайла в блоках:  tileSize * lodFactor^(lod-1)
 *   lod 1 → 1 px = 1 блоку, lod 2 → 1 px = 5 блоков, lod 3 → 1 px = 25 блоков
 *
 * Координаты: X мира → вправо, Z мира → вниз (север сверху). Leaflet-широта
 * отрицательная: `lat = -z`, `lng = x`, поэтому один «map unit» = один блок.
 */

/** Путь BlueMap: `x3/z1/2` — цифры разложены по каталогам, минус идёт первым. */
function splitNumberToPath(value: number): string {
  let rest = value
  let path = ''
  if (rest < 0) {
    rest = -rest
    path += '-'
  }
  const digits = String(rest)
  for (const digit of digits) path += `${digit}/`
  return path
}

export function pathFromCoords(x: number, z: number): string {
  const joined = `x${splitNumberToPath(x)}z${splitNumberToPath(z)}`
  return joined.slice(0, -1)
}

export function blueMapTileUrl(mapId: string, lod: number, tileX: number, tileZ: number): string {
  return `${BLUEMAP_BASE}/maps/${encodeURIComponent(mapId)}/tiles/${lod}/${pathFromCoords(tileX, tileZ)}.png`
}

/** Сколько блоков покрывает один тайл на данном lod. */
export function tileBlocks(grid: BlueMapGrid, lod: number): number {
  return grid.tileSize * Math.pow(grid.lodFactor, Math.max(0, lod - 1))
}

/** Разрешение картинки lod-тайла: пикселей на блок. */
export function tilePixelsPerBlock(grid: BlueMapGrid, lod: number): number {
  return grid.tileSize / tileBlocks(grid, lod)
}

/**
 * Какой lod брать для тайла, который кроет `blocksPerTile` блоков на 256 px,
 * то есть требует разрешения `256 / blocksPerTile` px/блок.
 * Берём самый грубый lod, у которого разрешения ещё хватает (минимум запросов).
 */
export function pickLod(grid: BlueMapGrid, blocksPerTile: number): number {
  if (!Number.isFinite(blocksPerTile) || blocksPerTile <= 0) return 1
  const needed = 256 / blocksPerTile
  let chosen = 1
  for (let lod = 1; lod <= grid.lodCount; lod++) {
    if (tilePixelsPerBlock(grid, lod) >= needed) chosen = lod
    else break
  }
  return chosen
}

/**
 * Синтетическое описание карты, чтобы полигоны поселений, игроки и клики
 * работали через общий код (`locationToLatLng`): `lat = -z`, `lng = x`.
 */
export function blueMapMapDefinition(
  entry: BlueMapMapEntry,
  grid: BlueMapGrid,
  settings: BlueMapMapSettings,
): MapDefinition {
  const title = settings.name || entry.name || entry.id
  return {
    world: entry.id,
    worldTitle: title,
    name: entry.id,
    title,
    type: 'BlueMap',
    prefix: '',
    imageFormat: 'png',
    tileSize: 0,
    nativeZoomLevels: 0,
    extraZoomLevels: 0,
    maxZoom: 4,
    minZoom: -6,
    nightAndDay: false,
    background: '#0b1017',
    center: { x: settings.startPos?.x ?? 0, y: 64, z: settings.startPos?.z ?? 0 },
    projection: {
      // lat = -z, lng = x — см. dynmapMath.locationToLatLng
      worldToMap: [1, 0, 0, 0, 0, -1, 0, 0, 0],
      mapToWorld: [1, 0, 0, 0, 0, 0, 0, -1, 0],
      nativeZoomLevels: 0,
      tileSize: 0,
      prefix: '',
      imageFormat: 'png',
      nightAndDay: false,
      maxZoom: 4,
      mapZoomIn: 0,
    },
    renderer: 'bluemap',
    blueMap: { id: entry.id, grid },
  }
}
