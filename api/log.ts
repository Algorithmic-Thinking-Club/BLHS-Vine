// POST /api/log [ LogEnvelope, ... ] -> { ok, n }
// The offline-first logger's drain (src/vine/logging.ts batches into here). Append-only;
// castaway/demo sessions never reach this endpoint (the client keeps them local, §2.9).
import { db, json, readBody } from './_db'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' })
  const sql = db()
  if (!sql) return json(res, 503, { offline: true })
  const batch = (await readBody(req)) as Array<{ participantId?: string; sessionId?: string }>
  if (!Array.isArray(batch) || !batch.length) return json(res, 400, { error: 'batch required' })
  for (const env of batch.slice(0, 500)) {
    await sql`insert into events (participant_id, session_id, payload)
              values (${env.participantId ?? null}, ${env.sessionId ?? null}, ${JSON.stringify(env)}::jsonb)`
  }
  return json(res, 200, { ok: true, n: Math.min(batch.length, 500) })
}
