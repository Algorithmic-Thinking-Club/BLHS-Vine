/* the harness scene that runs a python island end to end with nothing faked */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Dialogue } from '../../game/hud/Dialogue'
import { choose, clearDialogue, say } from '../../game/dialogue'
import { engine } from '../../game/intent-engine'
import type { IntentEngine, IntentWorld, RunPath } from '../intents'
import type { SessionMode } from '../contract'
import { fetchGrape, parseGrapeRef, baseUrlOf, type LoadedGrape } from './grape-source'
import { openGrape, type GrapeReport, type GrapeSession } from './runGrape'

/* the world half for a scene with no map: say and choose work, the rest refuse out loud */
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
  /* and there is no ocean on a bench, so a voyage refuses by name too */
  sailTo: noMap('sail_to'),
  /* THE HARNESS HAS NO RUN TO END. `?scene=grape` is a bench for one file of a
   * member's Python; there is no save behind it and no title to go back to, so
   * this refuses by name the way every other world word does here. */
  endRun: noMap('end_run'),
  /* a boat is a body on a painting, like everything else here */
  ashore: noMap('ashore'),
  cutscene: noMap('cutscene'),
  /* the composed shots need a painting to be composed of, like every other
   * camera word here */
  view: noMap('view'),
  /* the director words all need a painting, so every one of them refuses here */
  pose: noMap('pose'),
  actorMove: noMap('actor_move'),
  leadTo: noMap('lead_to'),
  place: noMap('place'),
  actorFace: noMap('actor_face'),
  actorLook: noMap('actor_look'),
  actorRelease: noMap('actor_release'),
  route: noMap('route'),
  framing: noMap('framing'),
  waitFor: noMap('wait_for'),
}

type Seen = { what: string; detail: string }

export default function GrapeProof() {
  const params = useMemo(() => new URLSearchParams(window.location.search), [])
  const ref = useMemo(() => parseGrapeRef(params), [params])
  const base = baseUrlOf(ref)
  const arm: SessionMode = params.get('arm') === 'plain' ? 'plain' : 'game'

  const [status, setStatus] = useState('starting')
  const [loaded, setLoaded] = useState<LoadedGrape | null>(null)
  const [handlers, setHandlers] = useState<string[]>([])
  const [report, setReport] = useState<GrapeReport | null>(null)
  const [printed, setPrinted] = useState<string[]>([])
  const [seen, setSeen] = useState<Seen[]>([])
  const [busy, setBusy] = useState(false)
  const run = useRef<GrapeSession | null>(null)
  const alive = useRef(true)

  /* a wrapper that picks the study arm for the harness and notes what the engine did */
  const host = useMemo(() => {
    const note = (what: string, detail: string) =>
      setSeen((s) => [...s, { what, detail }])

    const watched: IntentEngine = {
      ...engine,
      mode: () => arm,
      read: (path: RunPath) => (path === 'mode' ? arm : engine.read(path)),
      openUi: (ui) => { note('open', ui); engine.openUi(ui) },
      setFlag: (f) => { note('set_flag', f); engine.setFlag(f) },
      log: (e, d) => { note('log', d ? `${e} ${JSON.stringify(d)}` : e); engine.log(e, d) },
      award: (a) => {
        note('award', `${JSON.stringify(a)}${engine.read('handle') === null
          ? '  (no saved run here, so nothing was recorded)' : ''}`)
        engine.award(a)
      },
      playBeat: async (b, plain) => {
        const g = await engine.playBeat(b, plain)
        note('play', `${b} (${plain ? 'plain' : 'game'}) came back ${g === null ? 'None' : g}`)
        return g
      },
    }
    return { world, engine: watched }
  }, [arm])

  const start = useCallback(async () => {
    run.current?.stop()
    clearDialogue()
    setReport(null); setPrinted([]); setSeen([]); setHandlers([]); setLoaded(null)
    setStatus(`fetching ${base}island.json`)

    let island: LoadedGrape
    try {
      island = await fetchGrape(ref)
    } catch (e) {
      if (!alive.current) return
      setStatus('could not load this island')
      setReport({ steps: 0, refused: [], error: e instanceof Error ? e.message : String(e) })
      return
    }
    if (!alive.current) return
    setLoaded(island)
    setStatus(`starting micropython for ${island.manifest.title}`)

    const s = openGrape(island, host, { onPrint: (t) => setPrinted((p) => [...p, t]) })
    run.current = s

    const ready = await s.ready
    if (!alive.current) return
    if (ready.error) {
      setStatus('the island did not import')
      setReport(ready)
      return
    }
    setHandlers(ready.handlers)
    setStatus(`loaded, ${ready.handlers.length} handler${ready.handlers.length === 1 ? '' : 's'}`)

    /* THE ENGINE CALLING IN, UNPROMPTED, which is the whole inversion. Nothing
     * in the member's file asks for this. */
    if (ready.handlers.includes('start')) {
      const r = await s.call('start')
      if (!alive.current) return
      if (r.error) setReport(r)
    }
  }, [base, ref, host])

  const fire = useCallback(async (handler: string) => {
    const s = run.current
    if (!s || busy) return
    setBusy(true)
    setReport(null)
    const r = await s.call(handler)
    if (!alive.current) return
    setBusy(false)
    if (r.error || r.refused.length) setReport(r)
  }, [busy])

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
    ;(window as unknown as Record<string, unknown>).__grape = {
      base, arm, status, handlers, report, seen, title: loaded?.manifest.title ?? null,
    }
  }, [base, arm, status, handlers, report, seen, loaded])

  const talks = handlers.filter((h) => h.startsWith('talk:'))

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
        <div style={{ color: '#ffd27a' }}>
          grape proof · micropython in a worker · {base} · {arm} arm
        </div>
        <div>{status}{loaded ? ` · ${loaded.manifest.modules.length} modules` : ''}</div>
        {handlers.length > 0 && <div style={{ color: '#8fb8c8' }}>handlers: {handlers.join(', ')}</div>}
        {printed.map((line, i) => <div key={i} style={{ color: '#9fd6a8' }}>print: {line}</div>)}
        {seen.map((s, i) => <div key={i} style={{ color: '#c8b8e8' }}>{s.what}: {s.detail}</div>)}
        {report?.refused.map((r, i) => (
          <div key={i} style={{ color: '#ffb27a' }}>refused {r.intent}: {r.why}</div>
        ))}
      </div>

      {/* STANDING IN FOR PmapScene's fire(). One button per anchor the island
          said it owns, which is the list that came back on `ready`. */}
      {talks.length > 0 && (
        <div style={{
          position: 'absolute', left: 16, bottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          {talks.map((h) => (
            <button
              key={h}
              disabled={busy}
              onClick={() => { void fire(h) }}
              style={{
                padding: '7px 14px', cursor: busy ? 'default' : 'pointer',
                background: busy ? '#22303a' : '#1d3a46', border: '1px solid #3f6a7a',
                borderRadius: 3, color: busy ? '#6d8390' : '#cfe6ee',
                fontFamily: "'Deckhand', monospace", fontSize: 14,
              }}
            >
              press E on {h.slice(5)}
            </button>
          ))}
        </div>
      )}

      {/* the crash card: the island stopped and this page can still re-run it */}
      {report?.error && (
        <div style={{
          position: 'absolute', left: '50%', top: '36%', transform: 'translate(-50%, -50%)',
          width: 'min(620px, 82vw)', padding: '22px 26px 24px',
          background: 'rgba(20, 12, 6, .92)', border: '2px solid #6b4a24', borderRadius: 4,
          boxShadow: '0 10px 40px rgba(0,0,0,.5)', textAlign: 'center',
        }}>
          <div style={{
            fontFamily: "'Harbormaster', 'Deckhand', monospace", fontSize: 26,
            color: '#f0d9a8', letterSpacing: '.02em',
          }}>
            This island stopped working
          </div>
          <div style={{
            marginTop: 10, fontFamily: "'Deckhand', monospace", fontSize: 16, color: '#c8b189',
          }}>
            {report.error}
          </div>
          {report.traceback && (
            <pre style={{
              marginTop: 14, marginBottom: 16, padding: '10px 12px', textAlign: 'left',
              background: 'rgba(0,0,0,.45)', border: '1px solid #3d2a15', borderRadius: 3,
              fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6, color: '#9db3b0',
              whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 150,
            }}>{report.traceback}</pre>
          )}
          <button
            onClick={() => { void start() }}
            style={{
              marginTop: report.traceback ? 0 : 16,
              padding: '8px 20px', cursor: 'pointer', background: '#3d2a15',
              border: '1px solid #6b4a24', borderRadius: 3, color: '#f0d9a8',
              fontFamily: "'Deckhand', monospace", fontSize: 15,
            }}
          >
            Load the island again
          </button>
        </div>
      )}

      {/* the real box. Same component the Maw's stations draw through. */}
      <Dialogue />
    </div>
  )
}
