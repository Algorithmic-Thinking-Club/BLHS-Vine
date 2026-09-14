import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SkipVoyage } from './SkipVoyage'
import { beginVoyage, setLeg, endVoyage, voyageSkipped } from './travel'

let host: HTMLDivElement
let root: Root
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host) })
afterEach(() => { act(() => root.unmount()); host.remove(); endVoyage('probe') })

describe('probe: escape on the landing leg', () => {
  it('is swallowed with nothing to show for it', () => {
    act(() => root.render(createElement(SkipVoyage)))
    act(() => { beginVoyage({ to: 'atc', from: 'hub', leg: 'crossing', home: false }) })
    expect(host.querySelector('button')).toBeTruthy()
    act(() => { setLeg('landing') })
    expect(host.querySelector('button')).toBeNull()

    let hudSaw = 0
    const hud = () => { hudSaw++ }
    window.addEventListener('keydown', hud)          // the Hud's own bubble listener
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })) })
    window.removeEventListener('keydown', hud)

    console.log('PROBE skipped=', voyageSkipped(), ' hudSaw=', hudSaw)
    expect(voyageSkipped()).toBe(true)   // the flag latched on a leg that refuses it
    expect(hudSaw).toBe(0)               // and the Hud never heard the key
  })
})
