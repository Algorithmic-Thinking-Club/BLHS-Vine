import type { GrapeManifest, GrapeResult, PlayerView, SessionMode } from './contract'

export interface SessionState {
  sessionId: string
  participantId: string
  mode: SessionMode
  startedAt: number
  player: PlayerView
  gpaSum: number
  gpaCount: number
}

export interface SessionOptions {
  sessionId: string
  participantId: string
  mode?: SessionMode
  displayName?: string
  gender?: PlayerView['gender']
}

export function createSession(opts: SessionOptions): SessionState {
  return {
    sessionId: opts.sessionId,
    participantId: opts.participantId,
    mode: opts.mode ?? assignMode(opts.participantId),
    startedAt: Date.now(),
    gpaSum: 0,
    gpaCount: 0,
    player: {
      displayName: opts.displayName ?? 'Thor',
      gender: opts.gender ?? 'unspecified',
      gpa: 0,
      completedGrapeIds: [],
      ranks: {},
      achievements: [],
    },
  }
}

// Deterministic game/plain split for the AP Research condition: the same anonymized participant
// always lands in the same arm, and the assignment is reproducible from the id alone.
export function assignMode(participantId: string): SessionMode {
  let h = 0
  for (let i = 0; i < participantId.length; i++) {
    h = (h * 31 + participantId.charCodeAt(i)) | 0
  }
  return (h & 1) === 0 ? 'game' : 'plain'
}

export function applyResult(state: SessionState, manifest: GrapeManifest, result: GrapeResult): SessionState {
  const p = state.player
  const firstTime = !p.completedGrapeIds.includes(manifest.id)
  const completedGrapeIds = firstTime ? [...p.completedGrapeIds, manifest.id] : p.completedGrapeIds

  const ranks = { ...p.ranks }
  if (manifest.progression?.rankTrack && result.rankTier) {
    ranks[manifest.progression.rankTrack.id] = result.rankTier
  }

  const achievements = [...p.achievements]
  for (const rule of manifest.progression?.achievements ?? []) {
    const earned = rule.when === 'completed' || (rule.when === 'perfectQuiz' && result.quizScorePercent === 100)
    if (earned && !achievements.includes(rule.id)) achievements.push(rule.id)
  }

  let gpaSum = state.gpaSum
  let gpaCount = state.gpaCount
  if (firstTime && manifest.progression?.contributesToGpa && result.quizScorePercent != null) {
    gpaSum += (result.quizScorePercent / 100) * 4
    gpaCount += 1
  }
  const gpa = gpaCount > 0 ? Math.round((gpaSum / gpaCount) * 100) / 100 : 0

  return { ...state, gpaSum, gpaCount, player: { ...p, completedGrapeIds, ranks, achievements, gpa } }
}
