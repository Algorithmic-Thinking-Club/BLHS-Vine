// POST /api/log: the append-only endpoint the client's batched event queue drains into
import { json, readBody } from './_db.js'
import { store } from './_store.js'

const MAX_BATCH = 500

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' })
  const db = store()
  if (!db) return json(res, 503, { offline: true })
  const batch = (await readBody(req)) as Array<{ participantId?: string; sessionId?: string }>
  if (!Array.isArray(batch) || !batch.length) return json(res, 400, { error: 'batch required' })
  const rows = batch.slice(0, MAX_BATCH).map((env) => ({
    participantId: env?.participantId ?? null,
    sessionId: env?.sessionId ?? null,
    payload: env,
  }))
  await db.appendEvents(rows)
  return json(res, 200, { ok: true, n: rows.length })
}
