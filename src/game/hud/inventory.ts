/* EVERY ELEMENT ON THE PLAY SCREEN, AND WHAT THE RUN HAS TO CONTAIN FOR IT.
 *
 * Part IV §40.2 states the law this file exists to enforce:
 *
 *   "The HUD assembles as the game grants things. It is not fully present from
 *    the first frame with half of it inert... a control that exists before the
 *    thing it controls is a prototype tell."
 *
 * And it names the failure by line: "Today the compass and the Handbook button
 * are rendered unconditionally the moment a world scene mounts, and only the
 * token pips are gated on anything." That was still true this morning. A student
 * in the first minute had a Handbook spine two sections before §4.10 hands them
 * the binder, and pressing it opened a book whose Islands page said the sea is
 * young and whose Cords page said there is no voyage yet.
 *
 * TWO OF PART IV'S WANTS ARE ONE FILE. §40.2 asks for "one place that lists every
 * HUD element and its unlock condition"; §40.6 asks for "the absence list
 * enforced somewhere a new element has to pass". Both are this table plus the
 * test beside it, and the test is the half that matters: a new element added
 * without a grant condition fails the build, so this screen cannot quietly rot
 * back into a dashboard after the session that built it ends.
 *
 * WHY IT IS A PURE FUNCTION OF THE SAVE. There were two mounts of the HUD with
 * two different gates: `WorldHud.tsx` behind `s?.introDone`, and `IntroScene.tsx`
 * behind nothing at all, which is how the compass got onto the beach. Two gates
 * is two answers to one question. There is one answer now and both mounts read
 * it.
 */
import type { SaveGame } from '../save'
import { cordsOf } from '../progress'

/* every element that can ever be in the corner. Adding one here is what makes the
 * test demand a condition for it, which is the point. */
export type HudElement = 'chart' | 'handbook' | 'tokens' | 'cape'

export type HudGrants = Record<HudElement, boolean>

/* THE FLAGS THAT DO THE GRANTING, named here rather than typed as strings at
 * three call sites. §4.10 is the moment the binder is handed over in the Maw and
 * `handbook_granted` is the event it fires; the flag is what a save remembers
 * about it afterwards. */
export const CHART_FLAG = 'chart:granted'
export const HANDBOOK_FLAG = 'handbook:granted'

/* ---- THE TABLE ------------------------------------------------------------
 *
 * One row per element, in the order it appears in the corner, each with the
 * condition in words and the condition as code beside it so the two cannot
 * drift. `why` is not decoration: §40.2's Deployment line requires an entrance to
 * name the new thing in the world's own words, once, at the moment it arrives,
 * "because the teacher is not going to be free".
 */
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
    says: 'The chart hangs on your rail now. It shows every island you have found.',
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
    /* THE ONE TENSION IN THIS TABLE, NAMED RATHER THAN DECIDED QUIETLY. §40.17
     * calls the Handbook "the deployment-critical panel", the reference a student
     * opens when they are lost and the teacher is busy, and §40.2's law gates it
     * behind a beat that happens minutes in. Both are right and they disagree.
     *
     * The law holds, because what a lost student in minute one actually needs is
     * the heading sentence and it is on screen from the first arrival. A Handbook
     * is a reference, not a rescue. If that turns out to be wrong in a real room
     * it is one line here, and this comment is why it is written down rather than
     * argued about in a review. */
    has: (s) => s.flags.includes(HANDBOOK_FLAG),
  },
  {
    el: 'tokens',
    says: 'Three seasons. Spend them at the chart table.',
    rule: 'the binder and the year\'s three tokens are handed over in one moment (§4.10)',
    /* NOT PERMANENT, and this answers Q40.2.a. §15.2: "In Gear 2 the token pips
     * leave the HUD entirely, because scarcity is over." A graduate has no year
     * left to plan, so the readout of an empty year would be furniture. */
    permanent: false,
    has: (s) => !s.graduated && s.flags.includes(HANDBOOK_FLAG),
  },
  {
    el: 'cape',
    says: 'A cord has started. The cape is on its hook.',
    rule: 'the first cord in progress puts the cape within reach (§40.2)',
    permanent: true,
    /* THE FOURTH ELEMENT THE LAW IMPLIES AND NO SECTION ENUMERATES. §40.2 names
     * the trigger in words and then never lists the thing it triggers, so naming
     * it here is part of closing the Want. Nothing mounts it yet; the row exists
     * so that whoever does cannot invent a different condition. */
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

/* WHAT IS ON THE PLAY SCREEN AT ALL, which is the absence list §40.6 asks to have
 * enforced. Everything NOT in this list is a thing that must not float: no GPA
 * bar, no XP bar, no quest log, no minimap, no leaderboard, each with a diegetic
 * replacement named in that section. The test beside this file renders the screen
 * at four run states and asserts the always-on set is exactly this. */
export const ALWAYS_ON = [
  /* the corner, and only what has been granted */
  'chart', 'handbook', 'tokens', 'cape',
  /* the world's own marks, which are not DOM and are not in the corner */
  'prompt', 'objective-mark', 'you-pin',
  /* the three surfaces that speak, none of which is furniture: each is present
   * only while it has something to say */
  'dialogue', 'place-card', 'heading',
  /* ---- AND THE ONE PERMITTED FLOATING THING THAT IS NOT STATE -------------
   *
   * The question mark. Everything else on this list is either a control the run
   * has granted or a surface with something to say right now, and that is the
   * whole of §40.6's law: nothing floats that is not state.
   *
   * This is the exception the brief names, and it names the reason with it: "the
   * one exception to §40.2's assembly rule because it exists for the student who
   * has earned nothing yet... A teacher's whole answer to 'I don't know what to
   * do' is 'press the question mark'."
   *
   * It survives the law's own test because it is not a READOUT. §40.6 forbids a
   * GPA bar, an XP bar, a quest log, a minimap and a leaderboard, and every one
   * of those is the game telling you a number about yourself while you play. This
   * tells you nothing until you press it, costs one plaque of corner, and is the
   * only thing on the screen that works when the run has given the student
   * nothing at all. */
  'help',
] as const
