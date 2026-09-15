/* tests that the real panels in the game call the panel hook, not just that the hook works */
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
  ['the outfitter', (onClose) => createElement(Wardrobe, { onClose }), 'Your clothes'],
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

/* reads the whole tree, so anything drawing a full-screen veil is checked without being listed */
import fs from 'node:fs'
import path from 'node:path'

function everyComponent(dir = 'src'): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) { if (e.name !== '_archive') out.push(...everyComponent(rel)) }
    else if (e.name.endsWith('.tsx') && !e.name.includes('.test.')) out.push(rel)
  }
  return out
}

/* the two full-screen elements in the tree that are NOT panels, by name */
const NOT_A_PANEL = new Set([
  /* the title's cool wash over the painted cove so the wordmark owns the sky; inert, and a title is not something anybody closes because there is nothing behind it to go back to */
  'ti-veil',
  /* the click target that advances a line of station dialogue; making it modal would put a focus trap around every sentence anybody in the game says */
  'dlg-veil',
])

describe('every panel in the tree took the contract, not just the ones on a list', () => {
  it('leaves no full-screen veil without usePanel', () => {
    const offenders: string[] = []
    for (const file of everyComponent()) {
      const src = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
      /* every veil counts as a panel except the two named in NOT_A_PANEL */
      const tags = [...src.matchAll(/<[a-zA-Z][^>]*className=["'`][^"'`]*([a-z]{2,3}-veil)[^>]*>/g)]
      const modal = tags.filter((m) => !NOT_A_PANEL.has(m[1]))
      if (!modal.length) continue
      if (!/usePanel\s*\(/.test(src)) offenders.push(`${file} draws ${modal[0][1]} and never calls usePanel`)
    }
    expect(offenders, 'modal surfaces with no focus trap, no dialog role and no place on the panel stack').toEqual([])
  })
})
