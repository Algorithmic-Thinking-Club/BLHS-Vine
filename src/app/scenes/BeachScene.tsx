import { useEffect, useRef } from 'react'

// Phase I-1, take 3 — the RIGHT method. The beach is a single cohesive PixelLab scene (dense,
// daytime, integrated, no hand-placed structures so nothing floats). It sits as a cove in a
// bright tropical ocean, and only the characters (Thor now, the bottle next) composite on top.

const A = { cove: '/art/intro/beach-scene.png', thor: '/art/characters/thor/south-east.png' }
function load(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}

export default function BeachScene() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = ref.current!
    const ctx = cv.getContext('2d')!
    let raf = 0
    const t0 = performance.now()
    const imgs: Record<string, HTMLImageElement> = {}
    Promise.all(Object.entries(A).map(([k, u]) => load(u).then((i) => { imgs[k] = i })))
      .then(() => { raf = requestAnimationFrame(frame) })

    function frame(now: number) {
      const W = (cv.width = cv.clientWidth), H = (cv.height = cv.clientHeight)
      ctx.imageSmoothingEnabled = false
      const t = (now - t0) / 1000

      // --- bright daytime tropical ocean ---
      const sea = ctx.createLinearGradient(0, 0, 0, H)
      sea.addColorStop(0, '#5fc7cf'); sea.addColorStop(0.5, '#37a7c0'); sea.addColorStop(1, '#1f7fa6')
      ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H)
      // gentle sun-glint wave lines on the water
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 2
      for (let y = 0; y < H; y += 26) {
        ctx.beginPath()
        for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.02 + t * 0.6 + y) * 4)
        ctx.stroke()
      }

      const cove = imgs.cove
      if (cove) {
        // draw the cohesive cove large + centred (the beach is the star)
        const scale = Math.min((W * 0.78) / cove.width, (H * 0.92) / cove.height)
        const cw = cove.width * scale, ch = cove.height * scale
        const cx = (W - cw) / 2, cy = (H - ch) / 2
        // soft contact shadow / foam ring where the cove meets the sea
        ctx.save()
        ctx.globalAlpha = 0.5; ctx.fillStyle = '#bfeef0'
        ctx.beginPath(); ctx.ellipse(cx + cw * 0.5, cy + ch * 0.62, cw * 0.5, ch * 0.42, 0, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
        ctx.drawImage(cove, Math.round(cx), Math.round(cy), Math.round(cw), Math.round(ch))

        // --- Thor on the open sand of the cove (small for immersive scale) ---
        if (imgs.thor) {
          const tw = imgs.thor.width * scale * 0.9, th = imgs.thor.height * scale * 0.9
          const tx = cx + cw * 0.56, ty = cy + ch * 0.64
          ctx.globalAlpha = 0.3; ctx.fillStyle = '#7a5a32'
          ctx.beginPath(); ctx.ellipse(tx, ty, tw * 0.4, tw * 0.16, 0, 0, Math.PI * 2); ctx.fill()
          ctx.globalAlpha = 1
          ctx.drawImage(imgs.thor, Math.round(tx - tw / 2), Math.round(ty - th), Math.round(tw), Math.round(th))
        }
      }

      raf = requestAnimationFrame(frame)
    }
    return () => cancelAnimationFrame(raf)
  }, [])

  return <canvas ref={ref} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block', background: '#1f7fa6' }} />
}
