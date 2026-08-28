import fs from 'fs'
import { decodePNG } from 'file:///C:/Users/ashcy/MAPVIS-next/server/sheet.mjs'

const R = 'C:/Users/ashcy/MAPVIS-next/work/hub/'
const doc = JSON.parse(fs.readFileSync(R + 'doc.json', 'utf8'))
const W = doc.w, H = doc.h, N = W * H
const b = Buffer.from(doc.m, 'base64')
const lvl = b.subarray(0, N)
const occ = b.subarray(N, 2 * N)
const cut = b.subarray(2 * N, 3 * N)

const lp = decodePNG(fs.readFileSync(R + 'levels.png'))
console.log('levels.png', lp.w + 'x' + lp.h, 'doc', W + 'x' + H)
const L = new Uint8Array(N)
for (let i = 0; i < N; i++) L[i] = lp.data[i * 4]

// histogram helper
const hist = (a) => { const m = new Map(); for (let i = 0; i < a.length; i++) m.set(a[i], (m.get(a[i]) || 0) + 1); return [...m.entries()].sort((x, y) => x[0] - y[0]) }
console.log('doc lvl hist   ', JSON.stringify(hist(lvl)))
console.log('levels.png hist', JSON.stringify(hist(L)))
let cutN = 0; for (let i = 0; i < N; i++) if (cut[i]) cutN++
console.log('cut px', cutN, 'occ nonzero', (() => { let n = 0; for (let i = 0; i < N; i++) if (occ[i]) n++; return n })())

// expected export = cut ? 0 : lvl
let mismatch = 0, killedByCut = 0, otherMismatch = 0
const ex = new Uint8Array(N)
for (let i = 0; i < N; i++) {
  ex[i] = cut[i] ? 0 : lvl[i]
  if (ex[i] !== L[i]) { mismatch++; if (cut[i]) killedByCut++; else otherMismatch++ }
}
console.log('levels.png vs (cut?0:lvl) mismatches', mismatch, ' (of which on cut px', killedByCut, ', off cut', otherMismatch, ')')

// how many pixels the editor calls walkable-ground that the export zeroes
let lvlWalk = 0, exWalk = 0, cutAndLvl = 0
for (let i = 0; i < N; i++) { if (lvl[i]) lvlWalk++; if (ex[i]) exWalk++; if (lvl[i] && cut[i]) cutAndLvl++ }
console.log('lvl>0 px', lvlWalk, ' export>0 px', exWalk, ' lvl>0 AND cut', cutAndLvl)

fs.writeFileSync('C:/Users/ashcy/AdventureGame/.tmp-walkaudit/planes.bin', Buffer.concat([Buffer.from(lvl), Buffer.from(occ), Buffer.from(cut), Buffer.from(L)]))
console.log('wrote planes.bin')
