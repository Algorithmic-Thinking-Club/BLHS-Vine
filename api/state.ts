// GET  /api/state?participantId=... -> { save } | 404
// POST /api/state { participantId, save } -> { ok }
// The server copy of the run (§7.7's top layer): cross-device resume by class code + handle.
import { json, readBody } from './_db'
import { store } from './_store'

// a SaveGame is a few KB; anything over this is not a save (guards the jsonb column)
const MAX_SAVE_BYTES = 256 * 1024

export default async function handler(req: any, res: any) {
  const db = store()
  if (!db) return json(res, 503, { offline: true })

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x')
    const pid = url.searchParams.get('participantId')
    if (!pid) return json(res, 400, { error: 'participantId required' })
    const save = await db.getState(pid)
    if (save === null) return json(res, 404, { error: 'no_state' })
    return json(res, 200, { save })
  }

  if (req.method === 'POST') {
    const { participantId, save } = (await readBody(req)) as { participantId?: string; save?: unknown }
    if (!participantId || !save || typeof save !== 'object') return json(res, 400, { error: 'participantId and save required' })
    if (JSON.stringify(save).length > MAX_SAVE_BYTES) return json(res, 413, { error: 'save_too_large' })
    await db.putState(participantId, save)
    return json(res, 200, { ok: true })
  }

  return json(res, 405, { error: 'method' })
}
