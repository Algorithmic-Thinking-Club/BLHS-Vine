// POST /api/log [ LogEnvelope, ... ] -> { ok, n }
// The offline-first logger's drain (src/vine/logging.ts batches into here). Append-only;
// castaway/demo sessions never reach this endpoint (the client keeps them local, §2.9);
// captain/dev sessions arrive flagged dev:true in the envelope and are excluded from any
// study export by that flag.
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
