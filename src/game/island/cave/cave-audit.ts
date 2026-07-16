// THE PANTHER CAVE'S MECHANICAL GATE — reachability proven as DATA on every
// load (the harbor lesson: audit before art; a red console line means the map
// is broken no matter how good the screenshot looks). Flood-fills the walkmap
// from the mouth spawn through the SAME canStep edge rule the walker will use
// — so a 3-level ledge that "looks" adjacent is honestly not a path.

import { GRID, SPAWNS } from './cave-layout'
import { isWalkable, canStep, getPois, getSeams, zoneAt } from './cave-mechanics'

export function reportCaveAudit() {
  const reach = new Uint8Array(GRID * GRID)
  const sx = Math.round(SPAWNS.fromMouth.at[0]), sy = Math.round(SPAWNS.fromMouth.at[1])
  if (!isWalkable(sx, sy)) {
    console.error('%c[cave-audit] THE MOUTH SPAWN IS NOT WALKABLE — the room is sealed', 'color:#ff5050;font-weight:bold')
    return
  }
  const qx: number[] = [sx], qy: number[] = [sy]
  reach[sy * GRID + sx] = 1
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let h = 0; h < qx.length; h++) {
    const x = qx[h], y = qy[h]
    for (const [ox, oy] of NB) {
      const nx = x + ox, ny = y + oy
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
      if (reach[ny * GRID + nx]) continue
      if (!canStep(x, y, nx, ny)) continue
      reach[ny * GRID + nx] = 1
      qx.push(nx); qy.push(ny)
    }
  }
  const near = (px: number, py: number, r: number) => {
    for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
      for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue
        if (Math.hypot(x - px, y - py) <= r + 0.01 && reach[y * GRID + x]) return true
      }
    }
    return false
  }
  const targets: [string, number, number][] = [
    ...getPois().map((p) => [`poi:${p.id}`, p.at[0], p.at[1]] as [string, number, number]),
    ...getSeams().map((s) => [`seam:${s.id}`, s.at[0], s.at[1]] as [string, number, number]),
    ['hall heart (hearth ring walk-around)', 46, 51.4],
    ['dais top (behind the desk)', 36, 30],
    ['bridge far side (the nook approach)', 26, 53],
    ['balcony end (the secret pays off)', 9, 31],
  ]
  const fails: string[] = []
  for (const [name, px, py] of targets) if (!near(px, py, 2)) fails.push(name)
  let walkable = 0, reached = 0
  for (let i = 0; i < GRID * GRID; i++) {
    const x = i % GRID, y = (i / GRID) | 0
    if (isWalkable(x, y)) { walkable++; if (reach[i]) reached++ }
  }
  const pct = walkable ? Math.round((reached / walkable) * 100) : 0
  if (fails.length) {
    console.error(`%c[cave-audit] FAIL — unreachable: ${fails.join(', ')} (${pct}% of walkable connected)`, 'color:#ff5050;font-weight:bold')
  } else {
    console.log(`%c[cave-audit] PASS — every station reachable from the mouth; ${pct}% of walkable tiles connected (${reached}/${walkable})`, 'color:#3ddc84')
  }
  if (pct < 90) {
    console.warn(`%c[cave-audit] ${100 - pct}% of the floor is cut off from the mouth — check for sealed pockets`, 'color:#ffb020')
  }
  // zone sanity: every station anchor must sit in ITS zone, not 'hall'/'rock'
  for (const p of getPois()) {
    const z = zoneAt(p.at[0], p.at[1])
    if (z === 'rock') console.warn(`%c[cave-audit] ${p.id} stands in ROCK at ${p.at}`, 'color:#ffb020')
  }
}
