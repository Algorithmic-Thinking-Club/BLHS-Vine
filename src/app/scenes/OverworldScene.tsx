import { useEffect, useState } from 'react'
import Overworld from '../../overworld/Overworld'
import { worldToScreen, HH } from '../../overworld/iso'
import { ISLANDS, useGame } from '../world'
import { useNav } from '../SceneManager'

// The overworld is the navigable hub: every island is a real BLHS place with a small marker +
// state (misty-locked / open / completed), a compact selection card, and a slim run HUD. UI
// is deliberately small + restrained so the world is the star (Ashwath: it was too obnoxious).

function useViewport() {
  const [s, set] = useState({ w: window.innerWidth, h: window.innerHeight })
  useEffect(() => {
    const f = () => set({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', f)
    return () => window.removeEventListener('resize', f)
  }, [])
  return s
}

const PAPER = '#efe5cd', INK = '#3a2c1d', WOOD = '#7a5638', TEAL = '#2f8e82', GOLD = '#c9a24a'
const btn = (bg = WOOD, color = PAPER): React.CSSProperties => ({
  background: bg, color, border: 'none', borderRadius: 7, padding: '5px 12px',
  font: '600 13px Jersey 25, system-ui', cursor: 'pointer', boxShadow: '0 2px 0 rgba(0,0,0,.25)',
})

export default function OverworldScene() {
  const nav = useNav()
  const { run, select, endYear } = useGame()
  const { w, h } = useViewport()
  const sel = run.selectedId ? ISLANDS.find((i) => i.id === run.selectedId) : null
  const selState = sel ? run.islandStates[sel.id] : null
  const stateIcon = (s: string) => (s === 'locked' ? '🔒' : s === 'completed' ? '🏁' : '⚓')
  const lastYear = run.year >= run.maxYears

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', font: '13px Jersey 25, system-ui' }}>
      <Overworld />

      {/* slim HUD */}
      <div style={{
        position: 'absolute', top: 11, left: 11, display: 'flex', gap: 8, alignItems: 'center',
        background: PAPER, color: INK, border: `1.5px solid ${WOOD}`, borderRadius: 8,
        padding: '4px 9px', fontSize: 12.5, boxShadow: '0 2px 0 rgba(0,0,0,.2)',
      }}>
        <b>Yr {run.year}/{run.maxYears}</b>
        <span style={{ opacity: .35 }}>·</span>
        <span title="time-slots left this year">{Array.from({ length: run.slotsPerYear }).map((_, i) => (i < run.slotsLeft ? '●' : '○')).join('')}</span>
        <span style={{ opacity: .35 }}>·</span>
        <span style={{ color: WOOD }}><b>GPA {run.gpa.toFixed(2)}</b></span>
        <button style={{ ...btn(lastYear ? GOLD : WOOD), marginLeft: 4, padding: '3px 9px', fontSize: 12 }}
          onClick={() => (lastYear ? nav.go('cape') : endYear())}>{lastYear ? 'Finish 🎓' : 'End Year ⏭'}</button>
      </div>

      <div style={{ position: 'absolute', top: 11, right: 13, color: PAPER, textAlign: 'right', textShadow: '0 1px 3px rgba(0,0,0,.7)' }}>
        <div style={{ fontSize: 10.5, opacity: .8 }}>sailing as</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{run.handle}</div>
      </div>

      {/* island markers */}
      {ISLANDS.map((is) => {
        const p = worldToScreen(is.cx, is.cy, w, h)
        const st = run.islandStates[is.id]
        const locked = st === 'locked'
        const active = run.selectedId === is.id
        return (
          <button key={is.id} onClick={() => select(is.id)} style={{
            position: 'absolute', left: p.x, top: p.y - is.r * HH - 26, transform: 'translate(-50%,-100%)',
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            background: locked ? 'rgba(38,50,56,.8)' : PAPER, color: locked ? '#cdd6d8' : INK,
            border: `1.5px solid ${active ? GOLD : locked ? '#4a5a60' : WOOD}`, borderRadius: 999,
            padding: '2px 8px', fontSize: 12, whiteSpace: 'nowrap',
            boxShadow: active ? `0 0 0 2px ${GOLD}77` : '0 2px 0 rgba(0,0,0,.25)',
            filter: locked ? 'grayscale(.5)' : 'none',
          }}>
            <span style={{ fontSize: 13 }}>{locked ? '🌫️' : is.theme}</span>
            <b>{locked ? '???' : is.name}</b>
            <span style={{ fontSize: 11 }}>{stateIcon(st)}</span>
          </button>
        )
      })}

      {/* selection card */}
      {sel && (
        <div style={{
          position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)',
          width: 'min(380px, 92vw)', background: PAPER, color: INK, border: `1.5px solid ${WOOD}`,
          borderRadius: 11, padding: '11px 14px', boxShadow: '0 4px 0 rgba(0,0,0,.25)',
        }}>
          {selState === 'locked' ? (
            <>
              <div style={{ fontSize: 15, fontWeight: 700 }}>🌫️ A misty island</div>
              <p style={{ margin: '4px 0 9px', fontSize: 12.5, opacity: .8 }}>Finish another club and this one rises from the fog.</p>
              <button style={btn('#cdbf9f', INK)} onClick={() => select(null)}>Close</button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{sel.theme} {sel.name}</div>
                <div style={{ fontSize: 11, color: TEAL, fontWeight: 700 }}>{sel.category}{selState === 'completed' ? ' · ✓' : ''}</div>
              </div>
              <p style={{ margin: '5px 0 10px', fontSize: 12.5 }}>{sel.blurb}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={btn()} onClick={() => nav.go('island')}>{selState === 'completed' ? 'Revisit' : 'Set sail ⛵'}</button>
                <button style={btn('#cdbf9f', INK)} onClick={() => select(null)}>Close</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
