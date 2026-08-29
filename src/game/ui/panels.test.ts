/* THE PANELS THEMSELVES, NOT THE PRIMITIVE THEY USE.
 *
 * `a11y.test.ts` proves the hook keeps its five promises. This proves the real
 * panels in the game actually call it, which is the half that rots: a seventh
 * panel gets written next month, nobody wires it, and nothing errors. The count
 * this session started from was one aria attribute in `src/` and zero roles, and
 * the way that number goes back up is a test that names the panels.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SettingsPanel } from '../../app/SettingsPanel'
import { Wardrobe } from '../hud/Wardrobe'
import { Handbook } from '../hud/Handbook'

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

const esc = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })

const PANELS: [string, (onClose: () => void) => unknown, string][] = [
  ['the settings sheet', (onClose) => createElement(SettingsPanel, { onClose }), 'Settings'],
  ['the outfitter', (onClose) => createElement(Wardrobe, { onClose }), "The outfitter's nook"],
  ['the Handbook', (onClose) => createElement(Handbook, { onClose, initialTab: 'islands' }), 'The Handbook'],
]

for (const [name, make, label] of PANELS) {
  describe(name, () => {
    it('says it is a dialog and what it is called', () => {
      act(() => root.render(make(() => {}) as never))
      const box = host.querySelector('[role="dialog"]') as HTMLElement
      expect(box).toBeTruthy()
      expect(box.getAttribute('aria-modal')).toBe('true')
      expect(box.getAttribute('aria-label')).toBe(label)
    })

    it('takes focus when it opens', () => {
      act(() => root.render(make(() => {}) as never))
      const box = host.querySelector('[role="dialog"]') as HTMLElement
      expect(box.contains(document.activeElement)).toBe(true)
    })

    it('closes on Escape', () => {
      const onClose = vi.fn()
      act(() => root.render(make(onClose) as never))
      esc()
      expect(onClose).toHaveBeenCalled()
    })

    it('makes the world behind it inert', () => {
      const world = document.createElement('div')
      document.body.appendChild(world)
      try {
        act(() => root.render(make(() => {}) as never))
        expect(world.hasAttribute('inert')).toBe(true)
        act(() => root.render(createElement('div')))
        expect(world.hasAttribute('inert')).toBe(false)
      } finally { world.remove() }
    })
  })
}

describe('the settings sheet answers its own controls', () => {
  it('offers the text size as three pressed-or-not buttons rather than a colour', () => {
    act(() => root.render(createElement(SettingsPanel, { onClose: () => {} })))
    const seg = [...host.querySelectorAll('.st-segbtn')] as HTMLButtonElement[]
    expect(seg).toHaveLength(3)
    expect(seg.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1)
    // and each says what it is, because "S" is not a label
    expect(seg[0].getAttribute('aria-label')).toBe('Text size small')
  })

  it('drives the reduced-motion attribute the stylesheets read', () => {
    act(() => root.render(createElement(SettingsPanel, { onClose: () => {} })))
    const rm = [...host.querySelectorAll('.st-toggle')].find((b) => b.getAttribute('aria-labelledby') === 'st-lbl-rm') as HTMLButtonElement
    const was = rm.getAttribute('aria-pressed')
    act(() => { rm.click() })
    expect(rm.getAttribute('aria-pressed')).not.toBe(was)
    expect(document.documentElement.dataset.rm).toBe(rm.getAttribute('aria-pressed') === 'true' ? '1' : '')
  })

  it('gives every tab a tab role, so arrow keys mean something', () => {
    act(() => root.render(createElement(SettingsPanel, { onClose: () => {} })))
    const tabs = [...host.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    expect(tabs).toHaveLength(3)
    expect(tabs.filter((t) => t.getAttribute('aria-selected') === 'true')).toHaveLength(1)

    tabs[0].focus()
    act(() => { tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })) })
    const now = [...host.querySelectorAll('[role="tab"]')] as HTMLButtonElement[]
    expect(now[1].getAttribute('aria-selected')).toBe('true')
  })
})
