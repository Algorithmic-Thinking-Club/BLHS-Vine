/* THE CHART: this registry drawn on paper.
 *
 * §80.2 calls the chart "this registry drawn on paper" and the archipelago shot
 * "this registry at its widest", which is the whole argument for the chart not
 * being a second list: it reads the same composition the water is built from, so
 * an island that rises between two sittings appears on the chart with no code
 * change and no second edit.
 *
 * WHAT IT REPLACED. The Handbook's chart page read `ISLANDS` from
 * `src/game/island/registry.ts`, the tile-era registry, which holds exactly one
 * entry, `{id: 'central', cx: 192, cy: 192, radius: 78}`, with `tile-space
 * center` on the coordinates, for a map the game loads under a different id.
 * That is AUTHORING §12's own example of the world composition document being
 * missing, and this is the page that had been standing in for it.
 *
 * ---- WHAT THIS PASS IS FOR, 2026-09-01 -------------------------------------
 *
 * §9.12 calls the chart "the second most looked-at panel in the game after the
 * dialogue box" and then says the thing this file was failing: *"It is drawn
 * art, not a styled div."* What was on it was seven FONT CHARACTERS, one per
 * state, which `docs/ART.md` forbids outright, laid over two gradients.
 *
 * SO A STATE IS NOW WHICH OBJECTS ARE STANDING AT THE DOCK. §9.17's law,
 * verbatim: *"Every island state is legible at a glance, at sailing distance, on
 * a Chromebook screen, and is distinguished from every other state by which
 * objects are present at the dock ... the discriminator is a thing present or
 * absent at a known place, not a change of appearance on a thing that is always
 * there."* `states.ts` resolves the six standing places and this file draws
 * them, in the same order on every island, with the empty places still drawn so
 * that absence reads as absence rather than as a shorter row.
 *
 * FIVE STORED, TWO COMPUTED, AND NOTHING WRITTEN. Available and in-season are
 * recomputed on every draw off `save.tokens` and `SPORT_SEASONS`, because a
 * token spent at the chart table changes what half the ocean looks like without
 * anything touching `save.islands`, and a computed state written into a save is
 * a cache with no invalidation.
 *
 * WHAT IT IS NOT, and both are §9.12 and §9.13 in as many words. It is not a
 * second planner: nothing here commits anything, there is no control on the
 * paper at all, and the year is stamped at the chart table in §5. And it is not
 * a completion score: there is no percentage anywhere on this surface, because
 * `GAME-DESIGN.md` §10 puts that in Gear 2, after a run is over, and a
 * percentage during a run turns four years into a checklist.
 *
 * THREE HONEST PANEL STATES, which §40.42 asks for and which this page had none
 * of: the document has not answered yet, the document answered with no water on
 * it, and the sea holds one island because the platform has published one.
 */
import { useEffect, useRef, useState } from 'react'
import {
  compositionCache, compositionReport, loadComposition, regionAt, seaSlots,
  type SlotState, type WorldComposition, type WorldPt, type WorldSlot,
} from './composition'
import { dockOf, stateLine, type Dock, type DockDrawn } from './states'
import { loadSave, subscribeSave } from '../save'
import { mooringFor } from '../run/resume'
import { Empty, Failed, Glyph, Loading } from '../ui/controls'
import { announce } from '../ui/a11y'
import './chart.css'

/* THE SENTENCE §40.42 KEEPS, WORD FOR WORD. The moment's own instruction is that
 * the five existing empty states survive "verbatim through any refactor", and
 * this is the one the Handbook's Islands tab already prints. The sea holding one
 * island is not an edge case in the first deployment, it IS the first
 * deployment, so the sentence a student reads during it is a promise about the
 * club rather than an apology for the game. */
const SEA_IS_YOUNG = 'The sea is young. Every island out there will be something Bonney Lake really '
  + 'offers, and new ones rise as they are built.'

/* ---- one thing standing at one place on a dock ---------------------------
 *
 * `Glyph` wears the platform's cut face when the kit is worn and falls back to
 * whatever node it is handed otherwise, and the fallback here is always a
 * drawing made out of the token layer. Never a character: `docs/ART.md` says
 * "Icons are drawn, never an emoji or a font glyph" and the three objects nobody
 * has drawn yet (a pennant, a fog bank, the water breaking) are token shapes
 * carrying a word rather than a symbol borrowed from the operating system.
 *
 * AN EMPTY PLACE IS STILL DRAWN. That is the whole mechanic: a notch on the rail
 * where a thing is not, so "no star" is something a student sees rather than
 * something they have to notice the absence of. */
function Mark({ m, big = false }: { m: DockDrawn; big?: boolean }) {
  const shape = <span className={`ch-s ${m.shape}`} />
  if (!m.on) return <span className="ch-slot ch-slot-off" aria-hidden="true" />
  return (
    <span className={`ch-slot${big ? ' ch-slot-big' : ''}`} title={m.word}>
      {m.face
        ? <Glyph piece={m.face[0]} face={m.face[1]} size={big ? 30 : 18} fallback={shape} />
        : shape}
    </span>
  )
}

/** the row of standing places, or the one mark that stands where a dock is not */
function DockRow({ dock }: { dock: Dock }) {
  if (dock.instead) {
    return (
      <span className="ch-dock ch-dock-bare" data-fog={dock.instead.kind === 'fog' ? dock.fog : undefined}>
        <Mark m={dock.instead} big />
      </span>
    )
  }
  return (
    <span className="ch-dock">
      {dock.slots.map((m) => <Mark key={m.kind} m={m} />)}
    </span>
  )
}

type Row = {
  key: string
  slot: WorldSlot
  dock: Dock
  line: string
  name: string
}

export function Chart() {
  const [comp, setComp] = useState<WorldComposition | null>(compositionCache)
  const [, bump] = useState(0)
  const [inked, setInked] = useState<ReadonlySet<string>>(() => new Set())
  /* what each slot looked like on the previous draw, so the chart can ink itself
   * (§9.15) rather than swapping. The chart is subscribed to the save, so a
   * discovery that lands while the binder is open is a thing a student watches. */
  const before = useRef(new Map<string, SlotState>())

  useEffect(() => { void loadComposition().then(setComp) }, [])
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])

  const save = loadSave()

  /* THE PANEL HAS NOT GOT ITS DOCUMENT YET. §40.42's list of panel states has
     loading in it and this page rendered a bare sentence in the dim voice, which
     is the same shape as "there is nothing here" and reads as an empty feature
     rather than as a fetch in flight. */
  const slots = comp ? seaSlots(comp) : []

  /* WHERE THE BOAT IS TIED UP, which is the only distance the run has actually
     recorded. `mooringFor` already answers it for the resume guard and returns
     the home slot when a run has never sailed, so the mist has something honest
     to thin against from the first sitting. */
  const moor = comp && save ? mooringFor(save.vessel, comp) : null
  const berthed: WorldSlot | null = moor?.slot ?? null
  const from: WorldPt | null = berthed ? berthed.at : null

  const rows: Row[] = slots.map((s) => {
    const dock = dockOf(s, save, from)
    return {
      key: s.map ?? s.place ?? s.title,
      slot: s,
      dock,
      line: stateLine(dock.state, s, save),
      /* A MISTY ISLAND HAS NO NAME ON THE CHART. Printing the title of a place a
         student has never sailed to is the chart doing the discovering for them,
         which is the one thing it is for. */
      name: dock.named ? s.title : dock.state === 'rumour' ? 'a rumour' : 'something out there',
    }
  })

  /* THE MIST PARTS AND THE CHART INKS. §9.14: "the dissolve is staged rather
     than switched ... a hard swap reads as a bug." The stage itself is a
     distance and lives in `dockOf`; this is the other half, the one-shot the
     mark plays on the draw it stops being a smudge, and it is announced because
     a mark appearing on paper is invisible to a reader. */
  useEffect(() => {
    const fresh: string[] = []
    for (const r of rows) {
      const was = before.current.get(r.key)
      before.current.set(r.key, r.dock.state)
      if (was === 'misty' && r.dock.state !== 'misty') fresh.push(r.key)
    }
    if (!fresh.length) return
    setInked(new Set(fresh))
    const said = rows.filter((r) => fresh.includes(r.key)).map((r) => r.name)
    announce(`The mist has cleared. ${said.join(' and ')} ${said.length > 1 ? 'are' : 'is'} on the chart now.`)
  })

  useEffect(() => {
    if (!inked.size) return
    const t = window.setTimeout(() => setInked(new Set()), 1400)
    return () => window.clearTimeout(t)
  }, [inked])

  if (!comp) {
    return (
      <div className="ch-chart">
        <h2 className="ch-h">The sea so far</h2>
        <Loading what="The chart is still being unrolled." />
      </div>
    )
  }

  if (!slots.length) {
    /* THE DOCUMENT ANSWERED WITH NOTHING ON IT. `tryWorld` drops a faulty slot
       and keeps the rest, so this is the case where every slot was refused or
       the world was authored empty: a real error rather than an empty sea, and
       it has to say so instead of drawing blank paper. */
    return (
      <div className="ch-chart">
        <h2 className="ch-h">The sea so far</h2>
        <Failed what="The chart came back with no water on it." />
        <p className="ch-legend">
          The world document answered and had no places in it. Nothing you have done is lost, and
          the sea comes back the moment the document does.
        </p>
      </div>
    )
  }

  /* THE PAPER FITS WHAT IS ON IT. A fixed frame drawn around a hardcoded extent
   * is what the tile-era chart did, and the first island placed outside that
   * extent falls off the page. The bounds are computed from the composition.
   *
   * THE MARGIN IS A FRACTION OF THE SPREAD AND NOT A CONSTANT. A flat 700 pixels
   * of padding is nothing around a wide archipelago and is most of the page
   * around two islands: measured on the shipped composition it put both marks
   * inside the middle third and left two thirds of the paper empty, on a page
   * that is already only 273 pixels wide inside the binder. A floor keeps a
   * single-island composition from being drawn at one point. */
  const xs = slots.map((s) => s.at.x)
  const ys = slots.map((s) => s.at.y)
  const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const pad = Math.max(320, spread * 0.35)
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad
  const y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad
  const fx = (x: number) => ((x - x0) / Math.max(1, x1 - x0)) * 100
  const fy = (y: number) => ((y - y0) / Math.max(1, y1 - y0)) * 100

  const known = new Set((save?.exposure ?? []).map((e) => e.place))
  const unvisited = (comp.regions ?? []).filter((r) => r.kind === 'sailable'
    && !slots.some((s) => known.has(s.place ?? '') && regionAt(comp, s.at)?.name === r.name))

  /* THE BOAT CARRIES HER OWN NAME. §9.13, and it is the same trick §2.11 named:
     the name was typed at the pier, painted on the stern, and this is its third
     appearance, which is the game proving again that it listened. A run that has
     not named her yet still gets a marker, because a student needs to know where
     they are more than the boat needs a name. */
  const boat = save?.boatName?.trim() || 'your boat'

  /* the platform could not be reached and the game is drawing the copy built
     into it. Said out loud, because "the chart looks wrong" is not something a
     teacher or a member can act on. */
  const builtIn = compositionReport().origin === 'built in'
  /* one island and nothing else out there is the FIRST DEPLOYMENT rather than a
     defect, and §40.42 already wrote the sentence for it */
  const isles = slots.filter((s) => !!s.map).length
  const lonely = isles <= 1

  return (
    <div className="ch-chart">
      <h2 className="ch-h">The sea so far</h2>

      <div
        className="ch-sea"
        role="img"
        aria-label={`A chart of the sea, with ${rows.length} place${rows.length === 1 ? '' : 's'} on it. Every one of them is listed underneath.`}
      >
        {/* the named water, drawn under everything, so "anywhere you have not
            been" is a thing on the page rather than a coordinate test */}
        {(comp.regions ?? []).map((r) => (
          <div key={r.name} className={`ch-region ch-region-${r.kind}`} style={{
            left: `${fx(r.rect.x)}%`, top: `${fy(r.rect.y)}%`,
            width: `${(r.rect.w / Math.max(1, x1 - x0)) * 100}%`,
            height: `${(r.rect.h / Math.max(1, y1 - y0)) * 100}%`,
          }}>
            <span className="ch-region-name">{r.label ?? r.name}</span>
          </div>
        ))}

        {/* THE ROSE IS PRINTED ON THE PAPER NOW, so this one is gone.
            `chart-field.png` was drawn on 2026-09-01 with a rose bled into its
            corner, which is where a rose belongs on a chart, and mounting
            `icon_set`'s HUD compass beside it put two of them on one sheet. The
            face is a BUTTON ICON at 24 pixels; a rose on a chart is a different
            drawing at a different size, and using one for the other was the
            stand-in that the paper has now replaced. */}
        {rows.map((r) => (
          <div
            key={r.key}
            className={`ch-isle ch-${r.dock.state}`}
            data-inked={inked.has(r.key) ? '1' : undefined}
            style={{ left: `${fx(r.slot.at.x)}%`, top: `${fy(r.slot.at.y)}%` }}
          >
            <DockRow dock={r.dock} />
            <span className="ch-name">{r.name}</span>
            <span className="ch-note">{r.line}</span>
          </div>
        ))}

        {berthed && (
          <div className="ch-you" style={{ left: `${fx(berthed.at.x)}%`, top: `${fy(berthed.at.y)}%` }}>
            <span className="ch-s ch-s-ship" />
            <span className="ch-you-name">{boat}</span>
          </div>
        )}
      </div>

      {/* ---- THE READING, WHICH IS ALSO THE PLAIN ARM ----------------------
          §9.13's deployment line: this is the screen a teacher ends up pointing
          at over a shoulder, so the same facts have to be legible as a list and
          not only as a picture. It is one list in both arms; the paper above it
          is what the plain arm does not get. */}
      {/* ---- WHAT THE PICTURE MEANS, DIRECTLY UNDER THE PICTURE -----------
       *
       * These two blocks used to sit at the BOTTOM of the page, after the whole
       * register, and at 1366x768 that put them past the fold: photographed at
       * `fixed-game/12-chart.png` the page ended on bare paper after the last
       * register rule, and a student in the shipped arm never saw either of
       * them. The control arm saw both, only because the plain skin hides the
       * sheet entirely and the page got shorter.
       *
       * They belong here anyway. The legend teaches the sheet ("pencil is rumour
       * and ink is somewhere you have been") and the sentence explains why the
       * sheet is nearly empty, and an explanation of a picture goes under the
       * picture rather than under the list of everything in it. A one-island sea
       * is not an edge case in the first deployment, it IS the first deployment. */}
      <p className="ch-legend">
        Pencil is rumour and ink is somewhere you have been.
        {unvisited.length
          ? ` ${unvisited.map((r) => r.label ?? r.name).join(' and ')} ${unvisited.length > 1 ? 'are' : 'is'} still blank.`
          : ''}
        {builtIn ? ' This is the chart built into the game, because the world could not be reached today.' : ''}
      </p>

      {lonely && (
        <Empty
          what={isles === 1 ? 'One island is on the water so far.' : 'No island is on the water yet.'}
          fills={SEA_IS_YOUNG}
        />
      )}

      <ul className="ch-register">
        {berthed && (
          <li className="ch-row ch-row-you">
            <span className="ch-row-marks" aria-hidden="true"><span className="ch-s ch-s-ship" /></span>
            <span className="ch-row-words">
              <span className="ch-row-name">{boat}</span>
              <span className="ch-row-state">you are here, tied up at {berthed.title}</span>
            </span>
          </li>
        )}
        {rows.map((r) => (
          <li className="ch-row" key={r.key}>
            <span className="ch-row-marks" aria-hidden="true"><DockRow dock={r.dock} /></span>
            <span className="ch-row-words">
              <span className="ch-row-name">{r.name}</span>
              <span className="ch-row-state">{r.line}</span>
              {/* THE SCHOOL'S OWN SENTENCE, AND NEVER AN ERROR. §9.17 state 6:
                  out of season "must never read as broken", and the words come
                  off `SPORT_SEASONS` rather than being written per island. */}
              {r.dock.closed && r.dock.closed !== r.line && (
                <span className="ch-row-closed">{r.dock.closed}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

    </div>
  )
}
