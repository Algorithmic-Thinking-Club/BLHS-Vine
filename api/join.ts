// POST /api/join { code, handle } -> { participantId, classId, className, arm }
// The diegetic join (§4.3): code -> handle -> go. Arm assignment is deterministic per
// participant when the class runs in study mode (§13.2). Handle collisions get a kind
// suffix instead of an error wall.
import { db, json, readBody, newId } from './_db'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' })
  const sql = db()
  if (!sql) return json(res, 503, { offline: true })
  const { code, handle } = (await readBody(req)) as { code?: string; handle?: string }
  if (!code || !handle) return json(res, 400, { error: 'code and handle required' })

  const rows = await sql`select id, name, study_mode, open from classes where code = ${code.toUpperCase()}`
  if (!rows.length) return json(res, 404, { error: 'unknown_code' })
  const cls = rows[0]
  if (!cls.open) return json(res, 403, { error: 'class_closed' })

  // deterministic arm split in study mode: stable hash of class+handle -> game|plain
  let arm = 'game'
  if (cls.study_mode) {
    let h = 0
    for (const ch of `${cls.id}:${handle}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    arm = h % 2 === 0 ? 'game' : 'plain'
  }

  const clean = handle.replace(/[^a-zA-Z0-9 '&-]/g, '').slice(0, 14) || 'Panther'
  let finalHandle = clean
  let participantId = newId('p')
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      await sql`insert into participants (id, class_id, handle, arm) values (${participantId}, ${cls.id}, ${finalHandle}, ${arm})`
      return json(res, 200, { participantId, classId: cls.id, className: cls.name, arm, handle: finalHandle })
    } catch {
      // taken: returning student re-joins as themselves; a genuine twin gets a suffix
      const existing = await sql`select id, arm from participants where class_id = ${cls.id} and handle = ${finalHandle}`
      if (existing.length && attempt === 0) {
        return json(res, 200, { participantId: existing[0].id, classId: cls.id, className: cls.name, arm: existing[0].arm, handle: finalHandle, returning: true })
      }
      finalHandle = `${clean}${2 + attempt}`
      participantId = newId('p')
    }
  }
  return json(res, 500, { error: 'join_failed' })
}
