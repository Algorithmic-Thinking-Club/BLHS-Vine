/* THE FOCUS CONTRACT, WHICH THIS REPO DID NOT HAVE.
 *
 * The count §80.5 published, checked again today before writing any of this:
 * `src/` held exactly ONE aria or role occurrence in the whole tree,
 * `aria-label="Settings"` on the gear at `SettingsPanel.tsx:236`, and zero
 * `role=` attributes anywhere. Six panels open over the game and not one of them
 * moved focus into itself, held focus inside itself, gave focus back on close, or
 * told a screen reader it was there. A student on a keyboard could Tab out of the
 * open Handbook into the buttons underneath it, press one, and open a second
 * panel behind the first with no way to see either.
 *
 * §80.5 files this under the instrument rather than under compliance and that is
 * the sharper argument: a keyboard-only student who cannot finish the planner
 * cannot finish the year, and they arrive in the export as a run that stopped,
 * not as a failure of the game. Attrition is the measurement, so the fix is one.
 *
 * WHAT A PANEL OWES, all five of them enforced here rather than remembered:
 *   1. focus moves into it when it opens,
 *   2. Tab cannot leave it,
 *   3. Escape closes the INNERMOST one and nothing else,
 *   4. the background is inert and hidden from the reader while it is up,
 *   5. focus returns to whatever opened it when it closes.
 *
 * The stack is what makes 3 and 4 correct with two panels open, which happens in
 * this game the moment the pause sheet opens settings.
 */
import { useCallback, useEffect, useId, useRef } from 'react'
import { play } from '../audio'

/* ---- the stack --------------------------------------------------------- */

const stack: string[] = []

/** how many panels are open, for code outside a panel that needs to keep its
 *  hands off the Escape key while one is */
export const panelDepth = (): number => stack.length

/** is this panel the one a key press belongs to */
export const isInnermostPanel = (token: string): boolean => stack[stack.length - 1] === token

/* ---- hiding the background -------------------------------------------- */

const LIVE_ID = 'kit-live-region'

/* REFERENCE COUNTED, because two panels hide the same background. Without the
 * count the second panel to open records "already hidden" as the state to
 * restore, and closing both leaves the game inert with nothing on top of it:
 * a black-hole bug that only appears when a student opens settings from pause. */
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
      /* NOT THE LIVE REGION. It is a child of <body>, so the sweep counted it as
       * background and hid it, and a hidden live region is not read: every
       * announcement a panel made while it was open went nowhere, which is the
       * one place announcements matter most. */
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
    /* AN ANCESTOR'S inert COUNTS. A browser refuses focus to everything under an
     * inert node, and checking only the control itself said the button under an
     * open panel was still somewhere Tab could land, which is the exact thing
     * making the background inert was for. */
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

/* A VISUAL-ONLY CHANGE, SAID OUT LOUD. Picking a coat recolours a canvas, saving
 * a name redraws a card, opening a tab swaps a page: all of them are silent to a
 * reader today. The same message twice in a row is not announced by most readers,
 * so a trailing space alternates to force it. */
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
    /* WHERE FOCUS CAME FROM. `document.activeElement` at open is the button the
     * player pressed, and it is the only correct place to put focus back: a panel
     * that returns focus to <body> makes the next Tab start from the top of the
     * page, which on this HUD is the compass, three controls away from the one
     * they were on. */
    const cameFrom = document.activeElement as HTMLElement | null
    const release = makeBackgroundInert(el)

    /* THE PANEL ITSELF, NOT THE FIRST THING IN IT.
     *
     * This focused the first focusable control, which is what a lot of dialogs
     * do and is allowed by the ARIA practices, and on this kit it was wrong for
     * a reason you can only see in a picture. Chromium treats focus moved
     * programmatically after a key press as keyboard focus, and a panel is
     * usually opened by a key press, so `:focus-visible` matched on the first
     * control the instant the panel appeared. The art-direction pass of
     * 2026-09-01 put the result at the top of its list: a flat yellow rectangle
     * on ten of twenty-three surfaces, "raw browser chrome shipping inside the
     * drawn game", and on the year card an 850x180 ring across the bottom third
     * of the screen because the first control there is the whole card.
     *
     * The practices allow either. Focusing the dialog is the better half here:
     * the reader still hears the panel announce itself, Tab still walks straight
     * into the first control, Escape still closes, and nothing is ringed until a
     * student actually navigates. A ring that appears before anybody has pressed
     * a key is not telling them where they are, it is decoration that looks like
     * a bug.
     *
     * The panel carries `tabIndex={-1}` from the binding below, which is what
     * makes it focusable without putting it in the tab order. */
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

    /* ---- AND IT IS HEARD --------------------------------------------------
     *
     * `audio.ts` calls `open`, `close`, `click` and `deny` "the four the UI kit
     * lives on. Every panel, every choice, every refusal", and audited on
     * 2026-09-02 three of the four had ZERO callers anywhere in the tree. Two of
     * them are this: every panel in the game opened and closed in silence while
     * `open.ogg` and `close.ogg` shipped to a Chromebook that would never play
     * them.
     *
     * It belongs here rather than on each panel for the same reason the focus
     * trap does: seven surfaces use this hook, and a sound wired per panel is a
     * sound the eighth panel forgets. `play` is already safe on its own, so
     * there is nothing to guard: it honours the mute setting, it swallows a
     * dropped fetch, and it queues until the first gesture unlocks audio.
     *
     * Only the innermost panel speaks. Opening the year sheet from the pause
     * sheet is one event to a student and would otherwise be two sounds. */
    if (isInnermostPanel(token)) play('open')

    return () => {
      window.removeEventListener('keydown', key, true)
      release()
      play('close')
      const at = stack.lastIndexOf(token)
      if (at >= 0) stack.splice(at, 1)
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
