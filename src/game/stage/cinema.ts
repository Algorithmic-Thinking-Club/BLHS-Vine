// one flag saying this stretch is watched rather than played, with black bars and no controls

// how long the bars may stay up before they come down on their own
export const MOVIE_CEILING_MS = 600_000

/* WHO RAISED THE BARS, which is the difference between tidying up after yourself
 * and cutting somebody's film short.
 *
 * Ash, on the sail to ATC: *"its all in a cutscene, the black boxes dont go
 * away."* Measured: they went up when the engine started the voyage and nothing
 * ever took them down, because the only things that lowered them were an island
 * saying `movie(False)` and an island failing to load. The hub's island does say
 * it, so the home base looked fine and every island a member writes was silently
 * made responsible for a frame it never asked for and cannot know about.
 *
 * The engine cannot just lower them at the end of a crossing either: the hub's
 * arrival deliberately keeps the frame up and hands it to the door. So the bars
 * remember who put them up, the engine lowers only its own, and an island that
 * takes the frame over keeps it for as long as it likes. */
export type CinemaBy = 'voyage' | 'island' | 'cutscene' | 'scene'

let on = false
let by: CinemaBy | null = null
let ceiling: ReturnType<typeof setTimeout> | null = null
const subs = new Set<(v: boolean) => void>()

export const cinemaOn = () => on
/** who the frame currently belongs to, or null when it is down */
export const cinemaBy = (): CinemaBy | null => by

/* the attribute is what the stylesheets read, and it is set here rather than in
 * a component so a scene that raises the bars before React has drawn anything
 * still gets the corner out of the way on the first frame */
function mark(v: boolean) {
  if (typeof document === 'undefined') return
  if (v) document.documentElement.dataset.movie = '1'
  else delete document.documentElement.dataset.movie
}

// a one-shot token letting the bars travel through a door instead of ending at it
let carry = false

/** a door is being taken and the frame is to go through it with the player */
export function carryCinemaThroughDoor() { carry = cinemaOn() }

/** the teardown asking whether this unmount is that door. Reading it disarms it. */
export function takeCinemaCarry(): boolean {
  const was = carry
  carry = false
  return was
}

export function setCinema(v: boolean, who: CinemaBy = 'scene') {
  /* AN ISLAND TAKING OVER A FRAME THAT IS ALREADY UP still changes who owns it.
   * Without this the early return below threw the claim away, and the engine
   * would have gone on to lower the bars out from under an island's own film. */
  if (on && v) { by = who; return }
  if (on === v) return
  on = v
  by = v ? who : null
  mark(v)
  if (ceiling) { clearTimeout(ceiling); ceiling = null }
  if (v) {
    ceiling = setTimeout(() => {
      console.error(`[cinema] the bars have been up for ${MOVIE_CEILING_MS / 1000}s, raised by `
        + `"${by ?? 'nobody'}", and nothing has taken them down, so they are coming down. `
        + 'Look for a word that refused between a movie(True) and its movie(False).')
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
