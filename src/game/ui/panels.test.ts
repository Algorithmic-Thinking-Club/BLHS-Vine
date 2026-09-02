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

/* ---- AND THE ONES NOBODY REMEMBERED TO WIRE ------------------------------
 *
 * The list above is three panels because it was written when three panels
 * existed. On 2026-09-01 the tree had NINE full-screen overlays and five of them
 * had never called `usePanel`: the year sheet, the yearbook, graduation, the
 * year-start vignette and the beat runner's stage. Two of those are worse than
 * an accessibility gap. The year sheet is the panel a student MUST finish to
 * stamp a year, and because it never pushed onto the stack `panelDepth()` read
 * zero while it was open, so the arrival card and the objective heading both
 * believed the world was quiet and drew over the top of it. The graduation
 * stages were click-only `<div>`s, and they are the only road to the diploma,
 * which is the study's turn-in artifact: a keyboard-only student was stopped on
 * the first screen of the ceremony.
 *
 * A list cannot catch the tenth panel. This reads the tree instead: anything
 * that renders a full-screen veil is a panel, and a panel owes the contract.
 * The rule is deliberately about the VEIL rather than about a name, because the
 * veil is the thing that makes a surface modal and it is what every one of the
 * nine has in common.
 */
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
  /* the title's cool wash over the painted cove, so the wordmark owns the sky.
     Inert, and a title is not something a student closes: there is nothing
     behind it to go back to. */
  'ti-veil',
  /* the click target that ADVANCES a line of station dialogue. Making it modal
     would put a focus trap around every sentence anybody in the game says. */
  'dlg-veil',
])

describe('every panel in the tree took the contract, not just the ones on a list', () => {
  it('leaves no full-screen veil without usePanel', () => {
    const offenders: string[] = []
    for (const file of everyComponent()) {
      const src = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
      /* A MODAL VEIL IS ONE YOU CAN CLICK OUT OF, and that is the whole of the
       * test. Every dismissible surface in this kit draws `<div className="xx-veil"
       * onClick={onClose}>`; the two full-screen elements that are NOT panels
       * fail exactly that check and fail it for the right reason:
       *
       *   `.ti-veil` on the title is a cool gradient over the painted cove so the
       *   wordmark owns the sky. It is inert, and a title is not something a
       *   student closes because there is nothing behind it to go back to.
       *
       *   `.dlg-veil` around a line of station dialogue IS clickable, but what it
       *   does is ADVANCE, not close, and making it modal would put a focus trap
       *   around every sentence anybody in the game says.
       *
       * The first draft of this test used "the veil has an onClick" as the tell,
       * and it was wrong in the direction that matters: it let THREE real panels
       * through. The beat stage, graduation and the year-start vignette all
       * deliberately refuse a veil click (a beat never Esc-quits, the ceremony
       * takes `closeOnEscape: false`, and the vignette advances rather than
       * closing), so a rule about clicking exempted exactly the surfaces whose
       * modality is strictest. The two exceptions are named instead, with the
       * reason, because there are two of them and a name that has to be written
       * down is a name somebody has to defend. */
      const tags = [...src.matchAll(/<[a-zA-Z][^>]*className=["'`][^"'`]*([a-z]{2,3}-veil)[^>]*>/g)]
      const modal = tags.filter((m) => !NOT_A_PANEL.has(m[1]))
      if (!modal.length) continue
      if (!/usePanel\s*\(/.test(src)) offenders.push(`${file} draws ${modal[0][1]} and never calls usePanel`)
    }
    expect(offenders, 'modal surfaces with no focus trap, no dialog role and no place on the panel stack').toEqual([])
  })
})
