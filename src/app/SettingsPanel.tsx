import { useEffect, useState } from 'react'
import { isCaptain } from '../game/captain'
import { beginAdventure, canRestart, loadSave, restartRun, writeSave, type SaveGame } from '../game/save'
import { cleanName, isBlocked, PRONOUN_CHOICES } from '../game/names'
import { track } from '../game/telemetry'
import { setReducedMotion, systemPrefersReducedMotion } from '../game/ui/motion'
import { wearAssignedSkin, type KitSkin } from '../game/ui/skin'
import { announce, tabRowKeyDown, usePanel } from '../game/ui/a11y'
import { Empty, Glyph, Plank, Tab } from '../game/ui/controls'
import { saved } from '../game/ui/feedback'
import { HOME_TARGET, SEA_ARRIVAL, searchFor } from '../game/pmap/route'
import './settings.css'

/* SETTINGS, PAUSE'S SECOND SHEET (§40.22 to §40.26), reachable from the title
 * plate and from the pause panel. Three tabs: ACCOUNT (who this explorer is, plus
 * the four preferences), CONTROLS (the key map with a pointer path beside every
 * row), and DANGER ZONE. Stored locally; there are no real accounts, and the
 * handle is a display name rather than a login.
 *
 * WHAT THIS SESSION REBUILT, AND THE MEASUREMENT BEHIND EACH ONE.
 *
 * THE GEAR WAS AN OPERATING SYSTEM GLYPH. A raw U+2699 inside a wooden square,
 * on the one control that is on screen for the whole title and the whole intro.
 * `docs/ART.md`: "Icons are drawn, never an emoji or a font glyph", and the
 * brief's do-not list says it again. The live `icon_set` has compass, key, star,
 * lock, tick, cross, arrow and coin and NO GEAR, so it cannot be drawn today, and
 * inventing a replacement character is the same offence in a different font. It
 * is a small carved plate reading "Settings" now: a word is legible at a glance,
 * it is a real trackpad target on a 1366x768 Chromebook, and the missing gear
 * face is reported as art the kit owes rather than papered over.
 *
 * THE ANCHOR ON "Captain's tools" IS GONE for the same reason and with a smaller
 * fix: it is a HEADING rather than a control, so the words carry it alone.
 *
 * THE SOUND SETTING IS A VOLUME AND NOT A SWITCH. §40.32 rules it: "a classroom
 * needs three states and not two: off, quiet enough for a room where every
 * machine is playing, and normal for headphones. A toggle cannot express the
 * middle one, and the middle one is the one a teacher will ask for." So the row
 * is three states. `mute` is still written beside it, because `src/game/audio.ts`
 * reads that key by name and this file does not own that one.
 *
 * `applySettings` RUNS AT IMPORT NOW. §40.26 names the wiring bug exactly: it was
 * called from the settings panel's own effect and from `TitleScene`'s mount
 * effect and nowhere else, so every `?scene=` deep link, which is every way a
 * painted map is ever opened, rendered with the student's stored text size
 * sitting in localStorage and no attribute on the document. One call at import,
 * the same shape `ui/skin.ts` already uses for the same reason.
 */

/** off, quiet enough for a room where every machine is playing, or normal */
export type SoundLevel = 'off' | 'quiet' | 'full'

export type Settings = {
  /** §40.32's three states. This is the control a teacher actually reaches for. */
  sound: SoundLevel
  /* KEPT, AND DERIVED. `audio.ts` reads `mute` straight out of this blob by
   * string key and deliberately does not import this file (its comment says
   * why), so the boolean stays and is written from the level rather than being a
   * second thing a student can set. */
  mute: boolean
  textSize: 's' | 'm' | 'l'
  reducedMotion: boolean
  skin: KitSkin
}
const KEY = 'blhs_settings_v1'
const FALLBACK: Settings = { sound: 'full', mute: false, textSize: 'm', reducedMotion: false, skin: 'paper' }

const SOUND_LEVELS: SoundLevel[] = ['off', 'quiet', 'full']
const SOUND_WORD: Record<SoundLevel, string> = { off: 'Off', quiet: 'Quiet', full: 'Full' }
const SOUND_SAID: Record<SoundLevel, string> = {
  off: 'Sound off',
  quiet: 'Sound quiet, for a room where every machine is playing',
  full: 'Sound full, for headphones',
}

export function loadSettings(): Settings {
  /* THE MACHINE'S ANSWER IS THE FIRST ANSWER. A student who has already told
   * Chrome OS they want less motion has said it once; the toggle starts on for
   * them and they can still turn it off, which is the difference between a
   * default and an override. */
  const base: Settings = { ...FALLBACK, reducedMotion: systemPrefersReducedMotion() }
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
    const s = { ...base, ...stored }
    /* A SAVE WRITTEN BEFORE THE THIRD STATE EXISTED still has to open on the
     * right one. The boolean is what those blobs carry, so the level is read
     * back off it rather than defaulting to Full and un-muting a student who
     * muted the game last week. */
    if (!stored.sound) s.sound = stored.mute ? 'off' : 'full'
    s.mute = s.sound === 'off'
    return s
  } catch { return base }
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
 * THE SKIN IS NOT A SETTING AND THIS IS WHERE THAT IS ENFORCED. It used to read
 * `?skin=` and then fall straight to the stored preference, so the ASSIGNED arm
 * lost to a blob in localStorage that no screen can write. `wearAssignedSkin`
 * owns the order now (URL, then the arm on the save, then this preference), and
 * it is the same function that runs at boot and on every write to the run, so
 * opening settings can no longer put a control-arm student back in the game
 * look. See `game/ui/skin.ts`. */
export function applySettings(s: Settings) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.textsize = s.textSize
  setReducedMotion(s.reducedMotion)
  wearAssignedSkin(s.skin)
}

/* §40.26, THE HALF THAT WAS NEVER WIRED. "`applySettings` is called from exactly
 * two places: the settings panel's own effect, and `TitleScene`'s mount effect. A
 * run that enters a scene without passing the title, which is every `?scene=` deep
 * link including the captain tools' own navigations, never applies the stored
 * preference at all." The fix the section asks for is "one call at boot", and this
 * is it: the module that owns the settings applies them the moment it is loaded,
 * exactly the way `ui/skin.ts` wears the assigned arm at import and for exactly
 * the same reason. Every scene in the game mounts either the HUD or the title, and
 * both reach this module. */
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
  /* THE CONFIRM BUTTON IS A PLANK NOW and a plank takes no ref, so focus is moved
     by id. The reason it is moved at all is unchanged: one button becomes two, and
     a keyboard player left focused on a button that no longer exists lands on
     <body> and starts the next Tab at the top of the sheet. */
  useEffect(() => { if (confirmRestart) document.getElementById('st-confirm-erase')?.focus() }, [confirmRestart])

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(s)); applySettings(s) }, [s])
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
  const TABS: Tabs[] = ['account', 'controls', 'danger']
  const TAB_NAMES: Record<Tabs, string> = { account: 'Account', controls: 'Controls', danger: 'Danger Zone' }
  /* THE TAB IS A STATE SWAP AND IT IS SILENT. Nothing changes but the page under
   * the row, so a reader is told which page it now is. */
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

          <div className="st-page">
            {tab === 'account' && (
              <>
                {save ? (
                  <div className="st-idcard">
                    <label className="st-editrow">
                      <span className="st-idlabel">Name</span>
                      {/* THE REFUSAL IS READABLE ON FOCUS. The warning under a
                          rejected name was only ever a coloured line beside the
                          field: a reader landing in the box heard the label and
                          nothing about why what they typed was refused. */}
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
                        /* THE NAME CARRIES THE VALUE. `aria-labelledby` pointed at
                           the word "Pronouns" alone, which OVERRIDES the button's
                           own text, so a reader heard the label and never heard
                           what the pronouns actually are. */
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
                    <div className="st-idrow"><span className="st-idlabel">Progress</span><span className="st-idval">{save.introDone ? `Year ${save.year}, ${save.season}` : 'Just started'}</span></div>
                  </div>
                ) : (
                  /* THE PANEL'S EMPTY STATE, TOLD THE WAY EVERY OTHER ONE IS
                     (§40.42). It used to be a sentence in a box that looked like a
                     card with nothing in it; the kit says what the page is and
                     what fills it, in one shape used everywhere. */
                  <Empty
                    what="You have not started a game yet."
                    fills="Begin your adventure and this page fills with your name, your pronouns and your boat."
                  />
                )}

                <div className="st-prefhead" id="st-prefs">Preferences</div>

                {/* SOUND IS THREE STATES (§40.32). Every one of them changes the
                    WORD as well as the mark, because §40.31 forbids a state
                    carried by hue alone and a Chromebook panel crushes both
                    lightness and saturation. */}
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
                {/* EVERY TOGGLE SAYS ITS STATE, not just shows it. `aria-pressed`
                    is what a reader announces, the WORD in the button is what an
                    eye reads, and the ring is the third signal. §11.3 asks for
                    more than one, because one of them is a hue. */}
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
                      {/* THE TWO PLACES THE ROAD GOES, and this used to be one button
                          onto `islandmap`, the tile map §3.0 ruled dead: a captain
                          checking "where does the game go after the beach" was shown
                          the wrong answer. `route.ts` spells both so this row and the
                          title cannot drift apart. */}
                      <Plank size="sm" onClick={() => { writeSave({ beat: 'sea:arrive', introDone: true }); location.href = `/?${searchFor(SEA_ARRIVAL, '')}` }}>Skip to sea</Plank>
                      <Plank size="sm" onClick={() => { writeSave({ beat: 'sea:arrive', introDone: true }); location.href = `/?${searchFor(HOME_TARGET, '')}` }}>Skip to the Maw</Plank>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <Plank className="st-close" onClick={onClose}>Back to the game</Plank>
        </div>
      </div>
    </div>
  )
}

/* ---- THE CONTROLS PAGE ----------------------------------------------------
 *
 * §40.24: "It is a picture of a key map rather than the key map. `CtrlRow` takes
 * label and key strings as props and the strings are typed into the JSX. Nothing
 * in this page reads what the scenes actually bind, so the page and the game
 * agree by hand, and the helm section describes a piloting scheme §9 has not
 * built yet."
 *
 * TWO OF THOSE THREE ARE FIXED HERE AND THE THIRD IS HONEST ABOUT ITSELF.
 *
 * 1. THE HELM SECTION NOW DESCRIBES THE HELM THAT EXISTS. It is read off
 *    `PmapScene.tsx:4191-4193`, which is where the tiller actually is: throttle
 *    on ArrowUp or W, turn on ArrowLeft/ArrowRight or A/D, full sail on Shift.
 *    The page used to list "slow, astern" on S, which that code does not bind.
 * 2. EVERY ROW CARRIES ITS POINTER PATH, which §40.24 asks for in as many words:
 *    "every action listed is a key, the note at the bottom points at two
 *    buttons, and §3.10's law says every key path needs a pointer path. A student
 *    on a trackpad reading this page learns that the game is played on a
 *    keyboard, which is not what the game intends."
 * 3. IT IS STILL A TABLE RATHER THAN A LIVE READ, and the reason is that there is
 *    no binding module to read: eleven scenes each spell `keys['w']` into their
 *    own tick loop. So every row names the FILE AND LINE its keys are read at,
 *    and this table is the one place a future session points those scenes at.
 *    That is not the same as being bound, and the report says so.
 *
 * The last row of the page is the one §40.24 says is missing and matters most: "a
 * student who is lost does not need to know that Shift sprints. They need to know
 * that the book in the corner says where to go."
 */
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

/* ---- THE CORNER CONTROL ----------------------------------------------------
 *
 * WAS `<button className="st-gear">U+2699</button>`, an operating-system glyph in a
 * wooden square, at 20 pixels, on the control that is on screen for the whole
 * title screen and the whole intro. Three separate rules forbid it: `docs/ART.md`
 * ("Icons are drawn, never an emoji or a font glyph"), Part IV Law 2 (every UI
 * element is drawn art), and the UI brief's do-not list ("Use a system glyph
 * anywhere").
 *
 * IT CANNOT BE DRAWN TODAY, and that is why it is a word instead of a different
 * picture. The live `icon_set` carries compass, key, star, lock, tick, cross,
 * arrow and coin, read off `/api/v1/ui`, and there is no gear on it. Substituting
 * some other face would be worse than either: a student would learn a mark that
 * means nothing.
 *
 * SO IT IS THE PLATE `plaque-small.png` WITH THE WORD ON IT. That art is a dark
 * carved 2:1 plate with a rope inlay, drawn for exactly this shape, and it is
 * already the ground under the HUD's own two corner controls, so the three read
 * as one family. A word is legible at a glance, it is a bigger trackpad target
 * than a 40 pixel square, and it needs no legend. The gear face stays an art gap
 * on the handoff rather than a hole in the screen. */
export function GearButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="st-gear" onClick={onClick}>
      {/* AND IT HAS A MARK NOW, drawn 2026-09-01 beside three others in one job.
          The word stays: a word is legible at a glance and needs no legend, and
          the mark is what makes it findable from the corner of the eye. It is
          two sliders rather than a cog, because the art-direction pass pointed
          out that a cog and the compass button two rows above it are the same
          silhouette at 24 pixels. */}
      <span className="st-gear-mark kit-mark kit-mark-sliders" aria-hidden="true" />
      <span className="st-gear-ink">Settings</span>
    </button>
  )
}
