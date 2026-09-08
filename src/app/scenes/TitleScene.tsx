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

// Title (GAME-DESIGN §4.2). The backdrop is the cove itself, for now a captured frame of
// the live beach (Thor on his pier, the ship at berth) with a slow ambient drift; it swaps
// to the real BeachIso idling underneath once the scene exposes an ambient mode (the ship
// session owns that file right now). Wordmark on the carved signboard, gull perched on it
// (press: it flaps to the other end), smart CTA off the save, corner controls.

/* WHAT THIS SESSION CHANGED HERE, AND WHY EVERY LINE OF IT IS APPEARANCE.
 *
 * `docs/ops/BRIEF-UI.md`'s do-not list gives the student route to another
 * session: "Change the student route or the title's targets". So `resume`, `go`,
 * `enterMap`, `HOME_TARGET` and the two `nav.go` calls below are byte for byte
 * what they were. Nothing here decides where a press lands.
 *
 * THE ONE STRING A STUDENT SEES MOST WAS UNREADABLE THREE WAYS AT ONCE, measured
 * off `build-shots/ui/before/01-title.png`:
 *
 *   1. It carried an EM DASH, in player copy, which this repo's own law forbids
 *      (`src/game/run/vignettes.ts:3`), on the single most-read string in the game.
 *   2. It DID NOT FIT. `.ti-plank` is `min(340px, 44vw)` at 512/192 with a 12%
 *      padding, so "Continue - Year 3, Winter" wrapped to two lines and the
 *      second line left the sign entirely.
 *   3. The plank is the DARK WOOD one Ash chose, so pale ink is the only ink
 *      that reads on it, and the label was carrying its own colour.
 *
 * All three are one fix: the sign says CONTINUE, which is a word that fits at any
 * text size in any of the three settings, and the year and the season move onto
 * their own small carved plate under it, where they have room and where the
 * season wears the drawn `pip` face MAPVIS already cut for it. The plank itself
 * is the kit's `<Plank>` now, so it inherits rest, hover, press, disabled, focus
 * and busy from one file (`ui/controls.tsx`) instead of from three rules here.
 *
 * AND THE GULL IS A BUTTON. It was an `<img onClick>`: a control with a pointer
 * path and no key path at all, which §40.28 rules out, on the one screen every
 * student meets first. Same bird, same flap, now reachable by Tab. */

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
   * Both rides use the illustrated scene cover (calm, heavy, never a flash). */
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
          {/* A REAL BUTTON ROUND THE BIRD. It has always been pressable and it has
              never been reachable: §40.28 asks for a key path beside every pointer
              path, and this one had none. The label says what pressing it does,
              because "gull" is a noun and an accessible name is a verb. */}
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
          {/* ONE PLANK, TWO LINES, BOTH INSIDE THE WOOD.
              Ash, round two, on this exact shot: "Two planks where there was one:
              'Continue' and an empty plank under it, with the year and season
              pushed out onto a small chip below. One plank, 'Continue', with
              'Year 1, Spring' as its second line inside the wood, the way the old
              one read."
              The first pass split them because the old single line, "Continue -
              Year 3, Winter", did not fit the sign and wrapped off the wood. Two
              lines is the answer to both: the label never wraps, and the year and
              the season are still on the thing a returning student presses. */}
          {/* ---- AND THE RUN'S END IS A STATE OF THE TITLE ------------------
              BRIEF-CLOSE-THE-LOOP section 3: the ending goes to black and lands
              here, and *"the title then reads 'Year one is done' with the
              yearbook openable from it, never 'Continue, Fall, Year 1'. A reload
              lands on that same title state."*

              Ash's own report of the bug: *"i reloaded the page. it still says
              continue, fall year 1. i dont know if thats a glitch, cause year one
              is technically over."* Not a glitch: nothing on this screen had ever
              read whether the run was finished, so a student who played the whole
              thirty minutes was offered the same sign as one who had played none
              of it, and pressing it put him back in the room he had just left.

              TWO PLANKS ONLY HERE, and the one-plank rule above still holds for
              every other state. A finished run has two different things a student
              might want and they are not the same size: the yearbook is what he
              turns in, and walking back into the Maw is a second thought. */}
          {over ? (
            <>
              <Plank size="lg" className="ti-plank" sub="Year one is done" onClick={openBook}>
                Your yearbook
              </Plank>
              <Plank size="sm" className="ti-again" onClick={go}>Back to the island</Plank>
            </>
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
