/* THE BOX IS STEADY, held to it.
 *
 * Ash, BRIEF-INTRO-FILM, after playing rail-4: *"the dialogue panel is
 * glitchy"*, and the brief names the glitches: the box resizing between lines,
 * the portrait popping in late or empty, the typewriter restarting, the advance
 * cue flashing, the box drawn under the cutscene bars, two box styles for one
 * speaker. Three of those are geometry and live in `dialogue.css`, where a
 * stylesheet test would only be reading the file back to itself; they are
 * measured in a browser instead (`scripts/film-b-box.mjs`).
 *
 * The other three are BEHAVIOUR in this file and this is the tripwire for them:
 * the box does not unmount between two consecutive lines, a question keeps the
 * face and the plate of whoever asked it, and the typewriter starts over when
 * the sentence repeats and never runs backwards when a student clicks through
 * it.
 *
 * Written with createElement rather than JSX because the runner only collects
 * `.ts`, which is the same reason `DialogueBox.test.ts` beside it is.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Dialogue } from './Dialogue'
import { say, choose, clearDialogue } from '../dialogue'

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

/* happy-dom has no rAF clock that advances on its own, so the typewriter is
 * driven by hand: every frame is one call and `performance.now` is a number
 * this file owns. That is the only way a character count can be asserted. */
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
/* type the whole line out, then press it: `advance` only advances a line that
   has FINISHED, and the box's own dead zone refuses a press inside the first
   quarter second, so a test that just clicks is a test of neither. */
const readAndPress = () => { tick(2000); act(() => { (box() as HTMLElement).click() }) }
const words = () => host.querySelector('.cs-dialogue-text')?.textContent ?? ''
const plate = () => host.querySelector('.cs-nameplaque')?.textContent?.trim() ?? null
const face = () => host.querySelector('.dlg-portrait img')?.getAttribute('src') ?? null

describe('the box does not blink between lines', () => {
  it('KEEPS THE SAME ELEMENT across two consecutive lines from one speaker', async () => {
    /* THE MEASURED DEFECT. `scripts/film-b-box.mjs` counted two box mounts for
     * two consecutive sentences of the Maw's film: the bus empties for one
     * paint between any two lines, because `finish()` announces the empty
     * queue before it resolves the promise the island is waiting on, so the
     * box unmounted and `cs-rise` replayed on the far side. */
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
    /* `DialogueAsk` carries a prompt and options and no speaker at all, so the
     * principal asking something lost his plate AND his portrait on the one
     * line where a student most needs to know who is asking. Ash saw it as
     * "two box styles for one speaker". */
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
    /* it was keyed on the text, so a repeated line never re-typed and the
     * second one appeared whole. A "Try again." after a wrong answer is the
     * commonest repeat in the game. */
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
    /* `advance` fills the line in and the rAF loop was still scheduled, so the
     * next frame wrote the clock's own smaller count back and the sentence
     * visibly shrank. Mashing the box made the words go backwards on every
     * press, which is the restart a student actually meets. */
    const said = say({ text: 'A reasonably long sentence to type out.' })
    await act(async () => {})
    /* past the box's own quarter-second dead zone, which refuses a press before
       it, and nowhere near the end of a 38 character line at 45 a second */
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
