// pure logic shared by the api handlers, with no i/o

import { randomBytes, randomUUID } from 'node:crypto'

// join codes are 6 chars with the ambiguous glyphs 0, O, 1, I and L excluded, and the mechanics are locked
export const GLYPHS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const newCode = () => {
  const bytes = randomBytes(6)
  return Array.from(bytes, (b) => GLYPHS[b % GLYPHS.length]).join('')
}
// participant ids and teacher capability keys are the auth itself, so they must be unguessable: crypto strength, never Math.random
export const newId = (p: string) => p + '_' + randomUUID().replace(/-/g, '').slice(0, 20)

/** the server's handle hygiene: the same glyph set the client allows, capped, never empty */
export const cleanHandle = (handle: string) =>
  handle.replace(/[^a-zA-Z0-9 '&-]/g, '').slice(0, 14) || 'Panther'
