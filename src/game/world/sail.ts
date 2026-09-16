/* the hull: a boat on the world, as pure state that one tick advances */

/** the eight-way heading vocabulary, shared with the walk so a berth's `facing` means the same thing to a hull as it does to a body */
export const HEADINGS = [
  'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east',
] as const
export type Heading = typeof HEADINGS[number]

export const headingOf = (dx: number, dy: number): Heading => {
  const a = Math.atan2(dy, dx)
  const i = Math.round(a / (Math.PI / 4))
  return HEADINGS[((i % 8) + 8) % 8]
}

export type HullState = {
  x: number
  y: number
  /** radians, and the hull turns toward it rather than snapping */
  heading: number
  /** ocean px per second along the heading, never negative */
  speed: number
  /* aground is a state, held until the hull makes progress back toward deep water */
  aground: boolean
  /** the wake, oldest first, with a hard cap so a long crossing cannot grow it */
  wake: WakePt[]
}

/* two wake trails laid from the hull's quarters, each point ageing on its own */
export type WakePt = { x: number; y: number; side: -1 | 1; age: number }

export type SailCfg = {
  /** cruising top speed in ocean px/s, off `map.json`'s own `speed` */
  cruise: number
  /** what a held full-sail key raises the CEILING to, never the acceleration */
  fullSail: number
  /** ocean px per second per second */
  accel: number
  /** how fast the hull sheds speed with no throttle */
  drag: number
  /** radians per second the bow can come round, scaled down at speed */
  turn: number
  /** the circular probe's radius: how far from the hull's centre the coast bites */
  probe: number
  /** wake points kept. A hard pool cap, because a crossing is unbounded. */
  wakeCap: number
  /** seconds a wake point lives */
  wakeLife: number
  /** how far off the centreline the two trails are laid */
  wakeSpread: number
}

/* how fast a boat goes: holding 144 of a 150 ceiling for a whole voyage leaves no range, so cruise comes down, full sail stays well above it and the bow comes round slower, which costs about a third more crossing time; a map may still name its own `speed`. */
export const DEFAULT_SAIL: SailCfg = {
  cruise: 96, fullSail: 170, accel: 62, drag: 46, turn: 1.7,
  /* a short wake: at 3.2 seconds and this speed the foam ran three hundred world pixels astern, most of the screen at the sailing zoom, and a boat's wake closes up behind her */
  probe: 26, wakeCap: 170, wakeLife: 1.5, wakeSpread: 7,
}

/** what the player is asking for this tick: `turn` is -1, 0 or 1 and `throttle` is 0 or 1, so a keyboard and a pointer both reduce to the same shape */
export type Helm = { throttle: number; turn: number; fullSail: boolean }

export const HELM_IDLE: Helm = { throttle: 0, turn: 0, fullSail: false }

/* steering at a mark: a hard over `turn > 0 ? 1 : -1` wheel turned a tenth of the crossing faster than 52 degrees a second and hit 367 on the worst frame, so the wheel moves in proportion to the heading error and the throttle eases off through a big turn */
export const SOFT_RAD = 0.55
export function steerTo(s: HullState, aim: { x: number; y: number }, full = false): Helm {
  const want = Math.atan2(aim.y - s.y, aim.x - s.x)
  let err = want - s.heading
  while (err > Math.PI) err -= 2 * Math.PI
  while (err < -Math.PI) err += 2 * Math.PI
  const turn = Math.max(-1, Math.min(1, err / SOFT_RAD))
  /* square-nosed on purpose: a small error costs nothing and a hairpin costs most of the way on, and `0.25` is the floor so she never stops dead in the middle of a turn */
  const ease = Math.max(0.25, 1 - Math.abs(err) / Math.PI)
  return { throttle: ease, turn: Math.abs(turn) < 0.04 ? 0 : turn, fullSail: full }
}

/* the same law as `steerTo` for a helm that already knows its heading error: the wheel in proportion, and the way off through a hard turn */
export function easeHelm(err: number, throttle: number): Helm {
  const turn = Math.max(-1, Math.min(1, err / SOFT_RAD))
  const ease = Math.max(0.25, 1 - Math.abs(err) / Math.PI)
  return { throttle: throttle * ease, turn: Math.abs(turn) < 0.04 ? 0 : turn, fullSail: false }
}

/* the mark astern of the berth, on its own heading, that the run-in comes down from: walked outward until the water runs out so it is never on land, and no further out than her turning circle needs, because a flat 320px sent her back out to sea; exported so a route can be searched to it over water */
/* she never sails away from the berth to line up: born 140px out on the approach line with the mark at 210, she turned a full circle to reach a mark she was already 70px inside; on the line, astern and no further out than the mark, she keeps coming. ahead of the berth still needs the loop. */
export function insideTheApproach(
  from: { x: number; y: number },
  berth: { x: number; y: number },
  facing: number,
  mark: { x: number; y: number } | null,
  heading?: number,
): boolean {
  const fx = Math.cos(facing), fy = Math.sin(facing)
  const dx = from.x - berth.x, dy = from.y - berth.y
  const along = dx * fx + dy * fy
  /* astern of it, which is the only side a run-in can come from */
  if (along >= 0) return false
  const cross = Math.abs(dx * -fy + dy * fx)
  if (cross > RUN_IN_CORRIDOR_PX) return false
  /* and pointed down it: a hull crossing the corridor sideways is inside it by the arithmetic, and telling her to keep coming made her stop and turn on the spot, so lined up the wrong way round the mark is worth going to, because standing off gives her room to turn under way */
  if (heading !== undefined && Math.abs(wrap(heading - facing)) > LINED_UP_RAD) return false
  /* and not further out than the mark, or there is more line to gain by standing off; no mark at all means the line is short of water, so being on it this close is the best she gets */
  if (!mark) return true
  const markOut = Math.hypot(mark.x - berth.x, mark.y - berth.y)
  return -along <= markOut + 20
}

export function lineUpPoint(
  target: { x: number; y: number },
  facing: number,
  cfg: SailCfg = DEFAULT_SAIL,
  ok?: Navigable,
): { x: number; y: number } | null {
  const fx = Math.cos(facing), fy = Math.sin(facing)
  const radius = cfg.cruise / Math.max(0.2, cfg.turn * 0.74)
  const reach = Math.max(RUN_IN_CORRIDOR_PX, Math.min(RUN_IN_ROUND_PX, radius * 3))
  let back = 0
  for (let d = RUN_IN_CORRIDOR_PX; d <= reach; d += 20) {
    if (ok && !ok(target.x - fx * d, target.y - fy * d)) break
    back = d
  }
  if (!back) return null
  return { x: target.x - fx * back, y: target.y - fy * back }
}

export const newHull = (x: number, y: number, heading = 0): HullState =>
  ({ x, y, heading, speed: 0, aground: false, wake: [] })

/* how deep the water is at a point: positive is water, negative is land */
export type DepthAt = (x: number, y: number) => number

/* one tick of the hull, returning a new state */
export function stepHull(s: HullState, helm: Helm, dt: number, depth: DepthAt, cfg = DEFAULT_SAIL): HullState {
  const d = Math.max(0, Math.min(dt, 0.1))          // a hidden tab must not teleport a hull
  const ceiling = helm.fullSail ? cfg.fullSail : cfg.cruise

  /* the bow comes round slower the faster she goes; a steerage-way cut at low speed was tried and removed because the frames that turn hardest are the run-in at thirty to fifty pixels a second where the factor is already ~1, and it stopped a player at rest pointing the boat */
  const rate = cfg.turn * (1 - 0.45 * Math.min(1, s.speed / Math.max(1, cfg.fullSail)))
  const heading = s.heading + helm.turn * rate * d

  let speed = s.speed
  /* the throttle is a fraction and not a switch so a helm can ease off through a turn, and the ceiling comes down with it or a quarter throttle still coasts at cruise until drag notices */
  const want = ceiling * Math.max(0, Math.min(1, helm.throttle))
  if (helm.throttle > 0) speed = Math.min(want, speed + cfg.accel * d * helm.throttle)
  else speed = Math.max(0, speed - cfg.drag * d)
  /* dropping full sail does not stop her dead: the ceiling falls and drag brings her down to it, so letting go feels like easing off rather than braking */
  const top = helm.throttle > 0 ? want : ceiling
  if (speed > top) speed = Math.max(top, speed - cfg.drag * d)

  let nx = s.x + Math.cos(heading) * speed * d
  let ny = s.y + Math.sin(heading) * speed * d

  /* the coast, read off the shared distance field with a circular probe */
  const here = depth(s.x, s.y)
  const there = depth(nx, ny)
  const grounded = there < cfg.probe
  let aground = s.aground

  if (grounded) {
    if (there > here + 0.01) {
      aground = true                                 // still on it, but coming off
    } else {
      /* slide along the coast rather than stop dead, keeping the axis that is no shallower */
      const ax = depth(nx, s.y), ay = depth(s.x, ny)
      const okx = ax >= here - 0.01, oky = ay >= here - 0.01
      if (okx && (!oky || ax >= ay)) { ny = s.y }
      else if (oky) { nx = s.x }
      else { nx = s.x; ny = s.y; speed = Math.min(speed, cfg.cruise * 0.15) }
      aground = true
    }
  } else {
    aground = false
  }

  /* the wake, laid from the quarters only while she is actually moving */
  const wake: WakePt[] = []
  for (const p of s.wake) {
    const age = p.age + d
    if (age < cfg.wakeLife) wake.push({ ...p, age })
  }
  /* two wake points a frame means the trail's length is whatever the frame rate is, so the cap is generous: at 60 frames the pool holds about three seconds and at 30 it holds six, and the fade on age makes both look the same length */
  if (speed > cfg.cruise * 0.12) {
    const bx = -Math.cos(heading), by = -Math.sin(heading)
    const px = -by, py = bx                          // the perpendicular, for the spread
    const qx = nx + bx * cfg.probe * 0.55, qy = ny + by * cfg.probe * 0.55
    wake.push({ x: qx + px * cfg.wakeSpread, y: qy + py * cfg.wakeSpread, side: 1, age: 0 })
    wake.push({ x: qx - px * cfg.wakeSpread, y: qy - py * cfg.wakeSpread, side: -1, age: 0 })
  }
  /* the hard pool cap, for the same reason the ocean's own sprite pools exist: an unbounded crossing on a 4 GB Chromebook is how a class of machines gets worse over a semester */
  while (wake.length > cfg.wakeCap) wake.shift()

  return { x: nx, y: ny, heading, speed, aground, wake }
}

/* berthing: a manoeuvre that runs as a helm, so the same physics does the docking */
export type Berthing = {
  target: { x: number; y: number }
  /** the heading to end on, in radians. Absent means "whatever you arrive on". */
  facing?: number
  /** the point to make for before the final run in, so she does not cut a corner */
  approach?: { x: number; y: number }
  /* how far along the manoeuvre is, and given_up hands the helm back to the player */
  stage: 'approach' | 'alongside' | 'done' | 'given_up'
  /* the watchdog: how close she has ever got, and how long since she last beat it */
  best?: number
  stuckMs?: number
}

/** how long without getting any closer before the manoeuvre gives the helm back */
export const BERTH_GIVE_UP_MS = 4000
/** getting this much closer counts as progress, so noise is not progress */
export const BERTH_PROGRESS_PX = 2

export const ALONGSIDE_PX = 18
/* how far off the mark still counts as tied up when she can get no closer: a berth can sit where a 26px draught cannot reach, and on the hub she stops 39px short unable to close, so alongside means within a hull's length, lying the right way and unable to do better; the exact mark wins when reachable */
export const ALONGSIDE_MAX_PX = 52
/** how long she has to be unable to improve before being beside it is good enough */
export const ALONGSIDE_SETTLED_MS = 1200
/** how close to the authored heading counts as parallel to the dock */
export const ALONGSIDE_RAD = 0.3

/* how far back down the berth's line she steers for, as a fraction of the distance still out: driving at the berth as a point arrived 121 degrees off the authored heading and pirouetted 100 degrees on the spot, so she steers at a point on the line and converges as it slides into the berth */
/** how much of the run she has left is spent closing on the line rather than the berth */
export const RUN_IN_LOOK = 0.85
/* how far astern the rendezvous sits: at cruise she turns at about 1.6 rad/s and makes 150px/s, so her turning circle is roughly 92px of radius and swinging a bow through 180 degrees needs about 300px of water */
export const RUN_IN_ROUND_PX = 320
/** how far off the line still counts as being in the approach corridor */
export const RUN_IN_CORRIDOR_PX = 90
/** and how far off the berth's own heading still counts as lined up for it */
export const LINED_UP_RAD = 0.9

const wrap = (a: number): number => {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r < -Math.PI) r += Math.PI * 2
  return r
}

/** the helm a berthing manoeuvre wants this tick, and how far along it is; `dt` is only needed by the watchdog, and leaving it out runs the manoeuvre with no give-up, which is what the pure tests want */
/* an optional water test, because a derived rendezvous cannot tell whether the water it names exists: on the hub it landed off the map, she sailed at it, ran aground and the manoeuvre gave up. left out, everything is water. */
export type Navigable = (x: number, y: number) => boolean

export function berthHelm(
  s: HullState, b: Berthing, cfg = DEFAULT_SAIL, dt = 0, ok?: Navigable,
): { helm: Helm; next: Berthing } {
  if (b.stage === 'done' || b.stage === 'given_up') return { helm: HELM_IDLE, next: b }

  /* the watchdog, run before anything else this tick, and measured against what she is steering for rather than always the berth: while making for an authored approach point getting further from the berth is correct, and a berth-only watchdog called a working manoeuvre stuck 242px out */
  const aimNow = b.stage === 'approach' && b.facing !== undefined
    ? {
      x: (b.approach ?? b.target).x - (b.approach ? 0 : Math.cos(b.facing) * RUN_IN_ROUND_PX),
      y: (b.approach ?? b.target).y - (b.approach ? 0 : Math.sin(b.facing) * RUN_IN_ROUND_PX),
    }
    : b.stage === 'approach' && b.approach ? b.approach : b.target
  const gap = Math.hypot(aimNow.x - s.x, aimNow.y - s.y)
  let best = b.best ?? gap
  let stuckMs = b.stuckMs ?? 0
  if (dt > 0) {
    if (gap < best - BERTH_PROGRESS_PX) { best = gap; stuckMs = 0 }
    else stuckMs += dt * 1000
    if (stuckMs >= BERTH_GIVE_UP_MS)
      return { helm: HELM_IDLE, next: { ...b, stage: 'given_up', best, stuckMs } }
  }
  const watched = (n: Berthing): Berthing => ({ ...n, best, stuckMs })
  /* the tally starts again when the aim changes, and the gate's leftover distance carries into the run-in */
  const restart = (n: Berthing): Berthing => ({ ...n, best: undefined, stuckMs: 0 })

  if (b.stage === 'approach') {
    /* make for an authored approach point first, so she comes at the dock down its own line instead of cutting across the shallows: a derived gate is a position and she arrives at one pointing whatever way she came, which from two of twelve bearings left 165 degrees to turn in the last 260px */
    /* the rendezvous when nobody drew an approach point: on the berth's line, a turning circle astern, to put her in the corridor for the run-in. astern and near the line counts however close, because the hub hands her over 69px out and a 320px trip back to sea drove her away from a dock she had reached. */
    let aim = b.approach
    if (!aim && b.facing !== undefined) {
      const fx = Math.cos(b.facing), fy = Math.sin(b.facing)
      const along = (s.x - b.target.x) * fx + (s.y - b.target.y) * fy
      const cross = Math.abs(-(s.x - b.target.x) * fy + (s.y - b.target.y) * fx)
      /* and she needs the room to straighten: astern and near the line is not enough, since a boat 30px astern pointing 146 degrees away has nowhere to turn and pirouetted at the dock, so the room is her heading error times her turning radius, and none inside the tolerance */
      const off = Math.abs(wrap(b.facing - s.heading))
      const radius = cfg.cruise / Math.max(0.2, cfg.turn * 0.74)
      const room = off < ALONGSIDE_RAD ? 0 : off * radius
      /* `along < 0` means astern of the berth, and a hull exactly on the mark has along = 0: simulated, a boat at the berth at rest was sent 333px out to sea and back over 7.75 seconds while the same boat half a pixel astern was done in one frame, and along = 0 is what `board()` leaves */
      /* and she has to be sitting there, not arriving at speed: close alone let a hull coming in head-on at cruise into the run-in from the wrong side and it finished with a 139-degree turn on the spot, so this clause is only for the boat `board()` leaves at the berth, which is at rest */
      const gap = Math.hypot(b.target.x - s.x, b.target.y - s.y)
      const near = gap <= ALONGSIDE_MAX_PX && s.speed < cfg.cruise * 0.5
      /* she never sails past a dock she is already at: handed over 70px out still doing 96 with the lineup mark 210px away on the far side, she ran 175px to sea, turned through 176 degrees and came back over seven seconds, so inside the lineup distance the approach stage is over whatever her heading */
      const lineUp = lineUpPoint(b.target, b.facing, cfg, ok)
      /* she is already inside the approach: going to the mark would take her through her own berth, which is the loop rather than the manoeuvre */
      const onHerRunAlready = insideTheApproach(s, b.target, b.facing, lineUp, s.heading)
      /* close enough that going round again is the silly answer: a boat 210 pixels out still has room for a proper approach, one seventy pixels from her dock does not, and the corridor width is the line between them because it is already this manoeuvre's word for beside the dock */
      /* and she has to have the way off her: a hull still at cruise seventy pixels out cannot turn onto the line from here and finishes standing still, measured at one bearing in twelve spinning 0.71 radians at rest, so slow and close manoeuvres while fast and close goes round */
      const onTopOfIt = gap <= RUN_IN_CORRIDOR_PX && s.speed < cfg.cruise * 0.55
      if (near || onTopOfIt || onHerRunAlready
        || (along < 0 && cross < RUN_IN_CORRIDOR_PX && -along >= room))
        return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)
      /* the furthest point back down the line that is still water, walked out from the berth rather than assumed, because a short rendezvous is worse than a long one and a dry one is worse than either */
      /* and no further out than she needs: a flat 320px ceiling made the approach stage 143 frames of a 272 frame crossing with a path 1.76 times the straight line, and what she needs is room to straighten, which is her turning circle rather than a constant */
      /* nothing navigable astern at all: there is no approach to make, so she is handed to the run-in and does what she can from where she is */
      if (!lineUp) return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)
      aim = lineUp
    }
    if (!aim) return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)
    const dx = aim.x - s.x, dy = aim.y - s.y
    const d = Math.hypot(dx, dy)

    /* a waypoint is passed rather than hit: the test is whether it is behind the bow */
    const ahead = Math.cos(s.heading) * dx + Math.sin(s.heading) * dy
    if (d < ALONGSIDE_PX * 2 || (ahead < 0 && d < cfg.cruise))
      return berthHelm(s, restart({ ...b, stage: 'alongside' }), cfg, dt, ok)

    const err = wrap(Math.atan2(dy, dx) - s.heading)
    /* she carries her way through the gate because it is a waypoint she passes, not a mark she stops at: braking for it measured 150 down to 63 and straight back to 150, a stop-start in open water; she eases off only when the bow has more than a right angle to come through, since speed is what makes a turn wide */
    const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
    const hardTurn = Math.abs(err) > Math.PI / 2 && d < stopIn + ALONGSIDE_PX * 2
    /* she does not slow for the rendezvous: coming down to docking speed on the way in leaves her with no way on, and a rudder cannot turn a hull with no way on, so the last of the turn happens standing still and two of twelve bearings finished pirouetting 1.2 and 2.0 radians; the way comes off on the run-in */
    return { helm: easeHelm(err, hardTurn ? 0 : 1), next: watched(b) }
  }

  const dx = b.target.x - s.x, dy = b.target.y - s.y
  const dist = Math.hypot(dx, dy)

  /* inside the berth: no throttle, and swing onto the authored heading, which the run-in has made a degree or two of settling rather than a hundred-degree pirouette; it stays because a hull already tied up and asked to dock again is at zero distance on whatever heading she was left on */
  if (dist <= ALONGSIDE_PX) {
    const err = b.facing === undefined ? 0 : wrap(b.facing - s.heading)
    if (s.speed < cfg.cruise * 0.12 && Math.abs(err) < ALONGSIDE_RAD)
      return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
    return { helm: { throttle: 0, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false }, next: watched(b) }
  }

  /* she warps round and ties up when she is beside it and unable to do better: grounding 46px from the mark but 33 degrees off its line got her refused on heading, and four seconds later the watchdog said she could not dock, so this turns her instead of only testing her, and needs her close first */
  if (dist <= ALONGSIDE_MAX_PX && stuckMs >= ALONGSIDE_SETTLED_MS) {
    /* she has to have stopped, the same gate the exact clause above keeps: without it the conditions were within 52px and not 2px closer in a second, which a hull passing a heading-less berth at 150px/s satisfies, and it was declared tied up 50px off the mark still moving */
    if (s.speed >= cfg.cruise * 0.12) return { helm: { throttle: 0, turn: 0, fullSail: false }, next: watched(b) }
    /* and a berth with no heading is not a berth she is already lying along: treating a missing facing as a perfect one left no heading gate at all on exactly the berths nobody has aimed, so the honest test is twice the patience on running out of ways to get closer */
    if (b.facing === undefined) {
      if (stuckMs >= ALONGSIDE_SETTLED_MS * 2)
        return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
      return { helm: { throttle: 0, turn: 0, fullSail: false }, next: watched(b) }
    }
    const err = wrap(b.facing - s.heading)
    if (Math.abs(err) < ALONGSIDE_RAD * 1.5)
      return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
    return { helm: easeHelm(err, 0), next: watched(b) }
  }

  /* she steers onto the dock's line, not at the dock: her position is projected onto that line and she steers at a mark further along it, never past the berth, so her heading converges as the mark becomes the berth; a gate astern left two of twelve bearings 165 degrees to turn in the last 260px */
  let aimX = b.target.x, aimY = b.target.y
  if (b.facing !== undefined) {
    const fx = Math.cos(b.facing), fy = Math.sin(b.facing)
    /* how far along the line she is, measured from the berth; astern of it is negative, which is where a boat coming in to dock always is */
    const along = (s.x - b.target.x) * fx + (s.y - b.target.y) * fy
    /* a fixed look-ahead past the berth never terminates, one clamped at the berth collapses onto it and spends the last 130px steering at the dock rather than along it, which put eight of twelve bearings back to turning on the spot, so the mark is a fraction of the distance still to come */
    /* astern of the berth, which the approach stage's corridor gate has already made true; past it she has overshot and the berth itself is the mark */
    const at = along < 0 ? along + Math.max(ALONGSIDE_PX, -along * RUN_IN_LOOK) : 0
    aimX = b.target.x + fx * at
    aimY = b.target.y + fy * at
  }

  const err = wrap(Math.atan2(aimY - s.y, aimX - s.x) - s.heading)
  /* decelerate onto it: the throttle goes off inside the stopping distance for the current speed, so she coasts in rather than arriving at cruise and stopping instantly */
  const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
  const throttle = dist > stopIn + ALONGSIDE_PX ? 1 : 0
  return { helm: easeHelm(err, throttle), next: watched(b) }
}

/* what the save keeps: the berth she was last tied to, never a point at sea */
export type VesselRecord = {
  /** the composition slot whose berth she is tied to */
  berthedAt: string
  /** how many legs this hull has sailed, which is the only thing a wake earns */
  legs: number
}

export const moored = (v: VesselRecord | undefined): boolean => !!v?.berthedAt
