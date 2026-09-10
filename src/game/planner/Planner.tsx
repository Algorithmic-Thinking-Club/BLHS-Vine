/* the year sheet: three tokens, three seasons, a class list, and the stamp that commits it */
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
import { coreBeatId } from '../beats/beats'
import { beatState } from '../beats/state'
import { classLedgerId } from '../beats/classes'
import { firstLook, markLooked } from '../hud/first-look'
import { yearStatus } from '../run/year'
import { picksOf, pickVerb, type Pick } from '../run/pick'
import { nextObjective } from '../run/objective'
import { refuseClass, refuseSlot } from '../run/refusal'
import { yearbookYears, yearTurned } from '../run/yearbook-page'
import { track } from '../telemetry'
import { announce, focusablesIn, usePanel } from '../ui/a11y'
import { Empty, Glyph, Plank, Socket } from '../ui/controls'
import { saved } from '../ui/feedback'
import './planner.css'

// which things are planks: a plank is what a student presses to act, never a row on the paper

const CORE_BEAT_DESC: Record<number, string> = {
  1: 'You learn the POWER values, the bell schedule, and how to join a club',
  2: 'You learn every cord and seal, and the Universal Retake Policy',
  3: 'You learn the 24 credits, dual credit, and the exact rule for AP Capstone',
  4: 'You check your cords and find out what you need to walk the stage',
}

/* one string for the open-season rule, said in one place rather than two */
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

export function Planner({ onClose, onAdvisory, onPlayPick, onLook, onYearbook }: {
  onClose: () => void
  onAdvisory?: () => void
  /* ONE BUTTON PER PICK (Ash, 2026-09-08 item 4). The sheet says what a pick is
   * and presses it; what a press MEANS, a voyage or a card, is the roster's and
   * the HUD's business and not this panel's. */
  onPlayPick?: (pick: Pick) => void
  /* the two panels that are about HIM rather than about the school, raised from
   * the sheet's own foot since the corner went back to three doors */
  onLook?: (what: 'wall' | 'wardrobe') => void
  onYearbook?: () => void
}) {
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const s = loadSave()
  const year = s?.year ?? 1
  const plan: YearPlan = s?.plans[year] ?? { slots: {}, classes: [], stamped: false }
  /* what he picked, as one list with one verb, so a class row and a club card
   * cannot drift apart again (`run/pick.ts` says why they are one thing) */
  const picks = picksOf(s, year)

  const openedAt = useRef(Date.now())
  const changes = useRef(0)
  const [placing, setPlacing] = useState<Season | null>(null)
  const [pickingClass, setPickingClass] = useState(false)
  const [confirming, setConfirming] = useState(false)
  /* the refusal the student is looking at, and where it belongs on the sheet */
  const [refused, setRefused] = useState<Refusal | null>(null)
  const [air, setAir] = useState<Airborne | null>(null)

  const veilRef = useRef<HTMLDivElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const pickerRef = useRef<HTMLDivElement | null>(null)
  /* the airborne token, read by pointer handlers that were created on an older
   * render. State drives the picture; this drives the decision. */
  const airRef = useRef<Airborne | null>(null)
  const grabAt = useRef<{ x: number; y: number } | null>(null)
  /* swallows the click the browser sends after a drag ends */
  const swallowClick = useRef(false)

  useEffect(() => { track('planner_opened', { year }) }, [year])

  /* controls are found by id, which is safe because only one year sheet is ever mounted */
  const backTo = (el: HTMLElement | null | undefined) => el?.focus?.()
  const byId = (id: string) => document.getElementById(id)
  const socketOf = (season: Season) => byId(`pl-sock-${season}`)
  /* after the render, because the control being focused is only put back by closing the sub-state */
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

  /* escape closes the innermost thing: the coin, the confirm, the picker, a column, the sheet */
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

  /* one path for click, drop and keyboard: the refusal is asked for rather than filtered out */
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
    /* a lift is logged too, because reversing a choice is a decision being weighed */
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
    /* the slot's value is the programme id, so nothing is translated on the way to the save */
    const committed = SEASONS.map((se) => plan.slots[se]).filter(Boolean) as string[]
    stampPlan(year, committed)
    track('planner_stamped', { year, slots: plan.slots, classes: plan.classes })
    setConfirming(false)
    /* the wax is drawn art, and the kit's saved() carries it off the sheet too */
    saved(`Year ${year} is stamped and saved.`)
  }

  // ---- the drag, on pointer capture so mouse, trackpad and finger are one path

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
      /* there is no spare token: a token belongs to its season, and this says so out loud */
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

  /* the counselor's margin, which prints the school's own rule and this game's count under it */
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

  /* is there a club or sport to pick at all, asked once for the whole sheet */
  const offersActivities = PROGRAMMES.some((p) => p.playable)
  /* said once, and marked when the panel is really up: a read that also wrote
   * would blank itself on the second render */
  const [told] = useState(() => firstLook('my-year'))
  useEffect(() => { markLooked('my-year') }, [])
  const slotsFilled = SEASONS.filter((se) => plan.slots[se]).length
  /* ---- WHAT "THE SHEET IS FULL" MEANS (Ash, 2026-09-09) -------------------
   *
   * *"Once a user picks all the options (right now its just classes, but make
   * sure once clubs are implemented clubs are included)..."*
   *
   * It was two classes and nothing else, which is right today only because
   * nothing on the roster is playable. `offersActivities` is the same question
   * the seasons column asks before it draws itself, so the day a club ships the
   * stamp waits for one without this line changing. */
  const canStamp = !plan.stamped
    && plan.classes.length === 2
    && (!offersActivities || slotsFilled > 0)
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
        {/* the close control is at the bottom, so it is not the first thing a keyboard lands on */}
        <div className="pl-head">
          <h2 className="pl-title">Year sheet</h2>
          {told && <p className="pl-firstlook">{told}</p>}
          <span className="pl-year">Year {year} of 4</span>
        </div>

        {/* the advisory pin: the one thing on the sheet the student did not choose */}
        <div className="pl-pin">
          <Glyph piece="pointer" face="pin_tail" size={20} className="pl-pin-head" />
          <span className="pl-pin-words">
            <b>Advisory, every year.</b>{' '}{CORE_BEAT_DESC[year] ?? CORE_BEAT_DESC[1]}
          </span>
          {/* ---- THREE STATES, BECAUSE THERE ARE THREE (Ash, 2026-09-09) ---
              *
              * A tick or a button, and a fail got the tick. *"Obviously it should
              * allow the user to retake, only if they havent passed. If they have
              * passed, maybe the dialogue says 'Advisory is done for this year,
              * see answers?' and an option shows up."* */}
          {(() => {
            const st = beatState(s, coreBeatId(year))
            if (st === 'passed') {
              return (
                <span className="pl-pin-done">
                  <Glyph piece="icon_set" face="tick" size={15} />
                  passed
                  {onAdvisory && <Plank size="sm" onClick={onAdvisory}>see your answers</Plank>}
                </span>
              )
            }
            if (!onAdvisory) return null
            return (
              <Plank size="sm" onClick={onAdvisory}>
                {st === 'failed' ? 'take Advisory again' : 'go to Advisory'}
              </Plank>
            )
          })()}
        </div>

        <div className="pl-body">
          {/* the seasons come off the sheet until a programme with a season is playable */}
          {!offersActivities ? (
            <section className="pl-col pl-col-none">
              <h3 className="pl-colhead">After school</h3>
              <p className="pl-empty">Nobody has built a club or sport island yet.</p>
              <p className="pl-note">Your two Elective periods are the whole of this year's picks.</p>
              {/* ---- A CLUB ALREADY ON THE SHEET STILL HAS ITS BUTTON --------
                *
                * Nothing on the roster is playable today, so the seasons come off
                * the sheet and a student cannot pick a club at all. A SAVE can
                * still hold one: an older run, a member's island that shipped and
                * was then turned off, a teacher's seeded device. Without this the
                * pick would sit on the year gate with no control anywhere that
                * finishes it, which is the exact shape item 4 exists to kill. */}
              {picks.filter((p) => p.kind === 'activity').map((p) => (
                <div className="pl-class" key={p.id}>
                  <span className="pl-class-name">{p.name}</span>
                  {p.done
                    ? <span className="pl-class-grade">done</span>
                    : onPlayPick && (
                      <Plank size="sm" onClick={() => onPlayPick(p)}>{pickVerb(p)}</Plank>
                    )}
                </div>
              ))}
            </section>
          ) : (
          <div className="pl-cols" role="group" aria-label="The three seasons">
            {SEASONS.map((season) => {
              const committed = plan.slots[season] ? programmeById(plan.slots[season]!) : null
              /* the whole roster is on the menu and the refused rows carry their reason */
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
                    /* a filled slot is not a button, because it holds the lift control inside it */
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
                      {/* AND A CLUB GETS THE SAME ONE BUTTON A CLASS GETS. It never
                          had one: a season slot was a thing you chose and then
                          could not do anything with until an island existed, which
                          is three of a student's four picks sitting inert on the
                          sheet that is supposed to be his to-do list. */}
                      {plan.stamped && (() => {
                        const pick = picks.find((q) => q.kind === 'activity' && q.id === committed.id)
                        if (!pick) return null
                        return pick.done
                          ? <div className="pl-card-done">done</div>
                          : onPlayPick && (
                            <Plank size="sm" wide onClick={() => onPlayPick(pick)}>{pickVerb(pick)}</Plank>
                          )
                      })()}
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
                      {/* an empty socket wears its own season's mark, dimmed, so it says which */}
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
                          /* never `disabled`, so a refused row can be focused and can say why */
                          aria-disabled={!!why}
                          onClick={() => place(season, a.id)}
                        >
                          <span className="pl-act-name">{a.name}</span>
                          <span className="pl-act-why">
                            {/* the drawn lock, which sits before the sentence and never instead of it */}
                            {why && <Glyph piece="icon_set" face="lock" size={13} className="pl-act-lock" />}
                            {/* a sport's season comes from the school's table, keyed by id */}
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
              {/* three tokens and three columns, each coin drawn and named */}
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
                    /* an unspent token is forfeit at the year turn, and the sheet says so */
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
                const st = beatState(s, classLedgerId(id))
                const grade = s.ledger.find((e) => e.id === classLedgerId(id))?.grade
                const pick = picks.find((q) => q.kind === 'class' && q.id === id)
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
                    {/* THE GRADE IS ALWAYS SAID, and a failed one keeps its
                        button (Ash, 2026-09-09): a row that reads "F" with no way
                        back in is the dead end the whole retake pass is about. */}
                    {plan.stamped && st !== 'untried' && grade !== undefined && (
                      <span className="pl-class-grade">{letterOf(grade)}</span>
                    )}
                    {plan.stamped && st !== 'passed' && onPlayPick && pick && (
                      /* ONE BUTTON, TWO FUTURES, and the roster picks. Today no
                         course has an island, so it reads "Go" and counts the
                         pick; the day somebody paints one the same press is a
                         voyage and only the word changes. */
                      <Plank size="sm" onClick={() => onPlayPick(pick)}>
                        {st === 'failed' ? 'try it again' : pickVerb(pick)}
                      </Plank>
                    )}
                  </div>
                )
              })}

              {!plan.stamped && plan.classes.length < 2 && !pickingClass && (
                <Plank size="sm" wide id="pl-pick" onClick={() => setPickingClass(true)}>pick a class</Plank>
              )}

              {pickingClass && (
                <div className="pl-classmenu" ref={pickerRef}>
                  {/* the ladder is the game's rule, stated once above the list */}
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
                      {/* the school's own sentence always, with this game's count under it */}
                      <span className="pl-note-rule">{c.rule}</span>
                      {c.progress > 0 && <span className="pl-note-count">{c.detail}</span>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* the yearbook opens on the live year and its spine walks back to past ones */}
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

        {/* ---- THE WALL AND THE WARDROBE (Ash, 2026-09-09) -----------------
            *
            * They were two extra plaques in the corner for a day and he read the
            * corner as a toolbar: *"when it was 3 on the top left it was cute,
            * now its 5, it looks like a list of ugly buttons."* So they are here,
            * behind the door that already means "your year", which is where both
            * of them are ABOUT: the wall is this sheet's picks with what you
            * earned on them, and the wardrobe is the panther holding the sheet.
            *
            * ON THE SHEET AND NOT IN THE HANDBOOK, because the Guide is about the
            * SCHOOL and these two are about him. */}
        {onLook && (
          <div className="pl-mine">
            <Plank size="sm" onClick={() => onLook('wall')}>Your trophy wall</Plank>
            <Plank size="sm" onClick={() => onLook('wardrobe')}>Your character</Plank>
          </div>
        )}

        {/* the stamp is a flex footer outside the scroll, so it cannot leave the screen */}
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
                      /* THE SAME NUDGE, on the one other control that becomes the
                         whole of what a student owes and looks identical before
                         and after it does. Ash: *"maybe find other places where
                         this could also be useful to add."* */
                      return (
                        <>
                          <p className="kit-nudge-say" role="status">
                            <span className="kit-nudge-arrow" aria-hidden="true">▼</span>
                            Everything is finished. Turn the page.
                          </p>
                          <Plank size="md" className="kit-nudge" onClick={onYearbook}>Open the yearbook</Plank>
                        </>
                      )
                    }
                    if (!st.readyForYearbook) {
                      /* only what really holds the year, since classes no longer gate the yearbook */
                      return !st.coreBeatDone
                        ? <p className="pl-stamp-note">Finish Advisory to open the yearbook.</p>
                        : null
                    }
                    return null
                  })()}
                  {/* says what to do next, read off the same function the arrow reads */}
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
                {/* ---- AND IT SAYS SO WHEN IT IS READY (Ash, 2026-09-09) ----
                    *
                    * *"Once they have selected everything they need for the year,
                    * the stamp button is a bit unclear. So add this logic: if a
                    * user selects all the classes / clubs needed, the stamp button
                    * gets a box highlight around it + a panel and arrow mark, much
                    * like the button tutorial."*
                    *
                    * The plank sat there in the same ink whether it was refusing
                    * or waiting, so the moment the sheet became stampable looked
                    * exactly like the moment before it. This is the same language
                    * the handover tutorial speaks: a ring, a pointer and one line. */}
                {canStamp && (
                  <p className="kit-nudge-say" role="status">
                    <span className="kit-nudge-arrow" aria-hidden="true">▼</span>
                    Your sheet is full. Stamp it to lock the year in.
                  </p>
                )}
                <Plank
                  size="lg"
                  id="pl-stamp"
                  className={canStamp ? 'kit-nudge' : undefined}
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

      {/* the coin in the air, a sibling of the sheet so the veil's own coordinates hold */}
      {air?.moved && (
        <span className="pl-air" style={{ left: air.x, top: air.y }} aria-hidden="true">
          <Glyph piece="pip" face={air.season.toLowerCase()} size={34} fallback={<span className="pl-coin pl-coin-big" />} />
        </span>
      )}
    </div>
  )
}
