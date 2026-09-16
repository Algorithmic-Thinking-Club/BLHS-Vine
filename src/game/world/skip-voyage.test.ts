import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { SkipVoyage } from './SkipVoyage'
import { beginVoyage, cancelVoyage, endVoyage, setLeg, voyageCalledOff, voyageSkipped } from './travel'

/* the one control a journey offers, and it means two different things */
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
  endVoyage('after the test')
})

const press = () => act(() => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
})

describe('escape during a journey', () => {
  it('says "not just now" before she sails, and calls the journey off', () => {
    act(() => root.render(createElement(SkipVoyage)))
    act(() => { beginVoyage({ to: 'atc-1', from: 'panther-maw', leg: 'boarding', home: false }) })
    expect(host.querySelector('button')?.textContent).toMatch(/not just now/i)
    press()
    expect(voyageCalledOff()).toBe(true)
    expect(voyageSkipped()).toBe(false)
  })

  it('says "skip ahead" once she is under way, and skips rather than cancelling', () => {
    act(() => root.render(createElement(SkipVoyage)))
    act(() => { beginVoyage({ to: 'atc-1', from: 'hub', leg: 'crossing', home: false }) })
    expect(host.querySelector('button')?.textContent).toMatch(/skip ahead/i)
    press()
    expect(voyageSkipped()).toBe(true)
    expect(voyageCalledOff()).toBe(false)
  })

  it('offers nothing at all once she is coming in, so no press can delete the arrival', () => {
    act(() => root.render(createElement(SkipVoyage)))
    act(() => { beginVoyage({ to: 'atc-1', from: 'hub', leg: 'crossing', home: false }) })
    act(() => { setLeg('landing') })
    expect(host.querySelector('button')).toBeNull()
    /* the key listener goes with the button, so no flag is latched that nothing will honour */
    press()
    expect(voyageSkipped()).toBe(false)
  })

  it('tells a journey that finished from one somebody stopped', () => {
    act(() => { beginVoyage({ to: 'atc-1', from: 'hub', leg: 'crossing', home: false }) })
    endVoyage('arrived')
    expect(voyageCalledOff()).toBe(false)
    act(() => { beginVoyage({ to: 'atc-1', from: 'hub', leg: 'boarding', home: false }) })
    cancelVoyage()
    expect(voyageCalledOff()).toBe(true)
  })
})
