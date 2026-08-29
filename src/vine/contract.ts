import type { ComponentType } from 'react'
import type { GrapeEvent } from './events'
import type { ThemeTokens } from './theme'

// The ten campus districts, straight from the real BLHS layout (see docs/campus-map-spec.md).
export type DistrictId =
  | 'commons'
  | 'stem'
  | 'learning-communities'
  | 'arts'
  | 'career-cte'
  | 'athletics-indoor'
  | 'athletic-fields'
  | 'jrotc'
  | 'student-services'
  | 'honors'

// Wiseman's knowledge taxonomy. A grape declares which one it is.
export type GrapeCategory =
  | 'sport'
  | 'competitive-club'
  | 'interest-club'
  | 'curricular'
  | 'policy'
  | 'academic-honor'
  | 'elective'
  | 'ap'

// game = full experience; plain = the AP-Research control (same content, game-ness stripped).
export type SessionMode = 'game' | 'plain'

export interface MediaClip {
  id: string
  kind: 'youtube' | 'file'
  src: string
  caption?: string
  durationSeconds?: number
}

export interface QuizItem {
  id: string
  prompt: string
  choices: string[]
  correctIndex: number
  explanation?: string
  objective?: string
}

export interface DialogueLine {
  speaker: string
  text: string
}

export interface HandbookEntry {
  id?: string
  heading: string
  body: string
}

// ---- Grape-as-SCENE: the in-world RPG encounter (the real format, not a UI slideshow) ----------------
// A richer grape plays out as a scene the player walks into: an NPC in a room, dialogue, an optional
// cutscene, a WOVEN understanding-check (not just an MCQ), and a tangible reward. Config-only grapes keep
// shipping intro/clips/quiz (simple path); an authored scene adds `encounter`. ALL declarative data, so ATC
// members author scenes (even cutscenes) without code; the runtime plays the beats. See the GDD 7-beat spec.

export interface NpcDef {
  id: string
  name: string
  sprite?: string        // NPC sprite sheet (idle/walk); falls back to a default actor
  portrait?: string      // dialogue portrait
}

export interface SceneLine {
  speaker: string                                            // 'Thor' | the NPC name | ...
  text: string
  portrait?: string                                          // override portrait for this line
  emote?: 'neutral' | 'happy' | 'surprised' | 'think'
}

// declarative cutscene steps (Thor loses control, follows the NPC). Small + authorable.
export type CutsceneStep =
  | { kind: 'say'; line: SceneLine }
  | { kind: 'move'; actor: 'thor' | 'npc'; to: string }      // to = a named mark in the room
  | { kind: 'face'; actor: 'thor' | 'npc'; dir: 'up' | 'down' | 'left' | 'right' }
  | { kind: 'camera'; to: string }
  | { kind: 'wait'; ms: number }

// THE WOVEN CHECK — varied, never just a bare MCQ. Each variant carries its own juiced feedback.
//
// THE ITEM PALETTE, AND WHY IT IS EIGHT KINDS RATHER THAN THREE (80.7, K3).
//
// It was choice, quiz and sort, which is a worksheet. The cost of that is not a
// dull screen, it is which of the school's real programmes can be an island at
// all: island twelve is the band island or the drama island or the robotics
// island, its author opens the palette, the kind their club actually IS is not in
// it, and so they write a quiz about band, which teaches when band meets and
// nothing about what band is.
//
// Every kind here declares its scoring and its plain rendering in ONE place,
// src/game/beats/palette.ts, so a new kind cannot ship with a game rendering and
// no control-arm one. That is not tidiness. The control arm receives whatever the
// palette derives, so a kind that renders badly in plain quietly makes the study's
// control condition harder, and that is a content failure wearing a UI hat.
//
// THE TIMING LAW, which is a property of the palette and not of any one kind: the
// item scores and the body does not. A student who answers every question right
// and mistimes every press has a perfect grade and a bad-looking run, and that is
// the correct outcome, because the alternative confounds the study with reaction
// time on a machine whose input latency nobody has measured. Motor skill changes
// what the result card says and never what the transcript says. No kind below
// takes a clock as a scoring input, and `showdown` takes no clock at all.
export type CheckStep =
  // a consequential dialogue choice (the "make the pitch": a good reply lands, a weak one gets a hint)
  | { kind: 'choice'; id: string; prompt: string; options: { text: string; correct?: boolean; reply: string }[]; objective?: string }
  // classic MCQ (fallback / simple checks)
  | { kind: 'quiz'; item: QuizItem }
  // drag items into the right bucket(s) ("stock the trophy case")
  | { kind: 'sort'; id: string; prompt: string; buckets: string[]; items: { label: string; bucket: string }[]; objective?: string }
  /* a NUMBER, with the tolerance stated in the data rather than left to a
   * renderer. "How many credits to graduate" is a number and dressing it as four
   * radio buttons turns recall into recognition, which is a different thing to
   * measure. `tolerance` is absolute and defaults to 0, so 24 means 24 and a GPA
   * question can say 0.05 and mean it. */
  | { kind: 'number'; id: string; prompt: string; answer: number; tolerance?: number; unit?: string; reply?: string; objective?: string }
  /* an ORDERING. The four years, the steps of an appeal, a rehearsal order. One
   * point per item that lands in its own place, so a student who has three of
   * five in sequence is not marked the same as one who guessed. `position` is
   * 1-based because that is what the student sees on the form. */
  | { kind: 'order'; id: string; prompt: string; items: { label: string; position: number }[]; reply?: string; objective?: string }
  /* a PLACE: pick a named region. `name` is the machine name (a MAPVIS anchor
   * name where the diagram is a real map) and `label` is what the student reads,
   * kept apart for the same reason MAPVIS keeps them apart: renaming a door for
   * the player must not silently change what the item is checking. */
  | { kind: 'place'; id: string; prompt: string; regions: { name: string; label: string }[]; correct: string; image?: string; reply?: string; objective?: string }
  /* a DO: scores an ACTION rather than an answer, and it is W8 written down.
   *
   * Deliberately narrow. A running beat may issue the intents an island can
   * already issue, and receives back exactly ONE kind of world event as an item's
   * input: the player reached a named anchor. No second vocabulary, no scene
   * reference, no renderer, no ticker. Scoring stays in the runner and the beat
   * stays pure data, which is what makes the plain rendering fall out by
   * construction instead of by a member remembering to write one.
   *
   * `decoys` are the other places the student could plausibly have gone, and they
   * are what the plain arm shows as the item. Without them the control arm gets a
   * question with one option, so the loader refuses a `do` that has none. */
  | { kind: 'do'; id: string; prompt: string; goal: { anchor: string; label: string }; decoys: { anchor: string; label: string }[]; reply?: string; objective?: string }
  /* a SHOWDOWN: the turn-based frame, where knowledge is the ammunition. The
   * stadium's last drive, a debate round, a robotics match. One point per round,
   * summed, and the chassis carries `earned` and `total` between rounds and
   * nothing else (src/game/beats/showdown.ts).
   *
   * It has NO timing input of any kind. Progress is a function of rounds
   * remaining minus rounds correct and nothing else, so there is nothing a
   * student can lose by being slow, and an island cannot make its own grade
   * easier by widening a window the transcript cannot see. */
  | { kind: 'showdown'; id: string; prompt: string; opponent: string; rounds: ShowdownRound[]; objective?: string }

/** one turn of a showdown. Same shape as a `choice`, because a round IS a choice
 *  with a scoreboard behind it, and giving it a second shape would give the
 *  palette two spellings of the same word. */
export interface ShowdownRound {
  id: string
  prompt: string
  options: { text: string; correct?: boolean; reply: string }[]
}

export interface RewardDef {
  points?: number
  handbookEntryId?: string     // unlocks a Handbook entry (the in-game encyclopedia fills)
  achievementId?: string
}

// The full in-world encounter (the GDD's 7 beats, expressed as data).
export interface GrapeEncounter {
  npc: NpcDef
  room?: string                // interior/room id this plays in (e.g. '305'); placement gives the building
  intro?: SceneLine[]          // beat 3 — dialogue
  media?: MediaClip            // beat 4 — the real video, framed
  cutscene?: CutsceneStep[]    // optional richer beat — Thor follows the NPC
  check: CheckStep[]           // beat 5 — the woven understanding-check(s)
  outro?: SceneLine[]
  reward?: RewardDef           // beat 6 — tangible reward
}

// Pure data. A config-only grape ships just this plus a manifest, no code. Add `encounter` for the
// full in-world scene; omit it and the vine renders the simple intro/clips/quiz path.
export interface GrapeContent {
  intro?: DialogueLine[]
  clips?: MediaClip[]
  quiz?: QuizItem[]
  handbook?: HandbookEntry[]
  outro?: DialogueLine[]
  encounter?: GrapeEncounter
}

export interface CompletionCriteria {
  clipsViewed?: boolean
  quizAttempted?: boolean
  minScorePercent?: number
}

export interface RankTrack {
  id: string
  tiers: string[]
}

export interface AchievementRule {
  id: string
  label: string
  when: 'completed' | 'perfectQuiz'
}

export interface ProgressionRules {
  contributesToGpa?: boolean
  rankTrack?: RankTrack
  achievements?: AchievementRule[]
}

// Where the grape lives. district + building place it; archetype/accent pick reusable art.
export interface GrapePlacement {
  district: DistrictId
  building: string
  archetype?: string
  accent?: string
}

export interface GrapeManifest {
  id: string
  title: string
  category: GrapeCategory
  blurb: string
  author?: string
  estimatedMinutes: number
  learningObjectives: string[]
  placement: GrapePlacement
  completion: CompletionCriteria
  progression?: ProgressionRules
}

export interface PlayerView {
  displayName: string
  gender: 'boy' | 'girl' | 'unspecified'
  gpa: number
  completedGrapeIds: string[]
  ranks: Record<string, string>
  achievements: string[]
}

export interface GrapeResult {
  grapeId: string
  quizScorePercent?: number
  clipsViewed?: string[]
  rankTier?: string
  raw?: Record<string, unknown>
}

// What the vine hands a custom grape. Config-only grapes never touch this.
export interface VineServices {
  mode: SessionMode
  player: PlayerView
  theme: ThemeTokens
  log: (event: GrapeEvent) => void
  complete: (result: GrapeResult) => void
  exit: () => void
}

export interface GrapeComponentProps extends VineServices {
  manifest: GrapeManifest
  content: GrapeContent
}

// The unit a member ships. Omit Component and the vine renders content for you.
export interface GrapeModule {
  manifest: GrapeManifest
  content: GrapeContent
  Component?: ComponentType<GrapeComponentProps>
}
