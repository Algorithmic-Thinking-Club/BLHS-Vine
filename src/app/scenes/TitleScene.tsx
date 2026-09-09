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
  /* THE RUN IS OVER, which every other screen in the game has known since the
   * yearbook page turned and this one never asked. */
  const over = sessionOver(save)
  /* the year after this one, when the game has one authored and he has closed
     the one he is in. Null at the end of the road, where the yearbook is all. */
  const ahead = nextYear(save)

  /* ---- OPEN IN ANOTHER TAB (Ash, 2026-09-09) ----------------------------
   *
   * *"If a game is already running in a tab, having duplicates might be a
   * problem?"* It is: both tabs write the whole save, so the older copy lands on
   * top of the newer one and a finished class quietly disappears. A world scene
   * holds a claim (`app/entry.ts`); this reads it, on a beat, because the other
   * tab can be closed while this screen is sitting here.
   *
   * IT IS A WARNING AND NOT A LOCK. The plank still works and says what it will
   * do. A claim goes stale in ten seconds, so a crashed tab frees itself, and a
   * student who is genuinely stuck can always press on. */
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
  // no save -> Begin Adventure (starts the one run). Save -> Continue where they left off.
  // (Starting over is Settings -> Danger Zone -> Restart, never a free title button.)
  /* THE NEXT YEAR IS A ROLL AND THEN THE SAME ROAD. `endYear` bumps the year,
     clears the sheet and hands back three season tokens; everything downstream
     (`sessionOver`, the sequencer, the Maw's own gates) reads the year and opens
     on its own. Nothing about the finished year is erased. */
  const openNextYear = () => {
    track('next_year_clicked', { from: save?.year ?? 1 })
    endYear()
    resume(true)
  }

  const go = () => {
    if (busyElsewhere) {
      /* taking over: the tab that had it stands down on its next beat, and the
       * save this one is about to read is the one that tab has been writing */
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
          {/* ---- A FINISHED YEAR IS NOT A FINISHED GAME (Ash, 2026-09-09) ----
              *
              * *"On the title screen the option says 'your yearbook'. This is
              * useful. But the main button should be 'start year 2' with the
              * button below being 'your yearbook', am I right?"*
              *
              * He is. The comment that stood here said there is no year two and
              * that was simply wrong: `beats/y2.ts` is an authored Advisory at
              * the counselor's office about every honor cord the school gives,
              * the catalog offers classes for all four years, and `endYear()`
              * hands out a fresh sheet and three fresh season tokens. The only
              * thing missing was a button.
              *
              * THE YEARBOOK STAYS AND GOES SECOND, because it is the thing a
              * student turns in and it must never be behind the next year. */}
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
                className="ti-plank"
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
      {/* THE YEARBOOK OVER THE TITLE, which is the only panel in the game that
          opens outside a world scene. It is the thing a student turns in, so the
          screen the run ends on has to be able to raise it. */}
      {book && <Yearbook onClose={() => setBook(false)} />}
      <GearButton onClick={() => setSettingsOpen(true)} />
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
