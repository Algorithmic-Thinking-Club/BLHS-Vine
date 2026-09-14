/* the list of things the engine can be asked to do, as plain data a grape sends over */
import type { CheckStep, SessionMode } from './contract'
import { UI_PANELS } from '../game/ui-bus'

/* ---- what the engine can be asked to do ---------------------------------- */

export type Intent =
  /* dialogue. `who` is an anchor name when the speaker stands somewhere, so the
   * camera and the portrait can both be resolved from one string. */
  | { kind: 'say'; who?: string; text: string; portrait?: string }
  | { kind: 'choose'; prompt?: string; options: string[] }

  /* guide_to draws the arrow to a place, and null takes the arrow down */
  | { kind: 'guide_to'; anchor: string | null }
  /* highlight lights a thing where it stands, with no arrow and no road to it */
  | { kind: 'highlight'; anchor: string | null; on?: boolean }
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

  /* ---- WHAT THIS ISLAND IS ASKING OF THE STUDENT, AS A LIST ---------------
   *
   * Ash, on what a member should be able to build: *"its not clear exactly what to
   * do on an island. and this needs to be a big thing, when a member programs a
   * island and its mechanics. islands should constantly have tasks to do, and thats
   * how it should be layed out. and it goes towards completing that island."*
   *
   * `objective` is one sentence and always was: it says what to do NOW, and a
   * student who wants to know how much of the island is left has nowhere to look.
   * This is the list, and it is drawn in the sheet the year's own tasks already use,
   * so an island gets the marks, the notes, the counter and the plain-arm styling
   * for free.
   *
   * IT REPLACES WHATEVER WAS DECLARED, so an `@on_start` that runs again every time
   * the map loads is safe to write the plainest way: declare the same list, and the
   * ticks come back off the save rather than out of this call.
   */
  | { kind: 'island_tasks'; tasks: IslandTask[] }

  /* one task done, by the id its island gave it. Ticks are kept in the save, so a
   * student who reloads halfway through an island keeps what he finished. */
  | { kind: 'task_done'; id: string }

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
  | { kind: 'enter'; map: string; at?: string; cover?: string }
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
/* ---- ONE ROW ON AN ISLAND'S TASK LIST -------------------------------------
 *
 * Deliberately the smallest thing that can be drawn: a name a student reads, an id
 * the island ticks it by, and one optional line saying where it happens. No state
 * lives here. Whether a row is done is in the SAVE, because a student who closes
 * the tab halfway through an island has still done what he did. */
export type IslandTask = {
  /** the island's own name for it, which `task_done` is called with */
  id: string
  /** what a student reads */
  name: string
  /** one short line under an unfinished row saying where it happens */
  note?: string
}

/** how many rows an island may put on the sheet, so a list stays a list */
export const TASKS_MAX = 8
/** how long a row's name and note may be, in the same spirit as TEXT_MAX */
export const TASK_TEXT_MAX = 72

/** why this task list cannot be drawn, or null when it can */
export function refuseTasks(tasks: unknown): string | null {
  if (!Array.isArray(tasks) || !tasks.length)
    return 'island_tasks needs a list with at least one task in it'
  if (tasks.length > TASKS_MAX)
    return `island_tasks takes at most ${TASKS_MAX} tasks, and this one has ${tasks.length}`
  const seen = new Set<string>()
  for (const t of tasks as Record<string, unknown>[]) {
    if (!t || typeof t !== 'object') return 'every task has to be a dict with an id and a name'
    const id = typeof t.id === 'string' ? t.id.trim() : ''
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    if (!id) return 'every task needs an id, which is the word you tick it with'
    if (!name) return `the task "${id}" needs a name, which is what a student reads`
    /* TWO ROWS WITH ONE ID is a tick that means two things, and the one a student
     * finishes is whichever the loop reached first. Caught at the line that made it. */
    if (seen.has(id)) return `two tasks are both called "${id}", so ticking one would tick the other`
    seen.add(id)
    if (name.length > TASK_TEXT_MAX)
      return `the name of "${id}" is ${name.length} characters, and a row holds ${TASK_TEXT_MAX}`
    const note = typeof t.note === 'string' ? t.note.trim() : ''
    if (note.length > TASK_TEXT_MAX)
      return `the note on "${id}" is ${note.length} characters, and a row holds ${TASK_TEXT_MAX}`
  }
  return null
}

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
/* ---- WHAT A COVER IS FOR, WHICH IS NOT THE SAME AS WHAT IT LOOKS LIKE -------
 *
 * `ceremony` is the graduation: a held title over the islands.
 *
 * `passing` is new, and it is the one Ash's sail exposed: the first leg of a
 * voyage takes him through the map his dock is on, and that hop wore the full
 * arrival treatment. He got "E N T E R I N G   T H E   H U B", a progress bar and
 * a fact about the school, for a place he was crossing on his way to the boat, and
 * then a second one for where he was actually going. His words: *"for some reason,
 * it put a transition screen while sailing to the atc island. no clue why as arent
 * they all on the same ocean map?"* Two loading cards in one press is what made a
 * journey read as two journeys. A pass-through gets a plain fade and says nothing. */
export type CoverOccasion = 'ceremony' | 'passing'
export const COVER_OCCASIONS: CoverOccasion[] = ['ceremony', 'passing']

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
  /* ---- HOW MANY TIMES THIS ISLAND HAS BEEN FINISHED BEFORE, AND HOW WELL ----
   *
   * ASH: *"we can do a club again over years? is it meant to play different stuff?"*
   * Yes to the first and yes to the second, and until this existed an island had no
   * way to tell. A club taken in year two replayed year one word for word, because
   * the only thing a member could read about their own programme was a flag they had
   * set themselves.
   *
   * Answered about the CALLING island, the way `flags` is: nobody has to name
   * themselves to ask about themselves. `{ taken, years, best, rung }`. */
  | 'rank'

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
  /** every map this game can actually open, so a mistyped destination is refused by
   *  name instead of playing a loading screen onto nothing. Empty when the scene
   *  cannot say, which leaves the old behaviour alone. */
  knownMaps(): string[]
  guideTo(anchor: string | null): void
  /* the pool of light on its own, which `guide_to` has always raised as a side effect */
  highlight(anchor: string | null, on: boolean): void
  walkTo(anchor: string, off?: Offset): Promise<void>
  lookAt(anchor: string | null, ms?: number): Promise<void>
  show(anchor: string, visible: boolean): void
  /* play a named effect and come back when it has finished */
  fx(name: string, anchor?: string, data?: unknown): Promise<void>
  enter(map: string, at?: string, cover?: string): Promise<void>
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
  /** what this programme has been finished at before: how many times, which years,
   *  the best grade, and the rung of any ladder it keeps */
  rankOf(programme: string | null): { taken: number; years: number[]; best: number | null; rung: number }
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
  /* AND THE LIST BESIDE IT, for the same reason: the sheet is chrome around the
   * window, so an island run in the standalone harness can still lay out what it
   * is asking for. `islandTasks` replaces the list; `taskDone` ticks one row. */
  islandTasks(tasks: IslandTask[], by?: IntentBy): void
  taskDone(id: string, by?: IntentBy): void
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
      case 'choose': {
        /* ---- THE ARGUMENTS THE WRONG WAY ROUND ------------------------------
         *
         * `choose(options, prompt=...)` is the shape, and `choose("Want a go?",
         * [YES, NO])` is what a hand types. Unchecked, the options reached the box as
         * a STRING, the renderer mapped over it, and the whole game went blank - not
         * the island, the game. A beginner's most likely mistake must be the thing
         * this API is best at explaining, never the thing it dies on. */
        if (!Array.isArray(i.options))
          return no('choose wants a LIST of options first and the prompt after it: '
            + 'choose(["Yes", "No"], prompt="Want a go?"). '
            + `It was given ${typeof i.options === 'string' ? `the text "${i.options}"` : typeof i.options}.`)
        if (!i.options.length) return no('choose was given an empty list, so there is nothing to press')
        const bad = i.options.findIndex((o) => typeof o !== 'string' || !o.trim())
        if (bad >= 0) return no(`choose option ${bad + 1} is not a line of text, so nothing can be drawn on it`)
        if (i.prompt !== undefined && typeof i.prompt !== 'string')
          return no('the prompt for choose is the sentence above the buttons, so it wants text')
        return ok(await w().choose(i.prompt, i.options))
      }
      case 'guide_to':
        /* null is not a name, so it is not checked against the map. Same shape
         * as `look_at` below, and for the same reason: letting go is a thing an
         * island asks for on purpose, not an argument somebody forgot. */
        if (i.anchor && !w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        w().guideTo(i.anchor)
        return ok()
      case 'highlight': {
        /* the same validation guide_to keeps, and null is letting go rather than a
         * name somebody forgot */
        const lit = i.on === false ? null : i.anchor
        if (lit && !w().hasAnchor(lit)) return no(`no anchor named "${lit}" on ${w().mapId()}`)
        w().highlight(lit, !!lit)
        return ok()
      }
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
        /* ---- AN OCCASION OR THE NAME OF A COVER THE MAP CARRIES --------------
         *
         * Covers belong to maps, and MAPVIS publishes named ones inside a map's own
         * bundle, so `cover` can be either: one of the engine's own occasions, or the
         * code name of a picture the destination ships. Anything else is refused by
         * name here rather than arriving as a cover nobody drew.
         *
         * The fence is MAPVIS's own rule for a name, because that is what the Cover
         * tab will let somebody type: lower case, digits and underscores, starting
         * with a letter. A name that cannot exist is a typo and is said out loud. */
        /* ---- A MAP NOBODY HAS IS A SENTENCE, NOT A TWELVE SECOND DEAD END ---
         *
         * `enter("hbu")` played a full loading cover and then arrived nowhere, with
         * the run over where it stood and nothing on screen naming the member's own
         * typo. Every other word that takes a name checks it; this one takes the most
         * consequential name in the vocabulary and took it on trust.
         *
         * The list comes from the world the game really loaded plus the doors on this
         * map, so it is the maps that exist rather than a table somebody maintains. A
         * scene that cannot answer says nothing and the old behaviour stands. */
        if (typeof i.map !== 'string' || !i.map.trim())
          return no('enter wants the name of a map to go to')
        {
          const maps = w().knownMaps()
          if (maps.length && !maps.includes(i.map.trim()))
            return no(`there is no map called "${i.map}". `
              + `This game has: ${[...maps].sort().join(', ')}`)
        }
        if (i.cover !== undefined) {
          const c = typeof i.cover === 'string' ? i.cover.trim() : ''
          if (!c) return no('cover wants an occasion or the code name of a cover, not an empty string')
          if (!COVER_OCCASIONS.includes(c as CoverOccasion) && !/^[a-z][a-z0-9_]{0,47}$/.test(c))
            return no(`"${c}" is neither an occasion (${COVER_OCCASIONS.join(', ')}) nor a legal cover name. `
              + 'A cover name is lower case letters, digits and underscores, starting with a letter.')
          await w().enter(i.map, i.at, c)
          return ok()
        }
        await w().enter(i.map, i.at)
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
        /* THE PLAYER IS A LEGAL SUBJECT AS WELL AS A LEGAL TARGET. `actor_face(x,
         * "thor")` turns somebody at the student; `actor_face("thor", x)` turns the
         * student at somebody. Without the second one a beat where a person walks up
         * and speaks leaves the student facing wherever his last walk pointed him,
         * and the only cure was a compass heading typed into an island. */
        if (i.actor !== PLAYER && !w().hasAnchor(i.actor))
          return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
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

      case 'island_tasks': {
        const why = refuseTasks(i.tasks)
        if (why) throw new NotBuilt('island_tasks', why)
        /* trimmed here so nothing downstream has to wonder, and `by` rides along so
         * the ticks are filed under the island that owns them */
        engine.islandTasks((i.tasks as IslandTask[]).map((t) => ({
          id: t.id.trim(), name: t.name.trim(),
          ...(typeof t.note === 'string' && t.note.trim() ? { note: t.note.trim() } : {}),
        })), by)
        return ok()
      }

      case 'task_done': {
        const id = typeof i.id === 'string' ? i.id.trim() : ''
        if (!id) throw new NotBuilt('task_done', 'task_done needs the id of the task to tick')
        engine.taskDone(id, by)
        return ok()
      }

      case 'open': {
        /* ---- A PANEL NOBODY HAS IS A SENTENCE, NOT A FROZEN GAME ----------
         *
         * `open` was the one word whose argument was never checked against its own
         * closed list, and it is a word a member types by hand. `open("guide")` for
         * "handbook" got all the way to the Hud, which is a chain of equality tests
         * with no else: nothing matched, nothing opened, and with `wait=True` the
         * waiter it had already parked was never called. The station handler holds the
         * world for its whole length, so a student stood still with no dialogue, no
         * panel and no controls for TEN MINUTES - the bus's own ceiling - and then the
         * island carried on as though the panel had opened and shut. Without `wait` the
         * same typo was a silent no-op reported as ok.
         *
         * The Maw's founding film says `open(..., wait=True)` four times, so this
         * lands in the first two minutes of the game.
         *
         * Every other word in this file refuses an unknown name with the list of the
         * ones that exist. This one does now too. */
        if (!(UI_PANELS as readonly string[]).includes(i.ui)) {
          return no(`"${String(i.ui)}" is not a panel this game has. `
            + `It has: ${[...UI_PANELS].sort().join(', ')}`)
        }
        /* awaited whichever way it answers: without `wait` the engine hands back
         * nothing and this is the same synchronous call it always was */
        await engine.openUi(i.ui, i.wait === true)
        return ok()
      }
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
        /* the same rule `flags` keeps: a question about "me" is answered about the
         * island that asked it, so an island never has to know its own id */
        if (i.path === 'rank') return ok(engine.rankOf(by?.grape ?? null))
        return ok(engine.read(i.path))
      case 'set_flag':
        engine.setFlag(scoped(i.flag))
        return ok()
      case 'award': {
        /* ---- A GRADE IS OUT OF FOUR, AND SAYS SO ---------------------------
         *
         * `award(grade=87)` is what somebody who has marked out of a hundred writes,
         * and it went straight onto the transcript: a GPA of 87, a letter nothing can
         * print, and no sentence anywhere saying what happened. A grade is the one
         * number in this API that is about a person, so it is the one worth being
         * strict about. `None` is still "finished, not graded" and always was. */
        if (i.grade !== undefined && i.grade !== null) {
          if (typeof i.grade !== 'number' || !Number.isFinite(i.grade))
            return no(`award's grade wants a number from 0 to 4, or None for "finished, not graded". `
              + `It was given ${typeof i.grade}.`)
          if (i.grade < 0 || i.grade > 4)
            return no(`award's grade is out of FOUR, like a GPA, and it was given ${i.grade}. `
              + 'If you marked out of a hundred, divide by twenty five.')
        }
        if (i.programme !== undefined && (typeof i.programme !== 'string' || !i.programme.trim()))
          return no('the programme for award is the id of the thing being finished, so it wants a name')
        engine.award(i)
        return ok()
      }
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
