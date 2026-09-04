// GET  /api/join?code=ABC234 -> { className, open } | 404
//      the code card's cheap in-fiction confirmation ("Ah. Mr. Wiseman's crew.") — checks the
//      class WITHOUT creating a participant, because the student picks their handle on the
//      NEXT card. (Joining at the code card with a placeholder handle merged every student
//      in a class into one participant — the Act Zero critical.)
// POST /api/join { code, handle } -> { participantId, classId, className, arm }
//      the real join (§4.3): arm assignment is deterministic per participant when the class
//      runs in study mode (§13.2). A returning student re-joins as themselves (same class +
//      handle = the SAME run, §7.7) — even after the class closes to NEW joiners; a genuine
//      twin gets a kind numeric suffix instead of an error wall.
import { json, readBody } from './_db.js'
import { store } from './_store.js'
import { armFor, cleanHandle, newId } from './_logic.js'

export default async function handler(req: any, res: any) {
  const db = store()
  if (!db) return json(res, 503, { offline: true })

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x')
    const code = url.searchParams.get('code')
    if (!code) return json(res, 400, { error: 'code required' })
    const cls = await db.getClassByCode(code.toUpperCase())
    if (!cls) return json(res, 404, { error: 'unknown_code' })
    if (!cls.open) return json(res, 403, { error: 'class_closed' })
    return json(res, 200, { className: cls.name, open: cls.open })
  }

  if (req.method !== 'POST') return json(res, 405, { error: 'method' })
  const { code, handle } = (await readBody(req)) as { code?: string; handle?: string }
  if (!code || !handle) return json(res, 400, { error: 'code and handle required' })

  const cls = await db.getClassByCode(code.toUpperCase())
  if (!cls) return json(res, 404, { error: 'unknown_code' })

  const clean = cleanHandle(handle)

  // one student = one run: the same handle in the same class IS that student, returning.
  // This check comes BEFORE the open gate on purpose — closing a class stops NEW joins,
  // it must never lock a mid-run student out of resuming.
  const existing = await db.getParticipantByHandle(cls.id, clean)
  if (existing) {
    return json(res, 200, {
      participantId: existing.id, classId: cls.id, className: cls.name,
      arm: existing.arm, handle: existing.handle, returning: true,
    })
  }

  if (!cls.open) return json(res, 403, { error: 'class_closed' })

  // new participant; a race or a genuine twin walks down numeric suffixes
  for (let attempt = 0; attempt < 4; attempt++) {
    const finalHandle = attempt === 0 ? clean : `${clean}${1 + attempt}`
    const arm = cls.study_mode ? armFor(cls.id, finalHandle) : 'game'
    const participantId = newId('p')
    const r = await db.insertParticipant({ id: participantId, class_id: cls.id, handle: finalHandle, arm })
    if (r === 'ok') {
      return json(res, 200, { participantId, classId: cls.id, className: cls.name, arm, handle: finalHandle })
    }
  }
  return json(res, 500, { error: 'join_failed' })
}
