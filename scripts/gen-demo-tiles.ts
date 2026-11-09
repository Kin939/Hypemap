/**
 * Генератор демо-тайлов для локального стенда (mock/server.mjs).
 *
 * Рисует процедурный «мир» 512×512 блоков (4 px/блок), нарезает его в тайлы
 * по схеме Dynmap и складывает в web/mock/tiles/world/<prefix>/...
 *
 * Запуск:  cd web && npm run tiles
 * Реальные тайлы на сервере рисует Dynmap — этот файл нужен только для
 * превью и тестов без Minecraft.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tileUrl } from '../web/src/map/dynmapMath'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_ROOT = resolve(__dirname, '../web/mock/tiles')

const BLOCKS = 512
const PX_PER_BLOCK = 4
const SIZE = BLOCKS * PX_PER_BLOCK
const TILE = 128
const NATIVE_ZOOM = 3
/**
 * Dynmap кладёт мир не в начало пиксельной плоскости: точка (0,0) мира
 * попадает в native-пиксель (0, tileSize) — см. hdmap.js, fromLatLngToLocation.
 * Поэтому базовое изображение выше мира на один тайл.
 */
const BASE_W = SIZE
const BASE_H = SIZE + TILE
const OFFSET_Y = TILE

const WORLD = {
  world: 'world',
  worldTitle: 'Мир',
  name: 'flat',
  title: 'Поверхность',
  type: 'HDMapType',
  prefix: 'flat',
  imageFormat: 'png',
  tileSize: TILE,
  nativeZoomLevels: NATIVE_ZOOM,
  extraZoomLevels: 0,
  maxZoom: NATIVE_ZOOM,
  minZoom: 0,
  nightAndDay: false,
  background: '#0b1017',
  center: { x: 256, y: 64, z: 256 },
  projection: {
    // iso_S_90_lowres: tileX = 4x, tileY = -4z (север сверху, восток справа)
    worldToMap: [4, 0, 0, 0, 0, -4, 0, 1, 0],
    mapToWorld: [0.25, 0, 0, 0, 0, 1, 0, -0.25, 0],
    nativeZoomLevels: NATIVE_ZOOM,
    tileSize: TILE,
    prefix: 'flat',
    imageFormat: 'png',
    nightAndDay: false,
    maxZoom: NATIVE_ZOOM,
    mapZoomIn: 0,
  },
}

/* ------------------------------------------------------------------ шум ---- */

function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 2147483647
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = smooth(x - xi)
  const yf = smooth(y - yi)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return (a * (1 - xf) + b * xf) * (1 - yf) + (c * (1 - xf) + d * xf) * yf
}

function fbm(x: number, y: number, seed: number, octaves = 5): number {
  let amp = 1
  let freq = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise(x * freq, y * freq, seed + i * 31) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

/* --------------------------------------------------------------- палитра ---- */

type Rgb = [number, number, number]

const PALETTE: Record<string, Rgb> = {
  deep: [24, 48, 78],
  water: [38, 84, 120],
  shallow: [62, 124, 156],
  sand: [214, 199, 158],
  grass: [95, 152, 82],
  grassLight: [118, 172, 96],
  forest: [64, 118, 66],
  rock: [136, 143, 148],
  rockDark: [108, 114, 120],
  snow: [230, 238, 244],
  road: [176, 160, 126],
  wall: [170, 139, 110],
  roofRed: [172, 82, 66],
  roofBlue: [82, 108, 150],
  roofGreen: [96, 138, 96],
  plaza: [196, 182, 150],
}

const VILLAGES = [
  { x: 136, z: 136, radius: 34 },
  { x: 340, z: 310, radius: 38 },
  { x: 428, z: 128, radius: 32 },
]

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

function distanceToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax
  const dz = bz - az
  const lengthSq = dx * dx + dz * dz || 1
  let t = ((px - ax) * dx + (pz - az) * dz) / lengthSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + dx * t
  const cz = az + dz * t
  return Math.hypot(px - cx, pz - cz)
}

/* ---------------------------------------------------------------- карта ---- */

function buildBlockMap(): Rgb[][] {
  // высоты и «лес» считаем в координатах блоков
  const map: Rgb[][] = []
  for (let z = 0; z < BLOCKS; z += 1) {
    const row: Rgb[] = []
    for (let x = 0; x < BLOCKS; x += 1) {
      const nx = x / 120
      const nz = z / 120
      let height = fbm(nx, nz, 7, 5)
      const detail = fbm(nx * 3.2, nz * 3.2, 19, 3)
      height = height * 0.78 + detail * 0.22

      // горный хребет на востоке
      const ridge = Math.max(0, 1 - Math.abs(x - 470) / 90) * 0.22
      height += ridge

      // река: синусоида с севера на юг
      const riverX = 250 + Math.sin(z / 46) * 34 + Math.sin(z / 17) * 7
      const riverDist = Math.abs(x - riverX)
      if (riverDist < 11 && z > 40) {
        height = Math.min(height, 0.24 + riverDist / 90)
      }

      // озеро на юго-западе
      const lake = Math.hypot(x - 92, z - 388) / 62
      if (lake < 1) height = Math.min(height, 0.2 + lake * 0.14)

      let color: Rgb
      if (height < 0.2) color = PALETTE.deep
      else if (height < 0.27) color = PALETTE.water
      else if (height < 0.32) color = PALETTE.shallow
      else if (height < 0.37) color = PALETTE.sand
      else if (height < 0.62) {
        const forest = fbm(nx * 2.4 + 11, nz * 2.4 + 3, 41, 3)
        color = forest > 0.56 ? PALETTE.forest : mix(PALETTE.grass, PALETTE.grassLight, detail)
      } else if (height < 0.72) color = mix(PALETTE.grass, PALETTE.rock, 0.55)
      else if (height < 0.82) color = mix(PALETTE.rockDark, PALETTE.rock, detail)
      else color = PALETTE.snow

      row.push(color)
    }
    map.push(row)
  }

  // дороги между поселениями
  for (let i = 0; i < VILLAGES.length; i += 1) {
    const a = VILLAGES[i]
    const b = VILLAGES[(i + 1) % VILLAGES.length]
    for (let z = 0; z < BLOCKS; z += 1) {
      for (let x = 0; x < BLOCKS; x += 1) {
        const dist = distanceToSegment(x, z, a.x, a.z, b.x, b.z)
        const wobble = Math.sin((x + z) / 9) * 1.5
        if (Math.abs(dist - 0) < 2.2 + wobble * 0.3) {
          map[z][x] = mix(map[z][x], PALETTE.road, 0.85)
        }
      }
    }
  }

  // поселения: площадь, дома, крыши
  VILLAGES.forEach((village, index) => {
    const roof = [PALETTE.roofRed, PALETTE.roofBlue, PALETTE.roofGreen][index % 3]
    for (let z = 0; z < BLOCKS; z += 1) {
      for (let x = 0; x < BLOCKS; x += 1) {
        const dist = Math.hypot(x - village.x, z - village.z)
        if (dist > village.radius) continue
        if (dist < village.radius * 0.55) {
          map[z][x] = mix(map[z][x], PALETTE.plaza, 0.75)
        }
        // кварталы домов
        const cell = 9
        const cx = Math.floor((x - village.x + 4) / cell)
        const cz = Math.floor((z - village.z + 4) / cell)
        const inCellX = (x - village.x + 4) % cell
        const inCellZ = (z - village.z + 4) % cell
        if (dist < village.radius * 0.92 && inCellX >= 2 && inCellX <= 6 && inCellZ >= 2 && inCellZ <= 6) {
          const inside = inCellX === 2 || inCellX === 6 || inCellZ === 2 || inCellZ === 6
          const roofJitter = hash2(cx, cz, index + 3)
          if (inside) {
            map[z][x] = mix(roof, [0, 0, 0], roofJitter * 0.25)
          } else if (inCellX === 4 && inCellZ === 4) {
            map[z][x] = PALETTE.plaza
          } else {
            map[z][x] = mix(PALETTE.wall, [0, 0, 0], roofJitter * 0.3)
          }
        }
      }
    }
  })

  return map
}

/* ------------------------------------------------------------ растеризация -- */

function renderBase(blockMap: Rgb[][]): Uint8Array {
  const image = new Uint8Array(BASE_W * BASE_H * 3)
  for (let bz = 0; bz < BLOCKS; bz += 1) {
    for (let bx = 0; bx < BLOCKS; bx += 1) {
      const base = blockMap[bz][bx]
      for (let py = 0; py < PX_PER_BLOCK; py += 1) {
        for (let px = 0; px < PX_PER_BLOCK; px += 1) {
          const x = bx * PX_PER_BLOCK + px
          const y = OFFSET_Y + bz * PX_PER_BLOCK + py
          const offset = (y * BASE_W + x) * 3
          // лёгкая «пиксельная» текстура
          const noise = (hash2(bx * 4 + px, bz * 4 + py, 99) - 0.5) * 14
          image[offset] = clamp(base[0] + noise)
          image[offset + 1] = clamp(base[1] + noise)
          image[offset + 2] = clamp(base[2] + noise)
        }
      }
    }
  }
  return image
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function cropResize(
  image: Uint8Array,
  left: number,
  top: number,
  size: number,
  target: number,
  background: Rgb,
): Uint8Array {
  const out = new Uint8Array(target * target * 3)
  const factor = size / target
  for (let y = 0; y < target; y += 1) {
    for (let x = 0; x < target; x += 1) {
      let r = 0
      let g = 0
      let b = 0
      let count = 0
      const startX = Math.floor(left + x * factor)
      const startY = Math.floor(top + y * factor)
      const step = Math.max(1, Math.floor(factor))
      for (let sy = 0; sy < step; sy += 1) {
        for (let sx = 0; sx < step; sx += 1) {
          const px = startX + sx
          const py = startY + sy
          const offset = (py * BASE_W + px) * 3
          if (px < 0 || py < 0 || px >= BASE_W || py >= BASE_H) {
            r += background[0]
            g += background[1]
            b += background[2]
          } else {
            r += image[offset]
            g += image[offset + 1]
            b += image[offset + 2]
          }
          count += 1
        }
      }
      const offset = (y * target + x) * 3
      out[offset] = Math.round(r / count)
      out[offset + 1] = Math.round(g / count)
      out[offset + 2] = Math.round(b / count)
    }
  }
  return out
}

/* ------------------------------------------------------------------ PNG ----- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width * 3; x += 1) {
      raw[y * (width * 3 + 1) + 1 + x] = rgb[y * width * 3 + x]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/* ------------------------------------------------------------------ лицо ---- */

const FACES = ['Notch', 'Alex', 'Steve', 'Herobrine', 'Elyra', 'Kraft', 'Mira', 'Sova', 'Drev', 'Tessa']

function facePng(name: string): Buffer {
  const hue = hash2(name.length, name.charCodeAt(0) + name.charCodeAt(name.length - 1), 5)
  const base: Rgb = [
    Math.round(140 + 90 * Math.sin(hue * Math.PI * 2)),
    Math.round(150 + 80 * Math.sin(hue * Math.PI * 2 + 2.1)),
    Math.round(160 + 70 * Math.sin(hue * Math.PI * 2 + 4.2)),
  ]
  const hair = mix(base, [30, 26, 24], 0.55)
  const size = 32
  const image = new Uint8Array(size * size * 3)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 3
      let color = mix(base, [255, 255, 255], 0.12)
      if (y < 8) color = hair
      if (y > 22 && y < 27 && x > 7 && x < 24) color = mix(base, [0, 0, 0], 0.14)
      // глаза
      if (y >= 12 && y <= 15 && ((x >= 8 && x <= 11) || (x >= 20 && x <= 23))) color = [36, 44, 56]
      // рот
      if (y >= 20 && y <= 21 && x >= 13 && x <= 18) color = mix(base, [0, 0, 0], 0.4)
      image[offset] = color[0]
      image[offset + 1] = color[1]
      image[offset + 2] = color[2]
    }
  }
  return encodePng(size, size, image)
}

/* ----------------------------------------------------------------- main ----- */

function main(): void {
  const started = Date.now()
  const blockMap = buildBlockMap()
  const base = renderBase(blockMap)
  const background: Rgb = [11, 16, 23]

  let tiles = 0
  const levels = [0, 1, 2, 3]
  // прямоугольник мира в native-пикселях: x ∈ [0, SIZE), y ∈ [TILE, BASE_H)
  const minX = 0
  const maxX = BASE_W
  const minY = OFFSET_Y
  const maxY = BASE_H
  for (const level of levels) {
    const zoom = NATIVE_ZOOM - level
    const step = TILE * 2 ** level
    const fromX = Math.floor(minX / step)
    const toX = Math.ceil(maxX / step) - 1
    const fromY = Math.floor(minY / step)
    const toY = Math.ceil(maxY / step) - 1
    for (let ty = fromY; ty <= toY; ty += 1) {
      for (let tx = fromX; tx <= toX; tx += 1) {
        // Тайл (tx, ty) на зуме покрывает native-пиксели
        // [tx*step, (tx+1)*step) × [ty*step, (ty+1)*step)
        const left = tx * step
        const top = ty * step
        const size = step

        const tile = cropResize(base, left, top, size, TILE, background)
        const url = tileUrl(WORLD as never, { x: tx, y: ty, z: zoom }, false, '')
        const relative = url.replace(/^\/tiles\//, '')
        const file = resolve(OUT_ROOT, relative)
        mkdirSync(dirname(file), { recursive: true })
        writeFileSync(file, encodePng(TILE, TILE, tile))
        tiles += 1
      }
    }
  }

  // аватарки для демо-игроков
  for (const name of FACES) {
    const file = resolve(OUT_ROOT, `faces/32x32/${name}.png`)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, facePng(name))
  }

  // карта мира с наложенными поселениями (для превью-иллюстрации)
  const preview = renderPreview(blockMap)
  const previewFile = resolve(OUT_ROOT, '../preview.png')
  mkdirSync(dirname(previewFile), { recursive: true })
  writeFileSync(previewFile, preview)

  console.log(`Готово: ${tiles} тайлов + ${FACES.length} аватарок за ${Date.now() - started} мс`)
  console.log(`Каталог: ${OUT_ROOT}`)
}

function renderPreview(blockMap: Rgb[][]): Buffer {
  const size = 512
  const scale = BLOCKS / size
  const image = new Uint8Array(size * size * 3)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const color = blockMap[Math.floor(y * scale)][Math.floor(x * scale)]
      const offset = (y * size + x) * 3
      image[offset] = color[0]
      image[offset + 1] = color[1]
      image[offset + 2] = color[2]
    }
  }
  return encodePng(size, size, image)
}

main()
