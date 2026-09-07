/* THE MOVIE SWITCH: one flag that says this stretch is watched, not played.
 *
 * BRIEF-ARRIVAL item 1, in Ash's words: *"The crossing is a cutscene. Same
 * point of view the ship had sailing out from the beach, with the two black
 * bars top and bottom, like a movie. No HUD, no plaques, no 'Get in the boat',
 * no drive-ship control of any kind."*
 *
 * WHY A BUS AND NOT A PROP. What has to be switched off lives in four different
 * places that do not know about each other: the HUD corner and the help button
 * are DOM at z 50, the arrival card is DOM at z 68, the bars are DOM, and the
 * plaques, the YOU pin, the objective arrow, the lit ring and the sea labels
 * are Pixi objects inside a scene that mounts and unmounts underneath all of
 * them. `stage-bus` and `world-bus` already solve exactly this shape for the
 * place card and the control lock, and this is the third of the same thing
 * rather than a new idea.
 *
 * WHY IT IS NOT `data-panels`. Raising the existing panel depth would hide the
 * corner and the help button, which is right, and would also silence the
 * arrival card and the task line permanently rather than owing them, and would
 * lie to a11y.ts about how many panels are open. Two effects wanted and two not
 * is not a switch, it is a coincidence.
 *
 * THE CEILING. A student behind two black bars with no controls, because an
 * island raised them and then raised an exception, is a dead session that looks
 * like a dead laptop. So the bars come down on their own, loudly, the same
 * shape as WAIT_CEILING_MS and WAIT_FOR_CEILING_MS in the vocabulary.
 */

/* TEN MINUTES, AND IT USED TO BE TWO.
 *
 * Two was sized against the arrival: a four second crossing and a walk up a
 * hill, where anything past a minute is a movie that has gone wrong. Then
 * BRIEF-MAW-RAIL-2 made the whole of year one one movie, from the tunnel mouth
 * to "Year two, next time", with four screens inside it that a fourteen year old
 * fills in at his own speed. Measured on the road: the schedule is about a
 * minute, Advisory is three items and about ninety seconds, the wall and the
 * yearbook are another two, and the walks and the lines are thirty seconds on
 * top. A student who reads takes five or six minutes and the bars came down in
 * the middle of his schedule, with the corner arriving over the top of a
 * cutscene, which is exactly the seam this brief exists to remove.
 *
 * It is still a ceiling and it still matters, because the thing it catches is an
 * island that raised the bars and then hung: the engine already lifts them when
 * a handler ends and when the scene is torn down, so what is left is a handler
 * that never returns at all. Ten minutes is longer than the longest thing
 * anybody can author today and shorter than the advisory period this is played
 * in. */
export const MOVIE_CEILING_MS = 600_000

let on = false
let ceiling: ReturnType<typeof setTimeout> | null = null
const subs = new Set<(v: boolean) => void>()

export const cinemaOn = () => on

/* the attribute is what the stylesheets read, and it is set here rather than in
 * a component so a scene that raises the bars before React has drawn anything
 * still gets the corner out of the way on the first frame */
function mark(v: boolean) {
  if (typeof document === 'undefined') return
  if (v) document.documentElement.dataset.movie = '1'
  else delete document.documentElement.dataset.movie
}

/* ---- THE FRAME SURVIVES A DOOR --------------------------------------------
 *
 * BRIEF-INTRO-FILM section 1, Ash 2026-09-07: *"The bars survive the map change
 * from the hub to the Maw."* The introduction is ONE film from Set Sail to the
 * counselor, and a door in the middle of it is a camera move, not an ending.
 *
 * WHY IT IS A TOKEN AND NOT A SECOND FLAG. `PmapScene`'s teardown lowers the
 * bars on purpose and must keep doing it: a map torn down by a refresh or a
 * crash mid-movie would otherwise leave two black bars over whatever loads
 * next, which is a dead-looking laptop, and that guard is the reason the word
 * is safe to hand to a member at all. So the exception is armed at exactly one
 * place, `beginExit`, and it is CONSUMED by the first teardown that reads it.
 * It cannot leak into the next unmount, and it cannot be armed by anything but
 * a door that was taken while the bars were already up.
 *
 * The arriving scene needs nothing: `onCinema` fires with the current value the
 * moment it subscribes, so the new map takes its own world hold on its first
 * frame and the picture never breaks. */
let carry = false

/** a door is being taken and the frame is to go through it with the player */
export function carryCinemaThroughDoor() { carry = cinemaOn() }

/** the teardown asking whether this unmount is that door. Reading it disarms it. */
export function takeCinemaCarry(): boolean {
  const was = carry
  carry = false
  return was
}

export function setCinema(v: boolean) {
  if (on === v) return
  on = v
  mark(v)
  if (ceiling) { clearTimeout(ceiling); ceiling = null }
  if (v) {
    ceiling = setTimeout(() => {
      console.error(`[cinema] the bars have been up for ${MOVIE_CEILING_MS / 1000}s and nothing has `
        + 'taken them down, so they are coming down. An island raised movie(True) and never '
        + 'raised movie(False); look for a word that refused between the two.')
      setCinema(false)
    }, MOVIE_CEILING_MS)
  }
  for (const s of [...subs]) {
    try { s(v) } catch (e) { console.error('[cinema] a listener threw', e) }
  }
}

/** subscribe, and hear the current value at once so a late mount is not wrong */
export function onCinema(f: (v: boolean) => void): () => void {
  subs.add(f)
  f(on)
  return () => { subs.delete(f) }
}
