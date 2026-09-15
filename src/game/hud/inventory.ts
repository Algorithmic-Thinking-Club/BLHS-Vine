/* every element that can appear on the play screen, and what the run must contain for it */
import type { SaveGame } from '../save'
import { cordsOf } from '../progress'

/* every element that can ever be in the corner, and adding one here is what makes the test demand a condition for it */
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
    /* the flag is the earlier grant and discovery is the fallback; never test `(s.exposure ?? []).length > 0`, because `PmapScene` writes an exposure row for the map being stood on, so arriving at the hub granted the map sign before the handover could give it */
    has: (s) => s.flags.includes(CHART_FLAG) || Object.keys(s.islands ?? {}).length > 0,
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
    /* not permanent: the token pips leave the HUD in gear 2 because a graduate has no year left to plan and an empty year would be furniture */
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

/* the one answer both mounts read: pure so it costs a function call, and total so the record type makes TypeScript demand a row for every member of `HudElement` */
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
  /* the two surfaces that speak, each present only while it has something to say */
  'dialogue', 'place-card',
  /* the game's one instruction, top centre, and the thing there is instead of a quest log */
  'objective',
  /* the question mark, which tells you nothing until you press it and works from the first frame */
  'help',
  /* the two black bars, which draw nothing until an island asks for a cutscene */
  'movie-bars',
  /* the crossing's own skip, top left and present only while a voyage runs: not a readout but the offer the game is making at that moment, and there is no other way to make it */
  'skip-voyage',
  /* the camera switch, top right and alone in that corner: not a readout but the one choice a student has about how the world is framed, and there is nowhere else it would be found */
  'camera-view',
  /* island finished and head back, bottom centre and present only when an island has nothing left to ask for: it announces the absence of remaining work, which nothing in the world can announce, and it stands down for the dialogue box it shares the strip with */
  'head-back',
] as const
