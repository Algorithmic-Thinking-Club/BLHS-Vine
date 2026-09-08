/* THE YEAR SHEET, WHICH IS THE GAME'S CENTREPIECE MECHANIC AND WAS A WIREFRAME.
 *
 * `build-shots/ui/before/08-planner.png` is what a student met: three dashed CSS
 * boxes, one CSS radial-gradient circle repeated three times for the season
 * tokens, two flat rectangles for buttons and an operating-system pushpin, in a
 * mostly empty sheet. Every piece of it is specified in
 * `docs/walkthrough/05-first-plan.md` §5.1 to §5.19 and almost none of it was
 * built the way the specification describes.
 *
 * THE FIVE THINGS THIS REBUILD CHANGES, each against the line that asked for it.
 *
 * 1. THE TOKEN IS THE DRAWN COIN. §5.4: *"the rail currently renders three
 *    visually identical pips whose only distinguishing mark is a `title`
 *    attribute... a token that cannot be told apart from another token is not a
 *    token, it is a counter."* MAPVIS drew a `pip` sheet with fall, winter,
 *    spring, spent and ghost on it, the HUD has worn those faces since the
 *    corner was rebuilt, and the sheet the HUD opens drew circles. It wears them
 *    now, AND prints the season's name beside each one, because a face that only
 *    arrives behind `?kit=1` cannot be the only thing telling two tokens apart.
 *
 * 2. THE PLACEMENT IS A REAL DRAG. §5.5 is titled *"The drag, which is the
 *    mechanic and is not built"* and the count was zero: no `draggable`, no
 *    `onDragStart`, no `onDrop`, no `onPointerDown` in the whole file. It is
 *    pointer events, with capture and a movement threshold, so mouse, trackpad
 *    and finger are one code path rather than three, which is §5.5's own
 *    reasoning about a school Chromebook whose touchscreen nobody has confirmed.
 *
 *    AND THE KEYBOARD PATH IS NOT THE FALLBACK. §11.3 requires a select-and-place
 *    mode beside every drag, and §5.5 adds the discipline that *"the drag must
 *    not acquire a capability the click path lacks"*. Press a socket, or press a
 *    token, and the same column opens the same list. Both verbs end in
 *    `assignSlot` and neither one is a second implementation of it.
 *
 * 3. A REFUSAL IS TAUGHT RATHER THAN HIDDEN. §5.7: *"The student does not meet
 *    the rule, they meet a shorter list."* Every programme on the roster appears
 *    in every column, the ones that do not belong carry the school's own
 *    sentence out of `run/refusal.ts`, and the same string is served to a click,
 *    a drop and a keyboard. A wrong drop lands the reason IN the socket.
 *
 * 4. IT IS A PANEL. §5.18: no `role`, no focus trap, no accessible name, Tab
 *    walking out into the HUD behind it. `usePanel` now owns all five promises,
 *    and the hand-rolled capture-phase Escape listener that used to sit at lines
 *    62-66 is gone: it closed the sheet AND whatever was under it with one press,
 *    and it could not close a column's open list without closing the document.
 *
 * 5. THE STAMP BLOCK IS PINNED. Every size in the old file was a function of the
 *    sheet's WIDTH, so on the 1366x768 deployment target *"Stamp the sheet"* sat
 *    below the fold of a scrolling rail with nothing saying it was there. The
 *    stamp is a flex footer outside the scroll now and cannot leave the screen.
 *
 * WHAT THIS FILE STILL DOES NOT DO, so nobody reads the absence as a decision:
 * §5.13's rival sheet is not built and cannot be until Ash rules on §17.3;
 * §5.12's *"attend now"* still runs the beat from the sheet rather than sending
 * the player to the hearth, which is Q5.12.a and his call; and an unspent token
 * still survives the stamp and is destroyed at the year turn, which is §5.4's
 * defect and lives in `save.ts`. The sheet says what happens to it instead of
 * pretending it does not.
 *
 * THE ARM DOES NOT REACH THIS FILE AND MUST NOT. §5.19: the planner is vehicle
 * and renders identically for both arms. `save.arm` is read zero times here and
 * the day somebody adds a branch on it the vehicle stops being vehicle. What the
 * PLAIN SKIN changes is the stylesheet and nothing else, which is what §16
 * defines an arm as: the same document, without the paint.
 */
import { useEffect, useRef, useState } from 'react'
import {
  classById, classOffer, cordHint, DEPT_LABEL, DEPTS, LADDER_NOTE,
  type ClassDef, type Dept,
} from './catalog'
/* what a season token may be spent on is the roster's, not the planner's. A slot
 * points at a programme id and the roster says what programmes exist. */
import { PROGRAMMES, programmeById, seasonOf } from '../roster/roster'
import {
  assignSlot, clearSlot, dropClass, loadSave, pickClass, SEASONS, stampPlan, subscribeSave,
  type Season, type YearPlan,
} from '../save'
import { cordsOf, letterOf } from '../progress'
import { beatDone } from '../beats/beats'
import { classDone } from '../beats/classes'
import { retakeAvailable } from '../beats/score'
import { firstLook, markLooked } from '../hud/first-look'
import { yearStatus } from '../run/year'
import { nextObjective } from '../run/objective'
import { refuseClass, refuseSlot } from '../run/refusal'
import { yearbookYears, yearTurned } from '../run/yearbook-page'
import { track } from '../telemetry'
import { announce, focusablesIn, usePanel } from '../ui/a11y'
import { Empty, Glyph, Plank, Socket } from '../ui/controls'
import { saved } from '../ui/feedback'
import './planner.css'

// Opened by: the HUD token pips, the pause sheet, and the chart table station
// via requestUi('planner') (ui-bus.ts).
//
// WHICH THINGS ARE PLANKS AND WHICH ARE NOT, decided once so the sheet does not
// read as a fence of signs. A `Plank` is a hanging wooden sign, so it is what a
// student PRESSES TO ACT: close, lift, drop, never mind, pick a class, attend,
// sit, retake, the shelf, and the stamp and the wax. The rows in a season's list
// and in the class picker are not signs, they are LINES ON THE PAPER a finger
// runs down, fifty-one of them in the picker, and `.kit-plank-ink` is
// `white-space: nowrap` with an ellipsis, which would cut "AP Seminar (with
// Honors 10 English)" in half on every row that needed two lines.

const CORE_BEAT_DESC: Record<number, string> = {
  1: 'You learn the POWER values, the bell schedule, and how to join a club',
  2: 'You learn every cord and seal, and the Universal Retake Policy',
  3: 'You learn the 24 credits, dual credit, and the exact rule for AP Capstone',
  4: 'You check your cords and find out what you need to walk the stage',
}

/* ONE STRING FOR THE OPEN-SEASON RULE, WHICH IS §5.15'S FINDING. The sheet said
 * "seasons left open stay open, the year sails without them" under the disabled
 * stamp and "unspent seasons stay open for free sailing" inside the confirm:
 * two sentences for one idea on one screen, three inches apart. */
const OPEN_SEASONS = 'You can leave a season empty and still save the year.'

/* how far a pointer has to travel before a press becomes a drag. Small enough
 * that a deliberate drag never feels sticky, large enough that a trackpad tap
 * with a millimetre of drift is still a tap and still opens the column. */
const DRAG_SLOP = 6

/** a season token in the air, between the rail and wherever it lands */
type Airborne = {
  season: Season
  /** where the coin is drawn, in the veil's own coordinates */
  x: number
  y: number
  /** the column under the pointer right now, for the socket's `over` state */
  over: Season | null
  /** the programme row under the pointer, when a column's list is open */
  act: string | null
  /** past the slop, so this is a drag and the pointerup is not a click */
  moved: boolean
}

/** what is refused, and where the sentence has to appear */
type Refusal = { where: Season | 'classes'; why: string }

export function Planner({ onClose, onAdvisory, onSitClass, onYearbook }: {
  onClose: () => void
  onAdvisory?: () => void
  onSitClass?: (classId: string) => void
  onYearbook?: () => void
}) {
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const s = loadSave()
  const year = s?.year ?? 1
  const plan: YearPlan = s?.plans[year] ?? { slots: {}, classes: [], stamped: false }

  const openedAt = useRef(Date.now())
  const changes = useRef(0)
  const [placing, setPlacing] = useState<Season | null>(null)
  const [pickingClass, setPickingClass] = useState(false)
  const [confirming, setConfirming] = useState(false)
  /* THE REFUSAL THE STUDENT IS CURRENTLY LOOKING AT (N3). One string, from
   * `run/refusal.ts`, and the same one the save's own verb enforces. It carries
   * WHERE it belongs now, because §5.7 wants the sentence in the socket the drop
   * was refused by and not in a corner of the sheet. */
  const [refused, setRefused] = useState<Refusal | null>(null)
  const [air, setAir] = useState<Airborne | null>(null)

  const veilRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  /* the airborne token, read by pointer handlers that were created on an older
   * render. State drives the picture; this drives the decision. */
  const airRef = useRef<Airborne | null>(null)
  const grabAt = useRef<{ x: number; y: number } | null>(null)
  /* a drag ends with a `pointerup`, and the browser then dispatches a `click` to
   * the common ancestor. Without this the click that ends a drag on the veil
   * closes the whole sheet, and the click that ends a drag on a token re-opens
   * the column the token just left. */
  const swallowClick = useRef(false)

  useEffect(() => { track('planner_opened', { year }) }, [year])

  /* CONTROLS ARE FOUND BY ID RATHER THAN HELD IN A REF, because `Plank` and
   * `Socket` are the kit's and this file may not edit them to forward one. An id
   * is safe here for the reason it is usually not: the year sheet is a modal
   * dialog, so exactly one of it is ever mounted. */
  const backTo = (el: HTMLElement | null | undefined) => el?.focus?.()
  const byId = (id: string) => document.getElementById(id)
  const socketOf = (season: Season) => byId(`pl-sock-${season}`)
  /* AFTER THE RENDER, NOT DURING IT. Closing a sub-state is what puts its opener
   * back on the page, so asking for that control in the same tick asks the DOM
   * for a node React has not written yet and focus silently falls to <body>,
   * which is the exact §5.18 failure this is here to fix. */
  const focusAfter = (id: string) => { window.setTimeout(() => backTo(byId(id)), 0) }

  const cancelDrag = () => {
    if (!airRef.current) return
    const season = airRef.current.season
    airRef.current = null
    grabAt.current = null
    setAir(null)
    announce(`Nothing placed. ${season} is still open.`)
  }

  const shutColumn = () => {
    const was = placing
    setPlacing(null)
    setRefused(null)
    if (was) backTo(socketOf(was))
  }

  /* ESCAPE CLOSES THE INNERMOST THING, WHICH §5.18 ASKED FOR AND NOTHING DID.
   * The old listener was a capture-phase `keydown` on `window` that always
   * called `onClose`, so a student who opened the wrong column's list could only
   * escape it by closing the entire document, and the same press also reached
   * whatever was under the sheet. `usePanel` owns the key now and this is what it
   * calls, so the order is: a token in the air, then the confirm, then the class
   * picker, then an open column, and only then the sheet itself. */
  const escape = () => {
    if (airRef.current) { cancelDrag(); return }
    if (confirming) { setConfirming(false); focusAfter('pl-stamp'); return }
    if (pickingClass) { setPickingClass(false); setRefused(null); focusAfter('pl-pick'); return }
    if (placing) { shutColumn(); return }
    onClose()
  }

  const panel = usePanel({ label: 'The year sheet', onClose: escape })

  /* FOCUS FOLLOWS THE STATE SWAP. §5.18: pressing "place the season token" used
   * to replace the focused button with a list of buttons, so focus fell to
   * `<body>` and the next Tab restarted at the top of the document. */
  useEffect(() => {
    if (!placing || !listRef.current) return
    focusablesIn(listRef.current)[0]?.focus()
  }, [placing])
  useEffect(() => {
    if (!pickingClass || !pickerRef.current) return
    focusablesIn(pickerRef.current)[0]?.focus()
  }, [pickingClass])

  if (!s) return null

  const pickedByYear: Record<number, string[]> = {}
  for (const [y, p] of Object.entries(s.plans)) pickedByYear[Number(y)] = p.classes

  const refuse = (where: Season | 'classes', why: string) => {
    setRefused({ where, why })
    announce(why)
  }

  /* ONE PATH FOR CLICK, DROP AND KEYBOARD (N3). The season lock used to be a
   * `.filter()` on this menu, which is not a refusal: it removed the programme so
   * a student who came looking for football in spring found an absence and no
   * sentence, and any caller that was not this render could write the slot
   * anyway. The refusal is asked for first, printed if there is one, and the same
   * function guards `assignSlot` itself. */
  const place = (season: Season, activityId: string) => {
    const why = refuseSlot(activityId, season, s, year)
    if (why) { refuse(season, why); track('slot_refused', { year, season, activity: activityId, why }); return }
    changes.current++
    setRefused(null)
    assignSlot(year, season, activityId)
    track('slot_assigned', {
      year, season, activity: activityId,
      deliberationMs: Date.now() - openedAt.current, changes: changes.current,
    })
    setPlacing(null)
    announce(`You joined ${programmeById(activityId)?.name ?? activityId} for ${season}.`)
    focusAfter(`pl-sock-${season}`)
  }

  const lift = (season: Season) => {
    changes.current++
    clearSlot(year, season)
    /* §5.14: "lift calls nothing", so a student who placed, thought, and lifted
     * produced no record of the reversal at all and the only trace was the
     * `changes` counter on whatever they placed next. Reversal is the behaviour
     * that most directly shows a decision being weighed. */
    track('slot_lifted', { year, season, deliberationMs: Date.now() - openedAt.current, changes: changes.current })
    announce(`${season} is empty again. You can pick something else.`)
  }

  const addClass = (id: string) => {
    /* the two-pick limit is scarcity, so it says so rather than the button
     * quietly not being there. Same function the save's `pickClass` enforces. */
    const why = refuseClass(id, s, year)
    if (why) { refuse('classes', why); track('class_refused', { year, class: id, why }); return }
    setRefused(null)
    pickClass(year, id)
    track('class_picked', { year, class: id })
    setPickingClass(false)
    announce(`${classById(id)?.name ?? id} added to your classes.`)
    focusAfter('pl-pick')
  }

  const stamp = () => {
    /* the slot's own value IS the programme id, so the stamp no longer translates
     * one key into another on the way to the save. It used to map a programme id
     * to an island id, which is how a stadium's three programmes ended up sharing
     * one completion record. */
    const committed = SEASONS.map((se) => plan.slots[se]).filter(Boolean) as string[]
    stampPlan(year, committed)
    track('planner_stamped', { year, slots: plan.slots, classes: plan.classes })
    setConfirming(false)
    /* §5.15: "the stamp should be the loudest thing that has happened so far and
     * today it is a CSS gradient with an emoji in it." The wax is drawn art on the
     * sheet, and the kit's own saved() carries it off the sheet as well, which is
     * also how it reaches a screen reader. */
    saved(`Year ${year} is stamped and saved.`)
  }

  // ---- THE DRAG ------------------------------------------------------------
  //
  // Pointer capture means every move after the press comes back to the coin that
  // was grabbed, even when the pointer leaves it, so there is no window listener
  // to leak and no mouse-only path. The drop target is hit-tested from the
  // pointer rather than tracked with enter and leave handlers, because the coin
  // itself is under the pointer and would eat every one of them.

  const localPoint = (e: React.PointerEvent) => {
    const box = veilRef.current?.getBoundingClientRect()
    return { x: e.clientX - (box?.left ?? 0), y: e.clientY - (box?.top ?? 0) }
  }

  const grab = (season: Season) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (plan.stamped || e.button > 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    grabAt.current = { x: e.clientX, y: e.clientY }
    const next: Airborne = { season, ...localPoint(e), over: null, act: null, moved: false }
    airRef.current = next
    setAir(next)
  }

  const carry = (e: React.PointerEvent<HTMLButtonElement>) => {
    const held = airRef.current
    const from = grabAt.current
    if (!held || !from) return
    const far = Math.hypot(e.clientX - from.x, e.clientY - from.y) > DRAG_SLOP
    if (!held.moved && !far) return
    /* the topmost element under the pointer, and then the nearest thing that has
     * declared itself a drop target. The airborne coin is `pointer-events: none`
     * so it never hides what is under it. */
    const under = document.elementFromPoint(e.clientX, e.clientY)
    const target = under?.closest<HTMLElement>('[data-drop-season]') ?? null
    const next: Airborne = {
      ...held,
      ...localPoint(e),
      over: (target?.dataset.dropSeason as Season | undefined) ?? null,
      act: target?.dataset.dropAct ?? null,
      moved: true,
    }
    airRef.current = next
    setAir(next)
  }

  const letGo = (e: React.PointerEvent<HTMLButtonElement>): Airborne | null => {
    const held = airRef.current
    airRef.current = null
    grabAt.current = null
    setAir(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    return held
  }

  const release = (e: React.PointerEvent<HTMLButtonElement>) => {
    const held = letGo(e)
    if (!held) return
    if (!held.moved) return   // a press, not a drag: the click handler answers it
    swallowClick.current = true
    land(held)
  }

  /* A CANCELLED POINTER IS NOT A DROP. The browser takes the pointer away when a
   * touch turns into a scroll or the window loses it, and treating that as a drop
   * would spend a season token on whatever the coin happened to be over. */
  const abort = (e: React.PointerEvent<HTMLButtonElement>) => {
    const held = letGo(e)
    if (held?.moved) announce(`Nothing placed. ${held.season} is still open.`)
  }

  /* WHERE A DROPPED TOKEN GOES, and every branch of it is a sentence rather than
   * a snap-back. §5.5: "A token that silently snaps back has taught nothing." */
  const land = (held: Airborne) => {
    if (!held.over) { announce(`Nothing placed. ${held.season} is still open.`); return }
    if (held.over !== held.season) {
      /* THE ONE REFUSAL THAT IS NOT IN `refusal.ts`, and it is here on purpose.
       * Every sentence in that file is a fact about the school or about scarcity.
       * This one is a fact about the OBJECT: `save.tokens` is a `Season[]` and
       * `assignSlot` splices out a token whose value equals the column, so there
       * is no such thing as a spare token that could go anywhere. §5.4 asks for
       * that model to be said out loud rather than left as an absence, and the
       * only moment a student can be told is the moment they try it. */
      refuse(held.over, `That is your ${held.season.toLowerCase()} token. Drop it on ${held.season}.`)
      track('slot_refused', { year, season: held.over, activity: null, why: 'wrong season token' })
      return
    }
    if (held.act) { place(held.season, held.act); return }
    setRefused(null)
    setPlacing(held.season)
    announce(`Now pick your ${held.season.toLowerCase()} activity.`)
  }

  const pressToken = (season: Season) => {
    /* the select-and-place half, and it does exactly what the drop on the same
     * socket does, because §5.5 forbids the drag having a capability the key path
     * lacks. Press the coin, the column opens, the list takes focus. */
    if (swallowClick.current) { swallowClick.current = false; return }
    if (plan.stamped) return
    setRefused(null)
    setPlacing(season)
  }

  // ---- what the sheet knows -------------------------------------------------

  /* THE COUNSELOR'S MARGIN, SPEAKING AT ZERO. §5.11: the filter was
   * `!c.earned && c.progress > 0`, and at Year 1 with an empty ledger every one
   * of the seven cords has progress exactly zero, so the block that exists to
   * inform a fourteen year old planning a career they know nothing about was
   * empty on the one sheet that needed it and filled in Year 2, for a student who
   * had already made the choice it was meant to inform.
   *
   * THE SCHOOL'S SENTENCE IS WHAT GETS PRINTED. `CordProgress.rule` is the
   * criterion in the school's own words out of `awards.md`; `detail` is what this
   * game counts. Q5.11.a's safer answer is that the proxy never appears as the
   * criterion, so a cord nobody has moved yet shows the RULE, and a cord in
   * motion shows the count under it. */
  const notes = cordsOf(s)
    .filter((c) => !c.earned)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3)

  /* AND THE MARGIN READS THE SHEET, not only the ledger. §5.11's sharpest want:
   * the margin's whole value is that it can say something about the plan in front
   * of the student, which no other surface in the game can see. */
  const picked = plan.classes.map((id) => classById(id)).filter((c): c is ClassDef => !!c)
  const marginOnPlan = plan.stamped ? null
    : plan.classes.length < 2
      ? `${2 - plan.classes.length} focus ${plan.classes.length === 1 ? 'class' : 'classes'} still to choose.`
      : picked.every((c) => !cordHint(c.tags))
        ? 'Neither class counts toward a graduation cord. That is allowed. Take what you like.'
        : null

  /** the years whose page has turned, which is the shelf the sheet can reach */
  const pastPages = yearbookYears(s).filter((y) => yearTurned(s, y))

  /* IS THERE A CLUB OR SPORT TO PICK AT ALL. One question, asked once, and every
   * season-shaped thing on this sheet hangs off it (BRIEF-CLOSE-THE-LOOP section
   * 4). `PROGRAMMES` is already masked by the roster, so this is the same test
   * `PickYear` and the objective sequencer make. */
  const offersActivities = PROGRAMMES.some((p) => p.playable)
  /* said once, and marked when the panel is really up: a read that also wrote
   * would blank itself on the second render */
  const [told] = useState(() => firstLook('my-year'))
  useEffect(() => { markLooked('my-year') }, [])
  const slotsFilled = SEASONS.filter((se) => plan.slots[se]).length
  const canStamp = !plan.stamped && plan.classes.length === 2
  const stampNote = plan.stamped ? null
    : plan.classes.length < 2 ? 'Pick two classes.'
      : slotsFilled < SEASONS.length ? OPEN_SEASONS
        : null

  const objective = plan.stamped ? nextObjective(s) : null
  const classRefusal = refused?.where === 'classes' ? refused.why : null

  return (
    <div className="pl-veil" ref={veilRef} onClick={() => { if (!swallowClick.current) onClose(); swallowClick.current = false }}>
      <div
        className={`pl-sheet kit-surface-panel${air?.moved ? ' pl-dragging' : ''}`}
        onClick={(e) => { e.stopPropagation(); swallowClick.current = false }}
        {...panel}
      >
        {/* THE CLOSE CONTROL IS AT THE BOTTOM, NOT UP HERE, and it is a layout
            decision made for the keyboard. `usePanel` gives focus to the first
            focusable in the panel, so a header "put the pen down" would be the
            first thing a keyboard student lands on every time the sheet opens:
            the way out, offered before the way in. */}
        <div className="pl-head">
          <h2 className="pl-title">Year sheet</h2>
          {told && <p className="pl-firstlook">{told}</p>}
          <span className="pl-year">Year {year} of 4</span>
        </div>

        {/* THE ADVISORY PIN (§5.12): the one thing on the sheet the student did
            not choose, printed where a choice would go and given no controls of
            its own. The pushpin was an operating-system emoji; `pointer` has
            `pin_plate` and `pin_tail` drawn, and when neither is worn the words
            carry the line on their own rather than a substitute character. */}
        <div className="pl-pin">
          <Glyph piece="pointer" face="pin_tail" size={20} className="pl-pin-head" />
          <span className="pl-pin-words">
            <b>Advisory, every year.</b>{' '}{CORE_BEAT_DESC[year] ?? CORE_BEAT_DESC[1]}
          </span>
          {beatDone(s.ledger, year)
            ? (
              <span className="pl-pin-done">
                <Glyph piece="icon_set" face="tick" size={15} />
                attended
              </span>
            )
            : onAdvisory && <Plank size="sm" onClick={onAdvisory}>go to Advisory</Plank>}
        </div>

        <div className="pl-body">
          {/* ---- THE SEASONS COME OFF THE SHEET UNTIL THERE IS ONE ----------
              BRIEF-CLOSE-THE-LOOP section 4: *"Wiseman's model stays in the code
              and disappears from every screen until a real sport with a season
              exists. One club or sport a year; no tokens shown; the words Fall,
              Winter and Spring appear nowhere a student reads."*

              Ash, 2026-09-08: *"what even happened to the fall, winter, spring
              shit. how does that even work. what even is that about. NONE of that
              is explained, and even I dont know, which is the bigger problem."*

              Nothing is deleted. `SEASONS`, `assignSlot`, the season lock and the
              token splice are all still underneath, and the moment one programme
              on the roster is playable this whole block draws again exactly as it
              did. What a student is spared is three empty columns and three coins
              for a choice the game cannot currently offer him. */}
          {!offersActivities ? (
            <section className="pl-col pl-col-none">
              <h3 className="pl-colhead">After school</h3>
              <p className="pl-empty">Nobody has built a club or sport island yet.</p>
              <p className="pl-note">Your two Elective periods are the whole of this year's picks.</p>
            </section>
          ) : (
          <div className="pl-cols" role="group" aria-label="The three seasons">
            {SEASONS.map((season) => {
              const committed = plan.slots[season] ? programmeById(plan.slots[season]!) : null
              /* THE WHOLE ROSTER IS ON THE MENU AND THE REFUSED ONES SAY WHY.
               * This was `.filter(programmeAllowedIn)`, so out-of-season
               * programmes vanished and the season lock taught nothing: the
               * mechanic that makes a student obey the truth before anybody
               * explains it only works if they can see the thing they cannot
               * have. Refused rows still render; they carry the refusal. */
              const menu = PROGRAMMES.map((a) => ({ a, why: refuseSlot(a.id, season, s, year) }))
              const wrongToken = !!air?.moved && air.over === season && air.season !== season
              const shownRefusal = wrongToken
                ? `That is your ${air.season.toLowerCase()} token. Drop it on ${air.season}.`
                : refused?.where === season ? refused.why : null
              return (
                <section className="pl-col" key={season}>
                  <h3 className="pl-col-head">
                    <Glyph piece="pip" face={season.toLowerCase()} size={18} className="pl-col-pip" />
                    {season}
                  </h3>

                  {committed ? (
                    /* THE FILLED SLOT IS NOT A BUTTON, and that is deliberate
                       rather than an oversight: it holds "lift the token", and a
                       control inside a control is unreachable by keyboard and
                       invalid in the document. It wears the same drawn socket
                       ground so it reads as the same slot, now full. */
                    <div className="pl-filled kit-surface-socket" data-state="filled">
                      <div className="pl-card-name">{committed.name}</div>
                      <div className="pl-card-blurb">{committed.blurb}</div>
                      {committed.host && <div className="pl-card-host">with {committed.host}</div>}
                      <div className="pl-card-token">
                        <Glyph
                          piece="pip"
                          face={season.toLowerCase()}
                          size={22}
                          fallback={<span className="pl-coin pl-coin-spent" aria-hidden="true" />}
                        />
                        <span>this is your {season.toLowerCase()} activity</span>
                      </div>
                      {!plan.stamped && (
                        <Plank size="sm" wide onClick={() => lift(season)}>remove this activity</Plank>
                      )}
                    </div>
                  ) : plan.stamped ? (
                    <div className="pl-open">left open this year</div>
                  ) : (
                    <Socket
                      id={`pl-sock-${season}`}
                      data-drop-season={season}
                      caption={s.tokens.includes(season)
                        ? `pick your ${season.toLowerCase()} activity`
                        : `you already used your ${season.toLowerCase()} pick`}
                      over={!!air?.moved && air.over === season && air.season === season}
                      refusing={shownRefusal}
                      aria-expanded={placing === season}
                      aria-controls={`pl-list-${season}`}
                      onClick={() => { setRefused(null); setPlacing(season) }}
                    >
                      {/* THE SOCKET SAYS WHICH SEASON BEFORE ANY WORD DOES.
                          Ash's non-reader law, added to the brief on
                          2026-09-01: "Any panel a student is sent to must be
                          usable by looking: the year sheet's empty sockets say
                          where a token goes before any label does."

                          `ghost` alone is a drawn empty ring, which says A TOKEN
                          goes here and not WHICH, so three sockets in a row were
                          three identical rings told apart only by the caption
                          above them. The season's own mark, dimmed, sits inside
                          the ring: a maple leaf, a snowflake, a sprout. The
                          shape carries the season and the dimming carries the
                          empty, so neither is doing the other's job and neither
                          is a hue. */}
                      <span className="pl-sock-well">
                        <Glyph
                          piece="pip"
                          face="ghost"
                          size={38}
                          className="pl-sock-ring"
                          fallback={<span className="pl-coin pl-coin-ghost" aria-hidden="true" />}
                        />
                        <Glyph
                          piece="pip"
                          face={season.toLowerCase()}
                          size={24}
                          className="pl-sock-want"
                        />
                      </span>
                    </Socket>
                  )}

                  {placing === season && !plan.stamped && (
                    <div className="pl-menu" id={`pl-list-${season}`} ref={listRef}>
                      {menu.length === 0 && (
                        <Empty
                          what="No activities open yet"
                          fills="Clubs and sports show up here when they open."
                        />
                      )}
                      {menu.map(({ a, why }) => (
                        <button
                          type="button"
                          className={`pl-act${why ? ' pl-act-shut' : ''}`}
                          key={a.id}
                          data-drop-season={season}
                          data-drop-act={a.id}
                          /* NEVER `disabled`. A disabled control cannot be
                             reached by a keyboard and cannot say why it refused,
                             and §5.7 needs the reason to read on FOCUS, because
                             hover has no keyboard equivalent. */
                          aria-disabled={!!why}
                          onClick={() => place(season, a.id)}
                        >
                          <span className="pl-act-name">{a.name}</span>
                          <span className="pl-act-why">
                            {/* THE DRAWN LOCK, WHICH WAS ALREADY PAID FOR. `icon_set`
                                publishes compass, key, star, lock, tick, cross, arrow
                                and coin, and `lock` had never been shown to a student.
                                It sits BEFORE the sentence and never instead of it:
                                §5.7's whole argument is that the reason is the
                                teaching, so the mark is a second signal and not a
                                replacement for the words. */}
                            {why && <Glyph piece="icon_set" face="lock" size={13} className="pl-act-lock" />}
                            {/* THROUGH `seasonOf` AND NOT OFF THE FIELD. This read
                                `a.season`, which no shipped sport sets: a sport's
                                season is the school's table (`SPORT_SEASONS`) keyed
                                by id, so every sport on this menu read "a undefined
                                sport". */}
                            {why ?? (a.kind === 'sport'
                              ? `a ${String(seasonOf(a)).toLowerCase()} sport`
                              : 'a club, any season')}
                          </span>
                        </button>
                      ))}
                      <Plank size="sm" wide onClick={shutColumn}>cancel</Plank>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
          )}

          <div className="pl-rail">
            {offersActivities && (
            <section>
              <h3 className="pl-sect">Your season tokens</h3>
              {/* §5.4: three tokens and three columns, one token per column and
                  never a pool. The coin is the drawn `pip` face and the season's
                  NAME is printed beside it, because a face that only arrives with
                  the platform kit cannot be the only thing telling two apart. */}
              <div className="pl-tokens">
                {s.tokens.map((t, i) => (
                  <button
                    type="button"
                    key={t + i}
                    className={`pl-token${air?.season === t && air.moved ? ' pl-token-aloft' : ''}${placing === t ? ' pl-token-lifted' : ''}`}
                    aria-label={`Your ${t.toLowerCase()} season token. Press it to pick your ${t.toLowerCase()} activity.`}
                    disabled={plan.stamped}
                    onPointerDown={grab(t)}
                    onPointerMove={carry}
                    onPointerUp={release}
                    onPointerCancel={abort}
                    onClick={() => pressToken(t)}
                  >
                    <Glyph
                      piece="pip"
                      face={t.toLowerCase()}
                      size={26}
                      fallback={<span className="pl-coin" aria-hidden="true" />}
                    />
                    <span className="pl-token-name">{t}</span>
                  </button>
                ))}
                {s.tokens.length === 0 && <span className="pl-token-hint">You have used all three season tokens.</span>}
              </div>
              {s.tokens.length > 0 && (
                <p className="pl-token-note">
                  {plan.stamped
                    /* §5.4's defect, said rather than hidden: `stampPlan` does not
                       consume, refund or mention an unspent token, and the next
                       `endYear` overwrites the array with a fresh three. Q5.4.a
                       recommends making the forfeit visible; the fix belongs in
                       `save.ts`, so until then the sheet at least does not let a
                       physical object vanish between screens without a word. */
                    ? 'Your year sheet is stamped. Leftover season tokens are gone when the year ends.'
                    : 'Drag a season token onto a season, or press the token.'}
                </p>
              )}
            </section>
            )}

            <section>
              <h3 className="pl-sect">Focus classes, pick 2</h3>
              {plan.classes.map((id) => {
                const c = classById(id)
                if (!c) return null
                const hint = cordHint(c.tags)
                const sat = classDone(s.ledger, id)
                const grade = sat ? s.ledger.find((e) => e.id === `class:${id}`)?.grade : undefined
                return (
                  <div className="pl-class" key={id}>
                    <span className="pl-class-name">{c.name}</span>
                    {hint && <span className="pl-class-hint">{hint}</span>}
                    {!plan.stamped && (
                      <Plank
                        size="sm"
                        className="pl-class-x"
                        glyph={['icon_set', 'cross']}
                        aria-label={`remove ${c.name}`}
                        onClick={() => { dropClass(year, id); announce(`${c.name} removed from your classes.`) }}
                      >
                        remove
                      </Plank>
                    )}
                    {plan.stamped && (sat
                      ? (
                        <>
                          <span className="pl-class-grade">{grade !== undefined ? letterOf(grade) : 'passed'}</span>
                          {/* the Universal Retake (§8.1), from the sheet too: under a B-, once */}
                          {onSitClass && retakeAvailable(s, `class:${id}`) && (
                            <Plank size="sm" onClick={() => onSitClass(id)}>retake</Plank>
                          )}
                        </>
                      )
                      : onSitClass && <Plank size="sm" onClick={() => onSitClass(id)}>go to class</Plank>)}
                  </div>
                )
              })}

              {!plan.stamped && plan.classes.length < 2 && !pickingClass && (
                <Plank size="sm" wide id="pl-pick" onClick={() => setPickingClass(true)}>pick a class</Plank>
              )}

              {pickingClass && (
                <div className="pl-classmenu" ref={pickerRef}>
                  {/* §5.10: the ladder is stated as the GAME's rule, once, above
                      the list, and never in the register the sheet uses for
                      sourced school facts. Nothing in docs/blhs/ states a
                      prerequisite policy at all. */}
                  <p className="pl-ladder-note">{LADDER_NOTE}</p>
                  {DEPTS.map((dept: Dept) => {
                    const list = classOffer(year, pickedByYear).filter((o) => o.c.dept === dept)
                    if (!list.length) return null
                    return (
                      <div key={dept}>
                        <h4 className="pl-dept">{DEPT_LABEL[dept]}</h4>
                        {list.map(({ c, why, ladder }) => {
                          const hint = cordHint(c.tags)
                          return (
                            <button
                              type="button"
                              className={`pl-act${why ? ' pl-act-shut' : ''}${ladder ? ' pl-act-rung' : ''}`}
                              key={c.id}
                              aria-disabled={!!why}
                              onClick={() => (why ? refuse('classes', `${c.name}: ${why}.`) : addClass(c.id))}
                            >
                              <span className="pl-act-name">{c.name}</span>
                              <span className="pl-act-why">
                                {why && <Glyph piece="icon_set" face="lock" size={13} className="pl-act-lock" />}
                                {why ?? hint ?? 'does not count toward a cord'}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                  {classRefusal && <p className="pl-refusal">{classRefusal}</p>}
                  <Plank
                    size="sm"
                    wide
                    onClick={() => { setRefused(null); setPickingClass(false); focusAfter('pl-pick') }}
                  >
                    cancel
                  </Plank>
                </div>
              )}
              {!pickingClass && classRefusal && <p className="pl-refusal">{classRefusal}</p>}
            </section>

            {(notes.length > 0 || marginOnPlan) && (
              <section>
                <h3 className="pl-sect">Cords you are working toward</h3>
                {marginOnPlan && <p className="pl-note-plan">{marginOnPlan}</p>}
<ul className="pl-notes">
                  {notes.map((c) => (
                    <li key={c.id}>
                      <span className="pl-note-name">{c.name}</span>
                      {/* THE SCHOOL'S SENTENCE, ALWAYS, and the count under it and
                          never instead of it. Q5.11.a's safer answer: this game has
                          no proficiency instrument, so what it counts toward the
                          Seal is a proxy, and a proxy printed as the criterion is
                          the sheet misrepresenting a real school rule on the one
                          surface a student reads while choosing. */}
                      <span className="pl-note-rule">{c.rule}</span>
                      {c.progress > 0 && <span className="pl-note-count">{c.detail}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* PAST PAGES ARE REACHABLE AFTER THEY HAVE TURNED, which §80.6 asks
                for and nothing offered: the only door to the yearbook was the
                button below, and it only appears in the window where THIS year is
                closable and unturned. So a student could not look at year one
                again from the moment year one ended. The book opens on the live
                year and its spine walks back. */}
            {onYearbook && pastPages.length > 0 && (
              <section>
                <h3 className="pl-sect">Past yearbooks</h3>
                <Plank size="sm" wide onClick={onYearbook}>
                  open a past yearbook ({pastPages.map((y) => `year ${y}`).join(', ')})
                </Plank>
              </section>
            )}
          </div>
        </div>

        {/* THE STAMP, PINNED. It used to be the last block of a scrolling rail,
            so on a 1366x768 Chromebook the single control that commits the year
            was below the fold with nothing indicating it was there. A flex footer
            outside the scroll cannot leave the screen at any window size. */}
        <div className="pl-foot">
          <div className="pl-foot-act">
            {plan.stamped ? (
              <>
                <div className="pl-waxed">
                  <Glyph
                    piece="stamp"
                    face="sealed"
                    size={54}
                    className="pl-wax"
                    fallback={<span className="pl-wax-fallback" aria-hidden="true" />}
                  />
                  <span className="pl-waxed-word">Your year sheet is stamped. Year {year} is saved.</span>
                </div>
                <div className="pl-foot-said">
                  {(() => {
                    const st = yearStatus(s)
                    if (st.readyForYearbook && !st.yearbookSeen && onYearbook) {
                      return <Plank size="md" onClick={onYearbook}>Open the yearbook</Plank>
                    }
                    if (!st.readyForYearbook) {
                      /* ONLY WHAT REALLY HOLDS THE YEAR. The classes stopped
                         gating the yearbook (`year.ts`), so naming them here
                         would send a student off to sit two activities and then
                         find the book had been open the whole time. */
                      return !st.coreBeatDone
                        ? <p className="pl-stamp-note">Finish Advisory to open the yearbook.</p>
                        : null
                    }
                    return null
                  })()}
                  {/* §5.15: the objective moves the instant the wax lands, and the
                      marker is hidden while the world is held, so the room
                      reorganises itself behind the paper and the student closes a
                      panel onto a game that changed its mind. One line of
                      acknowledgment, read off the same function the arrow reads. */}
                  {objective && <p className="pl-stamp-note">Next: {objective.say}</p>}
                </div>
              </>
            ) : confirming ? (
              <>
                <Plank size="lg" glyph={['stamp', 'sealed']} onClick={stamp}>Yes, stamp the year sheet</Plank>
                <Plank size="md" onClick={() => { setConfirming(false); focusAfter('pl-stamp') }}>go back</Plank>
                <p className="pl-stamp-note">
                  Nothing on this sheet can be changed afterward.
                  {offersActivities && slotsFilled < SEASONS.length && ` ${OPEN_SEASONS}`}
                </p>
              </>
            ) : (
              <>
                <Plank
                  size="lg"
                  id="pl-stamp"
                  disabled={!canStamp}
                  title={stampNote ?? undefined}
                  onClick={() => setConfirming(true)}
                >
                  Stamp the year sheet
                </Plank>
                {stampNote && <p className="pl-stamp-note">{stampNote}</p>}
              </>
            )}
          </div>
          <Plank size="sm" className="pl-close" onClick={onClose}>close</Plank>
        </div>
      </div>

      {/* THE COIN IN THE AIR. It is a sibling of the sheet rather than a child of
          it, because `.pl-sheet` carries a `drop-shadow` filter and a filter makes
          a containing block, so a positioned coin inside it would be measured
          against the sheet instead of against the veil. Coordinates are the
          veil's own, taken off its rect, so no ancestor's transform can move it. */}
      {air?.moved && (
        <span className="pl-air" style={{ left: air.x, top: air.y }} aria-hidden="true">
          <Glyph piece="pip" face={air.season.toLowerCase()} size={34} fallback={<span className="pl-coin pl-coin-big" />} />
        </span>
      )}
    </div>
  )
}
