/* THE CHART, ON ITS OWN, BEHIND ITS OWN BUTTON.
 *
 * ASH, after playing: *"even the chart is shitty. and i clearly asked for a button to
 * open the sialign map alone, above the help button."*
 *
 * Both halves of that were true. The chart existed only as the second tab of a
 * six-tab Handbook, so a student who wanted to look at the sea got a book with the
 * school's course catalogue in it, a GPA line across the top and five other tabs
 * competing for the press. Pressing E at his own ship opened the same book. The map
 * of the world he sails is not a chapter of a handbook, it is the thing this game is
 * about, and it gets a screen.
 *
 * The Handbook keeps its Chart tab, because a student reading the Guide should still
 * be able to see where things are. Both draw the same `<Chart />`, so there is one
 * chart in this game and three doors into it: this panel, the corner's Map plaque,
 * and E at a dock.
 */
import { useEffect, useState } from 'react'
import { usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import { holdWorld } from '../world-bus'
import { Chart } from './Chart'
import './chart-panel.css'

export function ChartPanel({ onClose }: { onClose: () => void }) {
  const panel = usePanel({ onClose, label: 'The chart. Where you sail.' })
  useEffect(() => { track('chart_opened') }, [])
  /* it holds the world while it is open, the same as every other panel: a chart is
   * something you stop and read, and a body walking underneath one is a body walking
   * into a wall behind a picture of the sea. */
  useEffect(() => holdWorld('chart'), [])
  return (
    <div className="cp-veil" onClick={onClose}>
      <div {...panel} className="cp-card kit-surface-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <h2 className="cp-title">The Chart</h2>
          <p className="cp-sub">Where you sail. Press an island to go there.</p>
          <Plank size="sm" className="cp-close" onClick={onClose}>Close</Plank>
        </div>
        {/* sailing closes the chart, because the thing it asked for is happening
            behind it and a panel over a departure is a panel nobody wanted */}
        {/* no second heading: the card above already says what this is, and two
            words reading "The Chart" then "Chart" is the page stuttering */}
        <Chart onSailing={onClose} heading={false} />
      </div>
    </div>
  )
}

/* ---- AND THE BUTTON HE ASKED FOR, ABOVE THE QUESTION MARK ----------------
 *
 * *"i clearly asked for a button to open the sialign map alone, above the help
 * button."* It sits in the help button's own corner, on the same plate, directly
 * above it. Outside the Hud's own gate for the same reason the question mark is: a
 * student looking at the sea should not have to have been handed anything first. */
export function ChartButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="hud-plaque cp-btn"
        data-tour="chart"
        aria-label="The chart. Where you sail."
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Glyph piece="icon_set" face="compass" size={20} className="hud-plaque-mark" />
        <span className="hud-plaque-word cp-btn-word">Chart</span>
      </button>
      {open && <ChartPanel onClose={() => setOpen(false)} />}
    </>
  )
}
