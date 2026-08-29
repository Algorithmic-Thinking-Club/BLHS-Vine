// The turn-in artifact's verification (§9.5): a short code an advisory teacher can check
// against their roster. Pure and dependency-free ON PURPOSE — the client stamps it on the
// diploma, and api/teacher.ts computes the same code server-side from the SYNCED save, so
// the two match only if the run the student prints is the run the server watched happen.
// (FNV-1a over the canonical transcript: this is proof-of-completion for a classroom, not
// cryptography; the server's copy of the save is the actual trust anchor.)

export type Transcript = {
  participantId: string
  handle: string
  gpa: number | null
  cords: string[]          // earned cord ids, sorted
  ranks: Record<string, number>
  islandsCompleted: number
  /* THE TWO NUMBERS THAT USED TO BE ONE. `placesSeen` is the awareness measure
   * and `programmesCompleted` is the learning one, and a student who sailed to
   * the stadium in three seasons is one of the first and up to three of the
   * second. NEITHER IS IN `canonical` BELOW and neither ever will be: the code is
   * frozen so that a diploma printed today still checks against a roster
   * tomorrow, and these two are for the export rather than for the check. */
  placesSeen: number
  programmesCompleted: number
  factsLearned: number
  years: number
}

/** the canonical string the code hashes — field order is FROZEN (changing it breaks
 *  every printed diploma against every roster; do not reorder, do not add) */
export function canonical(t: Transcript): string {
  return [
    t.participantId,
    t.gpa === null ? '-' : t.gpa.toFixed(2),
    [...t.cords].sort().join(','),
    Object.keys(t.ranks).sort().map((k) => `${k}:${t.ranks[k]}`).join(','),
    t.islandsCompleted,
    t.factsLearned,
    t.years,
  ].join('|')
}

/** FNV-1a 64-bit -> a 10-char base-32 code, grouped for reading aloud (ABCDE-FGHIJ) */
export function runCode(t: Transcript): string {
  const s = canonical(t)
  let h = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i))
    h = (h * prime) & 0xffffffffffffffffn
  }
  const GLYPHS = 'ABCDEFGHJKMNPQRSTUVWXYZ2345679'
  let out = ''
  let v = h
  for (let i = 0; i < 10; i++) {
    out += GLYPHS[Number(v % BigInt(GLYPHS.length))]
    v /= BigInt(GLYPHS.length)
  }
  return `${out.slice(0, 5)}-${out.slice(5)}`
}
