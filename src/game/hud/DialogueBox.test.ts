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

  it('DRAWS THE PORTRAIT, which both line types have carried and nothing rendered', () => {
    render({ line: line({ portrait: 'pinzon' }) })
    const img = host.querySelector('img.cs-portrait') as HTMLImageElement | null
    expect(img).toBeTruthy()
    expect(img!.getAttribute('src')).toBe('/art/portraits/pinzon.png')
    expect(host.querySelector('.cs-dialogue')?.className).toContain('has-portrait')
  })

  it('leaves no portrait frame at all when the line has none', () => {
    render({ line: line() })
    expect(host.querySelector('img.cs-portrait')).toBeNull()
    expect(host.querySelector('.cs-dialogue')?.className).not.toContain('has-portrait')
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

    buttons[1].click()
    expect(onPick).toHaveBeenCalledWith(1)

    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })) })
    expect(onPick).toHaveBeenCalledWith(0)
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
