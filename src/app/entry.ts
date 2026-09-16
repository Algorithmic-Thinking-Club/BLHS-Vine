/* which scene a page load really opens on, and why a pasted address is not one */

/* the address carries the map and arrival anchor because `pmap/route.ts` writes them with `replaceState` on every door and `PmapScene` reads them back on mount, but only the tab that got there obeys them: a pasted link in a fresh window opens the title, and nothing here touches the save */

/** the tab's claim that it is the one having the run. Dies with the tab. */
export const TAB_KEY = 'blhs_tab_v1'

/** how long that claim is good for, so "it has been a while" lands on the title */
export const TAB_MS = 30 * 60 * 1000

/** the params that say WHERE IN A RUN somebody is, as against how the game is dressed */
export const PLAY_PARAMS = ['scene', 'map', 'at', 'aboard'] as const

/* the scenes that carry a position, and are therefore not an address to hand somebody: `beach`, `teacher`, `grape` and `title` are places rather than positions, so a fresh window opening one opens the thing itself */
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

/** what a page load opens on: `known` is the scene registry's own answer, so an id nobody registered lands on boot, and `live` is `tabIsLive()` passed in to keep this pure so the tests need no storage */
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

  /* the hatch, said out loud on the address, for a harness or for debugging a map by hand and meaning to land in it cold */
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


/* two tabs share one save and both write all of it, so the older copy lands on top */

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
    /* not a security token: it only has to differ from the other tabs open on this machine right now, so the clock plus a counter is plenty */
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

/* whether another tab holds a claim that is still fresh */
export function otherTabPlaying(now = Date.now()): boolean {
  const c = readClaim()
  return !!c && c.id !== tabId() && now - c.at >= 0 && now - c.at < CLAIM_STALE_MS
}

/** the scenes that count as having the run, and therefore hold the claim */
export const PLAYING_SCENES = new Set(['pmap', 'beach', 'grape'])
