/* THE PROOF, and only the proof.
 *
 * A harness scene in the same family as ?scene=objmap and ?scene=pmap: it
 * exists so one thing can be watched working end to end with nothing else in
 * the frame. What it watches is the whole pipe, with no piece of it faked.
 *
 *   public/grapes/hello.py  ->  fetched as a file
 *   runGrape                ->  MicroPython in a worker, off the main thread
 *   yield say(...)          ->  performIntent (src/vine/intents.ts)
 *   IntentWorld.say         ->  the dialogue bus (src/game/dialogue.ts)
 *   <Dialogue />            ->  the real box, the real typewriter, the real art
 *   the player clicks       ->  the index goes back in, python branches on it
 *
 * ADDED TO THE ENGINE: nothing. Every part above already existed; the two lines
 * that bind say and choose to the bus are the same two lines PmapScene:1419
 * already has. This file is a host, not a capability.
 *
 *   ?scene=grape              runs public/grapes/hello.py
 *   ?scene=grape&py=broken.py runs the one that crashes, which is step three
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Dialogue } from '../../game/hud/Dialogue'
import { choose, clearDialogue, say } from '../../game/dialogue'
import { engine } from '../../game/intent-engine'
import type { IntentWorld } from '../intents'
import { runGrape, type GrapeReport, type GrapeRun } from './runGrape'

/* THE WORLD HALF, for a scene with no map.
 *
 * say and choose are real. Everything else in the vocabulary refuses out loud:
 * performIntent catches a throw and turns it into { ok: false }, and the driver
 * raises that at the member's own yield, so an island asking this harness to
 * walk somebody gets told rather than quietly doing nothing. */
const noMap = (what: string) => (): never => {
  throw new Error(`${what} needs a map, and the proof harness has none`)
}

const world: IntentWorld = {
  mapId: () => 'grape-proof',
  hasAnchor: () => false,
  say: (who, text, portrait) => say({ who, text, portrait }),
  choose: (prompt, options) => choose({ prompt, options }),
  guideTo: noMap('guide_to'),
  walkTo: noMap('walk_to'),
  lookAt: noMap('look_at'),
  show: noMap('show'),
  fx: noMap('fx'),
  enter: noMap('enter'),
  cutscene: noMap('cutscene'),
}

export default function GrapeProof() {
  /* A WHITELIST, NOT A STRIP. Stripping unwanted characters let ".." through
   * intact, and fetch normalises "/grapes/.." to "/", which hands the SPA's own
   * index.html back as the island's source. Requiring a plain filename is one
   * regex and has no edge to find. */
  const asked = new URLSearchParams(window.location.search).get('py') ?? ''
  const file = /^[\w-]+\.py$/.test(asked) ? asked : 'hello.py'

  const [status, setStatus] = useState('starting micropython')
  const [report, setReport] = useState<GrapeReport | null>(null)
  const [printed, setPrinted] = useState<string[]>([])
  const run = useRef<GrapeRun | null>(null)
  const alive = useRef(true)

  const start = useCallback(async () => {
    run.current?.stop()
    clearDialogue()
    setReport(null)
    setPrinted([])
    setStatus(`fetching /grapes/${file}`)

    const res = await fetch(`/grapes/${file}`, { cache: 'no-store' })
    if (!res.ok) { setStatus(`could not fetch /grapes/${file} (${res.status})`); return }
    const source = await res.text()
    if (!alive.current) return

    setStatus(`${file} is running`)
    const r = runGrape({ name: file, source }, { world, engine }, (text) => {
      setPrinted((p) => [...p, text])
    })
    run.current = r

    const done = await r.done
    if (!alive.current) return
    setReport(done)
    setStatus(done.error ? `${file} stopped` : `${file} finished, ${done.steps} intents`)
  }, [file])

  useEffect(() => {
    alive.current = true
    void start()
    return () => {
      alive.current = false
      /* both halves of the teardown. The worker holds a python heap, and
       * anything the island was still waiting on has to be released or the
       * next scene opens with the world locked. */
      run.current?.stop()
      clearDialogue()
    }
  }, [start])

  /* a flag for the headless verifier to wait on, so a screenshot is never taken
   * of a half-started runtime. Nothing in the game reads it. */
  useEffect(() => {
    ;(window as unknown as Record<string, unknown>).__grape = { file, status, report }
  }, [file, status, report])

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a1a22', overflow: 'hidden' }}>
      {/* something behind the box, so the screenshot shows a dialogue box over a
          scene rather than a box floating on nothing */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 70% 60% at 50% 42%, #14323d 0%, #071219 100%)',
      }} />

      <div style={{
        position: 'absolute', top: 14, left: 16, right: 16,
        fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7,
        color: 'rgba(190, 214, 210, .8)', textShadow: '0 1px 2px rgba(0,0,0,.8)',
        pointerEvents: 'none',
      }}>
        <div style={{ color: '#ffd27a' }}>grape proof · micropython in a worker · /grapes/{file}</div>
        <div>{status}</div>
        {printed.map((line, i) => <div key={i} style={{ color: '#9fd6a8' }}>print: {line}</div>)}
        {report?.refused.map((r, i) => <div key={i} style={{ color: '#ffb27a' }}>refused {r.intent}: {r.why}</div>)}
      </div>

      {/* STEP THREE. The island stopped; this page did not. The button below is
          the honest half of the claim: it re-runs the same file, from a page
          that is still alive after a member's python raised in it. */}
      {report?.error && (
        <div style={{
          position: 'absolute', left: '50%', top: '38%', transform: 'translate(-50%, -50%)',
          width: 'min(620px, 82vw)', padding: '22px 26px 24px',
          background: 'rgba(20, 12, 6, .92)', border: '2px solid #6b4a24', borderRadius: 4,
          boxShadow: '0 10px 40px rgba(0,0,0,.5)', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'Harbormaster', 'Deckhand', monospace", fontSize: 26,
            color: '#f0d9a8', letterSpacing: '.02em',
          }}>
            island under construction
          </div>
          <div style={{
            marginTop: 10, fontFamily: "'Deckhand', monospace", fontSize: 16, color: '#c8b189',
          }}>
            {report.error}
          </div>
          <pre style={{
            marginTop: 14, marginBottom: 16, padding: '10px 12px', textAlign: 'left',
            background: 'rgba(0,0,0,.45)', border: '1px solid #3d2a15', borderRadius: 3,
            fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, color: '#9db3b0',
            whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 150,
          }}>{report.traceback}</pre>
          <button
            onClick={() => { void start() }}
            style={{
              padding: '8px 20px', cursor: 'pointer', background: '#3d2a15',
              border: '1px solid #6b4a24', borderRadius: 3, color: '#f0d9a8',
              fontFamily: "'Deckhand', monospace", fontSize: 15,
            }}
          >
            run it again
          </button>
        </div>
      )}

      {/* the real box. Same component the Maw's stations draw through. */}
      <Dialogue />
    </div>
  )
}
