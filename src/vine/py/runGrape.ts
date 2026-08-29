/* THE DRIVER, on the engine side.
 *
 * src/game/maw/run-station.ts pumps a TypeScript generator through the intent
 * vocabulary. This pumps a MicroPython one through the same vocabulary, across
 * a worker. It is the same twenty lines with postMessage where `body.next()`
 * was, which is the point: the protocol was designed against a generator first
 * so that this file would be a translation and not an invention.
 *
 *   worker says {t:'intent'}  ->  performIntent does it  ->  {t:'resume'} back
 *
 * A refusal is sent back as `ok:false` and the python side raises it at the
 * yield that asked, so a member's mistake lands on a member's line. Nothing is
 * shared: JSON over postMessage, no SharedArrayBuffer, no Atomics.wait.
 *
 * AN ISLAND IS OPENED ONCE AND CALLED MANY TIMES. `openGrape` loads the package
 * and comes back with the handlers it registered; `call` fires one of them. That
 * is the shape a map scene needs, where the island loads on entry and a handler
 * runs every time the player presses E on one of its anchors.
 */
import { no, performIntent, type Intent, type IntentHost, type IntentResult } from '../intents'
import { PROTOCOL, type FromWorker, type ToWorker } from './protocol'
import type { LoadedGrape } from './grape-source'

/* Not a real limit anyone reaches: an island beat is a handful of lines. It
 * exists so a `while True:` that still yields stops the island instead of the
 * browser tab. The same number, for the same reason, as run-station.ts. */
const MAX_STEPS = 10_000

/* TWO CLOCKS, AND THEY ARE NOT THE SAME CLOCK.
 *
 * BOOT covers MicroPython starting and the island importing. Generous, because
 * it includes fetching and compiling wasm on a 4 GB school Chromebook.
 *
 * TURNAROUND covers the member's python and nothing else: the gap between the
 * engine posting and the worker answering. It is short because that gap is pure
 * computation. THE PLAYER'S THINKING TIME IS NOT IN IT, because a `say` is the
 * ENGINE waiting for a click while the worker sits idle, so the clock is stopped
 * for as long as an intent is being performed. Get that wrong and every slow
 * reader kills their own island. */
const BOOT_MS = 20_000
const TURN_MS = 5_000

export type GrapeReport = {
  steps: number
  /* intents the engine refused, kept so a member can be shown what their island
   * asked for that this scene cannot answer */
  refused: { intent: string; why: string }[]
  /* set when the island stopped rather than finished. The engine is fine. */
  error?: string
  traceback?: string
}

export type GrapeReady = GrapeReport & { handlers: string[] }

export type GrapeSession = {
  /** resolves when the island has imported. `error` set means it did not. */
  ready: Promise<GrapeReady>
  /** every handler the island registered, once ready has resolved */
  handlers: () => string[]
  /** fire one handler and run it to the end */
  call: (handler: string) => Promise<GrapeReport>
  /* the other half of the sandbox. A worker left running holds a python heap,
   * and a scene that unmounts mid-say must not leave one behind. */
  stop: () => void
}

export function openGrape(
  island: LoadedGrape,
  host: IntentHost,
  opts: { onPrint?: (text: string) => void; bootMs?: number; turnMs?: number } = {},
): GrapeSession {
  /* new URL(..., import.meta.url) rather than a string path: it is the form
   * vite follows into a real chunk in a production build. */
  const worker = new Worker(new URL('./grape.worker.ts', import.meta.url), { type: 'module' })

  /* WHO IS SPEAKING, ATTACHED HERE SO NO CALLER CAN FORGET IT. Every intent
   * this session performs is stamped with the island's own programme id, which
   * is what keeps one member's flags out of another's (P4). A scene that built
   * the host itself would have to remember, and one day would not. */
  const scoped: IntentHost = { ...host, by: { grape: island.manifest.programme } }

  let handlers: string[] = []
  let dead: { error: string; traceback?: string } | null = null
  let stopped = false
  /* whoever is owed the next message. Strictly one at a time, which the
   * protocol's own comment requires and this is what enforces it. */
  let waiting: { report: GrapeReport; settle: (r: GrapeReport) => void } | null = null
  let clock: ReturnType<typeof setTimeout> | null = null

  const disarm = () => { if (clock) { clearTimeout(clock); clock = null } }
  const arm = (ms: number, why: string) => {
    disarm()
    /* the island stopped answering. Nothing will ever arrive, so ending it here
     * is the difference between a sentence and a scene that hangs forever. No
     * traceback: this is the engine giving up, not python raising, and rendering
     * the same sentence twice with one of them in a <pre> reads like one. */
    clock = setTimeout(() => kill(why), ms)
  }

  /** end whatever call is in flight. Not the session. */
  function finish(error?: string, traceback?: string) {
    const w = waiting
    waiting = null
    disarm()
    if (!w) return
    if (error) { w.report.error = error; w.report.traceback = traceback }
    w.settle(w.report)
  }

  /** the island is gone and so is the worker. Everything still owed is answered. */
  function kill(error: string, traceback?: string) {
    if (stopped) return
    stopped = true
    dead = { error, traceback }
    worker.terminate()
    finish(error, traceback)
  }

  /* A TORN-DOWN CALL IS NOT A FINISHED ONE, and `finish()` with no argument said
   * it was. A scene unmounting mid-say settled the call as a clean success, so a
   * caller could not tell "the handler ran to the end" from "I terminated the
   * worker while the player was reading", and an island whose award never ran
   * reported no error at all. The harness only survived that because it throws
   * the value away after unmount; PmapScene's fire() will not. */
  const CLOSED = 'this island was closed before it finished'

  let readyResolve!: (r: GrapeReport) => void
  const ready = new Promise<GrapeReady>((resolve) => {
    /* runs synchronously, so this is set before anything below can reach it */
    readyResolve = (r) => resolve({ ...r, handlers })
  })

  const send = (result: IntentResult) => {
    arm(opts.turnMs ?? TURN_MS, 'the island stopped answering')
    worker.postMessage({ t: 'resume', result } satisfies ToWorker)
  }

  const step = async (intent: Intent) => {
    const w = waiting
    if (!w) return
    if (++w.report.steps > MAX_STEPS) {
      kill(`the island yielded ${MAX_STEPS} times without finishing`)
      return
    }
    /* an island that yields something that is not an intent is an island with a
     * typo, and it should hear about it at the line that did it */
    if (!intent || typeof intent !== 'object' || typeof intent.kind !== 'string') {
      send(no(`yielded ${JSON.stringify(intent)}, which is not an intent`))
      return
    }
    /* THE CLOCK IS OFF FOR THIS. performIntent is where a `say` waits on a
     * person, and a person is allowed to take as long as they like. */
    disarm()
    const result = await performIntent(intent, scoped)
    /* the scene tore down, or this call ended, while the player was reading a
     * line. Nothing to resume into. */
    if (stopped || waiting !== w) return
    if (!result.ok) w.report.refused.push({ intent: intent.kind, why: result.why })
    send(result)
  }

  worker.onerror = (e) => kill(`the island's worker did not load: ${e.message}`)
  worker.onmessage = (ev: MessageEvent) => {
    const msg = ev.data as FromWorker
    switch (msg.t) {
      case 'print': opts.onPrint?.(msg.text); return
      case 'ready':
        disarm()
        if (msg.v !== PROTOCOL) {
          kill(`the page speaks protocol ${PROTOCOL} and the worker speaks ${msg.v}. Reload the page.`)
          return
        }
        handlers = msg.handlers
        finish()
        return
      case 'done': finish(); return
      /* THE ISLAND STOPPED AND THE SESSION DID NOT. The module is still
       * imported and its other handlers still work, which the spike measured
       * and which means one broken beat does not cost a member their island. */
      case 'crash': finish(msg.error, msg.traceback); return
      case 'intent': void step(msg.intent)
    }
  }

  /* the load is the first thing owed an answer, so it goes through the same
   * one-at-a-time slot every call afterwards does */
  waiting = { report: { steps: 0, refused: [] }, settle: (r) => readyResolve(r) }
  arm(opts.bootMs ?? BOOT_MS, 'micropython did not start, or the island never finished importing')
  worker.postMessage({
    t: 'load',
    v: PROTOCOL,
    island: island.island,
    entry: island.manifest.entry,
    files: island.files,
    manifest: { ...island.manifest },
  } satisfies ToWorker)

  return {
    ready,
    handlers: () => handlers,
    call(handler: string): Promise<GrapeReport> {
      const report: GrapeReport = { steps: 0, refused: [] }
      /* `stopped` and not just `dead`. stop() leaves `dead` null, so a call after
       * a teardown used to take the happy path, post to a terminated worker,
       * which is a silent no-op, and then never settle at all: a promise nobody
       * can ever resolve, a slot nobody can ever free, and a five second timer
       * whose kill() returns immediately because the session is already stopped. */
      if (stopped || dead) {
        return Promise.resolve({ ...report, error: dead?.error ?? CLOSED, traceback: dead?.traceback })
      }
      /* one message in, one message out. A second press while the first handler
       * is parked on a `say` would resume the wrong generator. */
      if (waiting) return Promise.resolve({ ...report, error: 'this island is already busy' })

      return new Promise<GrapeReport>((settle) => {
        waiting = { report, settle }
        arm(opts.turnMs ?? TURN_MS, 'the island stopped answering')
        worker.postMessage({ t: 'call', handler } satisfies ToWorker)
      })
    },
    stop() {
      if (stopped) return
      stopped = true
      worker.terminate()
      finish(CLOSED)
    },
  }
}
