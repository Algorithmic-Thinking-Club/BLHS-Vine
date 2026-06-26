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
  heading: string
  body: string
}

// Pure data. A config-only grape ships just this plus a manifest, no code.
export interface GrapeContent {
  intro?: DialogueLine[]
  clips?: MediaClip[]
  quiz?: QuizItem[]
  handbook?: HandbookEntry[]
  outro?: DialogueLine[]
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
