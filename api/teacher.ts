// the teacher side: create a class, read the roster, export the study csv, open or close it
import { json, readBody } from './_db.js'
import { store } from './_store.js'
import { newCode, newId } from './_logic.js'
import { exportRows, summarise, EXPORT_COLUMNS } from './_summary.js'
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
    /* the sealed diploma code first, and a live recompute only for runs sealed before it */
    return { ...r, graduated, code: graduated && s ? (s.diploma?.code ?? runCode(transcriptOf(s))) : null }
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
