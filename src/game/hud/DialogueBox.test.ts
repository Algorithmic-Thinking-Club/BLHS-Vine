/* THE ONE BOX, held to being one.
 *
 * Two dialogue renderers existed and everything downstream inherited whichever one
 * its host happened to reach. Twelve islands will not all reach the same one, so
 * the split reappearing is a silent regression: nothing errors, the game still
 * runs, and half the islands quietly get a different box. These tests are the
 * tripwire, and the source check at the bottom is the one that catches it.
 *
 * Written with createElement rather than JSX because the runner only collects
 * `.ts`, and a rendering test that has to be a `.tsx` is a rendering test nobody
 * runs.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'node:fs'
import path from 'node:path'
import { DialogueBox, ADVANCE_DEAD_MS } from './DialogueBox'
import { setKit, type KitPiece } from '../ui/kit'

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (props: Parameters<typeof DialogueBox>[0]) => {
  act(() => { root.render(createElement(DialogueBox, props)) })
}

const line = (over: Partial<Parameters<typeof DialogueBox>[0]['line']> = {}) => ({
  text: 'The circle is drawn.', shown: 20, done: true, ...over,
})

/* the portrait frame as the platform really publishes it, so a test can install
 * a kit rather than assume one */
const FRAME: KitPiece = {
  name: 'portrait_frame', type: 'portrait_frame', w: 200, h: 185,
  slice: { top: 34, right: 38, bottom: 37, left: 29 },
  fill: true, scale: 1, repeat: { x: 'round', y: 'round' },
  src: '/api/v1/ui/portrait_frame/image', sha: 'pf',
  css: '.kit-surface-portrait_frame { border-image: var(--kit-art-portrait_frame) 34 38 37 29 fill / 1 / 0 round; }',
}

describe('what the box draws', () => {
  it('shows only the characters the caller has revealed', () => {
    render({ line: line({ shown: 4, done: false }) })
    expect(host.querySelector('.cs-dialogue-text')?.textContent).toContain('The ')
    expect(host.querySelector('.cs-dialogue-text')?.textContent).not.toContain('circle')
    // and a caret while it is still typing, because a static frame is a bug
    expect(host.querySelector('.dlg-caret')).toBeTruthy()
  })

  it('drops the caret and offers the hint once the line is done', () => {
    render({ line: line() })
    expect(host.querySelector('.dlg-caret')).toBeNull()
    expect(host.querySelector('.cs-continue-hint')).toBeTruthy()
  })

  it('draws the name plaque and the emote beside it', () => {
    render({ line: line({ who: 'counselor', emote: '?' }) })
    expect(host.querySelector('.cs-nameplaque')?.textContent).toContain('counselor')
    expect(host.querySelector('.cs-emote')?.textContent).toContain('?')
  })

  /* UPDATED 2026-09-01 with the surface it tests. The portrait used to be a bare
   * `<img class="cs-portrait">` with nothing drawn around it, which is what this
   * asserted. It is `PortraitFrame` now, which wears the kit's own
   * `portrait_frame` piece and bottom-anchors the picture the way the kit's
   * record requires, so the assertion moved with the markup: the same src, and
   * now the frame around it as well. */
  it('DRAWS THE PORTRAIT, in the drawn frame the kit publishes for it', () => {
    /* the frame is worn only when the platform really published the piece, so a
     * test that wants to see it has to install one. Before 2026-09-02 the class
     * was written unconditionally and this assertion passed against a kit that
     * did not exist, which is exactly how the no-platform path shipped broken. */
    setKit([FRAME])
    render({ line: line({ portrait: 'pinzon' }) })
    const img = host.querySelector('.dlg-portrait img.kit-portrait-pic') as HTMLImageElement | null
    expect(img).toBeTruthy()
    expect(img!.getAttribute('src')).toBe('/art/portraits/pinzon.png')
    expect(host.querySelector('.dlg-portrait .kit-surface-portrait_frame')).toBeTruthy()
    expect(host.querySelector('.cs-dialogue')?.className).toContain('has-portrait')
    setKit([])
  })

  /* THE HALF THAT SHIPPED BROKEN AND HAD NO TEST.
   *
   * `kit.ts` opens by promising that a Chromebook behind a district filter still
   * gets a game "that looks like the art committed in this repo rather than an
   * unpainted rectangle". Every control in the kit wrote its `kit-surface-*`
   * class whether or not the platform had answered, and every fallback rule was
   * guarded on that class being ABSENT, so the fallbacks were unreachable: with
   * `?kit=0` the Handbook's tabs were five words of bare text and the portrait
   * had no frame at all. Found by looking at `build-shots/ui/after-nokit/`.
   *
   * A control with no drawn ground carries `kit-bare` now, and this is the test
   * that stops the guard going dead again. */
  it('says so in its class when the platform published no frame, so a fallback can dress it', () => {
    setKit([])
    render({ line: line({ portrait: 'pinzon' }) })
    const frame = host.querySelector('.dlg-portrait .kit-portrait')
    expect(frame).toBeTruthy()
    expect(frame!.className).toContain('kit-bare')
    expect(frame!.className).not.toContain('kit-surface-')
    /* and the picture is still there: the ground is missing, the face is not */
    expect(host.querySelector('.dlg-portrait img.kit-portrait-pic')).toBeTruthy()
  })

  it('leaves no portrait frame at all when the line has none', () => {
    render({ line: line() })
    expect(host.querySelector('.dlg-portrait')).toBeNull()
    expect(host.querySelector('.cs-dialogue')?.className).not.toContain('has-portrait')
  })

  /* §40.41: every state a thing can be in is a deliverable, counted up front.
   * These four are the box's, and they are on the element so the stylesheet and
   * a capture can both read them. */
  it('says which of its four states it is in, on the element', () => {
    render({ line: line({ shown: 4, done: false }) })
    expect(host.querySelector('.cs-dialogue')?.getAttribute('data-state')).toBe('typing')
    render({ line: line() })
    expect(host.querySelector('.cs-dialogue')?.getAttribute('data-state')).toBe('complete')
    render({ line: line(), options: ['a', 'b'] })
    expect(host.querySelector('.cs-dialogue')?.getAttribute('data-state')).toBe('asking')
  })

  /* THE CHOICES AND THE BOX ARE ONE COLUMN, which is what stopped a long
   * question laying its planks on top of its own paper: the choices used to be
   * positioned off a retyped copy of the box's height, and the box has grown to
   * its content since §40.14. */
  it('holds the box and its choices in one bottom-anchored stack', () => {
    render({ line: line(), options: ['a', 'b'] })
    const stack = host.querySelector('.dlg-stack')
    expect(stack).toBeTruthy()
    expect(stack!.querySelector('.dlg-choices')).toBeTruthy()
    expect(stack!.querySelector('.dlg-box')).toBeTruthy()
    // and the choices come first, so the column puts them above the paper
    expect([...stack!.children].map((c) => c.className.split(' ')[0]))
      .toEqual(['dlg-choices', 'cs-dialogue'])
  })

  /* the hint names BOTH ways to go on, and it is one sentence owned here rather
   * than a string each caller passes: the cutscene passed `click to go on` with
   * a font glyph on the end of it, which `docs/ART.md` forbids. */
  it('names the pointer path and the key path in the same sentence', () => {
    render({ line: line() })
    const hint = host.querySelector('.cs-continue-hint')?.textContent ?? ''
    expect(hint.toLowerCase()).toContain('click')
    expect(hint.toLowerCase()).toContain('space')
  })

  it('carries the skin as one string a stylesheet can key off', () => {
    render({ line: line(), skin: 'paper' })
    expect(host.querySelector('.cs-dialogue')?.getAttribute('data-skin')).toBe('paper')
  })
})

describe('a pointer path for every key path, and the reverse', () => {
  it('advances on a click and on space, and the box is focusable', () => {
    const onAdvance = vi.fn()
    // the dead zone is measured on performance.now, so the clock is what moves
    let clock = 1000
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    try {
      render({ line: line(), onAdvance })
      const box = host.querySelector('.cs-dialogue') as HTMLElement

      // the first quarter second is dead, so a mashed space cannot eat an unread line
      box.click()
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })) })
      expect(onAdvance).not.toHaveBeenCalled()

      clock += ADVANCE_DEAD_MS + 1
      box.click()
      expect(onAdvance).toHaveBeenCalledTimes(1)
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })) })
      expect(onAdvance).toHaveBeenCalledTimes(2)
      act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) })
      expect(onAdvance).toHaveBeenCalledTimes(3)

      expect(box.tabIndex).toBe(0)
    } finally { now.mockRestore() }
  })

  it('offers every choice as a real button AND as a number key', () => {
    const onPick = vi.fn()
    render({ line: line(), options: ['Show me the board', 'Not now'], onPick })
    const buttons = [...host.querySelectorAll('button.dlg-choice')] as HTMLButtonElement[]
    expect(buttons).toHaveLength(2)
    // the key is printed on the button, so a keyboard player can see it not guess it
    expect(buttons[0].textContent).toContain('1')
    expect(buttons[1].textContent).toContain('2')

    act(() => { buttons[1].click() })
    expect(onPick).toHaveBeenCalledWith(1)

    /* AND ONE ANSWER PER QUESTION. Added with the answered state, 2026-09-01:
     * the box marks the card that was pressed and stands the others down, so a
     * second press on the same question is refused rather than resolving an ask
     * that has already resolved. The key path is checked on a fresh question
     * below, because on this one it is correctly ignored. */
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })) })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(host.querySelector('.dlg-choice-chosen')?.textContent).toContain('Not now')
    expect(host.querySelector('.cs-dialogue')?.getAttribute('data-state')).toBe('answered')

    const second = vi.fn()
    render({ line: line({ text: 'And after that?' }), options: ['Aye', 'Later'], onPick: second })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })) })
    expect(second).toHaveBeenCalledWith(0)
  })

  it('never advances while it is asking, so a click cannot skip a question', () => {
    const onAdvance = vi.fn()
    render({ line: line(), options: ['a', 'b'], onAdvance })
    ;(host.querySelector('.cs-dialogue') as HTMLElement).click()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })) })
    expect(onAdvance).not.toHaveBeenCalled()
  })

  it('holds the choices back until the question has finished typing', () => {
    render({ line: line({ shown: 3, done: false }), options: ['a', 'b'] })
    expect(host.querySelectorAll('button.dlg-choice')).toHaveLength(0)
  })

  it('does not bind keys when its host already does', () => {
    const onAdvance = vi.fn()
    render({ line: line(), onAdvance, bindKeys: false })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })) })
    expect(onAdvance).not.toHaveBeenCalled()
  })
})

describe('there is exactly one of it', () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8')

  it('is what both the world box and the cutscene overlay render', () => {
    for (const p of ['src/game/hud/Dialogue.tsx', 'src/game/cutscene/CutsceneOverlay.tsx']) {
      const src = read(p)
      expect(src, p).toContain('DialogueBox')
      /* NEITHER MAY DRAW ITS OWN. These class names are the box's picture, and a
       * host writing them itself is a second renderer growing back. */
      expect(src, p).not.toContain('cs-nameplaque')
      expect(src, p).not.toContain('cs-dialogue-text')
    }
  })
})
