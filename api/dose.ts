// GET  /api/dose?classId=...&teacherKey=...[&handle=BraveTide][&cut=map|scene|place|session]
// POST /api/dose { classId, teacherKey, handle?, cut? }              -> the dose table
//
// THE READ THE HEARTBEAT NEVER HAD. `startHeartbeat()` in src/game/telemetry.ts has been
// posting a beat every fifteen seconds into api/log.ts, and until this file nothing anywhere
// could turn one back into a duration. Dose is the study's exposure measure, so "the game arm
// learned more" and "the game arm sat there twice as long" were the same table.
//
// The capability key is the same one every other teacher-side op needs (api/teacher.ts): a
// dose table is a class's activity data and minors' at that, so it is not public because it
// happens to be useful in dev. GET is here because a proof harness and a browser address bar
// can hit one and cannot post a body; a teacher key in a query string ends up in a server log,
// so the UI should use POST and GET is for a dev run against the file store.
//
// It degrades exactly like every other endpoint: no DATABASE_URL and no BLHS_DEV_DB means
// store() returns null and this answers 503 { offline: true }. Under `npm run dev` the vite
// bridge sets BLHS_DEV_DB=file, so this is queryable locally with no database at all.
import { json, readBody } from './_db'
import { store } from './_store'
import { dose, doseMinutes, gapCapMs, HEARTBEAT_MS } from './_dose'
import { summarise } from './_summary'

export default async function handler(req: any, res: any) {
  const db = store()
  if (!db) return json(res, 503, { offline: true })

  let q: Record<string, string> = {}
  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://x')
    for (const [k, v] of url.searchParams) q[k] = v
  } else if (req.method === 'POST') {
    const body = (await readBody(req)) as Record<string, unknown>
    q = Object.fromEntries(Object.entries(body ?? {}).map(([k, v]) => [k, String(v ?? '')]))
  } else {
    return json(res, 405, { error: 'method' })
  }

  const cls = await db.getClassByKey(String(q.classId ?? ''), String(q.teacherKey ?? ''))
  if (!cls) return json(res, 403, { error: 'bad_key' })

  const events = await db.readEvents(cls.id)
  const report = dose(events)
  /* the all-events duration beside the heartbeat one, because a dose that nothing
   * can be compared against is a dose nobody has to believe. They measure two
   * different things (api/_summary.ts sums gaps between EVERY event and caps each
   * at IDLE_CAP_MS; this sums gaps between BEATS and drops the ones past the cap),
   * so they will not be equal, and a heartbeat total wildly under the event total
   * is the shape of a beat that stopped firing. */
  const byPid = new Map(summarise(events).map((m) => [m.participantId, m]))

  /* the handle, resolved here, and the participant id NEVER LEAVES. That is the
   * rule the roster op already holds (api/teacher.ts) and there is no reason a
   * duration table gets to be the exception. `handle=` filters on the handle for
   * the same reason: a dev running the proof has one and does not have the other. */
  const handles = new Map((await db.roster(cls.id)).map((r) => [r.participant_id ?? '', r.handle]))
  const want = String(q.handle ?? '').toLowerCase()

  const participants = report.participants
    .map(({ participantId, ...p }) => ({
      ...p,
      handle: handles.get(participantId) ?? null,
      onTaskMinutes: doseMinutes(p.onTaskMs),
      awayMinutes: doseMinutes(p.awayMs),
      /** the same run measured off every event instead of off the beat */
      allEventsActiveMs: byPid.get(participantId)?.activeMs ?? 0,
    }))
    .filter((p) => !want || (p.handle ?? '').toLowerCase() === want)

  return json(res, 200, {
    class: { name: cls.name, code: cls.code, studyMode: cls.study_mode },
    /* the two numbers the measure rests on, in the response rather than only in a
     * comment, so a reviewer reading a dose table can see what it assumed */
    cadenceMs: HEARTBEAT_MS,
    gapCapMs: gapCapMs(),
    /* the raw heartbeat count read, so an empty class and a class whose beat never
     * fired are distinguishable. Those look identical in a table of zeros and only
     * one of them is a bug. */
    beatRows: report.beatRows,
    eventRows: events.length,
    totals: report.totals,
    participants,
  })
}
