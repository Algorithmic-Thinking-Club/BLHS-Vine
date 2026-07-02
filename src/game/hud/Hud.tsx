import { useEffect, useState } from 'react'
import { Handbook } from './Handbook'
import { SettingsPanel } from '../../app/SettingsPanel'
import { loadSave, subscribeSave } from '../save'
import { useNav } from '../../app/SceneManager'
import { track } from '../telemetry'
import './hud.css'

// The diegetic HUD (§11.1): corner compass (the chart), the Handbook spine, and the
// season tokens while unspent. NOTHING else floats. Esc pauses (§4.8): the world blurs,
// a small anchor panel — saves happen anyway, the button is reassurance.

export function Hud({ onBlurWorld }: { onBlurWorld?: (b: boolean) => void }) {
  const nav = useNav()
  const [book, setBook] = useState<null | 'chart' | 'islands'>(null)
  const [paused, setPaused] = useState(false)
  const [settings, setSettings] = useState(false)
  const [, bump] = useState(0)
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  const s = loadSave()

  // Esc = pause, only while nothing else owns the frame
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat) return
      if (book || settings) { setBook(null); setSettings(false); onBlurWorld?.(false); return }
      setPaused((p) => { onBlurWorld?.(!p); return !p })
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [book, settings, onBlurWorld])

  const openBook = (tab: 'chart' | 'islands') => { setPaused(false); setBook(tab); onBlurWorld?.(true) }
  const closeAll = () => { setBook(null); setPaused(false); setSettings(false); onBlurWorld?.(false) }

  return (
    <>
      <div className="hud-stack">
        <button className="hud-btn" title="The chart" onClick={() => { track('chart_opened'); openBook('chart') }}>🧭</button>
        <button className="hud-btn" title="The Handbook" onClick={() => openBook('islands')}>📖</button>
        {s && !s.tokens.length && null}
        {s && s.introDone && (
          <div className="hud-tokens" title="Season tokens — one voyage each">
            {s.tokens.map((t, i) => <span className="hud-token" key={t + i} />)}
          </div>
        )}
      </div>

      {book && <Handbook initialTab={book} onClose={closeAll} />}
      {settings && <SettingsPanel onClose={() => { setSettings(false); setPaused(true) }} />}

      {paused && !book && !settings && (
        <div className="pz-veil" onClick={closeAll}>
          <div className="pz-panel" onClick={(e) => e.stopPropagation()}>
            <div className="pz-title">⚓ Dropped anchor</div>
            <button className="pz-btn" onClick={closeAll}>Back to it</button>
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
