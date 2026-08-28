/* WHAT CROSSES THE WORKER BOUNDARY, AND NOTHING ELSE.
 *
 * The runtime stays swappable only if the boundary is a message protocol, so
 * this file is deliberately the whole of it: two messages in, four messages
 * out, all of them JSON. If a grape ever genuinely needs CPython, Pyodide drops
 * in behind these six shapes for that island alone.
 *
 * The envelope is already decided by src/vine/intents.ts: an Intent goes out,
 * an IntentResult comes back, and `ok: false` is a refusal the engine can
 * explain rather than an exception thrown across a runtime boundary. Nothing
 * here re-spells either of them, because a vocabulary with two spellings is a
 * vocabulary with somewhere to drift.
 */
import type { Intent, IntentResult } from '../intents'

/* engine -> island */
export type ToWorker =
  /* the island's own source, sent as a file rather than as a string to exec:
   * that is what makes a traceback name hello.py line 7 instead of <stdin>. */
  | { t: 'run'; name: string; source: string; entry: string }
  | { t: 'resume'; result: IntentResult }

/* island -> engine */
export type FromWorker =
  | { t: 'intent'; intent: Intent }
  /* print(). The first thing a beginner types, so it has a wire. */
  | { t: 'print'; text: string }
  | { t: 'done' }
  /* the island stopped and the engine did not. `error` is the one line worth
   * showing a player; `traceback` is the whole thing, which names the member's
   * own file and line. */
  | { t: 'crash'; error: string; traceback: string }
