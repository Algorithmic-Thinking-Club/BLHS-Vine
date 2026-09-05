import { useEffect, useMemo, useRef, useState } from 'react'
import { useNav } from '../../app/SceneManager'
import { track } from '../telemetry'
import { checkClass, joinClass } from '../net'
import { loadSave, subscribeSave, writeSave } from '../save'
import { LOOKS, drawRecolored } from '../thorLook'
import { cleanName, isBlocked, PRONOUN_CHOICES } from '../names'
import { programmeById } from '../roster/roster'
import { announce, usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { prefersReducedMotion } from '../ui/motion'
import { applySkin, currentSkin, wearAssignedSkin } from '../ui/skin'
import './i3.css'

/* I-3: THE PARCHMENT SESSION (§2.7 to §2.11). The cork has just popped; the
 * parchment unfurls upward and the whole setup happens on it without leaving the
 * beach. The letter writes itself in, the class code goes into six carved boxes
 * inside the letter, then handle and pronouns, the Principal's word, the trunk,
 * and the boat's name. Every card is skippable to a default that is not an insult.
 *
 * WHAT THIS SESSION REBUILT, WITH THE SECTION THAT ASKED FOR EACH.
 *
 * EVERY EMOJI IS GONE. There were six of them on the first surface a student ever
 * types into: a paw on the Principal's signature, three dice, a coat, goggles, a
 * cap and a padlock. `docs/ART.md`: "Icons are drawn, never an emoji or a font
 * glyph." A die is now the words "Spin a name", which is also what the button
 * DOES; the padlock is `icon_set`'s drawn lock with a token-drawn shape behind
 * it; the three locked items say their own names; and the signature wears
 * `crest-panther.png`, which is the school's own mark and the one drawn thing in
 * the kit that means Principal Panther. The typewriter's block caret was a font
 * glyph too and is a drawn rectangle now.
 *
 * EVERY CONTROL HAS A NAME MADE OF WORDS (§40.27, §40.28). The audit's list, all
 * of it on this one screen: five coat swatches told apart by hue alone with no
 * name at all, three locked chips whose entire accessible name was emoji soup and
 * whose criterion sat in a `title` a keyboard cannot reach, six code boxes with
 * no labels, and the handle and boat fields with none either. `Wardrobe.tsx`
 * fixed the identical swatch control weeks ago and this copy was left behind,
 * which is the copy every student meets FIRST.
 *
 * THE OFFLINE STOP IS GONE (§50.19, §2.7). It used to set "The harbor lost the
 * wind. Check the wifi and try once more." and return, in production, with no
 * queue and no retry anywhere in the join path. §50.19 is unambiguous about why
 * that is a study defect rather than a UX one: "a blocked join differentially
 * excludes exactly the students whose network is worst, and they do not appear in
 * the data as excluded. They appear as absent." So the run STARTS, with a
 * provisional local identity, and the join is queued and retried in the
 * background until it lands. The student sees no error at all, because a failed
 * join is not a thing a fourteen year old can fix.
 *
 * AND NOTHING ON THE PARCHMENT MOVES WHEN THE ARM IS DRAWN (§16.2). That is the
 * one rule §16 imposes on this act and it was being broken by construction:
 * `ui/skin.ts` subscribes to the save and swaps the skin on every write, and the
 * write that carries the arm lands in the middle of the identity card. A
 * plain-arm student would have watched the letter they were reading turn into a
 * worksheet the instant they pressed a button, and the student beside them would
 * not have. §16.2 says the whole opening act is vehicle and runs identically, so
 * the skin is HELD for the life of this session and released as the scroll rolls
 * away. Nothing about the assignment changes; only the frame it becomes visible
 * on does.
 */

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

/* ---- THE JOIN THAT KEEPS TRYING -------------------------------------------
 *
 * §50.19, in its own words: "the join is attempted, and when it fails for network
 * reasons the run STARTS ANYWAY with a provisional local identity, the join intent
 * is queued, and it retries in the background until it lands. The student sees no
 * error at all, because a failed join is not a thing a fourteen year old can fix.
 * When the join lands, the participant id is written into the save."
 *
 * IT LIVES AT MODULE SCOPE AND NOT IN THE COMPONENT, because the retry has to
 * outlive the parchment: the student is on the pier by the time the second attempt
 * goes out. `joinClass` already writes the participant id and the arm into the
 * save on success, and `net.ts`'s state sync already pushes from there, so nothing
 * downstream of this needs to know a queue happened.
 *
 * THE BACKOFF IS DELIBERATELY SLOW AND FINITE. One code is read off a board and
 * typed by a whole class in the same minute against one serverless function
 * (§2.7's deployment line), so a retry storm from thirty Chromebooks is the exact
 * shape of failure that keeps the endpoint down. Seven attempts over about twelve
 * minutes covers a wifi drop and an advisory block, and then it stops rather than
 * hammering a class period.
 *
 * A REFUSAL IS NOT A NETWORK FAILURE and does not retry: an unknown code or a
 * closed class is an answer, and asking again gets the same one. */
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

/* the typewriter over a block of text; a press finishes it instantly.
 *
 * REDUCED MOTION FINISHES IT BEFORE IT STARTS. A letter that types itself in is a
 * moving picture of text, which is precisely what the setting is asked for, and a
 * student who turned it on was watching this for four seconds anyway. */
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

/** the Principal's own mark, which is the drawn thing a paw print emoji was
 *  standing in for. `crest-panther.png` is the school's crest and `docs/ART.md`
 *  already assigns it; with no art it is simply absent and the name carries the
 *  signature, which is what a signature is. */
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

  /* §16.2, THE ONE RULE THIS SECTION IMPOSES ON THE OPENING ACT: "nothing on
   * screen may move when the arm is drawn". The arm arrives on the save write
   * inside `joinClass`, and `ui/skin.ts` subscribes to that write and swaps the
   * document's skin, so a plain-arm student would have seen the letter in front of
   * them turn into a worksheet at the instant of their own button press. Two
   * students side by side would have seen they were sorted.
   *
   * The hold is the whole fix and it is four lines. `skin.ts` subscribes at its
   * own import, which happens before this component mounts, so its listener runs
   * first and this one puts the skin back on the same tick, before a frame is
   * painted. The hold is released on unmount, when the scroll has already rolled
   * away, and `wearAssignedSkin` then applies the arm for the rest of the run.
   *
   * NOTHING ABOUT THE ASSIGNMENT CHANGES. The arm is still drawn server-side, at
   * the same moment, off the same hash, and it still reaches the save. Only the
   * frame it becomes VISIBLE on moves, from the middle of a letter to after it. */
  useEffect(() => {
    const held = currentSkin()
    const off = subscribeSave(() => { if (currentSkin() !== held) applySkin(held) })
    return () => { off(); wearAssignedSkin() }
  }, [])

  /* A CARD SWAP IS SILENT AND IT REPLACES THE WHOLE SCREEN. A reader was left on
   * a page that had changed under them with nothing said, and a keyboard player
   * was left focused on a button that no longer existed, which drops focus to
   * <body> and starts the next Tab at the top of the document. */
  const stage = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    announce(CARD_SAID[card])
    if (card === 'rollup') return
    /* THE PAPER ITSELF IS THE FALLBACK, and it is not a nicety. Two cards begin
     * with a letter typing itself in and carry no control at all for four
     * seconds, so there is nothing to focus; without this, focus lands on <body>,
     * which is OUTSIDE the panel, and the next Tab starts at the top of the
     * document instead of at the button that just appeared. */
    const first = stage.current?.querySelector<HTMLElement>('input, button')
    ;(first ?? stage.current)?.focus()
  }, [card])

  const next = (c: Card) => setCard(c)

  /* ---- AND A WAY BACK, WHICH THE LETTER DID NOT HAVE ----------------------
   *
   * BRIEF-PLAYTHROUGH-1, on the beach scroll: "no way back from a card". Ash met
   * five cards in a row, each of which committed a choice about his own name,
   * pronouns, appearance and boat, and not one of them could be undone. The only
   * control that went anywhere was the one that went forward.
   *
   * The order is the reading order, so back is the card before. Two exceptions,
   * both of them honest rather than convenient:
   *
   *   The code card has nothing before it, so its Back leaves the game the way
   *   the help card's does. There is no run yet, so nothing is lost, and a
   *   student who opened this by accident has a door.
   *
   *   A student who has ALREADY joined starts on `identity`, because the code is
   *   answered and re-asking it would be a question with one possible answer.
   *   Their Back is the same leave, for the same reason. */
  const ORDER: Card[] = ['code', 'identity', 'word', 'wardrobe', 'boat']
  const first: Card = alreadyJoined ? 'identity' : 'code'
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

  /* THE PARCHMENT IS MODAL AND WAS NOT SAYING SO. Focus could Tab out of the
   * letter into the live beach behind it, which is a canvas with nothing on it to
   * land on. `closeOnEscape` is false because there is no way out of the opening:
   * every card is skippable to a default, and none of them is dismissible. */
  const panel = usePanel({ label: 'A letter from Bonney Lake', closeOnEscape: false })

  return (
    <div className="i3-root">
      <div className={`i3-scroll ${card === 'rollup' ? 'i3-rollup' : ''}`} {...panel}>
        <div className="i3-paper" ref={stage} tabIndex={-1}>
          {/* ONE BACK, ON THE PAPER, NOT ONE PER CARD. The order asks for "a Back
              on every card" and the way to be sure of that is to put it outside
              the cards, where no card can forget it and no card can move it. It
              sits in the letter's own top-left corner, above whatever the card
              is, so it is in the same place on all five. */}
          {card !== 'rollup' && (
            <button className="i3-back" onClick={back}>
              {/* the same drawn arrow the help card lays out in four quarter
                  turns, at half a turn. One arrow in the game, and a rotation of
                  pixel art by a right angle is lossless where any other angle is
                  not. `Glyph` draws nothing at all when the platform has not
                  answered, so the word carries it on its own. */}
              <Glyph piece="icon_set" face="arrow" size={12} className="i3-back-mark" />
              {card === first ? 'Quit to the title screen' : 'Back'}
            </button>
          )}
          {card === 'code' && (
            <CodeCard
              initial={code}
              err={joinErr}
              onVerified={(c, name) => { setCode(c); setClassName(name); setJoinErr(''); next('identity') }}
              onCastaway={() => { setCastaway(true); setJoinErr(''); next('identity') }}
            />
          )}
          {card === 'identity' && (
            <IdentityCard
              castaway={castaway}
              className={className}
              handle={handle} setHandle={setHandle}
              pronouns={pronouns} setPronouns={setPronouns}
              joining={joining} err={joinErr}
              onNext={confirmIdentity}
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
function CodeCard({ initial, err: outerErr, onVerified, onCastaway }: {
  initial: string
  err?: string
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
  /* A REFUSAL IS WARM AND IT IS SAID OUT LOUD. §2.7: "a wrong code shakes and says
   * one kind line", never a red wall, and PLAYTEST.md's rule is broader than this
   * screen: no red buzzer, ever. The shake is the notice, the sentence is the
   * message, and `announce` is the third channel, for the student who cannot see
   * either. */
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
    tries.current++
    track('join_attempt', { len: joined.length, tries: tries.current })
    if (joined.length < 6) {
      refuse('The code is six characters. Fill in every box.')
      return
    }
    if (tries.current >= 5) {
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
      writeSave({ classCode: joined.toUpperCase() })
      onVerified(joined.toUpperCase(), r.className)
      return
    }
    /* §50.19 AGAIN, AND THIS IS THE HALF THAT USED TO SAIL THROUGH ONLY IN DEV.
     * A student on bad wifi is carried forward with the code they typed; the class
     * is verified for real by the join on the next card, and if THAT is offline
     * too the join goes in the queue. Nobody is stopped by a network. */
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
    /* THE CARD THAT OVERFLOWED ITS OWN PAPER. SWEEP-1 items 11, 44 and 93: at rest
       the plank's bottom third was sliced off, and the moment the student pressed
       it with empty boxes the refusal line added a row and pushed BOTH controls
       off the bottom, leaving a card with a red error on it and nothing to press.
       A pointer-only run stalls there for good, and it is the first card of the
       game. The letter takes the slack and scrolls; the signature, the boxes, the
       refusal and the two controls are a foot that is always on the paper. */
    <div className="i3-card i3-card-code" onClick={() => { if (!tw.done) tw.finish() }}>
      <div className="i3-letter i3-letter-scroll">{tw.shown}{!tw.done && <span className="i3-caret" aria-hidden="true" />}</div>
      {tw.done && (
        <div className="i3-codefoot">
          <Signature />
          {/* SIX LABELLED BOXES. They had no labels at all, so a reader landing in
              one heard "edit text" six times with no way to tell which of six it
              was or how many were left. The group is named once and each box says
              where it sits in the code. */}
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
          <button className="i3-castaway" onClick={() => { track('demo_entered'); onCastaway() }}>
            No code? Play without a class.
          </button>
          <Plank className="i3-plank" busy={checking} onClick={() => void submit()}>
            {checking ? 'Checking the code' : 'Join my class'}
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
        <span className="i3-fieldbox kit-surface-field">
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

// ---- card 4: the wardrobe (§2.10), the castaway trunk creaks open ----
// v1 slots what exists honestly: Thor's shirt accent recolors LIVE on a canvas (the sprite
// really changes), the earnable items show locked with their real earn rules, one randomize
// control, fully skippable. Outfit/headwear sprite swaps join as their character states land.

/* THE CRITERION COMES OFF THE ROSTER RATHER THAN OUT OF A STRING. `Wardrobe.tsx`
 * already fixed this for the outfitter's copy of the same list: the goggles used
 * to promise "complete the Robotics island" about an island that is on no roster,
 * in no registry and in no catalog, so the chip advertised an unlock nothing in
 * the game could grant. §16.2 asks for ONE SOURCE for every BLHS criterion string
 * wherever it surfaces, and this is the second surface. The two lists are still
 * two lists and that is the thing left undone here, written down rather than
 * quietly duplicated a third time. */
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
      {/* FIVE NAMELESS BUTTONS TOLD APART BY HUE ALONE, which is the audit's own
          phrase, on the control every student meets before any other. The name was
          already in `thorLook.ts` and only a `title` had it, and a title is
          pointer-only. `Wardrobe.tsx:88-99` fixed the identical control and this
          copy was left behind. */}
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
      {/* THE LOCKED ITEMS SAY WHAT THEY ARE AND WHAT EARNS THEM, ON THE CARD.
          §2.10: "locked items are visible and say what real thing earns them,
          because a locked thing a student can see is a reason to come back." They
          were three emoji with a padlock emoji on the corner and the criterion in
          a `title` attribute, which is pointer-only and is not visible at all. */}
      <div className="i3-locked" role="group" aria-label="Locked items">
        {LOCKED.map((it) => (
          <button
            key={it.name}
            className="i3-lockrow"
            aria-label={`${it.name}, locked. Earn it by: ${it.earn}.`}
            onClick={() => {
              track('locked_item_inspected', { item: it.name })
              announce(`${it.name}. Earn it by: ${it.earn}.`)
            }}
          >
            <Glyph
              piece="icon_set" face="lock" size={15} className="i3-lockmark"
              fallback={<span className="i3-lockmark i3-lockshape" aria-hidden="true" />}
            />
            <span className="i3-lockname">{it.name}</span>
            <span className="i3-lockearn">{it.earn}</span>
          </button>
        ))}
      </div>
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
        <span className="i3-fieldbox kit-surface-field">
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
