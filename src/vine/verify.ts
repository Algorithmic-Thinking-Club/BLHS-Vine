// the turn-in artifact's short code, computed the same way on the client and the server

export type Transcript = {
  participantId: string
  handle: string
  gpa: number | null
  cords: string[]          // earned cord ids, sorted
  ranks: Record<string, number>
  islandsCompleted: number
  /* the awareness measure and the learning one, both kept out of the frozen code below */
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
