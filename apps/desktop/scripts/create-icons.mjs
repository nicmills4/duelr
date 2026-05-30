/**
 * Creates a minimal placeholder tray icon (16x16, gold #C89B3C).
 * Run: node scripts/create-icons.mjs
 * Replace resources/tray-icon.png with a real design before distribution.
 */
import { createWriteStream } from 'fs'
import { deflateSync } from 'zlib'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'resources')
mkdirSync(outDir, { recursive: true })

function crc32(buf) {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) >>> 0
}

function pngChunk(type, data) {
  const typeB = Buffer.from(type)
  const lenB = Buffer.allocUnsafe(4); lenB.writeUInt32BE(data.length)
  const combined = Buffer.concat([typeB, data])
  const crcB = Buffer.allocUnsafe(4); crcB.writeUInt32BE(crc32(combined))
  return Buffer.concat([lenB, combined, crcB])
}

const W = 16, H = 16
// IHDR: width, height, bit-depth=8, color-type=2 (RGB), compression=0, filter=0, interlace=0
const ihdr = Buffer.allocUnsafe(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0

// Raw image data: each row prefixed with filter byte 0x00
const raw = Buffer.allocUnsafe(H * (1 + W * 3))
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0 // filter=None
  for (let x = 0; x < W; x++) {
    const i = y * (1 + W * 3) + 1 + x * 3
    raw[i]     = 0xC8 // R
    raw[i + 1] = 0x9B // G
    raw[i + 2] = 0x3C // B  → #C89B3C (gold-400)
  }
}

const compressed = deflateSync(raw)

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), // signature
  pngChunk('IHDR', ihdr),
  pngChunk('IDAT', compressed),
  pngChunk('IEND', Buffer.alloc(0)),
])

const outPath = join(outDir, 'tray-icon.png')
createWriteStream(outPath).end(png, () => {
  console.log(`Created ${outPath} (${png.length} bytes)`)
})
