-- Act Zero hardening (2026-07-16) — run once on any database created from the pre-Act-Zero
-- schema.sql. Fresh databases just apply schema.sql and skip this file.

-- 1. The events FK rejected anon/captain participant ids, which poisoned every log batch
--    they traveled in (one bad row = the whole batch 500s = the client retries forever =
--    ZERO events ever land). Events are append-only observations, not relational children.
alter table events drop constraint if exists events_participant_id_fkey;

-- 2. One student = one run, case-insensitively: 'BraveTide' rejoining as 'bravetide' must
--    return the same participant, never mint a second run.
create unique index if not exists participants_class_handle_ci on participants (class_id, lower(handle));
