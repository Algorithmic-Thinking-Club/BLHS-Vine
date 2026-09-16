/* every message that crosses to the python worker: three in, five out, all json */
import type { Intent, IntentResult } from '../intents'

/* the wire version, checked in both directions so a cached worker chunk says so */
export const PROTOCOL = 1

/* engine -> island */
export type ToWorker =
  /* the island's whole package as files, so a traceback names the member's own file */
  | {
    t: 'load'; v: number; island: string; entry: string
    files: Record<string, string>
    /* the island's own island.json, so manifest()["programme"] works and the id is written once */
    manifest: Record<string, unknown>
  }
  /* fire one registered handler, strictly one at a time, one message in and one message out */
  | { t: 'call'; handler: string }
  | { t: 'resume'; result: IntentResult }

/* island -> engine */
export type FromWorker =
  /* the island imported cleanly, and these are the handlers it registered */
  | { t: 'ready'; v: number; handlers: string[] }
  | { t: 'intent'; intent: Intent }
  /* print(). The first thing a beginner types, so it has a wire. */
  | { t: 'print'; text: string }
  /* the handler returned, and the island stays loaded for the next press */
  | { t: 'done' }
  /* the island stopped and the engine did not: error is the line to show a player, traceback is the whole thing */
  | { t: 'crash'; error: string; traceback: string }

/* what the pump leaves in `_step`, before the version is stamped on it */
export type PyStep =
  | { t: 'ready'; handlers: string[] }
  | { t: 'intent'; intent: Intent }
  | { t: 'done' }
