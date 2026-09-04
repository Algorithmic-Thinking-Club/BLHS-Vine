/* SOUND. The whole of it, and there was none in this repo before this file.
 *
 * BRIEF-ENGINE-4 item A6 asks for a ruled library rather than a sound system:
 * an audio player, a first-gesture unlock, and a named registry of CC0 effects
 * with the licence recorded per file. No soundtracks, by ruling. That ruling is
 * why this file is small and why nothing in it streams, loops or ducks.
 *
 * THE NAME IS THE VOCABULARY AND THE FILE IS AN IMPLEMENTATION DETAIL. A caller
 * asks for `click`, `bottle`, `surf_in`. It never asks for `glass_001.ogg`.
 * That separation is the only thing that makes the library replaceable: when Ash
 * hears `sail_snap` and says the cloth is wrong, the fix is one row in the table
 * below and one file in `public/sfx/`, and not one line anywhere else in 33,000.
 * Every other design here follows from wanting that swap to stay free.
 *
 * A NAME THE TABLE DOES NOT HOLD REFUSES, BY NAME. This is the same law
 * `src/vine/intents.ts` was written around and the same shape `PmapScene`'s
 * `playFx` performs: no capability may report success without performing. A
 * member who types `cork-pip` gets a `NotBuilt` carrying the list of real names,
 * at their own line, instead of shipping an island whose bottle opens in silence
 * and reports that it worked. `fx` shipped that bug for a year and this file
 * refuses to be the second one.
 *
 * THE ONE THING IT WILL NOT REFUSE FOR IS THE NETWORK. A school Chromebook that
 * could not pull an ogg, or a browser that will not decode one, keeps playing
 * the game in silence. The distinction is who is at fault and who can act: a
 * wrong name is an author error and the author is sitting right there; a dropped
 * fetch is the district's wifi and the student can do nothing about it. So a bad
 * name throws and a bad byte is swallowed, and those are deliberately not the
 * same path.
 */
import { NotBuilt } from '../vine/intents'

/** one entry in the library. `license`, `source` and `author` are not decoration:
 *  this ships to minors in a school district, so every byte of audio has to be
 *  traceable to a licence from inside the code as well as from
 *  `public/sfx/LICENSES.md`, and the test holds the two in step. */
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
  /* PER-EFFECT LOUDNESS, AND NOBODY HAS HEARD THESE YET. The packs were mastered
   * by four different people at four different levels, so a flat gain would make
   * the splash bury the click. These numbers are a starting point written by
   * reading file lengths and sources, NOT by listening, and they are in the table
   * precisely so that changing one after Ash plays it costs nothing. */
  gain?: number
}

/* THE REGISTRY.
 *
 * Twelve names, 162 KB, and the count is a budget rather than an accident: a
 * freshman opens this on a 4 GB Chromebook over school wifi, so the sound library
 * is allowed to cost about a third of one map painting.
 *
 * The names are the engine's own surfaces plus the three the intro already
 * scripted a year ago. Some files are a stand-in rather than a literal recording
 * of the thing they are named for, and `LICENSES.md` admits which in its original
 * filename column rather than hiding it behind a nice name here. */
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

  /* THE FIVE THE INTRO ALREADY ASKED FOR. `introScript.ts` scripted `surf-in`,
   * `cork-pop` and `sail-snap` before any player existed, and `BeachIso`'s stage
   * answered them with an empty function for that whole time. They are named here
   * in the underscore spelling the rest of the engine uses; `resolve` below takes
   * the script's hyphens too, so neither side had to be rewritten to meet. */
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

/* THE MASTER LEVEL. Sound in this game is furniture and never the event, so the
 * whole library sits below the headroom rather than at it: thirty Chromebooks at
 * full volume in one advisory room is the real listening condition. Unheard, like
 * the per-entry numbers. */
const MASTER = 0.7

/* HOW LONG A SOUND ASKED FOR BEFORE THE UNLOCK IS STILL WORTH PLAYING.
 *
 * The queue exists so the FIRST click makes its noise: the gesture that unlocks
 * the context and the click handler that asks for `click` are the same event, and
 * without a queue the player would learn that the first button in the game is the
 * only silent one. It is not a backlog. A sound the title screen asked for
 * fourteen seconds before the student finally touched anything must not all come
 * out at once when they do, so anything older than this is dropped on the flush. */
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

/* ONE SOURCE FOR THE TOGGLE. `src/app/SettingsPanel.tsx` already ships a Sound
 * toggle writing `mute` into `blhs_settings_v1`, and a student who turns sound
 * off there means it. This reads that key rather than keeping a second flag,
 * because two flags for one control is how the reduced-motion setting ended up
 * honoured by the stylesheets and ignored by the camera.
 *
 * It reads the key instead of importing `loadSettings`, and that is deliberate:
 * `SettingsPanel.tsx` is a React component that pulls in a stylesheet, the save
 * file and the telemetry module, and none of that belongs behind a click sound.
 * The cost of the copy is one string literal, and the test pins it.
 *
 * The raw string is compared before it is parsed, so the common case (nothing
 * changed since the last click) is a `getItem` and a string equality rather than
 * a `JSON.parse` on every button in the game. */
const SETTINGS_KEY = 'blhs_settings_v1'
let lastSettingsRaw: string | null = null
let lastMute = false

function isMuted(): boolean {
  if (typeof localStorage === 'undefined') return false
  let raw: string | null = null
  try { raw = localStorage.getItem(SETTINGS_KEY) } catch { return lastMute }
  if (raw === lastSettingsRaw) return lastMute
  lastSettingsRaw = raw
  try { lastMute = !!(JSON.parse(raw ?? '{}') as { mute?: boolean }).mute }
  catch { lastMute = false }
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

/* REDUCED MOTION IS NOT A SOUND SETTING and this file does not pretend it is.
 * `ui/motion.ts` shortens camera moves for a student who asked their Chromebook
 * for less motion, and nothing about that request says anything about audio.
 * Wiring one to the other would be inventing a rule nobody asked for and would
 * silently take the sound away from a student who never turned it off. The Sound
 * toggle above is the control, and it is the only one. */

/* ---- the unlock ------------------------------------------------------------ */

/* CHROME WILL NOT MAKE A SOUND UNTIL THE STUDENT TOUCHES SOMETHING.
 *
 * The autoplay policy suspends every AudioContext created before a real user
 * gesture, and a Chromebook is exactly the machine that enforces it hardest. So
 * the context is built lazily, resumed on the first pointerdown, keydown or
 * touchstart, and the listeners come straight back off the window afterwards:
 * they exist to catch one event and leaving three capture-phase listeners on
 * every input in the game for the rest of the session would be a real cost on
 * the slowest machine this ships to.
 *
 * They are capture-phase on purpose. The app's own click handler is what asks for
 * the click sound, and capture runs before it, so by the time `play` is reached
 * the resume has already been requested and the queue flush is a formality. */
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

/* HYPHENS AND UNDERSCORES ARE THE SAME WORD HERE, AND ONLY THOSE.
 *
 * `introScript.ts` wrote `surf-in`, `cork-pop` and `sail-snap` into the cutscene
 * a year before this file existed, and the rest of the engine spells names with
 * underscores. Teaching the lookup one substitution is a two-line rule; rewriting
 * a shipped script, or making every future caller remember which surface uses
 * which spelling, is not. Nothing else is forgiven: case, plurals and near
 * misses all still refuse. */
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

/* DECODE ONCE, PLAY MANY. `decodeAudioData` is the expensive half and a click is
 * asked for hundreds of times in a session, so the AudioBuffer is kept and a
 * fresh BufferSource is built per play. A source is single-use by spec, and
 * building a new one is also what lets an effect overlap itself: two students'
 * worth of clicking, or a splash still ringing when the next one starts. */
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

/* ---- THE UI KIT MAKES NO SOUND, AND THAT IS A RULING ---------------------
 *
 * Ash played the deploy title-to-Maw on 2026-09-03 and BRIEF-PLAYTHROUGH-1 law 4
 * is the result: "No annoying sound. The two effects he heard are off. Nothing
 * plays until he has picked a sound and said so."
 *
 * The two he heard were `open` and `close`, wired the day before onto `usePanel`
 * so that every panel in the game spoke when it appeared and again when it left.
 * They were CC0, correctly licensed, correctly levelled and gated on the mute
 * setting, and none of that is the point: he opened four panels in two minutes
 * and heard eight noises.
 *
 * SO THE GATE IS ONE FLAG AND IT IS OFF. Not a deletion: the files stay, the
 * licences stay, the call sites stay where they belong, and turning them back on
 * is this constant. That matters because the next thing that happens here is him
 * choosing which sounds the kit gets, not somebody re-deriving where they go.
 *
 * WHAT IT DOES NOT GATE. A sound a SCRIPT asked for by name is the author
 * speaking, not the kit chattering: the bottle in the opening, a door, whatever a
 * member's Python plays. Those go through `play` and are unaffected, which is why
 * the gate is a separate function rather than a mute inside `play`.
 *
 * THE REWARD POP IS THE ONE EXCEPTION, on his own wording: "the reward pop stays
 * only if it is soft enough that he does not mention it." It is not a UI click,
 * it is the game saying a credit was earned, and it fires about once a beat. It
 * plays through `play` at a reduced gain and he judges it next time. */
export const UI_SOUND = false

/**
 * play one of the UI kit's own effects: a panel, a control, a refusal.
 *
 * Silent while `UI_SOUND` is false, which is a ruling and not a bug. Everything
 * else about it is `play`, including the unknown-name refusal, so a typo in a
 * kit sound is still heard about by the person who wrote it.
 */
export function playUi(name: string, gain?: number): void {
  /* the refusal first, exactly as `play` does it and for the same reason: a name
   * the library does not hold is an author's mistake whether or not anybody was
   * ever going to hear it. */
  resolve(name)
  if (!UI_SOUND) return
  play(name, gain)
}

/**
 * play a named effect, once, now.
 *
 * Throws `NotBuilt` for a name the library does not hold or holds without a file,
 * and for nothing else. A muted student, a locked context, a dropped fetch and a
 * browser with no Web Audio at all are all silent successes, because none of them
 * is something the caller can do anything about.
 *
 * @param gain a multiplier on the entry's own level, for dynamics at the call
 *   site: a distant door is `play('close', 0.4)`. It multiplies rather than
 *   overrides so that fixing one effect's loudness in the table does not silently
 *   undo every call site that was compensating for it.
 */
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

/**
 * fetch and decode a set of effects ahead of the moment they are needed, so the
 * first `surf_in` of the intro is not a fetch. Refuses on an unknown name the
 * same way `play` does, because a scene preloading a typo is exactly the author
 * who should hear about it before a player ever arrives.
 *
 * Never rejects for a network or decode failure. The promise settles when every
 * file has been tried, and a file that failed simply has no buffer.
 */
export async function preload(names: string[]): Promise<void> {
  /* THE MUTED STUDENT DOES NOT PAY FOR THE BYTES. `play` has always checked the
   * setting and `preload` never did, so a student who turned sound off still
   * fetched the whole library over school wifi and then decoded it into memory
   * on a 4 GB Chromebook. The names are still RESOLVED first, so a typo in an
   * island's preload list is refused whether or not that machine has sound on:
   * a refusal that depends on a setting is a refusal a member would only meet
   * on somebody else's laptop. */
  const files = names.map((n) => resolve(n).entry.file)
  if (isMuted()) return
  armUnlock()
  await Promise.all(files.map((f) => load(f)))
}

/* the listeners go on as soon as anything imports this file, not at the first
 * play: the unlock is a race against the student's very first click, and losing
 * it costs the one sound in the game they are guaranteed to be listening for. */
armUnlock()
