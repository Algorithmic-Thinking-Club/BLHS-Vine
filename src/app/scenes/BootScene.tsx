import { useEffect, useRef, useState } from 'react'
import { useNav } from '../SceneManager'
import { track } from '../../game/telemetry'
import './boot-title.css'

// the boot splash: a foam line sweeps, the club crest presses in, and a click skips it

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
    // the splash holds for BOTH the timer and the boot save-pull (capped), so the title's
    // Continue reads the server's newer save instead of a stale pre-pull snapshot
    let alive = true
    const timer = new Promise<void>((r) => window.setTimeout(r, BOOT_MS))
    const sync = import('../../game/sync').then(({ syncReady }) => syncReady()).catch(() => undefined)
    void Promise.all([timer, sync]).then(() => { if (alive) advance() })
    return () => { alive = false }
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
        <img className="bt-crest" src="/art/ui/atc-logo.png" alt="" draggable={false} onClick={purr} />
        {goldGlint.current && <span className="bt-glint" />}
        {sparkles.map((p) => (
          <span key={p.id} className="bt-sparkle" style={{ left: `${p.x}%`, top: `${p.y}%` }} />
        ))}
      </div>
      <div className="bt-credit">Algorithmic Thinking Club presents</div>
    </div>
  )
}
