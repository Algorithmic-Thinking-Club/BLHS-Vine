/* the screen where a student fills in their schedule for one year */
import { useEffect, useState } from 'react'
import { firstLook, markLooked } from '../hud/first-look'
import { PROGRAMMES, seasonOf, type Programme } from '../roster/roster'
import { EXAMPLE_BLURB, classIsReal, exampleNameOf, shownName } from '../roster/placeholders'
import { CLASSES, type ClassDef } from './catalog'
import { scheduleOwed } from './schedule'
import { SEASONS, assignSlot, clearSlot, loadSave, pickClass, dropClass, stampPlan, type Season } from '../save'
import { refuseClass, refuseSlot } from '../run/refusal'
import { yearWord } from '../run/year'
import { usePanel } from '../ui/a11y'
import { cinemaOn } from '../stage/cinema'
import { Glyph, Plank } from '../ui/controls'
import { awarded, saved as saidSaved } from '../ui/feedback'
import { track } from '../telemetry'
import './pickyear.css'

/* the five periods a freshman does not choose, named as plain subjects */
const REQUIRED = ['English', 'Math', 'Science', 'PE', 'History']
/* how many rows the sheet shows: the five above plus the two the student fills */
const PERIODS = 7
const ELECTIVE_AT = REQUIRED.length


/** what a card can win, in the school's own words, for the wall outline */
function earnsOf(p: Programme): string {
  if (p.kind === 'sport') return 'JV, Varsity, Captain'
  return 'a cord, over four years'
}

export function PickYear({ year, onClose }: { year: number; onClose: () => void }) {
  /* inside a cutscene this panel has no way out: no dismiss, no Escape, no click-off */
  const held = cinemaOn()
  const shut = held ? () => { /* the rail is driving; there is no way out */ } : onClose
  const panel = usePanel({ onClose: shut, closeOnEscape: !held, label: `Your schedule for year ${year}` })
  const [, bump] = useState(0)
  const [refused, setRefused] = useState<{ id: string; why: string } | null>(null)
  /* which blank period's elective list is open, held as the period number so the heading over the list and the row it fills cannot disagree */
  const [openAt, setOpenAt] = useState<number | null>(null)
  const redraw = () => bump((v) => v + 1)

  const s = loadSave()
  const plan = s?.plans?.[year] ?? { slots: {}, classes: [], stamped: false }

  useEffect(() => { track('pickyear_opened', { year }) }, [year])

  /* every programme the roster carries, in the roster's own order. the screen used
   * to hold its own list of five ids, so a member who added a club to the roster
   * could not see it on the only sheet a freshman ever fills in. */
  const activities = PROGRAMMES

  const classes = CLASSES.filter((c) => c.years.includes(year) && !c.requires)

  /** which season a programme is already sitting in, if any */
  const seatOf = (id: string): Season | null =>
    (SEASONS.find((se) => plan.slots[se] === id) ?? null)

  /* a sport takes the season the school gives it and a club takes the first free one */
  const seasonFor = (p: Programme): Season | null => {
    const own = seasonOf(p)
    if (own) return own
    return SEASONS.find((se) => !plan.slots[se]) ?? null
  }

  const takeActivity = (p: Programme) => {
    const se = seasonFor(p)
    if (!se) {
      setRefused({ id: p.id, why: 'You have used all three season tokens. Put one back first.' })
      return
    }
    const no = refuseSlot(p.id, se, loadSave(), year)
    if (no) { setRefused({ id: p.id, why: no }); track('pick_refused', { what: p.id, why: no }); return }
    assignSlot(year, se, p.id)
    setRefused(null)
    saidSaved(`${p.name}, ${se}`)
    track('pick_taken', { what: p.id, season: se })
    redraw()
  }

  /* putting back is its own small control inside the locked card and never the card itself, because a card that undoes on a second press makes the undo its loudest affordance */
  const putBack = (p: Programme, seat: Season) => {
    clearSlot(year, seat)
    setRefused(null)
    track('pick_put_back', { what: p.id, season: seat })
    redraw()
  }
  /* same rule for a class: a ticked row is a locked row with a small untick inside it, never a row that unticks on a second press */
  const untick = (c: ClassDef) => {
    dropClass(year, c.id)
    setRefused(null)
    setOpenAt(null)
    track('pick_put_back', { what: c.id })
    redraw()
  }

  const takeClass = (c: ClassDef) => {
    const no = refuseClass(c.id, loadSave(), year)
    if (no) { setRefused({ id: c.id, why: no }); track('pick_refused', { what: c.id, why: no }); return }
    pickClass(year, c.id)
    setRefused(null)
    /* the list shuts on a pick so the student watches the period they pressed fill in; leaving it open for the next blank saves one press and hides the only thing this screen is for */
    setOpenAt(null)
    saidSaved(c.name)
    track('pick_taken', { what: c.id })
    redraw()
  }

  const chosen = SEASONS.filter((se) => plan.slots[se]).length
  const classesLeft = 2 - plan.classes.length
  /* how many classes and activities on this screen have a real island behind them */
  const realClasses = classes.filter((c) => classIsReal(c.id))
  const realActivities = activities.filter((p) => p.playable)
  /* the rule for what this screen still owes lives in planner/schedule.ts */
  const owed = scheduleOwed({
    electivesLeft: classesLeft,
    chosen,
    realClasses: realClasses.length,
    realActivities: realActivities.length,
    /* the seats this screen can really fill, because one programme may not take two seasons, so asking for three when fewer are pickable leaves year one impossible to stamp */
    seats: realActivities.length,
  })
  const { ready, stage, notYet } = owed
  /* said once and marked when the panel is really up, because a read that also wrote would blank itself on the second render */
  const [told] = useState(() => firstLook('my-year'))
  useEffect(() => { markLooked('my-year') }, [])

  /* the one refusal that belongs to a class, said under the list on its own line rather than inside a row, so the rows never grow and the plank never jumps */
  const classNo = refused && classes.some((c) => c.id === refused.id) ? refused.why : null

  const taken = activities.filter((p) => seatOf(p.id))
  const onOffer = activities.filter((p) => !seatOf(p.id))
  /* true when the after-school cards shrink to chips so they never outshout the list */
  const shelved = chosen > 0 || openAt !== null

  /* the seven period rows: five requirements, then the two electives, first blank live */
  const firstBlankAt = ELECTIVE_AT + plan.classes.length
  const rows = Array.from({ length: PERIODS }, (_, i) => {
    const n = i + 1
    if (i < ELECTIVE_AT) return { n, kind: 'required' as const, name: REQUIRED[i], cls: null }
    const id = plan.classes[i - ELECTIVE_AT]
    const cls = id ? CLASSES.find((c) => c.id === id) ?? null : null
    /* numbered, so two blank lines reading "Elective" cannot be read as one thing said twice, and the rows are where one elective or several is answered */
    const blank = `Elective ${i - ELECTIVE_AT + 1}`
    return { n, kind: 'elective' as const, name: cls ? shownName(cls.id, cls.name) : blank, cls }
  })

  return (
    <div className="py-veil" onClick={shut}>
      <div {...panel} className="py-sheet kit-surface-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="py-title">Your schedule, year {yearWord(year)}</h2>
        {/* what my year is, said the first time it is opened, rather than in a cutscene about a button in another corner of the screen */}
        {told && <p className="py-firstlook">{told}</p>}

        {/* ---- THE SEVEN PERIODS ----------------------------------------- */}
        <section className={`py-schedule${stage === 'schedule' ? ' py-lit' : ''}`} aria-labelledby="py-sched-h">
          <h3 className="py-h py-sched-h" id="py-sched-h">
            Fill your two Elective periods
            {/* how many electives are in and how many the year takes */}
            <span className="py-count"> {plan.classes.length} of 2 electives</span>
          </h3>
          <ol className="py-periods">
            {rows.map((r) => {
              const live = r.kind === 'elective' && !r.cls && r.n === firstBlankAt + 1
              const open = openAt === r.n
              const body = (
                <>
                  <span className="py-per-no">Period {r.n}</span>
                  <span className={`py-per-name${r.cls || r.kind === 'required' ? '' : ' py-per-blank'}`}>{r.name}</span>
                </>
              )
              return (
                <li
                  key={r.n}
                  className={`py-period py-period-${r.kind}${r.cls ? ' py-period-on' : ''}${live ? ' py-period-live' : ''}`}
                >
                  {/* a blank period a student may fill is a button and every other row on this sheet is furniture, which is what stops the loudest thing on the glass being an undo */}
                  {live && !open ? (
                    <button type="button" className="py-per-press" onClick={() => setOpenAt(r.n)}>
                      {body}
                      <span className="py-per-cue">Press to choose</span>
                    </button>
                  ) : (
                    <div className="py-per-press py-per-static">
                      {body}
                      {r.cls && (
                        <button type="button" className="py-untick" onClick={() => untick(r.cls as ClassDef)}>Put back</button>
                      )}
                    </div>
                  )}
                  {/* the elective list, drawn inside the very row a pick fills */}
                  {open && (
                    <div className="py-electives">
                      <p className="py-elect-h">Pick an elective for Period {r.n}</p>
                      <div className="py-classes">
                        {classes.map((c) => {
                          const on = plan.classes.includes(c.id)
                          if (on) {
                            return (
                              <div key={c.id} className="py-class py-class-on" role="group" aria-label={`${c.name}, already on your schedule`}>
                                <span className="py-tick" aria-hidden="true">
                                  <Glyph piece="icon_set" face="tick" size={16} />
                                </span>
                                <span className="py-class-name">{c.name}</span>
                              </div>
                            )
                          }
                          /* every elective the district publishes can be picked */
                          return (
                            <button key={c.id} type="button" className="py-class" onClick={() => takeClass(c)}>
                              <span className="py-tick" aria-hidden="true" />
                              <span className="py-class-name">{c.name}</span>
                            </button>
                          )
                        })}
                      </div>
                      {/* never a dead end: with nothing pickable this line says what to do instead and names the control that does it */}
                      <p className={`py-classnote${classNo ? ' py-classnote-no' : ''}`} role={classNo ? 'alert' : undefined}>
                        {/* one instruction under the list, or the refusal if there is one */}
                        {classNo ?? 'Press one to put it in this period.'}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        {/* after school, the other half of a year: the clubs and sports cards */}
        <section className={`py-cardbox${stage === 'after' ? ' py-lit' : ''}`} aria-labelledby="py-cards-h">
          {/* the heading only asks for a pick when a club is really open */}
          <h3 className="py-h py-cards-h" id="py-cards-h">
            {realActivities.length
              ? realActivities.length > 1
                ? `After school: pick ${Math.min(3, realActivities.length)}`
                : 'After school: pick one'
              : 'After school: no clubs open yet'}
            {realActivities.length > 0 && (
              <span className="py-count"> {chosen === 0 ? 'none yet' : `${chosen} taken`}</span>
            )}
          </h3>
          <div className="py-grid">
            {/* a taken card is locked: not a button any more but a stamped sign with the season on it and one small control that puts it back */}
            {taken.map((p) => {
              const seat = seatOf(p.id) as Season
              return (
                <div
                  key={p.id}
                  className="py-card kit-surface-tab py-card-on"
                  role="group"
                  aria-label={`${p.name}, ${seat}. Yours.`}
                >
                  <span className="py-card-name">{p.name}</span>
                  <span className="py-card-where">{seat}. Yours.</span>
                  <span className="py-card-earns">{earnsOf(p)}</span>
                  <Glyph piece="stamp" face="approved" size={26} className="py-stamp" />
                  <button type="button" className="py-putback" onClick={() => putBack(p, seat)}>Put back</button>
                </div>
              )
            })}
            {/* the cards not taken: big signs while nothing is chosen, then small chips beside the locked card once something is, still takeable and never louder than the way on */}
            {onOffer.map((p) => {
              const no = refused?.id === p.id ? refused.why : null
              /* an example club must stay pressable, because one real club against three seasons to spend left year one unfinishable; it still says it is an example and counts as done rather than offering a voyage to nowhere */
              const example = exampleNameOf(p.id)
              if (example) {
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="py-card kit-surface-tab py-card-example"
                    onClick={() => takeActivity(p)}
                    aria-label={'Join ' + example + '. ' + EXAMPLE_BLURB}
                  >
                    <span className="py-card-name">{example}</span>
                    <span className="py-card-earns">{EXAMPLE_BLURB}</span>
                    {no && <span className="py-card-no">{no}</span>}
                  </button>
                )
              }
              if (shelved) {
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="py-chip"
                    onClick={() => takeActivity(p)}
                    title={`${p.name}, ${seasonOf(p) ?? 'any season'}`}
                  >
                    <span className="py-chip-name">{p.name}</span>
                    {no && <span className="py-chip-no" role="alert">{no}</span>}
                  </button>
                )
              }
              return (
                <button
                  key={p.id}
                  type="button"
                  className="py-card kit-surface-tab"
                  onClick={() => takeActivity(p)}
                >
                  <span className="py-card-name">{p.name}</span>
                  <span className="py-card-where">{seasonOf(p) ?? 'any season'}</span>
                  <span className="py-card-earns">{earnsOf(p)}</span>
                  {no && <span className="py-no">{no}</span>}
                </button>
              )
            })}
          </div>
        </section>

        <div className="py-foot">
          {/* a way out that is a word, and small on purpose, because at medium it was bigger than a period row so the way out outranked the way on */}
          {!held && <Plank size="sm" keyCap="Esc" className="py-close" onClick={onClose}>Close for now</Plank>}
          {notYet && <span className="py-notyet">{notYet}</span>}
          <Plank
            size="lg"
            className={`py-go${ready ? ' py-lit' : ''}`}
            disabled={!ready}
            onClick={() => {
              const taken = SEASONS.map((se) => plan.slots[se]).filter((x): x is string => !!x)
              stampPlan(year, taken)
              track('pickyear_stamped', { year, slots: plan.slots, classes: plan.classes })
              /* the stamp pops, so setting a schedule is a moment rather than a vanish */
              /* the pop never says a fake real name: with nothing pickable this is undefined and it says the plain thing, and a member island gives its own name */
              const first = PROGRAMMES.find((pg) => pg.id === taken[0])
              awarded(
                first ? `${shownName(first.id, first.name)} is yours.` : 'Your schedule is set.',
                `Year ${year} is on your schedule.`,
              )
              onClose()
            }}
          >
            That is my schedule
          </Plank>
        </div>
      </div>
    </div>
  )
}
