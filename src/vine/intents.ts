/* the list of things the engine can be asked to do, as plain data a grape sends over */
import type { CheckStep, SessionMode } from './contract'

/* ---- what the engine can be asked to do ---------------------------------- */

export type Intent =
  /* dialogue. `who` is an anchor name when the speaker stands somewhere, so the
   * camera and the portrait can both be resolved from one string. */
  | { kind: 'say'; who?: string; text: string; portrait?: string }
  | { kind: 'choose'; prompt?: string; options: string[] }

  /* guide_to draws the arrow to a place, and null takes the arrow down */
  | { kind: 'guide_to'; anchor: string | null }
  /* walk the player to an anchor, with an optional small step aside from its mark */
  | { kind: 'walk_to'; anchor: string; off?: Offset }
  | { kind: 'look_at'; anchor: string | null; ms?: number }

  /* the director words start here: pose sets the player's body and heading, and does not move him */
  | { kind: 'pose'; pose?: string; facing?: string }

  /* driving another body on the map: send it, turn it, change its face, let it go */
  /* send a body to an anchor, at a named walking pace */
  | { kind: 'actor_move'; actor: string; to: string; off?: Offset; facing?: string; pace?: Pace }
  /* somebody walks ahead and the player follows, ending when they have both arrived */
  | { kind: 'lead_to'; actor: string; to: string; off?: Offset; pace?: Pace }
  /* put somebody at a spot with no walk in it, facing the player by default */
  | { kind: 'place'; actor: string; at: string; off?: Offset; facing?: string }
  | { kind: 'actor_face'; actor: string; facing: string }
  | { kind: 'actor_look'; actor: string; look: string }
  | { kind: 'actor_release'; actor?: string }

  /* travel a named authored path, as the player, a driven actor, or the ship */
  | { kind: 'route'; path: string; who?: string; backwards?: boolean }

  /* point the camera at a shot somebody named; null gives the camera back */
  | { kind: 'framing'; shot: string | null; ms?: number }

  /* the standard shots the engine works out itself: island, walk, close, ship, sail */
  | { kind: 'view'; view: ViewShot; ms?: number }

  /* pause for a while, or hold until the player walks into a named region */
  | { kind: 'wait'; ms: number }
  | { kind: 'wait_for'; anchor: string; ms?: number }

  /* play one named effect from the sound library, once */
  | { kind: 'sound'; name: string; gain?: number }

  /* one flag saying this stretch is watched rather than played: bars in, chrome out */
  | { kind: 'movie'; on: boolean }

  /* the one short line saying what the student should be doing now; null hands it back */
  | { kind: 'objective'; text: string | null }

  /* step the player off a berthed boat onto the dock */
  | { kind: 'ashore' }

  /* the sit-down panels, kept to a short closed list on purpose */
  /* wait makes open come back when the panel is closed rather than when it opens */
  | { kind: 'open'; ui: 'planner' | 'handbook' | 'cords' | 'chart' | 'wardrobe' | 'settings' | 'wall' | 'yearbook' | 'tour'; wait?: boolean }

  /* a scored activity. `beat` names one the engine can build; both study arms
   * render from the same items, which is what as_plain() means in practice and
   * why it is here rather than bolted on later. */
  /* AND AN ISLAND MAY BRING ITS OWN. `items` is the activity itself, declared by
   * the island rather than named out of the engine's own table, which is the only
   * way a member's island can score anything the vine did not write. It rides on
   * this word rather than on a new one because the worker already carries arbitrary
   * JSON and a new word would cost a builder in two copies of vine.py and the
   * vocabulary count in three places. */
  | { kind: 'play'; beat: string; as_plain?: boolean; title?: string; place?: string; items?: CheckStep[] }

  /* the world reflecting the run. `placement` is a MAPVIS placement id, bound to
   * an anchor so a grape addresses it by name like everything else. */
  | { kind: 'show'; anchor: string; visible: boolean }
  | { kind: 'fx'; name: string; anchor?: string; data?: unknown }

  /* scene changes. `at` is the arrival anchor in the target map, without which
   * every door into a room drops the player on that room's one global spawn. */
  /* cover names the occasion behind the loading screen, not the picture itself */
  | { kind: 'enter'; map: string; at?: string; cover?: CoverOccasion }
  /* sail to another island. The engine owns the whole journey: out of the room,
   * down the quay, aboard, across the water and ashore. A member never names a
   * route, a berth or a camera to be carried there. */
  | { kind: 'sail_to'; map: string }
  | { kind: 'cutscene'; script: string }
  /* the run has finished and the screen goes back to the title */
  | { kind: 'end_run' }

  /* run state. `get` reads, and the paths it accepts are the ones progress.ts
   * can answer, so a grape cannot ask a question the engine has to invent an
   * answer to. */
  | { kind: 'get'; path: RunPath }
  | { kind: 'set_flag'; flag: string }
  /* the ledger row an island writes when it finishes a programme */
  | {
    kind: 'award'
    /** the roster programme this grade completes, when it completes one */
    programme?: string
    grade?: number
    /** cord-relevance tags on top of the programme's own; never replaces them */
    tags?: string[]
    fact?: string
    sticker?: string
    badge?: string
  }

  /* instrumentation. Law 11: every meaningful interaction emits a typed event.
   * A grape gets to add to the record; it does not get to write the record. */
  | { kind: 'log'; event: string; data?: Record<string, unknown> }

/* AN ACTIVITY AN ISLAND BROUGHT WITH IT, rather than one the engine already has.
 *
 * `programme` is stamped by the performer off the island's own registration and is
 * never read off the wire, so a member cannot address another programme's row. The
 * items are ordinary `CheckStep`s, which is what keeps one scorer and one plain
 * rendering for engine content and member content alike. */
export type BeatDeclaration = {
  items: CheckStep[]
  title?: string
  place?: string
  programme?: string
}

/* how fast a driven body travels, as a word rather than a number */
export type Pace = 'stroll' | 'walk' | 'run'
export const PACES: Pace[] = ['stroll', 'walk', 'run']
/* Walk is the map's own speed and is what everything got before this existed.
 * A stroll is two thirds of it, which is the pace a person crosses a room at
 * when they are not in a hurry, and a run is half again. */
export const PACE_OF: Record<Pace, number> = { stroll: 0.62, walk: 1, run: 1.5 }

/* a small step aside from an anchor's own mark, in painting pixels across and down */
export type Offset = [number, number]

/* the name that means the player, both as a speaker and as a place to stand */
export const PLAYER = 'thor'
/** how far from a station's own mark a second mark may be asked for */
export const OFFSET_LIMIT = 96
export const offsetFault = (o: unknown): string | null => {
  if (o === undefined || o === null) return null
  if (!Array.isArray(o) || o.length !== 2) return 'off is two numbers, across and down'
  const [dx, dy] = o as unknown[]
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 'off is two numbers, across and down'
  if (Math.abs(dx as number) > OFFSET_LIMIT || Math.abs(dy as number) > OFFSET_LIMIT)
    return `off is a step aside, not a journey: keep both numbers inside ${OFFSET_LIMIT}`
  return null
}

/* the occasions a door may declare, which the cover registry turns into a picture */
export type CoverOccasion = 'ceremony'
export const COVER_OCCASIONS: CoverOccasion[] = ['ceremony']

/** the shots the engine composes itself, off the painting and the window */
export type ViewShot = 'island' | 'walk' | 'close' | 'ship' | 'sail'
export const VIEW_SHOTS: ViewShot[] = ['island', 'walk', 'close', 'ship', 'sail']

export type RunPath =
  | 'year' | 'gpa' | 'tokens' | 'cords' | 'flags' | 'islands'
  | 'handle' | 'mode' | 'graduated'
  /* every cord with its rule and progress line, and what is on the trophy wall */
  | 'cord_board' | 'trophies'
  /* which step of the year he is on, and what he actually picked in it */
  | 'phase' | 'picks'
  /* is this year's advisory still owed, answered as a beat id or null */
  | 'advisory'
  /* is this year's plan sheet stamped */
  | 'planned'

/* ---- what comes back ------------------------------------------------------ */

/* one shape for every reply, so a refusal is an answer rather than an exception */
export type IntentResult =
  | { ok: true; value?: unknown }
  | { ok: false; why: string }

export const ok = (value?: unknown): IntentResult => ({ ok: true, value })
export const no = (why: string): IntentResult => ({ ok: false, why })

/* ---- who honours them ----------------------------------------------------- */

/* the half of the vocabulary that needs a map, implemented by whichever scene is up */
export interface IntentWorld {
  /* the map this scene is showing, so `enter` knows when it is a no-op */
  mapId(): string
  /* does this map have an anchor by that name */
  hasAnchor(name: string): boolean
  say(who: string | undefined, text: string, portrait?: string): Promise<void>
  choose(prompt: string | undefined, options: string[]): Promise<number>
  guideTo(anchor: string | null): void
  walkTo(anchor: string, off?: Offset): Promise<void>
  lookAt(anchor: string | null, ms?: number): Promise<void>
  show(anchor: string, visible: boolean): void
  /* play a named effect and come back when it has finished */
  fx(name: string, anchor?: string, data?: unknown): Promise<void>
  enter(map: string, at?: string, cover?: CoverOccasion): Promise<void>
  /** sail to another island and come back when the player is standing on it */
  sailTo(map: string): Promise<void>
  /** put the player off a berthed boat and onto the dock */
  ashore(): Promise<void>
  cutscene(script: string): Promise<void>
  /** the run has finished: leave the world for the title (BRIEF-CLOSE-THE-LOOP 3) */
  endRun(): Promise<void>

  /* the director half. Each one is a word for something MAPVIS already authors
   * and the game could not previously say. */
  pose(pose: string | undefined, facing: string | undefined): Promise<void>
  actorMove(actor: string, to: string, off?: Offset, facing?: string, pace?: Pace): Promise<void>
  /** somebody walks ahead, the player follows, and it ends when they both stop */
  leadTo(actor: string, to: string, off?: Offset, pace?: Pace): Promise<void>
  /** put a body at an anchor with no walk in it, facing the player by default */
  place(actor: string, at: string, off?: Offset, facing?: string): void
  actorFace(actor: string, facing: string): void
  actorLook(actor: string, look: string): void
  actorRelease(actor?: string): void
  route(path: string, who: string, backwards: boolean): Promise<void>
  framing(shot: string | null, ms?: number): Promise<void>
  /* the composed shots the engine works out for itself. Awaited, because a
   * pull-out that has not arrived is a shot the next line would talk over. */
  view(shot: ViewShot, ms?: number): Promise<void>
  waitFor(anchor: string, ms?: number): Promise<boolean>
}

/* The engine half. Supplied once at boot rather than per scene, because the
 * save file and the logger do not change when the camera does. */
export interface IntentEngine {
  /* `wait` makes this a promise the caller may await. Left out it is exactly the
   * fire-and-forget call it always was, so no existing station changes shape. */
  openUi(ui: 'planner' | 'handbook' | 'cords' | 'chart' | 'wardrobe' | 'settings' | 'wall' | 'yearbook' | 'tour', wait?: boolean): void | Promise<void>
  /* `decl` is present only when the island brought its own activity. Absent, this
   * is the same call it always was and the engine resolves the id from its table. */
  playBeat(beat: string, asPlain: boolean, decl?: BeatDeclaration): Promise<number | null>
  read(path: RunPath): unknown
  setFlag(flag: string): void
  award(a: {
    programme?: string; grade?: number; tags?: string[]
    fact?: string; sticker?: string; badge?: string
  }): void
  log(event: string, data?: Record<string, unknown>): void
  mode(): SessionMode
  /* the two director words that need no map: a pause and a sound */
  wait(ms: number): Promise<void>
  sound(name: string, gain?: number): void
  /* raise or drop the movie bars, which belong to the window rather than a map */
  movie(on: boolean): void
  /* AND THE FOURTH, for the same reason. The panel that says what to do next is
   * chrome around the window rather than anything on a map, so an island run in
   * the standalone harness can still say what it is asking of the student. */
  objective(text: string | null): void
}

/* which island is speaking, so its flags get its own name in front of them */
export type IntentBy = { grape: string }

/* the longest pause a scene may be asked to hold */
export const WAIT_CEILING_MS = 30_000

/* the longest it may wait for the player to walk somewhere */
export const WAIT_FOR_CEILING_MS = 120_000

export type IntentHost = {
  world: IntentWorld | null
  engine: IntentEngine
  /** absent for the vine's own content; set to the island's programme id */
  by?: IntentBy
}

/* ---- the one place an intent is performed --------------------------------- */

/* the one place an intent is carried out, with a case for every word in the union */
export async function performIntent(i: Intent, host: IntentHost): Promise<IntentResult> {
  const { world, engine, by } = host
  /* the island's own corner of the flag list. A member writes set_flag("met"),
   * the save gets "atc:met", and nobody else's island can reach it or collide
   * with it. Bare for the vine, which wrote the flags already in every save. */
  const scoped = (flag: string) => (by ? `${by.grape}:${flag}` : flag)
  /* an intent that needs a map, asked in a scene that has none. Answered rather
   * than thrown: a grape running in the standalone harness with no scene should
   * report "there is no world here", not crash the worker. */
  const w = (): IntentWorld => {
    if (!world) throw new NoWorld(i.kind)
    return world
  }
  try {
    switch (i.kind) {
      case 'say':
        await w().say(i.who, i.text, i.portrait)
        return ok()
      case 'choose':
        return ok(await w().choose(i.prompt, i.options))
      case 'guide_to':
        /* null is not a name, so it is not checked against the map. Same shape
         * as `look_at` below, and for the same reason: letting go is a thing an
         * island asks for on purpose, not an argument somebody forgot. */
        if (i.anchor && !w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        w().guideTo(i.anchor)
        return ok()
      case 'walk_to':
        if (!w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        if (offsetFault(i.off)) return no(offsetFault(i.off) as string)
        await w().walkTo(i.anchor, i.off)
        return ok()
      case 'look_at':
        /* the anchor is checked here too, and null means let the camera go */
        if (i.anchor && !w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        await w().lookAt(i.anchor, i.ms)
        return ok()
      case 'show':
        if (!w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        w().show(i.anchor, i.visible)
        return ok()
      case 'fx':
        /* the anchor is checked here so the refusal reads like every other word's */
        if (i.anchor && !w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        await w().fx(i.name, i.anchor, i.data)
        return ok()
      case 'enter':
        if (i.cover && !COVER_OCCASIONS.includes(i.cover))
          return no(`"${i.cover}" is not an occasion. They are: ${COVER_OCCASIONS.join(', ')}`)
        await w().enter(i.map, i.at, i.cover)
        return ok()
      case 'sail_to':
        if (typeof i.map !== 'string' || !i.map.trim()) return no('sail_to wants the name of a map to sail to')
        await w().sailTo(i.map.trim())
        return ok()
      case 'end_run':
        await w().endRun()
        return ok()
      case 'cutscene':
        await w().cutscene(i.script)
        return ok()

      /* ---- the director class -------------------------------------------- */

      case 'pose':
        /* both fields are optional, but a call with neither is not an instruction */
        if (!i.pose && !i.facing) return no('pose needs a pose, a facing, or both')
        await w().pose(i.pose, i.facing)
        return ok()

      /* an actor is an anchor name, so the words below check it the way show does */
      case 'actor_move':
        if (!w().hasAnchor(i.actor)) return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
        /* THE PLAYER IS A DESTINATION AND NEVER AN ANCHOR, the same exemption
         * `place` carries: "walk over to him" is a thing a film says and no map
         * has a post for, because he is standing wherever he stopped. */
        if (i.to !== PLAYER && !w().hasAnchor(i.to)) return no(`no anchor named "${i.to}" on ${w().mapId()}`)
        /* a pace nobody drew is a typo, and it reads the same way every other
         * named thing in this file reads: refused by name, with the list */
        if (i.pace && !PACES.includes(i.pace))
          return no(`"${i.pace}" is not a pace. They are: ${PACES.join(', ')}`)
        if (offsetFault(i.off)) return no(offsetFault(i.off) as string)
        await w().actorMove(i.actor, i.to, i.off, i.facing, i.pace)
        return ok()
      case 'lead_to':
        if (!w().hasAnchor(i.actor)) return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
        if (!w().hasAnchor(i.to)) return no(`no anchor named "${i.to}" on ${w().mapId()}`)
        if (i.pace && !PACES.includes(i.pace))
          return no(`"${i.pace}" is not a pace. They are: ${PACES.join(', ')}`)
        if (offsetFault(i.off)) return no(offsetFault(i.off) as string)
        await w().leadTo(i.actor, i.to, i.off, i.pace)
        return ok()
      case 'place':
        if (!w().hasAnchor(i.actor)) return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
        /* THE PLAYER IS A PLACE AND NOT AN ANCHOR, so he is exempt from the one
         * check every other name here gets. Nothing else in the vocabulary is,
         * and nothing else should be. */
        if (i.at !== PLAYER && !w().hasAnchor(i.at))
          return no(`no anchor named "${i.at}" on ${w().mapId()}`)
        if (offsetFault(i.off)) return no(offsetFault(i.off) as string)
        w().place(i.actor, i.at, i.off, i.facing)
        return ok()
      case 'actor_face':
        if (!w().hasAnchor(i.actor)) return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
        w().actorFace(i.actor, i.facing)
        return ok()
      case 'actor_look':
        if (!w().hasAnchor(i.actor)) return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
        w().actorLook(i.actor, i.look)
        return ok()
      case 'actor_release':
        /* releasing everything is the no-argument case and is always legal, even
         * on a map where nothing was ever driven, because it is a tidy-up */
        if (i.actor && !w().hasAnchor(i.actor)) return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
        w().actorRelease(i.actor)
        return ok()

      case 'route':
        await w().route(i.path, i.who ?? 'player', i.backwards === true)
        return ok()

      case 'framing':
        await w().framing(i.shot, i.ms)
        return ok()

      case 'view':
        if (!VIEW_SHOTS.includes(i.view))
          return no(`"${i.view}" is not a shot this engine composes. They are: ${VIEW_SHOTS.join(', ')}`)
        await w().view(i.view, i.ms)
        return ok()

      /* wait_for answers whether he actually got there, so an island can branch on it */
      case 'wait_for':
        if (!w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        return ok(await w().waitFor(i.anchor, i.ms))

      case 'wait':
        /* a negative or absurd pause is a typo, and a scene frozen for an hour is
         * indistinguishable from a crash to the student sitting in front of it */
        if (!Number.isFinite(i.ms) || i.ms < 0) return no(`wait wants a number of milliseconds and got ${JSON.stringify(i.ms)}`)
        await engine.wait(Math.min(i.ms, WAIT_CEILING_MS))
        return ok()
      case 'sound':
        engine.sound(i.name, i.gain)
        return ok()
      case 'ashore':
        await w().ashore()
        return ok()
      case 'movie':
        /* NO MAP NEEDED, on purpose. The bars are a property of the window and
         * an island opening in the standalone harness should still be able to
         * say that a stretch of it is watched rather than played. */
        engine.movie(i.on === true)
        return ok()
      case 'objective':
        /* no map needed: this is a sentence, and a blank one means the same as none */
        engine.objective(typeof i.text === 'string' && i.text.trim() ? i.text.trim() : null)
        return ok()

      case 'open':
        /* awaited whichever way it answers: without `wait` the engine hands back
         * nothing and this is the same synchronous call it always was */
        await engine.openUi(i.ui, i.wait === true)
        return ok()
      case 'play': {
        /* as_plain defaults to the study arm this participant was assigned at join */
        const plain = i.as_plain ?? engine.mode() === 'plain'
        /* THE PROGRAMME IS TAKEN OFF `by` AND NEVER OFF THE PAYLOAD, the same
         * source `scoped` uses for flags. An island naming its own programme here
         * could write a grade onto another programme's ledger row. */
        return ok(await engine.playBeat(i.beat, plain,
          i.items ? { items: i.items, title: i.title, place: i.place, programme: by?.grape } : undefined))
      }
      case 'get':
        /* and it READS its own corner too, or the namespace is half a namespace:
         * an island that wrote "met" and then read `flags` would get back
         * "atc:met" beside every other island's, and recognise none of it. */
        if (i.path === 'flags' && by) {
          const mine = `${by.grape}:`
          return ok((engine.read('flags') as string[])
            .filter((f) => f.startsWith(mine)).map((f) => f.slice(mine.length)))
        }
        return ok(engine.read(i.path))
      case 'set_flag':
        engine.setFlag(scoped(i.flag))
        return ok()
      case 'award':
        engine.award(i)
        return ok()
      case 'log':
        engine.log(i.event, i.data)
        return ok()
    }
    /* unreachable while the switch is exhaustive; the assignment is what makes
     * the compiler say so if a case is ever added to the union and not here */
    const never: never = i
    return no(`unknown intent ${JSON.stringify(never)}`)
  } catch (e) {
    if (e instanceof NoWorld) return no(`${e.what} needs a map, and this scene has none`)
    /* NotBuilt lands here too and its message is already the refusal. See the
     * class below for why an unbuilt word must refuse rather than resolve. */
    return no(e instanceof Error ? e.message : String(e))
  }
}

class NoWorld extends Error {
  constructor(readonly what: string) { super(what) }
}

/* thrown by a word the engine cannot perform yet, so the caller gets a refusal */
export class NotBuilt extends Error {
  constructor(readonly what: string, detail?: string) {
    super(detail ? `${what} is not built yet. ${detail}` : `${what} is not built yet`)
  }
}
