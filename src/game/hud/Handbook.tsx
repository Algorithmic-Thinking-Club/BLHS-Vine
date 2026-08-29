import { useEffect, useState } from 'react'
import { ISLANDS } from '../island/registry'
import { PLACES, programmesAt } from '../roster/roster'
import { loadSave, subscribeSave } from '../save'
import { cordsOf, gpaOf, letterOf } from '../progress'
import { FACTS } from '../../app/transitions'
import { track } from '../telemetry'
import './hud.css'

// THE HANDBOOK (GAME-DESIGN §8.5) — the in-world binder, Wiseman's reference made a
// keepsake. Tabs: Chart (the sea so far) / Islands (entries fill as they're played) /
// Cords (the live tracker board, real criteria verbatim) / Facts (every loading fact
// collected) / Badges. Everything reads the run + the island registry — zero grape
// islands is a valid, honest page ("the sea is young").

const BADGES = [
  { id: 'resident', icon: '🐋', name: 'Resident', how: 'Spot the orca on open water.' },
  { id: 'cartographer', icon: '🗺️', name: 'Cartographer', how: 'Discover every island on the chart.' },
  { id: 'early-bird', icon: '🌅', name: 'Early Bird', how: 'Finish a year with time to spare.' },
  { id: 'renaissance', icon: '🎭', name: 'Renaissance Panther', how: 'Spend a season in every category across one run.' },
  { id: 'loyal', icon: '⚓', name: 'Loyal', how: 'Reach Captain rank on any track.' },
  { id: 'bookworm', icon: '📖', name: 'Bookworm', how: 'Collect 25 handbook facts.' },
]

type Tab = 'chart' | 'islands' | 'cords' | 'facts' | 'badges'

export function Handbook({ onClose, initialTab = 'chart' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [, bump] = useState(0)
  useEffect(() => { track('handbook_opened', { tab: initialTab }); return subscribeSave(() => bump((v) => v + 1)) }, [initialTab])
  const s = loadSave()
  const gpa = s ? gpaOf(s) : null

  return (
    <div className="hb-veil" onClick={onClose}>
      <div className="hb-book" onClick={(e) => e.stopPropagation()}>
        <div className="hb-tabs">
          {(['chart', 'islands', 'cords', 'facts', 'badges'] as Tab[]).map((t) => (
            <button key={t} className={`hb-tab ${tab === t ? 'hb-tab-on' : ''}`} onClick={() => { setTab(t); track('handbook_entry_viewed', { tab: t }) }}>
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button className="hb-tab" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
        </div>

        <div className="hb-page">
          {tab === 'chart' && (
            <>
              <div className="hb-h">The sea so far</div>
              <div className="hb-chart">
                {ISLANDS.map((i) => (
                  <div key={i.id} className="hb-chart-isle" style={{
                    left: `${18 + (i.cx / 384) * 64}%`, top: `${24 + (i.cy / 384) * 52}%`,
                  }}>{i.label}</div>
                ))}
              </div>
              <div className="hb-dim" style={{ marginTop: '1.5cqw' }}>
                The chart inks itself as you sail. Pencil marks mean rumor; ink means you have been there.
              </div>
            </>
          )}

          {tab === 'islands' && (
            <>
              <div className="hb-h">Islands</div>
              {/* A PLACE IS NOT A PROGRAMME, and this is the one page a student can
                  see it. The stadium is one island and three things you can do there,
                  each with its own state, because finishing football is not finishing
                  track. This page used to index the completion record with a place id,
                  which is exactly the merge the roster exists to stop. */}
              {PLACES.map((p) => {
                const runs = programmesAt(p.id)
                return (
                  <div key={p.id}>
                    <div className="hb-row">
                      <span className="hb-row-title">{p.name}</span>
                      <span className="hb-dim">
                        {p.maps.length ? `${p.maps.length} painting${p.maps.length > 1 ? 's' : ''}` : 'not painted yet'}
                      </span>
                    </div>
                    {runs.map((g) => (
                      <div className="hb-row" key={g.id} style={{ paddingLeft: '2cqw' }}>
                        <span className="hb-dim">{g.name}</span>
                        <span className="hb-dim">{s?.islands[g.id] ?? 'misty'}</span>
                      </div>
                    ))}
                  </div>
                )
              })}
              <div className="hb-dim" style={{ marginTop: '2cqw' }}>
                The sea is young. Every island out there will be something Bonney Lake really offers,
                and new ones rise as they are built.
              </div>
            </>
          )}

          {tab === 'cords' && s && (
            <>
              <div className="hb-h">
                Cords &amp; seals
                {gpa !== null && <span className="hb-dim"> · GPA {gpa.toFixed(2)} ({letterOf(gpa)})</span>}
              </div>
              {cordsOf(s).map((c) => (
                <div className="hb-row" key={c.id}>
                  <span className="hb-row-title">
                    {c.name} <span className="hb-dim">({c.colors})</span>
                    <div className="hb-dim">{c.rule}</div>
                  </span>
                  {c.earned
                    ? <span className="hb-earned">EARNED</span>
                    : (
                      <span>
                        <div className="hb-cordbar"><span style={{ width: `${Math.round(c.progress * 100)}%` }} /></div>
                        <div className="hb-dim">{c.detail}</div>
                      </span>
                    )}
                </div>
              ))}
            </>
          )}
          {tab === 'cords' && !s && <div className="hb-dim">No voyage yet. The board fills once you set sail.</div>}

          {tab === 'facts' && (
            <>
              <div className="hb-h">Facts collected · {s?.facts.length ?? 0}</div>
              {(s?.facts ?? []).map((id) => {
                const f = FACTS.find((x) => x.id === id)
                return f ? <div className="hb-row" key={id}><span className="hb-row-title">{f.text}</span></div> : null
              })}
              {!(s?.facts.length) && <div className="hb-dim">Every loading tide teaches one true thing about Bonney Lake. They collect here.</div>}
            </>
          )}

          {tab === 'badges' && (
            <>
              <div className="hb-h">Badges</div>
              {BADGES.map((b) => {
                const on = s?.badges.includes(b.id)
                return (
                  <div className="hb-row" key={b.id}>
                    <span className={`hb-badgechip ${on ? 'on' : ''}`}>{b.icon}</span>
                    <span className="hb-row-title">{b.name}<div className="hb-dim">{b.how}</div></span>
                    {on && <span className="hb-earned">✓</span>}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
