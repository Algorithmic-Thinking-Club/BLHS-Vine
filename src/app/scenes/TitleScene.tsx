import { useEffect, useState } from 'react'
import { useNav } from '../SceneManager'
import { beginAdventure, loadSave } from '../../game/save'
import { track } from '../../game/telemetry'
import { GearButton, SettingsPanel, applySettings, loadSettings } from '../SettingsPanel'
import { HOME_TARGET, enterMap } from '../../game/pmap/route'
import { Plank } from '../../game/ui/controls'
import { Yearbook } from '../../game/run/Yearbook'
import { runLine, sessionOver } from '../../game/run/year'
import './boot-title.css'

// the title screen: the cove behind, the wordmark on the signboard, and a button off the save

/* the title's plank, plate and gull are appearance only, and none of them decides a target */

export default function TitleScene() {
  const nav = useNav()
  const save = loadSave()
  /* THE RUN IS OVER, which every other screen in the game has known since the
   * yearbook page turned and this one never asked. */
  const over = sessionOver(save)
  const [book, setBook] = useState(false)
  const openBook = () => { track('yearbook_opened', { via: 'title' }); setBook(true) }
  const [gullRight, setGullRight] = useState(false)
  const [gullHop, setGullHop] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => { track('title_shown', { hasSave: !!save }); applySettings(loadSettings()) }, [save])

  /* continue resumes where the run lives: the beach mid-intro, the Maw once the intro is done */
  const resume = (introDone: boolean) => {
    if (introDone) {
      /* the address is written with the navigation and never without it */
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
          {/* a real button round the bird, so the flap has a key path as well as a pointer one */}
          <button
            key={gullHop}
            type="button"
            className={`ti-gull ${gullRight ? 'ti-gull-right' : ''}`}
            aria-label="Send the gull to the other end of the sign"
            onClick={flapGull}
          >
            <img className="ti-gull-pic pix" src="/art/intro/props/gull.png" alt="" draggable={false} />
          </button>
        </div>

        <div className="ti-actions">
          {/* one plank, two lines, with the year and season inside the wood */}
          {/* a finished run is its own title state: the yearbook, and a way back into the Maw */}
          {/* ONE PLANK HERE TOO, AND IT IS THE YEARBOOK. Ash, 2026-09-08, on the
              version that had two: *"the title says 'Year one is done' with 'Your
              yearbook' and nothing else, no 'Back to the island', no year two."*
              He read the second plank and asked the obvious question: if the year
              is fully done, should it not say Start Year 2. It should not, because
              there is no year two, and a way back into a finished room is a way
              back to nothing. The run ends here. */}
          {over ? (
            <Plank size="lg" className="ti-plank" sub="Year one is done" onClick={openBook}>
              Your yearbook
            </Plank>
          ) : (
            <Plank
              size="lg"
              className="ti-plank"
              sub={save ? runLine(save) : undefined}
              onClick={go}
            >
              {save ? 'Continue' : 'Begin Adventure'}
            </Plank>
          )}
        </div>
      </div>

      <div className="ti-credit">made by the Algorithmic Thinking Club</div>
      {/* THE YEARBOOK OVER THE TITLE, which is the only panel in the game that
          opens outside a world scene. It is the thing a student turns in, so the
          screen the run ends on has to be able to raise it. */}
      {book && <Yearbook onClose={() => setBook(false)} />}
      <GearButton onClick={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
