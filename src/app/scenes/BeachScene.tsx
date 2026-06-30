import { useEffect, useRef } from 'react'

// Phase I-1: the opening beach as an actual COMPOSED scene (not loose images). Warm dusk, a
// faint city on the horizon, the dock jutting into the water, the tavern and palm grove framing
// the bay, props clustered, Thor small for immersive scale. Built to the 8 gold-standard rules
// (enclosure, dense clusters, warm upper-left light + AO, layered height, focal anchor).

const A = {
  tavern: '/art/intro/tavern.png',
  palms: '/art/intro/palmgrove.png',
  dock: '/art/intro/dock.png',
  beach: '/art/intro/beach-tiles.png',
  thor: '/art/characters/thor/south-east.png',
}

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

export default function BeachScene() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let raf = 0, t0 = performance.now()
    const imgs: Record<string, HTMLImageElement> = {}
    let tiles: { sand: [number, number]; water: [number, number] } | null = null

    Promise.all([
      ...Object.entries(A).map(([k, u]) => load(u).then((i) => { imgs[k] = i })),
      fetch('/art/intro/beach-tiles.json').then((r) => r.json()).then((m) => {
        const find = (c: string) => {
          const tl = m.tileset_data.tiles.find((t: { corners: Record<string, string> }) =>
            Object.values(t.corners).every((v) => v === c))
          return [tl.bounding_box.x, tl.bounding_box.y] as [number, number]
        }
        tiles = { sand: find('upper'), water: find('lower') }
      }),
    ]).then(() => { raf = requestAnimationFrame(frame) }).catch((e) => console.error(e))

    function frame(now: number) {
      const W = cv.width = cv.clientWidth, H = cv.height = cv.clientHeight
      ctx.imageSmoothingEnabled = false
      const t = (now - t0) / 1000
      const horizon = H * 0.30

      // --- dusk sky ---
      const sky = ctx.createLinearGradient(0, 0, 0, horizon)
      sky.addColorStop(0, '#3a3160'); sky.addColorStop(0.55, '#8a5a6e'); sky.addColorStop(1, '#e7a86b')
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon)
      // sun glow
      const g = ctx.createRadialGradient(W * 0.72, horizon, 4, W * 0.72, horizon, H * 0.4)
      g.addColorStop(0, 'rgba(255,228,170,.9)'); g.addColorStop(1, 'rgba(255,228,170,0)')
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon * 1.3)
      // faint city silhouette on the horizon
      ctx.fillStyle = 'rgba(40,30,55,.55)'
      let cx = 0
      while (cx < W) {
        const bw = 14 + (Math.sin(cx * 0.7) * 0.5 + 0.5) * 26
        const bh = 14 + (Math.sin(cx * 1.3 + 2) * 0.5 + 0.5) * 46
        ctx.fillRect(cx, horizon - bh, bw, bh)
        cx += bw + 3
      }

      // --- water (tiled, warm-graded) ---
      if (tiles && imgs.beach) {
        const ts = 36, [wx, wy] = tiles.water
        for (let y = horizon; y < H * 0.52; y += ts) for (let x = 0; x < W; x += ts)
          ctx.drawImage(imgs.beach, wx, wy, 32, 32, x, y, ts + 1, ts + 1)
        // warm dusk wash on the water + reflection band under the sun
        ctx.fillStyle = 'rgba(231,150,90,.28)'; ctx.fillRect(0, horizon, W, H * 0.52 - horizon)
        const refl = ctx.createLinearGradient(0, horizon, 0, H * 0.52)
        refl.addColorStop(0, 'rgba(255,224,160,.5)'); refl.addColorStop(1, 'rgba(255,224,160,0)')
        ctx.fillStyle = refl; ctx.fillRect(W * 0.58, horizon, W * 0.28, H * 0.5 - horizon)
        // --- sand (tiled) ---
        const [sx, sy] = tiles.sand
        for (let y = Math.floor(H * 0.48); y < H + ts; y += ts) for (let x = 0; x < W; x += ts)
          ctx.drawImage(imgs.beach, sx, sy, 32, 32, x, y, ts + 1, ts + 1)
        // foam shoreline
        ctx.fillStyle = 'rgba(255,250,240,.7)'
        for (let x = 0; x < W; x += 6) ctx.fillRect(x, H * 0.50 + Math.sin(x * 0.05 + t) * 4, 5, 3)
      }

      // --- props (depth-sorted by base y), with a soft contact shadow each ---
      const place: { img: HTMLImageElement; cx: number; by: number; s: number }[] = [
        { img: imgs.dock, cx: W * 0.5, by: H * 0.56, s: 1.15 },     // jutting into the water (back)
        { img: imgs.tavern, cx: W * 0.20, by: H * 0.74, s: 1.0 },   // left framing
        { img: imgs.palms, cx: W * 0.82, by: H * 0.80, s: 1.05 },   // right framing
      ].filter((p) => p.img)
      place.sort((a, b) => a.by - b.by)
      for (const p of place) {
        const w = p.img.width * 0.5 * p.s, h = p.img.height * 0.5 * p.s
        ctx.globalAlpha = 0.28; ctx.fillStyle = '#3a2418'
        ctx.beginPath(); ctx.ellipse(p.cx, p.by, w * 0.32, w * 0.1, 0, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
        ctx.drawImage(p.img, Math.round(p.cx - w / 2), Math.round(p.by - h), Math.round(w), Math.round(h))
      }

      // --- Thor, small, on the sand (immersive scale) ---
      if (imgs.thor) {
        const tw = imgs.thor.width * 0.7, th = imgs.thor.height * 0.7
        const tx = W * 0.46, ty = H * 0.86
        ctx.globalAlpha = 0.3; ctx.fillStyle = '#3a2418'
        ctx.beginPath(); ctx.ellipse(tx, ty, tw * 0.4, tw * 0.16, 0, 0, Math.PI * 2); ctx.fill()
        ctx.globalAlpha = 1
        ctx.drawImage(imgs.thor, Math.round(tx - tw / 2), Math.round(ty - th), Math.round(tw), Math.round(th))
      }

      // --- warm dusk grade + vignette ---
      ctx.globalCompositeOperation = 'soft-light'
      ctx.fillStyle = 'rgba(255,180,90,.35)'; ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'multiply'
      const vig = ctx.createRadialGradient(W * 0.5, H * 0.55, H * 0.3, W * 0.5, H * 0.5, H * 0.85)
      vig.addColorStop(0, 'rgba(255,255,255,1)'); vig.addColorStop(1, 'rgba(150,120,150,1)')
      ctx.fillStyle = vig; ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'

      raf = requestAnimationFrame(frame)
    }

    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block', background: '#2a2540' }} />
}
