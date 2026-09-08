/* fetches a map's files into the browser cache early, so opening it later is quick */
import { mapvisHost } from '../world/composition'

/* The files a painted map opens with, in the order the scene wants them. The
 * atlas is the biggest by far (338 KB on the hub) and `assets.json` is next, so
 * they lead: a warm that only got halfway still saved the most. */
const FILES = [
  'atlas.png', 'assets.json', 'scene.png', 'map.json',
  'levels.png', 'atlas.json', 'occluders.png',
]

/* one attempt per map per page, because a second warm is a second round trip
 * for files the first one already has */
const asked = new Set<string>()

/** how many bytes a warm has pulled this session, for the debug line only */
let warmed = 0

export const warmedBytes = () => warmed

/** asks the browser for a published map's files; never throws, and false means nothing to do */
export async function warmMap(mapId: string): Promise<boolean> {
  if (!mapId || asked.has(mapId)) return false
  asked.add(mapId)
  const host = mapvisHost()
  /* no platform means the committed folder, which is served from the game's own
   * origin and is already as close as it can be */
  if (!host) return false
  try {
    const man = await fetch(`${host}/api/v1/maps/${encodeURIComponent(mapId)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    const dir = `${host}/api/v1/maps/${encodeURIComponent(mapId)}/file/${man.version}`
    /* one file at a time, biggest first, so a scene running underneath does not stutter */
    for (const f of FILES) {
      const r = await fetch(`${dir}/${f}`).catch(() => null)
      if (r?.ok) warmed += Number(r.headers.get('content-length') || 0)
    }
    /* the per-placement art the atlas does not carry. `assets.json` names them
     * and there can be dozens, so this is deliberately NOT followed: the atlas
     * is what the first frame needs and the rest arrive as they arrive. */
    console.info(`[warm] ${mapId} v${man.version} pulled ahead of the door`)
    return true
  } catch {
    /* not published, no platform, offline, a filtered network: all of them mean
     * the same thing here, which is that the door will be as slow as it is
     * today and nothing is broken */
    return false
  }
}
