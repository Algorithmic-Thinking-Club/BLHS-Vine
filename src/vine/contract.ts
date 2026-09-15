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

// the knowledge taxonomy, and a grape declares which one it is
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
export type SessionMode = 'game'

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

// a grape as a scene: an npc, dialogue, an optional cutscene, a check and a reward

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

// the nine kinds of understanding check an island can score a student on
export type CheckStep =
  // a consequential dialogue choice (the "make the pitch": a good reply lands, a weak one gets a hint)
  | { kind: 'choice'; id: string; prompt: string; options: { text: string; correct?: boolean; reply: string }[]; objective?: string }
  // classic MCQ (fallback / simple checks)
  | { kind: 'quiz'; item: QuizItem }
  // drag items into the right bucket(s) ("stock the trophy case")
  | { kind: 'sort'; id: string; prompt: string; buckets: string[]; items: { label: string; bucket: string }[]; objective?: string }
  /* type a number, with how far off an answer may be stated in the data */
  | { kind: 'number'; id: string; prompt: string; answer: number; tolerance?: number; unit?: string; reply?: string; objective?: string }
  /* put items in order, scored a point per item that lands in its own place */
  | { kind: 'order'; id: string; prompt: string; items: { label: string; position: number }[]; reply?: string; objective?: string }
  /* pick a named region, with the machine name kept apart from what the student reads */
  | { kind: 'place'; id: string; prompt: string; regions: { name: string; label: string }[]; correct: string; image?: string; reply?: string; objective?: string }
  /* scores an action: the student goes to the right anchor, with decoys for the plain arm */
  | { kind: 'do'; id: string; prompt: string; goal: { anchor: string; label: string }; decoys: { anchor: string; label: string }[]; reply?: string; objective?: string }
  /* a turn-based contest where knowledge is the ammunition, one point per round */
  | { kind: 'showdown'; id: string; prompt: string; opponent: string; rounds: ShowdownRound[]; objective?: string }
  /* a program the student builds then watches run, a point per slot, keyed by slot index and never by the card's label: an `order` keys its response by the item's label, so reusing one instruction twice collapses two slots into one answer, and the moves are a reusable vocabulary so every slot may hold any move */
  | {
    kind: 'program'; id: string; prompt: string
    /** the board as a figure, which is how the plain arm is given the same problem */
    grid: string
    /** the instruction vocabulary every slot chooses from. Two or more. */
    moves: { name: string; label: string }[]
    /** one per numbered slot, in order. `move` is the instruction that belongs there. */
    slots: { label: string; move: string }[]
    /* what the body walks while the student watches, drawn by the game arm and read by nothing in the scoring path, which keeps the walk a body on an item rather than a second thing being measured */
    board?: {
      cols: number; rows: number
      walls: [number, number][]
      flag: [number, number]
      start: { col: number; row: number; facing: 'north' | 'south' | 'east' | 'west' }
    }
    reply?: string; objective?: string
  }

/** one turn of a showdown, the same shape as a `choice`, because a round is a choice with a scoreboard behind it and a second shape would give the palette two spellings of one word */
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
  intro?: SceneLine[]          // beat 3, dialogue
  media?: MediaClip            // beat 4, the real video, framed
  cutscene?: CutsceneStep[]    // optional richer beat, Thor follows the NPC
  check: CheckStep[]           // beat 5, the woven understanding checks
  outro?: SceneLine[]
  reward?: RewardDef           // beat 6, tangible reward
}

// pure data: a config-only grape ships this plus a manifest and no code, and `encounter` adds the full in-world scene while omitting it renders the simple intro/clips/quiz path
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
