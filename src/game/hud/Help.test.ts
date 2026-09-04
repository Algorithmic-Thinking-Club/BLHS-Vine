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
import { onUiRequest } from '../ui-bus'

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
    expect(host.querySelector('.hp-door')).toBeTruthy()
  })

  /* ---- THE FIVE DOORS, WHICH ARE WHY THIS CARD IS THE WAY OUT -------------
   *
   * BRIEF-PLAYTHROUGH-1 law 3, after Ash played the deploy: the card carries
   * "the pause sheet's own buttons: Back, Year Sheet, Handbook, Settings, Save
   * and leave. A student who does not know Esc exists can still leave."
   *
   * Every exit from this game used to be behind the Escape key, and nothing on
   * the screen said so. This is the test that stops that being true again. */
  it('carries every door the pause sheet has, so Escape is not the only way out', () => {
    /* THE THREE PANEL DOORS NEED SOMEBODY TO OPEN THEM. They go through the same
     * ui-bus a station uses, and the Hud is what answers it, so the card offers
     * them exactly when a Hud is mounted. A button that does nothing is worse
     * than a button that is not there, and this is the one card a lost student is
     * told to trust. Subscribing here is what a mounted Hud does. */
    const off = onUiRequest(() => {})
    try {
      openCard()
      const said = [...host.querySelectorAll('.hp-door')].map((b) => b.textContent ?? '')
      for (const word of ['Back', 'Year sheet', 'Handbook', 'Settings']) {
        expect(said.some((t) => t.includes(word)), word).toBe(true)
      }
      /* "Save and leave" needs a navigator and a bare render has none, which is
       * the one honest omission: outside a SceneManager there is no title screen
       * to leave to. In the app it is always there. */
      expect(said.length).toBeGreaterThanOrEqual(4)
    } finally { off() }
  })

  it('offers only the doors that can actually open, with no Hud mounted', () => {
    /* the other half of the same contract, and the reason it is a separate test:
     * on the title and mid-intro there is no Hud, and three of these five would
     * be presses that did nothing. */
    openCard()
    const said = [...host.querySelectorAll('.hp-door')].map((b) => b.textContent ?? '')
    expect(said.some((t) => t.includes('Back'))).toBe(true)
    for (const word of ['Year sheet', 'Handbook', 'Settings']) {
      expect(said.some((t) => t.includes(word)), word).toBe(false)
    }
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
  })

  it('is anchored to a corner rather than to the stack it used to sit under', () => {
    /* Law 3 moved it bottom-right. The first version measured how many plaques
     * were above it and offset itself by that, which made it the one control on
     * the screen whose position depended on what the run had granted. Checked in
     * the stylesheet because jsdom applies none: what matters is that nothing
     * computes a position for it any more. */
    act(() => root.render(createElement(HelpButton)))
    const btn = host.querySelector('.hp-btn') as HTMLElement
    expect(btn.style.getPropertyValue('--hp-above')).toBe('')
    const css = fs.readFileSync(path.join(process.cwd(), 'src/game/hud/help.css'), 'utf8')
    const rule = css.slice(css.indexOf('.hp-btn {'), css.indexOf('}', css.indexOf('.hp-btn {')))
    expect(rule).toContain('bottom:')
    expect(rule).toContain('right:')
    expect(rule).not.toContain('--hp-slot')
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
