import { useEffect, useState } from 'react'
import { Handbook } from './Handbook'
import { SettingsPanel } from '../../app/SettingsPanel'
import { Planner } from '../planner/Planner'
import { CoreBeatRunner } from '../beats/ActivityRunner'
import { CORE_BEATS } from '../beats/beats'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'
import { track } from '../telemetry'
import { onUiRequest } from '../ui-bus'
import './hud.css'

// The diegetic HUD (§11.1): corner compass (the chart), the Handbook spine, and the
// season tokens while unspent. NOTHING else floats. Esc pauses (§4.8): the world blurs,
// a small anchor panel — saves happen anyway, the button is reassurance.
// The HUD is also the mount point every sit-down UI opens through: world code (any
// lane's POI or cutscene) calls requestUi('planner'|'handbook'|...) on the ui-bus and
// the HUD answers — the Maw's chart table opens the SAME planner the token pips do.

export function Hud({ onBlurWorld }: { onBlurWorld?: (b: boolean) => void }) {
  const nav = useNav()
  const [book, setBook] = useState<null | 'chart' | 'islands'>(null)
  const [planner, setPlanner] = useState(false)
  const [advisory, setAdvisory] = useState(false)
  const [paused, setPaused] = useState(false)
  const [settings, setSettings] = useState(false)
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const s = loadSave()

  const anyOpen = book !== null || planner || settings || advisory

  // Esc = pause, only while nothing else owns the frame (the planner eats its own Esc)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      if (book || settings) { setBook(null); setSettings(false); onBlurWorld?.(false); return }
      if (planner || advisory) return   // the sheet eats its own Esc; a beat never Esc-quits
      setPaused((p) => { onBlurWorld?.(!p); return !p })
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [book, settings, planner, onBlurWorld])

  // the ui-bus: the world's diegetic stations open these same panels (ui-bus.ts)
  useEffect(() => onUiRequest((which) => {
    setPaused(false)
    if (which === 'planner') { track('planner_requested', { via: 'world' }); setPlanner(true); onBlurWorld?.(true) }
    if (which === 'advisory') { setAdvisory(true); onBlurWorld?.(true) }
    if (which === 'handbook') { setBook('islands'); onBlurWorld?.(true) }
    if (which === 'chart') { track('chart_opened'); setBook('chart'); onBlurWorld?.(true) }
    if (which === 'settings') { setSettings(true) }
  }), [onBlurWorld])

  const openBook = (tab: 'chart' | 'islands') => { setPaused(false); setBook(tab); onBlurWorld?.(true) }
  const openPlanner = () => { setPaused(false); setPlanner(true); onBlurWorld?.(true) }
  const closeAll = () => { setBook(null); setPlanner(false); setAdvisory(false); setPaused(false); setSettings(false); onBlurWorld?.(false) }
  const yearBeat = CORE_BEATS[s?.year ?? 1]

  return (
    <>
      <div className="hud-stack">
        <button className="hud-btn" title="The chart" onClick={() => { track('chart_opened'); openBook('chart') }}>🧭</button>
        <button className="hud-btn" title="The Handbook" onClick={() => openBook('islands')}>📖</button>
        {s && s.introDone && (
          <button
            className="hud-tokenbtn hud-tokens" title="The year sheet — season tokens"
            onClick={openPlanner}
          >
            {s.tokens.length > 0
              ? s.tokens.map((t, i) => <span className="hud-token" key={t + i} />)
              : <span className="hud-token" style={{ opacity: .35 }} />}
          </button>
        )}
      </div>

      {book && <Handbook initialTab={book} onClose={closeAll} />}
      {planner && <Planner onClose={closeAll} onAdvisory={() => { setPlanner(false); setAdvisory(true) }} />}
      {advisory && yearBeat && <CoreBeatRunner beat={yearBeat} onClose={closeAll} />}
      {settings && <SettingsPanel onClose={() => { setSettings(false); setPaused(true) }} />}

      {paused && !anyOpen && (
        <div className="pz-veil" onClick={closeAll}>
          <div className="pz-panel" onClick={(e) => e.stopPropagation()}>
            <div className="pz-title">⚓ Dropped anchor</div>
            <button className="pz-btn" onClick={closeAll}>Back to it</button>
            {s?.introDone && <button className="pz-btn" onClick={openPlanner}>The Year Sheet</button>}
            <button className="pz-btn" onClick={() => { setPaused(false); setBook('islands'); }}>Handbook</button>
            <button className="pz-btn" onClick={() => { setPaused(false); setSettings(true) }}>Settings</button>
            <button className="pz-btn" onClick={() => { closeAll(); nav.go('title') }}>Save &amp; leave</button>
            <div style={{ fontFamily: 'Deckhand, monospace', fontSize: '3.2cqw', color: '#8a7a60' }}>
              your voyage saves itself
            </div>
          </div>
        </div>
      )}
    </>
  )
}
