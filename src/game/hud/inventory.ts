/* every element that can appear on the play screen, and what the run must contain for it */
import type { SaveGame } from '../save'
import { cordsOf } from '../progress'

/* every element that can ever be in the corner. Adding one here is what makes the
 * test demand a condition for it, which is the point. */
export type HudElement = 'chart' | 'handbook' | 'tokens' | 'cape'

export type HudGrants = Record<HudElement, boolean>

/* the save flags that do the granting, named once instead of typed at three call sites */
export const CHART_FLAG = 'chart:granted'
export const HANDBOOK_FLAG = 'handbook:granted'

/* one row per element, with the condition in words beside the condition as code */
export type HudRow = {
  el: HudElement
  /** what a person reads when it arrives */
  says: string
  /** the condition, in the document's own words */
  rule: string
  /** whether it can ever leave once granted (Q40.2.a) */
  permanent: boolean
  has: (s: SaveGame) => boolean
}

export const HUD_INVENTORY: HudRow[] = [
  {
    el: 'chart',
    says: 'You have the Chart now. It shows every island you have found.',
    rule: 'the first island discovered makes the chart worth opening (§40.2)',
    permanent: true,
    /* §2.6's bottle unfurls a chart, which is earlier than the first discovery,
     * so the flag is the earlier of the two grants and discovery is the fallback
     * for a run that got there another way */
    has: (s) => s.flags.includes(CHART_FLAG) || Object.keys(s.islands ?? {}).length > 0
      || (s.exposure ?? []).length > 0,
  },
  {
    el: 'handbook',
    says: 'The Handbook is yours. Everything the school has told you is in it.',
    rule: '§4.10 hands the binder over in the Maw',
    permanent: true,
    /* a reference rather than a rescue, so it waits for the binder; the objective panel is the rescue */
    has: (s) => s.flags.includes(HANDBOOK_FLAG),
  },
  {
    el: 'tokens',
    says: 'Your year sheet. Pick your classes and what you join.',
    rule: 'the binder and the year\'s three tokens are handed over in one moment (§4.10)',
    /* NOT PERMANENT, and this answers Q40.2.a. §15.2: "In Gear 2 the token pips
     * leave the HUD entirely, because scarcity is over." A graduate has no year
     * left to plan, so the readout of an empty year would be furniture. */
    permanent: false,
    has: (s) => !s.graduated && s.flags.includes(HANDBOOK_FLAG),
  },
  {
    el: 'cape',
    says: 'You started your first cord. It shows on your cape.',
    rule: 'the first cord in progress puts the cape within reach (§40.2)',
    permanent: true,
    /* nothing mounts the cape yet, and the row is here so whoever does uses this condition */
    has: (s) => cordsOf(s).some((c) => c.progress > 0),
  },
]

/* THE ONE ANSWER BOTH MOUNTS READ. Pure, so it costs a function call, and total,
 * so a new element cannot be forgotten: the record type makes TypeScript demand a
 * row for every member of `HudElement`. */
export function hudGrants(s: SaveGame | null): HudGrants {
  const out = { chart: false, handbook: false, tokens: false, cape: false } as HudGrants
  if (!s) return out
  for (const row of HUD_INVENTORY) out[row.el] = row.has(s)
  return out
}

/* the whole list of what may be on the play screen, and anything not here must not float */
export const ALWAYS_ON = [
  /* the corner, and only what has been granted */
  'chart', 'handbook', 'tokens', 'cape',
  /* the world's own marks, which are not DOM and are not in the corner */
  'prompt', 'objective-mark', 'you-pin',
  /* the two surfaces that speak, neither of which is furniture: each is present
   * only while it has something to say */
  'dialogue', 'place-card',
  /* the game's one instruction, top centre, and the thing there is instead of a quest log */
  'objective',
  /* the question mark, which tells you nothing until you press it and works from the first frame */
  'help',
  /* the two black bars, which draw nothing until an island asks for a cutscene */
  'movie-bars',
  /* THE CROSSING'S OWN SKIP (Ash, 2026-09-08 item 3), top left, and present only
   * while a voyage is actually running. It is the same justification the movie
   * bars have: it is not a readout of anything, it is the offer the game is
   * making at that moment, and there is no other way to make it. A student who
   * has watched the boat once is allowed to say so. */
  'skip-voyage',
  /* THE CAMERA SWITCH (Ash, 2026-09-09), top right, which is the only thing in
   * that corner. It is not a readout of anything: it is the one choice a student
   * has about how the world is framed, and there is nowhere else to put it that
   * he would find. */
  'camera-view',
] as const
