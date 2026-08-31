/* THE INTENT VOCABULARY: the engine capability list, written down as data.
 *
 * This is the API. Not a layer over it, not a plan for one. Every mechanic in
 * the game asks for what it wants by putting one of these objects on the wire,
 * and the engine performs it. The Maw's stations go through here. A member's
 * Python grape will go through here. There is no second path, because a second
 * path is how this repo got PmapScene importing nothing from src/vine/.
 *
 * WHY OBJECTS AND NOT FUNCTIONS. The member's code runs as MicroPython in a
 * worker (VINE-AND-GRAPE.md), so an intent has to survive postMessage. Making
 * it JSON from the first line costs nothing today and is the only reason the
 * runtime stays swappable tomorrow. A function call would have to be torn out
 * and rebuilt as a message the day the worker lands, and that rebuild is
 * exactly the kind of retrofit that never happens.
 *
 * WHY THE KIND IS THE PYTHON NAME. `kind: 'guide_to'` is snake_case on purpose.
 * A member writes `yield self.guide_to("chart_table")`, the worker posts
 * `{kind: 'guide_to', anchor: 'chart_table'}`, and nothing in between translates
 * anything. A vocabulary with a lookup table in the middle is a vocabulary with
 * two spellings of every word and a place for them to drift apart.
 *
 * WHY ANCHORS AND NEVER COORDINATES. Every intent that touches a place takes an
 * anchor NAME. MAPVIS is the only thing that can create one (src/core/mask.ts),
 * it validates them as python identifiers where they are typed, and it keeps
 * `name` separate from `label` so renaming a door for the player cannot break
 * the code that addresses it. An x and a y in a grape would break the moment Ash
 * moved a table.
 */
import type { SessionMode } from './contract'

/* ---- what the engine can be asked to do ---------------------------------- */

export type Intent =
  /* dialogue. `who` is an anchor name when the speaker stands somewhere, so the
   * camera and the portrait can both be resolved from one string. */
  | { kind: 'say'; who?: string; text: string; portrait?: string }
  | { kind: 'choose'; prompt?: string; options: string[] }

  /* movement and attention. guide_to draws the walkable-path arrow and returns
   * immediately; walk_to takes the controls and returns when he arrives. */
  | { kind: 'guide_to'; anchor: string }
  | { kind: 'walk_to'; anchor: string }
  | { kind: 'look_at'; anchor: string | null; ms?: number }

  /* ---- THE DIRECTOR CLASS -------------------------------------------------
   *
   * Everything below this line consumes data MAPVIS ALREADY AUTHORS and the
   * game had no word for. That is the whole shape of wave four: the tool has
   * been publishing named paths, named shots, named looks and free-placed
   * berths for weeks, and each one was reader-less, so an author could draw a
   * route and then had no sentence in which to use it. A capability with an
   * authoring surface and no vocabulary is half a feature, and half a feature
   * is how this repo got 9,829 unreachable lines.
   *
   * THE PLAYER'S OWN BODY. He could walk and he could be looked at, and there
   * was no way to say what he was doing while standing still. `pose` is that:
   * a named body state and a heading, neither of which moves him. The heading
   * alone is the common case, because "turn and look at her" is a beat in
   * nearly every scene and the only way to write it was to walk him one pixel.
   * A pose whose art does not exist refuses by name and lists what does. */
  | { kind: 'pose'; pose?: string; facing?: string }

  /* OTHER BODIES. A placement bound to an anchor is a body with a name, and
   * these four words are the whole of what a scene needs to do to one: send it
   * somewhere, turn it, change its face, and let it go. `actor` is an ANCHOR
   * name and never a placement id, for the reason at the top of this file: a
   * placement id is a number MAPVIS assigned and an anchor name is a string a
   * person chose.
   *
   * ONE OBJECT PER CHARACTER, NEVER TWO. A driven actor is the placement that
   * was already on the map, taken over in place, not a second sprite created
   * beside it. Two would drift apart the first time one of them was moved.
   *
   * AND THEY ARE ALWAYS RELEASED. A placement stays driven until something
   * takes it out, and the driven pass re-asserts its frozen position every
   * frame, so an actor a scene forgot about stands still for the rest of the
   * visit. `actor_release` with no name releases every one of them, and the
   * scene does that itself at the end whether or not the author remembered. */
  | { kind: 'actor_move'; actor: string; to: string; facing?: string }
  | { kind: 'actor_face'; actor: string; facing: string }
  | { kind: 'actor_look'; actor: string; look: string }
  | { kind: 'actor_release'; actor?: string }

  /* ROUTES. A named authored polyline, travelled by the player, by a driven
   * actor, or by the ship. Waypoints, a facing to end on, and a kind that is
   * checked: a walk route over ground no body can stand on refuses, a sail
   * route over land refuses, and a camera is held to nothing.
   *
   * THE VOYAGE IS THIS WORD APPLIED TO THE SHIP. There was no way to start a
   * crossing from a script at all: the hull existed, the berthing manoeuvre
   * existed and was tested, and the only thing that could put a player on the
   * water was a player pressing a key. `route(..., who="ship")` is the trigger,
   * and it ends at a named berth because a berth is off every painting and is
   * the one place in this game that cannot be an anchor. */
  | { kind: 'route'; path: string; who?: string; backwards?: boolean }

  /* FRAMINGS BY NAME. `look_at` reads an anchor's unnamed default and always
   * has; this invokes a shot somebody named. The unnamed default is left alone
   * and stays what `look_at` uses, so nothing that works today changes.
   * `shot: null` gives the camera back, exactly as `look_at(None)` does. */
  | { kind: 'framing'; shot: string | null; ms?: number }

  /* TIME, so a scene can breathe and so it can react. `wait` is a pause a
   * person can feel; `wait_for` blocks until the player walks into a named
   * region, which is the only way to write "when he gets there" without a
   * polling loop in a member's Python. */
  | { kind: 'wait'; ms: number }
  | { kind: 'wait_for'; anchor: string; ms?: number }

  /* SOUND. One named effect from the ruled library, played once. The name is
   * the vocabulary and the file is an implementation detail, so an effect can
   * be replaced without touching a caller. A name the library does not hold
   * refuses and lists what it does, like every other named word here. */
  | { kind: 'sound'; name: string; gain?: number }

  /* the sit-down panels. Deliberately a short closed list: a station that opens
   * a panel is a station that could have been a scene, so making this cheap to
   * add would be making the wrong thing cheap. */
  | { kind: 'open'; ui: 'planner' | 'handbook' | 'chart' | 'wardrobe' | 'settings' }

  /* a scored activity. `beat` names one the engine can build; both study arms
   * render from the same items, which is what as_plain() means in practice and
   * why it is here rather than bolted on later. */
  | { kind: 'play'; beat: string; as_plain?: boolean }

  /* the world reflecting the run. `placement` is a MAPVIS placement id, bound to
   * an anchor so a grape addresses it by name like everything else. */
  | { kind: 'show'; anchor: string; visible: boolean }
  | { kind: 'fx'; name: string; anchor?: string; data?: unknown }

  /* scene changes. `at` is the arrival anchor in the target map, without which
   * every door into a room drops the player on that room's one global spawn. */
  | { kind: 'enter'; map: string; at?: string }
  | { kind: 'cutscene'; script: string }

  /* run state. `get` reads, and the paths it accepts are the ones progress.ts
   * can answer, so a grape cannot ask a question the engine has to invent an
   * answer to. */
  | { kind: 'get'; path: RunPath }
  | { kind: 'set_flag'; flag: string }
  /* THE LEDGER ROW AN ISLAND WRITES. It used to carry a grade and nothing else,
   * so every island's grade landed as `kind: 'core'`, `credit: 0.5`, no tags, and
   * an id made of a base-36 timestamp. That row moved the GPA the same amount as
   * every other island, could never move a cord no matter what the island was
   * about, appeared on the transcript titled "Awarded", and weighted the GPA
   * twice if the island was played twice.
   *
   * `programme` is the fix and it is one word: it names the roster entry this
   * grade belongs to, and from that the engine knows the title, the credit, the
   * kind, the cord tags, the rank track and a stable id. A grape says what it
   * finished; it does not get to say what that is worth. */
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

export type RunPath =
  | 'year' | 'gpa' | 'tokens' | 'cords' | 'flags' | 'islands'
  | 'handle' | 'mode' | 'graduated'

/* ---- what comes back ------------------------------------------------------ */

/* One shape for every reply so the worker protocol has one envelope and a
 * beginner's `pick = yield self.choose([...])` is the same machinery as
 * `yield self.say(...)`. `ok: false` is a refusal the engine can explain, never
 * an exception thrown across a runtime boundary. */
export type IntentResult =
  | { ok: true; value?: unknown }
  | { ok: false; why: string }

export const ok = (value?: unknown): IntentResult => ({ ok: true, value })
export const no = (why: string): IntentResult => ({ ok: false, why })

/* ---- who honours them ----------------------------------------------------- */

/* The half of the vocabulary that needs a world. A scene implements this and
 * the intents that touch a map become possible; a scene that does not is still
 * a legal place to run a grape, it just cannot be asked to walk anybody.
 *
 * Everything NOT in here (open, play, get, set_flag, award, log) is answered by
 * the engine itself and works in any scene, which is what makes a grape's logic
 * testable with no map at all. */
export interface IntentWorld {
  /* the map this scene is showing, so `enter` knows when it is a no-op */
  mapId(): string
  /* does this map have an anchor by that name */
  hasAnchor(name: string): boolean
  say(who: string | undefined, text: string, portrait?: string): Promise<void>
  choose(prompt: string | undefined, options: string[]): Promise<number>
  guideTo(anchor: string | null): void
  walkTo(anchor: string): Promise<void>
  lookAt(anchor: string | null, ms?: number): Promise<void>
  show(anchor: string, visible: boolean): void
  /* IT IS AWAITED NOW. It returned void, so `performIntent` answered ok the
   * instant the effect started and a script's next line ran over the top of it.
   * "Plays once, ends" is the shape the brief asks for and a step that ends is
   * the only one an author can compose with. */
  fx(name: string, anchor?: string, data?: unknown): Promise<void>
  enter(map: string, at?: string): Promise<void>
  cutscene(script: string): Promise<void>

  /* the director half. Each one is a word for something MAPVIS already authors
   * and the game could not previously say. */
  pose(pose: string | undefined, facing: string | undefined): Promise<void>
  actorMove(actor: string, to: string, facing?: string): Promise<void>
  actorFace(actor: string, facing: string): void
  actorLook(actor: string, look: string): void
  actorRelease(actor?: string): void
  route(path: string, who: string, backwards: boolean): Promise<void>
  framing(shot: string | null, ms?: number): Promise<void>
  waitFor(anchor: string, ms?: number): Promise<boolean>
}

/* The engine half. Supplied once at boot rather than per scene, because the
 * save file and the logger do not change when the camera does. */
export interface IntentEngine {
  openUi(ui: 'planner' | 'handbook' | 'chart' | 'wardrobe' | 'settings'): void
  playBeat(beat: string, asPlain: boolean): Promise<number | null>
  read(path: RunPath): unknown
  setFlag(flag: string): void
  award(a: {
    programme?: string; grade?: number; tags?: string[]
    fact?: string; sticker?: string; badge?: string
  }): void
  log(event: string, data?: Record<string, unknown>): void
  mode(): SessionMode
  /* THE TWO DIRECTOR WORDS THAT NEED NO MAP. A pause is a pause in the standalone
   * harness too, and an effect plays out of the same speakers whichever scene is
   * up, so putting either on the world would make a grape's own pacing untestable
   * without a painting. Sound refuses an unknown name here rather than at the
   * scene, for the same reason. */
  wait(ms: number): Promise<void>
  sound(name: string, gain?: number): void
}

/* WHO IS SPEAKING, WHEN IT IS NOT THE VINE.
 *
 * P4. `set_flag` took an arbitrary string and wrote it into one flat list shared
 * by every island in the game, so two members both shipping a flag called `done`
 * collided silently in a student's save, and an island could write `yearbook:y1`
 * and move something that was never its business.
 *
 * A flag is now prefixed with the id of whoever asked. The vine's own stations
 * have no `by` and keep the bare names they already wrote, because renaming
 * those would rewrite every existing save. A grape always has one. */
export type IntentBy = { grape: string }

/* THE LONGEST A SCENE MAY BE ASKED TO STAND STILL. Thirty seconds is already
 * longer than any beat in the walkthrough and four times the longest pause in the
 * beach opening; past it, a student cannot tell a scripted pause from a frozen
 * tab, and neither can the person marking the study data. A member who typed a
 * number in seconds gets a long pause and not a dead session. */
export const WAIT_CEILING_MS = 30_000

export type IntentHost = {
  world: IntentWorld | null
  engine: IntentEngine
  /** absent for the vine's own content; set to the island's programme id */
  by?: IntentBy
}

/* ---- the one place an intent is performed --------------------------------- */

/* Exhaustive on purpose. A new capability is a new case here and a new line in
 * the union above, and TypeScript refuses to build until both exist. That is
 * the whole enforcement mechanism for "the vocabulary is the capability list":
 * you cannot name something the engine cannot do, because naming it does not
 * compile.
 */
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
        if (!w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        w().guideTo(i.anchor)
        return ok()
      case 'walk_to':
        if (!w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        await w().walkTo(i.anchor)
        return ok()
      case 'look_at':
        /* THE ONLY ANCHOR-TAKING WORD THAT DID NOT CHECK ITS ANCHOR. guide_to,
         * walk_to and show all refuse a name the map does not carry; this one went
         * straight through, resolved on the next tick, and answered ok with the
         * camera never having moved. A typo in an anchor name is the single most
         * likely mistake a member will make, and this was the one word that would
         * not tell them. `null` still means "let the camera go" and is not a name. */
        if (i.anchor && !w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        await w().lookAt(i.anchor, i.ms)
        return ok()
      case 'show':
        if (!w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        w().show(i.anchor, i.visible)
        return ok()
      case 'fx':
        /* THE ANCHOR IS CHECKED HERE AND NOT ONLY INSIDE THE SCENE, so the word
         * behaves like every other anchor-taking word and the refusal reads the
         * same. Awaited, because an effect that has not finished is a step that
         * has not finished. */
        if (i.anchor && !w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
        await w().fx(i.name, i.anchor, i.data)
        return ok()
      case 'enter':
        await w().enter(i.map, i.at)
        return ok()
      case 'cutscene':
        await w().cutscene(i.script)
        return ok()

      /* ---- the director class -------------------------------------------- */

      case 'pose':
        /* SAYING NOTHING IS NOT AN INSTRUCTION. Both fields optional makes the
         * common case short (`pose(facing="north")`), and both absent makes a
         * call that would stand there reporting success while doing nothing at
         * all, which is the one thing no word in this file is allowed to do. */
        if (!i.pose && !i.facing) return no('pose needs a pose, a facing, or both')
        await w().pose(i.pose, i.facing)
        return ok()

      /* AN ACTOR IS AN ANCHOR NAME, so the four words below check it exactly the
       * way `show` does and the mistake an author will actually make, a typo,
       * reads the same everywhere. The anchor also has to be bound to something,
       * and that half is the scene's to answer because only the scene knows what
       * it loaded. */
      case 'actor_move':
        if (!w().hasAnchor(i.actor)) return no(`no anchor named "${i.actor}" on ${w().mapId()}`)
        if (!w().hasAnchor(i.to)) return no(`no anchor named "${i.to}" on ${w().mapId()}`)
        await w().actorMove(i.actor, i.to, i.facing)
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

      /* `wait_for` ANSWERS WHETHER IT HAPPENED. A timeout that resolves the same
       * as an arrival is a timeout an author cannot branch on, so the value is
       * the answer to "did he get there", and a wait with no timeout can only
       * ever answer true. */
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

      case 'open':
        engine.openUi(i.ui)
        return ok()
      case 'play': {
        /* THE CONTROL ARM IS NOT OPTIONAL. as_plain defaults to the arm this
         * participant was assigned at join, so a grape that never mentions it
         * still renders both ways and the study stays content-constant. A grape
         * CAN force plain (a teaching moment that should read the same either
         * way); it cannot force game, because that would let one island opt the
         * control arm out of its own control. */
        const plain = i.as_plain ?? engine.mode() === 'plain'
        return ok(await engine.playBeat(i.beat, plain))
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

/* NO INTENT MAY RESOLVE SUCCESSFULLY WITHOUT PERFORMING.
 *
 * Three of the fifteen words used to report success while doing nothing. `show`
 * warned to the console and returned. `fx` logged "(not built)" and returned.
 * `cutscene` logged "not implemented" and resolved. Each was written kindly, so
 * an author would see the engine had heard them, and each did the opposite:
 * `performIntent` saw a call that did not throw and answered `ok`.
 *
 * The person deceived is the AUTHOR, not the player. A member writes an arrival
 * script, runs it, sees no error, and ships an island whose most cinematic beat
 * never plays and reports that it worked. That survives a year, and one did.
 *
 * So an unbuilt capability throws this, the catch above turns it into
 * `{ok: false, why}`, and the refusal travels back across the worker to the line
 * of Python that asked. A word that cannot perform says so. */
export class NotBuilt extends Error {
  constructor(readonly what: string, detail?: string) {
    super(detail ? `${what} is not built yet. ${detail}` : `${what} is not built yet`)
  }
}
