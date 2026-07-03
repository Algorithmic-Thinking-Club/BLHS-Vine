import { useEffect, useState } from 'react'
import { isCaptain } from '../game/captain'
import { clearSave, loadSave, writeSave, type SaveGame } from '../game/save'
import { cleanName, isBlocked, PRONOUN_CHOICES } from '../game/names'
import { track } from '../game/telemetry'
import './settings.css'

// Settings (GAME-DESIGN §4.7), tabbed paper sheet — reachable from the title gear and the
// in-world gear. Three tabs: ACCOUNT (who this explorer is — name/pronouns/ship are editable —
// plus preferences), CONTROLS (the real key map), and DANGER ZONE (Restart Adventure). Stored
// locally; there are no real accounts (the handle is a display name, not a login).

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

type Tab = 'account' | 'controls' | 'danger'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings>(loadSettings)
  const [tab, setTab] = useState<Tab>('account')
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [save, setSave] = useState<SaveGame | null>(loadSave)
  const [pickPronoun, setPickPronoun] = useState(false)
  const [fs, setFs] = useState(!!document.fullscreenElement)
  // local drafts so the fields never persist junk mid-type — committed on blur/Enter (§4.7)
  const [nameDraft, setNameDraft] = useState(save?.handle ?? '')
  const [boatDraft, setBoatDraft] = useState(save?.boatName ?? '')

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(s)); applySettings(s) }, [s])
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // identity edits write straight to the run — handle/pronouns/boat are display fields set the
  // same way the intro set them (not graded state, so no domain verb, just writeSave)
  const edit = (patch: Partial<SaveGame>) => setSave(writeSave(patch))
  // commit reads the field's own value (robust to render timing), cleans, and rejects
  // empty/blocked by snapping back to the saved name — a student can't wipe their name to blank
  const commitName = (raw: string) => {
    const v = cleanName(raw).trim()
    if (v.length >= 2 && !isBlocked(v)) { edit({ handle: v }); setNameDraft(v); track('name_edited') }
    else setNameDraft(save?.handle ?? '')
  }
  const commitBoat = (raw: string) => {
    const v = cleanName(raw, 18).trim()
    if (v.length >= 2 && !isBlocked(v)) { edit({ boatName: v }); setBoatDraft(v); track('boat_renamed') }
    else setBoatDraft(save?.boatName ?? '')
  }

  const toggleFs = () => {
    const el = document.documentElement
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
    track('fullscreen_toggled', { on: !document.fullscreenElement })
  }

  const restart = () => {
    track('adventure_restarted')
    clearSave()
    location.href = '/'   // back to the title, which now shows Begin Adventure
  }

  const nameBad = nameDraft.trim().length > 0 && isBlocked(nameDraft)
  const boatBad = boatDraft.trim().length > 0 && isBlocked(boatDraft)

  return (
    <div className="st-veil" onClick={onClose}>
      <div className="st-panel" onClick={(e) => e.stopPropagation()}>
        <div className="st-inner">
          <div className="st-tabs">
            <button className={`st-tab ${tab === 'account' ? 'st-tab-on' : ''}`} onClick={() => setTab('account')}>Account</button>
            <button className={`st-tab ${tab === 'controls' ? 'st-tab-on' : ''}`} onClick={() => setTab('controls')}>Controls</button>
            <button className={`st-tab ${tab === 'danger' ? 'st-tab-on' : ''}`} onClick={() => setTab('danger')}>Danger Zone</button>
          </div>

          <div className="st-page">
            {tab === 'account' && (
              <>
                {save ? (
                  <div className="st-idcard">
                    <label className="st-editrow">
                      <span className="st-idlabel">Name</span>
                      <input
                        className="st-idfield" value={nameDraft} placeholder="your deck name"
                        onChange={(e) => setNameDraft(cleanName(e.target.value))}
                        onBlur={(e) => commitName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </label>
                    {nameBad && <div className="st-fieldwarn">The harbor master raised an eyebrow. Try another.</div>}

                    <div className="st-editrow">
                      <span className="st-idlabel">Pronouns</span>
                      <button className="st-idpick" onClick={() => setPickPronoun((v) => !v)}>{save.pronouns || 'set'} ▾</button>
                    </div>
                    {pickPronoun && (
                      <div className="st-chips">
                        {PRONOUN_CHOICES.map((c) => (
                          <button
                            key={c} className={`st-chip ${save.pronouns === c ? 'st-chip-on' : ''}`}
                            onClick={() => { edit({ pronouns: c }); track('pronouns_edited'); setPickPronoun(false) }}
                          >{c}</button>
                        ))}
                      </div>
                    )}

                    <label className="st-editrow">
                      <span className="st-idlabel">Ship</span>
                      <input
                        className="st-idfield" value={boatDraft} placeholder="her name"
                        onChange={(e) => setBoatDraft(cleanName(e.target.value, 18))}
                        onBlur={(e) => commitBoat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </label>
                    {boatBad && <div className="st-fieldwarn">She would sink from embarrassment. Another.</div>}

                    {save.classCode && <div className="st-idrow"><span className="st-idlabel">Class</span><span className="st-idval">{save.classCode}</span></div>}
                    <div className="st-idrow"><span className="st-idlabel">Progress</span><span className="st-idval">{save.introDone ? `Year ${save.year}, ${save.season}` : 'Just started'}</span></div>
                  </div>
                ) : (
                  <div className="st-idcard st-idcard-empty">Begin your adventure to name your explorer and her ship.</div>
                )}

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
                <div className="st-row">
                  <span>Fullscreen</span>
                  <button className={`st-toggle ${fs ? 'st-on' : ''}`} onClick={toggleFs}>{fs ? 'on' : 'off'}</button>
                </div>
                <div className="st-about">Your real name never leaves the room; play data is anonymous.</div>
              </>
            )}

            {tab === 'controls' && (
              <div className="st-controls">
                <div className="st-ctrlsec">On foot</div>
                <CtrlRow label="Move" keys={['W', 'A', 'S', 'D']} alt={['↑', '←', '↓', '→']} />
                <CtrlRow label="Sprint" keys={['Shift']} />
                <CtrlRow label="Jump" keys={['Space']} />
                <CtrlRow label="Interact · Board" keys={['E']} />

                <div className="st-ctrlsec">At the helm</div>
                <CtrlRow label="Steer" keys={['A', 'D']} />
                <CtrlRow label="Ahead" keys={['W']} />
                <CtrlRow label="Slow · astern" keys={['S']} />
                <CtrlRow label="Come ashore" keys={['E']} />

                <div className="st-ctrlsec">Anywhere</div>
                <CtrlRow label="Pause" keys={['Esc']} />
                <div className="st-ctrlnote">Open the chart and Handbook from the compass and book at the top-left.</div>
              </div>
            )}

            {tab === 'danger' && (
              <>
                <div className="st-dangerhead">Restart adventure</div>
                <div className="st-dangerbody">
                  This erases this device's voyage completely — your name, ship, and every year of
                  progress — and starts you back at Begin Adventure. It cannot be undone.
                </div>
                {!save ? (
                  <div className="st-dangerbody" style={{ opacity: .75 }}>No voyage yet — nothing to erase.</div>
                ) : !confirmRestart ? (
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

/** one control line: an action and the real key(s) that drive it, rendered as keycaps */
function CtrlRow({ label, keys, alt }: { label: string; keys: string[]; alt?: string[] }) {
  return (
    <div className="st-ctrl-row">
      <span className="st-ctrl-label">{label}</span>
      <span className="st-ctrl-keys">
        {keys.map((k) => <span className="st-key" key={k}>{k}</span>)}
        {alt && <><span className="st-ctrl-or">or</span>{alt.map((k) => <span className="st-key" key={'a' + k}>{k}</span>)}</>}
      </span>
    </div>
  )
}

/** the little corner gear every scene can mount */
export function GearButton({ onClick }: { onClick: () => void }) {
  return <button className="st-gear" aria-label="Settings" title="Settings" onClick={onClick}>⚙</button>
}
