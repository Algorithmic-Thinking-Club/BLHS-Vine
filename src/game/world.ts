// Builds the playable world from the real 1:1 campus model (feet). Defines ground regions,
// the building massing (a clean placeholder until exact 3D models from the drawings arrive),
// the enterable zones (each maps to a grape), prop scatter, and the spawn.
import model from './campus-model.json'
import { type Pt, bbox, centroid, pointInPoly, distToPolyline, simplify } from './geo'

export type Material = 'grass' | 'asphalt' | 'turf' | 'court' | 'concrete' | 'dirt' | 'track'

export type Zone = {
  id: string // grapeId
  label: string // building / offering name
  role: string // one-line description for the floating tag
  door: Pt // world feet, where Thor stands to enter
  district: string // HUD area name
}

export type Prop = { kind: 'evergreen' | 'deciduous' | 'bench' | 'lamp'; at: Pt }

export type Region = { material: Material; poly: Pt[] }

const M = model as unknown as {
  boundary: Pt[]
  building: { footprint: Pt[]; entrances: { kind: string; label: string; pt: Pt; grapeId: string }[] }
  football: Pt[]
  diamonds: Pt[][]
  tennis: Pt[][]
  parking: Pt[][]
  courtyards: Pt[][]
  practice_field: Pt[]
  walkways: Pt[][]
}

// Human-written role copy for each enterable offering (the floating tag's second line).
const ROLE: Record<string, { role: string; district: string }> = {
  commons: { role: 'Main entrance & the Commons', district: 'Commons' },
  gym: { role: 'Gymnasium & athletics', district: 'Athletics' },
  pac: { role: 'Performing Arts Center', district: 'Arts' },
  atc: { role: 'Classroom wings & ATC', district: 'Academics' },
}

export type World = {
  boundary: Pt[]
  regions: Region[]
  walkways: Pt[][]
  footprint: Pt[] // simplified, for massing + collision
  footprintRaw: Pt[]
  roofHeight: number // feet of extrusion (visual)
  zones: Zone[]
  props: Prop[]
  spawn: Pt
  bounds: ReturnType<typeof bbox>
}

export function buildWorld(): World {
  const boundary = M.boundary
  const footprintRaw = M.building.footprint
  const footprint = simplify(footprintRaw, 9) // tidy the jagged OSM outline for clean massing

  const regions: Region[] = []
  for (const p of M.parking) regions.push({ material: 'asphalt', poly: p })
  regions.push({ material: 'turf', poly: M.football })
  regions.push({ material: 'turf', poly: M.practice_field })
  for (const d of M.diamonds) regions.push({ material: 'dirt', poly: d })
  for (const t of M.tennis) regions.push({ material: 'court', poly: t })
  for (const c of M.courtyards) regions.push({ material: 'concrete', poly: c })

  const zones: Zone[] = M.building.entrances.map((e) => {
    const meta = ROLE[e.grapeId] ?? { role: e.label, district: 'Campus' }
    return { id: e.grapeId, label: e.label, role: meta.role, door: doorOutside(e.pt, footprint), district: meta.district }
  })

  const props = scatterProps(boundary, footprint, M.walkways)

  // spawn on the approach to the main entrance, looking toward the building
  const commons = zones.find((z) => z.id === 'commons')!
  const spawn: Pt = [commons.door[0] + 8, commons.door[1] + 46]

  return {
    boundary,
    regions,
    walkways: M.walkways,
    footprint,
    footprintRaw,
    roofHeight: 92,
    zones,
    props,
    spawn,
    bounds: bbox(boundary),
  }
}

// Nudge an entrance point out of the footprint toward open ground (so Thor can stand on it).
function doorOutside(pt: Pt, footprint: Pt[]): Pt {
  const c = centroid(footprint)
  let dx = pt[0] - c[0], dy = pt[1] - c[1]
  const len = Math.hypot(dx, dy) || 1
  dx /= len; dy /= len
  for (let step = 0; step < 60; step++) {
    const p: Pt = [pt[0] + dx * step * 2, pt[1] + dy * step * 2]
    if (!pointInPoly(p[0], p[1], footprint)) return [p[0] + dx * 14, p[1] + dy * 14]
  }
  return pt
}

// Deterministic prop scatter: evergreens ringing the campus edge, shade trees + benches + lamps
// along the walkways. Kept off the building and off the paths themselves.
function scatterProps(boundary: Pt[], footprint: Pt[], walkways: Pt[][]): Prop[] {
  const props: Prop[] = []
  let seed = 1337
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)

  const clearOfBuilding = (x: number, y: number) => !pointInPoly(x, y, footprint)
  const nearWalk = (x: number, y: number, max: number) => {
    for (const w of walkways) if (distToPolyline(x, y, w) < max) return true
    return false
  }

  // 1) evergreen ring just inside the boundary
  const ringStep = 90
  for (let i = 0; i < boundary.length; i++) {
    const [x0, y0] = boundary[i]
    const [x1, y1] = boundary[(i + 1) % boundary.length]
    const segLen = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.floor(segLen / ringStep))
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n
      // pull inward toward campus center so trees sit inside the fence line
      const cx = x0 + (x1 - x0) * t
      const cy = y0 + (y1 - y0) * t
      const toC = centroid(boundary)
      const ix = cx + (toC[0] - cx) * 0.06 + (rand() - 0.5) * 30
      const iy = cy + (toC[1] - cy) * 0.06 + (rand() - 0.5) * 30
      if (clearOfBuilding(ix, iy) && !nearWalk(ix, iy, 40)) {
        props.push({ kind: 'evergreen', at: [ix, iy] })
      }
    }
  }

  // 2) shade trees + lamps + benches along the walkways
  for (const w of walkways) {
    for (let i = 0; i < w.length - 1; i++) {
      const [x0, y0] = w[i]
      const [x1, y1] = w[i + 1]
      const segLen = Math.hypot(x1 - x0, y1 - y0)
      const n = Math.floor(segLen / 130)
      const nx = -(y1 - y0) / (segLen || 1) // unit normal to offset off the path
      const ny = (x1 - x0) / (segLen || 1)
      for (let k = 1; k <= n; k++) {
        const t = k / (n + 1)
        const side = k % 2 === 0 ? 1 : -1
        const off = 34
        const px = x0 + (x1 - x0) * t + nx * off * side
        const py = y0 + (y1 - y0) * t + ny * off * side
        if (!clearOfBuilding(px, py)) continue
        const r = rand()
        const kind: Prop['kind'] = r < 0.45 ? 'lamp' : r < 0.78 ? 'deciduous' : 'bench'
        props.push({ kind, at: [px, py] })
      }
    }
  }

  return props
}
