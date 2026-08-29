import { useEffect, useRef, useState } from 'react'
import { classById, cordHint, eligibleClasses, type Dept } from './catalog'
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
import { yearStatus } from '../run/year'
import { refuseClass, refuseSlot } from '../run/refusal'
import { yearbookYears, yearTurned } from '../run/yearbook-page'
import { track } from '../telemetry'
import './planner.css'

// THE YEAR PLANNER (GAME-DESIGN §7.2) — the year sheet on the chart table. Three season
// columns and three carved tokens; sports only land in their real season; two focus
// classes with their cord relevance inline; the counselor's pencil notes on the margin;
// the harbor master's stamp to commit the year. Fully keyboard-playable (§11.3): every
// placement is click/Enter on a focusable control, no drag required (drag joins later as
// an enhancement, same verbs).
// Opened by: the HUD tokens, the pause sheet, and — when the Maw lands — the chart table
// POI via requestUi('planner') (ui-bus.ts).

const CORE_BEAT_DESC: Record<number, string> = {
  1: 'This is the place — POWER values, the bell schedule, how joining works',
  2: 'The hidden ladder — every cord and seal, and the Universal Retake Policy',
  3: 'The long game — the 24 credits, dual credit, AP Capstone’s exact rule',
  4: 'Finish like a Panther — the cords audit and the road to the stage',
}

const DEPT_LABEL: Record<Dept, string> = {
  ap: 'Advanced Placement', lang: 'World Languages', cte: 'Career & Technical', arts: 'Arts',
}

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
   * `run/refusal.ts`, and the same one the save's own verb enforces. */
  const [refused, setRefused] = useState<string | null>(null)

  useEffect(() => { track('planner_opened', { year }) }, [year])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  if (!s) return null

  const pickedByYear: Record<number, string[]> = {}
  for (const [y, p] of Object.entries(s.plans)) pickedByYear[Number(y)] = p.classes

  /* ONE PATH FOR CLICK, DROP AND KEYBOARD (N3). The season lock used to be a
   * `.filter()` on this menu, which is not a refusal: it removed the programme so
   * a student who came looking for football in spring found an absence and no
   * sentence, and any caller that was not this render could write the slot
   * anyway. The refusal is asked for first, printed if there is one, and the same
   * function guards `assignSlot` itself. */
  const place = (season: Season, activityId: string) => {
    const why = refuseSlot(activityId, season, s, year)
    if (why) { setRefused(why); track('slot_refused', { year, season, activity: activityId, why }); return }
    changes.current++
    setRefused(null)
    assignSlot(year, season, activityId)
    track('slot_assigned', {
      year, season, activity: activityId,
      deliberationMs: Date.now() - openedAt.current, changes: changes.current,
    })
    setPlacing(null)
  }

  const lift = (season: Season) => {
    changes.current++
    clearSlot(year, season)
  }

  const addClass = (id: string) => {
    /* the two-pick limit is scarcity, so it says so rather than the button
     * quietly not being there. Same function the save's `pickClass` enforces. */
    const why = refuseClass(id, s, year)
    if (why) { setRefused(why); track('class_refused', { year, class: id, why }); return }
    setRefused(null)
    pickClass(year, id)
    track('class_picked', { year, class: id })
    setPickingClass(false)
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
  }

  // the counselor's margin notes: the 2-3 most alive cords, in pencil (§7.2)
  const notes = cordsOf(s)
    .filter((c) => !c.earned && c.progress > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3)

  /** the years whose page has turned, which is the shelf the sheet can reach */
  const pastPages = yearbookYears(s).filter((y) => yearTurned(s, y))

  const slotsFilled = SEASONS.filter((se) => plan.slots[se]).length
  const canStamp = !plan.stamped && plan.classes.length === 2
  const stampNote = plan.stamped ? null
    : plan.classes.length < 2 ? 'the harbor master wants two classes on the sheet'
      : slotsFilled < SEASONS.length ? 'seasons left open stay open — the year sails without them'
        : null

  return (
    <div className="pl-veil" onClick={onClose}>
      <div className="pl-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pl-head">
          <span className="pl-title">The Year Sheet</span>
          <span className="pl-year">Year {year} of 4</span>
          <button className="pl-close" onClick={onClose}>put the pen down</button>
        </div>
        <div className="pl-pin">
          📌 <b>Advisory, every year:</b> {CORE_BEAT_DESC[year] ?? CORE_BEAT_DESC[1]}
          {' '}
          {beatDone(s.ledger, year)
            ? <span className="pl-pin-done">attended ✓</span>
            : onAdvisory && <button className="pl-pin-go" onClick={onAdvisory}>attend now</button>}
        </div>

        <div className="pl-body">
          <div className="pl-cols">
            {SEASONS.map((season) => {
              const committed = plan.slots[season] ? programmeById(plan.slots[season]!) : null
              /* THE WHOLE ROSTER IS ON THE MENU AND THE REFUSED ONES SAY WHY.
               * This was `.filter(programmeAllowedIn)`, so out-of-season
               * programmes vanished and the season lock taught nothing: the
               * mechanic that makes a student obey the truth before anybody
               * explains it only works if they can see the thing they cannot
               * have. Refused rows still render; they carry the refusal. */
              const menu = PROGRAMMES.map((a) => ({ a, why: refuseSlot(a.id, season, s, year) }))
              return (
                <div className="pl-col" key={season}>
                  <div className="pl-col-head">{season}</div>
                  <div className="pl-col-body">
                    {committed ? (
                      <div className="pl-card">
                        <div className="pl-card-name">{committed.name}</div>
                        <div className="pl-card-blurb">{committed.blurb}</div>
                        {!plan.stamped && (
                          <button className="pl-lift" onClick={() => lift(season)}>lift the token</button>
                        )}
                      </div>
                    ) : plan.stamped ? (
                      <div className="pl-menu-none">left open this year</div>
                    ) : placing === season ? (
                      <div className="pl-menu">
                        {menu.length === 0 && <div className="pl-menu-none">nothing sails this season yet — new islands are still rising</div>}
                        {menu.map(({ a, why }) => (
                          <button
                            className={`pl-act ${why ? 'pl-act-shut' : ''}`}
                            key={a.id}
                            aria-disabled={!!why}
                            title={why ?? undefined}
                            onClick={() => place(season, a.id)}
                          >
                            {a.name}
                            {/* THROUGH `seasonOf` AND NOT OFF THE FIELD. This read
                                `a.season`, which no shipped sport sets: a sport's
                                season is the school's table (`SPORT_SEASONS`) keyed
                                by id, so every sport on this menu read "a undefined
                                sport". */}
                            <small>{why ?? (a.kind === 'sport' ? `a ${String(seasonOf(a)).toLowerCase()} sport` : 'a club, any season')}</small>
                          </button>
                        ))}
                        {refused && <div className="pl-refusal">{refused}</div>}
                        <button className="pl-menu-back" onClick={() => { setRefused(null); setPlacing(null) }}>never mind</button>
                      </div>
                    ) : (
                      /* the refusal is cleared on the way in, or a sentence about
                         football in spring would still be sitting under the
                         winter column a moment later */
                      <button className="pl-slot" onClick={() => { setRefused(null); setPlacing(season) }}>
                        {s.tokens.includes(season) ? 'place the season token…' : 'no token left for this season'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="pl-rail">
            <div>
              <div className="pl-sect">Tokens in hand</div>
              <div className="pl-tokens">
                {s.tokens.map((t, i) => <span className="pl-token" key={t + i} title={`the ${t} token`} />)}
                {s.tokens.length === 0 && <span className="pl-token-hint">all spent — choices made</span>}
              </div>
            </div>

            <div>
              <div className="pl-sect">Focus classes — pick 2</div>
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
                    {!plan.stamped && <button className="pl-class-x" onClick={() => dropClass(year, id)} title="drop">✕</button>}
                    {plan.stamped && (sat
                      ? (
                        <>
                          <span className="pl-class-grade">{grade !== undefined ? letterOf(grade) : '✓'}</span>
                          {/* the Universal Retake (§8.1), from the sheet too: under a B-, once */}
                          {onSitClass && retakeAvailable(s, `class:${id}`) && (
                            <button className="pl-pin-go" onClick={() => onSitClass(id)}>retake</button>
                          )}
                        </>
                      )
                      : onSitClass && <button className="pl-pin-go" onClick={() => onSitClass(id)}>sit the class</button>)}
                  </div>
                )
              })}
              {!plan.stamped && plan.classes.length < 2 && !pickingClass && (
                <button className="pl-class-add" onClick={() => setPickingClass(true)}>pick a class…</button>
              )}
              {pickingClass && (
                <div className="pl-classmenu">
                  {(['ap', 'lang', 'cte', 'arts'] as Dept[]).map((dept) => {
                    const list = eligibleClasses(year, pickedByYear).filter((c) => c.dept === dept)
                    if (!list.length) return null
                    return (
                      <div key={dept}>
                        <div className="pl-dept">{DEPT_LABEL[dept]}</div>
                        {list.map((c) => {
                          const hint = cordHint(c.tags)
                          return (
                            <button className="pl-act" key={c.id} onClick={() => addClass(c.id)}>
                              {c.name}
                              {hint && <small>{hint}</small>}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                  {refused && <div className="pl-refusal">{refused}</div>}
                  <button className="pl-menu-back" onClick={() => { setRefused(null); setPickingClass(false) }}>never mind</button>
                </div>
              )}
            </div>

            {notes.length > 0 && (
              <div>
                <div className="pl-sect">In the margin, in pencil</div>
                <ul className="pl-notes">
                  {notes.map((c) => <li key={c.id}>{c.detail} — {c.name}</li>)}
                </ul>
              </div>
            )}

            {/* PAST PAGES ARE REACHABLE AFTER THEY HAVE TURNED, which §80.6 asks
                for and nothing offered: the only door to the yearbook was the
                button below, and it only appears in the window where THIS year is
                closable and unturned. So a student could not look at year one
                again from the moment year one ended. The book opens on the live
                year and its spine walks back. */}
            {onYearbook && pastPages.length > 0 && (
              <div>
                <div className="pl-sect">The shelf</div>
                <button className="pl-menu-back" onClick={onYearbook}>
                  read a yearbook that already turned ({pastPages.map((y) => `year ${y}`).join(', ')})
                </button>
              </div>
            )}

            {plan.stamped ? (
              <div>
                <div className="pl-waxed"><span className="pl-wax">🐾</span> stamped — Year {year} is set</div>
                {(() => {
                  const st = yearStatus(s)
                  if (st.readyForYearbook && !st.yearbookSeen && onYearbook) {
                    return <button className="yb-open pl-stamp" onClick={onYearbook} style={{ marginTop: '1.2cqw' }}>The year is written. Open the yearbook</button>
                  }
                  if (!st.readyForYearbook) {
                    const waits: string[] = []
                    if (!st.coreBeatDone) waits.push('advisory')
                    if (st.classesPending.length) waits.push(`${st.classesPending.length} class${st.classesPending.length > 1 ? 'es' : ''}`)
                    return waits.length ? <div className="pl-stamp-note">the yearbook waits on: {waits.join(', ')}</div> : null
                  }
                  return null
                })()}
              </div>
            ) : confirming ? (
              <div>
                <button className="pl-stamp" onClick={stamp}>Press the wax</button>{' '}
                <button className="pl-menu-back" onClick={() => setConfirming(false)}>wait</button>
                {slotsFilled < SEASONS.length && (
                  <div className="pl-stamp-note">unspent seasons stay open for free sailing</div>
                )}
              </div>
            ) : (
              <div>
                <button className="pl-stamp" disabled={!canStamp} onClick={() => setConfirming(true)}>
                  Stamp the sheet
                </button>
                {stampNote && <div className="pl-stamp-note">{stampNote}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
