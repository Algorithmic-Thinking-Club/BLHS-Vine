// one flag saying this stretch is watched rather than played, with black bars and no controls

// how long the bars may stay up before they come down on their own
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
