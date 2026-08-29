/* THE FOCUS CONTRACT, TESTED BY BREAKING IT.
 *
 * Each of these is a thing a keyboard-only student could do before this session
 * and could not do anything about: Tab out of the open Handbook onto a button
 * underneath it, press Escape and pause the game instead of closing the panel in
 * front of them, close two panels and find the whole game inert with nothing on
 * top of it, or pick a coat and get no confirmation that anything happened.
 *
 * §80.5 files these under the instrument rather than under compliance: a student
 * who cannot finish a panel cannot finish the year, and they arrive in the export
 * as a run that stopped.
 *
 * Written with createElement rather than JSX because the runner only collects
 * `.ts`, the same reason DialogueBox.test.ts is.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { announce, focusablesIn, isInnermostPanel, lastAnnouncement, makeBackgroundInert, panelDepth, usePanel } from './a11y'

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

/** a panel the way every panel in the kit is built: a veil, a box, some buttons */
function Panel({ label, onClose, extra }: { label: string; onClose?: () => void; extra?: ReactNode }) {
  const p = usePanel({ label, onClose })
  return createElement(
    'div', { className: 'veil' },
    createElement('div', { className: 'box', ...p },
      createElement('button', { key: 'a', id: `${label}-first` }, 'first'),
      createElement('button', { key: 'b', id: `${label}-last` }, 'last'),
      extra,
    ),
  )
}

const esc = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })

describe('a panel takes focus, holds it, and gives it back', () => {
  it('moves focus to the first thing in it', () => {
    act(() => root.render(createElement(Panel, { label: 'Handbook' })))
    expect(document.activeElement?.id).toBe('Handbook-first')
  })

  it('returns focus to whatever opened it', () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    expect(document.activeElement).toBe(opener)

    act(() => root.render(createElement(Panel, { label: 'Handbook' })))
    expect(document.activeElement?.id).toBe('Handbook-first')

    act(() => root.render(createElement('div')))
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('says what it is, which nothing in this tree did before', () => {
    act(() => root.render(createElement(Panel, { label: 'The Handbook' })))
    const box = host.querySelector('.box')!
    expect(box.getAttribute('role')).toBe('dialog')
    expect(box.getAttribute('aria-modal')).toBe('true')
    expect(box.getAttribute('aria-label')).toBe('The Handbook')
  })

  it('counts itself, so code outside a panel can keep its hands off Escape', () => {
    expect(panelDepth()).toBe(0)
    act(() => root.render(createElement(Panel, { label: 'Handbook' })))
    expect(panelDepth()).toBe(1)
    act(() => root.render(createElement('div')))
    expect(panelDepth()).toBe(0)
  })
})

describe('Escape closes the innermost thing and only that', () => {
  it('closes the panel that is on top', () => {
    let outer = 0, inner = 0
    act(() => root.render(createElement('div', null,
      createElement(Panel, { key: 'o', label: 'Pause', onClose: () => { outer++ } }),
      createElement(Panel, { key: 'i', label: 'Settings', onClose: () => { inner++ } }),
    )))
    esc()
    expect(inner).toBe(1)
    expect(outer).toBe(0)
  })

  it('stops the press reaching a window listener underneath, which is how the HUD used to pause behind an open panel', () => {
    let hudSawIt = 0
    const hud = () => { hudSawIt++ }
    window.addEventListener('keydown', hud)
    try {
      act(() => root.render(createElement(Panel, { label: 'Handbook', onClose: () => {} })))
      esc()
      expect(hudSawIt).toBe(0)
    } finally { window.removeEventListener('keydown', hud) }
  })

  it('lets the press through when no panel is up', () => {
    let hudSawIt = 0
    const hud = () => { hudSawIt++ }
    window.addEventListener('keydown', hud)
    try { esc(); expect(hudSawIt).toBe(1) }
    finally { window.removeEventListener('keydown', hud) }
  })

  it('knows which token is innermost', () => {
    expect(isInnermostPanel('nobody')).toBe(false)
  })
})

describe('the background is inert, and comes back', () => {
  it('hides everything that is not the panel or an ancestor of it', () => {
    const world = document.createElement('div')
    world.id = 'world'
    document.body.appendChild(world)
    try {
      act(() => root.render(createElement(Panel, { label: 'Handbook' })))
      expect(world.getAttribute('aria-hidden')).toBe('true')
      expect(world.hasAttribute('inert')).toBe(true)
      act(() => root.render(createElement('div')))
      expect(world.hasAttribute('aria-hidden')).toBe(false)
      expect(world.hasAttribute('inert')).toBe(false)
    } finally { world.remove() }
  })

  /* THE BUG THIS COUNT EXISTS FOR. Two panels hide the same world; without a
   * reference count the second one records "already hidden" as the state to put
   * back, and closing both leaves the game inert with nothing on top of it. */
  it('survives two panels hiding the same background', () => {
    const world = document.createElement('div')
    document.body.appendChild(world)
    try {
      const releaseA = makeBackgroundInert(host)
      const releaseB = makeBackgroundInert(host)
      expect(world.hasAttribute('inert')).toBe(true)
      releaseB()
      expect(world.hasAttribute('inert')).toBe(true)   // the first panel is still open
      releaseA()
      expect(world.hasAttribute('inert')).toBe(false)
    } finally { world.remove() }
  })

  /* THE LIVE REGION IS A BODY CHILD, so the sweep counted it as background and
   * hid it, and a hidden live region is not read: every announcement a panel
   * made while it was open went nowhere, which is the one place they matter. */
  it('never hides the live region it announces through', () => {
    announce('open')
    const region = document.getElementById('kit-live-region')!
    const release = makeBackgroundInert(host)
    expect(region.hasAttribute('aria-hidden')).toBe(false)
    expect(region.hasAttribute('inert')).toBe(false)
    release()
  })

  it('leaves an element that was already hidden alone', () => {
    const already = document.createElement('div')
    already.setAttribute('aria-hidden', 'true')
    document.body.appendChild(already)
    try {
      const release = makeBackgroundInert(host)
      release()
      expect(already.getAttribute('aria-hidden')).toBe('true')
    } finally { already.remove() }
  })

  it('does not offer an inert control as somewhere Tab can land', () => {
    const world = document.createElement('div')
    world.innerHTML = '<button id="under">underneath</button>'
    document.body.appendChild(world)
    try {
      const release = makeBackgroundInert(host)
      expect(focusablesIn(document.body).map((el) => el.id)).not.toContain('under')
      release()
    } finally { world.remove() }
  })
})

describe('Tab cannot leave a panel', () => {
  const tab = (shift: boolean) => {
    const box = host.querySelector('.box') as HTMLElement
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: shift, bubbles: true }))
    })
  }

  it('wraps from the last control back to the first', () => {
    act(() => root.render(createElement(Panel, { label: 'Handbook' })))
    const last = host.querySelector('#Handbook-last') as HTMLElement
    last.focus()
    tab(false)
    expect(document.activeElement?.id).toBe('Handbook-first')
  })

  it('wraps backwards from the first to the last', () => {
    act(() => root.render(createElement(Panel, { label: 'Handbook' })))
    tab(true)
    expect(document.activeElement?.id).toBe('Handbook-last')
  })
})

describe('a visual-only change gets said out loud', () => {
  it('puts the words in a live region a reader is listening to', () => {
    announce('Wearing the storm coat')
    const region = document.getElementById('kit-live-region')!
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(lastAnnouncement()).toBe('Wearing the storm coat')
  })

  it('changes the text even when the message repeats, or the second one is never read', () => {
    announce('Text size large')
    const first = document.getElementById('kit-live-region')!.textContent
    announce('Text size large')
    expect(document.getElementById('kit-live-region')!.textContent).not.toBe(first)
    expect(lastAnnouncement()).toBe('Text size large')
  })

  it('makes exactly one region however many times it is called', () => {
    announce('a'); announce('b'); announce('c')
    expect(document.querySelectorAll('#kit-live-region')).toHaveLength(1)
  })
})

describe('the panels in the kit are wired to it', () => {
  /* a state swap inside a panel moves focus, which is the fifth thing a panel
   * owes and the one that is easiest to forget when a button becomes two */
  it('keeps focus inside the panel when its contents change', () => {
    function Swapper() {
      const [two, setTwo] = useState(false)
      return createElement(Panel, {
        label: 'Danger',
        extra: createElement('button', {
          id: 'swap', key: 'swap', onClick: () => setTwo(true),
        }, two ? 'confirm' : 'restart'),
      })
    }
    act(() => root.render(createElement(Swapper)))
    const swap = host.querySelector('#swap') as HTMLButtonElement
    swap.focus()
    act(() => { swap.click() })
    expect(host.contains(document.activeElement)).toBe(true)
  })
})
