// The teacher side (§13.3) — capability keys, no accounts: creating a class returns a
// teacher_key; holding the key IS being the teacher (kept in their browser, shareable to a
// co-teacher on purpose). Correlated with join by design: this endpoint is why a class
// code exists at all.
//   POST /api/teacher { op: 'create', name, studyMode? }           -> { classId, code, teacherKey }
//   POST /api/teacher { op: 'roster', classId, teacherKey }        -> { name, code, open, roster: [...] }
//   POST /api/teacher { op: 'export', classId, teacherKey }        -> { columns, rows, events }
//   POST /api/teacher { op: 'setOpen', classId, teacherKey, open } -> { ok }
//
// THE EXPORT IS BUILT HERE AND NOT IN THE BROWSER, and that is the whole of what changed.
// The CSV used to be eight columns assembled client-side out of roster state: handle, arm,
// joined, last_seen, year, beat, graduated, verification. No score, no duration, no
// attempts, because the browser holds one student's save and the dependent variable lives
// in the events table. This op is the first thing in api/ that has ever read that table.
import { json, readBody } from './_db'
import { store } from './_store'
import { newCode, newId } from './_logic'
import { exportRows, summarise, EXPORT_COLUMNS } from './_summary'
import { transcriptOf } from '../src/game/progress'
import { runCode } from '../src/vine/verify'
import type { SaveGame } from '../src/game/save'

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

  // graduated + the verification code derive from the SYNCED save, server-side — that
  // column is what a student's printed diploma is checked against (§9.5). The raw save and
  // the participant id never leave this handler.
  const rosterOf = async () => (await db.roster(cls.id)).map(({ save, ...r }) => {
    const s = save as SaveGame | null
    const graduated = !!s?.graduated
    return { ...r, graduated, code: graduated && s ? runCode(transcriptOf(s)) : null }
  })

  if (body.op === 'roster') {
    const roster = (await rosterOf()).map(({ participant_id, ...r }) => { void participant_id; return r })
    return json(res, 200, { name: cls.name, code: cls.code, open: cls.open, studyMode: cls.study_mode, roster })
  }

  if (body.op === 'export') {
    const roster = await rosterOf()
    const events = await db.readEvents(cls.id)
    const measures = summarise(events.map((e) => ({
      participantId: e.participantId, sessionId: e.sessionId, at: e.at, payload: e.payload,
    })))
    const rows = exportRows(
      roster.map((r) => ({ ...r, participantId: r.participant_id })),
      measures,
    )
    /* `events` is the raw count read, so a teacher (and a reviewer) can tell an
     * empty export apart from an export of nothing. Those look identical in a CSV
     * and only one of them is a bug. */
    return json(res, 200, { columns: EXPORT_COLUMNS, rows, events: events.length })
  }

  if (body.op === 'setOpen') {
    await db.setOpen(cls.id, !!body.open)
    return json(res, 200, { ok: true })
  }

  return json(res, 400, { error: 'unknown_op' })
}
