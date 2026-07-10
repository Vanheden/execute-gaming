// ---------------------------------------------------------------------------
// Generate the Discord webhook avatar (public/bot-avatar.png, 512x512).
// ---------------------------------------------------------------------------
// Pure Node — no native modules, no image libraries (matches make-og-image.mjs).
// Rasterises the site's blood-red bat mark (the same silhouette used as the
// leaderboard placeholder avatar) over a blood-moon vignette, then hand-encodes
// a PNG with built-in zlib. Discord masks avatars to a circle, so we full-bleed.
//
//   node scripts/make-bot-avatar.mjs
//
// Re-run if the mark/colours change, then commit the PNG.
// ---------------------------------------------------------------------------
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const OUT = 512 // final size
const SS = 2 // supersample factor for anti-aliasing
const HI = OUT * SS

// ---------------------------------------------------------------------------
// The bat is drawn in a virtual 0..100 space (y down), symmetric about x=50,
// as a UNION of primitives: body + head + two ears + two scalloped wings. This
// reads far more clearly at avatar size than filling the tiny stylised leaderboard
// glyph. Colours come from the site's blood palette.
// ---------------------------------------------------------------------------
const V_MINX = 3
const V_MAXX = 97
const V_MINY = 6
const V_MAXY = 70

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))
const mirror = (pts) => pts.map(([x, y]) => [100 - x, y])

function inEllipse(px, py, cx, cy, rx, ry) {
  const dx = (px - cx) / rx
  const dy = (py - cy) / ry
  return dx * dx + dy * dy <= 1
}
function inTri(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by)
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy)
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay)
  const neg = d1 < 0 || d2 < 0 || d3 < 0
  const pos = d1 > 0 || d2 > 0 || d3 > 0
  return !(neg && pos)
}
function inPoly(px, py, P) {
  let w = false
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i]
    const [xj, yj] = P[j]
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) w = !w
  }
  return w
}

// Right wing: shoulder → top tip, then a scalloped trailing edge back to the body.
const wingR = [
  [59, 41], // shoulder (top, by the head)
  [96, 25], // upper wing tip
  [82, 38], // notch
  [98, 46], // outer tip
  [80, 50], // notch
  [89, 61], // mid-lower tip
  [69, 54], // notch
  [73, 67], // lower tip (near tail)
  [58, 57], // body join (bottom)
]
const wingL = mirror(wingR)
const earR = [[52, 22], [59, 5], [63, 27]]
const earL = mirror(earR)

// Union test for the whole bat, in virtual coords.
function inBat(vx, vy) {
  if (inEllipse(vx, vy, 50, 47, 12, 21)) return true // body
  if (inEllipse(vx, vy, 50, 29, 10.5, 10.5)) return true // head
  if (inTri(vx, vy, earR[0], earR[1], earR[2])) return true // right ear
  if (inTri(vx, vy, earL[0], earL[1], earL[2])) return true // left ear
  if (inPoly(vx, vy, wingR)) return true
  if (inPoly(vx, vy, wingL)) return true
  return false
}

// Fit the virtual box into ~84% of the canvas, centred.
const vw = V_MAXX - V_MINX
const vh = V_MAXY - V_MINY
const scale = (HI * 0.84) / Math.max(vw, vh)
const offX = (HI - vw * scale) / 2 - V_MINX * scale
const offY = (HI - vh * scale) / 2 - V_MINY * scale

// Bat vertical-gradient colour (brighter crown → deep crimson foot).
const batTop = [255, 95, 112]
const batBot = [190, 22, 50]

// --- Render hi-res RGB, then box-downsample to OUT for anti-aliasing --------
const hi = Buffer.alloc(HI * HI * 3)
const cxc = HI / 2
const cyc = HI / 2
const maxR = HI / 2
for (let y = 0; y < HI; y++) {
  for (let x = 0; x < HI; x++) {
    // Blood-moon vignette background.
    const dr = Math.hypot(x - cxc * 0.9, y - cyc * 0.8) / maxR
    const g = Math.max(0, 1 - dr)
    let r = lerp(20, 74, g * g)
    let gg = lerp(3, 18, g * g)
    let b = lerp(6, 26, g * g)
    // Bat on top — map the pixel back to virtual coords and test the union.
    const vx = (x - offX) / scale
    const vy = (y - offY) / scale
    if (inBat(vx, vy)) {
      const t = Math.max(0, Math.min(1, (vy - V_MINY) / (V_MAXY - V_MINY)))
      r = lerp(batTop[0], batBot[0], t)
      gg = lerp(batTop[1], batBot[1], t)
      b = lerp(batTop[2], batBot[2], t)
    }
    const i = (y * HI + x) * 3
    hi[i] = clamp(r)
    hi[i + 1] = clamp(gg)
    hi[i + 2] = clamp(b)
  }
}

// Downsample SS×SS → OUT (RGBA, opaque).
const px = Buffer.alloc(OUT * OUT * 4)
for (let y = 0; y < OUT; y++) {
  for (let x = 0; x < OUT; x++) {
    let r = 0
    let g = 0
    let b = 0
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const i = ((y * SS + sy) * HI + (x * SS + sx)) * 3
        r += hi[i]
        g += hi[i + 1]
        b += hi[i + 2]
      }
    }
    const n = SS * SS
    const o = (y * OUT + x) * 4
    px[o] = Math.round(r / n)
    px[o + 1] = Math.round(g / n)
    px[o + 2] = Math.round(b / n)
    px[o + 3] = 255
  }
}

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
ihdr.writeUInt32BE(OUT, 0)
ihdr.writeUInt32BE(OUT, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA

const raw = Buffer.alloc((OUT * 4 + 1) * OUT)
for (let y = 0; y < OUT; y++) {
  raw[y * (OUT * 4 + 1)] = 0
  px.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
])

const out = join(__dirname, '..', 'public', 'bot-avatar.png')
writeFileSync(out, png)
console.log(`Wrote ${out} (${OUT}x${OUT}, ${(png.length / 1024).toFixed(1)} kB)`)
