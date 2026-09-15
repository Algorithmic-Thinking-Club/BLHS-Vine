import { useEffect, useState } from 'react'
/* the chart reads the world composition, which is the one source of truth for where a map is */
import { Chart } from '../world/Chart'
import { PLACES, programmesAt } from '../roster/roster'
import { loadSave, subscribeSave, type IslandState } from '../save'
import { cordsOf, gpaOf, letterOf, NO_ATHLETIC_CORD } from '../progress'
import { factById } from '../facts'
import { badgesOf, FACT_POOL } from '../badges'
import { track } from '../telemetry'
import { announce, tabRowKeyDown, usePanel } from '../ui/a11y'
import { Chip, Empty, Gauge, Glyph, Plank, Scroller, Tab } from '../ui/controls'
import { DIRECTORY, directoryCount } from './directory'
import './hud.css'
import './directory.css'
import { runLine } from '../run/year'
import { firstLook, markLooked, type Plaque } from './first-look'
import './handbook.css'

/* the Handbook, which is the inventory: facts, badges and the record of what a student did */

/* what each island state is called, in words a student reads */
const ISLAND_WORD: Record<IslandState, string> = {
  misty: 'you have not been here',
  discovered: 'you have been past',
  available: 'you can sign up here',
  active: 'you started this',
  completed: 'you finished this',
}

/* and the drawn mark beside the word, for the three states that have one */
const ISLAND_MARK: Partial<Record<IslandState, string>> = {
  available: 'arrow',
  active: 'star',
  completed: 'tick',
}

/* the badges page: the criterion as the game states it, with the real count beside it */
/* the three things a badge card can be: earned, not yet, or not open yet */
type BadgeState = 'earned' | 'waiting' | 'unbuilt'

const BADGE_WORD: Record<BadgeState, string> = {
  earned: 'Earned',
  waiting: 'Not yet',
  unbuilt: 'Not open yet',
}

const BADGE_PLATE: Record<BadgeState, 'plate' | 'plate_lit' | 'plate_spent'> = {
  earned: 'plate_lit',
  waiting: 'plate',
  unbuilt: 'plate_spent',
}

/* reads a check mark in a data string back as the word it stands for */
const wordsOnly = (s: string): string => s.replace(/✓/g, 'done')

export type Tab = 'school' | 'chart' | 'islands' | 'cords' | 'facts' | 'badges'

/* the directory is the first page the binder opens on */
const TABS: Tab[] = ['school', 'chart', 'islands', 'cords', 'facts', 'badges']

const TAB_WORD: Record<Tab, string> = {
  school: 'Bonney Lake',
  chart: 'Chart',
  islands: 'Islands',
  cords: 'Cords',
  facts: 'Facts',
  badges: 'Badges',
}

export function Handbook({ onClose, initialTab = 'school' }: { onClose: () => void; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [, bump] = useState(0)
  useEffect(() => { track('handbook_opened', { tab: initialTab }); return subscribeSave(() => bump((v) => v + 1)) }, [initialTab])
  const s = loadSave()
  const gpa = s ? gpaOf(s) : null
  /* the binder is a panel: focus goes in, Tab stays in, Escape closes this one and not the pause sheet underneath, and the game behind it is inert rather than merely covered */
  const panel = usePanel({ label: 'The Handbook', onClose })
  const pick = (t: Tab) => { setTab(t); track('handbook_entry_viewed', { tab: t }); announce(`${TAB_WORD[t]} page`) }

  /** what this run has collected, which two pages count against the same pool */
  const facts = s?.facts ?? []

  /* which plaque opened this, because `Guide` lands on the school page and `Map` lands on the chart, so the line to say turns on where the student came in and not on which tab shows now */
  const cameFrom: Plaque = initialTab === 'chart' ? 'map' : 'guide'
  const [told] = useState(() => firstLook(cameFrom))
  useEffect(() => { markLooked(cameFrom) }, [cameFrom])

  return (
    <div className="hb-veil" onClick={onClose}>
      <div className="hb-book kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <header className="hb-head">
          {/* the school's own mark, which docs/ART.md puts on the Handbook cover */}
          <span className="hb-crest" aria-hidden="true" />
          <div className="hb-titles">
            <h2 className="hb-title">The Handbook</h2>
            {/* the run's own line, which appears only once the game has granted what it is about */}
            {s && (
              <p className="hb-run">
                {s.handle ? `${s.handle} · ` : ''}{runLine(s)}
                {gpa !== null && ` · GPA ${gpa.toFixed(2)} (${letterOf(gpa)})`}
              </p>
            )}
          </div>
        </header>

        {/* what this page is, said the first time it is opened */}
        {told && <p className="hb-firstlook">{told}</p>}

        <div className="hb-bar">
          <div className="kit-tabrow hb-tabs" role="tablist" aria-label="Handbook pages">
            {TABS.map((t, i) => (
              <Tab
                key={t}
                id={`hb-tab-${t}`}
                aria-controls="hb-page"
                active={tab === t}
                onClick={() => pick(t)}
                onKeyDown={(e) => tabRowKeyDown(e, TABS, i, pick)}
              >
                {TAB_WORD[t]}
              </Tab>
            ))}
          </div>
          <Plank size="sm" keyCap="Esc" className="hb-close" onClick={onClose}>Close</Plank>
        </div>

        {/* the page is keyed on the tab so it arrives rather than swapping, which is the one movement in the binder and the page turn it stands for */}
        <Scroller
          className="hb-page"
          id="hb-page"
          key={tab}
          role="tabpanel"
          aria-labelledby={`hb-tab-${tab}`}
          /* a scrolling region a keyboard cannot reach is a page a keyboard cannot read, and the facts page is nineteen cards deep with no way to move it without a trackpad */
          tabIndex={0}
        >
          {/* the chart closes the binder when it puts the ship to sea, because a panel over the window while the island slides past hides the one thing the click was for */}
          {tab === 'chart' && <Chart onSailing={onClose} />}

          {/* the real Bonney Lake directory, in the school's own published words */}
          {tab === 'school' && (
            <>
              <h3 className="hb-h">Bonney Lake High School</h3>
              <p className="hb-lede">
                Everything the school runs: {directoryCount('clubs')} clubs, {directoryCount('sports')} teams
                and the course catalog. This is the real list, with the days and rooms the school publishes.
              </p>
              {DIRECTORY.map((sec) => (
                <section className="dir-sec" key={sec.id}>
                  <h4 className="hb-h">
                    {sec.title} <span className="dir-count">{directoryCount(sec.id)}</span>
                  </h4>
                  <p className="hb-lede">{sec.lede}</p>
                  {sec.groups.map((grp) => (
                    <div className="dir-group" key={grp.heading}>
                      <div className="dir-group-head">
                        <h5 className="dir-group-name">{grp.heading}</h5>
                        <span className="dir-count">{grp.rows.length}</span>
                      </div>
                      <ul className="dir-list">
                        {grp.rows.map((r) => (
                          <li className="dir-row" key={r.name}>
                            <span className="dir-name">
                              {r.name}
                              {r.what && <span className="dir-what">{r.what}</span>}
                            </span>
                            <span className={`dir-meets${r.meets ? '' : ' dir-gap'}`}>
                              {r.meets ?? r.note}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </section>
              ))}
              <p className="hb-note">
                Straight from the school: the clubs hub, the athletics pages and the course catalog.
                Nothing on this page was made up for the game.
              </p>
            </>
          )}

          {tab === 'islands' && (
            <>
              <h3 className="hb-h">Islands</h3>
              <p className="hb-lede">
                Each island is a real Bonney Lake club, sport or class. One place can hold more
                than one.
              </p>
              {/* a place is not a programme: one place can hold several, each with its own state */}
              <div className="hb-grid hb-grid-wide">
                {PLACES.map((p) => {
                  const runs = programmesAt(p.id)
                  return (
                    <article className="hb-card" key={p.id}>
                      <h4 className="hb-card-title">{p.name}</h4>
                      {p.recognise && <p className="hb-card-note">{p.recognise}</p>}
                      <p className="hb-meta">
                        {p.maps.length ? `${p.maps.length} map${p.maps.length > 1 ? 's' : ''} to walk` : 'not open yet'}
                        {p.room ? ` · ${p.room}` : ''}
                      </p>
                      {runs.length ? (
                        <ul className="hb-progs">
                          {runs.map((g) => {
                            const st: IslandState = s?.islands[g.id] ?? 'misty'
                            /* a programme nobody has built yet reads as still rising */
                            const rising = !g.playable && st === 'misty'
                            const mark = rising ? undefined : ISLAND_MARK[st]
                            return (
                              <li className="hb-prog" key={g.id}>
                                <span className="hb-prog-head">
                                  <span className="hb-prog-name">{g.name}</span>
                                  <span className="hb-prog-state">
                                    {mark && <Glyph piece="icon_set" face={mark} size={14} className="hb-mark" />}
                                    {rising ? 'not open yet' : ISLAND_WORD[st]}
                                  </span>
                                </span>
                                <span className="hb-meta">
                                  {g.blurb}{g.host ? ` · ${g.host}` : ''}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <p className="hb-meta">No clubs, sports or classes here yet.</p>
                      )}
                    </article>
                  )
                })}
              </div>
              <p className="hb-note">
                More islands open as they get built. Every one of them is a real Bonney Lake club,
                sport or class.
              </p>
            </>
          )}

          {tab === 'cords' && !s && (
            <Empty what="You have not started yet." fills="Start playing and your cord list fills in here." />
          )}

          {tab === 'cords' && s && (
            <>
              <h3 className="hb-h">Cords and seals</h3>
              <p className="hb-lede">
                Cords and seals you can earn by graduation, and how close you are to each one.
              </p>
              {/* the school's criterion first, then what this game counts, never one as the other */}
              <div className="hb-grid hb-grid-cords">
                {cordsOf(s).map((c) => (
                  <article className="hb-card hb-cord" key={c.id} data-state={c.earned ? 'earned' : c.published ? 'open' : 'unsaid'}>
                    <div className="hb-cord-head">
                      <h4 className="hb-card-title">{c.name}</h4>
                      <span className="hb-meta hb-cord-colors">{c.colors}</span>
                    </div>
                    <p className="hb-cord-rule">{c.published ? c.rule : `${c.rule} No criteria to show.`}</p>
                    {c.model && <p className="hb-meta">In this game: {c.model}</p>}
                    {c.earned ? (
                      <p className="hb-earned">
                        <Glyph piece="stamp" face="sealed" size={34} className="hb-seal" />
                        Earned
                      </p>
                    ) : c.published ? (
                      <>
                        <Gauge value={c.progress} label={`${c.name} progress`} className="hb-cordbar" />
                        <p className="hb-meta">{wordsOnly(c.detail)}</p>
                      </>
                    ) : (
                      <p className="hb-meta">{c.detail}</p>
                    )}
                    <p className="hb-source">{c.source}</p>
                  </article>
                ))}
              </div>
              <p className="hb-note">{NO_ATHLETIC_CORD}</p>
            </>
          )}

          {tab === 'facts' && (
            <>
              <h3 className="hb-h">Facts collected</h3>
              {/* the count is against what exists, the same denominator the Bookworm badge is measured against, since a count with no denominator is how a goal of twenty-five sat over a pool of nineteen for months */}
              <Gauge
                value={FACT_POOL ? facts.length / FACT_POOL : null}
                label="Facts collected"
                reading={`${facts.length} of ${FACT_POOL}`}
                className="hb-factbar"
              />
              {facts.length ? (
                <div className="hb-grid">
                  {facts.map((id) => {
                    const f = factById(id)
                    /* the source goes on the page, because a binder of true things about a real school that cannot say where any of them came from is a binder of claims a student cannot check */
                    return f ? (
                      <article className="hb-card hb-fact" key={id}>
                        <Glyph piece="pointer" face="pin_tail" size={22} className="hb-pin" />
                        <p className="hb-fact-text">{f.text}</p>
                        <p className="hb-source">{f.source} · checked {f.checked}</p>
                      </article>
                    ) : null
                  })}
                </div>
              ) : (
                <Empty
                  what="Nothing collected yet."
                  fills="Every loading screen teaches one true thing about Bonney Lake. They collect here."
                />
              )}
            </>
          )}

          {tab === 'badges' && (
            <>
              <h3 className="hb-h">Badges</h3>
              {/* six cards and not all six are reachable: two are `from: 'world'`, meaning an island hands them over, and no island hands over anything yet, so the lede must not promise every badge is earned by playing */}
              <p className="hb-lede">
                Six badges. Four of them you earn by playing. Two are waiting on islands
                nobody has built yet, and their cards say so.
              </p>
              <div className="hb-grid">
                {/* every island means the places that can actually be visited */}
                {badgesOf(s, PLACES.filter((p) => p.maps.length).map((p) => p.id)).map((b) => {
                  const st: BadgeState = b.earned ? 'earned' : b.from === 'world' ? 'unbuilt' : 'waiting'
                  return (
                    <article className="hb-card hb-badge" key={b.id} data-state={st}>
                      <Chip state={BADGE_PLATE[st]} className="hb-badge-plate">
                        {st === 'earned' && <Glyph piece="stamp" face="awarded" size={22} />}
                        {st === 'waiting' && <Glyph piece="icon_set" face="lock" size={18} />}
                      </Chip>
                      <div className="hb-badge-words">
                        <h4 className="hb-card-title">{b.name}</h4>
                        <p className="hb-badge-word">{BADGE_WORD[st]}</p>
                        {/* an unbuilt badge does not say how, because 'Spot the orca on open water' printed over 'Not open yet' is an instruction for a thing that does not exist */}
                        <p className="hb-card-note">
                          {st === 'unbuilt'
                            ? `Nobody has built the island that gives this one. It would be: ${b.how.replace(/\.$/, '')}.`
                            : b.how}
                        </p>
                        {/* what the run has done toward it, on the badges that count something */}
                        {b.detail && st !== 'unbuilt' && (
                          <p className="hb-meta">{b.detail}</p>
                        )}
                        {b.id === 'bookworm' && (
                          <Gauge
                            value={FACT_POOL ? Math.min(1, facts.length / FACT_POOL) : null}
                            label={`${b.name} progress`}
                            reading={`${facts.length} of ${FACT_POOL}`}
                            className="hb-badgebar"
                          />
                        )}
                        {st === 'unbuilt' && (
                          <p className="hb-meta">
                            The island that gives this badge is not open yet.
                          </p>
                        )}
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </Scroller>
      </div>
    </div>
  )
}
