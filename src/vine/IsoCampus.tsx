import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Matrix, RenderTexture, Sprite, Text, Texture, TextureSource } from 'pixi.js'
import { CAMPUS, CAMPUS_SPAWN, COLS, ROWS, PROPS, groundAt, blockedAt, type Building } from './campus-model'

// Isometric projection constants, measured from the 64px PixelLab tiles.
const HW = 32 // half tile width  (diamond is 64 wide)
const HH = 16 // half tile height (diamond is 32 tall, 2:1)
const TILE_AX = 0.5 // tile image anchor x (centered)
const GROUND_AY = 38 / 64 // ground diamond-center y within the 64px canvas

// plan cell (x east, y south) -> world screen point of the cell's diamond center
function iso(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * HW, sy: (x + y) * HH }
}
// inverse: world point -> fractional plan cell
function unIso(sx: number, sy: number): { x: number; y: number } {
  return { x: (sx / HW + sy / HH) / 2, y: (sy / HH - sx / HW) / 2 }
}

const GROUND_SRC: Record<string, string> = {
  grass: '/art/iso/grass.png',
  concrete: '/art/iso/concrete.png',
  asphalt: '/art/iso/asphalt.png',
  turf: '/art/iso/turf.png',
  track: '/art/iso/track.png',
  dirt: '/art/iso/dirt.png',
  court: '/art/iso/court.png',
  parking: '/art/iso/parking.png',
}

// Each building is ONE detailed isometric sprite, sized to its footprint. Missing sprites
// fall back to commons until generated.
const BUILDING_SRC: Record<string, string> = {
  gym: '/art/iso/buildings/gym.png',
  commons: '/art/iso/buildings/commons.png',
  wing: '/art/iso/buildings/wing.png',
  pac: '/art/iso/buildings/pac.png',
  welcome: '/art/iso/buildings/welcome.png',
}

const PROP_SRC: Record<string, string> = {
  evergreen: '/art/iso/props/evergreen.png',
  deciduous: '/art/iso/props/deciduous.png',
  car: '/art/iso/props/car.png',
  grandstand: '/art/iso/grandstand.png',
}

// scale + base anchor (0-1 of sprite height) per prop. Trees/cars are base-anchored billboards;
// grandstand is still a 64px iso tile.
const PROP_META: Record<string, { scale: number; ay: number }> = {
  evergreen: { scale: 0.62, ay: 0.92 },
  deciduous: { scale: 0.6, ay: 0.9 },
  car: { scale: 0.72, ay: 0.84 },
  grandstand: { scale: 1, ay: 47 / 64 },
}

const walkDirs = ['south', 'north', 'east', 'west']
const idleDirs = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']

function dirFromAngle(dx: number, dy: number): string {
  const a = (Math.atan2(dy, dx) * 180) / Math.PI // screen space
  if (a >= -22.5 && a < 22.5) return 'east'
  if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'
  if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= 157.5 || a < -157.5) return 'west'
  if (a >= -157.5 && a < -112.5) return 'north-west'
  if (a >= -112.5 && a < -67.5) return 'north'
  return 'north-east'
}
function cardinalOf(dir: string): string {
  if (dir === 'south' || dir === 'north' || dir === 'east' || dir === 'west') return dir
  if (dir.includes('south')) return 'south'
  if (dir.includes('north')) return 'north'
  return dir.includes('east') ? 'east' : 'west'
}

export function IsoCampus({ onEnter }: { onEnter: (grapeId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let app: Application | null = null
    let destroyed = false
    let onEnterKey: ((e: KeyboardEvent) => void) | null = null
    const keys: Record<string, boolean> = {}
    const onKeyDown = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true }
    const onKeyUp = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false }

    const start = async () => {
      TextureSource.defaultOptions.scaleMode = 'nearest'
      const instance = new Application()
      await instance.init({ background: 0x39492c, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance
      ref.current.appendChild(instance.canvas)

      const ground: Record<string, Texture> = {}
      for (const [k, src] of Object.entries(GROUND_SRC)) ground[k] = await Assets.load(src)
      const buildingTex: Record<string, Texture> = {}
      for (const [k, src] of Object.entries(BUILDING_SRC)) {
        try { buildingTex[k] = await Assets.load(src) } catch { /* not generated yet */ }
      }
      const props: Record<string, Texture> = {}
      for (const [k, src] of Object.entries(PROP_SRC)) {
        try { props[k] = await Assets.load(src) } catch { /* prop optional */ }
      }

      const idle: Record<string, Texture> = {}
      for (const d of idleDirs) idle[d] = await Assets.load(`/art/characters/thor/${d}.png`)
      const walk: Record<string, Texture[]> = {}
      for (const d of walkDirs) {
        walk[d] = []
        for (let i = 0; i < 6; i++) walk[d].push(await Assets.load(`/art/characters/thor/walk/${d}/${i}.png`))
      }
      const idleAnim: Record<string, Texture[]> = {}
      for (const d of walkDirs) {
        try {
          const fr: Texture[] = []
          for (let i = 0; i < 4; i++) fr.push(await Assets.load(`/art/characters/thor/idle/${d}/${i}.png`))
          idleAnim[d] = fr
        } catch { /* static fallback */ }
      }
      if (destroyed) { instance.destroy(true); return }

      const world = new Container()
      instance.stage.addChild(world)

      // --- ground: built once then BAKED to a single texture (thousands of static tiles
      //     would tank a Chromebook; baked it is one draw call) ---
      const groundLayer = new Container()
      for (let s = 0; s <= COLS + ROWS; s++) {
        for (let x = 0; x <= s; x++) {
          const y = s - x
          if (x >= COLS || y >= ROWS) continue
          const t = ground[groundAt(x, y)] ?? ground.grass
          const spr = new Sprite(t)
          spr.anchor.set(TILE_AX, GROUND_AY)
          const { sx, sy } = iso(x, y)
          spr.position.set(sx, sy)
          groundLayer.addChild(spr)
        }
      }
      const gb = groundLayer.getLocalBounds()
      const groundRT = RenderTexture.create({ width: Math.ceil(gb.width) + 2, height: Math.ceil(gb.height) + 2 })
      instance.renderer.render({ container: groundLayer, target: groundRT, transform: new Matrix(1, 0, 0, 1, -gb.minX, -gb.minY) })
      groundLayer.destroy({ children: true })
      const groundSprite = new Sprite(groundRT)
      groundSprite.position.set(gb.minX, gb.minY)
      world.addChild(groundSprite)

      // --- object layer: buildings + thor, depth-sorted by base screen-y ---
      const objects = new Container()
      objects.sortableChildren = true
      world.addChild(objects)
      const labels = new Container()
      world.addChild(labels)

      const addBuilding = (b: Building) => {
        const tex = buildingTex[b.sprite] ?? buildingTex.commons
        if (!tex) return
        const cx = b.x + b.w / 2 - 0.5
        const cy = b.y + b.d / 2 - 0.5
        const { sx, sy } = iso(cx, cy)
        const spr = new Sprite(tex)
        // auto-scale so the sprite width roughly matches the footprint's iso diamond width
        const scale = b.scale ?? ((b.w + b.d) * HW) / tex.width
        spr.scale.set(scale)
        spr.anchor.set(0.5, b.anchorY ?? 0.9)
        spr.position.set(sx, sy)
        // depth by the front-most footprint cell so Thor occludes correctly
        spr.zIndex = (b.x + b.w - 1 + (b.y + b.d - 1)) * HH
        objects.addChild(spr)
        const label = new Text({ text: b.label, style: { fill: 0xf4f1ea, fontSize: 12, fontFamily: 'monospace', stroke: { color: 0x141517, width: 4 } } })
        label.anchor.set(0.5, 1)
        label.position.set(sx, sy - tex.height * scale * (b.anchorY ?? 0.9) - 6)
        labels.addChild(label)
      }
      for (const b of CAMPUS) addBuilding(b)

      for (const p of PROPS) {
        const tex = props[p.tile]
        if (!tex) continue
        const m = PROP_META[p.tile] ?? { scale: 1, ay: 0.9 }
        const spr = new Sprite(tex)
        spr.scale.set(m.scale)
        spr.anchor.set(0.5, m.ay)
        const { sx, sy } = iso(p.x, p.y)
        spr.position.set(sx, sy)
        spr.zIndex = sy
        objects.addChild(spr)
      }

      // --- thor ---
      const thor = new Sprite(idle['south'])
      thor.anchor.set(0.5, 0.86)
      const spawn = iso(CAMPUS_SPAWN.x, CAMPUS_SPAWN.y)
      const pos = { x: spawn.sx, y: spawn.sy }
      thor.position.set(pos.x, pos.y)
      objects.addChild(thor)

      const prompt = new Text({ text: '', style: { fill: 0xffffff, fontSize: 15, fontFamily: 'monospace', stroke: { color: 0x141517, width: 4 } } })
      instance.stage.addChild(prompt)

      const speed = 1.7
      let facing8 = 'south'
      let animTime = 0
      let nearGrape: string | null = null

      const canStand = (sx: number, sy: number) => {
        const { x, y } = unIso(sx, sy)
        return !blockedAt(Math.floor(x + 0.5), Math.floor(y + 0.5))
      }

      instance.ticker.add((ticker) => {
        let dx = 0, dy = 0
        if (keys['arrowleft'] || keys['a']) dx -= speed
        if (keys['arrowright'] || keys['d']) dx += speed
        if (keys['arrowup'] || keys['w']) dy -= speed
        if (keys['arrowdown'] || keys['s']) dy += speed
        const moving = dx !== 0 || dy !== 0

        if (canStand(pos.x + dx, pos.y)) pos.x += dx
        if (canStand(pos.x, pos.y + dy)) pos.y += dy
        thor.position.set(pos.x, pos.y)
        thor.zIndex = pos.y

        if (moving) {
          facing8 = dirFromAngle(dx, dy)
          const card = cardinalOf(facing8)
          animTime += ticker.deltaMS
          thor.texture = walk[card][Math.floor(animTime / 150) % 6]
        } else {
          animTime += ticker.deltaMS
          const f = idleAnim[cardinalOf(facing8)]
          thor.texture = f ? f[Math.floor(animTime / 220) % f.length] : (idle[facing8] ?? idle['south'])
        }

        const vw = instance.renderer.width
        const vh = instance.renderer.height
        world.x = vw / 2 - pos.x
        world.y = vh / 2 - pos.y

        // nearest building door (cell just south of a building front)
        nearGrape = null
        const { x, y } = unIso(pos.x, pos.y)
        for (const b of CAMPUS) {
          if (!b.grapeId) continue
          const dxm = x - (b.x + b.w / 2)
          const dym = y - (b.y + b.d)
          if (Math.abs(dxm) < b.w / 2 + 0.6 && dym > -0.6 && dym < 1.8) { nearGrape = b.grapeId; break }
        }
        prompt.text = nearGrape ? 'Press E to enter' : ''
        prompt.position.set(20, vh - 38)
      })

      onEnterKey = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'e' && nearGrape) onEnter(nearGrape) }
      window.addEventListener('keydown', onEnterKey)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
    }

    void start()
    return () => {
      destroyed = true
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (onEnterKey) window.removeEventListener('keydown', onEnterKey)
      if (app) app.destroy(true, { children: true })
    }
  }, [onEnter])

  return <div ref={ref} style={{ position: 'fixed', inset: 0 }} />
}
