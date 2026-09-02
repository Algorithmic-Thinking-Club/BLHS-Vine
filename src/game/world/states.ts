/* THE SEVEN STATES, RESOLVED FOR ONE STUDENT, AND SAID AS OBJECTS ON A DOCK.
 *
 * The composition says a slot's AUTHORED state, which is the world's own answer
 * and is the same for everybody: a rumour is a rumour on every Chromebook in the
 * room. What a particular student has done with a place is the run's, and this
 * file is the one join between them.
 *
 * §80.6's own boundary, stated the other way round: THE ROSTER IS WHAT EXISTS,
 * THE COMPOSITION IS WHERE IT IS, AND THE RUN IS WHAT THIS STUDENT DID WITH IT.
 * Nothing here writes. G6's rule is that availability and in-season are computed
 * per draw and never stored, and that is why this is a function rather than a
 * field: a stored state is a state that can disagree with the ledger.
 *
 * WHY IT IS NOT IN `composition.ts`. That file must stay readable by world code
 * that has no business importing a save. The test §80.2 sets for the boundary is
 * that no island id and no programme id appears anywhere in world code, and the
 * split is what keeps it true: the world asks this file for a colour and never
 * learns that a place holds three programmes in three seasons.
 *
 * ---- WHAT CHANGED ON 2026-09-01, AND WHY IT IS THE WHOLE POINT ----
 *
 * §9.17 states the law this file exists to serve, verbatim: *"Every island state
 * is legible at a glance, at sailing distance, on a Chromebook screen, and is
 * distinguished from every other state by which objects are present at the
 * dock."* And the sentence after it is the one that had never been obeyed
 * anywhere in the tree: *"the discriminator is a thing present or absent at a
 * known place, not a change of appearance on a thing that is always there."*
 *
 * What was here was `STATE_INK`, a table of seven CHARACTERS: `?`, `*`, `~`, a
 * middle dot, a hollow circle, a triangle and a tick. Two things were wrong with
 * it and only one of them is the obvious one. `docs/ART.md` forbids the
 * characters outright: *"Icons are drawn, never an emoji or a font glyph."* The
 * deeper one is that seven marks in one place, each a different SHAPE OF THE
 * SAME OBJECT, is exactly the design §9.17 refuses: a student sailing past has
 * to recognise a symbol rather than notice whether a thing is there.
 *
 * So a dock is a ROW OF FIXED SLOTS and a state is which of them are occupied.
 * The slots never move and never change what they are, so "is the star there"
 * is a question a student answers without hovering, without colour, and without
 * having learned a legend. `dockOf` is the whole of it and the chart draws
 * exactly what it returns.
 *
 * AND AVAILABLE IS A TOKEN QUESTION, WHICH IT WAS NOT. §9.17 point 3: *"the
 * player holds an unspent token that this island would accept ... a function of
 * `save.tokens`, the island's season lock in SPORT_SEASONS, and whether the
 * island is already completed."* What was here asked `programmeAllowedIn(p,
 * s.season)`, which is the run's CURRENT season and says nothing about whether
 * the token for it is still in the student's hand. `save.tokens` had no reader
 * on this path at all, so the scarcity Wiseman's four-year model exists to
 * produce was invisible on the one surface §9.13 puts it on.
 */
import { completedIn, type SaveGame, type Season } from '../save'
import { programmesAt, programmeAllowedIn, seasonOf, type Programme } from '../roster/roster'
import { distanceTo, type SlotState, type WorldPt, type WorldSlot } from './composition'

/* ---- what a student can spend today ---------------------------------------
 *
 * One programme, one question: would a token still in this student's hand be
 * accepted here this year. A club takes any season, so it is affordable while
 * any token is unspent; a sport takes its own season out of `SPORT_SEASONS`, so
 * football stops being affordable the moment the Fall token goes somewhere else,
 * which is the mechanic and is the thing being taught. */
export function affordable(p: Programme, s: SaveGame): boolean {
  if (!p.playable) return false
  /* finishing it THIS YEAR closes it for this year and not for the run: a rank
   * ladder is the same programme slotted three years running, so a completion in
   * year 1 must not delete the offer in year 2 */
  if (completedIn(s, p.id, s.year)) return false
  return s.tokens.some((t) => programmeAllowedIn(p, t))
}

/** what a student sees this slot as, right now */
export function stateOf(slot: WorldSlot, s: SaveGame | null): SlotState {
  /* AUTHORED STATES WIN AND ARE NOT NEGOTIABLE. A slot with no map is a rumour
   * no matter what a save says, because there is nothing to have completed, and
   * `rising` is the world's own moment rather than a student's. */
  if (!slot.map) return 'rumour'
  if (slot.state === 'rising') return 'rising'
  if (!s) return 'misty'

  /* SEEN IS A FACT ABOUT A PLACE, which is what the exposure record is for and
   * why discovery fires once when a student sails past a stadium rather than
   * three times. */
  const seen = (s.exposure ?? []).some((e) => e.place === slot.place)
  if (!seen) return 'misty'

  const here = programmesAt(slot.place)
  if (!here.length) return 'discovered'

  /* COMPLETION IS PER PROGRAMME PER YEAR, off the append-only record, so a
   * ladder that re-slots the same programme three years running does not have to
   * erase its own history to say what colour it is. */
  const done = here.filter((p) => (s.completions ?? []).some((c) => c.programme === p.id))
  if (done.length === here.length) return 'completed'
  if (here.some((p) => s.islands[p.id] === 'active')) return 'active'
  /* AVAILABLE MEANS A TOKEN THIS STUDENT STILL HOLDS WOULD BE TAKEN HERE, which
   * is §9.17's own definition and is a year question rather than a today
   * question: the Fall token buys a fall sport whenever it is spent. */
  if (here.some((p) => affordable(p, s))) return 'available'
  return 'discovered'
}

/* ---- the season a place keeps, in the school's own words -------------------
 *
 * §9.17 state 6: *"it must never read as broken or as an error ... the
 * explanation is in the school's own words"*, and §9.13 says the source is
 * `SPORT_SEASONS` so the answer is always the real one. `seasonOf` reads that
 * table, so nothing here knows the name of a sport or the shape of a year.
 *
 * The sentence is `GAME-DESIGN.md` §6.4's own draft, kept word for word because
 * it is already right: *"Football is a fall sport. Come back in fall."* */
const lower = (x: Season): string => x.toLowerCase()

/* RESTING IS A FACT ABOUT THE PLACE AND NOT ABOUT ONE PROGRAMME, which is the
 * correction §9.17 makes in its own words: *"Football is out of season and flag
 * football is not, at the same island, on the same afternoon."* The stadium
 * holds a fall sport, a winter sport and a spring sport, so the stadium is never
 * shut, and a chart that said "come back in fall" over it in January would be
 * teaching a student something false about their own school. A place is resting
 * only when it keeps seasons AND none of them is the one the run is in. */
function restingIn(slot: WorldSlot, s: SaveGame): Programme | null {
  const locked = programmesAt(slot.place).filter((p) => !!seasonOf(p))
  if (!locked.length) return null
  if (locked.some((p) => seasonOf(p) === s.season)) return null
  return locked[0]
}

/** a programme this place runs that a spent token has put out of reach this year */
function tokenSpent(slot: WorldSlot, s: SaveGame): Programme | null {
  for (const p of programmesAt(slot.place)) {
    if (!p.playable || affordable(p, s)) continue
    if (completedIn(s, p.id, s.year)) continue
    if (seasonOf(p)) return p
  }
  return null
}

/** the season this place keeps, preferring the one the run is in when it keeps
 *  more than one, because a shared field open all year has to read as open */
export function seasonAt(slot: WorldSlot, now?: Season | null): Season | null {
  const locked = programmesAt(slot.place)
    .map((p) => seasonOf(p))
    .filter((x): x is Season => !!x)
  if (!locked.length) return null
  if (now && locked.includes(now)) return now
  return locked[0]
}

/** what the chart writes beside a slot, in the register that state deserves */
export function stateLine(st: SlotState, slot: WorldSlot, s: SaveGame | null): string {
  switch (st) {
    case 'rumour': return 'somebody mentioned it'
    case 'rising': return 'rising now'
    case 'misty': return 'not been'
    case 'discovered': {
      if (!s) return 'been past'
      /* RESTING IS A SENTENCE ABOUT A PLACE, and a place could not say it before
       * the roster split. Football is out of season and flag football is not, at
       * the same island, on the same afternoon, so the sentence only belongs to a
       * place where nothing at all runs right now. */
      const shut = restingIn(slot, s)
      if (shut) {
        const own = seasonOf(shut)!
        return `${shut.name} is a ${lower(own)} sport. Come back in ${lower(own)}.`
      }
      const spent = tokenSpent(slot, s)
      if (spent) return `Your ${lower(seasonOf(spent)!)} token is spent, so ${spent.name} waits for next year.`
      const here = programmesAt(slot.place)
      if (here.length && !here.some((p) => p.playable)) return 'still rising'
      const ashore = (s.exposure ?? []).some((e) => e.place === slot.place && e.docked)
      return ashore ? 'been ashore' : 'been past'
    }
    case 'available': {
      const open = s ? programmesAt(slot.place).filter((p) => affordable(p, s)) : []
      const locked = open.map((p) => seasonOf(p)).find((x): x is Season => !!x)
      return locked ? `open on your ${lower(locked)} token` : 'open this season'
    }
    case 'active': return 'your flag is on it'
    case 'completed': return 'done'
  }
}

/* ---- THE DOCK, AS A ROW OF SLOTS THAT ARE OCCUPIED OR EMPTY ----------------
 *
 * Six standing places, always in this order, always all six drawn. A state is
 * WHICH ONES HOLD SOMETHING, so an empty slot is as much of a reading as a full
 * one and nothing has to change appearance to say anything.
 *
 *   pin     this is a real place and you have laid eyes on it
 *   pip     the season it keeps, and whether that season is the one you are in
 *   open    a token you still hold would be taken here
 *   flag    yours: a season on your sheet is committed to this place
 *   stamp   everything this place offers is finished
 *   ashore  you have been off the boat, which the exposure record knows and
 *           nothing had ever drawn (§9.15 asks for seen and entered to be told
 *           apart on the chart and in the log; this is the chart half)
 *
 * THE FACES ARE THE PLATFORM'S OWN AND THE SHAPES ARE WHAT SHIPS TODAY.
 * `faceStyle` hands back nothing unless the kit is worn, so every object names
 * both: the cut face MAPVIS drew, and a class the chart draws it as out of the
 * token layer. Neither is ever a character.
 *
 * THREE OBJECTS HAVE NO DRAWN FACE AND ARE REPORTED RATHER THAN FAKED. Nobody
 * has drawn a pennant, a fog bank or the water breaking over a rising island,
 * and `icon_set` publishes compass, key, star, lock, tick, cross and coin, none
 * of which is any of those. A padlock in particular is the ONE thing state 6
 * must never wear: §9.17 says out of season *"must never read as broken or as an
 * error"*, and a padlock is the drawing of a refusal. So those three are token
 * shapes plus a word, and the gap is in the session's report.
 */
export type DockObject = 'pin' | 'pip' | 'open' | 'flag' | 'stamp' | 'ashore'

/** the order the six stand in, left to right, on every island in the game */
export const DOCK_ORDER: DockObject[] = ['pin', 'pip', 'open', 'flag', 'stamp', 'ashore']

export type DockDrawn = {
  kind: DockObject | 'fog' | 'pencil' | 'rising'
  /** the cut face it wears when the kit is worn, or null when nobody drew one */
  face: [piece: string, face: string] | null
  /** the class of the token drawing that stands in, and that is what ships today */
  shape: string
  /** what is standing there, in words, for a reader and for the register */
  word: string
  /** is it there at all */
  on: boolean
}

export type Dock = {
  state: SlotState
  /** the six, always all six, each present or absent */
  slots: DockDrawn[]
  /* WHAT STANDS INSTEAD OF A DOCK. Three states have no dock to read: misty has
   * not been found, a rumour has nothing built on it, and a rising island is
   * still arriving. Those get one mark and no row. */
  instead: DockDrawn | null
  /** how much fog is left over a misty slot: 3 far out, 0 nearly clear */
  fog: 0 | 1 | 2 | 3
  /** the season this place keeps, when it keeps one */
  season: Season | null
  /** is that season the one the run is in right now */
  inSeason: boolean
  /** the school's own sentence about a shut season, and never an error */
  closed: string | null
  /** has this student been off the boat here */
  ashore: boolean
  /** may the chart print this place's name yet */
  named: boolean
}

/* THE MIST THINS IN STAGES RATHER THAN SWITCHING, which is §9.14's own rule and
 * the reason it gives: *"a hard swap reads as a bug."* On the water the stage is
 * the hull's live distance. On the chart the only distance the run has actually
 * recorded is where the boat was last tied up, so that is what this measures,
 * and it is honest: an island you have moored two harbours away from is fainter
 * than one you have moored beside. Four stages over three discovery radii,
 * because a smudge that goes from nothing to a name in one frame is the swap. */
function fogAt(slot: WorldSlot, from: WorldPt | null): 0 | 1 | 2 | 3 {
  if (!from) return 3
  const reach = Math.max(1, slot.discover ?? slot.release / 2)
  const k = Math.max(0, distanceTo(slot, from)) / (reach * 3)
  return k >= 1 ? 3 : k >= 0.55 ? 2 : k >= 0.25 ? 1 : 0
}

const mark = (
  kind: DockDrawn['kind'], face: DockDrawn['face'], shape: string, word: string, on: boolean,
): DockDrawn => ({ kind, face, shape, word, on })

/** everything the chart draws for one slot, resolved off the run and nothing else */
export function dockOf(slot: WorldSlot, s: SaveGame | null, from: WorldPt | null = null): Dock {
  const st = stateOf(slot, s)
  const season = seasonAt(slot, s?.season ?? null)
  const inSeason = !!season && !!s && season === s.season
  const ashore = !!s && (s.exposure ?? []).some((e) => e.place === slot.place && e.docked)
  const shut = s ? restingIn(slot, s) : null
  const closed = shut
    ? `${shut.name} is a ${lower(seasonOf(shut)!)} sport. Come back in ${lower(seasonOf(shut)!)}.`
    : null

  const bare = (instead: DockDrawn | null, fog: 0 | 1 | 2 | 3 = 0): Dock => ({
    state: st, slots: [], instead, fog, season, inSeason, closed, ashore, named: false,
  })

  if (st === 'misty') {
    return bare(mark('fog', null, 'ch-s-fog', 'a bank of fog', true), fogAt(slot, from))
  }
  if (st === 'rumour') {
    return bare(mark('pencil', null, 'ch-s-pencil', 'a pencil ring', true))
  }
  if (st === 'rising') {
    /* named, because §9.18's whole beat is a student watching a place they had
     * only heard of become a place with a name on it */
    const d = bare(mark('rising', null, 'ch-s-rising', 'water breaking', true))
    return { ...d, named: true }
  }

  /* THE SEASON COIN. `pip` publishes fall, winter, spring, spent and ghost, so
   * the coin wears the season it belongs to when that season is now, and the
   * drawn empty socket when it is not. A place with no season keeps its slot
   * empty, which is itself the reading: nothing here is season locked. */
  const pipFace: [string, string] | null = season
    ? ['pip', inSeason ? lower(season) : 'ghost']
    : null

  const standing: Record<DockObject, DockDrawn> = {
    pin: mark('pin', ['pointer', 'pin_tail'], 'ch-s-pin', 'a marker', true),
    pip: mark('pip', pipFace, inSeason ? 'ch-s-pip' : 'ch-s-pip-shut',
      season ? (inSeason ? `a ${lower(season)} coin` : `a ${lower(season)} coin, resting`) : 'no season coin',
      !!season),
    open: mark('open', ['icon_set', 'star'], 'ch-s-star', 'a star', st === 'available'),
    flag: mark('flag', null, 'ch-s-flag', 'your flag', st === 'active'),
    stamp: mark('stamp', ['stamp', 'approved'], 'ch-s-stamp', 'the finished stamp', st === 'completed'),
    ashore: mark('ashore', ['icon_set', 'tick'], 'ch-s-tick', 'a landing tick', ashore),
  }

  /* THE ROW IS BUILT FROM `DOCK_ORDER` AND NOT FROM THE ORDER SOMEBODY TYPED.
   * §9.17's law only holds while a thing stands in the SAME place on every
   * island: a marker that moves is a marker a student has to find again, and at
   * sailing distance there is no time for that. One list, read here, so the
   * order cannot be edited in one branch and not the other. */
  return {
    state: st,
    slots: DOCK_ORDER.map((k) => standing[k]),
    instead: null, fog: 0, season, inSeason, closed, ashore, named: true,
  }
}

/* ---- THE INK EACH STATE IS DRAWN IN, ON THE WATER --------------------------
 *
 * This table is the WORLD's, not the chart's. `PmapScene` writes a slot's name
 * on the ocean in `ink.tint` at `ink.dim`, and the chart reads its own ink off
 * `chart.css` because a colour is only ever a colour against something: these
 * tints are chosen against a dark sea and `discovered`'s pale tan is the colour
 * of the paper the chart is drawn on.
 *
 * `mark` USED TO BE A CHARACTER AND IS NOW A WORD. `docs/ART.md` forbids a font
 * glyph as an icon and the seven that were here were seven icons typed as
 * characters. The right answer on the water is §9.17's own: a placement per
 * marker at the dock anchor, toggled by `show`, and that cannot be authored
 * until MAPVIS carries placement binding through publish. Until it does, the
 * world says the state in a word rather than in a symbol nobody was taught.
 *
 * The brackets are not decoration. `PmapScene` composes the label as
 * `${ink.mark} ${title}`, so an unbracketed "open" in front of a place name
 * reads as an instruction to open it. Bracketed, it reads as what it is: an
 * annotation on a chart. */
export const STATE_INK: Record<SlotState, { tint: number; mark: string; dim: number }> = {
  rumour: { tint: 0x8a7a60, mark: '(a rumour)', dim: 0.35 },
  rising: { tint: 0xffd98a, mark: '(rising)', dim: 1 },
  misty: { tint: 0x6d7f86, mark: '(not been)', dim: 0.45 },
  discovered: { tint: 0xcbbb95, mark: '(seen)', dim: 0.8 },
  available: { tint: 0xe6d6a8, mark: '(open)', dim: 1 },
  active: { tint: 0xffc861, mark: '(yours)', dim: 1 },
  completed: { tint: 0x7fd0a6, mark: '(done)', dim: 1 },
}
