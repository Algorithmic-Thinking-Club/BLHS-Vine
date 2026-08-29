/* THE CHART: this registry drawn on paper.
 *
 * §80.2 calls the chart "this registry drawn on paper" and the archipelago shot
 * "this registry at its widest", which is the whole argument for the chart not
 * being a second list: it reads the same composition the water is built from, so
 * an island that rises between two sittings appears on the chart with no code
 * change and no second edit.
 *
 * WHAT IT REPLACED. The Handbook's chart page read `ISLANDS` from
 * `src/game/island/registry.ts`, the tile-era registry, which holds exactly one
 * entry, `{id: 'central', cx: 192, cy: 192, radius: 78}`, with `tile-space
 * center` on the coordinates, for a map the game loads under a different id.
 * That is AUTHORING §12's own example of the world composition document being
 * missing, and this is the page that had been standing in for it.
 *
 * STATE IS READABLE WITHOUT RELYING ON HUE. Every slot carries a mark as well as
 * a colour, which `GAME-DESIGN.md` §11.3 requires and nothing implemented.
 */
import { useEffect, useState } from 'react'
import { loadComposition, compositionCache, seaSlots, regionAt, type WorldComposition } from './composition'
import { stateOf, stateLine, STATE_INK } from './states'
import { loadSave, subscribeSave } from '../save'
import './chart.css'

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

export function Chart() {
  const [comp, setComp] = useState<WorldComposition | null>(compositionCache)
  const [, bump] = useState(0)
  useEffect(() => { void loadComposition().then(setComp) }, [])
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])

  if (!comp) return <div className="hb-dim">The chart is still being unrolled.</div>

  const save = loadSave()
  const slots = seaSlots(comp)

  /* THE PAPER FITS WHAT IS ON IT. A fixed frame drawn around a hardcoded extent
   * is what the tile-era chart did, and the first island placed outside that
   * extent falls off the page. The bounds are computed from the composition, with
   * a margin so nothing sits on the edge. */
  const xs = slots.map((s) => s.at.x)
  const ys = slots.map((s) => s.at.y)
  const pad = 700
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad
  const fx = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * 100
  const fy = (y: number) => ((y - y0) / Math.max(1, y1 - y0)) * 100

  const known = new Set((save?.exposure ?? []).map((e) => e.place))
  const unvisited = (comp.regions ?? []).filter((r) => r.kind === 'sailable'
    && !slots.some((s) => known.has(s.place ?? '') && regionAt(comp, s.at)?.name === r.name))

  return (
    <>
      <div className="hb-h">The sea so far</div>
      <div className="hb-chart ch-sea" role="img" aria-label={
        `A chart of ${slots.length} places. ` + slots.map((s) => {
          const st = stateOf(s, save)
          return `${st === 'misty' || st === 'rumour' ? 'an unnamed mark' : s.title}, ${stateLine(st, s, save)}`
        }).join('. ')
      }>
        {/* the named water, drawn under everything, so "anywhere you have not
            been" is a thing on the page rather than a coordinate test */}
        {(comp.regions ?? []).map((r) => (
          <div key={r.name} className={`ch-region ch-region-${r.kind}`} style={{
            left: `${fx(r.rect.x)}%`, top: `${fy(r.rect.y)}%`,
            width: `${(r.rect.w / Math.max(1, x1 - x0)) * 100}%`,
            height: `${(r.rect.h / Math.max(1, y1 - y0)) * 100}%`,
          }}>
            <span className="ch-region-name">{r.label ?? r.name}</span>
          </div>
        ))}

        {slots.map((s) => {
          const st = stateOf(s, save)
          const ink = STATE_INK[st]
          /* A MISTY ISLAND HAS NO NAME ON THE CHART. Printing the title of a
             place a student has never sailed to is the chart doing the
             discovering for them, which is the one thing it is for. */
          const named = st !== 'misty' && st !== 'rumour'
          return (
            <div key={s.map ?? s.title} className={`ch-isle ch-${st}`} style={{
              left: `${fx(s.at.x)}%`, top: `${fy(s.at.y)}%`, color: hex(ink.tint), opacity: ink.dim,
            }}>
              <span className="ch-mark" aria-hidden="true">{ink.mark}</span>
              <span className="ch-name">{named ? s.title : st === 'rumour' ? 'a rumour' : 'something out there'}</span>
              <span className="ch-note">{stateLine(st, s, save)}</span>
            </div>
          )
        })}
      </div>
      <div className="hb-dim ch-legend">
        {unvisited.length
          ? `Pencil is rumour and ink is somewhere you have been. ${unvisited.map((r) => r.label ?? r.name).join(' and ')} ${unvisited.length > 1 ? 'are' : 'is'} still blank.`
          : 'Pencil is rumour and ink is somewhere you have been.'}
      </div>
    </>
  )
}
