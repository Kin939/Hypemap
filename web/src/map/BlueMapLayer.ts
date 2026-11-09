import L from 'leaflet'
import type { BlueMapGrid } from '@/api/bluemap'
import { blueMapTileUrl, pickLod, tileBlocks } from './bluemapMath'

interface BlueMapLayerOptions extends L.GridLayerOptions {
  mapId: string
  grid: BlueMapGrid
  onError?: (message: string) => void
}

const TILE_PIXELS = 256

/**
 * Слой тайлов BlueMap.
 *
 * BlueMap режет карту на lod-уровни с шагом `lodFactor` (обычно 5), а Leaflet
 * умеет только степени двойки. Поэтому слой не отдаёт URL напрямую: для каждого
 * тайла Leaflet он рисует canvas 256×256, куда копирует нужный кусок
 * соответствующего lod-тайла BlueMap (масштаб считается по блокам).
 *
 * Соответствие координат: `lat = -z`, `lng = x`, один map unit = один блок.
 */
export class BlueMapLayer extends L.GridLayer {
  private readonly mapId: string
  private readonly grid: BlueMapGrid
  private readonly onError?: (message: string) => void
  private readonly images = new Map<string, Promise<HTMLImageElement | null>>()
  private reportedError = false

  constructor(options: BlueMapLayerOptions) {
    super({
      tileSize: TILE_PIXELS,
      minZoom: -6,
      maxZoom: 4,
      noWrap: true,
      keepBuffer: 2,
      updateWhenIdle: false,
      updateWhenZooming: true,
      ...options,
    })
    this.mapId = options.mapId
    this.grid = options.grid
    if (options.onError) this.onError = options.onError
  }

  override createTile(coords: L.Coords): HTMLElement {
    const canvas = document.createElement('canvas')
    canvas.width = TILE_PIXELS
    canvas.height = TILE_PIXELS
    const ctx = canvas.getContext('2d')
    if (!ctx) return canvas

    // Сколько блоков покрывает тайл Leaflet на этом зуме: 256 px / 2^zoom
    const blocksPerTile = TILE_PIXELS / Math.pow(2, coords.z)
    const x0 = coords.x * blocksPerTile
    const z0 = coords.y * blocksPerTile

    const lod = pickLod(this.grid, blocksPerTile)
    const blocksPerBlueTile = tileBlocks(this.grid, lod)
    const pxPerBlock = TILE_PIXELS / blocksPerTile

    const firstX = Math.floor(x0 / blocksPerBlueTile)
    const lastX = Math.floor((x0 + blocksPerTile) / blocksPerBlueTile - 1e-9)
    const firstZ = Math.floor(z0 / blocksPerBlueTile)
    const lastZ = Math.floor((z0 + blocksPerTile) / blocksPerBlueTile - 1e-9)

    for (let tileX = firstX; tileX <= lastX; tileX++) {
      for (let tileZ = firstZ; tileZ <= lastZ; tileZ++) {
        const url = blueMapTileUrl(this.mapId, lod, tileX, tileZ)
        void this.loadImage(url).then((image) => {
          if (!image) return
          const dx = (tileX * blocksPerBlueTile - x0) * pxPerBlock
          const dz = (tileZ * blocksPerBlueTile - z0) * pxPerBlock
          const size = blocksPerBlueTile * pxPerBlock
          try {
            ctx.drawImage(image, 0, 0, image.width, image.height, dx, dz, size, size)
          } catch {
            /* тайл мог быть выгружен при быстром зуме — это нормально */
          }
        })
      }
    }

    return canvas
  }

  private loadImage(url: string): Promise<HTMLImageElement | null> {
    const cached = this.images.get(url)
    if (cached) return cached

    const promise = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => resolve(image)
      image.onerror = () => {
        // 404 — тайл ещё не отрендерен, это не ошибка сервера
        resolve(null)
      }
      image.src = url
    })

    this.images.set(url, promise)
    // Не копим бесконечно: чистим кеш при разрастании
    if (this.images.size > 600) {
      const firstKey = this.images.keys().next().value
      if (firstKey) this.images.delete(firstKey)
    }
    return promise
  }

  /** Сообщить наверх, что тайлы вообще не грузятся (один раз). */
  reportBroken(): void {
    if (this.reportedError) return
    this.reportedError = true
    this.onError?.('Не удалось загрузить тайлы BlueMap')
  }
}
