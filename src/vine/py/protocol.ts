/* every message that crosses to the python worker: three in, five out, all json */
import type { Intent, IntentResult } from '../intents'

/* the wire version, checked in both directions so a stale worker chunk says so */
export const PROTOCOL = 1

/* engine -> island */
export type ToWorker =
  /* the island's whole package as files, so a traceback names the member's own file */
  | {
    t: 'load'; v: number; island: string; entry: string
    files: Record<string, string>
    /* the island's own island.json, handed over so `manifest()["programme"]`
     * works and the id is written once instead of in the manifest AND again in
     * the award call, where the two drift and a grade lands on the wrong row. */
    manifest: Record<string, unknown>
  }
  /* fire one registered handler. Strictly one at a time: the protocol is one
   * message in and one message out, and a second call arriving while the first
   * is parked on a `say` would resume the wrong generator. */
  | { t: 'call'; handler: string }
  | { t: 'resume'; result: IntentResult }

/* island -> engine */
export type FromWorker =
  /* the island imported cleanly, and these are the handlers it registered */
  | { t: 'ready'; v: number; handlers: string[] }
  | { t: 'intent'; intent: Intent }
  /* print(). The first thing a beginner types, so it has a wire. */
  | { t: 'print'; text: string }
  /* the handler that was called returned. The island stays loaded, so the next
   * press on the next anchor is a `call` and not another `load`. */
  | { t: 'done' }
  /* the island stopped and the engine did not. `error` is the one line worth
   * showing a player; `traceback` is the whole thing, which names the member's
   * own file and line. */
  | { t: 'crash'; error: string; traceback: string }

/* what the pump leaves in `_step`, before the version is stamped on it */
export type PyStep =
  | { t: 'ready'; handlers: string[] }
  | { t: 'intent'; intent: Intent }
  | { t: 'done' }
