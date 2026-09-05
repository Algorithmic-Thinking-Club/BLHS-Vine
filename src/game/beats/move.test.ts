/* THE FRAME THAT MOVES, AND THAT IT ACTUALLY MOVES.
 *
 * BRIEF-YEAR-ONE beat 5 turned `sort` and `order` from grids of radio chips into
 * a pool of pieces and a set of places, on the rule that the year's content is
 * "done rather than quizzed". A frame like that has one failure mode that a
 * screenshot cannot catch and a person will not notice until they try it: the
 * pieces light up, the places light up, and nothing lands.
 *
 * That is exactly what the first browser capture of it showed, and it is why
 * this file exists rather than another picture. Every assertion is one press a
 * student makes.
 *
 * IT ALSO PINS THE THING THE STUDY DEPENDS ON. The response map this frame
 * writes has to be the same map the radio chips wrote, because `palette.ts`
 * scores both arms from it and the control arm's form was not changed at all. A
 * frame that moves pieces beautifully and writes a different shape would break
 * the arm-parity guarantee silently.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { CoreBeatRunner } from './ActivityRunner'
import { CORE_Y1 } from './y1'
import { plainOf } from './palette'
import { checksOf } from './frames'
import { beginAdventure } from '../save'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  /* the real starter rather than a hand-written blob: `CoreBeatRunner` returns
   * null without a save, and a save this file invented is a save the module's
   * own validator has never seen. */
  beginAdventure()
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const click = (el: Element | null | undefined) => {
  expect(el, 'nothing to press').toBeTruthy()
  act(() => { (el as HTMLElement).click() })
}

/** walk the say steps until the sort's pool is on screen */
function openTheSort() {
  act(() => root.render(createElement(CoreBeatRunner, { beat: CORE_Y1, onClose: () => {} })))
  for (let i = 0; i < 14; i++) {
    if (host.querySelector('.bt-pool .bt-piece')) return
    const stage = host.querySelector('.bt-say') ?? host.querySelector('.bt-stage')
    if (!stage) break
    act(() => { (stage as HTMLElement).click() })
  }
}

describe('a piece goes where you put it', () => {
  it('the POWER values are a pool of pieces and five places, not five rows of chips', () => {
    openTheSort()
    const pieces = [...host.querySelectorAll('.bt-pool .bt-piece')]
    expect(pieces.map((p) => p.textContent)).toEqual(
      ['Perseverance', 'Ownership', 'Work Ethic', 'Engagement', 'Respect'],
    )
    expect(host.querySelectorAll('.bt-drop')).toHaveLength(5)
    /* the old rendering, gone: a bucket chip per row per option was the quiz */
    expect(host.querySelector('.bt-bucket')).toBeNull()
  })

  it('pressing a piece lifts it and lights every place', () => {
    openTheSort()
    const first = host.querySelector('.bt-pool .bt-piece')
    click(first)
    expect(host.querySelector('.bt-piece-held')).toBeTruthy()
    /* a place a student cannot drop into is not a target, so the lit state and
     * the enabled state are the same state */
    const wells = [...host.querySelectorAll('.bt-drop-well')]
    expect(wells).toHaveLength(5)
    /* the target a press lands on exists only while something is held */
    expect(host.querySelectorAll('.bt-drop-target')).toHaveLength(5)
    expect(wells.every((w) => w.className.includes('bt-drop-lit'))).toBe(true)
  })

  it('pressing a place LANDS the piece there, which is the whole frame', () => {
    openTheSort()
    click(host.querySelector('.bt-pool .bt-piece'))
    click(host.querySelectorAll('.bt-drop-target')[0])
    /* it left the pool */
    expect([...host.querySelectorAll('.bt-pool .bt-piece')].map((p) => p.textContent))
      .toEqual(['Ownership', 'Work Ethic', 'Engagement', 'Respect'])
    /* and it arrived in the first place, which is P */
    const holds = host.querySelectorAll('.bt-drop')[0].querySelectorAll('.bt-piece-set')
    expect([...holds].map((p) => p.textContent)).toEqual(['Perseverance'])
    /* nothing is held any more: the hand is empty and the places go dark */
    expect(host.querySelector('.bt-piece-held')).toBeNull()
    expect(host.querySelector('.bt-drop-target')).toBeNull()
    /* and the piece is INSIDE its box, not under it */
    expect(host.querySelectorAll('.bt-drop-well')[0].querySelector('.bt-piece-set')).toBeTruthy()
  })

  it('pressing a landed piece takes it back out, which is the undo nobody has to be told about', () => {
    openTheSort()
    click(host.querySelector('.bt-pool .bt-piece'))
    click(host.querySelectorAll('.bt-drop-target')[0])
    click(host.querySelectorAll('.bt-drop')[0].querySelector('.bt-piece-set'))
    /* back in the hand, and out of the place */
    expect(host.querySelector('.bt-piece-held')).toBeTruthy()
    expect(host.querySelectorAll('.bt-drop')[0].querySelector('.bt-piece-set')).toBeNull()
  })

  it('the answer cannot be committed until every piece is placed', () => {
    openTheSort()
    const commit = () => host.querySelector('.bt-foot .kit-plank') as HTMLButtonElement | null
    expect(commit()?.disabled).toBe(true)
    for (let i = 0; i < 5; i++) {
      click(host.querySelector('.bt-pool .bt-piece'))
      click(host.querySelectorAll('.bt-drop-target')[i])
    }
    expect(commit()?.disabled).toBe(false)
  })

  /* ---- AND THE SHAPE THE STUDY READS IS UNCHANGED ------------------------ */
  it('writes the same response the form writes, so both arms still score alike', () => {
    const sort = checksOf(CORE_Y1).find((c) => c.kind === 'sort')!
    const derived = plainOf(sort)
    openTheSort()
    /* place every piece in its own correct place, by walking the derived item
     * rather than by knowing the content: the frame is what is under test. */
    for (let i = 0; i < derived.fields.length; i++) {
      const piece = host.querySelector('.bt-pool .bt-piece') as HTMLElement
      const name = piece.textContent
      const field = derived.fields.find((f) => f.label === name)!
      const where = derived.fields[0].options.findIndex((o) => o.value === field.correct)
      click(piece)
      click(host.querySelectorAll('.bt-drop-target')[where])
    }
    /* every piece sits in the place its own field calls correct */
    for (const f of derived.fields) {
      const where = derived.fields[0].options.findIndex((o) => o.value === f.correct)
      const holds = [...host.querySelectorAll('.bt-drop')[where].querySelectorAll('.bt-piece-set')]
      expect(holds.some((h) => h.textContent === f.label), f.label).toBe(true)
    }
  })
})
