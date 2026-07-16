// THE ATC ISLAND'S MECHANICAL GATE — reachability checked as DATA on every
// load (the hub's island-audit pattern): a red console line means the map is
// broken no matter how good the screenshot looks. Flood-fills the walkmap from
// the dock root and proves every feature socket can actually be reached.

import { GRID } from './atc-terrain'
import { DOCK, DOOR, TEACHER, LEARN_SPOTS, REWARD, EGG, ACTIVITY } from './atc-layout'
import { isWalkable, getPois, getSeams } from './atc-mechanics'

export function reportAtcAudit() {
  const reach = new Uint8Array(GRID * GRID)
  const qx: number[] = [], qy: number[] = []
  const seed = [Math.round(DOCK.root[0]), Math.round(DOCK.root[1])]
  if (!isWalkable(seed[0], seed[1])) {
    console.error('%c[atc-audit] DOCK ROOT IS NOT WALKABLE — the island is sealed', 'color:#ff5050;font-weight:bold')
    return
  }
  reach[seed[1] * GRID + seed[0]] = 1
  qx.push(seed[0]); qy.push(seed[1])
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]]
  for (let h = 0; h < qx.length; h++) {
    const x = qx[h], y = qy[h]
    for (const [ox, oy] of NB) {
      const nx = x + ox, ny = y + oy
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
      if (reach[ny * GRID + nx]) continue
      if (!isWalkable(nx, ny)) continue
      reach[ny * GRID + nx] = 1
      qx.push(nx); qy.push(ny)
    }
  }
  // a target passes if any walkable tile within r=1.6 of it is reachable
  const near = (px: number, py: number, r = 1.6) => {
    for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
      for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
        if (x < 0 || y < 0 || x >= GRID || y >= GRID) continue
        if (Math.hypot(x - px, y - py) <= r + 0.01 && reach[y * GRID + x]) return true
      }
    }
    return false
  }
  const targets: [string, number, number][] = [
    ['berth (pier end)', DOCK.berth[0], DOCK.berth[1]],
    ['door threshold', DOOR[0][0] + 0.5, DOOR[0][1]],
    ['room interior (inside the door)', DOOR[0][0] + 0.5, DOOR[0][1] + 1.5],
    ['teacher post (host socket)', TEACHER.at[0] + 1, TEACHER.at[1] + 1],
    ['activity desk', ACTIVITY[0] + 0.5, ACTIVITY[1] - 1],
    ['learn-1', LEARN_SPOTS[0][0], LEARN_SPOTS[0][1]],
    ['learn-2', LEARN_SPOTS[1][0], LEARN_SPOTS[1][1]],
    ['learn-3', LEARN_SPOTS[2][0], LEARN_SPOTS[2][1]],
    ['reward spot', REWARD[0], REWARD[1]],
    ['easter egg (cove)', EGG[0], EGG[1]],
    ...getPois().map((p) => [`poi:${p.id}`, p.at[0], p.at[1]] as [string, number, number]),
    ...getSeams().map((s) => [`seam:${s.id}`, s.at[0], s.at[1]] as [string, number, number]),
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
    console.error(`%c[atc-audit] FAIL — unreachable: ${fails.join(', ')} (${pct}% of walkable connected)`, 'color:#ff5050;font-weight:bold')
  } else {
    console.log(`%c[atc-audit] PASS — every socket reachable from the dock; ${pct}% of walkable tiles connected (${reached}/${walkable})`, 'color:#3ddc84')
  }
  if (pct < 90) {
    console.warn(`%c[atc-audit] ${100 - pct}% of walkable land is cut off from the dock — check for sealed pockets`, 'color:#ffb020')
  }
}
