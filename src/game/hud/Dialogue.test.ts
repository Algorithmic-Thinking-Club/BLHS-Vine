/* tests that the dialogue box stays steady: one element across lines, and no typewriter glitches */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Dialogue } from './Dialogue'
import { say, choose, clearDialogue } from '../dialogue'

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

/* happy-dom has no rAF clock that advances on its own, so the typewriter is driven by hand, one call per frame with `performance.now` owned by this file, which is the only way a character count can be asserted */
let now = 0
let frames: FrameRequestCallback[] = []

beforeEach(() => {
  now = 1000
  frames = []
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => { frames.push(fn); return frames.length })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => { root.render(createElement(Dialogue)) })
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  clearDialogue()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** run the pending animation frames after moving the clock on by `ms` */
const tick = (ms: number) => {
  now += ms
  act(() => {
    const due = frames
    frames = []
    for (const fn of due) fn(now)
  })
}

const box = () => host.querySelector('.dlg-box')
/* type the whole line out before pressing: `advance` only advances a finished line, and the box refuses a press inside its first quarter second, so a test that only clicks tests neither */
const readAndPress = () => { tick(2000); act(() => { (box() as HTMLElement).click() }) }
const words = () => host.querySelector('.cs-dialogue-text')?.textContent ?? ''
const plate = () => host.querySelector('.cs-nameplaque')?.textContent?.trim() ?? null
const face = () => host.querySelector('.dlg-portrait img')?.getAttribute('src') ?? null

describe('the box does not blink between lines', () => {
  it('KEEPS THE SAME ELEMENT across two consecutive lines from one speaker', async () => {
    /* the box used to unmount for one paint between two lines and replay its entrance */
    const first = say({ who: 'Principal Panther', text: 'One.', portrait: 'principal' })
    await act(async () => {})
    const before = box()
    expect(before).toBeTruthy()

    // the student reads it and clicks it through, and the island says the next thing
    readAndPress()
    await act(async () => { await first })
    const second = say({ who: 'Principal Panther', text: 'Two.', portrait: 'principal' })
    await act(async () => {})

    expect(box()).toBe(before)          // the same DOM node, never torn down
    tick(1000)
    expect(words()).toContain('Two.')
    act(() => { (box() as HTMLElement).click() })
    await act(async () => { await second })
  })

  it('lets the box go when nothing follows', async () => {
    const only = say({ who: 'Principal Panther', text: 'One.' })
    await act(async () => {})
    expect(box()).toBeTruthy()
    readAndPress()
    await act(async () => { await only })
    // still up inside the handover grace, gone after it
    expect(box()).toBeTruthy()
    await act(async () => { await new Promise((r) => setTimeout(r, 320)) })
    expect(box()).toBeNull()
  })
})

describe('one speaker, one box', () => {
  it('a QUESTION keeps the name plate and the face of whoever was speaking', async () => {
    /* a question carries no speaker of its own, so it keeps the last one's plate and face */
    const said = say({ who: 'Principal Panther', text: 'Ready?', portrait: 'principal' })
    await act(async () => {})
    expect(plate()).toBe('Principal Panther')
    expect(face()).toBe('/art/portraits/principal.png')

    readAndPress()
    await act(async () => { await said })
    const asked = choose({ prompt: 'Which one?', options: ['A', 'B'] })
    await act(async () => {})
    tick(1000)

    expect(host.querySelector('.dlg-choice')).toBeTruthy()
    expect(plate()).toBe('Principal Panther')
    expect(face()).toBe('/art/portraits/principal.png')

    act(() => { (host.querySelector('.dlg-choice') as HTMLElement).click() })
    expect(await asked).toBe(0)
  })

  it('a NEW speaker does not inherit the last one’s face', async () => {
    const first = say({ who: 'Principal Panther', text: 'Hello.', portrait: 'principal' })
    await act(async () => {})
    readAndPress()
    await act(async () => { await first })
    const second = say({ who: 'Counselor Wren', text: 'Over here.' })
    await act(async () => {})
    expect(plate()).toBe('Counselor Wren')
    expect(face()).toBeNull()
    readAndPress()
    await act(async () => { await second })
  })
})

describe('the typewriter', () => {
  it('STARTS OVER when the same sentence is said twice in a row', async () => {
    /* it was keyed on the text, so a repeated line never re-typed and the second one appeared whole, and a Try again. after a wrong answer is the commonest repeat in the game */
    const first = say({ text: 'Try again.' })
    await act(async () => {})
    tick(1000)
    expect(words()).toBe('Try again.')
    act(() => { (box() as HTMLElement).click() })
    await act(async () => { await first })
    const second = say({ text: 'Try again.' })
    await act(async () => {})
    tick(40)
    expect(words().length).toBeLessThan('Try again.'.length)
    tick(1000)
    expect(words()).toBe('Try again.')
    act(() => { (box() as HTMLElement).click() })
    await act(async () => { await second })
  })

  it('NEVER RUNS BACKWARDS when a student clicks a half-typed line', async () => {
    /* filling a line in used to leave the typing loop running, so the sentence shrank back */
    const said = say({ text: 'A reasonably long sentence to type out.' })
    await act(async () => {})
    /* past the box's own quarter-second dead zone, which refuses a press before it, and nowhere near the end of a 38 character line at 45 a second */
    tick(300)
    const part = words().length
    expect(part).toBeGreaterThan(0)
    expect(part).toBeLessThan('A reasonably long sentence to type out.'.length)

    act(() => { (box() as HTMLElement).click() })   // fills it in
    expect(words()).toBe('A reasonably long sentence to type out.')
    tick(16)                                        // the frame that used to rewind it
    expect(words()).toBe('A reasonably long sentence to type out.')
    tick(16)
    expect(words()).toBe('A reasonably long sentence to type out.')

    act(() => { (box() as HTMLElement).click() })
    await act(async () => { await said })
  })
})
