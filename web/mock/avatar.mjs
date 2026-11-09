import { deflateSync } from 'node:zlib'

/** Мини-генератор PNG-аватарок, чтобы демо не зависело от внешних CDN. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buffer) {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i += 1) crc = CRC_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([length, typeBuf, data, crcBuf])
}

export function encodePng(width, height, rgb) {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1)
    raw[rowStart] = 0
    for (let x = 0; x < width * 3; x += 1) raw[rowStart + 1 + x] = rgb[y * width * 3 + x]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}

function clamp(value) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

export function avatarPng(name) {
  const seed = [...name].reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 100000, 7)
  const hue = (seed % 360) / 360
  const base = [
    clamp(120 + 90 * Math.sin(hue * 6.283)),
    clamp(130 + 80 * Math.sin(hue * 6.283 + 2.1)),
    clamp(140 + 70 * Math.sin(hue * 6.283 + 4.2)),
  ]
  const hair = base.map((value) => clamp(value * 0.45))
  const size = 32
  const image = new Uint8Array(size * size * 3)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 3
      let color = base.map((value) => clamp(value * 1.12))
      if (y < 8) color = hair
      if (y > 22 && y < 27 && x > 7 && x < 24) color = base.map((value) => clamp(value * 0.85))
      if (y >= 12 && y <= 15 && ((x >= 8 && x <= 11) || (x >= 20 && x <= 23))) color = [36, 44, 56]
      if (y >= 20 && y <= 21 && x >= 13 && x <= 18) color = base.map((value) => clamp(value * 0.6))
      image[offset] = color[0]
      image[offset + 1] = color[1]
      image[offset + 2] = color[2]
    }
  }
  return encodePng(size, size, image)
}
