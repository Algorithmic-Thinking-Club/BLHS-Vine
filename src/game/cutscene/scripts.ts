/* THE SCRIPT REGISTRY: a name a station or a grape yields, and the steps behind it.
 *
 * `{ kind: 'cutscene', script: 'maw-founding' }` has been in the Maw's station
 * table since the room was written, and there has never been anything anywhere
 * that turned that string into steps. The intent threw, correctly, and what it
 * threw about was two missing things at once: no stage on a painted map, and no
 * table of scripts. This is the second one.
 *
 * WHY ANCHOR NAMES AND NOT COORDINATES, here as everywhere. A cutscene step takes
 * a world position, so the scene resolves an anchor name into one at play time
 * (`resolveScript` below). A script with an x and a y in it would break the moment
 * Ash moved the desk, and moving the desk is the whole reason anchors exist.
 *
 * WHAT THIS CONTENT IS. The lines below are ENGINE PROOF: enough of a scene to
 * show that a painted map can be directed, written so nothing in it states a fact
 * about the real school. Principal Panther is a character in an island game and
 * says nothing a student could mistake for Bonney Lake. The real founding scene is
 * Ash's to write and his verdict is the only thing that makes it good.
 */
import type { Script, Step } from './types'

/* a step whose position is an ANCHOR NAME rather than a point. The scene swaps it
 * for the anchor's real spot when the script is played, so the same script runs on
 * a stand-in and on the painting that replaces it. */
export type AtAnchor = { at?: string }

/* the map's own shot, read off an anchor's meta bag. See pmap/framings.ts for
 * why it lives in the bag today and what MAPVIS W2 replaces it with. */
export type { Framing } from '../pmap/framings'
import { shotOf, type Framing } from '../pmap/framings'

export type AuthoredStep =
  | Step
  /* `zoom` is the FALLBACK now and not the shot. If the anchor carries a framing
   * the map's own number wins, because the person who cut the map knows how far
   * out it reads and the person writing the script usually does not. `framing`
   * asks for one by name when an anchor carries more than one. */
  | ({ t: 'cameraAt'; anchor: string; zoom?: number; framing?: string; ms: number })
  | ({ t: 'moveTo'; actor: string; anchor: string; speed?: number; face?: string })
  | ({ t: 'gateAt'; anchor: string; radius?: number; prompt?: string; required?: boolean })

export type AuthoredScript = { id: string; steps: AuthoredStep[] }

export const SCRIPTS: AuthoredScript[] = [
  {
    /* THE FOUNDING EVENT, staged at `principal_desk`. Short on purpose: it is the
     * first thing a student sees inside the mountain and §7.5's whole year is
     * forty minutes. It uses one of everything the stage owes so that a run of it
     * proves the stage rather than proving one step. */
    id: 'maw-founding',
    steps: [
      { t: 'letterbox', on: true },
      { t: 'vignette', to: 0.55, ms: 500 },
      /* NO NUMBER HERE ANY MORE. It read `zoom: 1.35`, which was a value somebody
       * typed once for one painting, and the day that painting is re-cut the shot
       * is wrong and nothing says so. The desk carries its own framing and this
       * asks for it by name; the fallback is only reached on a map whose author
       * has not framed it. */
      { t: 'cameraAt', anchor: 'principal_desk', framing: 'close', zoom: 1.35, ms: 900 },
      { t: 'say', who: 'Principal Panther', text: 'You made it inside. Most of them stand on the bridge a while first.', portrait: 'principal' },
      { t: 'say', who: 'Principal Panther', text: 'This is the Maw. Everything you plan, you plan in here, and everything you bring back, you bring back to here.' },
      { t: 'vignette', to: 0, ms: 500 },
      { t: 'say', who: 'Principal Panther', text: 'The chart table is behind you. Four years fit on one sheet, which is less room than it sounds like.' },
      { t: 'cameraFollow', actor: 'thor' },
      { t: 'letterbox', on: false },
      /* control handed back before the script ends, which is H3: the last beat is
       * the player's. The gate is not required, so hold-to-skip may pass it. */
      { t: 'gateAt', anchor: 'chart_table', radius: 26, prompt: 'Walk to the chart table', required: false },
    ],
  },
]

const byId = new Map(SCRIPTS.map((s) => [s.id, s]))
export const scriptById = (id: string) => byId.get(id)

/* TURN ANCHOR NAMES INTO POSITIONS, once, at play time.
 *
 * A step naming an anchor the map does not have is DROPPED and named, rather than
 * played at the origin. Landing the camera in the rock is the kind of failure that
 * reads as "cutscenes are broken" when what happened is one typo, and a script
 * written for the Maw will one day be played on a map that spells a post
 * differently. */
export function resolveScript(
  s: AuthoredScript,
  spotOf: (name: string) => { x: number; y: number } | null,
  /* THE MAP'S OWN SHOT, when it has one. Passed in rather than imported so this
   * function stays a pure resolver a test can drive with three lines, which is
   * what made the missing-anchor refusal testable in the first place. */
  framingOf?: (anchor: string, name?: string) => Framing | null,
): { script: Script; missing: string[] } {
  const missing: string[] = []
  const steps: Step[] = []
  for (const st of s.steps) {
    if (st.t === 'cameraAt' || st.t === 'moveTo' || st.t === 'gateAt') {
      const p = spotOf(st.anchor)
      if (!p) { missing.push(st.anchor); continue }
      if (st.t === 'cameraAt') {
        /* THE MAP WINS. A framing is authored where the thing is, so re-cutting a
         * painting moves its own close-up with it; a number in a script is a
         * guess made once, somewhere else, that nothing revisits. */
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
