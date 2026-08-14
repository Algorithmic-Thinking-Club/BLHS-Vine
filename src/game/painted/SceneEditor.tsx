// THE SCENE EDITOR — the human half of the painted-scene system (B+C, 2026-07-23).
// A generated place is ONE full-frame painting; the mechanics are polygons ASH
// draws over it in minutes (the one job no auto-tracer gets right). This editor:
//   - loads any scene image (?img=/art/... or Open from disk, no copying needed)
//   - polygons tagged L0/ramp01/L1/ramp12/L2/blocked, drawn in paint order
//   - rasterizes the EXACT levels.png the PaintedScene runtime consumes
//     (0=blocked, L0=40, ramp01=50, L1=60, ramp12=70, L2=80; quantized, no AA)
//   - T = test walk: Thor with the runtime's exact step rules (hip probes,
//     level-step <=10, escape clause) so collision is FELT before export
//   - exports levels.png + a JSON of the polygons (re-importable, autosaved)
import { useEffect, useRef, useState } from 'react'

type LevelKey = 'blocked' | 'L0' | 'ramp01' | 'L1' | 'ramp12' | 'L2'
interface Poly { level: LevelKey; pts: [number, number][] }

const LVL_VALUE: Record<LevelKey, number> = { blocked: 0, L0: 40, ramp01: 50, L1: 60, ramp12: 70, L2: 80 }
const LVL_COLOR: Record<LevelKey, string> = {
  blocked: '220,60,60', L0: '80,200,120', ramp01: '180,220,80',
  L1: '80,180,230', ramp12: '240,170,60', L2: '200,110,230',
}
const LVL_KEYS: Record<string, LevelKey> = { '1': 'L0', '2': 'ramp01', '3': 'L1', '4': 'ramp12', '5': 'L2', b: 'blocked' }
const LEGAL = [0, 40, 50, 60, 70, 80]
const DIRS8 = ['south', 'north', 'east', 'west', 'south-east', 'north-east', 'north-west', 'south-west']

function dirFromVec(dx: number, dy: number) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI
  if (a >= -22.5 && a < 22.5) return 'east'
  if (a >= 22.5 && a < 67.5) return 'south-east'
  if (a >= 67.5 && a < 112.5) return 'south'
  if (a >= 112.5 && a < 157.5) return 'south-west'
  if (a >= -67.5 && a < -22.5) return 'north-east'
  if (a >= -112.5 && a < -67.5) return 'north'
  if (a >= -157.5 && a < -112.5) return 'north-west'
  return 'west'
}

function inPoly(x: number, y: number, pts: [number, number][]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function download(name: string, url: string) {
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
}

export default function SceneEditor() {
  const hostRef = useRef<HTMLCanvasElement>(null)
  const [hud, setHud] = useState({ level: 'L0' as LevelKey, mode: 'draw', test: false, polys: 0, zoom: 1, img: '', thorScale: 0.8, speed: 135 })

  useEffect(() => {
    const canvas = hostRef.current!
    const g = canvas.getContext('2d')!
    let raf = 0
    let destroyed = false

    // ---- mutable editor state (refs, not React state) ----
    const st = {
      img: null as HTMLImageElement | null,
      imgName: '',
      polys: [] as Poly[],
      drawing: null as [number, number][] | null,
      level: 'L0' as LevelKey,
      selected: -1,
      mode: 'draw' as 'draw' | 'select',
      spawn: null as [number, number] | null,
      spawnMode: false,
      zoom: 1, panX: 0, panY: 0,
      panning: false, panStart: [0, 0], panOrig: [0, 0],
      dragVert: -1,
      space: false,
      overlay: true,
      mouse: null as [number, number] | null,
      // test walk
      test: false,
      lvlData: null as Uint8ClampedArray | null,
      lvlW: 0, lvlH: 0,
      pos: { x: 0, y: 0 }, facing: 'south', animT: 0,
      thorScale: 0.8, speed: 135,
      keys: {} as Record<string, boolean>,
      thorTex: {} as Record<string, HTMLImageElement[]>,
      lastT: performance.now(),
    }

    const pushHud = () => setHud({
      level: st.level, mode: st.mode, test: st.test, polys: st.polys.length,
      zoom: Math.round(st.zoom * 100) / 100, img: st.imgName, thorScale: st.thorScale, speed: st.speed,
    })

    // ---- persistence ----
    const saveKey = () => `paintedit:${st.imgName}`
    const persist = () => {
      if (!st.imgName) return
      localStorage.setItem(saveKey(), JSON.stringify({ polys: st.polys, spawn: st.spawn, thorScale: st.thorScale, speed: st.speed }))
    }
    const restore = () => {
      const raw = localStorage.getItem(saveKey())
      if (!raw) return
      try {
        const d = JSON.parse(raw)
        st.polys = d.polys ?? []; st.spawn = d.spawn ?? null
        st.thorScale = d.thorScale ?? 0.8; st.speed = d.speed ?? 135
      } catch { /* corrupt save: start clean */ }
    }

    // ---- image loading ----
    const useImage = (img: HTMLImageElement, name: string) => {
      st.img = img; st.imgName = name
      st.polys = []; st.spawn = null; st.drawing = null; st.selected = -1
      restore()
      // fit view
      const z = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight) * 0.92
      st.zoom = z
      st.panX = (canvas.width - img.naturalWidth * z) / 2
      st.panY = (canvas.height - img.naturalHeight * z) / 2
      pushHud()
    }
    const loadUrl = (url: string) => {
      const img = new Image()
      img.onload = () => useImage(img, url.split('/').pop() || url)
      img.onerror = () => console.error('[SceneEditor] image failed', url)
      img.src = url
    }

    // ---- rasterize: polys -> exact-valued levels data ----
    const rasterize = () => {
      if (!st.img) return null
      const w = st.img.naturalWidth, h = st.img.naturalHeight
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      const cg = cv.getContext('2d', { willReadFrequently: true })!
      cg.fillStyle = 'rgb(0,0,0)'; cg.fillRect(0, 0, w, h)
      for (const p of st.polys) {
        const v = LVL_VALUE[p.level]
        cg.fillStyle = `rgb(${v},${v},${v})`
        cg.beginPath()
        p.pts.forEach(([x, y], i) => (i ? cg.lineTo(x, y) : cg.moveTo(x, y)))
        cg.closePath(); cg.fill()
      }
      // canvas fills antialias; quantize every pixel to the nearest legal
      // value (ties resolve DOWN, so uncertain edge pixels prefer blocked)
      const id = cg.getImageData(0, 0, w, h)
      const d = id.data
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]
        let best = 0, bd = 256
        for (const v of LEGAL) {
          const dist = Math.abs(r - v)
          if (dist < bd || (dist === bd && v < best)) { bd = dist; best = v }
        }
        d[i] = d[i + 1] = d[i + 2] = best; d[i + 3] = 255
      }
      cg.putImageData(id, 0, 0)
      return { cv, data: d, w, h }
    }

    // ---- test-walk sampling (the runtime's exact rules) ----
    const lvlAt = (x: number, y: number) => {
      const xi = Math.round(x), yi = Math.round(y)
      if (!st.lvlData || xi < 0 || yi < 0 || xi >= st.lvlW || yi >= st.lvlH) return 0
      return st.lvlData[(yi * st.lvlW + xi) * 4]
    }
    const HIP = 7
    const near = (a: number, b: number) => Math.abs(a - b) <= 10
    const canStandFrom = (x: number, y: number, fromLvl: number) => {
      const f = lvlAt(x, y)
      if (f === 0 || !near(f, fromLvl)) return false
      const h1 = lvlAt(x - HIP, y - 2), h2 = lvlAt(x + HIP, y - 2)
      return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
    }
    const canStand = (x: number, y: number) => {
      const f = lvlAt(x, y)
      if (f === 0) return false
      const h1 = lvlAt(x - HIP, y - 2), h2 = lvlAt(x + HIP, y - 2)
      return h1 > 0 && h2 > 0 && near(h1, f) && near(h2, f)
    }

    const startTest = () => {
      const r = rasterize()
      if (!r) return
      st.lvlData = r.data; st.lvlW = r.w; st.lvlH = r.h
      const sp = st.spawn ?? [r.w / 2, r.h / 2]
      // spiral to standable ground (the runtime's spawn validation)
      let px = sp[0], py = sp[1]
      if (!canStand(px, py)) {
        outer: for (let rad = 8; rad <= 400; rad += 8)
          for (let a = 0; a < 16; a++) {
            const x = sp[0] + Math.cos(a / 16 * 6.283) * rad, y = sp[1] + Math.sin(a / 16 * 6.283) * rad
            if (canStand(x, y)) { px = x; py = y; break outer }
          }
      }
      st.pos = { x: px, y: py }
      st.test = true
      pushHud()
    }

    // ---- thor textures (lazy) ----
    for (const d of DIRS8) {
      st.thorTex[d] = [0, 1, 2, 3, 4, 5].map((i) => {
        const im = new Image()
        im.src = `/art/characters/thor/walk/${d}/${i}.png`
        return im
      })
    }

    // ---- exports ----
    const exportLevels = () => {
      const r = rasterize()
      if (!r) return
      r.cv.toBlob((blob) => { if (blob) download('levels.png', URL.createObjectURL(blob)) })
    }
    const exportJson = () => {
      const data = JSON.stringify({ img: st.imgName, w: st.img?.naturalWidth, h: st.img?.naturalHeight, spawn: st.spawn, thorScale: st.thorScale, speed: st.speed, polys: st.polys }, null, 1)
      download(st.imgName.replace(/\.[a-z]+$/, '') + '.polys.json', 'data:application/json,' + encodeURIComponent(data))
    }

    // ---- coordinate transforms ----
    const toWorld = (sx: number, sy: number): [number, number] => [(sx - st.panX) / st.zoom, (sy - st.panY) / st.zoom]

    // ---- input ----
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const [wx, wy] = toWorld(e.offsetX, e.offsetY)
      st.zoom = Math.min(8, Math.max(0.05, st.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)))
      st.panX = e.offsetX - wx * st.zoom
      st.panY = e.offsetY - wy * st.zoom
      pushHud()
    }
    const onDown = (e: MouseEvent) => {
      if (e.button === 1 || st.space) {
        st.panning = true; st.panStart = [e.offsetX, e.offsetY]; st.panOrig = [st.panX, st.panY]
        e.preventDefault(); return
      }
      if (e.button !== 0 || st.test) return
      const [wx, wy] = toWorld(e.offsetX, e.offsetY)
      const x = Math.round(wx), y = Math.round(wy)
      if (st.spawnMode) { st.spawn = [x, y]; st.spawnMode = false; persist(); return }
      if (st.mode === 'select') {
        // vertex drag on the selected poly?
        if (st.selected >= 0) {
          const p = st.polys[st.selected]
          const hit = p.pts.findIndex(([px2, py2]) => Math.hypot((px2 - wx) * st.zoom, (py2 - wy) * st.zoom) < 7)
          if (hit >= 0) { st.dragVert = hit; return }
        }
        st.selected = -1
        for (let i = st.polys.length - 1; i >= 0; i--)
          if (inPoly(wx, wy, st.polys[i].pts)) { st.selected = i; break }
        pushHud(); return
      }
      // draw mode
      if (!st.drawing) { st.drawing = [[x, y]]; return }
      const [fx, fy] = st.drawing[0]
      if (st.drawing.length >= 3 && Math.hypot((fx - wx) * st.zoom, (fy - wy) * st.zoom) < 9) closePoly()
      else st.drawing.push([x, y])
    }
    const closePoly = () => {
      if (st.drawing && st.drawing.length >= 3) {
        st.polys.push({ level: st.level, pts: st.drawing })
        persist(); pushHud()
      }
      st.drawing = null
    }
    const onMove = (e: MouseEvent) => {
      if (st.panning) {
        st.panX = st.panOrig[0] + (e.offsetX - st.panStart[0])
        st.panY = st.panOrig[1] + (e.offsetY - st.panStart[1])
        return
      }
      if (st.dragVert >= 0 && st.selected >= 0) {
        const [wx, wy] = toWorld(e.offsetX, e.offsetY)
        st.polys[st.selected].pts[st.dragVert] = [Math.round(wx), Math.round(wy)]
      }
      st.mouse = [e.offsetX, e.offsetY]
    }
    const onUp = () => {
      if (st.dragVert >= 0) persist()
      st.panning = false; st.dragVert = -1
    }
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      st.keys[k] = true
      if (k === ' ') { st.space = true; e.preventDefault(); return }
      if (e.ctrlKey && k === 'z') {
        if (st.drawing?.length) st.drawing.pop()
        else if (st.polys.length) { st.polys.pop(); st.selected = -1; persist() }
        pushHud(); return
      }
      if (LVL_KEYS[k]) {
        st.level = LVL_KEYS[k]
        if (st.mode === 'select' && st.selected >= 0) { st.polys[st.selected].level = LVL_KEYS[k]; persist() }
        pushHud(); return
      }
      if (k === 'enter') closePoly()
      else if (k === 'escape') { st.drawing = null; st.selected = -1; pushHud() }
      else if (k === 'delete' && st.selected >= 0) { st.polys.splice(st.selected, 1); st.selected = -1; persist(); pushHud() }
      else if (k === 'v') { st.mode = st.mode === 'draw' ? 'select' : 'draw'; st.drawing = null; pushHud() }
      else if (k === 's' && !st.test) { st.spawnMode = true }
      else if (k === 't') { if (st.test) { st.test = false; pushHud() } else startTest() }
      else if (k === 'h') { st.overlay = !st.overlay }
      else if (k === 'p') { st.zoom = 2; pushHud() }
      else if (k === 'e') exportLevels()
      else if (k === 'j') exportJson()
      else if (k === '[') { st.thorScale = Math.max(0.3, st.thorScale - 0.05); persist(); pushHud() }
      else if (k === ']') { st.thorScale = Math.min(2, st.thorScale + 0.05); persist(); pushHud() }
      else if (k === ',') { st.speed = Math.max(40, st.speed - 10); persist(); pushHud() }
      else if (k === '.') { st.speed = Math.min(300, st.speed + 10); persist(); pushHud() }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      st.keys[k] = false
      if (k === ' ') st.space = false
    }

    // ---- render + test-walk loop ----
    const frame = () => {
      if (destroyed) return
      const now = performance.now()
      const dt = Math.min(now - st.lastT, 50) / 1000
      st.lastT = now
      canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight

      // test-walk physics (the runtime's exact step law)
      if (st.test) {
        let dx = 0, dy = 0
        if (st.keys['arrowup'] || st.keys['w']) dy -= 1
        if (st.keys['arrowdown'] || st.keys['s']) dy += 1
        if (st.keys['arrowleft'] || st.keys['a']) dx -= 1
        if (st.keys['arrowright'] || st.keys['d']) dx += 1
        const moving = dx !== 0 || dy !== 0
        if (moving) {
          const m = Math.hypot(dx, dy); dx /= m; dy /= m
          const nx = st.pos.x + dx * st.speed * dt, ny = st.pos.y + dy * st.speed * dt * 0.72
          const cur = lvlAt(st.pos.x, st.pos.y)
          const stuck = cur === 0
          if (canStandFrom(nx, ny, cur) || stuck) { st.pos.x = nx; st.pos.y = ny }
          else if (canStandFrom(nx, st.pos.y, cur)) st.pos.x = nx
          else if (canStandFrom(st.pos.x, ny, cur)) st.pos.y = ny
          st.facing = dirFromVec(dx, dy * 0.72)
          st.animT += dt * 9
        } else st.animT = 0
        // camera follows
        st.panX += (canvas.width / 2 - st.pos.x * st.zoom - st.panX) * 0.12
        st.panY += (canvas.height / 2 - st.pos.y * st.zoom - st.panY) * 0.12
      }

      g.fillStyle = '#05080c'; g.fillRect(0, 0, canvas.width, canvas.height)
      g.save()
      g.translate(st.panX, st.panY); g.scale(st.zoom, st.zoom)
      g.imageSmoothingEnabled = false
      if (st.img) g.drawImage(st.img, 0, 0)

      if (st.overlay && !st.test) {
        for (let i = 0; i < st.polys.length; i++) {
          const p = st.polys[i]
          g.beginPath()
          p.pts.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)))
          g.closePath()
          g.fillStyle = `rgba(${LVL_COLOR[p.level]},${i === st.selected ? 0.5 : 0.3})`
          g.fill()
          g.lineWidth = 1.5 / st.zoom
          g.strokeStyle = `rgba(${LVL_COLOR[p.level]},0.95)`
          g.stroke()
          if (i === st.selected) {
            g.fillStyle = '#fff'
            for (const [x, y] of p.pts) g.fillRect(x - 3 / st.zoom, y - 3 / st.zoom, 6 / st.zoom, 6 / st.zoom)
          }
        }
        if (st.drawing) {
          g.beginPath()
          st.drawing.forEach(([x, y], j) => (j ? g.lineTo(x, y) : g.moveTo(x, y)))
          if (st.mouse) { const [wx, wy] = toWorld(st.mouse[0], st.mouse[1]); g.lineTo(wx, wy) }
          g.strokeStyle = `rgba(${LVL_COLOR[st.level]},1)`
          g.lineWidth = 1.5 / st.zoom
          g.stroke()
          g.fillStyle = '#fff'
          for (const [x, y] of st.drawing) g.fillRect(x - 2.5 / st.zoom, y - 2.5 / st.zoom, 5 / st.zoom, 5 / st.zoom)
        }
      }
      if (st.spawn) {
        g.fillStyle = 'rgba(255,220,80,0.9)'
        g.beginPath(); g.arc(st.spawn[0], st.spawn[1], 5 / st.zoom, 0, 6.283); g.fill()
      }
      if (st.test) {
        // shadow + thor
        g.fillStyle = 'rgba(6,10,14,0.4)'
        g.beginPath(); g.ellipse(st.pos.x, st.pos.y - 1, 13 * st.thorScale, 5 * st.thorScale, 0, 0, 6.283); g.fill()
        const frames = st.thorTex[st.facing]
        const im = (st.animT > 0 ? frames[1 + (Math.floor(st.animT) % 5)] : frames[0])
        if (im?.complete && im.naturalWidth) {
          const w = im.naturalWidth * st.thorScale, h = im.naturalHeight * st.thorScale
          g.drawImage(im, st.pos.x - w / 2, st.pos.y - h, w, h)
        }
      }
      g.restore()
      raf = requestAnimationFrame(frame)
    }

    // ---- wire up ----
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mousedown', onDown)
    canvas.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKeyUp)
    canvas.addEventListener('contextmenu', (e) => e.preventDefault())

    const params = new URLSearchParams(window.location.search)
    const imgUrl = params.get('img')
    if (imgUrl) loadUrl(imgUrl)

    // expose file-open + json-import for the HUD inputs
    ;(window as any).__edOpenImage = (file: File) => {
      const rd = new FileReader()
      rd.onload = () => {
        const img = new Image()
        img.onload = () => useImage(img, file.name)
        img.src = rd.result as string
      }
      rd.readAsDataURL(file)
    }
    ;(window as any).__edImportJson = (file: File) => {
      const rd = new FileReader()
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result as string)
          st.polys = d.polys ?? []; st.spawn = d.spawn ?? null
          st.thorScale = d.thorScale ?? st.thorScale; st.speed = d.speed ?? st.speed
          persist(); pushHud()
        } catch { console.error('[SceneEditor] bad json') }
      }
      rd.readAsText(file)
    }
    ;(window as any).__edExport = () => { exportLevels(); exportJson() }

    raf = requestAnimationFrame(frame)
    return () => {
      destroyed = true
      cancelAnimationFrame(raf)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousedown', onDown)
      canvas.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#05080c' }}>
      <canvas ref={hostRef} style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }} />
      <div style={{
        position: 'fixed', top: 10, left: 10, padding: '10px 12px', maxWidth: 320,
        background: 'rgba(8,12,18,0.88)', color: '#cfe0ea', font: '12px monospace',
        border: '1px solid #23303c', borderRadius: 6, lineHeight: 1.55,
      }}>
        <div style={{ color: '#ffd884', marginBottom: 4 }}>SCENE EDITOR — {hud.img || 'no image'}</div>
        <div>mode <b style={{ color: '#fff' }}>{hud.test ? 'TEST WALK' : hud.mode}</b> · level <b style={{ color: `rgb(${LVL_COLOR[hud.level]})` }}>{hud.level}</b> · polys {hud.polys} · zoom {hud.zoom}</div>
        <div style={{ margin: '6px 0', borderTop: '1px solid #23303c', paddingTop: 6 }}>
          click add vertex · Enter/click-start close · Esc cancel · ^Z undo<br />
          <b>1</b>-<b>5</b> L0/r01/L1/r12/L2 · <b>B</b> blocked · <b>V</b> select · Del remove<br />
          <b>S</b>+click spawn · <b>T</b> test walk (WASD) · <b>H</b> overlay · <b>P</b> 2x zoom<br />
          <b>E</b> export levels.png · <b>J</b> export json · [ ] thor {hud.thorScale.toFixed(2)} · , . speed {hud.speed}<br />
          wheel zoom · space-drag / middle-drag pan
        </div>
        <label style={{ display: 'inline-block', marginRight: 8, color: '#8fd0ff', cursor: 'pointer' }}>
          open image<input type="file" accept="image/png" style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && (window as any).__edOpenImage(e.target.files[0])} />
        </label>
        <label style={{ display: 'inline-block', marginRight: 8, color: '#8fd0ff', cursor: 'pointer' }}>
          import json<input type="file" accept=".json" style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && (window as any).__edImportJson(e.target.files[0])} />
        </label>
        <span style={{ color: '#8fd0ff', cursor: 'pointer' }} onClick={() => (window as any).__edExport()}>export both</span>
      </div>
    </div>
  )
}
