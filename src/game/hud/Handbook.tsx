import { useEffect, useState } from 'react'
/* THE CHART READS THE COMPOSITION NOW. It used to read `ISLANDS` from
 * `src/game/island/registry.ts`, the tile-era registry, which holds one entry
 * whose coordinates are commented `tile-space center` for a map the game loads
 * under a different id. That was AUTHORING §12's missing world composition
 * document being stood in for by a constant, and there is one source of truth
 * for where a map is now. */
import { Chart } from '../world/Chart'
import { PLACES, programmesAt } from '../roster/roster'
import { loadSave, subscribeSave, type IslandState } from '../save'
import { cordsOf, gpaOf, letterOf, NO_ATHLETIC_CORD } from '../progress'
import { factById } from '../facts'
import { badgesOf, FACT_POOL } from '../badges'
import { track } from '../telemetry'
import { announce, tabRowKeyDown, usePanel } from '../ui/a11y'
import { Chip, Empty, Gauge, Glyph, Plank, Tab } from '../ui/controls'
import './hud.css'

/* THE HANDBOOK, WHICH IS THE INVENTORY (§40.17 to §40.20, and §40.6's law that
 * there is no separate inventory and no quest log). Facts, badges and the record
 * of what a student has done live in this one binder, and it is the only panel
 * in the game a student opens because they WANT something rather than because
 * the game sent them.
 *
 * WHAT WAS WRONG WITH IT, photographed at `build-shots/ui/before/09-handbook.png`
 * and `12-chart.png`, and every one of these is a layout fault rather than a
 * content one:
 *
 *   1. THE TAB ROW WRAPPED. `.hb-tabs` was `flex-wrap: wrap` and five tabs plus
 *      a Close went onto two lines at every window this game is played at, which
 *      reads as a broken panel before a student has read a word. The kit's
 *      `kit-tabrow` never wraps and scrolls sideways instead, and Left/Right
 *      walk it through `tabRowKeyDown`.
 *   2. THE PAGE WAS INSET TWICE. `.hb-tabs` carried `margin: 15cqw 17.5cqw` and
 *      `.hb-page` carried `margin: 0 17.5cqw 15.5cqw 17cqw`, which were measured
 *      for a background stretched to 100% by 100%. The frame is a nine-slice
 *      now, so its own border-width is already the inset, and those margins were
 *      184 more pixels of nothing on each side of a 1080 pixel binder. That is
 *      the enormous dead space AND the clipped chart in one bug: the chart is a
 *      flex child of a page whose height had 167 pixels taken off the bottom.
 *   3. THE BADGES WERE OPERATING-SYSTEM EMOJI, and locked read as
 *      `filter: saturate(.4) opacity(.5)`, which is lightness and saturation
 *      alone and is what §11.3 forbids outright on the hardware this ships to.
 *   4. THE STATE OF A PROGRAMME PRINTED ITS OWN CODE STRING. `misty` and
 *      `completed` went to the screen raw, which is §40.12's rule broken on the
 *      one page a lost student reads.
 *
 * WHAT IT READS. Nothing on any page is decoration: the islands page is the
 * roster, the cords board is `cordsOf` over the ledger, the facts page is the
 * fact table and the run's collected ids, the badges page is the save's granted
 * list against the criteria stated here, and the chart is the world composition.
 */

/* ---- what a state is CALLED ---------------------------------------------
 *
 * §40.12: a code-facing string on a player-facing surface is a bug. These are
 * `src/game/world/states.ts`'s own words for the same five states, so the
 * binder and the chart say the same thing about the same island rather than
 * inventing a second vocabulary.
 *
 * THEY NO LONGER MATCH, 2026-09-04. The words pass rewrote this list and
 * `states.ts`'s `stateLine` in the same session and landed on two vocabularies:
 * the chart writes a whole sentence ("You have sailed past here.") where the
 * binder writes a chip ("seen, not started"). Only `active` still agrees, and
 * only by accident. Reconcile the two lists in ONE edit or this paragraph is a
 * lie the next reader will believe. */
const ISLAND_WORD: Record<IslandState, string> = {
  misty: 'you have not been here',
  discovered: 'you have been past',
  available: 'you can sign up here',
  active: 'you started this',
  completed: 'you finished this',
}

/* AND THE MARK BESIDE THE WORD, because §40.31 says no state may be carried by
 * hue alone and the word is only half of that. Three of the five states have a
 * drawn face on `icon_set`; the other two get the word and nothing else, which
 * is the honest answer and is never an operating-system stand-in. */
const ISLAND_MARK: Partial<Record<IslandState, string>> = {
  available: 'arrow',
  active: 'star',
  completed: 'tick',
}

/* ---- the badges ----------------------------------------------------------
 *
 * §40.20 AND THE ONE BADGE NOBODY CAN EARN. `transitions.tsx` grants Bookworm at
 * twenty-five collected facts and `facts.ts` holds nineteen, so the game states
 * a goal, tracks progress toward it, and the goal cannot be reached. That is not
 * fixed by quietly moving the number, because the number is written in a file
 * this session does not own and because a criterion a student read yesterday is
 * not something to edit out from under them. It is fixed by SAYING SO on the
 * page: the criterion stands as the game states it, the count is real, and the
 * card says how many facts exist to collect today.
 *
 * `facts` is the only criterion this panel can honestly count. The other five
 * are granted by an island through the `award` intent, which is a real path, so
 * they read as not yet earned rather than as out of reach. Nothing here invents
 * a criterion for them. */
/* ---- THE THREE THINGS A CARD CAN BE ---------------------------------------
 *
 * `earned` and `waiting` are the obvious two. The third used to be `short`, "out
 * of reach", and it existed because Bookworm asked for twenty-five facts against
 * a pool of nineteen: the page narrated a defect rather than closing it, and the
 * brief asked for it closed. `badgesOf` computes that threshold from the pool
 * now, so nothing is arithmetically out of reach any more.
 *
 * What replaced it is a different and honest state. Two of the six are events in
 * the world, not facts about the save, and no island in the shipped game grants
 * either yet. A card that says "Not yet" about a thing nothing can do is the
 * same lie in a friendlier voice, so those say `unbuilt`, in the words §40.42
 * already uses everywhere else for a thing that has not risen. */
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

/* A DATA STRING WEARING A FONT GLYPH IS STILL A FONT GLYPH. `progress.ts` builds
 * the AP Capstone status line as `Seminar ✓ Research · · 3 APs passed`, and
 * `docs/ART.md` says an icon is drawn and never a character, naming check marks
 * first. The file that writes that string is not this session's to edit, so the
 * board reads the mark back as the word it stands for. It is the only cord
 * detail of the nine that carries one. */
const wordsOnly = (s: string): string => s.replace(/✓/g, 'done')

type Tab = 'chart' | 'islands' | 'cords' | 'facts' | 'badges'

const TABS: Tab[] = ['chart', 'islands', 'cords', 'facts', 'badges']

const TAB_WORD: Record<Tab, string> = {
  chart: 'Chart',
  islands: 'Islands',
  cords: 'Cords',
  facts: 'Facts',
  badges: 'Badges',
}

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
  const pick = (t: Tab) => { setTab(t); track('handbook_entry_viewed', { tab: t }); announce(`${TAB_WORD[t]} page`) }

  /** what this run has collected, which two pages count against the same pool */
  const facts = s?.facts ?? []

  return (
    <div className="hb-veil" onClick={onClose}>
      <div className="hb-book kit-surface-panel" onClick={(e) => e.stopPropagation()} {...panel}>
        <header className="hb-head">
          {/* the school's own mark, which docs/ART.md puts on the Handbook cover */}
          <span className="hb-crest" aria-hidden="true" />
          <div className="hb-titles">
            <h2 className="hb-title">The Handbook</h2>
            {/* THE RUN'S OWN LINE, AND IT ASSEMBLES THE WAY THE CORNER DOES.
                §8.1 forbids a floating GPA precisely so the number lives in this
                binder, and §40.1's law is that a thing appears when the game has
                granted what it is about: a student who has not sat a class has
                no GPA and is told nothing about one. */}
            {s && (
              <p className="hb-run">
                {s.handle ? `${s.handle} · ` : ''}Year {s.year}, {s.season}
                {gpa !== null && ` · GPA ${gpa.toFixed(2)} (${letterOf(gpa)})`}
              </p>
            )}
          </div>
        </header>

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

        {/* the page is keyed on the tab so it arrives rather than swapping, which
            is the one movement in the binder and is the page turn it stands for */}
        <div
          className="hb-page"
          id="hb-page"
          key={tab}
          role="tabpanel"
          aria-labelledby={`hb-tab-${tab}`}
          /* A SCROLLING REGION A KEYBOARD CANNOT REACH IS A PAGE A KEYBOARD
             CANNOT READ. The facts page is nineteen cards deep and the only way
             to move it without a trackpad is to be able to land on it. */
          tabIndex={0}
        >
          {/* the chart closes the binder when it puts the ship to sea: a panel
              over the window while the island slides past is the game hiding the
              one thing the click was for */}
          {tab === 'chart' && <Chart onSailing={onClose} />}

          {tab === 'islands' && (
            <>
              <h3 className="hb-h">Islands</h3>
              <p className="hb-lede">
                Each island is a real Bonney Lake club, sport or class. One place can hold more
                than one.
              </p>
              {/* A PLACE IS NOT A PROGRAMME, and this is the one page a student can
                  see it. The stadium is one island and three things you can do there,
                  each with its own state, because finishing football is not finishing
                  track. This page used to index the completion record with a place id,
                  which is exactly the merge the roster exists to stop. */}
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
                            /* AND A PROGRAMME NOBODY HAS BUILT YET SAYS THAT, rather
                               than "not been". Every entry on the roster is
                               `playable: false` today, so the page would otherwise
                               tell a student they had failed to visit five things
                               that cannot be visited. `still rising` is the world's
                               own word for it, out of `states.ts`. A run that has
                               actually moved a programme along keeps its real state. */
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
              {/* THE SCHOOL'S WORDS, THEN THE GAME'S, AND NEVER ONE AS THE OTHER (V3).
                  `rule` is verbatim from docs/blhs/awards.md and is the criterion. `model`
                  is what this game actually counts, and it is printed underneath, marked,
                  because a mechanic that approximates a criterion is never the criterion.
                  An award whose criteria nobody has published says so in the same place.

                  AND THERE IS NO PADLOCK ON THIS PAGE, which is §12.8's rule: a cord is
                  never pass or fail here. Every cord shows its criterion and how far the
                  run has come, at every point in the run, including the first minute. */}
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
              {/* THE COUNT IS AGAINST WHAT EXISTS, which is the number the Bookworm
                  badge is measured against too. A count with no denominator is how a
                  goal of twenty-five sat over a pool of nineteen for months. */}
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
                    /* THE SOURCE IS ON THE PAGE. A binder of true things about a real
                       school that cannot say where any of them came from is a binder
                       of claims, and a student can and should be able to check one. */
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
              <p className="hb-lede">
                Six badges. Each card says how to earn it, and you earn every one by playing.
              </p>
              <div className="hb-grid">
                {/* WHAT "EVERY ISLAND" MEANS, counted off the same roster this
                    panel's own Islands page reads. A place with no painting is
                    not an island a student has failed to find, so the
                    denominator is the places that can actually be visited. */}
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
                        <p className="hb-card-note">{b.how}</p>
                        {/* WHAT THE RUN HAS DONE TOWARD IT, on the three that count
                            something. It used to be only Bookworm, because only
                            Bookworm had a number; the other two count as plainly
                            and nobody had ever asked them. */}
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
        </div>
      </div>
    </div>
  )
}
