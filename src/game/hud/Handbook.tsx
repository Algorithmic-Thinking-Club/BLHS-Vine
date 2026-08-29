import { useEffect, useState } from 'react'
/* THE CHART READS THE COMPOSITION NOW. It used to read `ISLANDS` from
 * `src/game/island/registry.ts`, the tile-era registry, which holds one entry
 * whose coordinates are commented `tile-space center` for a map the game loads
 * under a different id. That was AUTHORING §12's missing world composition
 * document being stood in for by a constant, and there is one source of truth
 * for where a map is now. */
import { Chart } from '../world/Chart'
import { PLACES, programmesAt } from '../roster/roster'
import { loadSave, subscribeSave } from '../save'
import { cordsOf, gpaOf, letterOf, NO_ATHLETIC_CORD } from '../progress'
import { factById } from '../facts'
import { track } from '../telemetry'
import { announce, tabRowKeyDown, usePanel } from '../ui/a11y'
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

const TABS: Tab[] = ['chart', 'islands', 'cords', 'facts', 'badges']

export function Handbook({ onClose, initialTab = 'chart' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [, bump] = useState(0)
  useEffect(() => { track('handbook_opened', { tab: initialTab }); return subscribeSave(() => bump((v) => v + 1)) }, [initialTab])
  const s = loadSave()
  const gpa = s ? gpaOf(s) : null
  /* THE BINDER IS A PANEL AND NOW BEHAVES LIKE ONE: focus goes in, Tab stays in,
   * Escape closes this one and not the pause sheet underneath it, and the game
   * behind it is inert rather than merely covered. */
  const panel = usePanel({ label: 'The Handbook', onClose })
  const pick = (t: Tab) => { setTab(t); track('handbook_entry_viewed', { tab: t }); announce(`${t[0].toUpperCase() + t.slice(1)} page`) }

  return (
    <div className="hb-veil" onClick={onClose}>
      <div className="hb-book kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <div className="hb-tabs" role="tablist" aria-label="Handbook pages">
          {TABS.map((t, i) => (
            <button
              key={t} role="tab" aria-selected={tab === t}
              className={`hb-tab ${tab === t ? 'hb-tab-on' : ''}`}
              onClick={() => pick(t)}
              onKeyDown={(e) => tabRowKeyDown(e, TABS, i, pick)}
            >
              {t[0].toUpperCase() + t.slice(1)}
            </button>
          ))}
          <button className="hb-tab" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
        </div>

        <div className="hb-page">
          {tab === 'chart' && <Chart />}

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
              {/* THE SCHOOL'S WORDS, THEN THE GAME'S, AND NEVER ONE AS THE OTHER (V3).
                  `rule` is verbatim from docs/blhs/awards.md and is the criterion. `model`
                  is what this game actually counts, and it is printed underneath, marked,
                  because a mechanic that approximates a criterion is never the criterion.
                  An award whose criteria nobody has published says so in the same place. */}
              {cordsOf(s).map((c) => (
                <div className="hb-row" key={c.id}>
                  <span className="hb-row-title">
                    {c.name} <span className="hb-dim">({c.colors})</span>
                    <div className="hb-dim">{c.published ? c.rule : `${c.rule} No criteria to show.`}</div>
                    {c.model && <div className="hb-dim">In this game: {c.model}</div>}
                    <div className="hb-dim">{c.source}</div>
                  </span>
                  {c.earned
                    ? <span className="hb-earned">EARNED</span>
                    : c.published
                      ? (
                        <span>
                          <div className="hb-cordbar"><span style={{ width: `${Math.round(c.progress * 100)}%` }} /></div>
                          <div className="hb-dim">{c.detail}</div>
                        </span>
                      )
                      : <span className="hb-dim">{c.detail}</span>}
                </div>
              ))}
              <div className="hb-dim" style={{ marginTop: '2cqw' }}>{NO_ATHLETIC_CORD}</div>
            </>
          )}
          {tab === 'cords' && !s && <div className="hb-dim">No voyage yet. The board fills once you set sail.</div>}

          {tab === 'facts' && (
            <>
              <div className="hb-h">Facts collected · {s?.facts.length ?? 0}</div>
              {(s?.facts ?? []).map((id) => {
                const f = factById(id)
                /* THE SOURCE IS ON THE PAGE. A binder of true things about a real
                   school that cannot say where any of them came from is a binder
                   of claims, and a student can and should be able to check one. */
                return f ? (
                  <div className="hb-row" key={id}>
                    <span className="hb-row-title">{f.text}</span>
                    <span className="hb-dim">{f.source} · checked {f.checked}</span>
                  </div>
                ) : null
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
