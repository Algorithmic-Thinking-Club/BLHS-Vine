/* the one switch in the top right corner: how close the camera sits to Thor */
import { useEffect, useState } from 'react'
import { applySettings, loadSettings, onSettings, saveSettings } from '../../app/SettingsPanel'
import { announce } from '../ui/a11y'
import { track } from '../telemetry'
import './camera-toggle.css'

/* a switch in the top right corner that changes the camera point of view */
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
      /* the tour finds it by this name, read off the live dom rather than a second layout */
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
