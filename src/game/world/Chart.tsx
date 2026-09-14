/* the chart: the archipelago drawn on real water, each island its own painting, with its state read off the run */
import { useEffect, useRef, useState } from 'react'
import {
  compositionCache, compositionReport, loadComposition, regionAt, seaSlots,
  type SlotState, type WorldComposition, type WorldSlot,
} from './composition'
import { dockOf, stateLine, type Dock, type DockDrawn } from './states'
import { atPct, chartBox, CHART_DENSE, CHART_TALL, CHART_THUMB, islandCut, pinPx, type IslandCut } from './chart-frame'
import { loadSave, subscribeSave } from '../save'
import { mooringFor } from '../run/resume'
import { Empty, Failed, Glyph, Loading, Plank } from '../ui/controls'
import { announce } from '../ui/a11y'
import { isAfloat, requestSail, requestVoyage, sailFrom, sailListenerCount, voyageListenerCount } from './sail-bus'
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

/* ---- THE ONE MARK AN ISLAND WEARS ON THE WATER -----------------------------
 *
 * The register underneath draws the whole rail, six standing places wide, and
 * that is where an empty place is legible as an empty place. On the water an
 * island is forty pixels across and six marks beside it are a smear, so it wears
 * the loudest thing standing on its dock and nothing else: the seal if it is
 * finished, the flag if it was started, the star if a token would be taken
 * there, the tick if he has been ashore. */
const BADGE_ORDER = ['stamp', 'flag', 'open', 'ashore'] as const

const badgeOf = (dock: Dock): DockDrawn | null => {
  for (const want of BADGE_ORDER) {
    const m = dock.slots.find((s) => s.kind === want)
    if (m?.on) return m
  }
  return null
}

/* ---- the island's own painting, straight out of the bundle the game loads ---
 *
 * `public/maps-vendored/<map>/scene.png` is the whole canvas and most of it is
 * transparent margin, so the window is the painted extent the world document
 * already records and the picture is pulled up and left behind it. A map nobody
 * vendored still has its committed folder, which is why one miss is retried
 * rather than leaving a hole where an island should be. */
function Painting({ cut, lift = false }: { cut: IslandCut; lift?: boolean }) {
  const [src, setSrc] = useState(cut.src)
  const [gone, setGone] = useState(false)
  useEffect(() => { setSrc(cut.src); setGone(false) }, [cut.src])
  return (
    <span
      className={`ch-pic${gone ? ' ch-pic-gone' : ''}`}
      style={{ width: cut.w, height: cut.h, marginTop: lift ? -cut.h / 2 : 0 }}
    >
      {/* AND WHEN THERE IS NO PAINTING, THE OLD MARK. A browser's own broken
          picture icon on a chart is worse than the pin this page has always
          drawn, and the island is a real place either way. */}
      {gone ? <span className="ch-s ch-s-pin" /> : (
        <img
          className="ch-pic-img"
          src={src}
          alt=""
          draggable={false}
          decoding="async"
          style={{ width: cut.imgW, height: cut.imgH, left: cut.left, top: cut.top }}
          onError={() => {
            if (src === cut.spare) {
              /* SAY WHICH ONE. A silently missing island is a chart with a hole in
               * it and nobody is ever told which bundle did not answer. */
              console.warn(`[chart] no painting for this island at ${cut.src} or ${cut.spare}`)
              setGone(true)
              return
            }
            setSrc(cut.spare)
          }}
        />
      )}
    </span>
  )
}

type Row = {
  key: string
  slot: WorldSlot
  dock: Dock
  line: string
  name: string
  /** the island's own painting, cut and scaled, or null where nothing is built */
  cut: IslandCut | null
  /** the same painting again at list size, for the register row */
  thumb: IslandCut | null
  /** can she be sent there from where the student is standing right now */
  sailable: boolean
  /* why it cannot be pressed, when it cannot and the reason is worth saying */
  why: string | null
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
export function Chart({ onSailing, heading = true }: { onSailing?: () => void; heading?: boolean } = {}) {
  const [comp, setComp] = useState<WorldComposition | null>(compositionCache)
  const [, bump] = useState(0)
  const [inked, setInked] = useState<ReadonlySet<string>>(() => new Set())
  /* what each slot looked like on the previous draw, so the chart can ink itself
   * (§9.15) rather than swapping. The chart is subscribed to the save, so a
   * discovery that lands while the binder is open is a thing a student watches. */
  const before = useRef(new Map<string, SlotState>())

  useEffect(() => { void loadComposition().then(setComp) }, [])
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  /* and a redraw when he gets in or out of the boat, because that is what decides
   * whether the island he is standing on may be pressed */
  useEffect(() => {
    const h = () => bump((v) => v + 1)
    window.addEventListener('blhs:afloat', h)
    return () => window.removeEventListener('blhs:afloat', h)
  }, [])

  const save = loadSave()

  /* the panel has not got its document yet, which is not the same as an empty sea */
  const slots = comp ? seaSlots(comp) : []

  /* where the boat is tied up, which is the distance the mist thins against */
  const moor = comp && save ? mooringFor(save.vessel, comp) : null
  const berthed: WorldSlot | null = moor?.slot ?? null
  const from = berthed ? berthed.at : null

  /* where he is standing, so his own island is not offered, and whether a boat can take him */
  const here = sailFrom() ?? undefined
  /* A VOYAGE IS OFFERED FROM ANY MAP WITH A SCENE UNDER IT, not only from one
   * with water: the first leg of the journey is the walk out of the room, and
   * `sail_to` owns that. The old test was "is there an ocean under this
   * painting", which is why the chart's only control was dead in the Maw, which
   * is the room a student spends year one in. */
  const afloat = voyageListenerCount() > 0 || sailListenerCount() > 0

  /* every island gets the same drawn size, and it comes down as the archipelago
     fills up, because Ash has asked for dozens of these on one sheet */
  const pin = pinPx(slots.length)

  const rows: Row[] = slots.map((s) => {
    const dock = dockOf(s, save, from)
    return {
      key: s.map ?? s.place ?? s.title,
      slot: s,
      dock,
      /* A PLACE HE HAS NOT FOUND KEEPS ITS PAINTING TO ITSELF. Drawing the
         picture of a misty island is the chart doing the discovering, the same
         argument that already keeps its name off the paper. */
      cut: dock.named ? islandCut(s, pin) : null,
      thumb: dock.named ? islandCut(s, CHART_THUMB) : null,
      sailable: afloat && sailableRow({ dock, slot: s }, here, isAfloat()),
      /* why this row cannot be pressed, said out loud rather than left as a
         control that is simply absent (Ash, 2026-09-09: the chart went silent) */
      why: !afloat ? 'You have to be standing somewhere with a way to the water.'
        : !dock.named ? null
          : s.map === here ? 'You are already here.'
            : !s.berth ? 'Nobody has put a dock on this one yet.'
              : null,
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
     * and a line in somebody's python are one machine with one set of rules.
     * It is also where Ash's item 14 is answered: a student who is not at the
     * dock when he presses this gets the walk out and the boarding first, and
     * this page never teleports anybody. */
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
        {heading && <h2 className="ch-h">Chart</h2>}
        <Loading what="Loading the chart." />
      </div>
    )
  }

  if (!slots.length) {
    /* the document answered with nothing on it, which is an error rather than an empty sea */
    return (
      <div className="ch-chart">
        {heading && <h2 className="ch-h">Chart</h2>}
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

  /* the water fits what is on it, and its SHAPE is the shape of what is on it,
     which is the whole of why a distance on this page means anything */
  const box = chartBox(slots.map((s) => s.at))
  /* past this the names and the state lines wait to be asked for, since the
     kit's own type floor is wider than a pin once there are a dozen of them */
  const dense = slots.length > CHART_DENSE

  const known = new Set((save?.exposure ?? []).map((e) => e.place))
  const unvisited = (comp.regions ?? []).filter((r) => r.kind === 'sailable'
    && !slots.some((s) => known.has(s.place ?? '') && regionAt(comp, s.at)?.name === r.name))

  /* the boat marker carries the name the student typed at the pier */
  const boat = save?.boatName?.trim() || 'your boat'
  /* and she is drawn where she is actually tied up. The berth is a real point on
     the water and the chart used to stack her under the island's own mark with a
     hard-coded sixty-two pixel nudge, which was a guess at where a dock is. */
  const boatAt = berthed ? berthed.berth ?? berthed.at : null

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
      {heading && <h2 className="ch-h">Chart</h2>}

      <div className="ch-sea">
        <div
          className="ch-water"
          data-dense={dense ? '1' : undefined}
          /* THE WATER IS THE SHAPE OF THE WORLD. One number, and it is the whole
             fix for a chart that read 2.4 times wider than the sea it drew. */
          style={{
            aspectRatio: `${box.w} / ${box.h}`,
            /* AND IT NEVER GROWS PAST THE PAGE. Held to its shape, a tall world
               would take the whole binder page and push the register and the
               legend under a fold nobody knows is there, so the water narrows
               instead. `CHART_TALL` is the ceiling and the aspect does the rest. */
            width: `calc(${CHART_TALL} * ${box.aspect.toFixed(4)})`,
            /* the ruling, in world units turned into a share of each side, so the
               squares on the paper are square and mean a real distance */
            ['--ch-grid-x' as string]: `${(box.step / box.w) * 100}%`,
            ['--ch-grid-y' as string]: `${(box.step / box.h) * 100}%`,
          }}
          role="group"
          aria-label={`The archipelago. ${rows.length} place${rows.length === 1 ? '' : 's'}, and every one is listed underneath.`}
        >
          {/* a chart is oriented or it is a picture of the sea */}
          <span className="ch-north" aria-hidden="true">N</span>

          {/* the named water, drawn under everything, so "anywhere you have not
              been" is a thing on the page rather than a coordinate test */}
          {(comp.regions ?? []).map((r) => (
            <div key={r.name} className={`ch-region ch-region-${r.kind}`} style={{
              left: `${((r.rect.x - box.x0) / box.w) * 100}%`,
              top: `${((r.rect.y - box.y0) / box.h) * 100}%`,
              width: `${(r.rect.w / box.w) * 100}%`,
              height: `${(r.rect.h / box.h) * 100}%`,
            }}>
              <span className="ch-region-name">{r.label ?? r.name}</span>
            </div>
          ))}

          {/* ---- HIS OWN YEAR IS A LIST AND NOT A THING ON THE WATER --------
           *
           * ASH, after playing: *"even the chart is shitty."* Four of the seven things
           * drawn on the sea were not places. "AP Human Geography · counted as done"
           * and "Spanish I · counted as done" were pinned to the corners of the water,
           * which is a map of an archipelago with two class names floating on it. A
           * class has no island; that is exactly what the note under it said, and a
           * map is the wrong place to say it.
           *
           * They moved to the register below, where the year's picks belong and where
           * a row can say "no island yet" without sitting on the sea. The water now
           * holds islands, regions, and his boat. Nothing else. */}

          {rows.map((r) => {
            const badge = r.cut ? badgeOf(r.dock) : null
            const body = (
              <>
                {r.cut
                  ? <Painting cut={r.cut} lift />
                  : (
                    <span className="ch-blank" style={{ width: pin, height: pin, marginTop: -pin / 2 }}>
                      <DockRow dock={r.dock} />
                    </span>
                  )}
                {badge && (
                  <span className="ch-badge" title={badge.word}>
                    {badge.face
                      ? <Glyph piece={badge.face[0]} face={badge.face[1]} size={15} fallback={<span className={`ch-s ${badge.shape}`} />} />
                      : <span className={`ch-s ${badge.shape}`} />}
                  </span>
                )}
                <span className="ch-card">
                  <span className="ch-name">{r.name}</span>
                  <span className="ch-note">{r.line}</span>
                  {r.sailable
                    ? <span className="ch-sail">Sail here</span>
                    : r.why ? <span className="ch-shut">{r.why}</span> : null}
                </span>
              </>
            )
            const at = atPct(box, r.slot.at)
            /* ---- THE CARD FLIPS RATHER THAN FALLING OFF THE WATER ----------
             *
             * The name, the state line and the Sail control hang UNDER the island, and
             * an island low on the chart hangs them off the bottom edge of the water,
             * where they are clipped: the ATC island's own "Sail here" was cut in half
             * on the shipped screen. Below the halfway line the card goes above the
             * island instead. It is the same card either way; only which side of the
             * picture it sits on changes. */
            const low = parseFloat(at.top) > 52
            const flip = low ? ' ch-isle-flip' : ''
            /* a button only where there is somewhere to go. A control that is
             * always there and usually refuses teaches a student that the chart
             * does not work. */
            return r.sailable ? (
              <button
                key={r.key}
                type="button"
                data-key={r.key}
                className={`ch-isle ch-${r.dock.state} ch-isle-go${flip}`}
                data-inked={inked.has(r.key) ? '1' : undefined}
                style={at}
                aria-label={`Sail to ${r.name}. ${r.line}`}
                title={`${r.name}. ${r.line}`}
                onClick={() => sail(r)}
              >
                {body}
              </button>
            ) : (
              <div
                key={r.key}
                data-key={r.key}
                className={`ch-isle ch-${r.dock.state}${flip}`}
                data-inked={inked.has(r.key) ? '1' : undefined}
                style={at}
                title={`${r.name}. ${r.line}`}
              >
                {body}
              </div>
            )
          })}

          {boatAt && (
            <div className="ch-you" style={atPct(box, boatAt)}>
              <span className="ch-s ch-s-ship" />
              <span className="ch-you-name">{boat}</span>
            </div>
          )}
        </div>
      </div>

      {/* ---- what the picture means, directly under the picture. It is its own
              paragraph because the plain arm has no picture, and a page that
              explains a drawing nobody can see is a page telling a lie. */}
      <p className="ch-legend ch-legend-pic">
        Every island is drawn as its own painting, and the squares on the water are all one size, so
        how far apart two islands look is how far apart they really are.
      </p>
      {(unvisited.length > 0 || builtIn) && (
        <p className="ch-legend">
          {unvisited.length
            ? `${unvisited.map((r) => r.label ?? r.name).join(' and ')} ${unvisited.length > 1 ? 'are areas' : 'is an area'} you have not sailed to yet.`
            : ''}
          {builtIn ? ' The place list would not download, so this is the copy built into the game.' : ''}
        </p>
      )}

      {lonely && (
        <Empty
          what={isles === 1 ? 'One island is on the map so far.' : 'No island is on the map yet.'}
          fills={SEA_IS_YOUNG}
        />
      )}

      {/* ---- the register list, which is the same facts as a list and is in both arms */}
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
            {/* the same painting again, small, so the list and the water are
                obviously about the same islands */}
            {r.thumb && (
              <span className="ch-row-pic" aria-hidden="true">
                <Painting cut={r.thumb} />
              </span>
            )}
            <span className="ch-row-marks" aria-hidden="true"><DockRow dock={r.dock} /></span>
            <span className="ch-row-words">
              <span className="ch-row-name">{r.name}</span>
              <span className="ch-row-state">{r.line}</span>
              {/* ---- AND WHEN IT CANNOT, IT SAYS WHY (Ash, 2026-09-09) -------
                  *
                  * A row that cannot be sailed simply had no control, so a
                  * student who opened the Map from inside a room saw the island
                  * he wanted, found nothing to press anywhere on the page, and
                  * no sentence telling him he had to be somewhere else first.
                  * An absent control is not an answer. */}
              {!r.sailable && r.why && <span className="ch-row-closed">{r.why}</span>}
              {/* THE SCHOOL'S OWN SENTENCE, AND NEVER AN ERROR. §9.17 state 6:
                  out of season "must never read as broken", and the words come
                  off `SPORT_SEASONS` rather than being written per island. */}
              {r.dock.closed && r.dock.closed !== r.line && (
                <span className="ch-row-closed">{r.dock.closed}</span>
              )}
            </span>
            {/* THE PLAIN ARM'S ONLY WAY ONTO THE WATER, and the way a keyboard
                reaches every island in one pass. The water above is hidden under
                that skin and this list is not, so the row carries its own
                control rather than the picture carrying the only one. */}
            {r.sailable && (
              <Plank size="sm" className="ch-row-go" onClick={() => sail(r)}>
                Sail to {r.name}
              </Plank>
            )}
          </li>
        ))}
        {/* the year's own picks that nobody has built an island for. Last in the
            list, plainly said, and off the water. */}
        {owed.map((p) => (
          <li className="ch-row ch-row-owed" key={`pick:${p.id}`}>
            <span className="ch-row-marks" aria-hidden="true"><span className="ch-s ch-s-pip ch-s-pip-shut" /></span>
            <span className="ch-row-words">
              <span className="ch-row-name">{p.name}</span>
              <span className="ch-row-state">
                {p.done
                  ? 'Counted as done on your year sheet. It has no island to sail to.'
                  : 'On your year sheet. Nobody has built its island yet.'}
              </span>
            </span>
          </li>
        ))}
      </ul>

    </div>
  )
}
