/* the one switch in the top right corner: how close the camera sits to Thor */
import { useEffect, useState } from 'react'
import { applySettings, loadSettings, onSettings, saveSettings } from '../../app/SettingsPanel'
import { announce } from '../ui/a11y'
import { track } from '../telemetry'
import './camera-toggle.css'

/* ---- ASH, 2026-09-09 ------------------------------------------------------
 *
 * *"At the top right corner of the screen which is currently empty, add a switch
 * toggle, that switches camera POV. The current normal POV is 'wide view' and
 * when the toggle is activated, it zooms into Thor much closer (like the MAPVIS
 * POV view)."*
 *
 * WHY IT IS A SWITCH AND NOT A SLIDER. There are exactly two shots worth having
 * and both are derived: the wide one is the painting's own cover fit stepped in
 * once, and the close one puts ninety-four pixels of panther on the glass. A
 * slider would let a student pick a zoom that shows a black field on one map and
 * a nose on another, and neither number is his to invent.
 *
 * IT WRITES A SETTING, NOT A SAVE. It means the same thing in every room, it
 * survives a reload, and it is not part of the run: a study looking at what a
 * student did should not find "he preferred a close camera" in his transcript.
 *
 * IT SAYS THE VIEW IT IS IN, not the view it would switch to. A control labelled
 * with its own opposite is the oldest bad button in software.
 */
export function CameraToggle() {
  const [close, setClose] = useState(() => loadSettings().closeCamera)
  /* the settings panel can change this too, so the switch is not the only writer */
  useEffect(() => onSettings(() => setClose(loadSettings().closeCamera)), [])

  const flip = () => {
    const next = !close
    setClose(next)
    const now = { ...loadSettings(), closeCamera: next }
    saveSettings(now)
    applySettings(now)
    track('camera_view', { close: next })
    announce(next ? 'Close view' : 'Wide view')
  }

  return (
    <button
      type="button"
      className="ct-btn"
      /* the tour points at it by this name, the way every other corner control is
         found: read off the live DOM rather than kept in a second layout */
      data-tour="camera-view"
      role="switch"
      aria-checked={close}
      aria-label={`Camera: ${close ? 'close view' : 'wide view'}. Press to switch.`}
      title={close ? 'Close view' : 'Wide view'}
      onClick={flip}
    >
      {/* the two frames, the lit one being the view he is in */}
      <span className="ct-marks" aria-hidden="true">
        <span className={`ct-mark ct-wide${close ? '' : ' ct-on'}`} />
        <span className={`ct-mark ct-close${close ? ' ct-on' : ''}`} />
      </span>
      <span className="ct-word">{close ? 'Close' : 'Wide'}</span>
    </button>
  )
}
