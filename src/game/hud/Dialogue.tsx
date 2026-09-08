/* the station dialogue box: the clock around the one box, and who goes first in a cutscene */
import { useEffect, useRef, useState } from 'react'
import { onDialogue, dialogueState, type DialogueState } from '../dialogue'
import { holdWorld } from '../world-bus'
import { liveRuntime, onRuntime } from '../cutscene/stage-bus'
import type { CutsceneRuntime } from '../cutscene/runtime'
import { panelDepth } from '../ui/a11y'
import { DialogueBox, ADVANCE_DEAD_MS } from './DialogueBox'
import './dialogue.css'

const CPS = 45   // characters a second; §11.1's reading-speed pacing

/* how long the box stays after a line is answered, so two lines read as one box */
const HANDOVER_MS = 220

export function Dialogue() {
  const [st, setSt] = useState<DialogueState>(dialogueState)
  const [shown, setShown] = useState(0)
  const release = useRef<null | (() => void)>(null)

  useEffect(() => onDialogue(setSt), [])

  /* is a cutscene holding the floor, written only when the answer actually changes */
  const [csUp, setCsUp] = useState(() => liveRuntime()?.ui.active ?? false)
  const csUpRef = useRef(csUp)
  useEffect(() => {
    let offTicks: null | (() => void) = null
    const put = (v: boolean) => { if (v !== csUpRef.current) { csUpRef.current = v; setCsUp(v) } }
    const watch = (rt: CutsceneRuntime | null) => {
      offTicks?.(); offTicks = null
      if (!rt) { put(false); return }
      const read = () => put(rt.ui.active)
      read()
      offTicks = rt.subscribe(read)
    }
    const offBus = onRuntime(watch)
    watch(liveRuntime())
    return () => { offBus(); offTicks?.() }
  }, [])

  /* the world is held for as long as anything is on screen */
  useEffect(() => {
    if (st && !release.current) release.current = holdWorld('dialogue')
    if (!st && release.current) { release.current(); release.current = null }
    return () => { release.current?.(); release.current = null }
  }, [st])

  /* the line being drawn, kept a moment past the bus so the box does not blink out */
  const speaker = useRef<{ who?: string; portrait?: string }>({})
  const [held, setHeld] = useState<DialogueState>(st)
  useEffect(() => {
    if (st) { setHeld(st); return }
    const t = setTimeout(() => { setHeld(null); speaker.current = {} }, HANDOVER_MS)
    return () => clearTimeout(t)
    /* the speaker is forgotten with the box, so a new conversation starts clean */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st])

  const text = held?.kind === 'line' ? held.line.text : held?.kind === 'ask' ? (held.ask.prompt ?? '') : ''

  /* who is speaking, remembered across lines so a question keeps the last speaker's face */
  if (held?.kind === 'line' && held.line.who) {
    if (speaker.current.who !== held.line.who) speaker.current = { who: held.line.who, portrait: held.line.portrait }
    else if (held.line.portrait) speaker.current.portrait = held.line.portrait
  }
  const who = held?.kind === 'line' ? held.line.who : speaker.current.who
  const portrait = held?.kind === 'line'
    ? (held.line.portrait ?? (held.line.who === speaker.current.who ? speaker.current.portrait : undefined))
    : speaker.current.portrait

  /* the typewriter, which does not run while nobody can see it and never starts over */
  const shownRef = useRef(0)
  shownRef.current = shown
  const itemRef = useRef<DialogueState>(null)
  useEffect(() => {
    const fresh = itemRef.current !== held
    itemRef.current = held
    const from = fresh ? 0 : Math.min(shownRef.current, text.length)
    if (fresh) setShown(0)
    if (!text || csUp) return
    const started = performance.now() - (from / CPS) * 1000
    let raf = 0
    /* the count only ever goes up, so clicking cannot make the words go backwards */
    const tick = () => {
      const n = Math.min(text.length, Math.floor(((performance.now() - started) / 1000) * CPS))
      setShown((prev) => (prev > n ? prev : n))
      if (n < text.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, csUp])

  /* the clock that puts a click on the veil through the box's own dead zone */
  const veilAt = useRef(0)
  useEffect(() => { veilAt.current = performance.now() }, [held, csUp])

  const done = shown >= text.length
  if (!held || csUp) return null

  /* a click fills the line in first and advances second, and only for the live line */
  const advance = () => {
    if (!done) { setShown(text.length); return }
    if (st?.kind === 'line' && st === held) st.advance()
  }

  const advanceFromVeil = () => {
    if (performance.now() - veilAt.current <= ADVANCE_DEAD_MS) return
    advance()
  }

  /* the click-catching sheet, dropped entirely while a panel is open so it cannot eat clicks */
  const veiled = panelDepth() === 0

  const box = (
    <DialogueBox
      line={{ who, text, shown, done, portrait }}
      options={held.kind === 'ask' ? held.ask.options : undefined}
      onAdvance={advance}
      onPick={(i) => { if (st?.kind === 'ask' && st === held) st.pick(i) }}
    />
  )

  if (!veiled) return <div className="dlg-veil dlg-veil-open">{box}</div>

  return <div className="dlg-veil" onClick={advanceFromVeil}>{box}</div>
}
