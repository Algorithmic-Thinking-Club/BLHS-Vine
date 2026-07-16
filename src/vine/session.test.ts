// Session/arm logic. NOTE (§13.2): the SERVER's armFor (api/_logic.ts) is the authoritative
// study assignment, persisted to the save at join. assignMode below is the legacy dev-harness
// fallback ONLY — do not use it for study rendering; read save.arm.
import { describe, it, expect } from 'vitest'
import { assignMode, createSession, applyResult } from './session'
import type { GrapeManifest } from './contract'

describe('assignMode (legacy fallback)', () => {
  it('locked outputs — deterministic per participant', () => {
    expect(assignMode('p_abc123')).toBe('plain')
    expect(assignMode('p_xyz789')).toBe('game')
    expect(assignMode('anon0001')).toBe('plain')
  })
  it('is stable across calls', () => {
    for (let i = 0; i < 50; i++) expect(assignMode(`id${i}`)).toBe(assignMode(`id${i}`))
  })
})

describe('applyResult', () => {
  const manifest: GrapeManifest = {
    id: 'atc', title: 'ATC', category: 'interest-club', blurb: '', estimatedMinutes: 5,
    learningObjectives: [], placement: { district: 'stem', building: '300' },
    completion: {}, progression: { contributesToGpa: true, rankTrack: { id: 'atc', tiers: ['Member'] }, achievements: [{ id: 'done', label: 'Done', when: 'completed' }] },
  }

  it('first completion moves GPA, rank, and achievements', () => {
    const s0 = createSession({ sessionId: 's', participantId: 'p', mode: 'game' })
    const s1 = applyResult(s0, manifest, { grapeId: 'atc', quizScorePercent: 75, rankTier: 'Member' })
    expect(s1.player.gpa).toBe(3)                       // 75% of 4.0
    expect(s1.player.completedGrapeIds).toEqual(['atc'])
    expect(s1.player.ranks.atc).toBe('Member')
    expect(s1.player.achievements).toContain('done')
  })

  it('replays do not double-count GPA', () => {
    const s0 = createSession({ sessionId: 's', participantId: 'p', mode: 'game' })
    const s1 = applyResult(s0, manifest, { grapeId: 'atc', quizScorePercent: 100 })
    const s2 = applyResult(s1, manifest, { grapeId: 'atc', quizScorePercent: 0 })
    expect(s2.player.gpa).toBe(s1.player.gpa)
  })
})
