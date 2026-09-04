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
import { cordsOf } from '../progress'
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
  return 'a cord, if you stay with it'
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
      setRefused({ id: p.id, why: 'Every season is spoken for. Take something off first.' })
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
  const ready = plan.classes.length === 2 && chosen > 0
  /* THE REASON IS ON THE BUTTON, ALWAYS, because §40.9's rule is that a disabled
   * control a student cannot interrogate is worse than one that answers. */
  const notYet = plan.classes.length < 2
    ? `Pick ${2 - plan.classes.length} more ${plan.classes.length === 1 ? 'class' : 'classes'}.`
    : chosen === 0 ? 'Pick at least one thing to do.' : null

  /* WHAT THE WALL WILL HOLD, which is the half of this beat that makes a student
   * want the rest of the year. Derived from the picks rather than written down:
   * the cords these choices can actually close, by the same reader the Handbook's
   * cords board uses. */
  const outline = cordsOf(loadSave() ?? ({} as never))
    .filter((c) => c.published)
    .slice(0, 3)

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
                {seat && <Glyph piece="stamp" face="approved" size={26} className="py-stamp" />}
                <span className="py-card-name">{p.name}</span>
                <span className="py-card-where">{seat ?? (seasonOf(p) ?? 'any season')}</span>
                <span className="py-card-earns">{earnsOf(p)}</span>
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
        <h3 className="py-h">Two classes<span className="py-count"> {plan.classes.length} of 2</span></h3>
        <div className="py-classes">
          {classes.map((c) => {
            const on = plan.classes.includes(c.id)
            const no = refused?.id === c.id ? refused.why : null
            return (
              <button
                key={c.id}
                className={`py-class${on ? ' py-class-on' : ''}`}
                aria-pressed={on}
                onClick={() => takeClass(c)}
              >
                <span className="py-tick" aria-hidden="true">
                  {on && <Glyph piece="icon_set" face="tick" size={15} />}
                </span>
                <span className="py-class-name">{c.name}</span>
                {no && <span className="py-no">{no}</span>}
              </button>
            )
          })}
        </div>

        {/* ---- WHAT THE WALL COULD HOLD ------------------------------------
            Beat 4's last sentence, and the one that does the wanting: "The empty
            trophy wall shows the outline of what those choices can earn." It is
            an outline, not a promise: every line is a real cord with the school's
            own criterion under it, and none of them is earned yet. */}
        <h3 className="py-h">What you could put on the wall</h3>
        <ul className="py-wall">
          {outline.map((c) => (
            <li className="py-slot" key={c.id}>
              <span className="py-slot-hole" aria-hidden="true" />
              <span className="py-slot-words">
                <span className="py-slot-name">{c.name}</span>
                <span className="py-slot-rule">{c.rule}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="py-foot">
          {notYet && <span className="py-notyet">{notYet}</span>}
          <Plank
            size="lg"
            className="py-go"
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
