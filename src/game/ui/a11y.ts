/* the focus contract every panel in the kit is held to: trap, escape, inert background, return */
import { useCallback, useEffect, useId, useRef } from 'react'
import { playUi } from '../audio'

/* ---- the stack --------------------------------------------------------- */

const stack: string[] = []

/* writes how many panels are open onto the root, so the corner plaques can hide themselves */
const syncPanels = () => {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.panels = String(stack.length)
}

/** how many panels are open, for code outside a panel that needs to keep its
 *  hands off the Escape key while one is */
export const panelDepth = (): number => stack.length

/** is this panel the one a key press belongs to */
export const isInnermostPanel = (token: string): boolean => stack[stack.length - 1] === token

/* ---- hiding the background -------------------------------------------- */

const LIVE_ID = 'kit-live-region'

/* what was hidden and how many panels are hiding it, since two can hide the same background */
type Held = { count: number; hadHidden: string | null; hadInert: boolean }
const held = new Map<Element, Held>()

const hide = (el: Element) => {
  const h = held.get(el)
  if (h) { h.count++; return }
  held.set(el, {
    count: 1,
    hadHidden: el.getAttribute('aria-hidden'),
    hadInert: el.hasAttribute('inert'),
  })
  el.setAttribute('aria-hidden', 'true')
  el.setAttribute('inert', '')
}

const unhide = (el: Element) => {
  const h = held.get(el)
  if (!h) return
  if (--h.count > 0) return
  held.delete(el)
  if (h.hadHidden === null) el.removeAttribute('aria-hidden')
  else el.setAttribute('aria-hidden', h.hadHidden)
  if (!h.hadInert) el.removeAttribute('inert')
}

/** everything on screen that is not this panel or an ancestor of it */
function backgroundOf(panel: Element): Element[] {
  const out: Element[] = []
  let node: Element | null = panel
  while (node && node.parentElement) {
    for (const sib of Array.from(node.parentElement.children)) {
      if (sib === node) continue
      /* never the live region, because a hidden one is not read out */
      if (sib.id === LIVE_ID) continue
      if (sib.tagName === 'SCRIPT' || sib.tagName === 'STYLE') continue
      out.push(sib)
    }
    node = node.parentElement
  }
  return out
}

/** exported for the test, and for anything that has to make the world inert
 *  without being a React panel */
export function makeBackgroundInert(panel: Element): () => void {
  const marked = backgroundOf(panel)
  for (const el of marked) hide(el)
  let released = false
  return () => {
    if (released) return
    released = true
    for (const el of marked) unhide(el)
  }
}

/* ---- who can be focused ------------------------------------------------ */

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusablesIn(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
    /* an ancestor's inert counts, since a browser refuses focus to everything under one */
    .filter((el) => !el.closest('[inert], [aria-hidden="true"]'))
}

/* ---- announcements ----------------------------------------------------- */

function liveRegion(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  let el = document.getElementById(LIVE_ID)
  if (el) return el
  el = document.createElement('div')
  el.id = LIVE_ID
  el.setAttribute('role', 'status')
  el.setAttribute('aria-live', 'polite')
  el.setAttribute('aria-atomic', 'true')
  /* off screen rather than display:none, because a hidden node is not read.
   * Inline because this is one element the kit owns and a stylesheet the app
   * forgot to import would silently take the announcements away. */
  el.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0'
  document.body.appendChild(el)
  return el
}

/* says a visual-only change out loud, alternating a trailing space so a repeat is still read */
let flip = false
export function announce(message: string): void {
  const el = liveRegion()
  if (!el) return
  flip = !flip
  el.textContent = flip ? message : `${message} `
}

/** the test's way to see what was last said, and the app's way to clean up */
export const lastAnnouncement = (): string =>
  (typeof document === 'undefined' ? '' : document.getElementById(LIVE_ID)?.textContent ?? '').trim()

/* ---- the hook every panel in the kit uses ------------------------------ */

export type PanelOptions = {
  /** what a reader calls this panel */
  label: string
  /** Escape, the veil click and the close control all come here */
  onClose?: () => void
  /** a panel that is not dismissible (a graded frame mid-run) passes false */
  closeOnEscape?: boolean
}

export type PanelBinding = {
  ref: (el: HTMLDivElement | null) => void
  role: 'dialog'
  'aria-modal': true
  'aria-label': string
  tabIndex: -1
  onKeyDown: (e: React.KeyboardEvent) => void
}

export function usePanel({ label, onClose, closeOnEscape = true }: PanelOptions): PanelBinding {
  const token = useId()
  const node = useRef<HTMLDivElement | null>(null)
  const close = useRef(onClose)
  close.current = onClose

  const ref = useCallback((el: HTMLDivElement | null) => { node.current = el }, [])

  useEffect(() => {
    const el = node.current
    if (!el) return
    stack.push(token)
    syncPanels()
    /* where focus came from, so it can be put back on the control that opened this */
    const cameFrom = document.activeElement as HTMLElement | null
    const release = makeBackgroundInert(el)

    /* focus the panel itself and not the first control in it, so nothing is ringed yet */
    el.focus?.()

    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      if (!isInnermostPanel(token)) return
      if (!closeOnEscape) return
      e.stopPropagation()
      e.preventDefault()
      close.current?.()
    }
    /* capture, so the innermost panel answers before any window listener that was
     * registered earlier and would otherwise close the wrong thing */
    window.addEventListener('keydown', key, true)

    /* the panel open sound, wired once here for every panel, and only the innermost one */
    if (isInnermostPanel(token)) playUi('open')

    return () => {
      window.removeEventListener('keydown', key, true)
      release()
      playUi('close')
      const at = stack.lastIndexOf(token)
      if (at >= 0) stack.splice(at, 1)
      syncPanels()
      /* only if the panel still had focus. If the player has already clicked
       * something else, stealing it back is the rudest thing a panel can do. */
      if (cameFrom && (!document.activeElement || document.activeElement === document.body || el.contains(document.activeElement))) {
        cameFrom.focus?.()
      }
    }
  }, [token, closeOnEscape])

  /* THE TRAP. Tab off the end wraps to the start rather than leaving, because a
   * panel a keyboard can walk out of but a pointer cannot is not modal, and what
   * is underneath is inert, so leaving means landing nowhere. */
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const el = node.current
    if (!el) return
    const items = focusablesIn(el)
    if (items.length === 0) { e.preventDefault(); return }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || active === el || !el.contains(active))) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault(); first.focus()
    }
  }, [])

  return { ref, role: 'dialog', 'aria-modal': true, 'aria-label': label, tabIndex: -1, onKeyDown }
}

/* ---- arrow traversal inside a row of tabs ------------------------------ */

/* §80.5 asks for arrow-key traversal inside a region. A tab row is the region
 * this kit actually has three of, and Left/Right on a tab row is the one
 * keyboard convention a student arrives already knowing. */
export function tabRowKeyDown<T>(e: React.KeyboardEvent, items: readonly T[], index: number, pick: (t: T) => void): void {
  const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'Home' ? -index : e.key === 'End' ? items.length - 1 - index : 0
  if (step === 0 && e.key !== 'Home' && e.key !== 'End') return
  e.preventDefault()
  const next = (index + step + items.length) % items.length
  pick(items[next])
  /* the tab a player arrowed to is the one they are on, so focus follows it the
   * way every tab row on the web does */
  const row = (e.currentTarget as HTMLElement).parentElement
  const buttons = row ? focusablesIn(row) : []
  buttons[next]?.focus()
}
