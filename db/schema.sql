-- BLHS Island Explorer — the study/deployment database (GAME-DESIGN §13, Neon Postgres).
-- Privacy law (§2.9): NO real student names, ever. Participants are anonymous handles +
-- server-generated ids; the teacher's roster shows handles only. Events are the AP Research
-- dataset; states are the cross-device resume truth (§7.7).
-- Apply with: psql "$DATABASE_URL" -f db/schema.sql

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

-- one row per participant: the whole SaveGame as jsonb (schema evolves client-side)
create table if not exists states (
  participant_id text primary key references participants(id),
  save           jsonb not null,
  updated_at     timestamptz not null default now()
);

-- append-only event stream (the offline-first logger batches into here)
create table if not exists events (
  id             bigint generated always as identity primary key,
  participant_id text references participants(id),
  session_id     text,
  at             timestamptz not null default now(),
  payload        jsonb not null
);

create index if not exists events_participant_at on events (participant_id, at);
create index if not exists participants_class on participants (class_id);
