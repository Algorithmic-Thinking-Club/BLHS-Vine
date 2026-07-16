-- BLHS Island Explorer — the study/deployment database (GAME-DESIGN §13, Neon Postgres).
-- Privacy law (§2.9): NO real student names, ever. Participants are anonymous handles +
-- server-generated ids; the teacher's roster shows handles only. Events are the AP Research
-- dataset; states are the cross-device resume truth (§7.7).
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql
-- Already-deployed databases: also run db/migrations/*.sql in date order.

create table if not exists classes (
  id          text primary key,                 -- short id
  code        text unique not null,             -- the 6-char join code (ambiguous glyphs excluded)
  name        text not null,                    -- teacher-facing label ("Wiseman P3")
  teacher_key text not null,                    -- capability key returned at creation (no accounts)
  study_mode  boolean not null default false,   -- deterministic game/plain arm split when true
  open        boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists participants (
  id         text primary key,
  class_id   text not null references classes(id),
  handle     text not null,                     -- the anonymized deck name
  arm        text not null default 'game',      -- 'game' | 'plain' (§13.2)
  created_at timestamptz not null default now(),
  unique (class_id, handle)
);

-- 'BraveTide' and 'bravetide' are the same student, not two runs (§7.7 one student = one run)
create unique index if not exists participants_class_handle_ci on participants (class_id, lower(handle));

-- one row per participant: the whole SaveGame as jsonb (schema evolves client-side)
create table if not exists states (
  participant_id text primary key references participants(id),
  save           jsonb not null,
  updated_at     timestamptz not null default now()
);

-- append-only event stream (the offline-first logger batches into here).
-- participant_id carries NO foreign key ON PURPOSE: pre-join events arrive under the device's
-- anon id (the boot, the title, the intro's opening — the funnel the study needs), and captain
-- sessions arrive under 'captain'. An FK here rejected those rows, which poisoned every batch
-- they traveled in and wedged the whole pipeline. Analysis joins to participants when it can.
create table if not exists events (
  id             bigint generated always as identity primary key,
  participant_id text,
  session_id     text,
  at             timestamptz not null default now(),
  payload        jsonb not null
);

create index if not exists events_participant_at on events (participant_id, at);
create index if not exists participants_class on participants (class_id);
