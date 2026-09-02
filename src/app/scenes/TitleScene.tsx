import { useEffect, useState } from 'react'
import { useNav } from '../SceneManager'
import { beginAdventure, loadSave } from '../../game/save'
import { track } from '../../game/telemetry'
import { GearButton, SettingsPanel, applySettings, loadSettings } from '../SettingsPanel'
import { HOME_TARGET, enterMap } from '../../game/pmap/route'
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
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { track('title_shown', { hasSave: !!save }); applySettings(loadSettings()) }, [save])

  /* ONE STUDENT, ONE RUN, and Continue resumes where the run lives.
   *
   * MID-INTRO GOES TO THE BEACH, unchanged: an unfinished intro replays the whole
   * script, and the parchment does not re-ask because the I-3 gate resolves itself
   * off the saved identity (IntroScene says why). That half is not touched here.
   *
   * A FINISHED INTRO GOES TO THE MAW. Ash's rule: the Maw is Thor's home and where
   * a run always resumes. It used to go to `islandmap`, the tile-era map the
   * walkthrough's §3.0 ruled dead, and a student pressing Continue landed on tile
   * palms with a Principal Panther line as recently as yesterday's capture.
   *
   * IT DOES NOT WAIT ON THE MAW BEING PUBLISHED. The loader asks the platform for
   * `panther-maw` first and falls back to the committed stand-in bundle, which
   * carries all eleven anchors including the `arrive_maw` this aims at, so the real
   * room replaces it the moment Ash publishes with no code change here.
   *
   * Both rides use the illustrated scene cover (calm, heavy — never a flash). */
  const resume = (introDone: boolean) => {
    if (introDone) {
      /* the address goes down with the navigation and never without it: PmapScene
       * reads its target off the url at mount, so a refused cover would otherwise
       * leave the address pointing at a map the student is not in. `route.ts`
       * owns both halves. */
      enterMap(nav.go, HOME_TARGET, { kind: 'scene', image: '/art/ui/loading-islands.png', title: 'THE BLHS ISLANDS', holdMs: 2200 })
    } else nav.go('beach', { kind: 'scene', title: 'THE FAR SHORE', holdMs: 2200 })
  }
  // no save -> Begin Adventure (starts the one run). Save -> Continue where they left off.
  // (Starting over is Settings -> Danger Zone -> Restart, never a free title button.)
  const go = () => {
    if (save) { track('continue_clicked'); resume(save.introDone) }
    else { track('begin_clicked'); beginAdventure(); resume(false) }
  }

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
          <button className="ti-plank" onClick={go}>
            <span className="ti-plank-label">{save ? `Continue — Year ${save.year}, ${save.season}` : 'Begin Adventure'}</span>
          </button>
        </div>
      </div>

      <div className="ti-credit">made by the Algorithmic Thinking Club</div>
      <GearButton onClick={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
