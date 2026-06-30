import { useEffect, useState } from 'react'
import Overworld from '../../overworld/Overworld'
import { camera, worldToScreen } from '../../overworld/iso'
import { useNav } from '../SceneManager'

// The intro is a CUTSCENE, not a menu over the sea: we open zoomed onto the Commons beach where
// Thor finds a bottle in the surf; the camera then dives out to reveal the whole BLHS archipelago
// at golden hour. Drives the shared animatable camera; the WebGL sea + props track it every frame.

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

// beach focus (south coast of the hub) and where Thor + the bottle sit on the sand
const BEACH = { cx: 6, cy: 6, zoom: 3.4 }
const THOR = { gx: 4.6, gy: 5.2 }
const BOTTLE = { gx: 6.6, gy: 7.0 }
const PAN_START = 3.6, PAN_DUR = 3.0

export default function IntroCutscene() {
  const nav = useNav()
  const [, setTick] = useState(0)
  const [caption, setCaption] = useState('')
  const [showBottle, setShowBottle] = useState(true)
  const [done, setDone] = useState(false)
  const [thorDir, setThorDir] = useState('south-east')

  useEffect(() => {
    camera.zoom = BEACH.zoom; camera.cx = BEACH.cx; camera.cy = BEACH.cy
    const t0 = performance.now()
    let raf = 0
    const loop = (now: number) => {
      const t = (now - t0) / 1000
      if (t < 2.0) { setCaption('A bottle drifts onto the sand…'); setThorDir('south-east'); setShowBottle(true) }
      else if (t < PAN_START) { setCaption('You wade in and uncork it.'); setThorDir('south'); setShowBottle(false) }
      else if (t < PAN_START + PAN_DUR) setCaption('“Welcome to the BLHS seas, explorer.”')
      else setCaption('Your archipelago awaits.')

      if (t >= PAN_START) {
        const e = easeInOut(clamp01((t - PAN_START) / PAN_DUR))
        camera.zoom = lerp(BEACH.zoom, 1, e)
        camera.cx = lerp(BEACH.cx, 0, e)
        camera.cy = lerp(BEACH.cy, 0, e)
      }
      if (t >= PAN_START + PAN_DUR + 0.4) setDone(true)
      setTick(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => { cancelAnimationFrame(raf); camera.zoom = 1; camera.cx = 0; camera.cy = 0 }
  }, [])

  const W = window.innerWidth, H = window.innerHeight
  const thorP = worldToScreen(THOR.gx, THOR.gy, W, H)
  const bottleP = worldToScreen(BOTTLE.gx, BOTTLE.gy, W, H)
  const thorW = 34 * camera.zoom

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
      <Overworld />
      {/* cinematic letterbox + warm golden grade */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 100% at 50% 30%, rgba(255,210,130,.12), rgba(6,22,28,.32))', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', insetInline: 0, top: 0, height: '9vh', background: 'linear-gradient(#0a1418,transparent)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', insetInline: 0, bottom: 0, height: '14vh', background: 'linear-gradient(transparent,#0a1418)', pointerEvents: 'none' }} />

      {/* the bottle bobbing in the surf */}
      {showBottle && (
        <div style={{
          position: 'absolute', left: bottleP.x, top: bottleP.y, transform: 'translate(-50%,-100%)',
          fontSize: 26 * camera.zoom * 0.5, filter: 'drop-shadow(0 3px 4px rgba(0,0,0,.5))',
          animation: 'bob 2.6s ease-in-out infinite', pointerEvents: 'none',
        }}>🍾</div>
      )}
      {/* Thor on the sand */}
      <img src={`/art/characters/thor/${thorDir}.png`} alt="Thor" style={{
        position: 'absolute', left: thorP.x, top: thorP.y, width: thorW, transform: 'translate(-50%,-100%)',
        imageRendering: 'pixelated', filter: 'drop-shadow(0 4px 5px rgba(0,0,0,.5))', pointerEvents: 'none',
      }} />
      <style>{`@keyframes bob {0%,100%{transform:translate(-50%,-104%) rotate(-6deg)}50%{transform:translate(-50%,-96%) rotate(6deg)}}`}</style>

      {/* caption */}
      <div style={{
        position: 'absolute', insetInline: 0, bottom: '6vh', textAlign: 'center', color: '#f3ead3',
        font: '600 22px Jersey 25, system-ui', textShadow: '0 2px 8px rgba(0,0,0,.8)', pointerEvents: 'none',
        opacity: caption ? 1 : 0, transition: 'opacity .5s',
      }}>{caption}</div>

      {/* controls */}
      <button onClick={() => nav.go('join')} style={{
        position: 'absolute', right: 16, top: 14, background: 'rgba(0,0,0,.35)', color: '#f3ead3',
        border: '1px solid rgba(243,234,211,.4)', borderRadius: 8, padding: '5px 12px',
        font: '13px Jersey 25, system-ui', cursor: 'pointer',
      }}>Skip ⏭</button>

      {done && (
        <button onClick={() => nav.go('join')} style={{
          position: 'absolute', left: '50%', bottom: '6vh', transform: 'translate(-50%, 60px)',
          background: '#c9a24a', color: '#3a2c1d', border: 'none', borderRadius: 10, padding: '11px 26px',
          font: '700 17px Jersey 25, system-ui', cursor: 'pointer', boxShadow: '0 4px 0 rgba(0,0,0,.3)',
          animation: 'bob 0s', pointerEvents: 'auto',
        }}>Wash ashore ⛵</button>
      )}
    </div>
  )
}
