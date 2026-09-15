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
/* the moment asks for this sentence verbatim, but it is written plain instead: it names what an island really is and who is building the others */
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

/* the one mark an island wears on the water: at forty pixels across six marks are a smear, so only the loudest shows, seal then flag then star then tick, and the register underneath draws the whole six wide rail where an empty place is legible as an empty place */
const BADGE_ORDER = ['stamp', 'flag', 'open', 'ashore'] as const

const badgeOf = (dock: Dock): DockDrawn | null => {
  for (const want of BADGE_ORDER) {
    const m = dock.slots.find((s) => s.kind === want)
    if (m?.on) return m
  }
  return null
}

/* `public/maps-vendored/<map>/scene.png` is the whole canvas and mostly transparent margin, so the window is the painted extent the world document records, with the picture pulled up and left behind it; one miss is retried against the committed folder rather than leaving a hole */
function Painting({ cut, lift = false }: { cut: IslandCut; lift?: boolean }) {
  const [src, setSrc] = useState(cut.src)
  const [gone, setGone] = useState(false)
  useEffect(() => { setSrc(cut.src); setGone(false) }, [cut.src])
  return (
    <span
      className={`ch-pic${gone ? ' ch-pic-gone' : ''}`}
      style={{ width: cut.w, height: cut.h, marginTop: lift ? -cut.h / 2 : 0 }}
    >
      {/* with no painting the old pin stands, because a browser's broken picture icon on a chart is worse and the island is a real place either way */}
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
              /* say which bundle did not answer, because a silently missing island is a chart with a hole in it */
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
    /* the island you are on is offered while you are afloat on it: you cannot sail to where you are standing, but a player at the tiller on that island's own water has to be able to put in and the pin is the only control on this page */
    && (r.slot.map !== here || onWater)
}

/** `onSailing` lets whatever opened the chart get out of the way once the ship is moving, and the Handbook passes its own close */
export function Chart({ onSailing, heading = true }: { onSailing?: () => void; heading?: boolean } = {}) {
  const [comp, setComp] = useState<WorldComposition | null>(compositionCache)
  const [, bump] = useState(0)
  const [inked, setInked] = useState<ReadonlySet<string>>(() => new Set())
  /* what each slot looked like on the previous draw, so the chart inks itself rather than swapping; it is subscribed to the save, so a discovery that lands while the binder is open is a thing a student watches */
  const before = useRef(new Map<string, SlotState>())

  useEffect(() => { void loadComposition().then(setComp) }, [])
  useEffect(() => subscribeSave(() => bump((v) => v + 1)), [])
  /* and a redraw when the player gets in or out of the boat, because that decides whether the island being stood on may be pressed */
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
  /* a voyage is offered from any map with a scene under it, not only from one with water, because the first leg is the walk out of the room and `sail_to` owns that; testing for an ocean under the painting left the chart's only control dead in the Maw */
  const afloat = voyageListenerCount() > 0 || sailListenerCount() > 0

  /* every island gets the same drawn size and it comes down as the archipelago fills up, because dozens of these have to fit on one sheet */
  const pin = pinPx(slots.length)

  const rows: Row[] = slots.map((s) => {
    const dock = dockOf(s, save, from)
    return {
      key: s.map ?? s.place ?? s.title,
      slot: s,
      dock,
      /* a place that has not been found keeps its painting to itself, because drawing a misty island is the chart doing the discovering, the same argument that keeps its name off the paper */
      cut: dock.named ? islandCut(s, pin) : null,
      thumb: dock.named ? islandCut(s, CHART_THUMB) : null,
      sailable: afloat && sailableRow({ dock, slot: s }, here, isAfloat()),
      /* why this row cannot be pressed, said out loud rather than left as a control that is simply absent, because the chart went silent that way once */
      why: !afloat ? 'You have to be standing somewhere with a way to the water.'
        : !dock.named ? null
          : s.map === here ? 'You are already here.'
            : !s.berth ? 'Nobody has put a dock on this one yet.'
              : null,
      line: stateLine(dock.state, s, save),
      /* a misty island has no name on the chart, because printing the title of a place nobody has sailed to is the chart doing the discovering for them */
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

  /* every click answers, including the ones that cannot go: a refusal is a sentence on the screen and in the reader's ear rather than a row that swallows the press */
  const sail = (r: Row) => {
    /* `requestVoyage` is the whole journey and is the same `sail_to` a member's island writes, so a pin and a line of python are one machine; `requestSail` only steers a hull on this painting's own ocean and refuses anything past the canvas as aground, which is every island in the world, and this page never teleports anybody */
    void requestVoyage(r.slot.map!).then((a) => {
      if (a.ok) {
        announce(`Sailing to ${r.name}.`)
        onSailing?.()
        return
      }
      /* the other kind of sailing is the fallback, not a second control: `requestVoyage` refuses the island you are already on, and `requestSail` hands the helm to a hull on this painting's own ocean, which is what putting in to your own harbour is */
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

  /* the year's picks that nobody has built, drawn round the edge of the paper rather than in the sea */
  const owed = picksOf(save).filter((p) => !p.map)

  /* the water fits what is on it and its shape is the shape of what is on it, which is why a distance on this page means anything */
  const box = chartBox(slots.map((s) => s.at))
  /* past this the names and the state lines wait to be asked for, since the kit's own type floor is wider than a pin once there are a dozen of them */
  const dense = slots.length > CHART_DENSE

  const known = new Set((save?.exposure ?? []).map((e) => e.place))
  const unvisited = (comp.regions ?? []).filter((r) => r.kind === 'sailable'
    && !slots.some((s) => known.has(s.place ?? '') && regionAt(comp, s.at)?.name === r.name))

  /* the boat marker carries the name the student typed at the pier */
  const boat = save?.boatName?.trim() || 'your boat'
  /* she is drawn where she is actually tied up, because the berth is a real point on the water and stacking her under the island's mark with a hard coded sixty-two pixel nudge was a guess at where a dock is */
  const boatAt = berthed ? berthed.berth ?? berthed.at : null

  /* the platform could not be reached and the game is drawing the copy built into it, said out loud because "the chart looks wrong" is not something a teacher or a member can act on */
  const builtIn = compositionReport().origin === 'built in'
  /* one island and nothing else out there is the first deployment rather than a defect */
  const isles = slots.filter((s) => !!s.map).length
  const lonely = isles <= 1

  return (
    <div className="ch-chart">
      {heading && <h2 className="ch-h">Chart</h2>}

      <div className="ch-sea">
        <div
          className="ch-water"
          data-dense={dense ? '1' : undefined}
          /* the water is the shape of the world: one number, and it is the whole fix for a chart that read 2.4 times wider than the sea it drew */
          style={{
            aspectRatio: `${box.w} / ${box.h}`,
            /* and it never grows past the page: held to its shape a tall world would push the register and the legend under a fold nobody knows is there, so the water narrows instead, with `CHART_TALL` as the ceiling and the aspect doing the rest */
            width: `calc(${CHART_TALL} * ${box.aspect.toFixed(4)})`,
            /* the ruling, in world units turned into a share of each side, so the squares on the paper are square and mean a real distance */
            ['--ch-grid-x' as string]: `${(box.step / box.w) * 100}%`,
            ['--ch-grid-y' as string]: `${(box.step / box.h) * 100}%`,
          }}
          role="group"
          aria-label={`The archipelago. ${rows.length} place${rows.length === 1 ? '' : 's'}, and every one is listed underneath.`}
        >
          {/* a chart is oriented or it is a picture of the sea */}
          <span className="ch-north" aria-hidden="true">N</span>

          {/* the named water, drawn under everything, so "anywhere you have not been" is a thing on the page rather than a coordinate test */}
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

          {/* a year's picks are a list and not a thing on the water: four of the seven marks drawn on the sea were class names rather than places, so they moved to the register below where a row can say it has no island yet, and the water holds islands, regions and the boat and nothing else */}

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
            /* the card flips rather than falling off the water: the name, the state line and the Sail control hang under the island, and below the halfway line they get clipped by the bottom edge, so the same card goes above the island instead */
            const low = parseFloat(at.top) > 52
            const flip = low ? ' ch-isle-flip' : ''
            /* a button only where there is somewhere to go, because a control that is always there and usually refuses teaches a student that the chart does not work */
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

      {/* what the picture means, directly under the picture, and its own paragraph because the plain arm has no picture and a page explaining a drawing nobody can see is telling a lie */}
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
            {/* the same painting again, small, so the list and the water are obviously about the same islands */}
            {r.thumb && (
              <span className="ch-row-pic" aria-hidden="true">
                <Painting cut={r.thumb} />
              </span>
            )}
            <span className="ch-row-marks" aria-hidden="true"><DockRow dock={r.dock} /></span>
            <span className="ch-row-words">
              <span className="ch-row-name">{r.name}</span>
              <span className="ch-row-state">{r.line}</span>
              {/* a row that cannot be sailed says why: with no control at all a student opening the map from inside a room saw the island, found nothing to press anywhere on the page, and no sentence saying they had to be somewhere else first */}
              {!r.sailable && r.why && <span className="ch-row-closed">{r.why}</span>}
              {/* the school's own sentence and never an error: out of season must never read as broken, and the words come off `SPORT_SEASONS` rather than being written per island */}
              {r.dock.closed && r.dock.closed !== r.line && (
                <span className="ch-row-closed">{r.dock.closed}</span>
              )}
            </span>
            {/* the plain arm's only way onto the water, and the way a keyboard reaches every island in one pass, because the water above is hidden under that skin and this list is not */}
            {r.sailable && (
              <Plank size="sm" className="ch-row-go" onClick={() => sail(r)}>
                Sail to {r.name}
              </Plank>
            )}
          </li>
        ))}
        {/* the year's own picks that nobody has built an island for, last in the list and off the water */}
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
