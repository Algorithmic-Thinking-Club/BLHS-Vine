// BOTH ARMS, ACTUALLY RENDERED, over all eight kinds.
//
// palette.test.ts proves the two arms cannot disagree about what an item IS. It
// cannot prove either arm draws it, and "the control arm gets a blank fieldset"
// is exactly the failure that is invisible in the data. So this renders the real
// CoreBeatRunner to a string in each arm and reads the output.
//
// No JSX: the vitest include glob is `src/**/*.test.ts`, so a .tsx test would not
// run at all and would look like it was passing. createElement says the same thing
// and runs.
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import type { CheckStep } from '../../vine/contract'
import { CoreBeatRunner } from './ActivityRunner'
import { checksOf, playableSteps, type BeatWorld } from './frames'
import { no, ok, type Intent } from '../../vine/intents'
import { emptyScore } from './score'
import { PALETTE, plainOf, refuseCheck } from './palette'
import type { BeatStep, CoreBeat } from './frames'
import { CORE_Y1 } from './y1'
import { CORE_Y2 } from './y2'
import { CORE_Y3 } from './y3'
import { coreY4 } from './y4'
import { classBeat } from './classes'
import { CLASSES } from '../planner/catalog'
import { beginAdventure, loadSave } from '../save'

const CHECKS: CheckStep[] = [
  {
    kind: 'choice', id: 'a-choice', prompt: 'How do you join a club here?',
    options: [
      { text: 'Walk into the meeting', correct: true, reply: 'That is it. Nobody signs you in.' },
      { text: 'Fill out a district form', reply: 'No form. You walk in.' },
    ],
  },
  { kind: 'quiz', item: { id: 'a-quiz', prompt: 'When does Monday start?', choices: ['7:30', '8:30'], correctIndex: 1, explanation: 'Monday is the late start.' } },
  {
    kind: 'sort', id: 'a-sort', prompt: 'Put each value under its letter.',
    buckets: ['P', 'O'], items: [{ label: 'Perseverance', bucket: 'P' }, { label: 'Ownership', bucket: 'O' }],
  },
  { kind: 'number', id: 'a-number', prompt: 'How many credits to graduate?', answer: 24, unit: 'credits', reply: 'Twenty-four.' },
  {
    kind: 'order', id: 'a-order', prompt: 'Put the four years in order.',
    items: [
      { label: 'Freshman', position: 1 }, { label: 'Sophomore', position: 2 },
      { label: 'Junior', position: 3 }, { label: 'Senior', position: 4 },
    ],
  },
  {
    kind: 'place', id: 'a-place', prompt: 'Where do you change a schedule?',
    regions: [{ name: 'student_services', label: 'Student Services' }, { name: 'commons', label: 'The Commons' }],
    correct: 'student_services',
  },
  {
    kind: 'do', id: 'a-do', prompt: 'Go and read the activities board.',
    goal: { anchor: 'activities_board', label: 'The activities board' },
    decoys: [{ anchor: 'trophy_case', label: 'The trophy case' }],
  },
  {
    kind: 'showdown', id: 'a-showdown', prompt: 'Last drive.', opponent: 'Sumner',
    rounds: [{
      id: 'r1', prompt: 'What closes a cord?',
      options: [{ text: 'Meeting the criterion', correct: true, reply: 'The criterion, not the effort.' }, { text: 'Showing up', reply: 'Attendance is not a criterion.' }],
    }],
  },
]

const beatWith = (checks: CheckStep[]): CoreBeat => ({
  id: 'test:arms', year: 1, title: 'The eight frames', place: 'the Advisory Hearth',
  kind: 'core', credit: 0.5, takeaways: [],
  steps: [
    { kind: 'say', line: { speaker: 'Wiseman', text: 'One of each, then.' } },
    ...checks.map((check): BeatStep => ({ kind: 'check', check })),
  ],
})

/* forceArm is how a test picks an arm, and it is the same door `as_plain=True`
 * comes through, so this exercises the shipped path rather than a test-only one */
const draw = (beat: CoreBeat, arm: 'game' | 'plain') =>
  renderToStaticMarkup(createElement(CoreBeatRunner, { beat, onClose: () => {}, forceArm: arm }))

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(() => {
  localStorage.clear()
  beginAdventure()
})

describe('the plain arm draws every kind', () => {
  it('renders one fieldset per item with every option in it, and never a blank one', () => {
    const html = draw(beatWith(CHECKS), 'plain')
    for (const c of CHECKS) {
      const r = plainOf(c)
      expect(html, `${c.kind} prompt`).toContain(r.prompt)
      for (const f of r.fields) {
        if (f.label) expect(html, `${c.kind} row ${f.label}`).toContain(f.label)
        for (const o of f.options) expect(html, `${c.kind} option ${o.text}`).toContain(o.text)
      }
    }
    // the control arm is a form and has exactly one fieldset per item
    expect(html.match(/<fieldset>/g) ?? []).toHaveLength(CHECKS.length)
  })

  it('carries the dialogue as prose, so the control arm is short no content', () => {
    expect(draw(beatWith(CHECKS), 'plain')).toContain('One of each, then.')
  })

  it('the submit button starts disabled, so an empty form cannot be graded', () => {
    expect(draw(beatWith(CHECKS), 'plain')).toContain('disabled')
  })
})

describe('the game arm draws every kind', () => {
  it('opens on the dialogue and then plays each item in the panel', () => {
    expect(draw(beatWith(CHECKS), 'game')).toContain('One of each, then.')
  })

  it('every kind renders its own first screen without throwing', () => {
    /* a beat per kind, each one starting on its check, which is the screen a
     * member sees first and the one a missing branch would blank */
    for (const c of CHECKS) {
      const beat: CoreBeat = { ...beatWith([c]), steps: [{ kind: 'check', check: c }] }
      const html = draw(beat, 'game')
      const r = plainOf(c)
      expect(html, `${c.kind}`).toContain(r.prompt)
      if (c.kind === 'showdown') {
        // the drive bar and the first round, not all the rounds at once
        expect(html).toContain('to go')
        expect(html).toContain(c.rounds[0].prompt)
      } else if (c.kind === 'do') {
        // no world was supplied, so it falls back to naming its places
        expect(html).toContain('The activities board')
        expect(html).toContain('The trophy case')
      } else {
        for (const f of r.fields) for (const o of f.options) expect(html, `${c.kind} ${o.text}`).toContain(o.text)
      }
    }
  })
})

/* W8 lives in an effect, and renderToStaticMarkup never runs one, so these mount
 * for real into happy-dom. Everything above stays on the string renderer because
 * it is testing what is drawn and this is testing what is DONE. */
async function mount(beat: CoreBeat, world?: BeatWorld, arm: 'game' | 'plain' = 'game') {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(CoreBeatRunner, { beat, onClose: () => {}, forceArm: arm, world }))
  })
  return {
    html: () => host.innerHTML,
    text: () => host.textContent ?? '',
    pickRadio: async (name: string, nth: number) => {
      const r = host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)[nth]
      if (!r) throw new Error(`no radio ${name}[${nth}]`)
      await act(async () => { r.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    },
    click: async (text: string) => {
      const b = [...host.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes(text))
      if (!b) throw new Error(`no button reading "${text}" in: ${host.innerHTML}`)
      await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    },
    unmount: async () => { await act(async () => { root.unmount() }) },
  }
}

describe('W8: a do staged in the world, and what happens when it cannot be', () => {
  const doCheck = CHECKS.find((c) => c.kind === 'do')!
  const beat: CoreBeat = { ...beatWith([doCheck]), steps: [{ kind: 'check', check: doCheck }] }

  it('issues guide_to on the goal anchor and asks for nothing else', async () => {
    const issued: Intent[] = []
    const world: BeatWorld = {
      issue: async (i) => { issued.push(i); return ok() },
      onReached: () => () => {},
    }
    const m = await mount(beat, world)
    /* the whole of W8's outbound half: one word, already in the vocabulary, on an
     * anchor name. A second intent appearing here is a second vocabulary. */
    expect(issued).toEqual([{ kind: 'guide_to', anchor: 'activities_board' }])
    await m.unmount()
  })

  it('waits for the walk rather than showing the answer', async () => {
    const world: BeatWorld = { issue: async () => ok(), onReached: () => () => {} }
    const m = await mount(beat, world)
    expect(m.html()).toContain('The path is marked')
    // the places are NOT listed while the world is staging it: walking there IS the answer
    expect(m.html()).not.toContain('The trophy case')
    await m.unmount()
  })

  it('scores the anchor the player actually reached, goal or decoy', async () => {
    for (const [anchor, expected] of [['activities_board', 'That is the place'], ['trophy_case', 'Not this one']] as const) {
      let fire: ((a: string) => void) | null = null
      const world: BeatWorld = { issue: async () => ok(), onReached: (cb) => { fire = cb; return () => {} } }
      const m = await mount(beat, world)
      await act(async () => { fire!(anchor) })
      expect(m.html(), anchor).toContain(expected)
      await m.unmount()
    }
  })

  it('ignores an arrival at somewhere the item never named', async () => {
    let fire: ((a: string) => void) | null = null
    const world: BeatWorld = { issue: async () => ok(), onReached: (cb) => { fire = cb; return () => {} } }
    const m = await mount(beat, world)
    await act(async () => { fire!('panther_maw') })
    // still waiting: walking past something on the way is not an answer
    expect(m.html()).toContain('The path is marked')
    await m.unmount()
  })

  it('unsubscribes when the item leaves, so a closed beat is not still listening', async () => {
    let subs = 0
    const world: BeatWorld = { issue: async () => ok(), onReached: () => { subs++; return () => { subs-- } } }
    const m = await mount(beat, world)
    expect(subs).toBe(1)
    await m.unmount()
    expect(subs).toBe(0)
  })

  it('a refused staging falls back to the places as buttons instead of stranding the student', async () => {
    /* the mistake an author will actually make: a typo in the anchor name. The
     * arrival can then never come, and waiting on it would lock the beat with no
     * way out and no explanation. */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const world: BeatWorld = {
      issue: async () => no('no anchor named "activities_board" on hub'),
      onReached: () => () => {},
    }
    const m = await mount(beat, world)
    expect(m.html()).toContain('The activities board')
    expect(m.html()).toContain('The trophy case')
    expect(warn.mock.calls.flat().join(' ')).toContain('a-do')
    await m.click('The activities board')
    expect(m.html()).toContain('Keep going')
    await m.unmount()
    warn.mockRestore()
  })
})

describe('CONTENT CONSTANCY, played through: the control arm gets the instruction', () => {
  /* the defect, in one sentence: PlainForm rendered the prompts and the options
   * and dropped every `reply`, so the treatment student was told why they were
   * wrong and what the truth is and the control student was told nothing. The unit
   * test above proves the strings are on the derived item. This one answers the
   * form the way a fourteen year old does and reads the screen they get back. */
  const beat = beatWith([CHECKS[0], CHECKS[1]])

  it('prints the reply for what the student picked, right and wrong, before the grade', async () => {
    const m = await mount(beat, undefined, 'plain')
    await m.pickRadio('a-choice', 1)     // the wrong one
    await m.pickRadio('a-quiz', 1)       // the right one
    await m.click('Submit')
    expect(m.text(), 'the wrong answer is corrected').toContain('No form. You walk in.')
    expect(m.text(), 'the right answer is confirmed').toContain('Monday is the late start.')
    expect(m.text()).toContain('the answer is Walk into the meeting')
    // and the grade comes AFTER the correction, not instead of it
    expect(m.text()).not.toContain('Back to the year')
    await m.click('Continue')
    expect(m.text()).toContain('Back to the year')
    await m.unmount()
  })

  it('the same beat in the game arm speaks the same two strings', async () => {
    const m = await mount(beat, undefined, 'game')
    await m.click('One of each, then.')
    await m.click('Fill out a district form')
    expect(m.text()).toContain('No form. You walk in.')
    await m.click('Keep going')
    await m.click('8:30')
    expect(m.text()).toContain('Monday is the late start.')
    await m.unmount()
  })
})

describe('the refusal reaches the author and never the student', () => {
  const broken: CheckStep = {
    kind: 'choice', id: 'two-right', prompt: 'Which of these is true?',
    options: [{ text: 'a', correct: true, reply: '' }, { text: 'b', correct: true, reply: '' }],
  }

  it('drops a refused item from the spine, the steps and the denominator together', () => {
    const beat = beatWith([CHECKS[0], broken])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(checksOf(beat).map((c) => c.kind === 'quiz' ? c.item.id : c.id)).toEqual(['a-choice'])
    expect(playableSteps(beat).filter((s) => s.kind === 'check')).toHaveLength(1)
    expect(emptyScore(beat).total).toBe(1)
    expect(warn.mock.calls.flat().join(' ')).toContain('two-right')
    warn.mockRestore()
  })

  it('the broken item is on no screen in either arm', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const beat = beatWith([CHECKS[0], broken])
    expect(draw(beat, 'plain')).not.toContain('Which of these is true?')
    expect(draw(beat, 'game')).not.toContain('Which of these is true?')
    vi.restoreAllMocks()
  })
})

describe('the validator is calibrated against the real authored content', () => {
  it('accepts every check in every core beat and every generated class beat', () => {
    const beats: CoreBeat[] = [
      CORE_Y1, CORE_Y2, CORE_Y3, coreY4(loadSave()!),
      ...CLASSES.flatMap((c) => [1, 2, 3, 4].map((y) => classBeat(c, y))),
    ]
    const refused: string[] = []
    for (const b of beats) {
      for (const s of b.steps) {
        if (s.kind !== 'check') continue
        const why = refuseCheck(s.check)
        if (why) refused.push(`${b.id}: ${why}`)
      }
    }
    /* the point of this test is the direction of the failure. A validator tuned to
     * its own fixtures and not to the game's real items is a validator that would
     * have thrown out shipped content the first time a beat ran. */
    expect(refused).toEqual([])
    expect(beats.length).toBeGreaterThan(40)
  })

  it('covers every kind in the palette with a rendered case', () => {
    expect(CHECKS.map((c) => c.kind).sort()).toEqual(Object.keys(PALETTE).sort())
  })
})
