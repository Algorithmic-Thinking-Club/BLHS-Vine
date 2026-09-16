import type { SessionMode } from './contract'

interface EventBase {
  grapeId: string
  at: number
}

export interface GrapeEnter extends EventBase {
  type: 'grape_enter'
}

export interface GrapeExit extends EventBase {
  type: 'grape_exit'
  completed: boolean
  dwellMs: number
}

export interface DialogueAdvanced extends EventBase {
  type: 'dialogue_advanced'
  index: number
}

export interface ClipStart extends EventBase {
  type: 'clip_start'
  clipId: string
}

export interface ClipComplete extends EventBase {
  type: 'clip_complete'
  clipId: string
  watchedSeconds: number
  skipped: boolean
}

export interface QuizItemShown extends EventBase {
  type: 'quiz_item_shown'
  itemId: string
}

export interface QuizItemAnswered extends EventBase {
  type: 'quiz_item_answered'
  itemId: string
  chosenIndex: number
  correct: boolean
  responseMs: number
  attempt: number
}

export interface QuizSubmitted extends EventBase {
  type: 'quiz_submitted'
  scorePercent: number
  itemCount: number
}

export interface GrapeCompleted extends EventBase {
  type: 'grape_completed'
  scorePercent?: number
  rankTier?: string
}

// one loose shape for the vine's own events, with the taxonomy name in name and payload in data
export interface GameEvent extends EventBase {
  type: 'game'
  name: string
  data?: Record<string, unknown>
}

export type GrapeEvent =
  | GrapeEnter
  | GrapeExit
  | DialogueAdvanced
  | ClipStart
  | ClipComplete
  | QuizItemShown
  | QuizItemAnswered
  | QuizSubmitted
  | GrapeCompleted
  | GameEvent

// What ships to Neon: each event wrapped with who/where/which-build context.
export interface LogEnvelope {
  schemaVersion: number
  appVersion: string
  sessionId: string
  participantId: string
  mode: SessionMode
  /** captain / god-mode session (law §2.14): shipped for debugging, EXCLUDED from study exports */
  dev?: boolean
  /** client-side envelope id, so analysis dedups a batch that shipped twice */
  eid?: string
  event: GrapeEvent
}
