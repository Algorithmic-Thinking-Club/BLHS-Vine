// THE ISLAND AUDIT — the mechanical gate (2026-07-11). Every class of layout
// error Ash has had to catch by eye (severed paths, unreachable places, streams
// that don't start at their mouths or never reach the sea, marooned/water-borne
// landmarks) is checked here AS DATA, on the exact live layout the renderer just
// initialized. IslandMapIso runs it after initHubLayout() and prints the verdict
// to the console — a red [ISLAND AUDIT] line means the map is broken no matter
// how good the screenshot looks. Add a check the moment a new error class
// appears; never fix that class by eye again.
import { coastDs, LAVA, MOUTH_L, MOUTH_R } from './terrain'
import { HARBOR, CROSSINGS, harborAt } from './hub-layout'
import { isWalkable, getPois, getSeams } from './hub-mechanics'

export type AuditResult = { id: string; ok: boolean; detail: string }

const GRID = 200

export function runIslandAudit(): AuditResult[] {
  const res: AuditResult[] = []
  const push = (id: string, ok: boolean, detail: string) => res.push({ id, ok, detail })

  // ---- 1. THE LAVA STORY: one stream per head, born at the mouth-strike,
  // dead in the sea. (The "two streams per head" and "mouth doesn't match the
  // trail" verdicts, made impossible.)
  push('lava-count', LAVA.length === 2, `${LAVA.length} streams (must be exactly one per head)`)
  const mouths: [number, number][] = [MOUTH_L, MOUTH_R]
  LAVA.forEach((line, i) => {
    const [sx, sy] = line[0], [ex, ey] = line[line.length - 1]
    const near = mouths.reduce((b, m) => Math.min(b, Math.hypot(sx - m[0], sy - m[1])), 99)
    push(`lava-${i}-mouth`, near < 0.6, `starts ${near.toFixed(2)} tiles from a mouth-strike`)
    const dsEnd = coastDs(ex, ey)
    push(`lava-${i}-quench`, dsEnd <= -0.5, `ends at coastDs ${dsEnd.toFixed(2)} (<= -0.5 = in the sea)`)
  })
  push('crossings', CROSSINGS.length === LAVA.length,
    `${CROSSINGS.length} crust crossings for ${LAVA.length} streams (the ring-walk must bridge each)`)

  // ---- 2. REACHABILITY: flood-fill the real walkmap from the harbor deck and
  // demand every POI and seam is reachable. (The "blocked pathways" class.)
  const seed = HARBOR.tiles.find((t) => t.walk)
  if (!seed) {
    push('walk-seed', false, 'no walkable harbor deck tile to flood from')
    return res
  }
  const reached = new Uint8Array(GRID * GRID)
  const qx: number[] = [seed.tx], qy: number[] = [seed.ty]
  reached[seed.ty * GRID + seed.tx] = 1
  while (qx.length) {
    const x = qx.pop() as number, y = qy.pop() as number
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ox, ny = y + oy
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
      const k = ny * GRID + nx
      if (reached[k] || !isWalkable(nx, ny)) continue
      reached[k] = 1
      qx.push(nx); qy.push(ny)
    }
  }
  let reachedCount = 0
  for (let i = 0; i < reached.length; i++) reachedCount += reached[i]
  push('walk-region', reachedCount > 2000, `${reachedCount} tiles reachable from the harbor deck`)

  const reachableNear = (x: number, y: number, r: number) => {
    const R = Math.ceil(r)
    for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
      const nx = Math.round(x) + ox, ny = Math.round(y) + oy
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue
      if (Math.hypot(nx - x, ny - y) > r) continue
      if (reached[ny * GRID + nx]) return true
    }
    return false
  }
  for (const poi of getPois()) {
    push(`reach:${poi.id}`, reachableNear(poi.at[0], poi.at[1], poi.r + 1.5),
      `walkable ground within ${(poi.r + 1.5).toFixed(1)} tiles of (${poi.at[0].toFixed(1)}, ${poi.at[1].toFixed(1)})`)
  }
  for (const seam of getSeams()) {
    push(`reach:${seam.id}`, reachableNear(seam.at[0], seam.at[1], seam.radius + 1.5),
      `seam approach within ${(seam.radius + 1.5).toFixed(1)} tiles of (${seam.at[0].toFixed(1)}, ${seam.at[1].toFixed(1)})`)
  }

  // ---- 3. GROUNDING: no landmark stands in open water (the "floating on the
  // ocean" class). A stilt-port DECK counts as ground (the bell stands on the
  // boardwalk over water by design); tidepools live AT the waterline; everything
  // else needs real land under it.
  for (const poi of getPois()) {
    const ds = coastDs(poi.at[0], poi.at[1])
    const onDeck = !!harborAt(Math.round(poi.at[0]), Math.round(poi.at[1]))
    const min = poi.id === 'tidepools' ? -1.5 : 0.3
    push(`ground:${poi.id}`, onDeck || ds > min,
      onDeck ? 'stands on a harbor deck' : `coastDs ${ds.toFixed(2)} (needs > ${min})`)
  }

  return res
}

// print the verdict; returns true when green (callers may gate dev overlays on it)
export function reportIslandAudit(): boolean {
  const audit = runIslandAudit()
  const bad = audit.filter((r) => !r.ok)
  if (bad.length) {
    console.error(`[ISLAND AUDIT] ${bad.length}/${audit.length} FAILED`)
    for (const b of bad) console.error(`  ✗ ${b.id} — ${b.detail}`)
  } else {
    console.info(`[ISLAND AUDIT] all ${audit.length} checks green`)
  }
  return bad.length === 0
}
