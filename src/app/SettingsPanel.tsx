import { useEffect, useState } from 'react'
import { isCaptain } from '../game/captain'
import { clearSave, loadSave, writeSave } from '../game/save'
import { track } from '../game/telemetry'
import './settings.css'

// Settings (GAME-DESIGN §4.7), tabbed paper sheet — reachable from the title gear and the
// in-world gear. Two tabs: ACCOUNT (who this explorer is + preferences) and DANGER ZONE
// (Restart Adventure). Stored locally; there are no real accounts (the handle is a display
// name, not a login).

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

type Tab = 'account' | 'danger'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings>(loadSettings)
  const [tab, setTab] = useState<Tab>('account')
  const [confirmRestart, setConfirmRestart] = useState(false)
  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(s)); applySettings(s) }, [s])
  const save = loadSave()

  const restart = () => {
    track('adventure_restarted')
    clearSave()
    location.href = '/'   // back to the title, which now shows Begin Adventure
  }

  return (
    <div className="st-veil" onClick={onClose}>
      <div className="st-panel" onClick={(e) => e.stopPropagation()}>
        <div className="st-inner">
          <div className="st-tabs">
            <button className={`st-tab ${tab === 'account' ? 'st-tab-on' : ''}`} onClick={() => setTab('account')}>Account</button>
            <button className={`st-tab ${tab === 'danger' ? 'st-tab-on' : ''}`} onClick={() => setTab('danger')}>Danger Zone</button>
          </div>

          <div className="st-page">
            {tab === 'account' && (
              <>
                <div className="st-idcard">
                  <div className="st-idrow"><span className="st-idlabel">Name</span><span className="st-idval">{save?.handle || '—'}</span></div>
                  <div className="st-idrow"><span className="st-idlabel">Pronouns</span><span className="st-idval">{save?.pronouns || '—'}</span></div>
                  <div className="st-idrow"><span className="st-idlabel">Ship</span><span className="st-idval">{save?.boatName || '—'}</span></div>
                  {save?.classCode && <div className="st-idrow"><span className="st-idlabel">Class</span><span className="st-idval">{save.classCode}</span></div>}
                  <div className="st-idrow"><span className="st-idlabel">Progress</span><span className="st-idval">{save ? (save.introDone ? `Year ${save.year}, ${save.season}` : 'Just started') : 'No voyage yet'}</span></div>
                </div>

                <div className="st-prefhead">Preferences</div>
                <div className="st-row">
                  <span>Sound</span>
                  <button className={`st-toggle ${s.mute ? '' : 'st-on'}`} onClick={() => setS({ ...s, mute: !s.mute })}>{s.mute ? 'muted' : 'on'}</button>
                </div>
                <div className="st-row">
                  <span>Text size</span>
                  <div className="st-seg">
                    {(['s', 'm', 'l'] as const).map((k) => (
                      <button key={k} className={`st-segbtn ${s.textSize === k ? 'st-on' : ''}`} onClick={() => setS({ ...s, textSize: k })}>{k.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div className="st-row">
                  <span>Reduced motion</span>
                  <button className={`st-toggle ${s.reducedMotion ? 'st-on' : ''}`} onClick={() => setS({ ...s, reducedMotion: !s.reducedMotion })}>{s.reducedMotion ? 'on' : 'off'}</button>
                </div>
                <div className="st-about">Your real name never leaves the room; play data is anonymous.</div>
              </>
            )}

            {tab === 'danger' && (
              <>
                <div className="st-dangerhead">Restart adventure</div>
                <div className="st-dangerbody">
                  This erases this device's voyage completely — your name, ship, and every year of
                  progress — and starts you back at Begin Adventure. It cannot be undone.
                </div>
                {!confirmRestart ? (
                  <button className="st-dangerbtn" onClick={() => setConfirmRestart(true)}>Restart adventure</button>
                ) : (
                  <div className="st-confirmrow">
                    <button className="st-dangerbtn" onClick={restart}>Yes, erase it all</button>
                    <button className="st-cancelbtn" onClick={() => setConfirmRestart(false)}>Keep my voyage</button>
                  </div>
                )}

                {isCaptain() && (
                  <div className="st-captain">
                    <div className="st-captain-head">⚓ Captain's tools</div>
                    <div className="st-captain-row">
                      <button onClick={() => { location.href = '/?scene=beach&fresh=1' }}>Replay intro</button>
                      <button onClick={() => { writeSave({ beat: 'island:arrive', introDone: true }); location.href = '/?scene=islandmap' }}>Skip to island</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <button className="st-close" onClick={onClose}>Back to it</button>
        </div>
      </div>
    </div>
  )
}

/** the little corner gear every scene can mount */
export function GearButton({ onClick }: { onClick: () => void }) {
  return <button className="st-gear" aria-label="Settings" title="Settings" onClick={onClick}>⚙</button>
}
