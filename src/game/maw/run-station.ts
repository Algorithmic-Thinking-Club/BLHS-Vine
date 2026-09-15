// the driver: pump a generator of intents until it is done, handing each result back in
import { performIntent, type Intent, type IntentHost } from '../../vine/intents'

/* a ceiling on a body that has stopped making progress, so a `while True:` in a member's island stops the island instead of the browser tab */
const MAX_STEPS = 10_000

export type StationBody = Generator<Intent, void, unknown>

export type RunReport = {
  steps: number
  /* intents the engine refused, kept so a debug overlay can show what an island asked for that this map cannot answer */
  refused: { intent: string; why: string }[]
  error?: string
}

export async function runStation(body: StationBody, host: IntentHost, label = 'station'): Promise<RunReport> {
  const report: RunReport = { steps: 0, refused: [] }
  /* what to hand back at the next resume: a value from a completed intent, or an error to raise at the yield that asked for it */
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
      /* the body did not catch what was thrown in, or threw on its own, and its own message is kept rather than wrapped because it is the useful one */
      report.error = e instanceof Error ? e.message : String(e)
      console.error(`[station] ${label}:`, report.error)
      return report
    }
    raise = null
    if (step.done) return report

    const intent: Intent = step.value
    /* a body yielding something that is not an intent has a typo, and should hear about it at the line that did it */
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
