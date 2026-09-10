import { useEffect, useState } from 'react'
import { isCaptain } from '../game/captain'
import { beginAdventure, canRestart, loadSave, restartRun, writeSave, type SaveGame } from '../game/save'
import { cleanName, isBlocked, PRONOUN_CHOICES } from '../game/names'
import { track } from '../game/telemetry'
import { setReducedMotion, systemPrefersReducedMotion } from '../game/ui/motion'
import { wearAssignedSkin, type KitSkin } from '../game/ui/skin'
import { announce, tabRowKeyDown, usePanel } from '../game/ui/a11y'
import { Empty, Glyph, Plank, Scroller, Tab } from '../game/ui/controls'
import { saved } from '../game/ui/feedback'
import { HOME_TARGET, SEA_ARRIVAL, searchFor } from '../game/pmap/route'
import './settings.css'
import { runLine } from '../game/run/year'

/* the settings sheet: who this explorer is, the preferences, the key map and the danger zone */

/** off, quiet enough for a room where every machine is playing, or normal */
export type SoundLevel = 'off' | 'quiet' | 'full'

export type Settings = {
  /** §40.32's three states. This is the control a teacher actually reaches for. */
  sound: SoundLevel
  /* kept because audio.ts reads `mute` by name, and written from the level */
  mute: boolean
  textSize: 's' | 'm' | 'l'
  reducedMotion: boolean
  skin: KitSkin
  /* ---- CLICKING THE FLOOR WALKS HIM (Ash, 2026-09-09) ------------------
   *
   * *"Click to move. This is a slight problem. In the help button, make this a
   * toggle, to activate click to move. Right now it's just on by default."*
   *
   * OFF unless it is asked for, which is what "a toggle to activate it" means.
   * A student who clicks a station still gets the station: that is a tap on a
   * THING and it is not this. This is only the bare floor, which was walking
   * him away from what he was reading. */
  clickToMove: boolean
}
const KEY = 'blhs_settings_v1'
/* sound opens on off, matching what the speakers are actually doing */
const FALLBACK: Settings = {
  sound: 'off', mute: true, textSize: 'm', reducedMotion: false, skin: 'paper',
  clickToMove: false,
}

const SOUND_LEVELS: SoundLevel[] = ['off', 'quiet', 'full']
const SOUND_WORD: Record<SoundLevel, string> = { off: 'Off', quiet: 'Quiet', full: 'Full' }
const SOUND_SAID: Record<SoundLevel, string> = {
  off: 'Sound off',
  quiet: 'Sound quiet, for a room where every machine is playing',
  full: 'Sound full, for headphones',
}

export function loadSettings(): Settings {
    /* the machine's own reduced-motion answer is the default, which a student can override */
  const base: Settings = { ...FALLBACK, reducedMotion: systemPrefersReducedMotion() }
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    const s = { ...base, ...stored }
    /* an older save carries only the boolean, so the level is read back off it */
    if (!stored.sound) s.sound = stored.mute === false ? 'full' : 'off'
    s.mute = s.sound === 'off'
    return s
  } catch { return base }
}

/* the three attributes on <html>, written here and nowhere else */
/* WRITTEN IN ONE PLACE (Ash, 2026-09-09). The panel used to be the only thing
 * that stored settings, so it wrote the key inline; the help card's click-to-move
 * switch is a second writer and two `localStorage.setItem(KEY, ...)` calls is one
 * misspelling away from a setting that saves and never loads. */
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* a locked-down browser still plays */ }
}

export function applySettings(s: Settings) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.textsize = s.textSize
  setReducedMotion(s.reducedMotion)
  wearAssignedSkin(s.skin)
}

/* applied at import, so a deep link into any scene still gets the stored preferences */
if (typeof document !== 'undefined') applySettings(loadSettings())

type Tabs = 'account' | 'controls' | 'danger'

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<Settings>(loadSettings)
  const [tab, setTab] = useState<Tabs>('account')
  const [confirmRestart, setConfirmRestart] = useState(false)
  const [save, setSave] = useState<SaveGame | null>(loadSave)
  const [pickPronoun, setPickPronoun] = useState(false)
  const [fs, setFs] = useState(!!document.fullscreenElement)
  // local drafts so the fields never persist junk mid-type, committed on blur/Enter (§4.7)
  const [nameDraft, setNameDraft] = useState(save?.handle ?? '')
  const [boatDraft, setBoatDraft] = useState(save?.boatName ?? '')
  /* focus is moved by id, so a keyboard player is not left on a button that has gone */
  useEffect(() => { if (confirmRestart) document.getElementById('st-confirm-erase')?.focus() }, [confirmRestart])

  useEffect(() => { saveSettings(s); applySettings(s) }, [s])
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // identity edits write straight to the run: handle/pronouns/boat are display fields set the
  // same way the intro set them (not graded state, so no domain verb, just writeSave)
  const edit = (patch: Partial<SaveGame>) => setSave(writeSave(patch))
  // commit reads the field's own value (robust to render timing), cleans, and rejects
  // empty/blocked by snapping back to the saved name: a student cannot wipe their name to blank
  const commitName = (raw: string) => {
    const v = cleanName(raw).trim()
    if (v.length >= 2 && !isBlocked(v)) {
      edit({ handle: v }); setNameDraft(v); track('name_edited')
      /* the kit's one stamp rather than this panel's own opinion of what saving
         looks like (`ui/feedback.ts`), and it announces itself on the way past */
      saved(`Name saved as ${v}`)
    }
    /* the field snapping back to the old name is the whole of the refusal on
     * screen, and it is silent to a reader, so it says so */
    else { setNameDraft(save?.handle ?? ''); announce('That name was not accepted. The old one is back.') }
  }
  const commitBoat = (raw: string) => {
    const v = cleanName(raw, 18).trim()
    if (v.length >= 2 && !isBlocked(v)) { edit({ boatName: v }); setBoatDraft(v); track('boat_renamed'); saved(`Boat renamed ${v}`) }
    else { setBoatDraft(save?.boatName ?? ''); announce('That boat name was not accepted. The old one is back.') }
  }

  const toggleFs = () => {
    const el = document.documentElement
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else el.requestFullscreen?.().catch(() => {})
    track('fullscreen_toggled', { on: !document.fullscreenElement })
  }

  const setSound = (level: SoundLevel) => {
    setS({ ...s, sound: level, mute: level === 'off' })
    track('settings_changed', { setting: 'sound', value: level })
    announce(SOUND_SAID[level])
  }

  /* restarting is captain-only, because a second run would write a second participant row */
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
  const TABS: Tabs[] = ['account', 'controls', 'danger']
  const TAB_NAMES: Record<Tabs, string> = { account: 'Account', controls: 'Controls', danger: 'Danger Zone' }
  /* THE TAB IS A STATE SWAP AND IT IS SILENT. Nothing changes but the page under
   * the row, so a reader is told which page it now is. */
  /* a new tab starts at its top: the page is one scroller for all three, so
   * without this the Controls tab opened wherever Account had been scrolled to */
  const pickTab = (t: Tabs) => { setTab(t); announce(`${TAB_NAMES[t]} settings`) }

  return (
    <div className="st-veil" onClick={onClose}>
      <div className="st-panel kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <div className="st-inner">
          <div className="st-tabs kit-tabrow" role="tablist" aria-label="Settings sections">
            {TABS.map((t, i) => (
              <Tab
                key={t}
                active={tab === t}
                className="st-tab"
                onClick={() => pickTab(t)}
                onKeyDown={(e) => tabRowKeyDown(e, TABS, i, pickTab)}
              >{TAB_NAMES[t]}</Tab>
            ))}
          </div>

          <Scroller className="st-page" key={tab}>
            {tab === 'account' && (
              <>
                {save ? (
                  <div className="st-idcard">
                    <label className="st-editrow">
                      <span className="st-idlabel">Name</span>
                      {/* the refusal is readable on focus, not only beside the field */}
                      <input
                        className="st-idfield" value={nameDraft} placeholder="your name"
                        aria-invalid={nameBad} aria-describedby={nameBad ? 'st-warn-name' : undefined}
                        onChange={(e) => setNameDraft(cleanName(e.target.value))}
                        onBlur={(e) => commitName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </label>
                    {nameBad && <div className="st-fieldwarn" id="st-warn-name" role="alert">That name will not work. Try another.</div>}

                    <div className="st-editrow">
                      <span className="st-idlabel" id="st-lbl-pronouns">Pronouns</span>
                      <button
                        /* the button's own text is the value, so the label must not override it */
                        className="st-idpick" aria-expanded={pickPronoun}
                        aria-label={`Pronouns, ${save.pronouns || 'not set'}. Choose.`}
                        onClick={() => setPickPronoun((v) => !v)}
                      >
                        <span className="st-idpick-ink">{save.pronouns || 'Not set'}</span>
                        {/* WAS A U+25BE. The drawn `pointer` sheet has a chevron
                            and this is what it is for; the fallback is a shape
                            the token layer draws, never another character. */}
                        <Glyph
                          piece="pointer" face="chevron" size={12} className="st-idpick-mark"
                          fallback={<span className="st-caretmark" aria-hidden="true" />}
                        />
                      </button>
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
                      <span className="st-idlabel">Boat</span>
                      <input
                        className="st-idfield" value={boatDraft} placeholder="your boat's name"
                        aria-invalid={boatBad} aria-describedby={boatBad ? 'st-warn-boat' : undefined}
                        onChange={(e) => setBoatDraft(cleanName(e.target.value, 18))}
                        onBlur={(e) => commitBoat(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      />
                    </label>
                    {boatBad && <div className="st-fieldwarn" id="st-warn-boat" role="alert">That boat name will not work. Try another.</div>}

                    {save.classCode && <div className="st-idrow"><span className="st-idlabel">Class</span><span className="st-idval">{save.classCode}</span></div>}
                    <div className="st-idrow"><span className="st-idlabel">Progress</span><span className="st-idval">{runLine(save)}</span></div>
                  </div>
                ) : (
                  /* the panel's empty state, in the same shape every other one uses */
                  <Empty
                    what="You have not started a game yet."
                    fills="Begin your adventure and this page fills with your name, your pronouns and your boat."
                  />
                )}

                <div className="st-prefhead" id="st-prefs">Preferences</div>

                {/* sound is three states, and each one changes the word as well as the mark */}
                <div className="st-row">
                  <span id="st-lbl-sound">Sound</span>
                  <div className="st-level" role="group" aria-labelledby="st-lbl-sound">
                    {SOUND_LEVELS.map((k) => (
                      <button
                        key={k}
                        className={`st-levelbtn ${s.sound === k ? 'st-on' : ''}`}
                        aria-pressed={s.sound === k}
                        aria-label={SOUND_SAID[k]}
                        onClick={() => setSound(k)}
                      >{SOUND_WORD[k]}</button>
                    ))}
                  </div>
                </div>
                <div className="st-rownote">Quiet is for a room where every machine is playing. Full is for headphones.</div>

                <div className="st-row">
                  <span id="st-lbl-text">Text size</span>
                  <div className="st-seg" role="group" aria-labelledby="st-lbl-text">
                    {(['s', 'm', 'l'] as const).map((k) => (
                      <button
                        key={k} className={`st-segbtn ${s.textSize === k ? 'st-on' : ''}`} aria-pressed={s.textSize === k}
                        aria-label={`Text size ${{ s: 'small', m: 'medium', l: 'large' }[k]}`}
                        onClick={() => {
                          setS({ ...s, textSize: k })
                          track('settings_changed', { setting: 'textSize', value: k })
                          announce(`Text size ${{ s: 'small', m: 'medium', l: 'large' }[k]}`)
                        }}
                      >{k.toUpperCase()}</button>
                    ))}
                  </div>
                </div>
                {/* every toggle says its state in words as well as showing it */}
                <div className="st-row">
                  <span id="st-lbl-rm">Reduced motion</span>
                  <button
                    className={`st-toggle ${s.reducedMotion ? 'st-on' : ''}`} aria-pressed={s.reducedMotion} aria-labelledby="st-lbl-rm"
                    onClick={() => {
                      const on = !s.reducedMotion
                      setS({ ...s, reducedMotion: on })
                      track('settings_changed', { setting: 'reducedMotion', value: on })
                      announce(on ? 'Reduced motion on' : 'Reduced motion off')
                    }}
                  >{s.reducedMotion ? 'on' : 'off'}</button>
                </div>
                <div className="st-row">
                  <span id="st-lbl-fs">Fullscreen</span>
                  <button className={`st-toggle ${fs ? 'st-on' : ''}`} aria-pressed={fs} aria-labelledby="st-lbl-fs" onClick={toggleFs}>{fs ? 'on' : 'off'}</button>
                </div>
                <div className="st-about">Your real name never leaves the room; play data is anonymous.</div>
              </>
            )}

            {tab === 'controls' && <ControlsPage />}

            {tab === 'danger' && (
              <>
                <div className="st-dangerhead">Restart adventure</div>
                <div className="st-dangerbody">
                  This erases your saved game on this device: your name, your boat and every
                  year of progress. You start over at Begin Adventure. It cannot be undone.
                </div>
                {!save ? (
                  <div className="st-dangerbody st-dangerbody-quiet">No saved game yet, so there is nothing to erase.</div>
                ) : !verdict.allowed && !captain ? (
                  <div className="st-dangerbody st-dangerbody-quiet">{verdict.why}</div>
                ) : !confirmRestart ? (
                  <Plank className="st-dangerplank" onClick={() => { setConfirmRestart(true); announce('Confirm: erase this saved game?') }}>
                    Restart adventure
                  </Plank>
                ) : (
                  <div className="st-confirmrow">
                    <Plank className="st-dangerplank" id="st-confirm-erase" onClick={restart}>Yes, erase it all</Plank>
                    <Plank onClick={() => setConfirmRestart(false)}>Keep my game</Plank>
                  </div>
                )}

                {isCaptain() && (
                  /* THE ANCHOR IS GONE. It was a raw U+2693 in front of these two
                     words, which is a font glyph on a heading, and a heading needs
                     no mark at all: the words are the whole of it. */
                  <div className="st-captain">
                    <div className="st-captain-head">Teacher tools</div>
                    <div className="st-captain-row">
                      {/* wipe here, then navigate WITHOUT ?fresh: leaving it armed in the
                          URL meant every later F5 silently wiped the run again */}
                      <Plank size="sm" onClick={() => { beginAdventure(); location.href = '/?scene=beach' }}>Replay intro</Plank>
                      {/* the two places the road goes, spelled once in route.ts */}
                      <Plank size="sm" onClick={() => { writeSave({ beat: 'sea:arrive', introDone: true }); location.href = `/?${searchFor(SEA_ARRIVAL, '')}` }}>Skip to sea</Plank>
                      <Plank size="sm" onClick={() => { writeSave({ beat: 'sea:arrive', introDone: true }); location.href = `/?${searchFor(HOME_TARGET, '')}` }}>Skip to the Maw</Plank>
                    </div>
                  </div>
                )}
              </>
            )}
          </Scroller>

          <Plank className="st-close" onClick={onClose}>Back to the game</Plank>
        </div>
      </div>
    </div>
  )
}

/* ---- the controls page: every key, its pointer path, and the file the key is read in */
type Binding = {
  /** what the student is trying to do */
  what: string
  keys: string[]
  /** the same action, said another way, as words rather than as arrow glyphs */
  alt?: string[]
  /** the pointer path for the same action, or null where there is not one yet */
  pointer: string | null
  /** where the binding is really read, so this page can be checked against it */
  where: string
}

const ON_FOOT: Binding[] = [
  { what: 'Walk', keys: ['W', 'A', 'S', 'D'], alt: ['Arrow keys'], pointer: 'on an island, click where you want to go', where: 'pmap/walk.ts step()' },
  { what: 'Sprint on the beach', keys: ['Shift'], pointer: null, where: 'BeachIso.tsx sprinting' },
  { what: 'Jump on the beach', keys: ['Space'], pointer: null, where: 'BeachIso.tsx jumpQueued' },
  { what: 'Use what you are standing at', keys: ['E'], pointer: 'tap the sign that appears, or click the thing itself from anywhere', where: 'PmapScene.tsx prompt pointertap' },
]
const AT_THE_HELM: Binding[] = [
  { what: 'Sail ahead', keys: ['W'], alt: ['Up arrow'], pointer: null, where: 'PmapScene.tsx throttle' },
  { what: 'Steer', keys: ['A', 'D'], alt: ['Left and right arrows'], pointer: null, where: 'PmapScene.tsx turn' },
  { what: 'Full sail', keys: ['Shift'], pointer: null, where: 'PmapScene.tsx fullSail' },
  { what: 'Dock the boat', keys: ['E'], pointer: 'tap the sign that appears', where: 'PmapScene.tsx seaTap' },
]
const ANYWHERE: Binding[] = [
  { what: 'Pause', keys: ['Esc'], pointer: null, where: 'hud/Hud.tsx Escape' },
  { what: 'Open the chart', keys: [], pointer: 'the Chart button at the top left', where: 'hud/Hud.tsx openBook' },
  { what: 'Open the Handbook', keys: [], pointer: 'the Handbook button at the top left', where: 'hud/Hud.tsx openBook' },
  { what: 'Open settings', keys: [], pointer: 'press Esc, then Settings', where: 'app/SettingsPanel.tsx GearButton' },
]

function ControlsPage() {
  return (
    <div className="st-controls">
      <div className="st-ctrlsec">On foot</div>
      {ON_FOOT.map((b) => <CtrlRow key={b.what} b={b} />)}

      <div className="st-ctrlsec">On the boat</div>
      {AT_THE_HELM.map((b) => <CtrlRow key={b.what} b={b} />)}

      <div className="st-ctrlsec">Anywhere</div>
      {ANYWHERE.map((b) => <CtrlRow key={b.what} b={b} />)}

      <div className="st-ctrlnote">
        Lost? The line above your head says what to do next, and the arrow in the room
        points at it. Nothing in this game is on a timer.
      </div>
    </div>
  )
}

/** one control line: an action, the real key or keys that drive it, and the
 *  pointer path that does the same thing where there is one */
function CtrlRow({ b }: { b: Binding }) {
  return (
    <div className="st-ctrl-row">
      <span className="st-ctrl-label">{b.what}</span>
      <span className="st-ctrl-keys">
        {b.keys.map((k) => <span className="st-key" key={k}>{k}</span>)}
        {b.alt && <><span className="st-ctrl-or">or</span>{b.alt.map((k) => <span className="st-key" key={'a' + k}>{k}</span>)}</>}
        {b.pointer && (
          <span className="st-ctrl-pointer">
            {b.keys.length ? 'or ' : ''}{b.pointer}
          </span>
        )}
      </span>
    </div>
  )
}

/* ---- the corner control: a carved plate reading Settings, since no gear face is drawn yet */
export function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="st-gear" onClick={onClick}>
      {/* the word plus a drawn mark, so it is findable from the corner of the eye */}
      <span className="st-gear-mark kit-mark kit-mark-sliders" aria-hidden="true" />
      <span className="st-gear-ink">Settings</span>
    </button>
  )
}
