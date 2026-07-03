import { useEffect, useMemo, useRef, useState } from 'react'
import { track } from '../telemetry'
import { joinClass } from '../net'
import { writeSave } from '../save'
import { LOOKS, drawRecolored } from '../thorLook'
import { cleanName, isBlocked, PRONOUN_CHOICES } from '../names'
import './i3.css'

// I-3: the UI session on the parchment (GAME-DESIGN §5 I-3, §4.3/§4.4/§4.6). The cork just
// popped; the parchment unfurls upward and the whole setup happens on it without leaving the
// beach: the letter writes itself in, the class code goes into six carved boxes inside the
// letter, then handle + pronouns, the Principal's word, and the boat's name. Every card is
// skippable to a default. The wardrobe card joins the flow when the castaway trunk art lands.
//
// Join mechanics (§4.3): 6 chars, case-insensitive, ambiguous glyphs excluded from generated
// codes, auto-advance boxes, paste support, kind one-line errors with a shake (never a red
// wall), and the castaway path. Until the class backend lands, any complete code is accepted
// locally and logged; the server swap changes nothing visible here.

const LETTER =
  'Panther. We saved you a spot.\n' +
  'Bonney Lake takes new explorers every fall, and the tide brought your invitation right on time.\n' +
  'Your teacher left you a code. Speak it, and the harbor will know your name.'

const PRINCIPAL_WORD =
  'Out there, every island is something Bonney Lake really offers. Clubs, sports, classes, honors. ' +
  'You get four years, and you cannot do everything. That is the whole point. Choose like it matters, ' +
  'because it does.'

const HANDLE_A = ['Brave', 'Golden', 'Quiet', 'Swift', 'Salt', 'Ember', 'Lucky', 'Harbor', 'Reef', 'Cedar']
const HANDLE_B = ['Tide', 'Gull', 'Paw', 'Wake', 'Compass', 'Current', 'Anchor', 'Lantern', 'Prowler', 'Drift']
const BOATS = ['Second Wind', "Panther's Wake", 'Late Pass', 'Salt & Chalk', 'First Bell', 'The Golden Gull', 'Homeroom Runner', 'The Field Trip']
const spinHandle = () => HANDLE_A[Math.floor(Math.random() * HANDLE_A.length)] + HANDLE_B[Math.floor(Math.random() * HANDLE_B.length)]
const spinBoat = () => BOATS[Math.floor(Math.random() * BOATS.length)]

// typewriter over a block of text; click = finish instantly
function useTypewriter(text: string, cps = 42) {
  const [n, setN] = useState(0)
  const done = n >= text.length
  useEffect(() => {
    setN(0)
    const t0 = performance.now()
    let raf = 0
    const step = () => {
      const k = Math.floor(((performance.now() - t0) / 1000) * cps)
      setN(Math.min(text.length, k))
      if (k < text.length) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, cps])
  return { shown: text.slice(0, n), done, finish: () => setN(text.length) }
}

type Result = { handle: string; pronouns: string; boatName: string; castaway: boolean; thorLook: string }
type Card = 'code' | 'identity' | 'word' | 'wardrobe' | 'boat' | 'rollup'

export function I3Session({ onDone }: { onDone: (r: Result) => void }) {
  const [card, setCard] = useState<Card>('code')
  const [castaway, setCastaway] = useState(false)
  const [handle, setHandle] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [boat, setBoat] = useState('')
  const [look, setLook] = useState('classic')
  const result = useRef<Result>({ handle: 'Panther', pronouns: 'they/them', boatName: 'The Bonney', castaway: false, thorLook: 'classic' })

  const next = (c: Card) => setCard(c)
  const finish = () => {
    const r = result.current
    r.handle = handle.trim() || 'Panther'
    r.pronouns = pronouns || 'they/them'
    r.boatName = boat.trim() || 'The Bonney'
    r.castaway = castaway
    r.thorLook = look
    setCard('rollup')
    window.setTimeout(() => onDone(r), 650)
  }

  return (
    <div className="i3-root">
      <div className={`i3-scroll ${card === 'rollup' ? 'i3-rollup' : ''}`}>
        <div className="i3-paper">
          {card === 'code' && <CodeCard onJoin={() => next('identity')} onCastaway={() => { setCastaway(true); next('identity') }} />}
          {card === 'identity' && (
            <IdentityCard
              castaway={castaway}
              handle={handle} setHandle={setHandle}
              pronouns={pronouns} setPronouns={setPronouns}
              onNext={() => next('word')}
            />
          )}
          {card === 'word' && <WordCard onNext={() => next('wardrobe')} />}
          {card === 'wardrobe' && <WardrobeCard look={look} setLook={setLook} onNext={() => next('boat')} />}
          {card === 'boat' && <BoatCard boat={boat} setBoat={setBoat} onNext={finish} />}
        </div>
      </div>
    </div>
  )
}

// ---- card 1: the letter + the code ----
function CodeCard({ onJoin, onCastaway }: { onJoin: () => void; onCastaway: () => void }) {
  const tw = useTypewriter(LETTER)
  const [code, setCode] = useState<string[]>(Array(6).fill(''))
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(0)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const tries = useRef(0)

  const put = (i: number, v: string) => {
    const ch = v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    if (ch.length > 1) { paste(i, ch); return }
    const nextCode = [...code]; nextCode[i] = ch
    setCode(nextCode); setErr('')
    if (ch && i < 5) refs.current[i + 1]?.focus()
  }
  const paste = (i: number, text: string) => {
    const chars = text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6 - i).split('')
    const nextCode = [...code]
    chars.forEach((c, k) => { nextCode[i + k] = c })
    setCode(nextCode)
    refs.current[Math.min(5, i + chars.length)]?.focus()
  }
  const back = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'Enter') submit()
  }
  const [checking, setChecking] = useState(false)
  const submit = async () => {
    const joined = code.join('')
    tries.current++
    track('join_attempt', { len: joined.length, tries: tries.current })
    if (joined.length < 6) {
      setErr('Six letters. The harbor is picky about names.')
      setShake((s) => s + 1)
      return
    }
    if (tries.current > 5) {
      setErr('The harbor master needs a breather. Try again in a minute.')
      return
    }
    // the real harbor: server-verified when the backend is live; offline dev sails through
    setChecking(true)
    const r = await joinClass(joined, 'Panther')
    setChecking(false)
    if (r.ok || r.reason === 'offline') {
      if (r.ok) writeSave({ classCode: joined.toUpperCase() })
      track('join_ok', { offline: !r.ok })
      onJoin()
      return
    }
    setShake((s) => s + 1)
    setErr(r.reason === 'unknown_code'
      ? 'The harbor does not know that code. Check it with your teacher.'
      : r.reason === 'class_closed'
        ? 'That class is not boarding right now.'
        : 'The harbor is being difficult. Try once more.')
  }

  return (
    <div className="i3-card" onClick={() => { if (!tw.done) tw.finish() }}>
      <div className="i3-letter">{tw.shown}{!tw.done && <span className="i3-caret">▌</span>}</div>
      {tw.done && (
        <>
          <div className="i3-sig"><span className="i3-paw">🐾</span> <span>Principal Panther</span></div>
          <div key={shake} className={`i3-codeboxes ${shake ? 'i3-shake' : ''}`}>
            {code.map((c, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el }}
                className="i3-codebox"
                value={c}
                maxLength={6}
                autoFocus={i === 0}
                onChange={(e) => put(i, e.target.value)}
                onKeyDown={(e) => back(i, e)}
                onPaste={(e) => { e.preventDefault(); paste(i, e.clipboardData.getData('text')) }}
              />
            ))}
          </div>
          {err && <div className="i3-err">{err}</div>}
          <button className="i3-castaway" onClick={() => { track('demo_entered'); onCastaway() }}>
            No code? The sea takes strays too.
          </button>
          <button className="i3-plank" onClick={submit}>{checking ? 'Asking the harbor…' : 'Speak it'}</button>
        </>
      )}
    </div>
  )
}

// ---- card 2: handle + pronouns ----
function IdentityCard(p: {
  castaway: boolean
  handle: string; setHandle: (v: string) => void
  pronouns: string; setPronouns: (v: string) => void
  onNext: () => void
}) {
  const [spins, setSpins] = useState(0)
  const ok = p.handle.trim().length >= 3 && !isBlocked(p.handle)
  const confirm = () => {
    if (!ok) { p.setHandle(spinHandle()); return }
    track('identity_set', { generated: spins > 0, spins, pronouns: p.pronouns || 'unset' })
    p.onNext()
  }
  return (
    <div className="i3-card">
      <div className="i3-head">{p.castaway ? 'The sea takes strays too.' : 'The harbor knows that code.'}</div>
      <div className="i3-sub">What should your class call you?</div>
      <div className="i3-fieldrow">
        <input
          className="i3-field"
          value={p.handle}
          placeholder="your deck name"
          onChange={(e) => p.setHandle(cleanName(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
        />
        <button className="i3-die" title="spin one" onClick={() => { p.setHandle(spinHandle()); setSpins((s) => s + 1) }}>ðŸŽ²</button>
      </div>
      {isBlocked(p.handle) && <div className="i3-err">The harbor master raised an eyebrow. Try another.</div>}
      <div className="i3-reassure">This name is what your class sees. Your real name never leaves the room.</div>
      <div className="i3-chips">
        {PRONOUN_CHOICES.map((c) => (
          <button
            key={c}
            className={`i3-chip ${p.pronouns === c ? 'i3-chip-on' : ''}`}
            onClick={() => p.setPronouns(c)}
          >{c}</button>
        ))}
      </div>
      <button className="i3-plank i3-plank-solo" onClick={confirm}>{ok ? 'That is me' : 'Spin one for me'}</button>
    </div>
  )
}

// ---- card 3: the Principal's word ----
function WordCard({ onNext }: { onNext: () => void }) {
  const tw = useTypewriter(PRINCIPAL_WORD, 48)
  return (
    <div className="i3-card" onClick={() => { if (!tw.done) tw.finish() }}>
      <div className="i3-head">The letter turns over.</div>
      <div className="i3-letter">{tw.shown}{!tw.done && <span className="i3-caret">▌</span>}</div>
      {tw.done && (
        <>
          <div className="i3-sig"><span className="i3-paw">🐾</span> <span>Principal Panther</span></div>
          <button className="i3-plank i3-plank-solo" onClick={onNext}>Understood</button>
        </>
      )}
    </div>
  )
}

// ---- card 4: the wardrobe (§4.5) — the castaway trunk creaks open ----
// v1 slots what exists honestly: Thor's shirt accent recolors LIVE on a canvas (the sprite
// really changes), the earnable items show locked with their real earn rules, one randomize
// die, fully skippable. Outfit/headwear sprite swaps join as their character states land.
const LOCKED = [
  { icon: '🧥', name: 'Letterman jacket', earn: 'reach Varsity in any sport' },
  { icon: '🥽', name: 'Robotics goggles', earn: 'complete the Robotics island' },
  { icon: '🎓', name: 'Graduation cap', earn: 'finish a four-year run' },
]

function drawThor(cv: HTMLCanvasElement, hue: number | null) {
  const img = new Image()
  img.onload = () => drawRecolored(cv, img, hue)   // the same dye the world applies at load
  img.src = '/art/characters/thor/walk/south/0.png'
}

function WardrobeCard(p: { look: string; setLook: (v: string) => void; onNext: () => void }) {
  const cvRef = useRef<HTMLCanvasElement>(null)
  const [pop, setPop] = useState(0)
  useEffect(() => {
    if (cvRef.current) drawThor(cvRef.current, LOOKS[p.look]?.hue ?? null)
  }, [p.look])
  const pick = (k: string) => {
    p.setLook(k); setPop((v) => v + 1)
    track('cosmetic_change', { look: k })
  }
  const spin = () => pick(Object.keys(LOOKS)[Math.floor(Math.random() * Object.keys(LOOKS).length)])
  return (
    <div className="i3-card">
      <div className="i3-head">The trunk creaks open.</div>
      <div className="i3-wardrobe">
        <img className="i3-trunk" src="/art/island/castaway-trunk.png" alt="" draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <canvas key={pop} ref={cvRef} className="i3-thorview" />
        <img className="i3-tailor" src="/art/characters/heron/south-west.png" alt="" draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
      <div className="i3-swatches">
        {Object.entries(LOOKS).map(([k, v]) => (
          <button
            key={k}
            className={`i3-swatch ${p.look === k ? 'i3-swatch-on' : ''}`}
            style={{ background: k === 'classic' ? '#2f8e82' : `hsl(${v.hue}, 48%, 42%)` }}
            title={v.label}
            onClick={() => pick(k)}
          />
        ))}
        <button className="i3-die" title="spin one" onClick={spin}>🎲</button>
      </div>
      <div className="i3-locked">
        {LOCKED.map((it) => (
          <button key={it.name} className="i3-lockchip" title={`earn by: ${it.earn}`}
            onClick={() => track('locked_item_inspected', { item: it.name })}>
            <span className="i3-lockicon">{it.icon}</span>
            <span className="i3-lockknot">🔒</span>
          </button>
        ))}
      </div>
      <div className="i3-reassure">Locked things are earned out there, not bought.</div>
      <button className="i3-plank i3-plank-solo" onClick={() => { track('dressing_done', { look: p.look }); p.onNext() }}>
        {p.look === 'classic' ? 'Thor looks great already' : 'Wear it well'}
      </button>
    </div>
  )
}

// ---- card 5: name the boat ----
function BoatCard(p: { boat: string; setBoat: (v: string) => void; onNext: () => void }) {
  const [spun, setSpun] = useState(false)
  const ok = p.boat.trim().length >= 2 && !isBlocked(p.boat)
  const postscript = useMemo(() => 'P.S. The rigger at the pier is yours. She will need a name.', [])
  const confirm = () => {
    track('boat_named', { generated: spun, skipped: !ok })
    p.onNext()
  }
  return (
    <div className="i3-card">
      <div className="i3-letter i3-ps">{postscript}</div>
      <div className="i3-fieldrow">
        <input
          className="i3-field"
          value={p.boat}
          placeholder="her name"
          onChange={(e) => p.setBoat(cleanName(e.target.value, 18))}
          onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
        />
        <button className="i3-die" title="spin one" onClick={() => { p.setBoat(spinBoat()); setSpun(true) }}>ðŸŽ²</button>
      </div>
      {isBlocked(p.boat) && <div className="i3-err">She would sink from embarrassment. Another.</div>}
      <button className="i3-plank i3-plank-solo" onClick={confirm}>{ok ? 'Paint it on' : 'Call her The Bonney'}</button>
    </div>
  )
}
