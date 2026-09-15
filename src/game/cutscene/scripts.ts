/* the table of cutscene scripts, keyed by the name a station or an island yields */
import type { Script, Step } from './types'

/* a step whose position is an anchor name rather than a point: the scene swaps it for the anchor's real spot at play time, so the same script runs on a stand-in and on the painting that replaces it */
export type AtAnchor = { at?: string }

/* the map's own shot, read off an anchor's meta bag, and pmap/framings.ts says why it lives in the bag today */
export type { Framing } from '../pmap/framings'
import { shotOf, type Framing } from '../pmap/framings'

export type AuthoredStep =
  | Step
  /* `zoom` is only the fallback: a framing the map itself carries wins */
  | ({ t: 'cameraAt'; anchor: string; zoom?: number; framing?: string; ms: number })
  | ({ t: 'moveTo'; actor: string; anchor: string; speed?: number; face?: string })
  | ({ t: 'gateAt'; anchor: string; radius?: number; prompt?: string; required?: boolean })

export type AuthoredScript = { id: string; steps: AuthoredStep[] }

export const SCRIPTS: AuthoredScript[] = [
  {
    /* the founding scene at the principal's desk, short and using one of every step */
    id: 'maw-founding',
    steps: [
      { t: 'letterbox', on: true },
      { t: 'vignette', to: 0.55, ms: 500 },
      /* the desk's own close-up shot, asked for by name, with a number as the fallback */
      { t: 'cameraAt', anchor: 'principal_desk', framing: 'close', zoom: 1.35, ms: 900 },
      { t: 'say', who: 'Principal Panther', text: 'You made it inside. Most of them stand on the bridge a while first.', portrait: 'principal' },
      { t: 'say', who: 'Principal Panther', text: 'This is the Maw. You plan your year in here. Classes, clubs, sports.' },
      { t: 'vignette', to: 0, ms: 500 },
      { t: 'say', who: 'Principal Panther', text: 'The year sheet table is behind you. That is where you pick your classes.' },
      { t: 'cameraFollow', actor: 'thor' },
      { t: 'letterbox', on: false },
      /* control is handed back before the script ends so the last beat is the player's, and the gate is not required so hold to skip may pass it */
      { t: 'gateAt', anchor: 'chart_table', radius: 26, prompt: 'Walk to the year sheet table', required: false },
    ],
  },
]

const byId = new Map(SCRIPTS.map((s) => [s.id, s]))
export const scriptById = (id: string) => byId.get(id)

/* turn a script's anchor names into positions, dropping any the map does not have */
export function resolveScript(
  s: AuthoredScript,
  spotOf: (name: string) => { x: number; y: number } | null,
  /* the map's own shot when it has one, passed in rather than imported so this stays a pure resolver a test can drive with three lines, which is what made the missing-anchor refusal testable */
  framingOf?: (anchor: string, name?: string) => Framing | null,
): { script: Script; missing: string[] } {
  const missing: string[] = []
  const steps: Step[] = []
  for (const st of s.steps) {
    if (st.t === 'cameraAt' || st.t === 'moveTo' || st.t === 'gateAt') {
      const p = spotOf(st.anchor)
      if (!p) { missing.push(st.anchor); continue }
      if (st.t === 'cameraAt') {
        /* the map wins: a framing is authored where the thing is, so re-cutting a painting moves its own close-up with it, while a number in a script is a guess made once somewhere else that nothing revisits */
        const f = framingOf?.(st.anchor, st.framing) ?? null
        if (f && st.zoom !== undefined && f.zoom !== undefined && f.zoom !== st.zoom)
          console.info(`[cutscene] ${s.id}: "${st.anchor}" is framed at ${f.zoom} by the map, so the script's ${st.zoom} is not used`)
        const shot = shotOf(p, f, st.zoom ?? 1)
        steps.push({ t: 'camera', to: { x: shot.x, y: shot.y }, zoom: shot.zoom, ms: st.ms })
        continue
      }
      if (st.t === 'moveTo') steps.push({ t: 'actorMove', actor: st.actor, to: p, speed: st.speed, face: st.face })
      else steps.push({ t: 'gate', kind: 'walkTo', target: p, radius: st.radius ?? 24, prompt: st.prompt, required: st.required })
      continue
    }
    steps.push(st)
  }
  return { script: { id: s.id, steps }, missing }
}
