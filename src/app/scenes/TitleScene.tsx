import { useEffect, useState } from 'react'
import { useNav } from '../SceneManager'
import { loadSave } from '../../game/save'
import { track } from '../../game/telemetry'
import './boot-title.css'

// Title (GAME-DESIGN §4.2). The backdrop is the cove itself — for now a captured frame of
// the live beach (Thor on his pier, the ship at berth) with a slow ambient drift; it swaps
// to the real BeachIso idling underneath once the scene exposes an ambient mode (the ship
// session owns that file right now). Wordmark on the carved signboard, gull perched on it
// (click: it flaps to the other end), smart CTA off the save, corner controls.

export default function TitleScene() {
  const nav = useNav()
  const save = loadSave()
  const [gullRight, setGullRight] = useState(false)
  const [gullHop, setGullHop] = useState(0)

  useEffect(() => { track('title_shown', { hasSave: !!save }) }, [save])

  const sail = () => { track(save ? 'continue_clicked' : 'new_voyage_clicked'); nav.go('beach') }
  const newVoyage = () => { track('new_voyage_clicked'); nav.go('beach') }

  const flapGull = () => { setGullHop((h) => h + 1); setGullRight((g) => !g) }

  return (
    <div className="ti-root">
      <div className="ti-backdrop" />
      <div className="ti-veil" />

      <div className="ti-stack">
        {save && <div className="ti-welcome">Welcome back, {save.handle || 'Panther'}</div>}

        <div className="ti-wordmark">
          <div className="ti-signpaper" />
          <img className="ti-sign pix" src="/art/ui/title-signboard.png" alt="" draggable={false} />
          <div className="ti-wordtext">
            <span className="ti-line1">BLHS</span>
            <span className="ti-line2">ISLAND EXPLORER</span>
          </div>
          <img
            key={gullHop}
            className={`ti-gull pix ${gullRight ? 'ti-gull-right' : ''}`}
            src="/art/intro/props/gull.png" alt="" draggable={false}
            onClick={flapGull} title=""
          />
        </div>

        <div className="ti-actions">
          <button className="ti-plank" onClick={sail}>
            <span className="ti-plank-label">{save ? `Continue — Year ${save.year}, ${save.season}` : 'Set Sail'}</span>
          </button>
          {save && (
            <button className="ti-newvoyage" onClick={newVoyage}>New voyage</button>
          )}
        </div>
      </div>

      <div className="ti-credit">made by the Algorithmic Thinking Club</div>
    </div>
  )
}
