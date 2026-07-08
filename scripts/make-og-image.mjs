// ---------------------------------------------------------------------------
// Generate the social-preview image (public/og-image.png, 1200x630).
// ---------------------------------------------------------------------------
// Pure Node — no native modules, no image libraries (keeps the project's
// "no native deps" promise). Draws a brand gradient + a blocky bitmap-font
// title, then hand-encodes a PNG with the built-in zlib.
//
//   node scripts/make-og-image.mjs
//
// Re-run whenever the wording/branding changes, then commit the PNG.
// ---------------------------------------------------------------------------
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const W = 1200
const H = 630

// --- 5x7 blocky font (only the glyphs we render) ---------------------------
const G = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  G: ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
}

// --- RGBA canvas ------------------------------------------------------------
const px = Buffer.alloc(W * H * 4)
const set = (x, y, r, g, b) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  px[i] = r
  px[i + 1] = g
  px[i + 2] = b
  px[i + 3] = 255
}
const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))

// Brand background: diagonal violet→near-black, with pink + cyan glows.
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = (x + y) / (W + H)
    let r = lerp(46, 14, t)
    let g = lerp(20, 9, t)
    let b = lerp(74, 26, t)
    // pink glow, top-right
    const dp = Math.hypot(x - W * 0.82, y - H * -0.05) / (W * 0.6)
    const gp = Math.max(0, 1 - dp)
    r += 150 * gp * gp
    g += 40 * gp * gp
    b += 90 * gp * gp
    // cyan glow, bottom-left
    const dc = Math.hypot(x - W * 0.05, y - H * 1.05) / (W * 0.55)
    const gc = Math.max(0, 1 - dc)
    r += 10 * gc * gc
    g += 90 * gc * gc
    b += 110 * gc * gc
    set(x, y, clamp(r), clamp(g), clamp(b))
  }
}

// Draw a string of glyphs; returns total pixel width.
function measure(text, scale) {
  return text.length * 6 * scale - scale
}
function draw(text, scale, x0, y0, [r, g, b]) {
  let cx = x0
  for (const ch of text) {
    const glyph = G[ch] || G[' ']
    for (let gy = 0; gy < 7; gy++) {
      for (let gx = 0; gx < 5; gx++) {
        if (glyph[gy][gx] !== '#') continue
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) set(cx + gx * scale + sx, y0 + gy * scale + sy, r, g, b)
      }
    }
    cx += 6 * scale
  }
}

// --- Compose ---------------------------------------------------------------
const title = 'EXECUTE-GAMING'
const subtitle = 'V RISING . PVE + DUO PVP'
const tScale = 12
const sScale = 5

const tW = measure(title, tScale)
const tX = Math.round((W - tW) / 2)
const tY = 210
draw(title, tScale, tX, tY, [243, 238, 254])

// accent underline bar (pink → cyan)
const barY = tY + 7 * tScale + 34
for (let x = tX; x < tX + tW; x++) {
  const t = (x - tX) / tW
  const r = clamp(lerp(255, 34, t))
  const g = clamp(lerp(93, 211, t))
  const b = clamp(lerp(177, 238, t))
  for (let y = barY; y < barY + 8; y++) set(x, y, r, g, b)
}

const sW = measure(subtitle, sScale)
draw(subtitle, sScale, Math.round((W - sW) / 2), barY + 40, [181, 170, 212])

// --- PNG encode (zlib) ------------------------------------------------------
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1
  }
  return (~c) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // colour type RGBA
// 10,11,12 = 0 (deflate / adaptive / no interlace)

// raw scanlines with filter byte 0 (None)
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0
  px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = join(__dirname, '..', 'public', 'og-image.png')
writeFileSync(out, png)
console.log(`Wrote ${out} (${W}x${H}, ${(png.length / 1024).toFixed(1)} kB)`)
