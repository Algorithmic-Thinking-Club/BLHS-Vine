import fs from 'fs'
import { decodePNG, encodePNG } from 'file:///C:/Users/ashcy/MAPVIS-next/server/sheet.mjs'
const T = 'C:/Users/ashcy/AdventureGame/.tmp-walkaudit/'
const [, , file, sx, sy, sw, sh, z, outName] = process.argv
const src = decodePNG(fs.readFileSync(T + file))
const X = +sx, Y = +sy, CW = +sw, CH = +sh, Z = +z
const out = new Uint8Array(CW * Z * CH * Z * 4)
for (let y = 0; y < CH * Z; y++) for (let x = 0; x < CW * Z; x++) {
  const px = X + Math.floor(x / Z), py = Y + Math.floor(y / Z)
  const si = (py * src.w + px) * 4, di = (y * CW * Z + x) * 4
  for (let c = 0; c < 4; c++) out[di + c] = src.data[si + c]
}
fs.writeFileSync(T + outName, encodePNG(CW * Z, CH * Z, out))
console.log('wrote', outName, CW * Z + 'x' + CH * Z, 'region', X, Y, CW, CH)
