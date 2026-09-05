/* PICK WHAT YOU'LL DO THIS YEAR: beat 4 of the thirty minutes, as one screen.
 *
 * BRIEF-YEAR-ONE, beat 4: "One screen of big drawn cards: Football, Girls Flag
 * Football, Track, ATC, Key Club, and the two classes. He picks. The empty
 * trophy wall shows the outline of what those choices can earn. Now he wants
 * it."
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
 * ---- WHAT IT REFUSES, AND HOW ---------------------------------------------
 *
 * `refuseSlot` and `refuseClass` decide, exactly as they do for the sheet: one
 * rule, one sentence, one place. A card that cannot be taken is not hidden and is
 * not silent, because §40.41 and the self-evident law agree on that: it says the
 * school's own reason on the card that was pressed.
 */
import { useEffect, useState } from 'react'
import { PROGRAMMES, seasonOf, type Programme } from '../roster/roster'
import { CLASSES, type ClassDef } from './catalog'
import { SEASONS, assignSlot, clearSlot, loadSave, pickClass, dropClass, stampPlan, type Season } from '../save'
import { refuseClass, refuseSlot } from '../run/refusal'
import { usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { saved as saidSaved } from '../ui/feedback'
import { track } from '../telemetry'
import './pickyear.css'

/* THE FIVE THINGS YEAR ONE OFFERS, named by the brief rather than derived, and
 * checked against the roster so a rename cannot leave a card pointing at
 * nothing. Everything else on the roster is a later year's problem. */
const YEAR_ONE_ACTIVITIES = ['football', 'girls-flag-football', 'track-field', 'atc', 'key-club']

/** what a card can win, in the school's own words, for the wall outline */
function earnsOf(p: Programme): string {
  if (p.kind === 'sport') return 'JV, Varsity, Captain'
  return 'a cord, over four years'
}

export function PickYear({ year, onClose }: { year: number; onClose: () => void }) {
  const panel = usePanel({ onClose, label: `Pick what you will do in year ${year}` })
  const [, bump] = useState(0)
  const [refused, setRefused] = useState<{ id: string; why: string } | null>(null)
  const redraw = () => bump((v) => v + 1)

  const s = loadSave()
  const plan = s?.plans?.[year] ?? { slots: {}, classes: [], stamped: false }

  useEffect(() => { track('pickyear_opened', { year }) }, [year])

  const activities = YEAR_ONE_ACTIVITIES
    .map((id) => PROGRAMMES.find((p) => p.id === id))
    .filter((p): p is Programme => !!p)

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
    const seat = seatOf(p.id)
    if (seat) {                       // pressing a chosen card puts it back
      clearSlot(year, seat)
      setRefused(null)
      redraw()
      return
    }
    const se = seasonFor(p)
    if (!se) {
      setRefused({ id: p.id, why: 'You have used all three season tokens. Take one off first.' })
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

  const takeClass = (c: ClassDef) => {
    if (plan.classes.includes(c.id)) { dropClass(year, c.id); setRefused(null); redraw(); return }
    const no = refuseClass(c.id, loadSave(), year)
    if (no) { setRefused({ id: c.id, why: no }); track('pick_refused', { what: c.id, why: no }); return }
    pickClass(year, c.id)
    setRefused(null)
    saidSaved(c.name)
    track('pick_taken', { what: c.id })
    redraw()
  }

  const chosen = SEASONS.filter((se) => plan.slots[se]).length
  const classesLeft = 2 - plan.classes.length
  const ready = classesLeft === 0 && chosen > 0
  /* THE REASON IS ON THE BUTTON, ALWAYS, because §40.9's rule is that a disabled
   * control a student cannot interrogate is worse than one that answers. In the
   * plainest words there are: a freshman read "Pick 2 more classes." beside a
   * grey plank and did not connect it to the small boxes above. */
  const notYet = classesLeft > 0
    ? `Not yet: tick ${classesLeft === 2 ? 'two classes' : 'one more class'} in the box above.`
    : chosen === 0 ? 'Not yet: press one club or sport card.' : null

  /* ---- WHAT THE WALL WILL HOLD, AND IT ANSWERS THE PICK -------------------
   *
   * STATE-OF-THE-GAME confusing 7: "What you could put on the wall never
   * answers the pick: it shows the same three cords before and after Football."
   * It listed the top three published cords, which is a fact about the school
   * and not about this student. The wall itself (`wall.ts`) hangs one frame per
   * thing chosen, so this is that: Advisory, which everyone is in, then a frame
   * for every card pressed and every class ticked, in the order they will be
   * met. Press Football and a Football frame appears; put it back and it goes.
   * The count under the heading is the same count the trophy wall shows. */
  const outline: { id: string; name: string; earns: string }[] = [
    { id: 'advisory', name: 'Advisory', earns: 'a grade and a credit' },
    ...SEASONS.map((se) => plan.slots[se]).filter((id): id is string => !!id).map((id) => {
      const p = PROGRAMMES.find((x) => x.id === id)
      return { id: `programme:${id}`, name: p?.name ?? id, earns: p ? earnsOf(p) : '' }
    }),
    ...plan.classes.map((id) => ({ id: `class:${id}`, name: CLASSES.find((c) => c.id === id)?.name ?? id, earns: 'a grade and a credit' })),
  ]
  /* the one refusal that belongs to a class, said under the class box on its own
   * line rather than inside a row, so the rows never grow and the plank never
   * jumps */
  const classNo = refused && classes.some((c) => c.id === refused.id) ? refused.why : null

  return (
    <div className="py-veil" onClick={onClose}>
      <div {...panel} className="py-sheet kit-surface-panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="py-title">Pick what you will do this year</h2>
        <p className="py-lede">Press a card to take it. Press it again to put it back.</p>

        <h3 className="py-h">Clubs and sports</h3>
        <div className="py-grid">
          {activities.map((p) => {
            const seat = seatOf(p.id)
            const no = refused?.id === p.id ? refused.why : null
            return (
              <button
                key={p.id}
                className={`py-card kit-surface-tab${seat ? ' py-card-on' : ''}`}
                aria-pressed={!!seat}
                onClick={() => takeActivity(p)}
              >
                <span className="py-card-name">{p.name}</span>
                <span className="py-card-where">{seat ? `${seat}. Yours.` : (seasonOf(p) ?? 'any season')}</span>
                <span className="py-card-earns">{earnsOf(p)}</span>
                {/* THE STAMP SITS IN THE FRAME'S FREE CORNER, bottom right, where
                    no word reaches: at the top right it landed on "Field" of
                    "Track and Field" (`fix-2/yearsheet-04`). The refusal takes
                    the bottom edge instead, and the two never share a card: a
                    card that is yours is put back by a press, never refused. */}
                {seat && <Glyph piece="stamp" face="approved" size={26} className="py-stamp" />}
                {no && <span className="py-no">{no}</span>}
              </button>
            )
          })}
        </div>

        {/* ---- THE CLASSES ARE A LIST, NOT TEN MORE CARDS -----------------
            "Big drawn cards" is about the five things you DO; a class is a
            smaller decision and there are ten of them offered in year one.
            Photographed as cards: the `tab` piece is a carved frame whose own
            nine-slice is 36 tall at the top and 35 at the bottom, so a card
            cannot be shorter than 71 pixels however little is written on it, and
            ten of them pushed the wall and the button that ends the beat clean
            off a 768 pixel screen. A screen the brief calls "one screen".

            So the frames go and the marks stay: a row per class, a drawn tick
            when it is yours, and the same two-pick rule underneath. */}
        {/* ---- THE TWO REQUIRED CLASSES ARE THE LIT THING -----------------
            STATE-OF-THE-GAME confusing 7 and ugly 5: "five 208x184 cards dwarf
            the 262x34 class rows... nothing on the screen is lit." The
            self-evident law's first rule is that exactly one thing is lit and
            the world shows it. On this screen the required thing is two ticks
            in a list a student could miss, so the list is a box, the box glows
            until both ticks are in, the heading is the verb, and the count says
            how many are still owed. Once two are ticked the glow moves to the
            plank that ends the beat, so there is always one next thing. */}
        <section className={`py-classbox${classesLeft > 0 ? ' py-lit' : ''}`} aria-labelledby="py-classes-h">
          <h3 className="py-h py-classes-h" id="py-classes-h">
            Tick two classes
            <span className="py-count"> {classesLeft === 0 ? 'both picked' : `${classesLeft} more to tick`}</span>
          </h3>
          <div className="py-classes">
            {classes.map((c) => {
              const on = plan.classes.includes(c.id)
              return (
                <button
                  key={c.id}
                  className={`py-class${on ? ' py-class-on' : ''}`}
                  aria-pressed={on}
                  onClick={() => takeClass(c)}
                >
                  <span className="py-tick" aria-hidden="true">
                    {on && <Glyph piece="icon_set" face="tick" size={16} />}
                  </span>
                  <span className="py-class-name">{c.name}</span>
                </button>
              )
            })}
          </div>
          {/* one line, always there, so a refusal does not move the rows */}
          <p className={`py-classnote${classNo ? ' py-classnote-no' : ''}`} role={classNo ? 'alert' : undefined}>
            {classNo ?? (classesLeft === 0 ? 'Press a ticked class to untick it.' : 'Press a class to tick it.')}
          </p>
        </section>

        {/* ---- WHAT THE WALL WILL HOLD -----------------------------------
            Beat 4's last sentence, and the one that does the wanting: "The empty
            trophy wall shows the outline of what those choices can earn." One
            empty frame per thing chosen, in the order they will be met. */}
        <h3 className="py-h">Your wall this year<span className="py-count"> {outline.length} empty {outline.length === 1 ? 'frame' : 'frames'}</span></h3>
        <ul className="py-wall">
          {outline.map((c) => (
            <li className="py-slot" key={c.id}>
              <span className="py-slot-hole" aria-hidden="true" />
              <span className="py-slot-words">
                <span className="py-slot-name">{c.name}</span>
                <span className="py-slot-rule">{c.earns}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="py-foot">
          {/* A WAY OUT THAT IS A WORD. The sheet had no close at all: Esc, or a
              click on the dark edge, which nothing on screen names (confusing
              10). Closing keeps every pick, because every pick is already
              written to the save the moment it is pressed. */}
          <Plank size="md" keyCap="Esc" className="py-close" onClick={onClose}>Close for now</Plank>
          {notYet && <span className="py-notyet">{notYet}</span>}
          <Plank
            size="lg"
            className={`py-go${ready ? ' py-lit' : ''}`}
            disabled={!ready}
            onClick={() => {
              stampPlan(year, SEASONS.map((se) => plan.slots[se]).filter((x): x is string => !!x))
              track('pickyear_stamped', { year, slots: plan.slots, classes: plan.classes })
              onClose()
            }}
          >
            That is my year
          </Plank>
        </div>
      </div>
    </div>
  )
}
