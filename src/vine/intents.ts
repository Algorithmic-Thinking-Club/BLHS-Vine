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
   * immediately; walk_to takes the controls and returns when he arrives.
   *
   * `guide_to(None)` TAKES THE ARROW DOWN, and until now nothing could. The
   * target was set by this one word and cleared by nothing, so an island that
   * pointed at the wall once left an arrow standing over that wall for the life
   * of the scene, outranking the year's own next step the whole time
   * (ARC-MANIFEST BLOCKED 9). `look_at` beside it has taken null since it was
   * written and the scene's `guideTo` has always accepted it; the only thing
   * that ever refused was this type and the anchor check under it. */
  | { kind: 'guide_to'; anchor: string | null }
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
  /* `pace` is BRIEF-ARRIVAL item 6, and the brief names it: "a walking pace for
   * actor_move". A driven body travelled at the MAP's speed, which is the
   * player's own sprint-walk, and it travelled on one frozen frame, so the
   * principal covered the Maw in four seconds without moving his legs and Ash
   * read that as a sprint. The frames are fixed in the scene for every driven
   * body. This is the other half: a scene may be told that somebody is
   * strolling, walking or running, and the words are paces rather than numbers
   * because a number here would be painting pixels per second, which is a
   * quantity no author of a scene should have to hold. */
  | { kind: 'actor_move'; actor: string; to: string; facing?: string; pace?: Pace }
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

  /* THE SHOTS NOBODY HAS TO AUTHOR. `framing` names a composition somebody
   * dragged into place on one anchor, which is the right word for "the shot of
   * the tunnel mouth" and no help at all for "show me the whole island": there
   * is no anchor the whole island hangs off, and no author should have to
   * re-drag that shot on every map ever made.
   *
   * BRIEF-ARRIVAL item 3 is this word. "The moment he is on the dock the camera
   * zooms OUT to the whole island, for a moment." It could not be written,
   * because the walking shot ALREADY showed the whole island: measured on hub
   * v15 at 1366x768 the walking zoom was 1.18 and the painting drew 789 by 445
   * in the middle of the window with Thor twenty-one pixels tall. There was
   * nothing to pull back to.
   *
   * Three names, computed by the scene off the painting and the window:
   *   island  the whole painted extent, centred, held still
   *   walk    the shot a player walks around in, following the body
   *   close   in on the character, for a walk somebody is watching
   *   ship    riding with the hull, close enough that she is a ship
   *   sail    the wide sailing floor, the shot open water is crossed at
   * A room has no sea and answers `sail` and `ship` with `walk`.
   *
   * `ship` IS ASH'S SECOND PASS ON ITEM 1: "The crossing is much closer... the
   * camera rides with the ship... Not the wide shot of the whole island with the
   * ship as a speck, which is what shipped." `sail` is the old floor and is what
   * a player at the tiller still gets; `ship` is what a watched crossing gets. */
  | { kind: 'view'; view: ViewShot; ms?: number }

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

  /* THE MOVIE, which is BRIEF-ARRIVAL item 1 and Ash's own word for it.
   *
   * *"The crossing is a cutscene. Same point of view the ship had sailing out
   * from the beach, with the two black bars top and bottom, like a movie. No
   * HUD, no plaques, no 'Get in the boat', no drive-ship control of any kind.
   * There is no reason a student can drive the ship in the middle of a
   * cutscene. He watches."*
   *
   * WHY IT IS A MODE AND NOT A SCRIPT. `cutscene(name)` already exists and runs
   * a step list registered in TypeScript, which is the wrong side of the ruling
   * that says the crossing is written in the islands repo. And a script would
   * have to own the movement, while the thing actually moving the ship here is
   * `route(who="ship")`, which is a word the island already has. So this word
   * changes what the FRAME looks like and touches nothing about what is in it:
   * bars in, chrome out, hands off, and every other word carries on working.
   *
   * IT CANNOT BE LEFT ON. A student sitting behind two black bars with no
   * controls, because an island raised them and then raised an exception, is a
   * dead session that looks like a dead laptop. So the scene lifts them on
   * teardown and a ceiling lifts them anyway, the same shape as the two wait
   * ceilings below. */
  | { kind: 'movie'; on: boolean }

  /* STEPPING OFF THE BOAT, WHICH USED TO BE WELDED TO ARRIVING.
   *
   * A scripted crossing ties the ship up at the dock and leaves the player
   * aboard, because Ash's order at the dock is the pull-out and the arrival card
   * FIRST and the hop-out after them. There was no way to write that: the body
   * came off the boat inside the same call that berthed her. This is the second
   * half, said by the island at the moment it means.
   *
   * A no-op on a body already on its feet, so an island that says it twice, or
   * on a map it never sailed to, is not punished for it. */
  | { kind: 'ashore' }

  /* the sit-down panels. Deliberately a short closed list: a station that opens
   * a panel is a station that could have been a scene, so making this cheap to
   * add would be making the wrong thing cheap.
   *
   * `yearbook` was MISSING from this list and has been opened by name from the
   * Maw's own Python since the day the counselor was written. Nothing broke,
   * because this union is a compile-time promise and the string travels over
   * postMessage from a runtime that has never seen it, which is precisely the
   * hole `performIntent` exists to close: the one list that is supposed to be
   * the capability list did not carry a capability the engine has. */
  /* `wait` IS WHAT TURNS A MENU INTO A RAIL. Without it `open` comes back the
   * instant the screen is up, so an island that opens the pick screen has said
   * the last thing it can say: anything after that line runs underneath the
   * cards. BRIEF-MAW-RAIL's year one is five beats in a row, three of which are
   * a panel, and it cannot be written as one handler at all until this word can
   * come back when the panel closes.
   *
   * Left out, the word behaves exactly as it did, which matters: every existing
   * caller opens a panel as the last thing a station does and must not start
   * blocking. */
  | { kind: 'open'; ui: 'planner' | 'handbook' | 'chart' | 'wardrobe' | 'settings' | 'wall' | 'yearbook'; wait?: boolean }

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

/* HOW FAST A DRIVEN BODY TRAVELS, as three words rather than as a number. The
 * scene turns each into a fraction of the map's own speed, so a pace means the
 * same thing on a map whose people are eighteen pixels tall and on one whose
 * people are forty. */
export type Pace = 'stroll' | 'walk' | 'run'
export const PACES: Pace[] = ['stroll', 'walk', 'run']
/* Walk is the map's own speed and is what everything got before this existed.
 * A stroll is two thirds of it, which is the pace a person crosses a room at
 * when they are not in a hurry, and a run is half again. */
export const PACE_OF: Record<Pace, number> = { stroll: 0.62, walk: 1, run: 1.5 }

/** the shots the engine composes itself, off the painting and the window */
export type ViewShot = 'island' | 'walk' | 'close' | 'ship' | 'sail'
export const VIEW_SHOTS: ViewShot[] = ['island', 'walk', 'close', 'ship', 'sail']

export type RunPath =
  | 'year' | 'gpa' | 'tokens' | 'cords' | 'flags' | 'islands'
  | 'handle' | 'mode' | 'graduated'
  /* THE TWO THE VINE'S OWN CONTENT COULD READ AND A GRAPE COULD NOT.
   *
   * `stations.ts` is written in TypeScript beside the systems, so the counselor
   * calls `cordsOf(save)` and reads `detail`, the live status line progress.ts
   * writes once for the tracker board, and the trophy wall counts
   * `s.stickers.length + s.badges.length`. Neither number is on the nine paths
   * above, so the same two stations written in Python could not say the same
   * sentences. stations.ts's own header names that as the failure to avoid: "if
   * the vine's own content cannot be written in the API the members get, then the
   * API is a demo and the members are second-class".
   *
   * `cords` is left exactly as it was, a list of the ids you have EARNED, because
   * that is the cheap question and something may already be asking it. This is
   * the expensive one beside it: every cord, earned or not, with the school's own
   * rule and the live progress line.
   *
   * `trophies` is the other half of a word that could already write and could not
   * read: `award(sticker=..., badge=...)` has always been able to put something on
   * that wall, and nothing could ask what was on it. */
  | 'cord_board' | 'trophies'
  /* AND THE ONE THE FIRE HAS TO ASK BEFORE IT LIGHTS.
   *
   * `stations.ts` decides whether the hearth is open by calling `hasCoreBeat` and
   * `beatDone(s.ledger, s.year)`. Neither is reachable from Python, and the two
   * ways of writing the hearth without them are both wrong: hard-code
   * "core:y%d", which is a typed constant of exactly the kind anchors exist to
   * kill, or yield `play` unconditionally and re-run a beat the student already
   * sat, which writes a second grade for the same year.
   *
   * Named for the QUESTION and not for the storage. There is no `ledger` path and
   * there should not be: the comment above says a grape that could ask for an
   * arbitrary path is a grape the save can never change underneath. This asks one
   * thing, "is this year's advisory still owed, and what is it called", and the
   * answer is a beat id or null. */
  | 'advisory'
  /* AND THE ONE A RAIL HAS TO ASK BEFORE IT MOVES ON.
   *
   * Same shape as `advisory` above and for the same reason. The Maw's year one
   * opens the pick screen and then has to know whether the student really
   * stamped it or pressed Close for now, because a rail that walks him to the
   * fire with no year on the sheet has walked him past the only decision in the
   * beat. Nothing on the paths above can answer it: `tokens` counts seasons in
   * hand and does not move on a stamp, and `flags` carries nothing about a plan.
   *
   * Named for the question, "is this year's sheet stamped", and it is about THIS
   * year because that is the only year a student can stamp. */
  | 'planned'

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
  /** put the player off a berthed boat and onto the dock */
  ashore(): Promise<void>
  cutscene(script: string): Promise<void>

  /* the director half. Each one is a word for something MAPVIS already authors
   * and the game could not previously say. */
  pose(pose: string | undefined, facing: string | undefined): Promise<void>
  actorMove(actor: string, to: string, facing?: string, pace?: Pace): Promise<void>
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
  openUi(ui: 'planner' | 'handbook' | 'chart' | 'wardrobe' | 'settings' | 'wall' | 'yearbook', wait?: boolean): void | Promise<void>
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
  /* AND THE THIRD. The bars and the chrome are the WINDOW, not the map: a
   * scene with no painting still has a HUD to put away and a frame to draw, and
   * an island's opening should be able to say "this part is watched" wherever
   * it is being run. The scene listens to the same switch for its own in-world
   * furniture, so there is one flag and not two. */
  movie(on: boolean): void
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

/* AND THE LONGEST IT MAY WAIT FOR HIM TO WALK SOMEWHERE. Longer than a pause,
 * because this one is waiting on a person and a person browses; short enough that
 * an anchor behind a locked door, or one a player has decided not to visit, ends
 * as a `False` an island can branch on rather than as a scene that has stopped.
 * Two minutes is about a twentieth of the advisory session this game is played
 * in, which is the unit that matters. */
export const WAIT_FOR_CEILING_MS = 120_000

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
        /* null is not a name, so it is not checked against the map. Same shape
         * as `look_at` below, and for the same reason: letting go is a thing an
         * island asks for on purpose, not an argument somebody forgot. */
        if (i.anchor && !w().hasAnchor(i.anchor)) return no(`no anchor named "${i.anchor}" on ${w().mapId()}`)
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
        /* a pace nobody drew is a typo, and it reads the same way every other
         * named thing in this file reads: refused by name, with the list */
        if (i.pace && !PACES.includes(i.pace))
          return no(`"${i.pace}" is not a pace. They are: ${PACES.join(', ')}`)
        await w().actorMove(i.actor, i.to, i.facing, i.pace)
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
      case 'ashore':
        await w().ashore()
        return ok()
      case 'movie':
        /* NO MAP NEEDED, on purpose. The bars are a property of the window and
         * an island opening in the standalone harness should still be able to
         * say that a stretch of it is watched rather than played. */
        engine.movie(i.on === true)
        return ok()

      case 'open':
        /* awaited whichever way it answers: without `wait` the engine hands back
         * nothing and this is the same synchronous call it always was */
        await engine.openUi(i.ui, i.wait === true)
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
