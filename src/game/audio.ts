/* the game's sound library: named effects, a first-gesture unlock, and CC0 files */
import { NotBuilt } from '../vine/intents'

/** one entry in the library: the file, its licence, and where it came from */
export type Sfx = {
  /** the filename under `public/sfx/`, or null for a name that is agreed and not
   *  yet drawn. A null here refuses exactly like an unknown name does, because a
   *  reserved word that silently does nothing is the deception again. */
  file: string | null
  /** the SPDX-ish id, and CC0-1.0 is the only one this library accepts */
  license: string
  /** the page the pack was fetched from, so a future session can find it again */
  source: string
  author: string
  /** how loud this one effect plays next to the others */
  gain?: number
}

/* the twelve named effects and the files behind them */
export const SFX: Record<string, Sfx> = {
  /* the four the UI kit lives on. Every panel, every choice, every refusal. */
  click: { file: 'click.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', gain: 0.45 },
  open: { file: 'open.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', gain: 0.6 },
  close: { file: 'close.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', gain: 0.6 },
  deny: { file: 'deny.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', gain: 0.55 },

  /* the paper ones. The Handbook turns, the chart takes a mark, an award lands. */
  page: { file: 'page.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/rpg-audio', author: 'Kenney Vleugels', gain: 0.7 },
  mark: { file: 'mark.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', gain: 0.6 },
  chime: { file: 'chime.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', gain: 0.6 },

  /* the five the intro asks for, spelled with underscores like the rest of the engine */
  surf_in: { file: 'surf-in.ogg', license: 'CC0-1.0', source: 'https://opengameart.org/content/40-cc0-water-splash-slime-sfx', author: 'rubberduck', gain: 0.85 },
  cork_pop: { file: 'cork-pop.mp3', license: 'CC0-1.0', source: 'https://opengameart.org/content/a-slide-pop-sound', author: 'EZduzziteh', gain: 0.8 },
  sail_snap: { file: 'sail-snap.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/rpg-audio', author: 'Kenney Vleugels', gain: 0.75 },
  bottle: { file: 'bottle.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/interface-sounds', author: 'Kenney', gain: 0.6 },
  board: { file: 'board.ogg', license: 'CC0-1.0', source: 'https://kenney.nl/assets/rpg-audio', author: 'Kenney Vleugels', gain: 0.7 },
}

/** the vocabulary, in one array, and it is what a refusal reads back to the
 *  author. Sorted so the message is the same list every time. */
export const SFX_NAMES: string[] = Object.keys(SFX).sort()

/** where the bytes live. Files sit in `public/`, which Vite serves from the root,
 *  so this is a URL and not a filesystem path. */
const SFX_DIR = '/sfx/'

/* the level the whole library plays under */
const MASTER = 0.7

/* how long a sound asked for before the unlock is still worth playing */
const QUEUE_FRESH_MS = 1000
const QUEUE_MAX = 4

/* ---- state, all of it module-level because there is exactly one output ------ */

let ctx: AudioContext | null = null
let master: GainNode | null = null
let unlocked = false
let listening = false
/** decoded and ready. One buffer per file, played through many sources. */
const buffers = new Map<string, AudioBuffer>()
/** in flight, so ten clicks in the first second cause one fetch and not ten. A
 *  resolved `null` is a file that failed and will not be tried again this
 *  sitting, which is what keeps a dead URL from re-fetching on every click. */
const loading = new Map<string, Promise<AudioBuffer | null>>()
/** asked for before the unlock. See QUEUE_FRESH_MS for why it has a shelf life. */
const queue: { name: string; gain: number; at: number }[] = []

/* ---- the mute, which belongs to the settings sheet and not to this file ----- */

/* reads the Sound toggle out of the settings blob instead of keeping a second flag */
/* silence is the default, and only an explicit mute: false turns sound on */
const SETTINGS_KEY = 'blhs_settings_v1'
let lastSettingsRaw: string | null = null
let lastMute = true

function isMuted(): boolean {
  if (typeof localStorage === 'undefined') return true
  let raw: string | null = null
  try { raw = localStorage.getItem(SETTINGS_KEY) } catch { return lastMute }
  if (raw === lastSettingsRaw) return lastMute
  lastSettingsRaw = raw
  try { lastMute = (JSON.parse(raw ?? '{}') as { mute?: boolean }).mute !== false }
  catch { lastMute = true }
  return lastMute
}

/** turn sound off or on from code, and write it where the settings sheet reads
 *  it so the toggle agrees the next time it is opened. A captain silencing a
 *  demo machine and a student flipping the switch must not end up disagreeing. */
export function setMuted(b: boolean): void {
  lastMute = b
  if (typeof localStorage === 'undefined') return
  try {
    const cur = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Record<string, unknown>
    const next = JSON.stringify({ ...cur, mute: b })
    localStorage.setItem(SETTINGS_KEY, next)
    lastSettingsRaw = next
  } catch { /* a locked or full localStorage is not worth a broken click */ }
}

/* reduced motion is a camera setting and not a sound one, so nothing here reads it */

/* ---- the unlock ------------------------------------------------------------ */

/* builds the context and resumes it on the student's first click, key or touch */
function armUnlock(): void {
  if (listening || unlocked || typeof window === 'undefined') return
  listening = true
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.addEventListener(ev, onGesture, { capture: true, passive: true })
  }
}

function disarmUnlock(): void {
  if (!listening || typeof window === 'undefined') return
  listening = false
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
    window.removeEventListener(ev, onGesture, { capture: true })
  }
}

function onGesture(): void {
  const c = context()
  if (!c) {
    /* no Web Audio on this machine at all. Stop listening, and empty the queue
     * rather than leaving four sounds parked forever against a flush that can
     * never come. */
    disarmUnlock()
    queue.length = 0
    return
  }
  /* `resume` is a promise and the flush waits for it, because a source started
   * against a still-suspended context is a sound that never arrives. */
  void c.resume().then(() => {
    unlocked = true
    disarmUnlock()
    flush()
  }).catch(() => { disarmUnlock() })
}

/** has the browser actually let us make noise yet */
export function isUnlocked(): boolean { return unlocked }

/** how many pre-unlock asks are being held. The audio test is the only caller:
 *  without it there is no way to tell "queued" from "quietly dropped", and those
 *  are the two behaviours the queue exists to distinguish. */
export function pending(): number { return queue.length }

function flush(): void {
  const now = Date.now()
  const due = queue.splice(0, queue.length).filter((q) => now - q.at < QUEUE_FRESH_MS)
  for (const q of due) fire(q.name, q.gain)
}

/* ---- the context ----------------------------------------------------------- */

function context(): AudioContext | null {
  if (ctx) return ctx
  /* happy-dom, an old Safari, and a locked-down district image all land here, and
   * all three want the same answer: no sound, no crash, no console noise. */
  const Ctor: typeof AudioContext | undefined =
    typeof AudioContext !== 'undefined' ? AudioContext
      : (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = MASTER
    master.connect(ctx.destination)
    /* a context can be born running when the student has already clicked
     * something, and then there is nothing to wait for */
    if (ctx.state === 'running') { unlocked = true; disarmUnlock() }
    return ctx
  } catch { return null }
}

/* ---- the library lookup, which is where a wrong name dies ------------------ */

/* hyphens and underscores are the same word here, and nothing else is forgiven */
function resolve(name: string): { key: string; entry: Sfx & { file: string } } {
  const key = SFX[name] ? name : name.replace(/-/g, '_')
  const entry = SFX[key]
  if (!entry)
    throw new NotBuilt('sound', `"${name}" is not in the sound library. It has: ${SFX_NAMES.join(', ')}`)
  if (!entry.file)
    throw new NotBuilt('sound', `"${key}" is a reserved name with no file behind it yet. The ones that can play: ${SFX_NAMES.filter((n) => SFX[n].file).join(', ')}`)
  return { key, entry: entry as Sfx & { file: string } }
}

/* ---- loading, decoding, playing -------------------------------------------- */

/* decode a file once, then play it through a fresh source every time */
function load(file: string): Promise<AudioBuffer | null> {
  const had = loading.get(file)
  if (had) return had
  const p = (async (): Promise<AudioBuffer | null> => {
    const c = context()
    if (!c) return null
    try {
      const res = await fetch(SFX_DIR + file)
      if (!res.ok) throw new Error(`${res.status}`)
      const bytes = await res.arrayBuffer()
      const buf = await c.decodeAudioData(bytes)
      buffers.set(file, buf)
      return buf
    } catch (e) {
      /* THE NETWORK IS NOT THE AUTHOR'S FAULT AND DOES NOT THROW AT THEM. The
       * resolved null is cached by the map above, so a file that is missing on
       * the deployed build costs one failed request and not one per click. */
      console.warn(`[audio] ${file} did not load, that effect stays silent:`, e)
      return null
    }
  })()
  loading.set(file, p)
  return p
}

function fire(name: string, gain: number): void {
  const entry = SFX[name]
  if (!entry?.file) return
  const c = context()
  if (!c || !master) return
  const buf = buffers.get(entry.file)
  if (!buf) {
    /* first ask for this file: fetch, decode, and play it when it lands. The
     * latency is real and it is why `preload` exists for the sounds a scene
     * knows it is about to need. */
    void load(entry.file).then((b) => { if (b) start(b, gain) })
    return
  }
  start(buf, gain)
}

function start(buf: AudioBuffer, gain: number): void {
  const c = ctx
  if (!c || !master) return
  try {
    const src = c.createBufferSource()
    src.buffer = buf
    const g = c.createGain()
    g.gain.value = gain
    src.connect(g)
    g.connect(master)
    /* the graph is torn down when the sound ends, or a long session leaves a
     * node per click hanging off the master gain */
    src.onended = () => { try { src.disconnect(); g.disconnect() } catch { /* already gone */ } }
    src.start(0)
  } catch (e) {
    console.warn('[audio] a source refused to start:', e)
  }
}

/* ---- the two words the rest of the game says ------------------------------- */

/* whether the kit's own panels and buttons make any sound */
export const UI_SOUND = false

/** play one of the UI kit's own effects: a panel, a control, a refusal */
export function playUi(name: string, gain?: number): void {
  /* the refusal first, exactly as `play` does it and for the same reason: a name
   * the library does not hold is an author's mistake whether or not anybody was
   * ever going to hear it. */
  resolve(name)
  if (!UI_SOUND) return
  play(name, gain)
}

/** play a named effect once, now, with gain multiplying the entry's own level */
export function play(name: string, gain?: number): void {
  /* the refusal happens FIRST, before mute, before the unlock, before the
   * context. A typo has to be heard about on a muted machine too, or the one
   * student who plays with sound off becomes the only one who finds the bug. */
  const { key, entry } = resolve(name)
  if (isMuted()) return
  const level = (entry.gain ?? 1) * (gain ?? 1)
  if (!unlocked) {
    armUnlock()
    context()      // build it now so the bytes can be decoding while we wait
    if (!unlocked) {
      /* oldest out, newest in: the sound that matters is the one they just asked
       * for, not the one the title screen wanted a minute ago */
      if (queue.length >= QUEUE_MAX) queue.shift()
      queue.push({ name: key, gain: level, at: Date.now() })
      void load(entry.file)
      return
    }
  }
  fire(key, level)
}

/** fetch and decode a set of effects before the moment they are needed */
export async function preload(names: string[]): Promise<void> {
  /* names resolve first so a typo refuses, then a muted student skips the bytes */
  const files = names.map((n) => resolve(n).entry.file)
  if (isMuted()) return
  armUnlock()
  await Promise.all(files.map((f) => load(f)))
}

/* the listeners go on as soon as anything imports this file, not at the first
 * play: the unlock is a race against the student's very first click, and losing
 * it costs the one sound in the game they are guaranteed to be listening for. */
armUnlock()
