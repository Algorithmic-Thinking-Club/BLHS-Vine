/* what Thor is wearing over the coat, and where the art for it lives */

import type { SaveGame } from './save'
import { ranksOf } from './progress'

/* one wardrobe slot, not three: `create-character-state` returns a whole Thor wearing the thing, all eight rotations in one job snapped to the source palette, so outfits cannot be layered and an overlay would drift palette and deform across six walk frames; the coat hue rotation still applies on top */

export type Wear = {
  id: string
  /** what a student reads on the card */
  name: string
  /** the sentence that says how it is earned, in the second person */
  earn: string
  /** has this run earned it */
  has: (s: SaveGame | null) => boolean
  /* a flag in code rather than a manifest fetched at runtime, one line per outfit, and `thorWear.test.ts` fails if a set marked drawn has no folder under `public/art/characters/thor/wear/` */
  drawn: boolean
  /* separate from `drawn` because a held pose costs a whole state edit per outfit, and again for `sit` and `lie`, so an outfit with none drawn sits down as the bare panther rather than not sitting down at all */
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
    /* gating this on a hardcoded `robotics` id made it unearnable by anybody, because the roster ids are `atc`, `football`, `girls-flag-football`, `track-field` and `key-club`, so it asks for any completed island and stays true as more ship */
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

/** the folder the walk frames come out of, where a set nobody has drawn answers with the bare panther path so every caller is safe before the art exists */
export function walkFrame(s: SaveGame | null, dir: string, frame: number): string {
  const id = s?.thorWear
  return canWear(s, id ?? '') ? walkFrameOf(id, dir, frame) : walkFrameOf(BARE, dir, frame)
}

/** the same path from an outfit id alone: the mirror holds the pick being looked at, which is not always the pick in the save yet, so asking `walkFrame` would draw the coat being taken off */
export const walkFrameOf = (id: string | null | undefined, dir: string, frame: number): string =>
  id && id !== BARE && wearById(id)?.drawn
    ? `/art/characters/thor/wear/${id}/walk/${dir}/${frame}.png`
    : `/art/characters/thor/walk/${dir}/${frame}.png`

/** the same question for a held pose (`sit`, `lie`) */
export function poseFrame(s: SaveGame | null, file: string): string {
  const id = s?.thorWear
  /* the outfit only answers here if somebody drew it sitting down, everything else falls back to the bare panther, which is a picture that exists */
  return canWear(s, id ?? '') && wearById(id ?? '')?.posed
    ? `/art/characters/thor/wear/${id}/pose/${file}.png`
    : `/art/characters/thor/pose/${file}.png`
}

/** what the world is drawing right now, as one string a scene can compare against */
export const wornKey = (s: SaveGame | null): string =>
  `${canWear(s, s?.thorWear ?? '') ? s?.thorWear : BARE}:${s?.thorLook ?? 'classic'}`
