import { useEffect, useState } from 'react'
import './teacher.css'

// The teacher screen (GAME-DESIGN §13.3) — deliberately plain web UI: this is Wiseman's
// tool, not the game. Create a class -> get the join code (projector-sized) -> watch the
// roster fill live (handles only, §2.9) -> export CSV. No accounts: creating a class
// returns a capability key kept in this browser; losing it means making a new class.
// Route: /?scene=teacher (its own corner of the app, never on the student title).

type ClassRef = { classId: string; teacherKey: string; name: string; code: string }
type RosterRow = {
  handle: string; arm: string; created_at: string; last_seen: string | null
  year: string; beat: string
  graduated?: boolean
  code?: string | null   // the turn-in verification code (matches the student's diploma)
}

const KEY = 'blhs_teacher_classes'
const loadClasses = (): ClassRef[] => { try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] } }
const saveClasses = (c: ClassRef[]) => localStorage.setItem(KEY, JSON.stringify(c))

export default function TeacherScene() {
  const [classes, setClasses] = useState<ClassRef[]>(loadClasses)
  const [active, setActive] = useState<ClassRef | null>(classes[0] ?? null)
  const [name, setName] = useState('')
  const [studyMode, setStudyMode] = useState(false)
  const [roster, setRoster] = useState<RosterRow[] | null>(null)
  const [open, setOpen] = useState(true)
  const [offline, setOffline] = useState(false)
  const [busy, setBusy] = useState(false)
  const [exported, setExported] = useState<string | null>(null)

  const create = async () => {
    setBusy(true)
    try {
      const r = await fetch('/api/teacher', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'create', name, studyMode }),
      })
      if (r.status === 503) { setOffline(true); return }
      const d = await r.json()
      const ref: ClassRef = { classId: d.classId, teacherKey: d.teacherKey, name: name || 'My class', code: d.code }
      const next = [...classes, ref]
      setClasses(next); saveClasses(next); setActive(ref); setName('')
    } catch { setOffline(true) } finally { setBusy(false) }
  }

  const refresh = async (ref: ClassRef) => {
    try {
      const r = await fetch('/api/teacher', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'roster', classId: ref.classId, teacherKey: ref.teacherKey }),
      })
      if (r.status === 503) { setOffline(true); return }
      const d = await r.json()
      setRoster(d.roster ?? []); setOpen(!!d.open); setOffline(false)
    } catch { setOffline(true) }
  }

  useEffect(() => {
    if (!active) return
    void refresh(active)
    const t = window.setInterval(() => void refresh(active), 5000) // the projector view stays live
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.classId])

  const toggleOpen = async () => {
    if (!active) return
    await fetch('/api/teacher', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ op: 'setOpen', classId: active.classId, teacherKey: active.teacherKey, open: !open }),
    }).catch(() => setOffline(true))
    setOpen(!open)
  }

  /* THE EXPORT COMES OFF THE SERVER NOW.
   *
   * This used to build eight columns here, out of the roster state the browser
   * already had: handle, arm, joined, last_seen, year, beat, graduated,
   * verification. No score, no duration, no attempts, because a browser holds one
   * student's save and the dependent variable lives in the events table. The
   * server reads that table (api/teacher.ts op 'export'), so the file a teacher
   * hands over is the one a reviewer can read. */
  const exportCsv = async () => {
    if (!active) return
    setBusy(true)
    try {
      const r = await fetch('/api/teacher', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ op: 'export', classId: active.classId, teacherKey: active.teacherKey }),
      })
      if (r.status === 503) { setOffline(true); return }
      const d = await r.json() as { columns: string[]; rows: (string | number)[][]; events: number }
      const csv = [d.columns, ...d.rows]
        .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      a.download = `${active.name}-export.csv`
      a.click()
      /* an export of nothing and an empty class look identical in a CSV, and only
       * one of them is a bug worth telling somebody about */
      setExported(`${d.rows.length} student${d.rows.length === 1 ? '' : 's'} · ${d.events} events read`)
    } catch { setOffline(true) } finally { setBusy(false) }
  }

  return (
    <div className="tc-root">
      <div className="tc-head">
        <h1>BLHS Island Explorer — teacher's desk</h1>
        <p>Classes live here. Students never log in: they enter the class code inside the game's story.</p>
        {offline && <div className="tc-offline">Server not configured yet (no database connected). Everything here goes live the moment it is.</div>}
      </div>

      <div className="tc-cols">
        <div className="tc-col">
          <h2>Create a class</h2>
          <input value={name} placeholder="Class name (e.g. Wiseman P3)" onChange={(e) => setName(e.target.value)} />
          <label className="tc-check">
            <input type="checkbox" checked={studyMode} onChange={(e) => setStudyMode(e.target.checked)} />
            Study mode (AP Research: automatic game/plain split)
          </label>
          <button disabled={busy} onClick={create}>Create class</button>

          {classes.length > 0 && (
            <>
              <h2>Your classes</h2>
              {classes.map((c) => (
                <button key={c.classId} className={`tc-classbtn ${active?.classId === c.classId ? 'on' : ''}`} onClick={() => { setActive(c); setRoster(null) }}>
                  {c.name} · {c.code}
                </button>
              ))}
            </>
          )}
        </div>

        <div className="tc-col tc-main">
          {active ? (
            <>
              <div className="tc-codecard">
                <div className="tc-codelabel">{active.name} — join code</div>
                <div className="tc-code">{active.code}</div>
                <div className="tc-sub">{open ? 'Open — students can join' : 'Closed'}
                  <button className="tc-mini" onClick={toggleOpen}>{open ? 'Close joining' : 'Reopen'}</button>
                  <button className="tc-mini" onClick={() => void exportCsv()} disabled={busy || !roster?.length}>Export CSV</button>
                  {exported && <span className="tc-dim"> · {exported}</span>}
                </div>
              </div>
              <h2>Roster {roster ? `· ${roster.length}` : ''}</h2>
              {!roster && !offline && <p className="tc-dim">Loading…</p>}
              {roster && !roster.length && <p className="tc-dim">Nobody yet. The code on the projector is all they need.</p>}
              {roster && roster.length > 0 && (
                <table className="tc-table">
                  <thead><tr><th>Handle</th><th>Arm</th><th>Year</th><th>Where</th><th>Turn-in code</th><th>Last seen</th></tr></thead>
                  <tbody>
                    {roster.map((r, i) => (
                      <tr key={i}><td>{r.handle}</td><td>{r.arm}</td><td>{r.year}</td><td>{r.beat}</td>
                        <td>{r.graduated ? <b>{r.code}</b> : '—'}</td>
                        <td>{r.last_seen ? new Date(r.last_seen).toLocaleString() : '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : <p className="tc-dim">Create a class to get a join code.</p>}
        </div>
      </div>
    </div>
  )
}
