import { useEffect, useRef, useState } from 'react'
import { useNav } from '../SceneManager'
import { track } from '../../game/telemetry'
import './boot-title.css'

// Boot splash (GAME-DESIGN §4.1): ~1.5s on a deep-teal field — a foam line sweeps across,
// the panther crest presses in with a squash-settle, the club credit sits below. Click
// anywhere to skip the moment it can. Toys: clicking the crest makes it purr (teal sparkle);
// 2% of boots the eyes glint gold.

const BOOT_MS = 1600

export default function BootScene() {
  const nav = useNav()
  const [sparkles, setSparkles] = useState<{ id: number; x: number; y: number }[]>([])
  const goldGlint = useRef(Math.random() < 0.02)
  const advanced = useRef(false)

  const advance = () => {
    if (advanced.current) return
    advanced.current = true
    nav.go('title')
  }

  useEffect(() => {
    track('session_start', { vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio })
    if (new URLSearchParams(location.search).has('holdboot')) return // dev: freeze for validation shots
    const t = window.setTimeout(advance, BOOT_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const purr = (e: React.MouseEvent) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.classList.remove('bt-purr'); void el.offsetWidth; el.classList.add('bt-purr')
    const burst = Array.from({ length: 7 }, (_, i) => ({ id: Date.now() + i, x: 40 + Math.random() * 48, y: 20 + Math.random() * 72 }))
    setSparkles((s) => [...s, ...burst])
    window.setTimeout(() => setSparkles((s) => s.filter((p) => !burst.includes(p))), 900)
  }

  return (
    <div className="bt-boot" onClick={advance}>
      <div className="bt-foamline" />
      <div className="bt-crestwrap">
        <img className="bt-crest pix" src="/art/ui/crest-panther.png" alt="" draggable={false} onClick={purr} />
        {goldGlint.current && <span className="bt-glint" />}
        {sparkles.map((p) => (
          <span key={p.id} className="bt-sparkle" style={{ left: `${p.x}%`, top: `${p.y}%` }} />
        ))}
      </div>
      <div className="bt-credit">Algorithmic Thinking Club presents</div>
    </div>
  )
}
