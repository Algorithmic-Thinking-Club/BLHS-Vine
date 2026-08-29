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

export type AuthoredStep =
  | Step
  | ({ t: 'cameraAt'; anchor: string; zoom?: number; ms: number })
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
      { t: 'cameraAt', anchor: 'principal_desk', zoom: 1.35, ms: 900 },
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
): { script: Script; missing: string[] } {
  const missing: string[] = []
  const steps: Step[] = []
  for (const st of s.steps) {
    if (st.t === 'cameraAt' || st.t === 'moveTo' || st.t === 'gateAt') {
      const p = spotOf(st.anchor)
      if (!p) { missing.push(st.anchor); continue }
      if (st.t === 'cameraAt') steps.push({ t: 'camera', to: p, zoom: st.zoom, ms: st.ms })
      else if (st.t === 'moveTo') steps.push({ t: 'actorMove', actor: st.actor, to: p, speed: st.speed, face: st.face })
      else steps.push({ t: 'gate', kind: 'walkTo', target: p, radius: st.radius ?? 24, prompt: st.prompt, required: st.required })
      continue
    }
    steps.push(st)
  }
  return { script: { id: s.id, steps }, missing }
}
