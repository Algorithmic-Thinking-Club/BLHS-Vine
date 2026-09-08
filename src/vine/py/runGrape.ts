/* the engine side of running a member's python island in a worker, one intent at a time */
import { no, performIntent, type Intent, type IntentHost, type IntentResult } from '../intents'
import { PROTOCOL, type FromWorker, type ToWorker } from './protocol'
import type { LoadedGrape } from './grape-source'

/* Not a real limit anyone reaches: an island beat is a handful of lines. It
 * exists so a `while True:` that still yields stops the island instead of the
 * browser tab. The same number, for the same reason, as run-station.ts. */
const MAX_STEPS = 10_000

/* two clocks: one for the island starting up, one for the member's python answering */
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
  /** whether a handler is running right now, asked before a press rather than after one */
  busy: () => boolean
  /* the other half of the sandbox. A worker left running holds a python heap,
   * and a scene that unmounts mid-say must not leave one behind. */
  stop: () => void
}

export function openGrape(
  island: LoadedGrape,
  host: IntentHost,
  opts: {
    onPrint?: (text: string) => void; bootMs?: number; turnMs?: number
    /* the engine's own islands may skip the programme stamp on their flags */
    unscoped?: boolean
  } = {},
): GrapeSession {
  /* new URL(..., import.meta.url) rather than a string path: it is the form
   * vite follows into a real chunk in a production build. */
  const worker = new Worker(new URL('./grape.worker.ts', import.meta.url), { type: 'module' })

  /* every intent is stamped with the island's own programme id, so flags stay apart */
  const scoped: IntentHost = opts.unscoped
    ? { ...host }
    : { ...host, by: { grape: island.manifest.programme } }

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
    /* the island stopped answering, so the call ends here rather than hanging */
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

/* what a torn-down call settles with, so nobody reads it as a clean finish */
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
      /* a call after teardown answers here rather than posting into a dead worker */
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
    busy: () => waiting !== null,
    stop() {
      if (stopped) return
      stopped = true
      worker.terminate()
      finish(CLOSED)
    },
  }
}
