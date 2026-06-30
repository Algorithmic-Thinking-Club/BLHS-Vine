import { useEffect, useState } from 'react'
import { useGame } from '../world'
import { useNav } from '../SceneManager'

const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']

// Thor & the dressing room (the story): base Thor + earnable cosmetic layers tied to learning,
// a mirror with iso Thor slowly turning, and you name your boat (shows on the hull later). Some
// cosmetics free, some locked until earned in a run.

const PAPER = '#f3ead3', INK = '#3a2c1d', WOOD = '#7a5638', TEAL = '#2f8e82', GOLD = '#c9a24a'
const COSMETICS = [
  { id: 'classic', label: 'Classic', emoji: '🐾', locked: false },
  { id: 'glasses', label: 'Robotics goggles', emoji: '🥽', locked: true },
  { id: 'scarf', label: 'Band scarf', emoji: '🧣', locked: true },
  { id: 'letterman', label: 'Varsity letterman', emoji: '🧥', locked: true },
  { id: 'mask', label: 'PAC drama mask', emoji: '🎭', locked: true },
]
const btn = (bg = WOOD, color = PAPER): React.CSSProperties => ({
  background: bg, color, border: 'none', borderRadius: 9, padding: '9px 18px',
  font: '600 15px Jersey 25, system-ui', cursor: 'pointer', boxShadow: '0 3px 0 rgba(0,0,0,.25)',
})

export default function DressingScene() {
  const nav = useNav()
  const { run, setOutfit } = useGame()
  const [look, setLook] = useState(run.thorLook)
  const [boat, setBoat] = useState(run.boatName)
  const [frame, setFrame] = useState(0)
  useEffect(() => { const t = setInterval(() => setFrame((f) => (f + 1) % 8), 480); return () => clearInterval(t) }, [])

  const setSail = () => {
    setOutfit({ thorLook: look, boatName: boat.trim() || 'The Panther' })
    nav.go('overworld')
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'radial-gradient(120% 90% at 50% 0%, #2c6f73, #0b262b)',
      display: 'grid', placeItems: 'center', font: '15px Jersey 25, system-ui', color: INK,
    }}>
      <style>{`@keyframes turn { 0%,100%{transform:rotateY(0) translateY(0)} 50%{transform:rotateY(22deg) translateY(-4px)} }`}</style>
      <div style={{
        width: 'min(720px, 95vw)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0,
        background: PAPER, border: `2px solid ${WOOD}`, borderRadius: 18, overflow: 'hidden', boxShadow: '0 10px 0 rgba(0,0,0,.35)',
      }}>
        {/* mirror */}
        <div style={{ background: 'linear-gradient(180deg,#16323a,#244a4f)', display: 'grid', placeItems: 'center', padding: 22, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 12, left: 0, right: 0, textAlign: 'center', color: '#bfe6df', fontSize: 12, letterSpacing: 2 }}>★ THE MIRROR ★</div>
          <div style={{
            width: 160, height: 200, display: 'grid', placeItems: 'center',
            background: 'radial-gradient(60% 50% at 50% 78%, rgba(0,0,0,.35), transparent)',
          }}>
            <img key={frame} src={`/art/characters/thor/${DIRS[frame]}.png`} alt="Thor"
              style={{ width: 150, imageRendering: 'pixelated', filter: 'drop-shadow(0 6px 8px rgba(0,0,0,.5))' }} />
          </div>
          <div style={{ color: '#eaf6f2', fontWeight: 700, marginTop: 4 }}>{run.handle} <span style={{ opacity: .6, fontWeight: 400, fontSize: 12 }}>· {run.pronouns}</span></div>
        </div>

        {/* controls */}
        <div style={{ padding: '22px 24px' }}>
          <h1 style={{ margin: '0 0 2px', fontSize: 26 }}>Dressing Room</h1>
          <div style={{ opacity: .7, fontSize: 13, marginBottom: 14 }}>Make Thor yours. Earn the rest out on the seas.</div>

          <div style={{ fontWeight: 700, fontSize: 13 }}>Thor’s look</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {COSMETICS.map((c) => (
              <button key={c.id} disabled={c.locked} onClick={() => setLook(c.id)} title={c.locked ? 'Earn this in a run' : c.label} style={{
                ...btn(look === c.id ? TEAL : '#e3d7ba', look === c.id ? '#fff' : INK),
                padding: '6px 11px', fontSize: 13, opacity: c.locked ? .45 : 1, cursor: c.locked ? 'not-allowed' : 'pointer',
              }}>{c.emoji} {c.label}{c.locked ? ' 🔒' : ''}</button>
            ))}
          </div>

          <div style={{ marginTop: 18, fontWeight: 700, fontSize: 13 }}>Name your boat <span style={{ opacity: .55, fontWeight: 400 }}>(it’ll ride on the hull)</span></div>
          <input value={boat} onChange={(e) => setBoat(e.target.value)} maxLength={20} style={{
            width: '100%', boxSizing: 'border-box', background: '#fffaf0', border: '1.5px solid #d8c9a6',
            borderRadius: 9, padding: '9px 12px', font: '15px Jersey 25, system-ui', color: INK, marginTop: 5,
          }} />
          <div style={{ marginTop: 8, color: WOOD, fontStyle: 'italic' }}>⛵ {boat.trim() || 'The Panther'}</div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
            <button style={btn(GOLD, INK)} onClick={setSail}>Set sail ⛵</button>
          </div>
        </div>
      </div>
    </div>
  )
}
