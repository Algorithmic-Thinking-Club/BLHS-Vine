// shared serverless http plumbing, degrading honestly: with no backend (see _store.ts) every endpoint answers 503 { offline: true } and the client stays in local dev mode, and the swap to live is one env var on Vercel, DATABASE_URL

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
