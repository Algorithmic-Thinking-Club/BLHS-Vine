/* WHAT CROSSES THE WORKER BOUNDARY, AND NOTHING ELSE.
 *
 * The runtime stays swappable only if the boundary is a message protocol, so
 * this file is deliberately the whole of it: three messages in, five messages
 * out, all of them JSON. If a grape ever genuinely needs CPython, Pyodide drops
 * in behind these eight shapes for that island alone.
 *
 * The envelope is already decided by src/vine/intents.ts: an Intent goes out,
 * an IntentResult comes back, and `ok: false` is a refusal the engine can
 * explain rather than an exception thrown across a runtime boundary. Nothing
 * here re-spells either of them, because a vocabulary with two spellings is a
 * vocabulary with somewhere to drift.
 *
 * THE ENGINE CAN NOW CALL INTO A GRAPE, which is the half that was missing and
 * the half every member document rests on. `load` puts a member's whole package
 * on the runtime's filesystem and imports it, the decorators in grape.py run
 * during that import, and `ready` comes back carrying the names the island
 * registered. After that `call` fires one of them.
 *
 * Without those three an island can only ever be a script that runs top to
 * bottom on entry, and twelve members would each work around that the same way,
 * because there is only one way. Twelve islands that all feel like one island.
 */
import type { Intent, IntentResult } from '../intents'

/* THE WIRE VERSION, checked in both directions.
 *
 * Both halves are built from this repo, so a mismatch is not a member's island
 * disagreeing with the engine: it is a stale cached worker chunk sitting beside
 * a fresh main chunk, which is an ordinary thing on a school Chromebook that has
 * had the tab open since Tuesday. Two comparisons turn a baffling silent failure
 * into one sentence.
 *
 * The OTHER version is `format` in a member's island.json, and that one matters
 * more, because those two repositories ship on different days. It lives in
 * grape-source.ts with the rest of the manifest. */
export const PROTOCOL = 1

/* engine -> island */
export type ToWorker =
  /* the island's whole package, sent as files rather than as a string to exec.
   * That is what makes a traceback name questions.py line 7 instead of <stdin>,
   * across as many files as the member split their island into.
   *
   * `island` is the folder the files land in on the runtime's own filesystem,
   * and it is also what puts that folder on sys.path, which is what lets
   * island.py say `from questions import Quiz` about the file beside it. */
  | { t: 'load'; v: number; island: string; entry: string; files: Record<string, string> }
  /* fire one registered handler. Strictly one at a time: the protocol is one
   * message in and one message out, and a second call arriving while the first
   * is parked on a `say` would resume the wrong generator. */
  | { t: 'call'; handler: string }
  | { t: 'resume'; result: IntentResult }

/* island -> engine */
export type FromWorker =
  /* the island imported cleanly and these are the handlers it registered.
   *
   * The engine needs the LIST and not just the fact. That list is what lets an
   * anchor nobody claims say so by name, instead of producing a silence a member
   * cannot tell apart from a typo in their own file. */
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

/* WHAT THE PUMP LEAVES IN `_step`, which is not quite what goes on the wire.
 *
 * The version is stamped on this side rather than in python, so exactly one file
 * knows the number and there is no second place for it to fall out of step. */
export type PyStep =
  | { t: 'ready'; handlers: string[] }
  | { t: 'intent'; intent: Intent }
  | { t: 'done' }
