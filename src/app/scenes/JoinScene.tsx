import { useState } from 'react'
import Overworld from '../../overworld/Overworld'
import { useGame } from '../world'
import { useNav } from '../SceneManager'

// "Class code as a moment" (the story): a message in a bottle washes ashore and unrolls into
// Principal Panther's welcome; joining = washing ashore on the BLHS seas. Safety-filtered handle,
// pronouns, and a soft "what are you into?" that lights a few islands. Anonymized ID under the hood.

const PAPER = '#f3ead3', INK = '#3a2c1d', WOOD = '#7a5638', TEAL = '#2f8e82', GOLD = '#c9a24a'
const INTERESTS = [
  { id: 'sports', label: 'Sports', emoji: '🏈' },
  { id: 'tech', label: 'Tech & Code', emoji: '💻' },
  { id: 'arts', label: 'Arts & Stage', emoji: '🎭' },
  { id: 'food', label: 'Culinary', emoji: '🍳' },
  { id: 'service', label: 'Service & Leadership', emoji: '🤝' },
]
const card: React.CSSProperties = {
  position: 'relative', // must be positioned to paint above the WebGL ocean canvas
  width: 'min(440px, 94vw)', background: PAPER, color: INK, border: `2px solid ${WOOD}`,
  borderRadius: 16, padding: '22px 24px', boxShadow: '0 8px 0 rgba(0,0,0,.3)',
  font: '15px Jersey 25, system-ui',
}
const btn = (bg = WOOD, color = PAPER): React.CSSProperties => ({
  background: bg, color, border: 'none', borderRadius: 9, padding: '9px 18px',
  font: '600 15px Jersey 25, system-ui', cursor: 'pointer', boxShadow: '0 3px 0 rgba(0,0,0,.25)',
})
const field: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', background: '#fffaf0', border: `1.5px solid #d8c9a6`,
  borderRadius: 9, padding: '9px 12px', font: '15px Jersey 25, system-ui', color: INK, marginTop: 4,
}

export default function JoinScene() {
  const nav = useNav()
  const { setIdentity } = useGame()
  const [step, setStep] = useState<'bottle' | 'letter' | 'you'>('letter')
  const [code, setCode] = useState('')
  const [handle, setHandle] = useState('')
  const [pronouns, setPronouns] = useState('they/them')
  const [picks, setPicks] = useState<string[]>([])

  const togglePick = (id: string) => setPicks((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
  const finish = () => {
    setIdentity({ handle: handle.trim() || 'Explorer', pronouns, interests: picks })
    nav.go('dressing')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
      <Overworld />
      <style>{`
        @keyframes bob { 0%,100%{transform:translateY(-6px) rotate(-4deg)} 50%{transform:translateY(6px) rotate(4deg)} }
        @keyframes unroll { from{transform:scaleY(.2);opacity:0} to{transform:scaleY(1);opacity:1} }
      `}</style>
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 100% at 50% 120%, rgba(201,162,74,.25), rgba(8,28,34,.55))' }} />

      {step === 'bottle' && (
        <div style={{ position: 'relative', textAlign: 'center', color: PAPER }}>
          <div style={{ fontSize: 92, animation: 'bob 3.4s ease-in-out infinite', filter: 'drop-shadow(0 6px 10px rgba(0,0,0,.5))' }}>🍾</div>
          <div style={{ font: '700 26px Jersey 25, system-ui', textShadow: '0 2px 6px rgba(0,0,0,.6)', marginTop: 6 }}>A message washed ashore…</div>
          <button style={{ ...btn(GOLD, INK), marginTop: 16 }} onClick={() => setStep('letter')}>Uncork it ✉</button>
        </div>
      )}

      {step === 'letter' && (
        <div style={{ ...card, animation: 'unroll .5s ease-out', transformOrigin: 'top' }}>
          <div style={{ fontSize: 12, letterSpacing: 1.5, color: TEAL, fontWeight: 700 }}>FROM THE DESK OF</div>
          <h2 style={{ margin: '2px 0 12px', fontSize: 24 }}>🐾 Principal Panther</h2>
          <p style={{ margin: '0 0 8px' }}>Welcome to the BLHS seas, explorer. Out here, every island is a real way to belong at Bonney Lake High.</p>
          <p style={{ margin: '0 0 8px' }}>Sail to the ones that call you, learn what they’re about, and build the cape you’ll graduate in.</p>
          <p style={{ margin: '0 0 16px' }}>Your teacher gave you a class code — drop it in the water and wash ashore.</p>
          <label style={{ fontWeight: 700, fontSize: 13 }}>Class code
            <input style={field} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. PANTHER-7" maxLength={16} />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
            <button style={btn()} disabled={!code.trim()} onClick={() => setStep('you')}>Wash ashore 🌊</button>
          </div>
        </div>
      )}

      {step === 'you' && (
        <div style={{ ...card, animation: 'unroll .45s ease-out', transformOrigin: 'top' }}>
          <h2 style={{ margin: '0 0 4px', fontSize: 24 }}>Who washes ashore?</h2>
          <div style={{ fontSize: 12.5, opacity: .7, marginBottom: 12 }}>No real names — just a handle for the seas (kept private).</div>
          <label style={{ fontWeight: 700, fontSize: 13 }}>Handle
            <input style={field} value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="Captain Coda" maxLength={18} />
          </label>
          <div style={{ marginTop: 12, fontWeight: 700, fontSize: 13 }}>Pronouns</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {['she/her', 'he/him', 'they/them', 'ask me'].map((p) => (
              <button key={p} onClick={() => setPronouns(p)} style={{
                ...btn(pronouns === p ? TEAL : '#e3d7ba', pronouns === p ? '#fff' : INK), padding: '6px 12px', fontSize: 13,
              }}>{p}</button>
            ))}
          </div>
          <div style={{ marginTop: 14, fontWeight: 700, fontSize: 13 }}>What are you into? <span style={{ opacity: .55, fontWeight: 400 }}>(lights a few islands)</span></div>
          <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
            {INTERESTS.map((it) => (
              <button key={it.id} onClick={() => togglePick(it.id)} style={{
                ...btn(picks.includes(it.id) ? GOLD : '#e3d7ba', INK), padding: '6px 12px', fontSize: 13,
              }}>{it.emoji} {it.label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
            <button style={btn()} onClick={finish}>To the dressing room ⛵</button>
          </div>
        </div>
      )}
    </div>
  )
}
