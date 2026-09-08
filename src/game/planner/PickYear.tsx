/* YOUR SCHEDULE, YEAR ONE: beat 2 of the rail, as one screen.
 *
 * ---- WHY IT IS A SCHEDULE AND NOT A PICK -----------------------------------
 *
 * BRIEF-MAW-RAIL-2, Ash after playing rail-1: *"I have no idea what is going on:
 * a fire, click two classes, it makes no sense."* And the page's own answer:
 * *"'Pick what you will do this year, tick two classes' is not a thing a
 * freshman has ever done. Filling in a schedule is."*
 *
 * That is the whole change and it is a change of FRAME, not of data. The screen
 * still writes exactly what it wrote before: two class ids and one programme,
 * through `pickClass` and `assignSlot`, stamped by `stampPlan`, tracked by the
 * same four events. What moved is what a fourteen year old thinks they are
 * looking at. Seven periods down the page, five of them already filled with the
 * things everybody takes, two of them blank and saying Elective. A student who
 * has never seen this game has filled one of these in at every school they have
 * ever been to.
 *
 * THE FIVE FILLED PERIODS SAY ONE WORD EACH, and that is deliberate rather than
 * lazy. `docs/blhs/sourced-facts.md` publishes the graduation requirements
 * (English 4, Math 3, Science 3, Social Studies 3, Health and Fitness 2) and does
 * NOT publish a freshman course list, so anything more specific than the subject
 * would be invented. The brief says so in as many words: "if the source does not
 * name them, label them plainly and say nothing more."
 *
 * ---- WHY IT IS NOT THE YEAR SHEET -----------------------------------------
 *
 * The year sheet is a good instrument and the wrong first screen. It asks a
 * student who has been in the game four minutes to understand three season
 * tokens, a season lock, a two-class limit and a drag before anything has been
 * chosen, and BRIEF-SELF-EVIDENT rules that out in one sentence: "a student who
 * reads nothing, is told nothing, and presses things at random must still do the
 * right thing next, and see that it worked."
 *
 * So the first plan is made of cards. You press a thing you like; it is yours;
 * the card says so. Every rule the sheet enforces is still enforced, by the same
 * functions, and the ones a first-year student cannot violate are simply never
 * shown to them:
 *
 *   THE SEASON IS DECIDED FOR THEM, not hidden from them. A sport already has a
 *   season by school rule (`seasonOf`), and a club takes whichever season is
 *   free. The card says which one it landed in, so the mechanic is TAUGHT by
 *   watching rather than explained before it happens. When the sheet opens later
 *   in the year, the student has already seen where things go.
 *
 *   NOTHING IS DRAGGED. `assignSlot` is the same writer the sheet's drop calls,
 *   so a plan made here and a plan made there are the same object.
 *
 * ---- ONE THING IS LIT, AND IT IS NEVER THE THING YOU JUST PRESSED -----------
 *
 * The dimwit run (scripts/dimwit.mjs) pressed Key Club, then pressed it again,
 * then again, forever: a taken card was still a button, still the biggest thing
 * on the glass, and pressing it put the pick back. The loudest thing on the
 * screen was an undo. So the screen has three stages and exactly one of them is
 * lit at a time:
 *
 *   1. a period still blank: the schedule glows and the FIRST blank period is
 *      the only one that can be pressed. Pressing it opens the elective list
 *      under it, headed with that period's own number, so what a pick fills is
 *      never a guess. Only one blank period is live at a time, because
 *      `plan.classes` is a list and a pick lands at the end of it: two live
 *      blanks would let a student press Period 7 and watch Period 6 fill.
 *   2. both electives in, nothing after school: the after-school box glows. A
 *      taken card LOCKS. It is no longer a button; it is a stamped sign with a
 *      small "Put back" inside it, and the cards not taken step back into a
 *      shelf of small chips beside it.
 *   3. both: the plank that ends the beat glows, and it is the biggest control
 *      on the screen.
 *
 * "Loudest" here is a real number, the largest control that is not a way out,
 * because that is the number a student who reads nothing is steering by.
 *
 * ---- WHAT IT REFUSES, AND HOW ---------------------------------------------
 *
 * `refuseSlot` and `refuseClass` decide, exactly as they do for the sheet: one
 * rule, one sentence, one place. A card that cannot be taken is not hidden and is
 * not silent, because §40.41 and the self-evident law agree on that: it says the
 * school's own reason on the card that was pressed.
 */
import { useEffect, useState } from 'react'
import { firstLook, markLooked } from '../hud/first-look'
import { PROGRAMMES, seasonOf, type Programme } from '../roster/roster'
import { EXAMPLE_BLURB, classIsReal, exampleNameOf, shownName } from '../roster/placeholders'
import { CLASSES, type ClassDef } from './catalog'
import { scheduleOwed } from './schedule'
import { SEASONS, assignSlot, clearSlot, loadSave, pickClass, dropClass, stampPlan, type Season } from '../save'
import { refuseClass, refuseSlot } from '../run/refusal'
import { usePanel } from '../ui/a11y'
import { cinemaOn } from '../stage/cinema'
import { Glyph, Plank } from '../ui/controls'
import { awarded, saved as saidSaved } from '../ui/feedback'
import { track } from '../telemetry'
import './pickyear.css'

/* THE FIVE THINGS YEAR ONE OFFERS, named by the brief rather than derived, and
 * checked against the roster so a rename cannot leave a card pointing at
 * nothing. Everything else on the roster is a later year's problem. */
const YEAR_ONE_ACTIVITIES = ['football', 'girls-flag-football', 'track-field', 'atc', 'key-club']

/* THE FIVE PERIODS A FRESHMAN DOES NOT CHOOSE, in the plainest words there are.
 *
 * Every one of them is a graduation requirement in `docs/blhs/sourced-facts.md`
 * ("English 4 · Math 3 · Science 3 · Social Studies 3 · Health & Fitness 2"),
 * and not one of them is a course title, because the source does not publish a
 * freshman course list and a made-up one would be the game teaching a student
 * something untrue about their own school. History is the plain word for Social
 * Studies and PE is the plain word for the fitness half of Health & Fitness. */
const REQUIRED = ['English', 'Math', 'Science', 'PE', 'History']
/* how many periods the sheet shows. The five above, then the two the student
 * fills. `sourced-facts.md` prints a six-period Tuesday-to-Friday bell schedule
 * plus the Monday Advisory block, so the number of ROWS here is the brief's and
 * not the bell schedule's, and no times are printed beside them: a time is the
 * part that would be inventing something. */
const PERIODS = 7
const ELECTIVE_AT = REQUIRED.length

const YEAR_WORD = ['', 'one', 'two', 'three', 'four']

/** what a card can win, in the school's own words, for the wall outline */
function earnsOf(p: Programme): string {
  if (p.kind === 'sport') return 'JV, Varsity, Captain'
  return 'a cord, over four years'
}

export function PickYear({ year, onClose }: { year: number; onClose: () => void }) {
  /* ---- INSIDE A CUTSCENE THERE IS NO WAY OUT ------------------------------
   *
   * Ash, 2026-09-06: *"THOR MUST NEVER BE ABLE TO LEAVE THE MAW CUTSCENE... From
   * the tunnel to 'Year two, next time' there is no way out: no 'Leave this for
   * now' plank on Advisory during the rail, no 'Close for now' on the schedule,
   * Esc does nothing, doors and stations are dead, the corner is hidden. The
   * cutscene runs continuously until it is over."*
   *
   * The movie flag is the whole test and it is the right one: the bars being up
   * IS the statement that something else is directing, so a panel raised inside
   * them has no dismiss, no Escape and no click-off. Outside a movie the screen
   * behaves exactly as it did. */
  const held = cinemaOn()
  const shut = held ? () => { /* the rail is driving; there is no way out */ } : onClose
  const panel = usePanel({ onClose: shut, closeOnEscape: !held, label: `Your schedule for year ${year}` })
  const [, bump] = useState(0)
  const [refused, setRefused] = useState<{ id: string; why: string } | null>(null)
  /* which blank period's elective list is open, as the period NUMBER, so the
   * heading over the list and the row it fills cannot disagree */
  const [openAt, setOpenAt] = useState<number | null>(null)
  const redraw = () => bump((v) => v + 1)

  const s = loadSave()
  const plan = s?.plans?.[year] ?? { slots: {}, classes: [], stamped: false }

  useEffect(() => { track('pickyear_opened', { year }) }, [year])

  /* IN THE ROSTER'S OWN ORDER, so the row reads Example A, B, C, D, E rather
   * than B, C, D, A, E. `placeholders.ts` counts the letters down the roster,
   * and this list used to be written in the brief's order, so the alphabet
   * arrived shuffled on the one screen a student reads it on. */
  const activities = PROGRAMMES.filter((p) => YEAR_ONE_ACTIVITIES.includes(p.id))

  const classes = CLASSES.filter((c) => c.years.includes(year) && !c.requires)

  /** which season a programme is already sitting in, if any */
  const seatOf = (id: string): Season | null =>
    (SEASONS.find((se) => plan.slots[se] === id) ?? null)

  /* THE SEASON A CLUB TAKES IS THE FIRST FREE ONE, and a sport's is the school's.
   * That is the whole of the placement rule a first-year student needs, and it is
   * the same rule the sheet enforces from the other end: the sheet refuses a
   * football token on spring, this simply never offers one. */
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

  /* PUTTING BACK IS ITS OWN SMALL CONTROL, inside the locked card, and never the
   * card itself. A card that undoes on a second press is a card whose loudest
   * affordance is the undo, which is the loop the dimwit run found. */
  const putBack = (p: Programme, seat: Season) => {
    clearSlot(year, seat)
    setRefused(null)
    track('pick_put_back', { what: p.id, season: seat })
    redraw()
  }
  /* the same rule for a class: a ticked row is a locked row with a small untick
   * inside it. The dimwit run ticked AP Human Geography and then, with the row
   * still the loudest thing on the glass, unticked it. */
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
    /* THE LIST SHUTS ON A PICK, so the student watches the period they pressed
     * fill in. Leaving it open and re-heading it for the next blank would save
     * one press and hide the only thing this screen is for. */
    setOpenAt(null)
    saidSaved(c.name)
    track('pick_taken', { what: c.id })
    redraw()
  }

  const chosen = SEASONS.filter((se) => plan.slots[se]).length
  const classesLeft = 2 - plan.classes.length
  /* ---- WHAT IS ACTUALLY PICKABLE TODAY, AND IT IS THE ELECTIVES -----------
   *
   * BRIEF-INTRO-FILM section 3 splits the sheet in two. THE ELECTIVES ARE
   * PICKABLE AND REQUIRED whatever the roster says, because a course is a thing
   * the district runs and picking two is what a freshman does; the island behind
   * one is what is not built. THE CLUBS AND SPORTS are islands, so there is no
   * honest name to print on one nobody has made, they stay Example A to E, and
   * that half is owed only where a `member-islands.json` row puts something real
   * on the screen (`roster/placeholders.ts`).
   *
   * `realClasses` is still counted, and it is still handed to the rule, because
   * it is what makes an elective's island reachable the day one lands. It is no
   * longer what decides whether the period has to be filled. */
  const realClasses = classes.filter((c) => classIsReal(c.id))
  const realActivities = activities.filter((p) => p.playable)
  /* THE RULE ITSELF IS `planner/schedule.ts`, so it can be tested without
   * mounting a panel (BRIEF-MAW-RAIL-3 F). It was eight lines here, and a rule
   * that can only be exercised by rendering a screen is a rule that quietly
   * stops being true. This counts the four numbers; that decides. */
  const owed = scheduleOwed({
    electivesLeft: classesLeft,
    chosen,
    realClasses: realClasses.length,
    realActivities: realActivities.length,
  })
  const { ready, stage, notYet } = owed
  /* said once, and marked when the panel is really up: a read that also wrote
   * would blank itself on the second render */
  const [told] = useState(() => firstLook('my-year'))
  useEffect(() => { markLooked('my-year') }, [])

  /* the one refusal that belongs to a class, said under the list on its own line
   * rather than inside a row, so the rows never grow and the plank never jumps */
  const classNo = refused && classes.some((c) => c.id === refused.id) ? refused.why : null

  const taken = activities.filter((p) => seatOf(p.id))
  const onOffer = activities.filter((p) => !seatOf(p.id))
  /* AND THE CARDS STEP BACK WHILE THE ELECTIVE LIST IS OPEN, not only once
   * something is taken. One question is being asked, "which elective goes in
   * Period 6", and a row of hand-sized signs about football is the loudest thing
   * on a screen asking it. Measured the way the self-evident law measures: a
   * card is about 18,000 pixels of glass and a class row about 15,000, so a
   * student steering by size answers the wrong question. */
  const shelved = chosen > 0 || openAt !== null

  /* ---- THE SEVEN ROWS ------------------------------------------------------
   *
   * Periods 1 to 5 are the requirements and are not controls. Periods 6 and 7
   * are the two class ids the save has always held, in the order they were
   * picked, and only the FIRST blank one can be pressed: `pickClass` appends, so
   * a live Period 7 beside a blank Period 6 would let a student press one row
   * and watch a different row fill. */
  const firstBlankAt = ELECTIVE_AT + plan.classes.length
  const rows = Array.from({ length: PERIODS }, (_, i) => {
    const n = i + 1
    if (i < ELECTIVE_AT) return { n, kind: 'required' as const, name: REQUIRED[i], cls: null }
    const id = plan.classes[i - ELECTIVE_AT]
    const cls = id ? CLASSES.find((c) => c.id === id) ?? null : null
    /* NUMBERED, so two blank lines reading "Elective" cannot be read as one
       thing said twice. Ash could not tell whether the screen wanted one
       elective or several, and the rows themselves are where that is answered. */
    const blank = `Elective ${i - ELECTIVE_AT + 1}`
    return { n, kind: 'elective' as const, name: cls ? shownName(cls.id, cls.name) : blank, cls }
  })

  return (
    <div className="py-veil" onClick={shut}>
      <div {...panel} className="py-sheet kit-surface-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="py-title">Your schedule, year {YEAR_WORD[year] ?? year}</h2>
        {/* WHAT MY YEAR IS, THE FIRST TIME IT IS OPENED (BRIEF-CLOSE-THE-LOOP
            section 1). The principal used to say it in the cutscene, about a
            button in the other corner of the screen. */}
        {told && <p className="py-firstlook">{told}</p>}

        {/* ---- THE SEVEN PERIODS ----------------------------------------- */}
        <section className={`py-schedule${stage === 'schedule' ? ' py-lit' : ''}`} aria-labelledby="py-sched-h">
          <h3 className="py-h py-sched-h" id="py-sched-h">
            Fill your two Elective periods
            {/* THE COUNT IS UNMISTAKABLE AND IT IS NOT A SENTENCE. Ash, playing
                it: he could not tell whether he picks one elective or several.
                "n of 2 electives" says how many the year takes and how many he
                has, in four words, on the box he is looking at. */}
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
                  {/* a blank period a student may fill is a button; every other
                      row on this sheet is furniture and is not pressable, which
                      is what stops the loudest thing on the glass being an undo */}
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
                  {/* ---- THE ELECTIVE LIST, UNDER THE ROW IT FILLS --------
                      Headed with the period's own number, so what a pick does is
                      never a guess, and drawn inside the row so the answer lands
                      where the question was asked. */}
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
                          /* ---- AN ELECTIVE IS PICKABLE, AND THAT IS A RULING
                              BRIEF-INTRO-FILM section 3, which overrules the
                              rail-2 refinement that stood here: "Electives are
                              PICKABLE and REQUIRED: two, from the real BLHS
                              elective list, because choosing electives is a
                              thing every freshman actually does, and the island
                              behind an elective is what is 'not built yet', not
                              the choice."

                              So the `classIsReal` gate that drew every one of
                              these as an inert div with a "no island yet" mark
                              is gone. A course the district publishes is a true
                              thing about Bonney Lake and picking two of them is
                              the thing this screen is FOR; what does not exist
                              yet is an island to sail to, and a mark saying so
                              on all thirteen rows was the screen apologising
                              thirteen times for something the student had not
                              asked about. */
                          return (
                            <button key={c.id} type="button" className="py-class" onClick={() => takeClass(c)}>
                              <span className="py-tick" aria-hidden="true" />
                              <span className="py-class-name">{c.name}</span>
                            </button>
                          )
                        })}
                      </div>
                      {/* NEVER A DEAD END (law 6). With nothing pickable this
                          line is the one that says what to do instead, and it
                          names the control that does it. */}
                      <p className={`py-classnote${classNo ? ' py-classnote-no' : ''}`} role={classNo ? 'alert' : undefined}>
                        {/* ONE INSTRUCTION, ALWAYS THE SAME ONE. It used to
                            branch on whether any elective had an island and say
                            "None of these has an island yet" when none did,
                            which is now every row's own answer to a question the
                            student is not asking: they are all pickable. */}
                        {classNo ?? 'Press one to put it in this period.'}
                      </p>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </section>

        {/* ---- AFTER SCHOOL, WHICH IS THE OTHER HALF OF A YEAR HERE -------
            Same five cards, same season rule, same writer. What changed is that
            they are now under a heading that says WHEN they happen, because "a
            club or a sport" and "a class" were two rows of the same screen with
            nothing saying that one of them is at 2:30. */}
        <section className={`py-cardbox${stage === 'after' ? ' py-lit' : ''}`} aria-labelledby="py-cards-h">
          {/* ---- AND THIS HALF SAYS OUT LOUD THAT IT IS SHUT ---------------
              BRIEF-INTRO-FILM section 3: *"it reads 'After school: no clubs open
              yet' over the example cards so nobody hunts for a live one."* The
              heading said "pick one" over five cards that cannot be pressed,
              which is an instruction a student cannot follow and no way of
              telling that from a broken screen. It says "pick one" again, on its
              own, the day a member's row makes one of them real. */}
          <h3 className="py-h py-cards-h" id="py-cards-h">
            {realActivities.length ? 'After school: pick one' : 'After school: no clubs open yet'}
            {realActivities.length > 0 && (
              <span className="py-count"> {chosen === 0 ? 'none yet' : `${chosen} taken`}</span>
            )}
          </h3>
          <div className="py-grid">
            {/* A TAKEN CARD IS LOCKED. Not a button any more: a stamped sign with
                the season on it and one small control that puts it back. */}
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
            {/* THE CARDS NOT TAKEN. Big drawn signs while nothing is chosen; once
                something is, they step back into a shelf of small chips beside
                the locked card, still takeable and never louder than the way on. */}
            {onOffer.map((p) => {
              const no = refused?.id === p.id ? refused.why : null
              /* ---- A CLUB NOBODY HAS BUILT IS AN EXAMPLE AND IT DOES NOT TAKE
                  A PRESS. Ash, 2026-09-06: "if you want placeholders, label them
                  Example A, Example B and so on, with placeholder text, and it
                  should clearly be a placeholder and not work." Football, Key
                  Club and the rest are real things at a real school with no
                  island behind them, and a freshman who presses one and gets
                  nothing cannot tell that from a bug. It is a div rather than a
                  disabled button on purpose: a disabled control is still a
                  control, and this is a picture of one. */
              const example = exampleNameOf(p.id)
              if (example) {
                return (
                  <div
                    key={p.id}
                    className="py-card kit-surface-tab py-card-example"
                    role="group"
                    aria-label={example + '. ' + EXAMPLE_BLURB}
                  >
                    <span className="py-card-name">{example}</span>
                    <span className="py-card-earns">{EXAMPLE_BLURB}</span>
                  </div>
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
          {/* A WAY OUT THAT IS A WORD, and small on purpose: at medium it was
              bigger than a period row, so the way out outranked the way on for a
              student steering by size. */}
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
              /* ---- AND THE STAMP POPS (BRIEF-MAW-RAIL beat 2) --------------
               * The frames have appeared under his hand since the screen was
               * written; the stamp itself landed in silence and the panel simply
               * vanished, so the one moment this beat is built to make him want
               * was the quietest thing on the glass.
               *
               * THE POP DOES NOT SAY WHAT THE PRINCIPAL IS ABOUT TO SAY. He
               * hands over the corner's My Year button on the next line
               * (islands/panther-maw/lines.py), and watched on the dev server
               * the two were the same sentence stacked on one frame. */
              /* AND THE POP NEVER SAYS A FAKE REAL NAME. Nothing pickable
                 today means this is undefined and it says the plain thing; the
                 day a member island lands it says that island's own name. */
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
