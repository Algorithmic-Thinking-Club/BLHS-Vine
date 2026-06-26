import { useEffect, useRef } from 'react'
import { Application, Assets, Container, Rectangle, Sprite, Text, Texture, TextureSource } from 'pixi.js'

const TILE = 32
const COLS = 60
const ROWS = 40
const WORLD_W = COLS * TILE
const WORLD_H = ROWS * TILE

// Wang corner -> spritesheet pixel offset, keyed NW NE SW SE (grass=1, concrete=0). From grass-concrete.json.
const WANG: Record<string, [number, number]> = {
  '1101': [0, 0], '1010': [32, 0], '0100': [64, 0], '1100': [96, 0],
  '0110': [0, 32], '1000': [32, 32], '0000': [64, 32], '0001': [96, 32],
  '1011': [0, 64], '0011': [32, 64], '0010': [64, 64], '0101': [96, 64],
  '1111': [0, 96], '1110': [32, 96], '1001': [64, 96], '0111': [96, 96],
}

// 1 = grass, 0 = concrete walkway. Central spine + cross path that reaches each building front.
function terrain(vx: number, vy: number): number {
  const spine = vx >= 28 && vx <= 32 && vy >= 15
  const cross = vy >= 26 && vy <= 28 && vx >= 12 && vx <= 48
  const commonsApron = vx >= 23 && vx <= 37 && vy >= 16 && vy <= 18
  return spine || cross || commonsApron ? 0 : 1
}

interface BuildingDef {
  src: string
  tileX: number
  tileY: number
  label: string
  grapeId?: string
}

const buildings: BuildingDef[] = [
  { src: '/art/buildings/commons.png', tileX: 30, tileY: 14, label: 'Commons' },
  { src: '/art/buildings/blhs-building-1.png', tileX: 14, tileY: 24, label: 'STEM Wing', grapeId: 'atc' },
  { src: '/art/buildings/gym.png', tileX: 46, tileY: 24, label: 'Gym' },
  { src: '/art/buildings/pac.png', tileX: 30, tileY: 31, label: 'PAC' },
]

const walkDirs = ['south', 'north', 'east', 'west']
const idleDirs = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']

export function CampusOverworld({ onEnter }: { onEnter: (grapeId: string) => void }) {
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
      await instance.init({ background: 0x4f6a36, antialias: false, resizeTo: ref.current ?? window })
      if (destroyed || !ref.current) { instance.destroy(true); return }
      app = instance
      ref.current.appendChild(instance.canvas)

      const sheet = await Assets.load('/art/tilesets/grass-concrete.png')
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
          const frames: Texture[] = []
          for (let i = 0; i < 4; i++) frames.push(await Assets.load(`/art/characters/thor/idle/${d}/${i}.png`))
          idleAnim[d] = frames
        } catch {
          // idle frames not present; static fallback
        }
      }
      if (destroyed) { instance.destroy(true); return }

      const world = new Container()
      instance.stage.addChild(world)

      const tileTex: Record<string, Texture> = {}
      const ground = new Container()
      world.addChild(ground)
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const key = `${terrain(c, r)}${terrain(c + 1, r)}${terrain(c, r + 1)}${terrain(c + 1, r + 1)}`
          const off = WANG[key] ?? WANG['1111']
          const k = off.join(',')
          if (!tileTex[k]) tileTex[k] = new Texture({ source: sheet.source, frame: new Rectangle(off[0], off[1], TILE, TILE) })
          const t = new Sprite(tileTex[k])
          t.position.set(c * TILE, r * TILE)
          ground.addChild(t)
        }
      }

      const colliders: { x: number; y: number; w: number; h: number }[] = []
      const doors: { x: number; y: number; w: number; h: number; grapeId: string }[] = []
      for (const b of buildings) {
        const tex = await Assets.load(b.src)
        const spr = new Sprite(tex)
        spr.anchor.set(0.5, 1)
        const px = b.tileX * TILE
        const py = b.tileY * TILE
        spr.position.set(px, py)
        world.addChild(spr)
        const label = new Text({ text: b.label, style: { fill: 0xf4f1ea, fontSize: 13, fontFamily: 'monospace', stroke: { color: 0x141517, width: 4 } } })
        label.anchor.set(0.5, 1)
        label.position.set(px, py - tex.height + 6)
        world.addChild(label)
        colliders.push({ x: px - tex.width * 0.4, y: py - tex.height * 0.42, w: tex.width * 0.8, h: tex.height * 0.34 })
        if (b.grapeId) doors.push({ x: px - 44, y: py - 4, w: 88, h: 52, grapeId: b.grapeId })
      }

      const thor = new Sprite(idle['south'])
      thor.anchor.set(0.5, 0.82)
      thor.scale.set(1.3)
      const pos = { x: 30 * TILE, y: 36 * TILE }
      thor.position.set(pos.x, pos.y)
      world.addChild(thor)

      const prompt = new Text({ text: '', style: { fill: 0xffffff, fontSize: 15, fontFamily: 'monospace', stroke: { color: 0x141517, width: 4 } } })
      instance.stage.addChild(prompt)

      const speed = 1.7
      const hit = (x: number, y: number) =>
        colliders.some((b) => x + 9 > b.x && x - 9 < b.x + b.w && y + 4 > b.y && y - 4 < b.y + b.h)

      let facingCard = 'south'
      let animTime = 0
      let nearGrape: string | null = null

      instance.ticker.add((ticker) => {
        let dx = 0
        let dy = 0
        if (keys['arrowleft'] || keys['a']) dx -= speed
        if (keys['arrowright'] || keys['d']) dx += speed
        if (keys['arrowup'] || keys['w']) dy -= speed
        if (keys['arrowdown'] || keys['s']) dy += speed
        const moving = dx !== 0 || dy !== 0

        const nx = Math.max(12, Math.min(WORLD_W - 12, pos.x + dx))
        const ny = Math.max(12, Math.min(WORLD_H - 12, pos.y + dy))
        if (!hit(nx, pos.y)) pos.x = nx
        if (!hit(pos.x, ny)) pos.y = ny
        thor.position.set(pos.x, pos.y)

        if (moving) {
          const card = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'east' : 'west') : (dy > 0 ? 'south' : 'north')
          facingCard = card
          animTime += ticker.deltaMS
          thor.texture = walk[card][Math.floor(animTime / 150) % 6]
        } else {
          animTime += ticker.deltaMS
          const f = idleAnim[facingCard]
          thor.texture = f ? f[Math.floor(animTime / 220) % f.length] : (idle[facingCard] ?? idle['south'])
        }

        const vw = instance.renderer.width
        const vh = instance.renderer.height
        world.x = Math.min(Math.max(vw / 2 - pos.x, vw - WORLD_W), 0)
        world.y = Math.min(Math.max(vh / 2 - pos.y, vh - WORLD_H), 0)

        nearGrape = null
        for (const d of doors) {
          if (pos.x > d.x && pos.x < d.x + d.w && pos.y > d.y && pos.y < d.y + d.h) { nearGrape = d.grapeId; break }
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
