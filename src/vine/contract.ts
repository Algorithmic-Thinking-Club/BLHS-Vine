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
export type CheckStep =
  // a consequential dialogue choice (the "make the pitch": a good reply lands, a weak one gets a hint)
  | { kind: 'choice'; id: string; prompt: string; options: { text: string; correct?: boolean; reply: string }[]; objective?: string }
  // classic MCQ (fallback / simple checks)
  | { kind: 'quiz'; item: QuizItem }
  // drag items into the right bucket(s) ("stock the trophy case")
  | { kind: 'sort'; id: string; prompt: string; buckets: string[]; items: { label: string; bucket: string }[]; objective?: string }

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
