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
 */
import { no, performIntent, type Intent, type IntentHost } from '../intents'
import type { FromWorker, ToWorker } from './protocol'

/* Not a real limit anyone reaches: an island beat is a handful of lines. It
 * exists so a `while True:` that still yields stops the island instead of the
 * browser tab. The same number, for the same reason, as run-station.ts. */
const MAX_STEPS = 10_000

export type GrapeReport = {
  steps: number
  /* intents the engine refused, kept so a member can be shown what their island
   * asked for that this scene cannot answer */
  refused: { intent: string; why: string }[]
  /* set when the island stopped rather than finished. The engine is fine. */
  error?: string
  traceback?: string
}

export type GrapeRun = {
  done: Promise<GrapeReport>
  /* the other half of the sandbox. A worker left running holds a python heap,
   * and a scene that unmounts mid-say must not leave one behind. */
  stop: () => void
}

export function runGrape(
  island: { name: string; source: string; entry?: string },
  host: IntentHost,
  onPrint?: (text: string) => void,
): GrapeRun {
  /* new URL(..., import.meta.url) rather than a string path: it is the form
   * vite follows into a real chunk in a production build. */
  const worker = new Worker(new URL('./grape.worker.ts', import.meta.url), { type: 'module' })
  const report: GrapeReport = { steps: 0, refused: [] }
  let settled = false
  let resolve!: (r: GrapeReport) => void
  const done = new Promise<GrapeReport>((r) => { resolve = r })

  const finish = (error?: string, traceback?: string) => {
    if (settled) return
    settled = true
    if (error) { report.error = error; report.traceback = traceback }
    worker.terminate()
    resolve(report)
  }

  const step = async (intent: Intent) => {
    if (report.steps++ > MAX_STEPS) {
      finish(`${island.name} yielded ${MAX_STEPS} times without finishing`)
      return
    }
    /* an island that yields something that is not an intent is an island with a
     * typo, and it should hear about it at the line that did it */
    if (!intent || typeof intent !== 'object' || typeof intent.kind !== 'string') {
      worker.postMessage({
        t: 'resume', result: no(`yielded ${JSON.stringify(intent)}, which is not an intent`),
      } satisfies ToWorker)
      return
    }
    const result = await performIntent(intent, host)
    /* the scene tore down while the player was reading a line. Nothing to
     * resume into: the worker is already gone. */
    if (settled) return
    if (!result.ok) report.refused.push({ intent: intent.kind, why: result.why })
    worker.postMessage({ t: 'resume', result } satisfies ToWorker)
  }

  worker.onerror = (e) => finish(`the island's worker did not load: ${e.message}`)
  worker.onmessage = (ev: MessageEvent) => {
    const msg = ev.data as FromWorker
    switch (msg.t) {
      case 'print': onPrint?.(msg.text); return
      case 'done': finish(); return
      case 'crash': finish(msg.error, msg.traceback); return
      case 'intent': void step(msg.intent)
    }
  }

  worker.postMessage({
    t: 'run',
    /* a bare filename: it becomes a real file on the runtime's filesystem, and
     * a path with a directory in it would have nowhere to land */
    name: island.name.replace(/^.*[\\/]/, ''),
    source: island.source,
    entry: island.entry ?? 'main',
  } satisfies ToWorker)

  return { done, stop: () => finish() }
}
