// THE SHOWDOWN CHASSIS. Two things are under test: that a drive adds up, and that
// nothing about the student's body is anywhere in the sum.
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { ShowdownRound } from '../../vine/contract'
import {
  progressOf, responseOf, showdownReduce, startShowdown, yardsRemaining,
  type ShowdownState,
} from './showdown'

const ROUNDS: ShowdownRound[] = [
  { id: 'r1', prompt: 'first down', options: [{ text: 'right', correct: true, reply: 'chains' }, { text: 'wrong', reply: 'no gain' }] },
  { id: 'r2', prompt: 'second down', options: [{ text: 'right', correct: true, reply: 'chains' }, { text: 'wrong', reply: 'no gain' }] },
  { id: 'r3', prompt: 'third down', options: [{ text: 'right', correct: true, reply: 'chains' }, { text: 'wrong', reply: 'no gain' }] },
  { id: 'r4', prompt: 'fourth down', options: [{ text: 'right', correct: true, reply: 'chains' }, { text: 'wrong', reply: 'no gain' }] },
]

/** play a whole drive, answering right where the pattern says so */
const drive = (right: boolean[]): ShowdownState => {
  let s = startShowdown(ROUNDS)
  for (const ok of right) {
    s = showdownReduce(s, { kind: 'pick', index: ok ? 0 : 1 }, ROUNDS)
    s = showdownReduce(s, { kind: 'next' }, ROUNDS)
  }
  return s
}

describe('the drive', () => {
  it('starts on the first round with nothing earned', () => {
    const s = startShowdown(ROUNDS)
    expect(s).toMatchObject({ round: 0, earned: 0, total: 4, picked: null, done: false })
  })

  it('carries earned and total between rounds and nothing else', () => {
    /* the state is exactly these six fields: no streak, no multiplier and no clock */
    expect(Object.keys(startShowdown(ROUNDS)).sort())
      .toEqual(['done', 'earned', 'picked', 'picks', 'round', 'total'])
  })

  it('scores a right answer once and a wrong answer not at all', () => {
    expect(drive([true, true, true, true]).earned).toBe(4)
    expect(drive([true, false, true, false]).earned).toBe(2)
    expect(drive([false, false, false, false]).earned).toBe(0)
  })

  it('refuses a second pick on the same round, so a double click cannot score twice', () => {
    let s = startShowdown(ROUNDS)
    s = showdownReduce(s, { kind: 'pick', index: 0 }, ROUNDS)
    s = showdownReduce(s, { kind: 'pick', index: 0 }, ROUNDS)
    s = showdownReduce(s, { kind: 'pick', index: 1 }, ROUNDS)
    expect(s.earned).toBe(1)
    expect(s.picked).toBe(0)
  })

  it('refuses next from an unanswered round, so the drive cannot skip a question', () => {
    const s = startShowdown(ROUNDS)
    expect(showdownReduce(s, { kind: 'next' }, ROUNDS)).toBe(s)
  })

  it('refuses an option that is not on the round', () => {
    const s = startShowdown(ROUNDS)
    expect(showdownReduce(s, { kind: 'pick', index: 9 }, ROUNDS)).toBe(s)
    expect(showdownReduce(s, { kind: 'pick', index: -1 }, ROUNDS)).toBe(s)
  })

  it('ends after the last round and ignores everything after', () => {
    const s = drive([true, true, true, true])
    expect(s.done).toBe(true)
    expect(s.round).toBe(4)
    expect(showdownReduce(s, { kind: 'pick', index: 0 }, ROUNDS)).toBe(s)
    expect(showdownReduce(s, { kind: 'next' }, ROUNDS)).toBe(s)
  })

  it('a drive with no rounds is over before it starts rather than dividing by zero', () => {
    const s = startShowdown([])
    expect(s.done).toBe(true)
    expect(yardsRemaining(s)).toBe(0)
    expect(progressOf(s)).toBe(1)
  })

  it('is pure: reducing does not mutate the state it was given', () => {
    const s = startShowdown(ROUNDS)
    const copy = JSON.parse(JSON.stringify(s))
    showdownReduce(s, { kind: 'pick', index: 0 }, ROUNDS)
    expect(s).toEqual(copy)
  })

  it('resumes from its own state, because a bell lands mid-drive more often than at a boundary', () => {
    // stop after two rounds, serialise the way a save would, carry on
    let s = startShowdown(ROUNDS)
    for (let i = 0; i < 2; i++) {
      s = showdownReduce(s, { kind: 'pick', index: 0 }, ROUNDS)
      s = showdownReduce(s, { kind: 'next' }, ROUNDS)
    }
    const resumed: ShowdownState = JSON.parse(JSON.stringify(s))
    let t = resumed
    for (let i = 0; i < 2; i++) {
      t = showdownReduce(t, { kind: 'pick', index: 0 }, ROUNDS)
      t = showdownReduce(t, { kind: 'next' }, ROUNDS)
    }
    expect(t.done).toBe(true)
    expect(t.earned).toBe(4)
    expect(responseOf('sd', t)).toEqual({ 'sd:r1': '0', 'sd:r2': '0', 'sd:r3': '0', 'sd:r4': '0' })
  })
})

describe('THE TIMING LAW: the item scores and the body does not', () => {
  it('yards remaining is a function of rounds remaining minus rounds correct, and of nothing else', () => {
    expect(yardsRemaining(drive([]), 80)).toBe(80)
    expect(yardsRemaining(drive([true]), 80)).toBe(60)
    expect(yardsRemaining(drive([true, true]), 80)).toBe(40)
    expect(yardsRemaining(drive([true, true, true, true]), 80)).toBe(0)
    // a wrong answer does not move the ball, and does not move it back either
    expect(yardsRemaining(drive([false, false]), 80)).toBe(80)
  })

  it('gives the same yard line for the same answers however long they took', () => {
    /* the whole point, stated as an experiment: two identical drives separated by
     * real wall-clock time have to read identically, because there is nothing in
     * the state a clock could have written to. */
    const fast = drive([true, false, true, false])
    const slow = JSON.parse(JSON.stringify(fast)) as ShowdownState
    const spin = Date.now()
    while (Date.now() - spin < 25) { /* let real time pass between the two reads */ }
    expect(yardsRemaining(slow)).toBe(yardsRemaining(fast))
    expect(progressOf(slow)).toBe(progressOf(fast))
  })

  it('the chassis file contains no clock at all', () => {
    /* a source tripwire, so nobody adds a timer to a scored frame */
    const src = fs.readFileSync(path.resolve('src/game/beats/showdown.ts'), 'utf8')
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*')).join('\n')
    for (const clock of ['Date', 'performance', 'setTimeout', 'setInterval', 'requestAnimationFrame']) {
      expect(code.includes(clock), `showdown.ts references ${clock}`).toBe(false)
    }
  })

  it('the palette cannot score on time either: scoring takes a check and an answer, full stop', () => {
    // the signature is the enforcement. `scoreOf(check, response)` has nowhere to
    // put a duration, so an island that wants to grade speed has to change the vine.
    const src = fs.readFileSync(path.resolve('src/game/beats/palette.ts'), 'utf8')
    expect(src).toContain('score: (c: ByKind[K], r: Response) => number')
    expect(src.includes('Date.now')).toBe(false)
  })
})
