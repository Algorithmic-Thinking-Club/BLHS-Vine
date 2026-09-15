// Pixel-diff two PNGs to catch palette/style drift or unintended asset changes.
// Usage: node scripts/asset_diff.mjs <before.png> <after.png> [out.png]
// Requires devDeps: pixelmatch, pngjs. Images must be the same dimensions.
import fs from 'fs'
import { PNG } from 'pngjs'
import pixelmatch from 'pixelmatch'

const [, , aPath, bPath, outPath = 'diff.png'] = process.argv
if (!aPath || !bPath) {
  console.error('Usage: node scripts/asset_diff.mjs <before.png> <after.png> [out.png]')
  process.exit(1)
}
const a = PNG.sync.read(fs.readFileSync(aPath))
const b = PNG.sync.read(fs.readFileSync(bPath))
if (a.width !== b.width || a.height !== b.height) {
  console.error(`size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`)
  process.exit(1)
}
const { width, height } = a
const diff = new PNG({ width, height })
const changed = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.1 })
fs.writeFileSync(outPath, PNG.sync.write(diff))
const pct = ((100 * changed) / (width * height)).toFixed(2)
console.log(`changed ${changed} px (${pct}% of ${width}x${height}) -> ${outPath}`)
