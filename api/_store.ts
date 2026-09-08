// the storage seam behind every endpoint: real Neon Postgres, or a dev-only json file

import { neon } from '@neondatabase/serverless'
import fs from 'node:fs'
import path from 'node:path'

export type ClassRow = {
  id: string; code: string; name: string; teacher_key: string
  study_mode: boolean; open: boolean
}
export type ParticipantRow = { id: string; class_id: string; handle: string; arm: string }
export type RosterRow = {
  /** the id the events table keys on, so a row and its measures can find each other.
   *  teacher.ts strips it before the response leaves the handler. */
  participant_id?: string
  handle: string; arm: string; created_at: string; last_seen: string | null
  year: string; beat: string
  /** the whole synced SaveGame — teacher.ts derives graduated + the verification code
   *  from it server-side and strips it from the response (§9.5) */
  save: unknown | null
}
export type EventRow = { participantId: string | null; sessionId: string | null; payload: unknown }
/** a row coming back OUT, which the insert shape cannot describe because it has no clock */
export type StoredEventRow = EventRow & { at: string }

export interface Store {
  getClassByCode(code: string): Promise<ClassRow | null>
  getClassByKey(classId: string, teacherKey: string): Promise<ClassRow | null>
  createClass(row: ClassRow): Promise<void>
  /** honors unique(class_id, handle): returns 'dup' instead of throwing on a collision */
  insertParticipant(row: ParticipantRow): Promise<'ok' | 'dup'>
  getParticipantByHandle(classId: string, handle: string): Promise<ParticipantRow | null>
  getState(participantId: string): Promise<unknown | null>
  putState(participantId: string, save: unknown): Promise<void>
  appendEvents(rows: EventRow[]): Promise<void>
  /* read a class's logged events back, capped so one export cannot ask for everything */
  readEvents(classId: string, limit?: number): Promise<StoredEventRow[]>
  roster(classId: string): Promise<RosterRow[]>
  setOpen(classId: string, open: boolean): Promise<void>
}

/** how many events one export may read. Thirty students times a few sittings. */
export const EVENT_READ_CAP = 200_000

export function store(): Store | null {
  const url = process.env.DATABASE_URL
  if (url) return neonStore(url)
  if (process.env.BLHS_DEV_DB === 'file') return fileStore()
  return null
}

// ---- the real backend ----------------------------------------------------------------

function neonStore(url: string): Store {
  const sql = neon(url)
  return {
    async getClassByCode(code) {
      const r = await sql`select id, code, name, teacher_key, study_mode, open from classes where code = ${code}`
      return (r[0] as ClassRow | undefined) ?? null
    },
    async getClassByKey(classId, teacherKey) {
      const r = await sql`select id, code, name, teacher_key, study_mode, open from classes where id = ${classId} and teacher_key = ${teacherKey}`
      return (r[0] as ClassRow | undefined) ?? null
    },
    async createClass(c) {
      await sql`insert into classes (id, code, name, teacher_key, study_mode, open)
                values (${c.id}, ${c.code}, ${c.name}, ${c.teacher_key}, ${c.study_mode}, ${c.open})`
    },
    async insertParticipant(p) {
      try {
        await sql`insert into participants (id, class_id, handle, arm) values (${p.id}, ${p.class_id}, ${p.handle}, ${p.arm})`
        return 'ok'
      } catch { return 'dup' }
    },
    async getParticipantByHandle(classId, handle) {
      // case-insensitive: 'BraveTide' and 'bravetide' are the same student, not two runs
      const r = await sql`select id, class_id, handle, arm from participants where class_id = ${classId} and lower(handle) = lower(${handle})`
      return (r[0] as ParticipantRow | undefined) ?? null
    },
    async getState(pid) {
      const r = await sql`select save from states where participant_id = ${pid}`
      return r.length ? r[0].save : null
    },
    async putState(pid, save) {
      await sql`insert into states (participant_id, save, updated_at) values (${pid}, ${JSON.stringify(save)}::jsonb, now())
                on conflict (participant_id) do update set save = excluded.save, updated_at = now()`
    },
    async appendEvents(rows) {
      // one round-trip per batch, not one per event (a 500-event batch was 500 awaits)
      if (!rows.length) return
      const pids = rows.map((r) => r.participantId)
      const sids = rows.map((r) => r.sessionId)
      const payloads = rows.map((r) => JSON.stringify(r.payload))
      await sql`insert into events (participant_id, session_id, payload)
                select * from unnest(${pids}::text[], ${sids}::text[], ${payloads}::jsonb[])`
    },
    async readEvents(classId, limit = EVENT_READ_CAP) {
      /* the inner join to participants is what filters the rows down to this class */
      const r = await sql`
        select e.participant_id, e.session_id, e.at, e.payload
        from events e join participants p on p.id = e.participant_id
        where p.class_id = ${classId}
        order by e.at
        limit ${limit}`
      return (r as Record<string, unknown>[]).map((x) => ({
        participantId: (x.participant_id as string) ?? null,
        sessionId: (x.session_id as string) ?? null,
        at: String(x.at),
        payload: x.payload,
      }))
    },
    async roster(classId) {
      const r = await sql`
        select p.id as participant_id, p.handle, p.arm, p.created_at, s.updated_at as last_seen,
               coalesce(s.save->>'year', '1') as year, coalesce(s.save->>'beat', 'intro:i1') as beat,
               s.save as save
        from participants p left join states s on s.participant_id = p.id
        where p.class_id = ${classId} order by p.created_at`
      return r as RosterRow[]
    },
    async setOpen(classId, open) {
      await sql`update classes set open = ${open} where id = ${classId}`
    },
  }
}

// ---- the dev/test backend (a JSON file with the same behavior) ------------------------

type FileDb = {
  classes: (ClassRow & { created_at: string })[]
  participants: (ParticipantRow & { created_at: string })[]
  states: Record<string, { save: unknown; updated_at: string }>
  events: (EventRow & { at: string })[]
}

const DEV_DB_PATH = () => process.env.BLHS_DEV_DB_PATH || '.data/dev-db.json'

function fileStore(): Store {
  const file = path.resolve(DEV_DB_PATH())

  const read = (): FileDb => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) as FileDb }
    catch { return { classes: [], participants: [], states: {}, events: [] } }
  }
  const write = (db: FileDb) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(db, null, 1))
  }
  const now = () => new Date().toISOString()

  return {
    async getClassByCode(code) { return read().classes.find((c) => c.code === code) ?? null },
    async getClassByKey(id, key) {
      return read().classes.find((c) => c.id === id && c.teacher_key === key) ?? null
    },
    async createClass(c) {
      const db = read()
      db.classes.push({ ...c, created_at: now() })
      write(db)
    },
    async insertParticipant(p) {
      const db = read()
      if (db.participants.some((x) => x.class_id === p.class_id && x.handle.toLowerCase() === p.handle.toLowerCase())) return 'dup'
      db.participants.push({ ...p, created_at: now() })
      write(db)
      return 'ok'
    },
    async getParticipantByHandle(classId, handle) {
      return read().participants.find((p) => p.class_id === classId && p.handle.toLowerCase() === handle.toLowerCase()) ?? null
    },
    async getState(pid) { return read().states[pid]?.save ?? null },
    async putState(pid, save) {
      const db = read()
      db.states[pid] = { save, updated_at: now() }
      write(db)
    },
    async appendEvents(rows) {
      const db = read()
      for (const r of rows) db.events.push({ ...r, at: now() })
      write(db)
    },
    async readEvents(classId, limit = EVENT_READ_CAP) {
      const db = read()
      const mine = new Set(db.participants.filter((p) => p.class_id === classId).map((p) => p.id))
      return db.events
        .filter((e) => e.participantId && mine.has(e.participantId))
        .sort((a, b) => a.at.localeCompare(b.at))
        .slice(0, limit)
        .map((e) => ({ participantId: e.participantId, sessionId: e.sessionId, at: e.at, payload: e.payload }))
    },
    async roster(classId) {
      const db = read()
      return db.participants
        .filter((p) => p.class_id === classId)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((p) => {
          const st = db.states[p.id]
          const save = (st?.save ?? {}) as { year?: number; beat?: string }
          return {
            participant_id: p.id,
            handle: p.handle, arm: p.arm, created_at: p.created_at,
            last_seen: st?.updated_at ?? null,
            year: String(save.year ?? 1), beat: String(save.beat ?? 'intro:i1'),
            save: st?.save ?? null,
          }
        })
    },
    async setOpen(classId, open) {
      const db = read()
      const c = db.classes.find((x) => x.id === classId)
      if (c) { c.open = open; write(db) }
    },
  }
}
