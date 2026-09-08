// tells a real offering from a placeholder: a thing is real when a playable island stands behind it
import { programmeById } from './roster'
import { EXAMPLE_BLURB, NO_ISLAND_YET, exampleLabel } from './example'

/* the words themselves live in `example.ts`, which imports nothing, so the
 * roster can mask its own entries with them without importing this file back */
export { EXAMPLE_BLURB, NO_ISLAND_YET, exampleLabel }

/** is there a playable island behind this programme id */
export const programmeIsReal = (id: string): boolean => programmeById(id)?.playable === true

/** is there a playable island behind this class id, asked of the same table */
export const classIsReal = (id: string): boolean => programmeIsReal(id)

// the Example letters are read off the roster's own mask rather than counted again here

/** the placeholder name for an id, or null when a real island stands behind it */
export const exampleNameOf = (id: string): string | null => {
  const p = programmeById(id)
  return p && !p.playable ? p.name : null
}

/** what to print for an id: the placeholder letter when there is one, otherwise the real name */
export const shownName = (id: string, real: string): string => exampleNameOf(id) ?? real
