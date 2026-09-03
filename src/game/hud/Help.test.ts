/* THE CARD A TEACHER POINTS AT (BRIEF-UI item 3b).
 *
 * The brief's sentence is the specification and it is short enough to test
 * literally: "It opens one drawn card, no scrolling, readable by looking: the
 * four keys (arrows, E, click, Esc) as pictures, what the three corner things
 * are, and the sentence 'the line above your head is your task'."
 *
 * Every assertion below is one clause of that sentence. They are here because
 * this card's whole value is that a teacher can say one thing across a full
 * advisory room and be right, and a card that has quietly lost a key, or grown a
 * scrollbar, or started spelling an arrow with a font character, is a card that
 * makes the teacher wrong without anybody noticing.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import fs from 'node:fs'
import path from 'node:path'
import { HelpCard, HelpButton } from './Help'

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
  document.documentElement.removeAttribute('data-skin')
})

const openCard = () => act(() => root.render(createElement(HelpCard, { onClose: () => {} })))

describe('what the help card says', () => {
  it('carries the sentence the brief asks for, word for word', () => {
    openCard()
    /* not "your task is above your head" or any other paraphrase: the brief
     * quotes this line, and it is the answer to "I do not know what to do". */
    expect(host.textContent).toContain('The line above your head is your task.')
  })

  it('teaches all four keys, and each one has a picture beside it', () => {
    openCard()
    const rows = [...host.querySelectorAll('.hp-key')]
    expect(rows).toHaveLength(4)
    for (const r of rows) {
      /* every row is a mark and a sentence. A row that lost its mark is a row a
       * student has to READ, which is the one thing this card cannot ask for. */
      expect(r.querySelector('.hp-mark'), r.textContent ?? '').toBeTruthy()
      expect(r.querySelector('.hp-says')?.textContent?.trim().length).toBeGreaterThan(0)
    }
    const said = host.textContent ?? ''
    for (const key of ['Arrow keys', 'E opens', 'click', 'Esc closes']) {
      expect(said, key).toContain(key)
    }
  })

  it('names the three things in the corner, whether or not the run has granted them', () => {
    openCard()
    const corner = host.querySelector('.hp-corner')?.textContent ?? ''
    for (const name of ['Chart', 'Handbook', 'Year sheet']) expect(corner).toContain(name)
  })

  it('spells no key with a system character, on any row', () => {
    openCard()
    /* `docs/ART.md`: "Icons are drawn, never an emoji or a font glyph", and the
     * brief's do-not list says the same in four words. The arrows are the trap:
     * an arrow is one keystroke away from being a font character and the card
     * would look finished. */
    const GLYPHS = /[←-⇿■-◿⬀-⯿\u{1F300}-\u{1FAFF}️]/u
    expect(host.textContent ?? '').not.toMatch(GLYPHS)
  })

  it('is a dialog a keyboard can leave', () => {
    openCard()
    const card = host.querySelector('.hp-card')
    expect(card?.getAttribute('role')).toBe('dialog')
    expect(card?.getAttribute('aria-modal')).toBe('true')
    /* the way out is a real control and not only the Escape key, because a
     * trackpad student never learns Escape from a card they cannot close. */
    expect(host.querySelector('.hp-close')).toBeTruthy()
  })
})

describe('the button in the corner', () => {
  it('is there with nothing granted, which is the whole reason it exists', () => {
    /* §40.2 says the HUD assembles as the run grants things, and this is the one
     * exception. With no save at all there is no chart, no Handbook and no
     * tokens, and the student in front of that screen is exactly the one a
     * teacher answers with "press the question mark". */
    localStorage.removeItem('blhs_save_v2')
    act(() => root.render(createElement(HelpButton)))
    const btn = host.querySelector('.hp-btn')
    expect(btn).toBeTruthy()
    expect(btn?.getAttribute('aria-label')).toBe('How to play')
    /* and it sits in the first slot, because nothing is above it yet */
    expect((btn as HTMLElement).style.getPropertyValue('--hp-above')).toBe('0')
  })
})

describe('the card as a document, for the study\'s control arm', () => {
  it('has a plain rule for every part of itself that is drawn', () => {
    /* the leak this catches is the one that has bitten twice: a surface built in
     * the game arm and never given its plain form, so the control group reads
     * the same screen with the game's paint on it. Checked in the stylesheet
     * rather than in a render, because the arm is decided by an attribute on
     * <html> and jsdom does not apply a stylesheet. */
    const css = fs.readFileSync(path.join(process.cwd(), 'src/game/hud/help.css'), 'utf8')
    for (const part of ['.hp-card', '.hp-veil', '.hp-mark', '.hp-btn']) {
      expect(css, part).toContain(`html[data-skin='plain'] ${part}`)
    }
    /* and it names no picture: a plain rule that spells a png out is how five
     * surfaces kept their art in the control arm for two days */
    const plain = css.slice(css.indexOf("html[data-skin='plain']"))
    expect(plain).not.toMatch(/url\(|\.png/)
  })
})
