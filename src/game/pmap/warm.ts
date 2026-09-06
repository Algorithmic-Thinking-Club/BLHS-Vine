/* PULLING A MAP DOWN BEFORE THE STUDENT ASKS FOR IT.
 *
 * BRIEF-ARRIVAL, in the measurements Ash folded into the crossing: *"the
 * crossing cover is 14 s of black with a caption and the Maw's is another
 * 12 s."* The arithmetic behind that is in `transitions.tsx`: 950 ms of cover
 * in, then `waitForScene`, then 950 ms out, and `waitForScene` waits for the
 * scene to have loaded a bundle. Measured on the dev server the hub is 5.0 s
 * cold and 1.2 s warm, so nearly the whole of that black is one download of
 * about a megabyte that could have happened while the student was reading the
 * beach.
 *
 * SO IT HAPPENS EARLIER, AND NOTHING ELSE CHANGES. This does not touch the
 * loader, the cover, the scene or the order anything is drawn in. It asks the
 * browser for the same URLs `PmapScene` is about to ask for, so that when it
 * does, they are in the HTTP cache. If it fails, is slow, or never finishes,
 * the game behaves exactly as it does today.
 *
 * WHY IT IS NOT `Assets.load`. Pixi's cache is per-application and a scene that
 * has not been created yet has no application. The browser's cache is the one
 * both paths share, and `fetch` is the only thing that fills it without owning
 * a renderer.
 *
 * THE PLATFORM STILL REVALIDATES. Every file under `/api/v1/maps/.../file/<n>/`
 * is immutable by construction and MAPVIS serves all of them with
 * `Cache-Control: public, max-age=0, must-revalidate`, so a warm load is still
 * one conditional request per file. It gets a 304 and no bytes, which is the
 * expensive half. The header is MAPVIS's to fix and is already on the list.
 */
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

/**
 * Ask the browser for a published map's files so that opening it is instant.
 * Never throws, never blocks, and answers false when there was nothing to do.
 */
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
    /* SEQUENTIAL, ON PURPOSE. This is running underneath a scene the student is
     * looking at, on a school Chromebook, and seven parallel downloads of a
     * megabyte is exactly the thing that makes the beach stutter. One at a
     * time, biggest first, and whatever is done by the time the door opens is
     * what was saved. */
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
