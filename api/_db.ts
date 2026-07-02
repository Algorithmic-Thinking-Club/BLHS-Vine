// Shared serverless plumbing (Vercel functions + Neon). Every endpoint degrades honestly:
// no DATABASE_URL -> 503 { offline: true } and the client stays in local dev mode. The
// swap to live is ONE env var on Vercel; nothing else changes anywhere.
import { neon } from '@neondatabase/serverless'

export function db() {
  const url = process.env.DATABASE_URL
  if (!url) return null
  return neon(url)
}

export function json(res: { statusCode?: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.end(JSON.stringify(body))
}

export async function readBody(req: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = []
  for await (const c of req) chunks.push(c)
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return {} }
}

// join codes: 6 chars, ambiguous glyphs excluded (no 0/O/1/I/L) — §4.3's locked mechanics
const GLYPHS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const newCode = () => Array.from({ length: 6 }, () => GLYPHS[Math.floor(Math.random() * GLYPHS.length)]).join('')
export const newId = (p: string) => p + '_' + Math.random().toString(36).slice(2, 10)
