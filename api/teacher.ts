// The teacher side (§13.3) — capability keys, no accounts: creating a class returns a
// teacher_key; holding the key IS being the teacher (kept in their browser, shareable to a
// co-teacher on purpose). Correlated with join by design: this endpoint is why a class
// code exists at all.
//   POST /api/teacher { op: 'create', name, studyMode? }        -> { classId, code, teacherKey }
//   POST /api/teacher { op: 'roster', classId, teacherKey }     -> { name, code, open, roster: [...] }
//   POST /api/teacher { op: 'setOpen', classId, teacherKey, open } -> { ok }
import { db, json, readBody, newCode, newId } from './_db'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' })
  const sql = db()
  if (!sql) return json(res, 503, { offline: true })
  const body = (await readBody(req)) as any

  if (body.op === 'create') {
    const name = String(body.name ?? '').slice(0, 60) || 'My class'
    const id = newId('c'), key = newId('tk'), code = newCode()
    await sql`insert into classes (id, code, name, teacher_key, study_mode) values (${id}, ${code}, ${name}, ${key}, ${!!body.studyMode})`
    return json(res, 200, { classId: id, code, teacherKey: key })
  }

  // everything below requires the capability key
  const rows = await sql`select id, code, name, open, study_mode from classes where id = ${body.classId} and teacher_key = ${body.teacherKey}`
  if (!rows.length) return json(res, 403, { error: 'bad_key' })
  const cls = rows[0]

  if (body.op === 'roster') {
    const roster = await sql`
      select p.handle, p.arm, p.created_at, s.updated_at as last_seen,
             coalesce(s.save->>'year', '1') as year, coalesce(s.save->>'beat', 'intro:i1') as beat
      from participants p left join states s on s.participant_id = p.id
      where p.class_id = ${cls.id} order by p.created_at`
    return json(res, 200, { name: cls.name, code: cls.code, open: cls.open, studyMode: cls.study_mode, roster })
  }

  if (body.op === 'setOpen') {
    await sql`update classes set open = ${!!body.open} where id = ${cls.id}`
    return json(res, 200, { ok: true })
  }

  return json(res, 400, { error: 'unknown_op' })
}
