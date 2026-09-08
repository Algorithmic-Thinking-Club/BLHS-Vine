/* the seven island states resolved for one student, joining the authored world to their run */
import { completedIn, type SaveGame, type Season } from '../save'
import { programmesAt, programmeAllowedIn, seasonOf, type Programme } from '../roster/roster'
import { distanceTo, type SlotState, type WorldPt, type WorldSlot } from './composition'

/* would a token still in this student's hand be accepted at this programme this year */
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

/* a season name in lower case, for the sentence a place says about being out of season */
const lower = (x: Season): string => x.toLowerCase()

/* a place is resting only when it keeps seasons and none of them is the one the run is in */
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
    case 'rumour': return 'It will be something Bonney Lake really offers.'
    case 'rising': return 'Opening now.'
    case 'misty': return 'Sail closer to see what this is.'
    case 'discovered': {
      if (!s) return 'You have sailed past here.'
      /* the resting sentence, which belongs only to a place where nothing runs right now */
      const shut = restingIn(slot, s)
      if (shut) {
        const own = seasonOf(shut)!
        return `${shut.name} is a ${lower(own)} sport. Come back in ${lower(own)}.`
      }
      const spent = tokenSpent(slot, s)
      if (spent) return `Your ${lower(seasonOf(spent)!)} season token is spent. ${spent.name} stays closed this year.`
      const here = programmesAt(slot.place)
      if (here.length && !here.some((p) => p.playable)) return 'Not open yet.'
      const ashore = (s.exposure ?? []).some((e) => e.place === slot.place && e.docked)
      return ashore ? 'You have been here.' : 'You have sailed past here.'
    }
    case 'available': {
      const open = s ? programmesAt(slot.place).filter((p) => affordable(p, s)) : []
      const locked = open.map((p) => seasonOf(p)).find((x): x is Season => !!x)
      return locked ? `You can sign up here with your ${lower(locked)} season token.` : 'You can sign up here with any season token.'
    }
    case 'active': return 'You started it.'
    case 'completed': return 'You finished everything here.'
  }
}

/* the dock: six objects in a fixed order, where the state is which of them are standing */
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

/* how much fog is left, in four stages, by how far the slot is from where the boat last moored */
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
    return bare(mark('fog', null, 'ch-s-fog', 'You have not found this place yet.', true), fogAt(slot, from))
  }
  if (st === 'rumour') {
    return bare(mark('pencil', null, 'ch-s-pencil', 'Nobody has built this place yet.', true))
  }
  if (st === 'rising') {
    /* named, because §9.18's whole beat is a student watching a place they had
     * only heard of become a place with a name on it */
    const d = bare(mark('rising', null, 'ch-s-rising', 'This place is opening now.', true))
    return { ...d, named: true }
  }

  /* the season coin, wearing its own season when that season is now and a ghost when it is not */
  const pipFace: [string, string] | null = season
    ? ['pip', inSeason ? lower(season) : 'ghost']
    : null

  const standing: Record<DockObject, DockDrawn> = {
    pin: mark('pin', ['pointer', 'pin_tail'], 'ch-s-pin', 'A real place you have seen.', true),
    pip: mark('pip', pipFace, inSeason ? 'ch-s-pip' : 'ch-s-pip-shut',
      season
        ? (inSeason
          ? `Something here runs in ${lower(season)}, and it is ${lower(season)} now.`
          : `Something here runs in ${lower(season)}, and it is not ${lower(season)} now.`)
        : 'Nothing here is locked to one season.',
      !!season),
    open: mark('open', ['icon_set', 'star'], 'ch-s-star', 'You can sign up here.', st === 'available'),
    flag: mark('flag', null, 'ch-s-flag', 'You started something here.', st === 'active'),
    stamp: mark('stamp', ['stamp', 'approved'], 'ch-s-stamp', 'You finished everything here.', st === 'completed'),
    ashore: mark('ashore', ['icon_set', 'tick'], 'ch-s-tick', 'You have been here.', ashore),
  }

  /* the row is built from DOCK_ORDER, so a marker stands in the same place on every island */
  return {
    state: st,
    slots: DOCK_ORDER.map((k) => standing[k]),
    instead: null, fog: 0, season, inSeason, closed, ashore, named: true,
  }
}

/* the tint, the bracketed word and the dimness each state's label is drawn in on the water */
export const STATE_INK: Record<SlotState, { tint: number; mark: string; dim: number }> = {
  rumour: { tint: 0x8a7a60, mark: '(not built yet)', dim: 0.35 },
  rising: { tint: 0xffd98a, mark: '(opening now)', dim: 1 },
  misty: { tint: 0x6d7f86, mark: '(you have not been here)', dim: 0.45 },
  discovered: { tint: 0xcbbb95, mark: '(you have been past)', dim: 0.8 },
  available: { tint: 0xe6d6a8, mark: '(you can sign up here)', dim: 1 },
  active: { tint: 0xffc861, mark: '(you started this)', dim: 1 },
  completed: { tint: 0x7fd0a6, mark: '(you finished this)', dim: 1 },
}
