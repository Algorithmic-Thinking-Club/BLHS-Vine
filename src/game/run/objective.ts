/* THE OBJECTIVE: what the player is supposed to do next, as an anchor name.
 *
 * The Maw is the year's state machine wearing a body. Four of the six beats in
 * GAME-DESIGN §7.5's forty-minute rhythm happen inside it, in a fixed order, and
 * the player is SENT to each one. So "what is reachable in the Maw" is really
 * "what state is the year in, and what is the one live thing in that state".
 *
 * yearStatus() already computed all of this and nothing ever read it as a
 * sequence. This turns it into a single name, and that name is what the guide
 * arrow points at, what the station highlights, and what `guide_to` resolves.
 *
 * ONE LIVE THING AT A TIME, on purpose. A home base with six glowing stations is
 * a menu. A home base with one glowing station and five you may choose to visit
 * is a place with a story running through it. The optional stations are not
 * disabled when they are not the objective, they are just quiet.
 *
 * This is also the most reusable thing in the project: it is exactly what a
 * grape needs for a quest step, so it is built once here and inherited rather
 * than reinvented per island.
 */
import type { SaveGame } from '../save'
import { shownName } from '../roster/placeholders'
import { sessionOver, yearStatus } from './year'

export type Objective = {
  /* the anchor this points at. Every map that can be the objective's home has to
   * carry an anchor by this name, which is what makes the list below double as
   * the required-anchor list for the Maw. */
  anchor: string
  /* the map that anchor lives on, so the arrow can say "not here, out there" */
  map: string
  /* shown to the player ON THE OBJECTIVE'S OWN MAP. Literal, school words, a
   * verb first (BRIEF-PLAYTHROUGH-1 law 1), and SHORT: BRIEF-MAW-RAIL cut every
   * one of these down to the verb and its target, because this sentence hangs
   * over Thor's head while the thing it names is already lit and pointed at, and
   * a second clause explaining the first is the reading the rail exists to cut. `away` is the same step said from
   * any other map, which today is always the hub and always begins with going
   * into the mountain; `objectiveLine` picks. A consumer that does not know
   * where the player is standing reads `say`. */
  say: string
  away: string
  /* the year phase this belongs to, for logging and for the debug overlay.
   *
   * `rising` is the THIRD VOYAGE STATE §80.6 asks for by name:
   * committed-but-unsailable. O5 exists because the arrow pointed at an island
   * that will never rise and never resolved on its own, and a state that has no
   * name is a state nothing can render differently. */
  phase: 'founding' | 'vignette' | 'plan' | 'core' | 'voyage' | 'rising' | 'yearbook' | 'done'
}

export const MAW_MAP = 'panther-maw'
export const HUB_MAP = 'hub'

/* the flag that says the founding event has played. Named here rather than at
 * the callsite so the cutscene, the station and the save all agree on one
 * string; save.ts already uses this `thing:detail` shape for `vignette:y1`. */
export const FOUNDING_FLAG = 'maw:founding'

/* THE LINE FOR WHERE HE IS STANDING. STATE-OF-THE-GAME confusing 6: "Go into
 * the mountain and find the principal" was on the hub while the principal was
 * talking to him at the dock, and on the Maw's arrival card while he was
 * already inside the mountain with the principal walking over. One sentence
 * cannot be right on both sides of a door, so there are two and the map picks. */
export function objectiveLine(o: Objective | null, mapId: string | null | undefined): string {
  if (!o) return ''
  return mapId && mapId !== o.map ? o.away : o.say
}

/* THE ORDER, and it is the order §7.5 prints.
 *
 * Read top to bottom, first match wins. Adding a beat means adding a clause
 * here, which is the point: the sequence lives in one readable place instead of
 * being spread across whichever component happened to need it.
 */
export function nextObjective(s: SaveGame | null): Objective | null {
  if (!s || !s.introDone) return null
  if (s.graduated) return null

  /* ---- THE THIRTY MINUTES ARE OVER, AND NOTHING WAKES UP -----------------
   *
   * BRIEF-MAW-RAIL-3 C, Ash after playing rail-2: *"After 'Year two, next time'
   * nothing wakes up. No 'Go to the table and pick your year', no lit table, no
   * year-two planner, no year-two Advisory... the objective panel reads 'Explore
   * the Maw. Year two, next time.'"*
   *
   * FIRST, ABOVE EVERY YEAR CLAUSE, because this is a statement about the RUN
   * and the clauses below are statements about a year. `year.ts` stops advancing
   * the year at the same flag, so nothing under here would fire anyway; being
   * first is what makes that a belt and not a coincidence.
   *
   * THE ANCHOR IS NOTHING ON PURPOSE. Every other objective names a station and
   * the world lights it; this one names none, so no ring comes on, no chevron
   * hangs anywhere and no plaque offers a press. The room is his and the panel
   * says so. `isObjective` compares by name and an anchor is never called '', so
   * nothing on any map can match it. */
  if (sessionOver(s)) {
    const line = 'Explore the Maw. Year two, next time.'
    return { anchor: '', map: MAW_MAP, phase: 'done', say: line, away: line }
  }

  /* the founding event: the first time in, before anything else can be true.
   * It is not a year beat, it happens once per run. Inside the mountain he
   * walks over on his own (islands/panther-maw/founding.py), so the line there
   * names the person and not the door. */
  if (!s.flags.includes(FOUNDING_FLAG)) {
    return {
      anchor: 'principal_desk', map: MAW_MAP, phase: 'founding',
      say: 'Talk to Principal Panther.',
      away: 'Go into the mountain.',
    }
  }

  const y = yearStatus(s)

  /* the year's opening vignette. The HUD already auto-mounts this whenever the
   * world is quiet, so the objective's job is only to stop pointing anywhere
   * else while it is owed. */
  if (!y.vignetteSeen) {
    return {
      anchor: 'principal_desk', map: MAW_MAP, phase: 'vignette',
      say: 'Talk to Principal Panther.',
      away: 'Go into the mountain.',
    }
  }

  if (!y.planStamped) {
    return {
      anchor: 'chart_table', map: MAW_MAP, phase: 'plan',
      say: 'Go to the table and pick your year.',
      away: 'Go into the mountain and pick your year.',
    }
  }

  if (!y.coreBeatDone) {
    return {
      anchor: 'hearth', map: MAW_MAP, phase: 'core',
      say: 'Go to the fire.',
      away: 'Go into the mountain. Advisory is at the fire.',
    }
  }

  /* out of the Maw and onto the water. The anchor is the way OUT, because the
   * thing to do is somewhere this map cannot reach, and an arrow that points at
   * the exit is more honest than one that points at nothing.
   *
   * A VOYAGE THAT CANNOT BE SAILED DOES NOT OUTRANK THE YEARBOOK, and it used to.
   * This clause read `y.voyages.filter((v) => !v.done)` with no test of whether
   * the programme could run, so the moment a token landed on anything unplayable
   * the arrow pointed at the exit for the rest of the year and the `yearbook`
   * phase below became unreachable. Every programme on the roster is unplayable
   * today, so that was every stamped year: the year model said the yearbook was
   * ready (`year.ts` deliberately does not wait on a rising island) and the
   * sequencer disagreed with it, forever, on the ordinary path. */
  const sailable = y.voyages.filter((v) => !v.done && v.playable)
  if (sailable.length) {
    const next = sailable[0]
    return {
      anchor: 'maw_entrance', map: MAW_MAP, phase: 'voyage',
      /* THE NAME IS THE ONE THE STUDENT SAW ON THE CARD. A programme with
       * no island behind it is an Example on the schedule and must be an
       * Example here too, or the year sends him to sail to Football.
       * Unreachable today, because a voyage is only offered for a playable
       * programme, and correct the day one is not. */
      say: `Go out to the harbor and sail to ${shownName(next.programmeId, next.name)}.`,
      away: `Get in the boat and sail to ${shownName(next.programmeId, next.name)}.`,
    }
  }

  /* THE YEAR CAN CLOSE, AND THE COUNSELOR IS WHO CLOSES IT. BRIEF-YEAR-ONE
   * beat 8: she drapes the first cord and turns the page. The Maw's own python
   * opens the yearbook when she is pressed with Advisory done and the page not
   * yet turned (islands/panther-maw/island.py), so she is the lit thing. This
   * pointed at the chart table and said "Press Open the yearbook", which is a
   * button inside a panel the student had not opened (STATE-OF-THE-GAME
   * confusing 9). */
  if (y.readyForYearbook && !y.yearbookSeen) {
    return {
      anchor: 'counselor', map: MAW_MAP, phase: 'yearbook',
      say: 'Talk to the counselor.',
      away: 'Go into the mountain and talk to the counselor.',
    }
  }

  /* THE THIRD VOYAGE STATE HAS NO CLAUSE ANY MORE, and the reason is worth
   * writing down rather than leaving as a gap.
   *
   * `rising` was reached when the year could not close: committed to a season
   * that will never sail, with a class still owed on the sheet. Since
   * BRIEF-MAW-RAIL the classes stopped gating the yearbook (`year.ts`), so a
   * stamped year with Advisory sat is ALWAYS closable, the clause above always
   * returns first, and everything under it became unreachable. Ten lines that
   * cannot run are worse than none: they read as a state the game still has.
   *
   * What that state was honest about is not lost. A season nobody could sail and
   * a class nobody sat are both named in the yearbook's own nudge line
   * (`nudgeLine`), which is where a student reads what became of the year, and
   * both are on the sheet under My Year the whole time. The `rising` phase stays
   * in the type: it is the walkthrough's name for the state and the day an
   * island can rise mid-year it is the clause that comes back.
   *
   * The line below is the fallback the compiler needs and nothing in a year
   * currently reaches. */
  return {
    anchor: 'chart_table', map: MAW_MAP, phase: 'done',
    say: 'Nothing left this year. Look around.',
    away: 'Nothing left this year. Look around.',
  }
}

/* is this anchor, on this map, the thing the player is currently being sent to */
export function isObjective(s: SaveGame | null, mapId: string, anchorName: string): boolean {
  const o = nextObjective(s)
  return !!o && o.map === mapId && o.anchor === anchorName
}
