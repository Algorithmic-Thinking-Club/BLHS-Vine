/* the chart: the world composition drawn on paper, with each island's state read off it */
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
import { requestSail, requestVoyage, sailFrom, sailListenerCount, voyageListenerCount } from './sail-bus'
import { picksOf } from '../run/pick'
import { note } from '../ui/feedback'
import './chart.css'

/* the sentence for a sea holding one island, kept word for word */
/* THE WORDS PASS, 2026-09-04, rewrote this sentence. The moment asked for it
 * verbatim, and Ash's literal-words ruling outranks that: it now names what an
 * island really is and who is building the others. */
const SEA_IS_YOUNG = 'Every island here is a real Bonney Lake club, sport or class. '
  + 'Students are still building the rest.'

/* ---- one thing standing at one place on a dock, with the empty places still drawn */
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
  /** can she be sent there from where the student is standing right now */
  sailable: boolean
}

/* ---- clicking a named island sails the ship there, the same control in both arms */
function sailableRow(r: { dock: Dock; slot: WorldSlot }, here: string | undefined, onWater: boolean): boolean {
  return r.dock.named
    && r.dock.state !== 'rising'
    && !!r.slot.map
    && !!r.slot.berth
    /* ---- THE ISLAND YOU ARE ON IS OFFERED WHEN YOU ARE AFLOAT ON IT --------
     *
     * It never was, and that was right while a pin meant "sail there": you
     * cannot sail to where you are standing. But a student holding the tiller on
     * his own island's water has to be able to PUT IN, and the pin is the only
     * control on this page. Measured on the live deploy 2026-09-08: the beach
     * opening left a student adrift off the hub with the bar reading "Click the
     * island to sail there" and the one island on the chart not pressable. */
    && (r.slot.map !== here || onWater)
}

/** `onSailing` lets whatever opened the chart get out of the way once the ship
 *  is moving. The Handbook passes its own close. */
export function Chart({ onSailing }: { onSailing?: () => void } = {}) {
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

  /* the panel has not got its document yet, which is not the same as an empty sea */
  const slots = comp ? seaSlots(comp) : []

  /* where the boat is tied up, which is the distance the mist thins against */
  const moor = comp && save ? mooringFor(save.vessel, comp) : null
  const berthed: WorldSlot | null = moor?.slot ?? null
  const from: WorldPt | null = berthed ? berthed.at : null

  /* where he is standing, so his own island is not offered, and whether a boat can take him */
  const here = sailFrom() ?? undefined
  /* A VOYAGE IS OFFERED FROM ANY MAP WITH A SCENE UNDER IT, not only from one
   * with water: the first leg of the journey is the walk out of the room, and
   * `sail_to` owns that. The old test was "is there an ocean under this
   * painting", which is why the chart's only control was dead in the Maw, which
   * is the room a student spends year one in. */
  const afloat = voyageListenerCount() > 0 || sailListenerCount() > 0

  const rows: Row[] = slots.map((s) => {
    const dock = dockOf(s, save, from)
    return {
      key: s.map ?? s.place ?? s.title,
      slot: s,
      dock,
      sailable: afloat && sailableRow({ dock, slot: s }, here, sailListenerCount() > 0),
      line: stateLine(dock.state, s, save),
      /* A MISTY ISLAND HAS NO NAME ON THE CHART. Printing the title of a place a
         student has never sailed to is the chart doing the discovering for them,
         which is the one thing it is for. */
      name: dock.named ? s.title : dock.state === 'rumour' ? 'a place nobody has built yet' : 'a place you have not found',
    }
  })

  /* the mist parts and the mark inks in, once, on the draw it stops being a smudge */
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
    announce(`You found ${said.join(' and ')}. ${said.length > 1 ? 'They are' : 'It is'} on the chart now.`)
  })

  useEffect(() => {
    if (!inked.size) return
    const t = window.setTimeout(() => setInked(new Set()), 1400)
    return () => window.clearTimeout(t)
  }, [inked])

  /* EVERY CLICK ANSWERS, INCLUDING THE ONES THAT CANNOT GO. A row that swallows a
   * press is the dead end the law is about, so a refusal is a sentence on the
   * screen and in the reader's ear rather than nothing happening. */
  const sail = (r: Row) => {
    /* ---- THE PIN SAILS THE WHOLE WAY (Ash, 2026-09-08 item 3) -------------
     *
     * `requestSail` handed the helm to a hull on THIS painting's own ocean and
     * steered it at the pin in real time, sounding the straight line against
     * this map's depth field. That is the right machine for a berth a hundred
     * pixels away and it cannot leave the canvas: anything further off is
     * refused as aground, which is every island in the world.
     *
     * `requestVoyage` is the journey: walk out of the room, down the quay,
     * aboard, bars up, across under a cover, tie up, step off, card. It is
     * `sail_to`, the same word a member's island writes, so a pin on the chart
     * and a line in somebody's python are one machine with one set of rules. */
    void requestVoyage(r.slot.map!).then((a) => {
      if (a.ok) {
        announce(`Sailing to ${r.name}.`)
        onSailing?.()
        return
      }
      /* AND THE OTHER KIND OF SAILING IS THE FALLBACK, not a second control.
       * `requestVoyage` is the journey between islands and refuses the island
       * you are on; `requestSail` hands the helm to a hull on this painting's
       * own ocean, which is what putting in to your own harbour is. One pin,
       * one press, and the scene picks the machine that can answer it. */
      void requestSail(r.slot).then((b) => {
        if (b.ok) { announce(`Sailing to ${r.name}.`); onSailing?.(); return }
        note(a.why)
        announce(a.why)
      })
    })
  }

  if (!comp) {
    return (
      <div className="ch-chart">
        <h2 className="ch-h">Chart</h2>
        <Loading what="Loading the chart." />
      </div>
    )
  }

  if (!slots.length) {
    /* the document answered with nothing on it, which is an error rather than an empty sea */
    return (
      <div className="ch-chart">
        <h2 className="ch-h">Chart</h2>
        <Failed what="The chart could not be loaded." />
        <p className="ch-legend">
          The list of places came back empty. Nothing you have done is lost.
        </p>
      </div>
    )
  }

  /* what he picked that nobody has built. They are drawn round the edge of the
   * paper rather than in the sea; the note where they are drawn says why. */
  const owed = picksOf(save).filter((p) => !p.map)

  /* the paper fits what is on it, with a margin taken as a fraction of the spread */
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

  /* the boat marker carries the name the student typed at the pier */
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
      <h2 className="ch-h">Chart</h2>

      <div
        className="ch-sea"
        role="img"
        aria-label={`A map of the places in the game. It has ${rows.length} place${rows.length === 1 ? '' : 's'} on it, and every one is listed underneath.`}
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

        {/* ---- HIS OWN YEAR, ROUND THE EDGE OF THE PAPER --------------------
         *
         * ASH, 2026-09-08 item 3: *"the hub in the middle and his picked islands
         * around it, plus any island already built."*
         *
         * THEY ARE PLACED ON THE PAPER AND NOT IN THE SEA. A world coordinate
         * would have to be invented for a place nobody has built, and the first
         * version did exactly that: a ring around the hub, which on a chart four
         * times wider than it is tall collapsed into the middle and drew four
         * dashed boxes straight through the islands that really exist.
         *
         * So the corners, by index, clear of the water in the middle where the
         * real slots live. It is the same picture Ash asked for on a page this
         * shape, and it cannot collide with anything the world document holds.
         * The day somebody builds one of these it becomes a real slot with a real
         * berth and leaves this list on its own. */}
        {owed.map((p, i) => (
          <div
            key={`pick:${p.id}`}
            className="ch-isle ch-rumour ch-isle-pick"
            /* the corners in this order because the compass rose is printed at
               the top right of the paper, so that one is filled last */
            style={{
              left: `${[12, 12, 88, 88][i % 4]}%`,
              top: `${[22, 78, 78, 24][i % 4]}%`,
            }}
          >
            <span className="ch-name">{p.name}</span>
            <span className="ch-note">{p.done ? 'counted as done' : 'no island yet'}</span>
          </div>
        ))}

        {/* the compass rose is printed on the paper itself, so nothing is mounted for it */}
        {rows.map((r) => {
          const body = (
            <>
              <DockRow dock={r.dock} />
              <span className="ch-name">{r.name}</span>
              <span className="ch-note">{r.line}</span>
            </>
          )
          const at = { left: `${fx(r.slot.at.x)}%`, top: `${fy(r.slot.at.y)}%` }
          /* a button only where there is somewhere to go. A control that is
           * always there and usually refuses teaches a student that the chart
           * does not work. */
          return r.sailable ? (
            <button
              key={r.key}
              type="button"
              className={`ch-isle ch-${r.dock.state} ch-isle-go`}
              data-inked={inked.has(r.key) ? '1' : undefined}
              style={at}
              onClick={() => sail(r)}
            >
              {body}
              <span className="ch-go">Sail here</span>
            </button>
          ) : (
            <div
              key={r.key}
              className={`ch-isle ch-${r.dock.state}`}
              data-inked={inked.has(r.key) ? '1' : undefined}
              style={at}
            >
              {body}
            </div>
          )
        })}

        {berthed && (
          <div className="ch-you" style={{ left: `${fx(berthed.at.x)}%`, top: `${fy(berthed.at.y)}%` }}>
            <span className="ch-s ch-s-ship" />
            <span className="ch-you-name">{boat}</span>
          </div>
        )}
      </div>

      {/* ---- the register list, which is the same facts as a list and is in both arms */}
      {/* ---- what the picture means, directly under the picture */}
      <p className="ch-legend">
        Faint marks are places you have not been to. Solid marks are places you have.
        {unvisited.length
          ? ` ${unvisited.map((r) => r.label ?? r.name).join(' and ')} ${unvisited.length > 1 ? 'are areas' : 'is an area'} you have not sailed to yet.`
          : ''}
        {builtIn ? ' The place list would not download, so this is the copy built into the game.' : ''}
      </p>

      {lonely && (
        <Empty
          what={isles === 1 ? 'One island is on the map so far.' : 'No island is on the map yet.'}
          fills={SEA_IS_YOUNG}
        />
      )}

      <ul className="ch-register">
        {berthed && (
          <li className="ch-row ch-row-you">
            <span className="ch-row-marks" aria-hidden="true"><span className="ch-s ch-s-ship" /></span>
            <span className="ch-row-words">
              <span className="ch-row-name">{boat}</span>
              <span className="ch-row-state">You are here, docked at {berthed.title}</span>
            </span>
          </li>
        )}
        {rows.map((r) => (
          <li className="ch-row" key={r.key}>
            <span className="ch-row-marks" aria-hidden="true"><DockRow dock={r.dock} /></span>
            <span className="ch-row-words">
              <span className="ch-row-name">{r.name}</span>
              <span className="ch-row-state">{r.line}</span>
              {/* THE PLAIN ARM'S ONLY WAY ONTO THE WATER. The paper above is
                  hidden under that skin and this list is not, so the row carries
                  its own control rather than the picture carrying the only one. */}
              {r.sailable && (
                <button type="button" className="ch-row-go" onClick={() => sail(r)}>
                  Sail to {r.name}
                </button>
              )}
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
