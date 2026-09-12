/* what Thor is wearing over the coat, and where the art for it lives */

import type { SaveGame } from './save'
import { ranksOf } from './progress'

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
   * TRUE ON ALL THREE since 2026-09-12: one `create-character-state` per outfit
   * off Thor's own character, all eight rotations in the one job and snapped to
   * his palette, then the `walking` template the bare panther already walks on
   * so the cadence matches when a student changes clothes mid-run. */
  drawn: boolean
  /* ---- AND HAS ANYBODY DRAWN IT SITTING DOWN --------------------------
   *
   * Separate from `drawn`, because the walk is what the game spends its time
   * looking at and a pose is two pictures the player may never see. A held pose
   * costs a whole state edit of its own per outfit, which is the same price
   * again for `sit` and `lie`, and today the only thing that poses Thor is the
   * beach opening in year one, before a jacket, goggles or a cap can exist.
   *
   * So an outfit with no poses drawn sits down as the bare panther rather than
   * not sitting down at all, and the day somebody wants the jacket in a chair
   * this is the one line that changes. */
  posed: boolean
}

/** the bare panther, which is not an outfit and is what "nothing" means */
export const BARE = 'none'

export const WEAR: Wear[] = [
  {
    id: 'letterman',
    name: 'Letterman jacket',
    earn: 'reach Varsity in any sport',
    has: (s) => !!s && Object.values(ranksOf(s)).some((y) => Number(y) >= 2),
    drawn: true,
    posed: false,
  },
  {
    id: 'goggles',
    /* ---- IT WAS GATED ON A PROGRAMME THAT DOES NOT EXIST ---------------
     *
     * `s.islands.robotics === 'completed'` and `programmeById('robotics')`,
     * and the roster has no `robotics` in it: the ids are `atc`, `football`,
     * `girls-flag-football`, `track-field` and `key-club`. So the card could
     * never be earned by anybody, and because `earnByCompleting` found no
     * programme to name, it read "complete its island" without saying which.
     * `wear-proof.mjs` is the gate that caught it.
     *
     * The other two are milestones rather than one named programme (Varsity in
     * ANY sport, finishing ALL four years), so this is now the same shape and
     * the earliest of the three: a student who finishes one island has one.
     * It stays true as ATC ships more of them, which a hardcoded id never was. */
    name: 'Safety goggles',
    earn: 'complete any island',
    has: (s) => Object.values(s?.islands ?? {}).some((v) => v === 'completed'),
    drawn: true,
    posed: false,
  },
  {
    id: 'cap',
    name: 'Graduation cap',
    earn: 'finish all four years',
    has: (s) => !!s?.graduated,
    drawn: true,
    posed: false,
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
  return canWear(s, id ?? '') ? walkFrameOf(id, dir, frame) : walkFrameOf(BARE, dir, frame)
}

/**
 * The same path from an outfit id alone.
 *
 * The mirror needs this: it holds the pick the student is looking at, which is
 * not always the pick in the save yet, and asking `walkFrame` would draw the
 * coat he is standing there deciding to take off.
 */
export const walkFrameOf = (id: string | null | undefined, dir: string, frame: number): string =>
  id && id !== BARE && wearById(id)?.drawn
    ? `/art/characters/thor/wear/${id}/walk/${dir}/${frame}.png`
    : `/art/characters/thor/walk/${dir}/${frame}.png`

/** the same question for a held pose (`sit`, `lie`) */
export function poseFrame(s: SaveGame | null, file: string): string {
  const id = s?.thorWear
  /* the outfit only answers here if somebody drew it sitting down. Everything
   * else falls back to the bare panther, which is a picture that exists. */
  return canWear(s, id ?? '') && wearById(id ?? '')?.posed
    ? `/art/characters/thor/wear/${id}/pose/${file}.png`
    : `/art/characters/thor/pose/${file}.png`
}

/** what the world is drawing right now, as one string a scene can compare against */
export const wornKey = (s: SaveGame | null): string =>
  `${canWear(s, s?.thorWear ?? '') ? s?.thorWear : BARE}:${s?.thorLook ?? 'classic'}`
