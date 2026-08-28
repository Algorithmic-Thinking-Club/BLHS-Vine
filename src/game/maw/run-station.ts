/* THE DRIVER: pump a generator of intents until it is done.
 *
 * Nine lines of real work, and it is the load-bearing nine. This is the exact
 * protocol the MicroPython worker will speak, written first against TypeScript
 * generators so the shape is proven before the runtime lands:
 *
 *   the body yields an intent  ->  the engine performs it
 *   the engine sends the result back in  ->  the body resumes with it
 *   the engine throws in  ->  the body sees an exception at the yield
 *
 * That last line is PEP 342's `generator.throw()`, and it is why a failed intent
 * is not swallowed. A member who asks to walk to an anchor that does not exist
 * gets a traceback pointing at their own line, not a station that quietly did
 * nothing. VINE-AND-GRAPE.md flags `generator.send()` in the wasm build as the
 * one unproven load-bearing assumption in the whole design; when that spike
 * runs, this file is the shape it has to match.
 *
 * WHY NOT ASYNC/AWAIT. A dropped `await` is silent and a dropped `yield` is a
 * generator object that obviously never ran, which `type(x).__name__` catches at
 * dispatch and can be explained to a beginner in one sentence. That difference
 * is worth the whole design.
 */
import { performIntent, type Intent, type IntentHost } from '../../vine/intents'

/* a body that has stopped making progress. Not a real limit anyone reaches: a
 * station is a handful of lines. It exists so a `while True:` in a member's
 * island stops the island instead of the browser tab. */
const MAX_STEPS = 10_000

export type StationBody = Generator<Intent, void, unknown>

export type RunReport = {
  steps: number
  /* intents the engine refused, kept so a debug overlay can show an author what
   * their island asked for that this map cannot answer */
  refused: { intent: string; why: string }[]
  error?: string
}

export async function runStation(body: StationBody, host: IntentHost, label = 'station'): Promise<RunReport> {
  const report: RunReport = { steps: 0, refused: [] }
  /* what to hand back at the next resume: either a value from a completed
   * intent, or an error to raise at the yield that asked for it */
  let send: unknown
  let raise: Error | null = null

  for (;;) {
    if (report.steps++ > MAX_STEPS) {
      report.error = `${label} yielded ${MAX_STEPS} times without finishing`
      console.error(`[station] ${report.error}`)
      try { body.return(undefined) } catch { /* a body that refuses to close is already gone */ }
      return report
    }

    let step: IteratorResult<Intent, void>
    try {
      step = raise ? body.throw(raise) : body.next(send)
    } catch (e) {
      /* the body did not catch what was thrown in, or it threw on its own. Its
       * own message is the useful one, so it is kept rather than wrapped. */
      report.error = e instanceof Error ? e.message : String(e)
      console.error(`[station] ${label}:`, report.error)
      return report
    }
    raise = null
    if (step.done) return report

    const intent: Intent = step.value
    /* a body that yields something that is not an intent is a body with a typo,
     * and it should hear about it at the line that did it */
    if (!intent || typeof intent !== 'object' || typeof intent.kind !== 'string') {
      raise = new Error(`yielded ${JSON.stringify(intent)}, which is not an intent`)
      continue
    }

    const result = await performIntent(intent, host)
    if (result.ok) {
      send = result.value
    } else {
      report.refused.push({ intent: intent.kind, why: result.why })
      send = undefined
      raise = new Error(`${intent.kind}: ${result.why}`)
    }
  }
}
