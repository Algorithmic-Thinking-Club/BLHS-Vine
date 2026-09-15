// joining a class: GET checks a code, POST creates or resumes that student's run
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

  // one student is one run, so the same handle in the same class is that student returning; this check comes before the open gate on purpose, because closing a class stops new joins and must never lock a mid-run student out of resuming
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
