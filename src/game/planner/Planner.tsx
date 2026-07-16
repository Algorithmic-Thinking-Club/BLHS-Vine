import { useEffect, useRef, useState } from 'react'
import {
  ACTIVITIES, activityAllowedIn, activityById, classById, cordHint, eligibleClasses,
  type Dept,
} from './catalog'
import {
  assignSlot, clearSlot, dropClass, loadSave, pickClass, SEASONS, stampPlan, subscribeSave,
  type Season, type YearPlan,
} from '../save'
import { cordsOf } from '../progress'
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

const CORE_BEATS: Record<number, string> = {
  1: 'This is the place — POWER values, the bell schedule, how joining works',
  2: 'The hidden ladder — every cord and seal, and the Universal Retake Policy',
  3: 'The long game — the 24 credits, dual credit, AP Capstone’s exact rule',
  4: 'Finish like a Panther — the cords audit and the road to the stage',
}

const DEPT_LABEL: Record<Dept, string> = {
  ap: 'Advanced Placement', lang: 'World Languages', cte: 'Career & Technical', arts: 'Arts',
}

export function Planner({ onClose }: { onClose: () => void }) {
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

  useEffect(() => { track('planner_opened', { year }) }, [year])
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  if (!s) return null

  const pickedByYear: Record<number, string[]> = {}
  for (const [y, p] of Object.entries(s.plans)) pickedByYear[Number(y)] = p.classes

  const place = (season: Season, activityId: string) => {
    changes.current++
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
    pickClass(year, id)
    track('class_picked', { year, class: id })
    setPickingClass(false)
  }

  const stamp = () => {
    const activeIslands = SEASONS
      .map((se) => plan.slots[se]).filter(Boolean)
      .map((id) => activityById(id!)?.islandId).filter(Boolean) as string[]
    stampPlan(year, activeIslands)
    track('planner_stamped', { year, slots: plan.slots, classes: plan.classes })
    setConfirming(false)
  }

  // the counselor's margin notes: the 2-3 most alive cords, in pencil (§7.2)
  const notes = cordsOf(s)
    .filter((c) => !c.earned && c.progress > 0)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 3)

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
        <div className="pl-pin">📌 <b>Advisory, every year:</b> {CORE_BEATS[year] ?? CORE_BEATS[1]}</div>

        <div className="pl-body">
          <div className="pl-cols">
            {SEASONS.map((season) => {
              const committed = plan.slots[season] ? activityById(plan.slots[season]!) : null
              const menu = ACTIVITIES.filter((a) => activityAllowedIn(a, season))
                .filter((a) => !SEASONS.some((se) => se !== season && plan.slots[se] === a.id))
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
                        {menu.map((a) => (
                          <button className="pl-act" key={a.id} onClick={() => place(season, a.id)}>
                            {a.name}
                            <small>{a.kind === 'sport' ? `a ${a.season?.toLowerCase()} sport` : 'a club — any season'}</small>
                          </button>
                        ))}
                        <button className="pl-menu-back" onClick={() => setPlacing(null)}>never mind</button>
                      </div>
                    ) : (
                      <button className="pl-slot" onClick={() => setPlacing(season)}>
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
                return (
                  <div className="pl-class" key={id}>
                    <span className="pl-class-name">{c.name}</span>
                    {hint && <span className="pl-class-hint">{hint}</span>}
                    {!plan.stamped && <button className="pl-class-x" onClick={() => dropClass(year, id)} title="drop">✕</button>}
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
                  <button className="pl-menu-back" onClick={() => setPickingClass(false)}>never mind</button>
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

            {plan.stamped ? (
              <div className="pl-waxed"><span className="pl-wax">🐾</span> stamped — Year {year} is set</div>
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
