// The teacher side (§13.3) — capability keys, no accounts: creating a class returns a
// teacher_key; holding the key IS being the teacher (kept in their browser, shareable to a
// co-teacher on purpose). Correlated with join by design: this endpoint is why a class
// code exists at all.
//   POST /api/teacher { op: 'create', name, studyMode? }           -> { classId, code, teacherKey }
//   POST /api/teacher { op: 'roster', classId, teacherKey }        -> { name, code, open, roster: [...] }
//   POST /api/teacher { op: 'setOpen', classId, teacherKey, open } -> { ok }
import { json, readBody } from './_db'
import { store } from './_store'
import { newCode, newId } from './_logic'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method' })
  const db = store()
  if (!db) return json(res, 503, { offline: true })
  const body = (await readBody(req)) as any

  if (body.op === 'create') {
    const name = String(body.name ?? '').slice(0, 60) || 'My class'
    // codes are 31^6 ≈ 887M — collisions are rare but not impossible; retry a few times
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = newCode()
      if (await db.getClassByCode(code)) continue
      const id = newId('c'), key = newId('tk')
      await db.createClass({ id, code, name, teacher_key: key, study_mode: !!body.studyMode, open: true })
      return json(res, 200, { classId: id, code, teacherKey: key })
    }
    return json(res, 500, { error: 'code_collision' })
  }

  // everything below requires the capability key
  const cls = await db.getClassByKey(String(body.classId ?? ''), String(body.teacherKey ?? ''))
  if (!cls) return json(res, 403, { error: 'bad_key' })

  if (body.op === 'roster') {
    const roster = await db.roster(cls.id)
    return json(res, 200, { name: cls.name, code: cls.code, open: cls.open, studyMode: cls.study_mode, roster })
  }

  if (body.op === 'setOpen') {
    await db.setOpen(cls.id, !!body.open)
    return json(res, 200, { ok: true })
  }

  return json(res, 400, { error: 'unknown_op' })
}
