// proves both arms put the answer-latency convention on the event they send
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { CheckStep } from '../../vine/contract'
import type { CoreBeat } from './frames'

const events: { name: string; data: Record<string, unknown> }[] = []
vi.mock('../telemetry', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  track: (name: string, data?: Record<string, unknown>) => { events.push({ name, data: data ?? {} }) },
}))

const { CoreBeatRunner } = await import('./ActivityRunner')
const { beginAdventure } = await import('../save')

declare global { var IS_REACT_ACT_ENVIRONMENT: boolean }
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/** real time, because the thing under test is a real clock and a fake one would only test the fake, and 25 ms is unambiguous while short enough that the suite does not notice */
const spin = (ms: number) => { const t = Date.now(); while (Date.now() - t < ms) { /* wait */ } }

const two: CheckStep[] = [
  {
    kind: 'choice', id: 'first', prompt: 'The first question',
    options: [{ text: 'right one', correct: true, reply: 'Yes.' }, { text: 'wrong one', reply: 'No.' }],
  },
  {
    kind: 'choice', id: 'second', prompt: 'The second question',
    options: [{ text: 'right two', correct: true, reply: 'Yes.' }, { text: 'wrong two', reply: 'No.' }],
  },
]

const beat: CoreBeat = {
  id: 'test:latency', year: 1, title: 'Two questions', place: 'the Hearth',
  kind: 'core', credit: 0.5, takeaways: [],
  steps: two.map((check) => ({ kind: 'check' as const, check })),
}

async function mount() {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(createElement(CoreBeatRunner, { beat, onClose: () => {} }))
  })
  return {
    click: async (text: string) => {
      const b = [...host.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes(text))
      if (!b) throw new Error(`no button reading "${text}"`)
      await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    },
    pick: async (name: string, nth: number) => {
      const r = host.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)[nth]
      await act(async () => { r.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    },
    unmount: async () => { await act(async () => { root.unmount() }) },
  }
}

const answered = () => events.filter((e) => e.name === 'check_answered')

beforeEach(() => { localStorage.clear(); beginAdventure(); events.length = 0 })

describe('a beat stamps the moment of the answer, not of the dismissal', () => {
  it('reading the correction is not counted as answering time', async () => {
    const m = await mount()
    await m.click('right one')     // answered
    spin(60)                       // and now reads the reply, at their own pace
    await m.click('Keep going')

    const e = answered()[0]
    expect(e.data.latency).toBe('first-answer')
    expect(e.data.latencyMs as number).toBeLessThan(60)
    await m.unmount()
  })

  it('names the convention on every check_answered event', async () => {
    const g = await mount()
    await g.click('right one'); await g.click('Keep going')
    await g.click('right two'); await g.click('Keep going')
    await g.unmount()

    expect(answered()).toHaveLength(2)
    for (const e of answered()) expect(e.data.latency).toBe('first-answer')
    expect(answered().map((e) => e.data.via)).toEqual(['woven', 'woven'])
  })
})
