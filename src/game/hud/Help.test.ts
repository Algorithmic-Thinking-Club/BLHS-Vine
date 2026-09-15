// holds the help card to what it promises: four keys, the three corner things, and a way out
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
    /* not 'your task is above your head' or any other paraphrase: this exact line is the answer to 'I do not know what to do' */
    expect(host.textContent).toContain('The line above your head is your task.')
  })

  it('teaches all four keys, and each one has a picture beside it', () => {
    openCard()
    const rows = [...host.querySelectorAll('.hp-key')]
    expect(rows).toHaveLength(4)
    for (const r of rows) {
      /* every row is a mark and a sentence, because a row that lost its mark is a row a student has to read, which is the one thing this card cannot ask for */
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
    /* Map, Guide and My Year, because Chart, Handbook and Year sheet are the school's own words for these and mean nothing to a freshman looking for the button that shows where he can go */
    for (const name of ['Map', 'Guide', 'My Year']) expect(corner).toContain(name)
  })

  it('spells no key with a system character, on any row', () => {
    openCard()
    // every mark on the card is drawn art, never an emoji or a font character
    const GLYPHS = /[←-⇿■-◿⬀-⯿\u{1F300}-\u{1FAFF}️]/u
    expect(host.textContent ?? '').not.toMatch(GLYPHS)
  })

  it('is a dialog a keyboard can leave', () => {
    openCard()
    const card = host.querySelector('.hp-card')
    expect(card?.getAttribute('role')).toBe('dialog')
    expect(card?.getAttribute('aria-modal')).toBe('true')
    /* the way out is a real control and not only the Escape key, because a trackpad student never learns Escape from a card they cannot close */
    expect(host.querySelector('.hp-door')).toBeTruthy()
  })

  // the card carries the pause sheet's own doors, so Escape is not the only way out
  it('carries every door the pause sheet has, so Escape is not the only way out', () => {
    // the panel doors need a listener to open them, so subscribing here stands in for a mounted Hud
    const off = onUiRequest(() => {})
    try {
      openCard()
      const said = [...host.querySelectorAll('.hp-door')].map((b) => b.textContent ?? '')
      for (const word of ['Back', 'My Year', 'Guide', 'Settings']) {
        expect(said.some((t) => t.includes(word)), word).toBe(true)
      }
      /* 'Save and leave' needs a navigator and a bare render has none, the one honest omission: outside a SceneManager there is no title screen to leave to, and in the app it is always there */
      expect(said.length).toBeGreaterThanOrEqual(4)
    } finally { off() }
  })

  it('offers only the doors that can actually open, with no Hud mounted', () => {
    /* the other half of the same contract, and the reason it is a separate test: on the title and mid-intro there is no Hud, and three of these five would be presses that did nothing */
    openCard()
    const said = [...host.querySelectorAll('.hp-door')].map((b) => b.textContent ?? '')
    expect(said.some((t) => t.includes('Back'))).toBe(true)
    for (const word of ['My Year', 'Guide', 'Settings']) {
      expect(said.some((t) => t.includes(word)), word).toBe(false)
    }
  })
})

describe('the button in the corner', () => {
  it('is there with nothing granted, which is the whole reason it exists', () => {
    // the help button is the one HUD control that is there before the run has granted anything
    localStorage.removeItem('blhs_save_v2')
    act(() => root.render(createElement(HelpButton)))
    const btn = host.querySelector('.hp-btn')
    expect(btn).toBeTruthy()
    expect(btn?.getAttribute('aria-label')).toBe('How to play')
  })

  it('is anchored to a corner rather than to the stack it used to sit under', () => {
    // it sits in a fixed corner, so nothing computes its position from what else is on screen
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
    // every drawn part of the card has a plain rule, so the control arm never sees game paint
    const css = fs.readFileSync(path.join(process.cwd(), 'src/game/hud/help.css'), 'utf8')
    for (const part of ['.hp-card', '.hp-veil', '.hp-mark', '.hp-btn']) {
      expect(css, part).toContain(`html[data-skin='plain'] ${part}`)
    }
    /* and it names no picture: a plain rule that spells a png out is how five surfaces kept their art in the control arm for two days */
    const plain = css.slice(css.indexOf("html[data-skin='plain']"))
    expect(plain).not.toMatch(/url\(|\.png/)
  })
})
