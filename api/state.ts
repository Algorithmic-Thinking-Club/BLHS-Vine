// GET  /api/state?participantId=... -> { save } | 404
// POST /api/state { participantId, save } -> { ok }
// The server copy of the run (§7.7's top layer): cross-device resume by class code + handle.
import { db, json, readBody } from './_db'

export default async function handler(req: any, res: any) {
  const sql = db()
  if (!sql) return json(res, 503, { offline: true })

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x')
    const pid = url.searchParams.get('participantId')
    if (!pid) return json(res, 400, { error: 'participantId required' })
    const rows = await sql`select save from states where participant_id = ${pid}`
    if (!rows.length) return json(res, 404, { error: 'no_state' })
    return json(res, 200, { save: rows[0].save })
  }

  if (req.method === 'POST') {
    const { participantId, save } = (await readBody(req)) as { participantId?: string; save?: unknown }
    if (!participantId || !save) return json(res, 400, { error: 'participantId and save required' })
    await sql`
      insert into states (participant_id, save, updated_at) values (${participantId}, ${JSON.stringify(save)}::jsonb, now())
      on conflict (participant_id) do update set save = excluded.save, updated_at = now()`
    return json(res, 200, { ok: true })
  }

  return json(res, 405, { error: 'method' })
}
