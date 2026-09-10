// the question mark in the corner and the one card behind it: the controls, the corner, the way out
import { useEffect, useState } from 'react'
import { announce, usePanel } from '../ui/a11y'
import { Glyph, Plank } from '../ui/controls'
import { track } from '../telemetry'
import { requestUi, uiListenerCount } from '../ui-bus'
import { holdWorld } from '../world-bus'
import { useNavMaybe } from '../../app/SceneManager'
import { applySettings, loadSettings, saveSettings } from '../../app/SettingsPanel'
import './help.css'

/** the one card, opened from the corner and from the pause sheet */
export function HelpCard({ onClose }: { onClose: () => void }) {
  const panel = usePanel({ onClose, label: 'How to play' })
  const nav = useNavMaybe()
  /* whether a Hud is mounted to answer a panel request, asked once when the card opens */
  const [hudUp, setHudUp] = useState(false)
  const [clickWalk, setClickWalk] = useState(() => loadSettings().clickToMove)
  useEffect(() => { setHudUp(uiListenerCount() > 0) }, [])
  useEffect(() => { track('help_opened') }, [])
  /* the card holds the world for as long as it is open, so it really is the pause */
  useEffect(() => holdWorld('help'), [])
  return (
    <div className="hp-veil" onClick={onClose}>
      <div
        {...panel}
        className="hp-card kit-surface-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---- REPLAY THE TUTORIAL (Ash, 2026-09-09) ---------------------
            *
            * *"Inside the question mark panel, on the top right, add a small
            * button that expands to 'replay tutorial' that replays the
            * tutorial."*
            *
            * Top right of the card, small until it is reached for, and it is
            * the same `open('tour')` an island says: one tutorial, two doors
            * into it. It only appears where a Hud is mounted to answer, since
            * the card also opens off the title where there is no corner to
            * point at. */}
        {hudUp && (
          <button
            type="button"
            className="hp-replay"
            onClick={() => { track('tour_replayed'); onClose(); requestUi('tour') }}
          >
            <Glyph piece="icon_set" face="arrow" size={13} className="hp-replay-mark" />
            <span className="hp-replay-word">Replay tutorial</span>
          </button>
        )}

        <h2 className="hp-title">How to play</h2>
        <p className="hp-paused">The game is paused while this card is open.</p>

        {/* the four keys as pictures, in the order a student meets them */}
        <ul className="hp-keys">
          <li className="hp-key">
            <span className="hp-mark hp-arrows" aria-hidden="true">
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-up" />
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-left" />
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-down" />
              <Glyph piece="icon_set" face="arrow" size={20} className="hp-ar hp-ar-right" />
            </span>
            <span className="hp-says">Arrow keys walk</span>
          </li>
          <li className="hp-key">
            <span className="hp-mark" aria-hidden="true"><span className="kit-plank-key hp-cap">E</span></span>
            <span className="hp-says">E opens what you are standing at</span>
          </li>
          <li className="hp-key">
            <span className="hp-mark" aria-hidden="true">
              <Glyph piece="pointer" face="hand" size={26} />
            </span>
            <span className="hp-says">Or click it</span>
          </li>
          <li className="hp-key">
            <span className="hp-mark" aria-hidden="true"><span className="kit-plank-key hp-cap">Esc</span></span>
            {/* what Escape really does, since a graded activity refuses it on purpose */}
            <span className="hp-says">Esc closes a panel, or pauses the game</span>
          </li>
        </ul>

        {/* ---- CLICK TO MOVE, AS A SWITCH (Ash, 2026-09-09) --------------
            *
            * *"Click to move. This is a slight problem. In the help button, make
            * this a toggle, to activate click to move. Right now it's just on by
            * default."*
            *
            * On the card with the keys, because it is about how he moves, and
            * the card is already the place a student comes to find that out.
            * Clicking a STATION is not this and never turns off. */}
        <button
          type="button"
          className="hp-toggle"
          role="switch"
          aria-checked={clickWalk}
          onClick={() => {
            const next = !clickWalk
            setClickWalk(next)
            const now = { ...loadSettings(), clickToMove: next }
            saveSettings(now)
            applySettings(now)
            track('click_to_move', { on: next })
            announce(next ? 'Clicking the ground walks you there.' : 'Clicking the ground no longer walks you.')
          }}
        >
          <span className={`hp-toggle-box${clickWalk ? ' hp-toggle-on' : ''}`} aria-hidden="true">
            {clickWalk && <Glyph piece="icon_set" face="tick" size={13} />}
          </span>
          <span className="hp-toggle-words">Click the ground to walk there</span>
        </button>

        {/* THE SENTENCE THE BRIEF ASKS FOR, VERBATIM AND ON ITS OWN. It is the
            answer to "I don't know what to do", so it is not in the list with
            the keys; it is the line the card is really about. */}
        <p className="hp-task">The line above your head is your task.</p>

        {/* what the corner things are, named the way the plaques themselves label them */}
        <ul className="hp-corner">
          <li><b>Map</b> the islands you have found</li>
          <li><b>Guide</b> what the school offers, and what you have collected</li>
          <li><b>My Year</b> pick your classes and activities</li>
        </ul>

        {/* the pause sheet's own doors, in its own words, with the ones no Hud can answer left out */}
        <div className="hp-doors">
          <Plank className="hp-door hp-door-back" keyCap="Esc" onClick={onClose}>Back to the game</Plank>
          {hudUp && <Plank className="hp-door" onClick={() => { onClose(); requestUi('planner') }}>My Year</Plank>}
          {hudUp && <Plank className="hp-door" onClick={() => { onClose(); requestUi('handbook') }}>Guide</Plank>}
          {/* the only control anywhere that opens the trophy wall */}
          {hudUp && <Plank className="hp-door" onClick={() => { onClose(); requestUi('wall') }}>Trophy wall</Plank>}
          {hudUp && <Plank className="hp-door" onClick={() => { onClose(); requestUi('settings') }}>Settings</Plank>}
          {nav && <Plank className="hp-door" onClick={() => { onClose(); nav.go('title') }}>Save and leave</Plank>}
        </div>
      </div>
    </div>
  )
}

/* the button, in its own corner slot so it is there before the Hud is */
export function HelpButton() {
  const [open, setOpen] = useState(false)
  /* it sits at a fixed corner, so it measures nothing and watches nothing */
  return (
    <>
      <button
        className="hud-plaque hp-btn"
        data-tour="help"
        aria-label="How to play"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="hud-plaque-word hp-q">?</span>
      </button>
      {open && <HelpCard onClose={() => setOpen(false)} />}
    </>
  )
}
