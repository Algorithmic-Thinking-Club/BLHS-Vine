import { useEffect, useRef } from 'react'

// PHASE I-1 / I-2 — the opening beach, built as a COMPOSED high-angle scene (the TavernWorld
// way for organic spaces): a golden-hour shot with a faint city skyline at the back, a distant
// teal sea, an animated foam shoreline, and a painterly sand foreground framed by palms and
// rock clusters. Thor genuinely WALKS the sand (arrows / WASD), depth-sorted among the props so
// he passes behind the foreground palms and in front of the back grove. The art is PixelLab
// (hero palm + reference-locked rocks / driftwood / grass); the engine composes, grounds, lights
// and grades it. Nothing is a flat billboard and the scene fills the viewport so no edge shows.
//
// Authored in a fixed 1280x720 design space and "cover"-scaled to any window, so the framing
// holds and the player never sees past the world.

const VW = 1280, VH = 720
const SUN = { x: 360, y: 90 } // warm key, upper-left

// designed prop placement. y is the base (feet) in design space; smaller y = farther back.
// every prop sits in a cluster of 3-5, nothing isolated (gold-standard rule 2).
type Spec = { img: string; x: number; y: number; s: number }
const PROPS: Spec[] = [
  // --- back-left grove (far, small) ---
  { img: 'palmB', x: 250, y: 330, s: 0.62 },
  { img: 'palmA', x: 360, y: 300, s: 0.52 },
  { img: 'grass', x: 300, y: 350, s: 0.6 },
  { img: 'rocks', x: 150, y: 360, s: 0.55 },
  // --- back headland right (encloses the NE) ---
  { img: 'rocks', x: 1040, y: 320, s: 0.9 },
  { img: 'palmA', x: 1150, y: 300, s: 0.66 },
  { img: 'palmB', x: 980, y: 300, s: 0.6 },
  { img: 'grass', x: 1100, y: 345, s: 0.6 },
  // --- mid-beach focal anchor: the boulder cluster (panther-rock placeholder) ---
  { img: 'rocks', x: 660, y: 452, s: 1.25 },
  { img: 'grass', x: 565, y: 470, s: 0.85 },
  { img: 'driftwood', x: 745, y: 470, s: 0.78 },
  { img: 'grass', x: 720, y: 430, s: 0.6 },
  // --- left foreground frame (Thor passes behind this big palm) ---
  { img: 'palmB', x: 120, y: 610, s: 1.7 },
  { img: 'grass', x: 70, y: 660, s: 1.0 },
  { img: 'rocks', x: 230, y: 670, s: 0.85 },
  { img: 'driftwood', x: 150, y: 700, s: 0.7 },
  // --- right foreground frame ---
  { img: 'palmB', x: 1200, y: 660, s: 1.85 },
  { img: 'palmA', x: 1110, y: 700, s: 1.2 },
  { img: 'grass', x: 1230, y: 705, s: 1.0 },
  // --- scatter clusters on open sand (grouped, never single) ---
  { img: 'grass', x: 470, y: 640, s: 0.8 },
  { img: 'grass', x: 520, y: 660, s: 0.62 },
  { img: 'driftwood', x: 900, y: 600, s: 0.7 },
  { img: 'grass', x: 950, y: 615, s: 0.6 },
]
const NAT: Record<string, [number, number]> = {
  palmA: [192, 192], palmB: [192, 192], rocks: [160, 160], driftwood: [160, 160], grass: [120, 120],
}
const SRC: Record<string, string> = {
  palmA: '/art/intro/palm-a.png', palmB: '/art/intro/palm-b.png', rocks: '/art/intro/rocks.png',
  driftwood: '/art/intro/driftwood.png', grass: '/art/intro/grass.png',
}

const DIRS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east']
function dirOf(dx: number, dy: number) {
  const a = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2)
  return DIRS[Math.round(a / (Math.PI / 4)) % 8]
}
function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })
}
function rnd(n: number) { const x = Math.sin(n * 127.1) * 43758.5453; return x - Math.floor(x) }

// the wavy shoreline: design-space y of the sand/sea boundary at a given x (animated breathing)
function shoreY(x: number, t: number) {
  return 250 + 14 * Math.sin(x * 0.006 + 0.4) + 8 * Math.sin(x * 0.017 - t * 0.5) + 6 * Math.sin(x * 0.031 + t * 0.7)
}

export default function BeachScene() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let raf = 0
    const t0 = performance.now()

    const props: Record<string, HTMLImageElement> = {}
    const thor: Record<string, HTMLImageElement[]> = {}
    let ready = false

    // Thor state
    const P = { x: 640, y: 560, dir: 'south', moving: false, frame: 0 }
    const keys = new Set<string>()
    const onDown = (e: KeyboardEvent) => { keys.add(e.key.toLowerCase()); if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) e.preventDefault() }
    const onUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase())
    window.addEventListener('keydown', onDown); window.addEventListener('keyup', onUp)

    // pre-rendered static ground (sky, city, sea base, painterly sand) in design space
    const bg = document.createElement('canvas'); bg.width = VW; bg.height = VH
    function paintGround() {
      const g = bg.getContext('2d')!
      // sky (golden hour)
      const sky = g.createLinearGradient(0, 0, 0, 250)
      sky.addColorStop(0, '#f6d79e'); sky.addColorStop(0.5, '#f3c98a'); sky.addColorStop(1, '#dcc79a')
      g.fillStyle = sky; g.fillRect(0, 0, VW, 250)
      // faint city skyline on the horizon (desaturated, hazy)
      g.fillStyle = 'rgba(120,128,140,0.34)'
      let cx = -20
      while (cx < VW + 40) {
        const w = 26 + rnd(cx) * 46, h = 26 + rnd(cx * 1.7) * 58
        g.fillRect(cx, 150 - h, w, h)
        // a couple of taller towers
        if (rnd(cx * 3.1) > 0.82) g.fillRect(cx + w * 0.4, 150 - h - 26, 10, 26)
        cx += w + 4 + rnd(cx * 2.3) * 14
      }
      // haze band over the skyline base
      const haze = g.createLinearGradient(0, 110, 0, 165)
      haze.addColorStop(0, 'rgba(246,215,158,0)'); haze.addColorStop(1, 'rgba(246,215,158,0.65)')
      g.fillStyle = haze; g.fillRect(0, 110, VW, 55)
      // sea base (horizon teal -> brighter shallow near shore)
      const sea = g.createLinearGradient(0, 150, 0, 270)
      sea.addColorStop(0, '#1f6f7e'); sea.addColorStop(0.55, '#2f93a0'); sea.addColorStop(1, '#5cc3bd')
      g.fillStyle = sea; g.fillRect(0, 150, VW, 130)
      // sand base (fill below an average shore, real boundary drawn per-frame)
      const sand = g.createLinearGradient(0, 240, 0, VH)
      sand.addColorStop(0, '#e9cd92'); sand.addColorStop(0.4, '#f0d8a0'); sand.addColorStop(1, '#e6c184')
      g.fillStyle = sand; g.fillRect(0, 236, VW, VH - 236)
      // painterly sand speckle + soft dune shading (done once)
      for (let i = 0; i < 5200; i++) {
        const x = rnd(i) * VW, yy = 250 + rnd(i * 1.3) * (VH - 250)
        const v = rnd(i * 2.1)
        g.fillStyle = v > 0.6 ? 'rgba(255,246,214,0.20)' : v > 0.3 ? 'rgba(176,140,80,0.16)' : 'rgba(208,176,116,0.14)'
        const s = 1 + (rnd(i * 3.7) > 0.85 ? 1 : 0)
        g.fillRect(x, yy, s, s)
      }
      for (let i = 0; i < 26; i++) {
        const x = rnd(i * 5.5) * VW, yy = 280 + rnd(i * 7.1) * (VH - 300)
        const r = 60 + rnd(i * 9.3) * 120
        const dune = g.createRadialGradient(x, yy, 0, x, yy, r)
        dune.addColorStop(0, 'rgba(150,120,70,0.06)'); dune.addColorStop(1, 'rgba(150,120,70,0)')
        g.fillStyle = dune; g.beginPath(); g.arc(x, yy, r, 0, Math.PI * 2); g.fill()
      }
      // broad warm/cool tonal patches so the open sand is never one dead tan
      for (let i = 0; i < 16; i++) {
        const x = rnd(i * 11.3) * VW, yy = 300 + rnd(i * 13.7) * (VH - 320)
        const r = 110 + rnd(i * 17.1) * 200
        const warm = rnd(i * 4.4) > 0.5
        const tp = g.createRadialGradient(x, yy, 0, x, yy, r)
        tp.addColorStop(0, warm ? 'rgba(255,228,170,0.10)' : 'rgba(150,158,140,0.08)')
        tp.addColorStop(1, 'rgba(0,0,0,0)')
        g.fillStyle = tp; g.beginPath(); g.arc(x, yy, r, 0, Math.PI * 2); g.fill()
      }
      // scattered micro-detail: pebble clusters, shells, dry seaweed (grouped, never single)
      for (let c = 0; c < 14; c++) {
        const cxp = 120 + rnd(c * 6.1) * (VW - 240), cyp = 300 + rnd(c * 8.3) * (VH - 330)
        const n = 3 + Math.floor(rnd(c * 2.7) * 4)
        for (let k = 0; k < n; k++) {
          const px = cxp + (rnd(c * 9 + k) - 0.5) * 46, py = cyp + (rnd(c * 5 + k * 3) - 0.5) * 30
          const r = 1.6 + rnd(c + k * 7) * 2.6
          g.fillStyle = 'rgba(70,86,78,0.18)'; g.beginPath(); g.ellipse(px + 1, py + 1, r, r * 0.6, 0, 0, Math.PI * 2); g.fill()
          g.fillStyle = rnd(c * 3 + k) > 0.5 ? '#b3a487' : '#8f8470'
          g.beginPath(); g.ellipse(px, py, r, r * 0.62, 0, 0, Math.PI * 2); g.fill()
        }
      }
      // a few shells (tiny cream/pink) and seaweed wisps near the shore line
      for (let i = 0; i < 22; i++) {
        const x = 120 + rnd(i * 14.2) * (VW - 240), y = 268 + rnd(i * 3.9) * 120
        g.fillStyle = rnd(i) > 0.5 ? 'rgba(244,222,206,0.9)' : 'rgba(232,196,190,0.85)'
        g.beginPath(); g.ellipse(x, y, 2.4, 1.8, rnd(i * 2) * 3, 0, Math.PI * 2); g.fill()
      }
      for (let i = 0; i < 8; i++) {
        const x = 200 + rnd(i * 21.1) * (VW - 400), y = 262 + rnd(i * 6.6) * 30
        g.strokeStyle = 'rgba(74,96,62,0.5)'; g.lineWidth = 1.4
        g.beginPath(); g.moveTo(x, y)
        for (let s = 1; s <= 5; s++) g.lineTo(x + Math.sin(s + i) * 6, y + s * 4)
        g.stroke()
      }
    }
    paintGround()

    Promise.all([
      ...Object.entries(SRC).map(([k, u]) => load(u).then((i) => { if (i) props[k] = i })),
      ...DIRS.map((d) => Promise.all([0, 1, 2, 3, 4, 5].map((n) => load(`/art/characters/thor/walk/${d}/${n}.png`)))
        .then((arr) => { thor[d] = arr.filter(Boolean) as HTMLImageElement[] })),
    ]).then(() => { ready = true; raf = requestAnimationFrame(frame) })

    function frame(now: number) {
      const t = (now - t0) / 1000
      const W = (cv.width = cv.clientWidth), H = (cv.height = cv.clientHeight)
      ctx.imageSmoothingEnabled = false
      // cover-scale design space to the window (never letterbox, never show an edge)
      const scale = Math.max(W / VW, H / VH)
      const ox = (W - VW * scale) / 2, oy = (H - VH * scale) / 2
      ctx.setTransform(scale, 0, 0, scale, ox, oy)

      // --- move Thor ---
      let dx = 0, dy = 0
      if (keys.has('arrowleft') || keys.has('a')) dx -= 1
      if (keys.has('arrowright') || keys.has('d')) dx += 1
      if (keys.has('arrowup') || keys.has('w')) dy -= 1
      if (keys.has('arrowdown') || keys.has('s')) dy += 1
      P.moving = dx !== 0 || dy !== 0
      if (P.moving) {
        const l = Math.hypot(dx, dy); const sp = 3.1
        const nx = P.x + (dx / l) * sp, ny = P.y + (dy / l) * sp
        P.x = Math.max(70, Math.min(VW - 70, nx))
        // keep him on the sand: below the shoreline + a wet margin, above the bottom
        P.y = Math.max(shoreY(P.x, t) + 26, Math.min(VH - 30, ny))
        P.dir = dirOf(dx, dy)
        P.frame = Math.floor(t * 9) % 6
      } else P.frame = 0

      // 1) static ground
      ctx.drawImage(bg, 0, 0)

      // 2) animated sea: drifting crest lines + sun sparkle (over the sea band only)
      ctx.save(); ctx.beginPath(); ctx.rect(0, 150, VW, 120); ctx.clip()
      ctx.strokeStyle = 'rgba(230,250,246,0.30)'; ctx.lineWidth = 1
      for (let i = 0; i < 22; i++) {
        const yy = 162 + i * 5
        const ph = t * (0.25 + i * 0.015) + i
        ctx.beginPath()
        for (let x = 0; x <= VW; x += 16) {
          const yo = yy + Math.sin(x * 0.02 + ph) * 1.6
          x === 0 ? ctx.moveTo(x, yo) : ctx.lineTo(x, yo)
        }
        ctx.globalAlpha = 0.12 + 0.12 * (i / 22); ctx.stroke()
      }
      ctx.globalAlpha = 1
      // sun sparkle path on the water under the sun
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < 60; i++) {
        const sx = SUN.x + (rnd(i) - 0.5) * 260, sy = 175 + rnd(i * 2.3) * 80
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i))
        ctx.fillStyle = `rgba(255,250,228,${0.22 * tw})`
        ctx.fillRect(sx, sy + Math.sin(t + i) * 1.5, 3, 2)
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.restore()

      // 3) shoreline: wet sand band + lacey animated foam following shoreY
      ctx.beginPath(); ctx.moveTo(0, 150)
      for (let x = 0; x <= VW; x += 8) ctx.lineTo(x, shoreY(x, t))
      ctx.lineTo(VW, 150); ctx.closePath()
      // (sea already painted; this path is just to compute the foam line below)
      // wet sand strip
      ctx.fillStyle = 'rgba(168,134,82,0.45)'
      ctx.beginPath(); ctx.moveTo(0, VH)
      for (let x = 0; x <= VW; x += 8) ctx.lineTo(x, shoreY(x, t) + 4)
      ctx.lineTo(VW, VH); ctx.closePath(); ctx.fill()
      // foam edge (two offset lacey bands)
      for (let b = 0; b < 2; b++) {
        ctx.beginPath()
        for (let x = 0; x <= VW; x += 6) {
          const yo = shoreY(x, t) + b * 5 + Math.sin(x * 0.09 + t * 2 + b) * 2.2 + Math.sin(x * 0.21 - t * 1.3) * 1.4
          x === 0 ? ctx.moveTo(x, yo) : ctx.lineTo(x, yo)
        }
        ctx.lineWidth = 3 - b; ctx.strokeStyle = `rgba(255,255,255,${0.8 - b * 0.35})`; ctx.stroke()
      }
      // foam flecks
      for (let i = 0; i < 70; i++) {
        const x = rnd(i + Math.floor(t * 1.5)) * VW
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.fillRect(x, shoreY(x, t) + rnd(i * 1.7) * 6, 2, 1)
      }

      // subtle panther reference: a trail of paw prints in the wet sand
      ctx.fillStyle = 'rgba(120,92,52,0.30)'
      for (let i = 0; i < 7; i++) {
        const px = 760 - i * 26, py = shoreY(px, t) + 30 + i * 22 + (i % 2) * 8
        for (const [ox2, oy2] of [[0, 0], [4, -3], [-4, -3], [0, -7]] as const) {
          ctx.beginPath(); ctx.ellipse(px + ox2, py + oy2, 2.2, 1.6, 0, 0, Math.PI * 2); ctx.fill()
        }
      }

      // 4) depth-sorted props + Thor
      type Draw = { y: number; render: () => void }
      const list: Draw[] = PROPS.map((p) => {
        const img = props[p.img]; const [nw, nh] = NAT[p.img]
        return {
          y: p.y, render: () => {
            if (!img) return
            const w = nw * p.s, h = nh * p.s
            // contact shadow (sun upper-left -> shadow to lower-right)
            ctx.save(); ctx.globalAlpha = 0.22; ctx.fillStyle = '#23463f'
            ctx.beginPath(); ctx.ellipse(p.x + w * 0.06, p.y - 2, w * 0.32, w * 0.12, 0, 0, Math.PI * 2); ctx.fill()
            ctx.restore()
            ctx.drawImage(img, Math.round(p.x - w / 2), Math.round(p.y - h), Math.round(w), Math.round(h))
          },
        }
      })
      list.push({
        y: P.y, render: () => {
          const frames = thor[P.dir] || thor['south']; const img = frames && frames[P.frame % frames.length]
          if (!img) return
          const sc = 1.05 + (P.y - 250) / (VH - 250) * 0.45 // a touch bigger in the foreground
          const w = img.width * sc, h = img.height * sc
          ctx.save(); ctx.globalAlpha = 0.28; ctx.fillStyle = '#23463f'
          ctx.beginPath(); ctx.ellipse(P.x + 3, P.y - 2, w * 0.34, w * 0.15, 0, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
          ctx.drawImage(img, Math.round(P.x - w / 2), Math.round(P.y - h), Math.round(w), Math.round(h))
        },
      })
      list.sort((a, b) => a.y - b.y).forEach((d) => d.render())

      // 5) one warm grade + soft light vignette (lifts, never darkens to mud)
      ctx.globalCompositeOperation = 'soft-light'
      ctx.fillStyle = 'rgba(255,236,190,0.16)'; ctx.fillRect(0, 0, VW, VH)
      ctx.globalCompositeOperation = 'overlay'
      const sun = ctx.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 900)
      sun.addColorStop(0, 'rgba(255,244,206,0.22)'); sun.addColorStop(1, 'rgba(255,244,206,0)')
      ctx.fillStyle = sun; ctx.fillRect(0, 0, VW, VH)
      ctx.globalCompositeOperation = 'multiply'
      const vig = ctx.createRadialGradient(VW / 2, VH * 0.5, VH * 0.45, VW / 2, VH * 0.55, VW * 0.72)
      vig.addColorStop(0, 'rgba(255,255,255,1)'); vig.addColorStop(1, 'rgba(214,206,180,1)')
      ctx.fillStyle = vig; ctx.fillRect(0, 0, VW, VH)
      ctx.globalCompositeOperation = 'source-over'

      raf = requestAnimationFrame(frame)
    }

    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [])

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block', background: '#e9cd92' }} />
}
