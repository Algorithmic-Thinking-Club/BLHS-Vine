// Shared serverless HTTP plumbing. Every endpoint degrades honestly: no backend (see
// _store.ts) -> 503 { offline: true } and the client stays in local dev mode. The swap to
// live is ONE env var on Vercel (DATABASE_URL); nothing else changes anywhere.

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
