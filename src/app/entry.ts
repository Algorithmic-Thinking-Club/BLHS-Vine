/* which scene a page load really opens on, and why a pasted address is not one */

/* ---- ASH, 2026-09-08 ------------------------------------------------------
 *
 * *"When I copy the link it comes out like
 * `.../?scene=pmap&map=panther-maw`, depending on where I am in the map.
 * Sometimes this is problematic, because I can start a fresh private window and
 * paste that, and instead of giving me the starting screen it puts me in the
 * middle of the island sailing or the hub island intro cutscene... Of course if
 * a tab is closed and reopened, or just been a while, it should go back to the
 * title screen (all data saved of course)."*
 *
 * WHY THE ADDRESS SAYS THAT AT ALL. `pmap/route.ts` writes the map and the
 * arrival anchor into the query with `replaceState` on every door, because that
 * is how the target crosses a scene change: `enter()` writes the address and
 * then navigates, and `PmapScene` reads it back on mount. It is the engine's own
 * transport, and it happens to be in the one part of the window a person copies.
 *
 * SO THE ADDRESS IS STILL WRITTEN AND IS NO LONGER OBEYED BY A STRANGER. A
 * position in a run belongs to the tab that is having the run: a browsing
 * context that has never played cannot be in the middle of a crossing. This
 * asks whether THIS tab is the one that got there, and a tab that is not gets
 * the title screen with everything it had saved still saved.
 *
 * THE SAVE IS NEVER TOUCHED BY ANY OF THIS. Nothing here reads or writes a run;
 * the title's own Continue reads `run/resume.ts` and puts a student back exactly
 * where the guard there says he belongs. */

/** the tab's claim that it is the one having the run. Dies with the tab. */
export const TAB_KEY = 'blhs_tab_v1'

/** how long that claim is good for, so "it has been a while" lands on the title */
export const TAB_MS = 30 * 60 * 1000

/** the params that say WHERE IN A RUN somebody is, as against how the game is dressed */
export const PLAY_PARAMS = ['scene', 'map', 'at', 'aboard'] as const

/* THE SCENES THAT CARRY A POSITION, and are therefore not an address to hand
 * somebody. `beach` is the start of the game and `teacher`, `grape` and `title`
 * are places rather than positions: a fresh window opening any of those is
 * opening the thing itself, which is what the person typing it meant. */
export const PLAY_SCENES = new Set(['pmap'])

/** the escape hatch, for a harness and for whoever is debugging a map by hand */
export const DEEP_PARAM = 'deep'

/** say this tab is the one having the run. Cheap, and called on every scene change. */
export function markTabLive(now = Date.now()): void {
  try { sessionStorage.setItem(TAB_KEY, String(now)) } catch { /* a private window with storage off still plays */ }
}

/** has this tab been in the game recently enough for its address to mean something */
export function tabIsLive(now = Date.now()): boolean {
  try {
    const t = Number(sessionStorage.getItem(TAB_KEY))
    return Number.isFinite(t) && t > 0 && now - t >= 0 && now - t < TAB_MS
  } catch { return false }
}

export type Opening = {
  /** the scene id to mount */
  scene: string
  /** the query the address should carry from here on, without the leading `?` */
  search: string
  /** why, in one sentence, or null when the address was taken as written */
  why: string | null
}

/** strip only the position out of a query, keeping every other pin somebody set */
function withoutPosition(p: URLSearchParams): string {
  const q = new URLSearchParams(p)
  for (const k of PLAY_PARAMS) q.delete(k)
  q.delete(DEEP_PARAM)
  return q.toString()
}

/**
 * What a page load opens on.
 *
 * `known` is the scene registry's own answer, so an id nobody registered lands
 * on boot exactly as it always did. `live` is `tabIsLive()`, passed in rather
 * than read here so this is a pure function and the tests do not need storage.
 */
export function openingScene(opts: {
  search: string
  known: (id: string) => boolean
  live: boolean
}): Opening {
  const p = new URLSearchParams(opts.search)
  const want = p.get('scene')

  /* no scene asked for, or one nobody registered: boot, the way it always was */
  if (!want || !opts.known(want)) return { scene: 'boot', search: p.toString(), why: null }

  /* a place rather than a position, so opening it is opening the thing itself */
  if (!PLAY_SCENES.has(want)) return { scene: want, search: p.toString(), why: null }

  /* the hatch, said out loud on the address: a harness, or somebody debugging a
   * map by hand who means to land in it cold */
  if (p.get(DEEP_PARAM) === '1') return { scene: want, search: p.toString(), why: null }

  /* and the rule: a position belongs to the tab that got there */
  if (opts.live) return { scene: want, search: p.toString(), why: null }

  return {
    scene: 'boot',
    search: withoutPosition(p),
    why: 'this address carries a position in a run and this tab has not been having one, '
      + 'so it opens on the title instead. Nothing saved is lost.',
  }
}


/* ---- TWO TABS, ONE SAVE (Ash, 2026-09-09) ---------------------------------
 *
 * *"If a game is already running in a tab, having duplicates might be a
 * problem?"* — and *"implement the this adventure is open in another tab."*
 *
 * It is a problem, and a quiet one. Both tabs write the whole save on every
 * change, so the last write wins: a student with two tabs open can sit a class
 * in one, press something in the other, and the second tab's older copy of the
 * run lands on top and the class is gone. Nothing errors and nothing says so.
 *
 * SO ONE TAB SAYS IT IS PLAYING and the other reads that. This is a heartbeat in
 * localStorage, which is shared across tabs of the same origin, holding the id of
 * whichever tab last claimed the run and when. A claim goes stale in seconds, so
 * a tab that crashed or was closed mid-play locks nobody out.
 *
 * IT IS AN OFFER AND NEVER A LOCK. The title tells the second tab what is going
 * on and gives it the choice to take over; the tab it takes over from notices on
 * its next beat and stands down. A student who is genuinely stuck can always get
 * in, which matters more here than being right: this runs on school Chromebooks
 * where a tab restore can resurrect yesterday's window. */

const PLAYING_KEY = 'blhs_playing_v1'
const TAB_ID_KEY = 'blhs_tabid_v1'

/** how often a playing tab renews its claim */
export const CLAIM_BEAT_MS = 3000

/** how long a claim stands without being renewed. Three missed beats. */
export const CLAIM_STALE_MS = 10_000

type Claim = { id: string; at: number }

/** this tab's own id, made once and kept for as long as the tab lives */
export function tabId(): string {
  try {
    const had = sessionStorage.getItem(TAB_ID_KEY)
    if (had) return had
    /* not a security token: it only has to differ from the other tabs open on
     * this machine right now, so the clock plus a counter is plenty */
    const made = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`
    sessionStorage.setItem(TAB_ID_KEY, made)
    return made
  } catch { return 't0' }
}

function readClaim(): Claim | null {
  try {
    const raw = localStorage.getItem(PLAYING_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as Claim
    return c && typeof c.id === 'string' && typeof c.at === 'number' ? c : null
  } catch { return null }
}

/** say this tab is the one playing, and renew the claim */
export function claimPlaying(now = Date.now()): void {
  try { localStorage.setItem(PLAYING_KEY, JSON.stringify({ id: tabId(), at: now })) } catch { /* storage off */ }
}

/** let the claim go, which a tab does when it leaves the world for the title */
export function releasePlaying(): void {
  try {
    const c = readClaim()
    if (c && c.id === tabId()) localStorage.removeItem(PLAYING_KEY)
  } catch { /* storage off */ }
}

/** is another tab holding a claim that has not gone stale */
export function otherTabPlaying(now = Date.now()): boolean {
  const c = readClaim()
  return !!c && c.id !== tabId() && now - c.at >= 0 && now - c.at < CLAIM_STALE_MS
}

/** the scenes that count as having the run, and therefore hold the claim */
export const PLAYING_SCENES = new Set(['pmap', 'beach', 'grape'])
