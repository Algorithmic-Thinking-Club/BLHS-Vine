/* what Thor is wearing over the coat, and where the art for it lives */

import type { SaveGame } from './save'
import { ranksOf } from './progress'
import { programmeById } from './roster/roster'

/* ---- ASH GAVE THE WORD FOR THE ART, 2026-09-09 ---------------------------
 *
 * The letterman jacket, the goggles and the graduation cap sat in the wardrobe
 * for weeks as cards that said "Earned" and did nothing, because there was no
 * art, no save field and no equip path. This is the other three.
 *
 * ONE SLOT, NOT THREE, and that falls out of how the art is made rather than out
 * of taste. PixelLab's `create-character-state` edits ALL EIGHT ROTATIONS of one
 * character in a single job, snapping to the source palette so the face cannot
 * drift (`docs/MAPVIS-ASSETS.md`). What comes back is a whole Thor wearing the
 * thing, not a jacket on a transparent background. So a jacket and a cap cannot
 * be layered: they would be two different whole-Thors. He wears one.
 *
 * WHY NOT AN OVERLAY LAYER, which would stack. A cap composited at a measured
 * head anchor would work for a cap and would not work for a jacket, whose torso
 * deforms across six walk frames; and an overlay drawn separately comes back in
 * its own palette and outline, which is the exact failure `create-character-state`
 * exists to prevent. Two mechanisms for one wardrobe is worse than one slot.
 *
 * THE COAT STILL APPLIES ON TOP. `thorLook`'s hue rotation targets the shirt's
 * own colour band, so it recolours whatever is in that band and leaves the rest.
 * A student picks a coat and an outfit and gets both.
 */

export type Wear = {
  id: string
  /** what a student reads on the card */
  name: string
  /** the sentence that says how it is earned, in the second person */
  earn: string
  /** has this run earned it */
  has: (s: SaveGame | null) => boolean
  /* ---- HAS ANYBODY DRAWN IT ------------------------------------------
   *
   * A flag in code rather than a manifest fetched at runtime: it is one line
   * per outfit, it is obvious in a diff, and `thorWear.test.ts` fails if a set
   * marked drawn has no folder under `public/art/characters/thor/wear/`.
   *
   * FALSE ON ALL THREE TODAY. Ash gave the word for the spend on 2026-09-09 and
   * PixelLab's own server was not reachable in that session, so the path below
   * is built and the pixels are owed. Everything degrades to the bare panther
   * until a folder lands; nothing here breaks while they are missing. */
  drawn: boolean
}

/** the bare panther, which is not an outfit and is what "nothing" means */
export const BARE = 'none'

const earnByCompleting = (id: string): string => {
  const g = programmeById(id)
  return g ? `complete the ${g.name} island` : 'complete its island'
}

export const WEAR: Wear[] = [
  {
    id: 'letterman',
    name: 'Letterman jacket',
    earn: 'reach Varsity in any sport',
    has: (s) => !!s && Object.values(ranksOf(s)).some((y) => Number(y) >= 2),
    drawn: false,
  },
  {
    id: 'goggles',
    name: 'Robotics goggles',
    earn: earnByCompleting('robotics'),
    has: (s) => !!programmeById('robotics') && s?.islands?.robotics === 'completed',
    drawn: false,
  },
  {
    id: 'cap',
    name: 'Graduation cap',
    earn: 'finish all four years',
    has: (s) => !!s?.graduated,
    drawn: false,
  },
]

export const wearById = (id: string | undefined | null): Wear | undefined =>
  WEAR.find((w) => w.id === id)

/** can this run actually put this on: earned, and somebody has drawn it */
export const canWear = (s: SaveGame | null, id: string): boolean => {
  const w = wearById(id)
  return !!w && w.drawn && w.has(s)
}

/**
 * The folder the walk frames come out of.
 *
 * The bare panther keeps the path he has always had, so nothing about the base
 * character moves; an outfit mirrors that shape one level deeper. A set that has
 * not been drawn answers with the base, which is what makes every caller safe
 * before the art exists.
 */
export function walkFrame(s: SaveGame | null, dir: string, frame: number): string {
  const id = s?.thorWear
  return canWear(s, id ?? '')
    ? `/art/characters/thor/wear/${id}/walk/${dir}/${frame}.png`
    : `/art/characters/thor/walk/${dir}/${frame}.png`
}

/** the same question for a held pose (`sit`, `lie`) */
export function poseFrame(s: SaveGame | null, file: string): string {
  const id = s?.thorWear
  return canWear(s, id ?? '')
    ? `/art/characters/thor/wear/${id}/pose/${file}.png`
    : `/art/characters/thor/pose/${file}.png`
}

/** what the world is drawing right now, as one string a scene can compare against */
export const wornKey = (s: SaveGame | null): string =>
  `${canWear(s, s?.thorWear ?? '') ? s?.thorWear : BARE}:${s?.thorLook ?? 'classic'}`
