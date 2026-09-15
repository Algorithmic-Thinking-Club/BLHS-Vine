/* the chart gets its own screen instead of living only as the second tab of the Handbook, and there is one `<Chart />` with three doors into it: this panel, the corner's Map plaque, and E at a dock */
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
  /* holds the world while it is open like every other panel, because a body walking underneath a chart is a body walking into a wall behind a picture of the sea */
  useEffect(() => holdWorld('chart'), [])
  return (
    <div className="cp-veil" onClick={onClose}>
      <div {...panel} className="cp-card kit-surface-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <h2 className="cp-title">The Chart</h2>
          <p className="cp-sub">Where you sail. Press an island to go there.</p>
          <Plank size="sm" className="cp-close" onClick={onClose}>Close</Plank>
        </div>
        {/* sailing closes the chart, because the thing it asked for is happening behind the panel */}
        {/* no second heading: the card above already says what this is, and "The Chart" then "Chart" is the page stuttering */}
        <Chart onSailing={onClose} heading={false} />
      </div>
    </div>
  )
}

/* the chart button sits on the help button's own plate directly above it, and outside the Hud's gate for the same reason the question mark is: looking at the sea should not require being handed anything first */
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
