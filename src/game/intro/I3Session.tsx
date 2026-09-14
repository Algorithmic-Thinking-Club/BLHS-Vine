import { useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../../app/SceneManager'
import { track } from '../telemetry'
import { checkClass, classesAreOpen, joinClass } from '../net'
import { loadSave, subscribeSave, writeSave } from '../save'
import { LOOKS, drawRecolored } from '../thorLook'
import { cleanName, isBlocked, PRONOUN_CHOICES } from '../names'
import { programmeById } from '../roster/roster'
import { announce, usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { prefersReducedMotion } from '../ui/motion'
import { applySkin, currentSkin, wearAssignedSkin } from '../ui/skin'
import './i3.css'

// the parchment setup on the beach: class code, name and pronouns, outfit and boat name

const LETTER =
  'Panther. We saved you a spot.\n' +
  'Bonney Lake High School takes new students every fall. This is your invitation.\n' +
  'Sail to Bonney Lake High School. Go into the mountain and find the principal.\n' +
  'Your teacher left you a class code. Type it in the six boxes below.'

const PRINCIPAL_WORD =
  'Out there, every island is something Bonney Lake really offers. Clubs, sports, classes, honors. ' +
  'You get four years, and you cannot do everything. That is the whole point. Choose like it matters, ' +
  'because it does.'

const HANDLE_A = ['Brave', 'Golden', 'Quiet', 'Swift', 'Salt', 'Ember', 'Lucky', 'Harbor', 'Reef', 'Cedar']
const HANDLE_B = ['Tide', 'Gull', 'Paw', 'Wake', 'Compass', 'Current', 'Anchor', 'Lantern', 'Prowler', 'Drift']
const BOATS = ['Second Wind', "Panther's Wake", 'Late Pass', 'Salt & Chalk', 'First Bell', 'The Golden Gull', 'Homeroom Runner', 'The Field Trip']
const spinHandle = () => HANDLE_A[Math.floor(Math.random() * HANDLE_A.length)] + HANDLE_B[Math.floor(Math.random() * HANDLE_B.length)]
const spinBoat = () => BOATS[Math.floor(Math.random() * BOATS.length)]

/* how long the parchment waits for the class service before it decides for itself.
 * A student on school wifi must not sit on a blank page, and a student with no class
 * must not watch the code boxes appear and then vanish. */
const CLASS_ASK_MS = 2200

// a class join that failed on the network retries quietly in the background until it lands
const RETRY_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 300_000, 300_000]
let retryTimer = 0

function queueJoin(code: string, handle: string, attempt = 0): void {
  if (attempt >= RETRY_MS.length) {
    track('join_queue_gave_up', { attempts: attempt })
    return
  }
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(() => {
    void joinClass(code, handle).then((r) => {
      if (r.ok) { track('join_landed_late', { attempt: attempt + 1 }); return }
      /* only a network failure is worth asking again about. `unknown_code` and
       * `class_closed` are answers, and `error` is the server saying no. */
      if (r.reason === 'offline') queueJoin(code, handle, attempt + 1)
      else track('join_queue_refused', { reason: r.reason })
    })
  }, RETRY_MS[attempt])
}

// reveals a block of text a character at a time; a press finishes it instantly
function useTypewriter(text: string, cps = 42) {
  const [n, setN] = useState(0)
  const done = n >= text.length
  useEffect(() => {
    if (prefersReducedMotion()) { setN(text.length); return }
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

/** the Principal's signature: the school crest beside the name */
function Signature() {
  return (
    <div className="i3-sig">
      <span className="i3-crest" aria-hidden="true" />
      <span>Principal Panther</span>
    </div>
  )
}

type Result = { handle: string; pronouns: string; boatName: string; castaway: boolean; thorLook: string }
type Card = 'code' | 'identity' | 'word' | 'wardrobe' | 'boat' | 'rollup'

const CARD_SAID: Record<Card, string> = {
  code: 'A letter from Bonney Lake. Type the class code your teacher gave you.',
  identity: 'That code worked. Choose the name your class will see.',
  word: 'The letter turns over. A word from the Principal.',
  wardrobe: 'Pick what Thor wears.',
  boat: 'A postscript. Name your boat.',
  rollup: 'The letter rolls itself up.',
}

export function I3Session({ onDone }: { onDone: (r: Result) => void }) {
  // a resumed session (refresh mid-intro) prefills from the run and skips what's answered:
  // a joined student never re-types the code, and their handle is already on the parchment
  const saved = loadSave()
  const alreadyJoined = !!saved?.participantId || !!saved?.castaway
  const [card, setCard] = useState<Card>(alreadyJoined ? 'identity' : 'code')
  /* ---- THE QUESTION IS ASKED BEFORE THE LETTER IS SHOWN ------------------
   *
   * ASH, on playing the deploy: *"the introduciton cutscene, the first scroll page
   * immediately goes 'Panther. We saved you a seat' immedieatly glitches to the next
   * page."*
   *
   * It did, every time, and it is this. The letter and its six code boxes went up on
   * the first frame, `classesAreOpen()` answered a moment later, and with no class
   * service behind the deploy the answer is no - so the card he had just started
   * reading threw itself away. The very first thing this game says to a student was a
   * page that flinched.
   *
   * The question is asked first and nothing is drawn until it has an answer, which is
   * a held beat on the parchment rather than a flash. AND IT CANNOT WAIT FOR EVER: a
   * server that never answers is the same to a student as one that says no, and this
   * is the first ten seconds of the game. */
  const [asking, setAsking] = useState(!alreadyJoined)
  /* ---- AND THE LETTER IS READ EITHER WAY --------------------------------
   *
   * The first written words of this game are the invitation: "Panther. We saved you a
   * spot." With no class service behind the deploy - which is every student playing
   * outside an advisory period - the whole card was skipped, so the bottle washed
   * ashore, the cork popped, the parchment unfurled, and the first thing on it was a
   * name box. The story's own opening was reachable only by students whose teacher
   * had a class open.
   *
   * The LETTER is the story and the six boxes are the sign-in. Only the boxes depend
   * on there being a class. */
  const [classOpen, setClassOpen] = useState<boolean | null>(null)
  useEffect(() => {
    if (alreadyJoined) return
    let gone = false
    const settle = (open: boolean) => {
      if (gone) return
      setClassOpen(open)
      if (!open) {
        track('join_skipped', { why: 'no server' })
        setCastaway(true)
      }
      setAsking(false)
    }
    const late = window.setTimeout(() => settle(true), CLASS_ASK_MS)
    void classesAreOpen().then((open) => { window.clearTimeout(late); settle(open) })
      .catch(() => { window.clearTimeout(late); settle(false) })
    return () => { gone = true; window.clearTimeout(late) }
  }, [alreadyJoined])
  const [castaway, setCastaway] = useState(!!saved?.castaway)
  const [code, setCode] = useState(saved?.classCode ?? '')
  const [className, setClassName] = useState<string | undefined>()
  const [handle, setHandle] = useState(saved?.handle ?? '')
  const [pronouns, setPronouns] = useState(saved?.pronouns ?? '')
  const [boat, setBoat] = useState(saved?.boatName ?? '')
  const [look, setLook] = useState(saved?.thorLook ?? 'classic')
  const [joining, setJoining] = useState(false)
  const [joinErr, setJoinErr] = useState('')
  const result = useRef<Result>({ handle: 'Panther', pronouns: 'they/them', boatName: 'The Bonney', castaway: false, thorLook: 'classic' })
  const nav = useNav()

  // holds the skin steady for the whole session so the study arm cannot change the letter mid-read
  useEffect(() => {
    const held = currentSkin()
    const off = subscribeSave(() => { if (currentSkin() !== held) applySkin(held) })
    return () => { off(); wearAssignedSkin() }
  }, [])

  // each new card says its name out loud and takes focus, since it replaces the whole screen
  const stage = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    announce(CARD_SAID[card])
    if (card === 'rollup') return
    // the paper takes focus when a card has no control yet, so Tab stays inside the letter
    const first = stage.current?.querySelector<HTMLElement>('input, button')
    ;(first ?? stage.current)?.focus()
  }, [card])

  const next = (c: Card) => setCard(c)

  // the reading order of the cards, so Back is the card before and Back from the first one leaves
  /* WITH NO CLASS TO JOIN THERE IS NO CARD TO GO BACK TO, so Back from the name
   * leaves the game rather than returning to a screen that was skipped. */
  const ORDER: Card[] = castaway ? ['identity', 'word', 'wardrobe', 'boat']
    : ['code', 'identity', 'word', 'wardrobe', 'boat']
  const first: Card = ORDER[0]
  const back = () => {
    const at = ORDER.indexOf(card)
    if (at <= 0 || card === first) { nav.go('title'); return }
    setCard(ORDER[at - 1])
  }
  const finish = () => {
    const r = result.current
    // the save's handle is the truth once joined (the server may have suffixed a twin)
    r.handle = (loadSave()?.handle || handle).trim() || 'Panther'
    r.pronouns = pronouns || 'they/them'
    r.boatName = boat.trim() || 'The Bonney'
    r.castaway = castaway
    r.thorLook = look
    setCard('rollup')
    window.setTimeout(() => onDone(r), 650)
  }

  // THE REAL JOIN happens here, with the student's actual handle (§2.8, §7.7). The code
  // card only verified the class; joining there with a placeholder handle collapsed every
  // student in a class into one participant.
  const confirmIdentity = async () => {
    if (castaway || (alreadyJoined && !!saved?.participantId)) { next('word'); return }
    setJoining(true); setJoinErr('')
    const r = await joinClass(code, handle.trim() || 'Panther')
    setJoining(false)
    if (r.ok) {
      if (r.handle && r.handle !== handle) setHandle(r.handle)   // a twin got a kind suffix
      track('join_ok', { returning: !!r.returning })
      next('word')
      return
    }
    if (r.reason === 'offline') {
      /* §50.19: THE RUN STARTS ANYWAY. No error, because there is nothing the
       * student can do about the wifi, and stopping here excludes exactly the
       * students whose network is worst without ever recording that it happened. */
      track('join_queued', { at: 'identity' })
      queueJoin(code, handle.trim() || 'Panther')
      next('word')
      return
    }
    if (r.reason === 'unknown_code' || r.reason === 'class_closed') {
      /* A CLOSED CLASS SAYS SO DIFFERENTLY FROM A WRONG CODE (§2.7), because they
       * are different problems with different answers: one is "check the board",
       * the other is "ask your teacher to open it". */
      setJoinErr(r.reason === 'class_closed'
        ? 'That class is closed right now. Your teacher can open it again.'
        : 'That code does not work any more. Check it with your teacher.')
      setCard('code')
      return
    }
    setJoinErr('Something went wrong. Give it one more try.')
  }

  // the parchment is a modal panel that traps focus, and Escape does not dismiss it
  const panel = usePanel({ label: 'A letter from Bonney Lake', closeOnEscape: false })

  return (
    <div className="i3-root">
      <div className={`i3-scroll ${card === 'rollup' ? 'i3-rollup' : ''}`} {...panel}>
        <div className="i3-paper" ref={stage} tabIndex={-1}>
          {/* one Back for every card, on the paper rather than inside the cards */}
          {card !== 'rollup' && (
            <button className="i3-back" onClick={back}>
              {/* the drawn arrow, turned to point back; the word stands alone without it */}
              <Glyph piece="icon_set" face="arrow" size={12} className="i3-back-mark" />
              {card === first ? 'Quit to the title screen' : 'Back'}
            </button>
          )}
          {/* nothing is drawn while the parchment is still asking whether this deploy
              has a class to join: a card that appears and then replaces itself is the
              first thing this game would have said to a student */}
          {asking && <div className="i3-card i3-asking" aria-hidden="true" />}
          {!asking && card === 'code' && (
            <CodeCard
              initial={code}
              err={joinErr}
              classOpen={classOpen !== false}
              onVerified={(c, name) => { setCode(c); setClassName(name); setJoinErr(''); next('identity') }}
              onCastaway={() => { setCastaway(true); setJoinErr(''); next('identity') }}
            />
          )}
          {!asking && card === 'identity' && (
            <IdentityCard
              castaway={castaway}
              className={className}
              handle={handle} setHandle={setHandle}
              pronouns={pronouns} setPronouns={setPronouns}
              joining={joining} err={joinErr}
              onNext={confirmIdentity}
            />
          )}
          {!asking && card === 'word' && <WordCard onNext={() => next('wardrobe')} />}
          {!asking && card === 'wardrobe' && <WardrobeCard look={look} setLook={setLook} onNext={() => next('boat')} />}
          {!asking && card === 'boat' && <BoatCard boat={boat} setBoat={setBoat} onNext={finish} />}
        </div>
      </div>
    </div>
  )
}

// ---- card 1: the letter + the code ----
function CodeCard({ initial, err: outerErr, classOpen = true, onVerified, onCastaway }: {
  initial: string
  err?: string
  /** whether this deploy has a class service answering. The letter is read either
   *  way; only the six boxes and "Join my class" depend on it. */
  classOpen?: boolean
  onVerified: (code: string, className?: string) => void
  onCastaway: () => void
}) {
  const tw = useTypewriter(LETTER)
  const [code, setCode] = useState<string[]>(() => {
    const pre = (initial ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6).split('')
    return Array.from({ length: 6 }, (_, i) => pre[i] ?? '')
  })
  const [err, setErr] = useState(outerErr ?? '')
  const [shake, setShake] = useState(0)
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const tries = useRef(0)
  const lockUntil = useRef(0)   // the soft rate limit heals itself (the old one never unlocked)

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
    if (e.key === 'Enter') void submit()
  }
  // a refused code shakes the boxes, prints one kind line, and says it out loud
  const refuse = (line: string) => {
    setErr(line)
    setShake((s) => s + 1)
    announce(line)
  }
  const [checking, setChecking] = useState(false)
  const submit = async () => {
    const joined = code.join('')
    if (Date.now() < lockUntil.current) {
      refuse('Too many tries. Wait a minute, then try again.')
      return
    }
    /* ---- A HALF-TYPED CODE IS NOT A TRY (Ash, 2026-09-09) ---------------
     *
     * The counter used to be bumped before the length test, so pressing the
     * button with an empty box burned an attempt; and the lock fired ON the
     * fifth, BEFORE `checkClass` was called, so the fifth code was thrown away
     * unread. A freshman who fumbled four times and then typed it correctly was
     * told to wait a minute, holding a code that works, in a forty-minute
     * advisory period. The counter counts codes the server refused now, which is
     * what a rate limit is for. */
    if (joined.length < 6) {
      refuse('The code is six characters. Fill in every box.')
      return
    }
    tries.current++
    track('join_attempt', { len: joined.length, tries: tries.current })
    if (tries.current > 5) {
      tries.current = 0
      lockUntil.current = Date.now() + 60_000
      refuse('Too many tries. Wait a minute, then try again.')
      return
    }
    // verify the class only: the REAL join happens on the identity card, with the
    // student's actual handle.
    setChecking(true)
    const r = await checkClass(joined)
    setChecking(false)
    if (r.ok) {
      /* a code that worked clears the count: the limit is there to stop guessing
       * at codes, and a student who has got in is not guessing */
      tries.current = 0
      writeSave({ classCode: joined.toUpperCase() })
      onVerified(joined.toUpperCase(), r.className)
      return
    }
    // a student on bad wifi carries on with the code they typed rather than being stopped
    if (r.reason === 'offline') {
      track('class_check_offline')
      onVerified(joined.toUpperCase())
      return
    }
    refuse(r.reason === 'unknown_code'
      ? 'That code does not work. Check it with your teacher.'
      : r.reason === 'class_closed'
        ? 'That class is closed right now. Your teacher can open it again.'
        : 'Something went wrong. Give it one more try.')
  }

  return (
    /* the letter scrolls and takes the slack, so the boxes and the two buttons stay on the paper */
    <div className="i3-card i3-card-code" onClick={() => { if (!tw.done) tw.finish() }}>
      <div className="i3-letter i3-letter-scroll">{tw.shown}{!tw.done && <span className="i3-caret" aria-hidden="true" />}</div>
      {tw.done && !classOpen && (
        /* NO CLASS TO JOIN, AND THE LETTER STILL SAYS ITS PIECE. The boxes would be
         * six empty squares nothing could check, so what is offered instead is the
         * one thing that is true: go anyway. */
        <div className="i3-codefoot">
          <Signature />
          <p className="i3-noclass">
            Nobody has a class open right now, so there is no code to type. The island
            is there either way.
          </p>
          <Plank size="lg" onClick={onCastaway}>Set sail</Plank>
        </div>
      )}
      {tw.done && classOpen && (
        <div className="i3-codefoot">
          <Signature />
          {/* six code boxes, the group named once and each box saying where it sits */}
          <div
            key={shake}
            className={`i3-codeboxes ${shake ? 'i3-shake' : ''}`}
            role="group"
            aria-label="Class code, six characters"
            aria-describedby={err ? 'i3-code-err' : undefined}
          >
            {code.map((c, i) => (
              <input
                key={i}
                ref={(el) => { refs.current[i] = el }}
                className="i3-codebox"
                value={c}
                maxLength={6}
                autoFocus={i === 0}
                inputMode="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label={`Class code character ${i + 1} of 6`}
                aria-invalid={err ? true : undefined}
                onChange={(e) => put(i, e.target.value)}
                onKeyDown={(e) => back(i, e)}
                onPaste={(e) => { e.preventDefault(); paste(i, e.clipboardData.getData('text')) }}
              />
            ))}
          </div>
          {err && <div className="i3-err" id="i3-code-err" role="alert">{err}</div>}
          {/* two buttons of equal weight: join a class, or play without one */}
          <Plank className="i3-plank" busy={checking} onClick={() => void submit()}>
            {checking ? 'Checking the code' : 'Join my class'}
          </Plank>
          <Plank className="i3-plank" onClick={() => { track('demo_entered'); onCastaway() }}>
            No code? Play without a class.
          </Plank>
        </div>
      )}
    </div>
  )
}

// ---- card 2: handle + pronouns (the real join fires on confirm, in the parent) ----
function IdentityCard(p: {
  castaway: boolean
  className?: string
  handle: string; setHandle: (v: string) => void
  pronouns: string; setPronouns: (v: string) => void
  joining: boolean; err: string
  onNext: () => void
}) {
  const [spins, setSpins] = useState(0)
  const ok = p.handle.trim().length >= 3 && !isBlocked(p.handle)
  const bad = isBlocked(p.handle)
  const confirm = () => {
    if (p.joining) return
    if (!ok) { p.setHandle(spinHandle()); return }
    track('identity_set', { generated: spins > 0, spins, pronouns: p.pronouns || 'unset' })
    p.onNext()
  }
  const spin = () => { const v = spinHandle(); p.setHandle(v); setSpins((s) => s + 1); announce(`Name set to ${v}`) }
  return (
    <div className="i3-card">
      <div className="i3-head">
        {p.castaway ? 'Playing without a class.'
          : p.className ? `Found your class: ${p.className}.` : 'That code worked.'}
      </div>
      {/* A REAL LABEL, TIED TO THE BOX. It was a floating sentence above an
          unlabelled field, so a reader heard "edit text" and nothing else. */}
      <label className="i3-sub" htmlFor="i3-handle">What should your class call you?</label>
      <div className="i3-fieldrow">
        <span className="i3-fieldbox">
          <input
            id="i3-handle"
            className="i3-field"
            value={p.handle}
            placeholder="your name"
            autoComplete="off"
            aria-invalid={bad || undefined}
            aria-describedby={bad ? 'i3-handle-err' : 'i3-handle-note'}
            onChange={(e) => p.setHandle(cleanName(e.target.value))}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
          />
        </span>
        {/* WAS A DIE EMOJI AND NOTHING ELSE, so the whole accessible name of this
            control was one pictograph. A word is the name AND the instruction. */}
        <Plank size="sm" className="i3-spin" onClick={spin}>Spin a name</Plank>
      </div>
      {bad && <div className="i3-err" id="i3-handle-err" role="alert">That name is not allowed. Try another one.</div>}
      {p.err && <div className="i3-err" role="alert">{p.err}</div>}
      <div className="i3-reassure" id="i3-handle-note">This name is what your class sees. Your real name never leaves the room.</div>
      <div className="i3-chips" role="group" aria-label="Pronouns">
        {PRONOUN_CHOICES.map((c) => (
          <button
            key={c}
            className={`i3-chip ${p.pronouns === c ? 'i3-chip-on' : ''}`}
            aria-pressed={p.pronouns === c}
            onClick={() => { p.setPronouns(c); announce(`Pronouns ${c}`) }}
          >{c}</button>
        ))}
      </div>
      <Plank className="i3-plank i3-plank-solo" busy={p.joining} onClick={confirm}>
        {p.joining ? 'Joining your class' : ok ? 'That is me' : 'Spin one for me'}
      </Plank>
    </div>
  )
}

// ---- card 3: the Principal's word ----
function WordCard({ onNext }: { onNext: () => void }) {
  const tw = useTypewriter(PRINCIPAL_WORD, 48)
  return (
    <div className="i3-card" onClick={() => { if (!tw.done) tw.finish() }}>
      <div className="i3-head">The letter turns over.</div>
      <div className="i3-letter">{tw.shown}{!tw.done && <span className="i3-caret" aria-hidden="true" />}</div>
      {tw.done && (
        <>
          <Signature />
          <Plank className="i3-plank i3-plank-solo" onClick={onNext}>Understood</Plank>
        </>
      )}
    </div>
  )
}

// ---- card 4: the wardrobe, where Thor's coat recolors live and locked items show their rules ----

// what earns a locked item, named off the roster so it can never promise an island nobody built
const earnByCompleting = (id: string) => {
  const g = programmeById(id)
  return g ? `complete the ${g.name} island` : 'that island is not open yet'
}

const LOCKED = [
  { name: 'Letterman jacket', earn: 'reach Varsity in any sport' },
  { name: 'Robotics goggles', earn: earnByCompleting('robotics') },
  { name: 'Graduation cap', earn: 'finish all four years' },
]

function drawThor(cv: HTMLCanvasElement, hue: number | null) {
  const img = new Image()
  /* the same dye the beach and the painted world both apply at load, and re-apply
   * the moment the save changes. It was true of neither when this was written
   * (Ash, 2026-09-09); `PmapScene` and `BeachIso` both subscribe now. */
  img.onload = () => drawRecolored(cv, img, hue)
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
    /* THE MIRROR IS A CANVAS, so a student who cannot see it has pressed a button
       that does nothing at all. `Wardrobe.tsx` says the same thing about its own
       copy of this control. */
    announce(`Wearing ${LOOKS[k]?.label ?? k}`)
  }
  const spin = () => pick(Object.keys(LOOKS)[Math.floor(Math.random() * Object.keys(LOOKS).length)])
  return (
    <div className="i3-card">
      <div className="i3-head">Pick what Thor wears.</div>
      <div className="i3-wardrobe">
        <img className="i3-trunk" src="/art/island/castaway-trunk.png" alt="" draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <canvas key={pop} ref={cvRef} className="i3-thorview" aria-hidden="true" />
        <img className="i3-tailor" src="/art/characters/heron/south-west.png" alt="" draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
      </div>
      {/* the coat swatches, each carrying its own name rather than being told apart by colour */}
      <div className="i3-swatches" role="group" aria-label="Coats">
        {Object.entries(LOOKS).map(([k, v]) => (
          <button
            key={k}
            className={`i3-swatch ${p.look === k ? 'i3-swatch-on' : ''}`}
            style={{ background: v.hue === null ? 'var(--kit-front-teal)' : `hsl(${v.hue}, 48%, 42%)` }}
            aria-label={v.label} aria-pressed={p.look === k}
            onClick={() => pick(k)}
          />
        ))}
      </div>
      <Plank size="sm" className="i3-spin i3-spin-wide" onClick={spin}>Surprise me</Plank>
      {/* a quiet list of locked items and what earns each one, with nothing to press */}
      <ul className="i3-locked" aria-label="Locked items">
        {LOCKED.map((it) => (
          <li key={it.name} className="i3-lockrow">
            <Glyph
              piece="icon_set" face="lock" size={12} className="i3-lockmark"
              fallback={<span className="i3-lockmark i3-lockshape" aria-hidden="true" />}
            />
            <span className="i3-lockname">{it.name}</span>
            {' '}
            <span className="i3-lockearn">{it.earn}</span>
          </li>
        ))}
      </ul>
      <div className="i3-reassure">Locked items are earned by playing, never bought.</div>
      <Plank className="i3-plank i3-plank-solo" onClick={() => { track('dressing_done', { look: p.look }); p.onNext() }}>
        {p.look === 'classic' ? 'Keep this outfit' : 'Wear this outfit'}
      </Plank>
    </div>
  )
}

// ---- card 5: name the boat ----
function BoatCard(p: { boat: string; setBoat: (v: string) => void; onNext: () => void }) {
  const [spun, setSpun] = useState(false)
  const ok = p.boat.trim().length >= 2 && !isBlocked(p.boat)
  const bad = isBlocked(p.boat)
  const postscript = useMemo(() => 'P.S. The boat at the pier is yours. Give it a name.', [])
  const confirm = () => {
    track('boat_named', { generated: spun, skipped: !ok })
    p.onNext()
  }
  const spin = () => { const v = spinBoat(); p.setBoat(v); setSpun(true); announce(`Boat named ${v}`) }
  return (
    <div className="i3-card">
      <div className="i3-letter i3-ps">{postscript}</div>
      <label className="i3-sub" htmlFor="i3-boat">Your boat's name</label>
      <div className="i3-fieldrow">
        <span className="i3-fieldbox">
          <input
            id="i3-boat"
            className="i3-field"
            value={p.boat}
            placeholder="your boat name"
            autoComplete="off"
            aria-invalid={bad || undefined}
            aria-describedby={bad ? 'i3-boat-err' : undefined}
            onChange={(e) => p.setBoat(cleanName(e.target.value, 18))}
            onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
          />
        </span>
        <Plank size="sm" className="i3-spin" onClick={spin}>Spin a name</Plank>
      </div>
      {bad && <div className="i3-err" id="i3-boat-err" role="alert">That boat name will not work. Try another.</div>}
      <Plank className="i3-plank i3-plank-solo" onClick={confirm}>{ok ? 'Paint it on' : 'Name it The Bonney'}</Plank>
    </div>
  )
}
