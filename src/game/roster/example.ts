/* WHAT A PLACEHOLDER IS CALLED, AND WHAT IT SAYS ABOUT ITSELF.
 *
 * The vocabulary only. It imports nothing, which is the whole reason it is its
 * own file: `roster.ts` masks its own entries with these words, and
 * `placeholders.ts` reads the masked roster back, so the two cannot import each
 * other and the letters cannot be assigned in two places.
 *
 * Ash, 2026-09-06: *"If you want placeholders, label them Example A, Example B
 * and so on, with placeholder text, and it should clearly be a placeholder and
 * not work. But everything should already be wired up for when actual islands
 * come over."*
 */

/** what a placeholder says about itself, in one line, on every surface */
export const EXAMPLE_BLURB = 'An island a member has not built yet.'

/** where a placeholder's words came from, in the field every roster entry has */
export const EXAMPLE_SOURCE = 'a placeholder: no island stands behind this yet'

/** what a class with no island behind it says about itself, quietly */
export const NO_ISLAND_YET = 'no island yet'

/** A, B, ... Z, then AA. Past twenty-six is not a case anybody will meet, and
 *  answering it is cheaper than a comment saying it cannot happen. */
export function exampleLabel(n: number): string {
  let out = ''
  let i = n
  do { out = String.fromCharCode(65 + (i % 26)) + out; i = Math.floor(i / 26) - 1 } while (i >= 0)
  return `Example ${out}`
}

/** and a PLACE nobody can sail to yet. Same alphabet, its own word, because a
 *  place is not a thing you pick and calling it "Example A" beside a card also
 *  called Example A would be two different things wearing one name. */
export const examplePlace = (n: number): string => `Example place ${exampleLabel(n).slice(8)}`
