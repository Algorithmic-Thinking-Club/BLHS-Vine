import { useEffect, useState } from 'react'
import { isCaptain } from '../game/captain'
import { clearAllSaves, clearSave, writeSave } from '../game/save'
import './settings.css'

// Settings (GAME-DESIGN §4.7), one paper sheet — reachable from the title gear and the
// in-world gear on any map. v1 keeps only what is real today: sound mute (the audio system
// reads it when it lands), text size, reduced motion, and the about/privacy line. Stored
// locally; no accounts anywhere.

export type Settings = { mute: boolean; textSize: 's' | 'm' | 'l'; reducedMotion: boolean }
const KEY = 'blhs_settings_v1'

export function loadSettings(): Settings {
  try { return { mute: false, textSize: 'm', reducedMotion: false, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } }
  catch { return { mute: false, textSize: 'm', reducedMotion: false } }
}
export function applySettings(s: Settings) {
  document.documentElement.dataset.textsize = s.textSize
  document.documentElement.dataset.rm = s.reducedMotion ? '1' : ''
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings>(loadSettings)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(s)); applySettings(s) }, [s])
  return (
    <div className="st-veil" onClick={onClose}>
      <div className="st-panel" onClick={(e) => e.stopPropagation()}>
        <div className="st-title">Settings</div>
        <div className="st-row">
          <span>Sound</span>
          <button className={`st-toggle ${s.mute ? '' : 'st-on'}`} onClick={() => setS({ ...s, mute: !s.mute })}>
            {s.mute ? 'muted' : 'on'}
          </button>
        </div>
        <div className="st-row">
          <span>Text size</span>
          <div className="st-seg">
            {(['s', 'm', 'l'] as const).map((k) => (
              <button key={k} className={`st-segbtn ${s.textSize === k ? 'st-on' : ''}`} onClick={() => setS({ ...s, textSize: k })}>
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="st-row">
          <span>Reduced motion</span>
          <button className={`st-toggle ${s.reducedMotion ? 'st-on' : ''}`} onClick={() => setS({ ...s, reducedMotion: !s.reducedMotion })}>
            {s.reducedMotion ? 'on' : 'off'}
          </button>
        </div>
        {isCaptain() && (
          <div className="st-captain">
            <div className="st-captain-head">⚓ Captain's tools</div>
            <div className="st-captain-row">
              <button onClick={() => { clearSave(); location.href = '/?scene=beach&fresh=1' }}>Replay intro</button>
              <button onClick={() => { writeSave({ beat: 'island:arrive', introDone: true }); location.href = '/?scene=islandmap' }}>Skip to island</button>
              <button onClick={() => { clearAllSaves(); location.href = '/' }}>Wipe all</button>
            </div>
          </div>
        )}
        <div className="st-about">
          BLHS Island Explorer, built by the Algorithmic Thinking Club.
          Your real name never leaves the room; play data is anonymous.
        </div>
        <button className="st-close" onClick={onClose}>Back to it</button>
      </div>
    </div>
  )
}

/** the little corner gear every scene can mount */
export function GearButton({ onClick }: { onClick: () => void }) {
  return <button className="st-gear" aria-label="Settings" title="Settings" onClick={onClick}>⚙</button>
}
