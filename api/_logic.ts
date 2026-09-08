// pure logic shared by the api handlers, with no i/o, including the participant arm hash

import { randomBytes, randomUUID } from 'node:crypto'

// join codes: 6 chars, ambiguous glyphs excluded (no 0/O/1/I/L) — §4.3's locked mechanics
export const GLYPHS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const newCode = () => {
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => GLYPHS[b % GLYPHS.length]).join('')
}
// participant ids and teacher capability keys must be unguessable (they ARE the auth):
// crypto-strength, not Math.random
export const newId = (p: string) => p + '_' + randomUUID().replace(/-/g, '').slice(0, 20)

/** deterministic arm split in study mode: stable hash of class+handle -> game|plain (§13.2) */
export function armFor(classId: string, handle: string): 'game' | 'plain' {
  let h = 0
  for (const ch of `${classId}:${handle}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h % 2 === 0 ? 'game' : 'plain'
}

/** the server's handle hygiene — same glyph set the client allows, capped, never empty */
export const cleanHandle = (handle: string) =>
  handle.replace(/[^a-zA-Z0-9 '&-]/g, '').slice(0, 14) || 'Panther'
