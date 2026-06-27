import { useCallback, useEffect, useRef, useState } from 'react'
import './ui/ui.css'
import { Stage, type StageState } from './Stage'
import { Scene } from './Scene'
import { ZoneView } from './ZoneView'
import { Campus } from './Campus'
import { theme } from '../vine/theme'
import { createSession, applyResult, type SessionState } from '../vine/session'
import { Logger } from '../vine/logging'
import { GrapeHost } from '../vine/GrapeHost'
import { registerGrape, getGrape } from '../vine/registry'
import { atcGrape } from '../grapes/atc'
import type { GrapeResult, VineServices, PlayerView } from '../vine/contract'

registerGrape(atcGrape)

const TIPS = [
  'Walk up to any building and press E to step inside.',
  'Every island you explore adds to your end-of-day report card.',
  'The Performing Arts Center hosts the school plays and concerts.',
  'ATC is the Algorithmic Thinking Club. You are looking at what they build.',
  'Bonney Lake High opened in 2005. Go Panthers.',
]

type Phase = 'start' | 'play'

export default function Game() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const devAuto = params.has('dev')
  const showCampus = params.has('campus')
  const [phase, setPhase] = useState<Phase>('start')
  const [name, setName] = useState('')
  const [gender, setGender] = useState<PlayerView['gender']>('unspecified')

  const [session, setSession] = useState<SessionState | null>(null)
  const loggerRef = useRef<Logger | null>(null)
  const [ready, setReady] = useState(false)
  const [hud, setHud] = useState<StageState>({ district: 'Campus Grounds', near: null })
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [tip, setTip] = useState(0)

  useEffect(() => {
    if (phase !== 'play' || ready) return
    const t = setInterval(() => setTip((i) => (i + 1) % TIPS.length), 3200)
    return () => clearInterval(t)
  }, [phase, ready])

  const begin = useCallback(() => {
    const pid = 'p-' + Math.random().toString(36).slice(2, 9)
    const s = createSession({ sessionId: 'sess-' + Date.now(), participantId: pid, displayName: name.trim() || 'Thor', gender })
    loggerRef.current = new Logger({ appVersion: '0.0.0', sessionId: s.sessionId, participantId: s.participantId, mode: s.mode })
    setSession(s)
    setPhase('play')
  }, [name, gender])

  useEffect(() => {
    if (devAuto && phase === 'start') begin()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devAuto, phase])

  const onState = useCallback((s: StageState) => setHud(s), [])
  const onEnter = useCallback((id: string) => {
    setPlayingId(id)
    loggerRef.current?.log({ type: 'grape_enter', grapeId: id, at: Date.now() })
  }, [])

  const grape = playingId ? getGrape(playingId) : undefined
  const services: VineServices | null = grape && session
    ? {
        mode: session.mode,
        player: session.player,
        theme,
        log: (e) => loggerRef.current?.log(e),
        complete: (r: GrapeResult) => setSession((s) => (s ? applyResult(s, grape.manifest, r) : s)),
        exit: () => setPlayingId(null),
      }
    : null

  if (phase === 'start') {
    return (
      <div className="start">
        <div className="start-card panel">
          <div className="crest">🐾</div>
          <div className="eyebrow">Bonney Lake High School</div>
          <h1>Panther Pathways</h1>
          <p className="sub">An adventure through everything BLHS has to offer.</p>
          <div className="field">
            <label htmlFor="nm">What should we call you?</label>
            <input id="nm" value={name} placeholder="Thor" maxLength={18}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && begin()} />
          </div>
          <div className="field">
            <label>Pick your panther</label>
            <div className="choices">
              {(['boy', 'girl', 'unspecified'] as const).map((g) => (
                <button key={g} className={'choice' + (gender === g ? ' on' : '')} onClick={() => setGender(g)}>
                  {g === 'boy' ? 'He / him' : g === 'girl' ? 'She / her' : 'Just Thor'}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={begin}>Enter Campus</button>
        </div>
      </div>
    )
  }

  return (
    <>
      {session && (params.has('cv')
        ? <Campus onReady={() => setReady(true)} onState={onState} onEnter={onEnter} paused={playingId != null} />
        : showCampus
          ? <Stage playerName={session.player.displayName} onState={onState} onEnter={onEnter} onReady={() => setReady(true)} />
          : params.has('slice')
            ? <Scene onReady={() => setReady(true)} />
            : <ZoneView onReady={() => setReady(true)} />
      )}

      {/* loading veil */}
      <div className={'loading' + (ready || devAuto ? ' hide' : '')}>
        <div className="wrap">
          <div className="eyebrow">Loading campus</div>
          <h2>Welcome to Bonney Lake High</h2>
          <p className="tip">{TIPS[tip]}</p>
          <div className="stage-line"><div className="thor-walk" /></div>
          <div className="bar"><i /></div>
        </div>
      </div>

      {/* HUD */}
      {ready && session && (
        <>
          <div className="hud-tl panel">
            <div className="ava" />
            <div className="who">
              <div className="nm">{session.player.displayName}</div>
              <div className="dist">{hud.district}</div>
            </div>
            <div className="hud-stats">
              <div className="hud-stat gpa"><b>{session.player.gpa.toFixed(1)}</b><span>GPA</span></div>
              <div className="hud-stat"><b>{session.player.completedGrapeIds.length}</b><span>Explored</span></div>
            </div>
          </div>

          <div className="hud-help panel">
            <span className="key">W A S D</span> move
            <span className="key" style={{ marginLeft: 6 }}>E</span> enter
          </div>

          <div className={'prompt panel' + (hud.near && !playingId ? ' show' : '')}>
            <div className="info">
              <div className="ttl">{hud.near?.label ?? ''}</div>
              <div className="role">Press to step inside</div>
            </div>
            <div className="echip">E</div>
          </div>
        </>
      )}

      {/* grape modal: real grape if registered, else a clean template placeholder */}
      {playingId && (
        <div className="grape-scrim" onClick={(e) => { if (e.target === e.currentTarget) setPlayingId(null) }}>
          <div className="grape-frame">
            {grape && services
              ? <GrapeHost grape={grape} services={services} />
              : <ComingSoon id={playingId} label={hud.near?.label ?? playingId} onClose={() => setPlayingId(null)} />}
          </div>
        </div>
      )}
    </>
  )
}

// Template shown for any building whose grape an ATC member has not built yet. This is the
// "peakly designed placeholder" — it advertises the slot and the authoring pattern.
function ComingSoon({ id, label, onClose }: { id: string; label: string; onClose: () => void }) {
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div className="eyebrow">Island under construction</div>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: '8px 0 6px' }}>{label}</h1>
      <p style={{ color: 'var(--dim)', maxWidth: 460, margin: '0 auto 22px', lineHeight: 1.5 }}>
        This island does not have its grape yet. An ATC member will build it against the vine: a short
        intro, a clip, a quiz, and a scored outcome that feeds your report card. The slot is wired and
        waiting (grape id <code style={{ color: 'var(--teal)' }}>{id}</code>).
      </p>
      <button className="btn" onClick={onClose}>Back to campus</button>
    </div>
  )
}
