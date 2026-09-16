import { useEffect, useState } from 'react'
import { useNav } from '../SceneManager'
import { beginAdventure, endYear, loadSave } from '../../game/save'
import { track } from '../../game/telemetry'
import { GearButton, SettingsPanel, applySettings, loadSettings } from '../SettingsPanel'
import { HOME_TARGET, enterMap } from '../../game/pmap/route'
import { Plank } from '../../game/ui/controls'
import { Yearbook } from '../../game/run/Yearbook'
import { nextYear, runLine, sessionOver } from '../../game/run/year'
import { claimPlaying, otherTabPlaying } from '../entry'
import './boot-title.css'

// the title screen: the cove behind, the wordmark on the signboard, and a button off the save

/* the title's plank, plate and gull are appearance only, and none of them decides a target */

export default function TitleScene() {
  const nav = useNav()
  const save = loadSave()
  /* the run is over, which every other screen has known since the yearbook page turned and this one never asked */
  const over = sessionOver(save)
  /* the year after this one, when the game has one authored and the current one is closed; null at the end of the road, where the yearbook is all */
  const ahead = nextYear(save)

  /* open in another tab: both write the whole save, so the older copy lands on top */
  const [busyElsewhere, setBusyElsewhere] = useState(() => otherTabPlaying())
  useEffect(() => {
    const t = window.setInterval(() => setBusyElsewhere(otherTabPlaying()), 1500)
    return () => window.clearInterval(t)
  }, [])
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
  // no save gives Begin Adventure, a save gives Continue; starting over is Settings, Danger Zone, Restart and never a free title button
  /* the next year is a roll onto the same road: `endYear` bumps the year, clears the sheet and hands back three season tokens, and everything downstream reads the year and opens on its own, with nothing about the finished year erased */
  const openNextYear = () => {
    track('next_year_clicked', { from: save?.year ?? 1 })
    endYear()
    resume(true)
  }

  const go = () => {
    if (busyElsewhere) {
      /* taking over: the tab that had it stands down on its next beat, and the save this one is about to read is the one that tab has been writing */
      track('takeover_clicked')
      claimPlaying()
    }
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

        {/* said above the plank, so it is read before the press and not after */}
        {busyElsewhere && (
          <p className="ti-elsewhere" role="status">
            This adventure is open in another tab. Playing here will take it over.
          </p>
        )}

        <div className="ti-actions">
          {/* one plank, two lines, with the year and season inside the wood */}
          {/* a finished year is not a finished game: year two is authored in `beats/y2.ts` and `endYear()` hands out a fresh sheet and three season tokens, so only the button was missing; the yearbook goes second because it is what a student turns in and must never sit behind the next year */}
          {over ? (
            <>
              {ahead !== null && (
                <Plank
                  size="lg"
                  className="ti-plank"
                  sub={`Year ${save?.year ?? 1} is done`}
                  onClick={openNextYear}
                >
                  {`Start year ${ahead}`}
                </Plank>
              )}
              <Plank
                size={ahead === null ? 'lg' : 'md'}
                className={`ti-plank${ahead === null ? '' : ' ti-plank-second'}`}
                sub={ahead === null ? `Year ${save?.year ?? 1} is done` : undefined}
                onClick={openBook}
              >
                Your yearbook
              </Plank>
            </>
          ) : (
            <Plank
              size="lg"
              className="ti-plank"
              sub={busyElsewhere ? 'Open in another tab' : save ? runLine(save) : undefined}
              onClick={go}
            >
              {busyElsewhere ? 'Play here instead' : save ? 'Continue' : 'Begin Adventure'}
            </Plank>
          )}
        </div>
      </div>

      <div className="ti-credit">made by the Algorithmic Thinking Club</div>
      {/* the yearbook over the title, the only panel that opens outside a world scene, because it is what a student turns in and the screen the run ends on has to be able to raise it */}
      {book && <Yearbook onClose={() => setBook(false)} />}
      <GearButton onClick={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
