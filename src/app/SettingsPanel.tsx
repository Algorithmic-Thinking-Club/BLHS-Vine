import { useEffect, useRef, useState } from 'react'
import { isCaptain } from '../game/captain'
import { beginAdventure, canRestart, loadSave, restartRun, writeSave, type SaveGame } from '../game/save'
import { cleanName, isBlocked, PRONOUN_CHOICES } from '../game/names'
import { track } from '../game/telemetry'
import { setReducedMotion, systemPrefersReducedMotion } from '../game/ui/motion'
import { applySkin, skinFromUrl, type KitSkin } from '../game/ui/skin'
import { announce, tabRowKeyDown, usePanel } from '../game/ui/a11y'
import './settings.css'

// Settings (GAME-DESIGN §4.7), tabbed paper sheet — reachable from the title gear and the
// in-world gear. Three tabs: ACCOUNT (who this explorer is — name/pronouns/ship are editable —
// plus preferences), CONTROLS (the real key map), and DANGER ZONE (Restart Adventure). Stored
// locally; there are no real accounts (the handle is a display name, not a login).

export type Settings = { mute: boolean; textSize: 's' | 'm' | 'l'; reducedMotion: boolean; skin: KitSkin }
const KEY = 'blhs_settings_v1'
const FALLBACK: Settings = { mute: false, textSize: 'm', reducedMotion: false, skin: 'paper' }

export function loadSettings(): Settings {
  /* THE MACHINE'S ANSWER IS THE FIRST ANSWER. A student who has already told
   * Chrome OS they want less motion has said it once; the toggle starts on for
   * them and they can still turn it off, which is the difference between a
   * default and an override. */
  const base: Settings = { ...FALLBACK, reducedMotion: systemPrefersReducedMotion() }
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } }
  catch { return base }
}

/* THREE ATTRIBUTES ON <html> AND ONE PLACE THAT WRITES THEM.
 *
 * `data-rm` used to be written here directly, so the stylesheets and
 * `ui/motion.ts` were two sources for one setting and disagreed whenever a
 * student's own Chromebook had already asked for less motion: the camera
 * shortened and the panels did not. It goes through `setReducedMotion` now, which
 * publishes the effective value, so what the CSS matches on is the boolean the
 * renderer reads.
 *
 * The skin comes off the URL first (`?skin=plain`), because the plain arm is
 * assigned rather than chosen and looking at it must not require a build. */
export function applySettings(s: Settings) {
  document.documentElement.dataset.textsize = s.textSize
  setReducedMotion(s.reducedMotion)
  applySkin(skinFromUrl(typeof location === 'undefined' ? '' : location.search) ?? s.skin ?? 'paper')
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
  const confirmRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (confirmRestart) confirmRef.current?.focus() }, [confirmRestart])

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
    if (v.length >= 2 && !isBlocked(v)) { edit({ handle: v }); setNameDraft(v); track('name_edited'); announce(`Name saved as ${v}`) }
    /* the field snapping back to the old name is the whole of the refusal on
     * screen, and it is silent to a reader, so it says so */
    else { setNameDraft(save?.handle ?? ''); announce('That name was not accepted. The old one is back.') }
  }
  const commitBoat = (raw: string) => {
    const v = cleanName(raw, 18).trim()
    if (v.length >= 2 && !isBlocked(v)) { edit({ boatName: v }); setBoatDraft(v); track('boat_renamed'); announce(`Ship renamed ${v}`) }
    else { setBoatDraft(save?.boatName ?? ''); announce('That ship name was not accepted. The old one is back.') }
  }

  const toggleFs = () => {
    const el = document.documentElement
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
    track('fullscreen_toggled', { on: !document.fullscreenElement })
  }

  /* Q14, THE ONE-RUN-PER-PARTICIPANT GUARD, and this button was the hole in it.
   *
   * §80.6 names the exact line: this control sits OUTSIDE the `isCaptain()` block
   * below, so a student could restart, type a new handle, and write a SECOND
   * participant row in the same class with an independently drawn arm. That is
   * not a save bug, it is a study defect: the two runs cannot be told apart in
   * the export afterwards, and the arm they carry is a coin flipped twice.
   *
   * A captain resetting a demo machine is a real need and keeps the override, and
   * the reset is counted rather than silent, so a class whose numbers do not add
   * up can be asked how many devices were reset. A student is told WHY in words
   * they can act on, which is "ask your teacher" and not "denied". */
  const captain = isCaptain()
  const verdict = canRestart()
  const restart = () => {
    track('adventure_restarted', { forced: captain && !verdict.allowed })
    restartRun(captain)
    location.href = '/'   // back to the title, which now shows Begin Adventure
  }

  const nameBad = nameDraft.trim().length > 0 && isBlocked(nameDraft)
  const boatBad = boatDraft.trim().length > 0 && isBlocked(boatDraft)

  const panel = usePanel({ label: 'Settings', onClose })
  const TABS: Tab[] = ['account', 'controls', 'danger']
  const TAB_NAMES: Record<Tab, string> = { account: 'Account', controls: 'Controls', danger: 'Danger Zone' }
  /* THE TAB IS A STATE SWAP AND IT IS SILENT. Nothing changes but the page under
   * the row, so a reader is told which page it now is. */
  const pickTab = (t: Tab) => { setTab(t); announce(`${TAB_NAMES[t]} settings`) }

  return (
    <div className="st-veil" onClick={onClose}>
      <div className="st-panel kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <div className="st-inner">
          <div className="st-tabs" role="tablist" aria-label="Settings sections">
            {TABS.map((t, i) => (
              <button
                key={t} role="tab" aria-selected={tab === t}
                className={`st-tab ${tab === t ? 'st-tab-on' : ''}`}
                onClick={() => pickTab(t)}
                onKeyDown={(e) => tabRowKeyDown(e, TABS, i, pickTab)}
              >{TAB_NAMES[t]}</button>
            ))}
          </div>

          <div className="st-page">
            {tab === 'account' && (
              <>
                {save ? (
                  <div className="st-idcard">
                    <label className="st-editrow">
                      <span className="st-idlabel">Name</span>
                      {/* THE REFUSAL IS READABLE ON FOCUS. The warning under a
                          rejected name was only ever a red line beside the field:
                          a reader landing in the box heard the label and nothing
                          about why what they typed was refused. */}
                      <input
                        className="st-idfield" value={nameDraft} placeholder="your deck name"
                        aria-invalid={nameBad} aria-describedby={nameBad ? 'st-warn-name' : undefined}
                        onChange={(e) => setNameDraft(cleanName(e.target.value))}
                        onBlur={(e) => commitName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </label>
                    {nameBad && <div className="st-fieldwarn" id="st-warn-name">The harbor master raised an eyebrow. Try another.</div>}

                    <div className="st-editrow">
                      <span className="st-idlabel" id="st-lbl-pronouns">Pronouns</span>
                      <button
                        className="st-idpick" aria-expanded={pickPronoun} aria-labelledby="st-lbl-pronouns"
                        onClick={() => setPickPronoun((v) => !v)}
                      >{save.pronouns || 'set'} ▾</button>
                    </div>
                    {pickPronoun && (
                      <div className="st-chips" role="group" aria-labelledby="st-lbl-pronouns">
                        {PRONOUN_CHOICES.map((c) => (
                          <button
                            key={c} className={`st-chip ${save.pronouns === c ? 'st-chip-on' : ''}`}
                            aria-pressed={save.pronouns === c}
                            onClick={() => { edit({ pronouns: c }); track('pronouns_edited'); setPickPronoun(false); announce(`Pronouns ${c}`) }}
                          >{c}</button>
                        ))}
                      </div>
                    )}

                    <label className="st-editrow">
                      <span className="st-idlabel">Ship</span>
                      <input
                        className="st-idfield" value={boatDraft} placeholder="her name"
                        aria-invalid={boatBad} aria-describedby={boatBad ? 'st-warn-boat' : undefined}
                        onChange={(e) => setBoatDraft(cleanName(e.target.value, 18))}
                        onBlur={(e) => commitBoat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </label>
                    {boatBad && <div className="st-fieldwarn" id="st-warn-boat">She would sink from embarrassment. Another.</div>}

                    {save.classCode && <div className="st-idrow"><span className="st-idlabel">Class</span><span className="st-idval">{save.classCode}</span></div>}
                    <div className="st-idrow"><span className="st-idlabel">Progress</span><span className="st-idval">{save.introDone ? `Year ${save.year}, ${save.season}` : 'Just started'}</span></div>
                  </div>
                ) : (
                  <div className="st-idcard st-idcard-empty">Begin your adventure to name your explorer and her ship.</div>
                )}

                <div className="st-prefhead" id="st-prefs">Preferences</div>
                {/* EVERY TOGGLE SAYS ITS STATE, not just shows it. `aria-pressed`
                    is what a reader announces; the green border is what an eye
                    sees, and §11.3 asks for both because one of them is a hue. */}
                <div className="st-row">
                  <span id="st-lbl-sound">Sound</span>
                  <button
                    className={`st-toggle ${s.mute ? '' : 'st-on'}`} aria-pressed={!s.mute} aria-labelledby="st-lbl-sound"
                    onClick={() => { const mute = !s.mute; setS({ ...s, mute }); announce(mute ? 'Sound muted' : 'Sound on') }}
                  >{s.mute ? 'muted' : 'on'}</button>
                </div>
                <div className="st-row">
                  <span id="st-lbl-text">Text size</span>
                  <div className="st-seg" role="group" aria-labelledby="st-lbl-text">
                    {(['s', 'm', 'l'] as const).map((k) => (
                      <button
                        key={k} className={`st-segbtn ${s.textSize === k ? 'st-on' : ''}`} aria-pressed={s.textSize === k}
                        aria-label={`Text size ${{ s: 'small', m: 'medium', l: 'large' }[k]}`}
                        onClick={() => { setS({ ...s, textSize: k }); announce(`Text size ${{ s: 'small', m: 'medium', l: 'large' }[k]}`) }}
                      >{k.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                <div className="st-row">
                  <span id="st-lbl-rm">Reduced motion</span>
                  <button
                    className={`st-toggle ${s.reducedMotion ? 'st-on' : ''}`} aria-pressed={s.reducedMotion} aria-labelledby="st-lbl-rm"
                    onClick={() => { const on = !s.reducedMotion; setS({ ...s, reducedMotion: on }); announce(on ? 'Reduced motion on' : 'Reduced motion off') }}
                  >{s.reducedMotion ? 'on' : 'off'}</button>
                </div>
                <div className="st-row">
                  <span id="st-lbl-fs">Fullscreen</span>
                  <button className={`st-toggle ${fs ? 'st-on' : ''}`} aria-pressed={fs} aria-labelledby="st-lbl-fs" onClick={toggleFs}>{fs ? 'on' : 'off'}</button>
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
                  <div className="st-dangerbody st-dangerbody-quiet">No voyage yet — nothing to erase.</div>
                ) : !verdict.allowed && !captain ? (
                  <div className="st-dangerbody st-dangerbody-quiet">{verdict.why}</div>
                ) : !confirmRestart ? (
                  <button className="st-dangerbtn" onClick={() => { setConfirmRestart(true); announce('Confirm: erase this voyage?') }}>Restart adventure</button>
                ) : (
                  /* FOCUS MOVES ON THE STATE SWAP. One button becomes two, and a
                     keyboard player was left focused on a button that no longer
                     exists, which lands focus on <body> and starts the next Tab
                     at the top of the sheet. */
                  <div className="st-confirmrow">
                    <button className="st-dangerbtn" ref={confirmRef} onClick={restart}>Yes, erase it all</button>
                    <button className="st-cancelbtn" onClick={() => setConfirmRestart(false)}>Keep my voyage</button>
                  </div>
                )}

                {isCaptain() && (
                  <div className="st-captain">
                    <div className="st-captain-head">⚓ Captain's tools</div>
                    <div className="st-captain-row">
                      {/* wipe here, then navigate WITHOUT ?fresh — leaving it armed in the
                          URL meant every later F5 silently wiped the run again */}
                      <button onClick={() => { beginAdventure(); location.href = '/?scene=beach' }}>Replay intro</button>
                      <button onClick={() => { writeSave({ beat: 'island:arrive', introDone: true }); location.href = '/?scene=islandmap' }}>Skip to island</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <button className="st-close kit-surface-plank" onClick={onClose}>Back to it</button>
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
