/* the hull: a boat on the world, as pure state that one tick advances */

/** the eight-way heading vocabulary, shared with the walk so a berth's `facing`
 *  means the same thing to a hull as it does to a body */
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

export const DEFAULT_SAIL: SailCfg = {
  cruise: 150, fullSail: 260, accel: 90, drag: 60, turn: 2.2,
  probe: 26, wakeCap: 220, wakeLife: 2.6, wakeSpread: 9,
}

/** what the player is asking for this tick. `turn` is -1, 0 or 1 and `throttle`
 *  is 0 or 1: a keyboard and a pointer both reduce to this, which is the kit's
 *  input-parity rule arriving in a place that is not a widget. */
export type Helm = { throttle: number; turn: number; fullSail: boolean }

export const HELM_IDLE: Helm = { throttle: 0, turn: 0, fullSail: false }

export const newHull = (x: number, y: number, heading = 0): HullState =>
  ({ x, y, heading, speed: 0, aground: false, wake: [] })

/* how deep the water is at a point: positive is water, negative is land */
export type DepthAt = (x: number, y: number) => number

/* one tick of the hull, returning a new state */
export function stepHull(s: HullState, helm: Helm, dt: number, depth: DepthAt, cfg = DEFAULT_SAIL): HullState {
  const d = Math.max(0, Math.min(dt, 0.1))          // a hidden tab must not teleport a hull
  const ceiling = helm.fullSail ? cfg.fullSail : cfg.cruise

  /* THE BOW COMES ROUND SLOWER THE FASTER SHE GOES, which is the one piece of
   * boat feel that is not a constant. At rest she turns on the spot, which is
   * wrong for a real hull and right for a fourteen year old on a trackpad. */
  const rate = cfg.turn * (1 - 0.45 * Math.min(1, s.speed / Math.max(1, cfg.fullSail)))
  const heading = s.heading + helm.turn * rate * d

  let speed = s.speed
  if (helm.throttle > 0) speed = Math.min(ceiling, speed + cfg.accel * d * helm.throttle)
  else speed = Math.max(0, speed - cfg.drag * d)
  /* dropping full sail does not stop her dead: the ceiling falls and drag brings
   * her down to it, so letting go feels like easing off rather than braking */
  if (speed > ceiling) speed = Math.max(ceiling, speed - cfg.drag * d)

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
  if (speed > cfg.cruise * 0.12) {
    const bx = -Math.cos(heading), by = -Math.sin(heading)
    const px = -by, py = bx                          // the perpendicular, for the spread
    const qx = nx + bx * cfg.probe * 0.55, qy = ny + by * cfg.probe * 0.55
    wake.push({ x: qx + px * cfg.wakeSpread, y: qy + py * cfg.wakeSpread, side: 1, age: 0 })
    wake.push({ x: qx - px * cfg.wakeSpread, y: qy - py * cfg.wakeSpread, side: -1, age: 0 })
  }
  /* THE HARD POOL CAP. §80.3 asks for it by name and the reason is the same one
   * the ocean's own sprite pools exist for: an unbounded crossing on a 4 GB
   * Chromebook is where a class of machines gets worse over a semester. */
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
/** how close to the authored heading counts as parallel to the dock */
export const ALONGSIDE_RAD = 0.3

/* HOW FAR BACK DOWN THE BERTH'S OWN LINE SHE STEERS FOR, as a fraction of how
 * far out she still is. This is the whole of the arrival's shape.
 *
 * Ash, watching the intro: *"it does not dock in the orientation shown in the
 * berth in MAPVIS, and it also does weird spin like its confused on which way to
 * dock."* Measured on that crossing: she arrived on heading -2.81 against an
 * authored -0.698, which is 121 degrees out, stopped dead at the dock and then
 * pirouetted 100 degrees on the spot over a second. Nothing was broken in the
 * physics. The manoeuvre simply never tried to arrive facing the right way: it
 * drove at the berth as a POINT, and only once parked did it notice the heading
 * it was supposed to have.
 *
 * A helmsman does the opposite. He picks up the line of the dock while he still
 * has way on and comes down it, so by the time he is alongside he is already
 * parallel and there is nothing left to turn. That is what this does: she steers
 * not at the berth but at a point this fraction of the remaining distance back
 * along the heading she has to end on. Far out that point sits well up the
 * approach and swings her onto the line; as she closes it slides into the berth
 * itself, and her heading converges on the authored one because it IS the line
 * she is running down.
 *
 * It costs an author nothing and it needs no approach point drawn, so every
 * berth on every island gets a real approach the day it is placed. */
export const RUN_IN_LEAD = 0.7
/** and never further back than this, so a crossing from the far side of the ocean does not aim a thousand pixels past the island */
export const RUN_IN_MAX_PX = 260

const wrap = (a: number): number => {
  let r = a
  while (r > Math.PI) r -= Math.PI * 2
  while (r < -Math.PI) r += Math.PI * 2
  return r
}

/** the helm a berthing manoeuvre wants this tick, and how far along it is.
 *  `dt` is only needed by the watchdog; leaving it out runs the manoeuvre with
 *  no give-up, which is what the pure tests want. */
export function berthHelm(
  s: HullState, b: Berthing, cfg = DEFAULT_SAIL, dt = 0,
): { helm: Helm; next: Berthing } {
  if (b.stage === 'done' || b.stage === 'given_up') return { helm: HELM_IDLE, next: b }

  /* the watchdog, run before anything else this tick */
  const gap = Math.hypot(b.target.x - s.x, b.target.y - s.y)
  let best = b.best ?? gap
  let stuckMs = b.stuckMs ?? 0
  if (dt > 0) {
    if (gap < best - BERTH_PROGRESS_PX) { best = gap; stuckMs = 0 }
    else stuckMs += dt * 1000
    if (stuckMs >= BERTH_GIVE_UP_MS)
      return { helm: HELM_IDLE, next: { ...b, stage: 'given_up', best, stuckMs } }
  }
  const watched = (n: Berthing): Berthing => ({ ...n, best, stuckMs })

  if (b.stage === 'approach') {
    /* MAKE FOR THE APPROACH POINT FIRST, so she comes at the dock down its own
     * line instead of cutting the corner across the shallows.
     *
     * AND THE POINT IS DERIVED WHEN NOBODY DREW ONE, which is every berth on the
     * ocean today. Straight up the berth's own heading is where a boat has to
     * come from, so it can be worked out rather than authored, and an author only
     * needs to draw one when the water in between is foul.
     *
     * This is what stops the arrival from the WRONG SIDE. Coming at the dock from
     * the direction she is supposed to be pointing, she used to reach the berth
     * nose-first, stop, and turn 120 degrees on the spot. Sent to the gate first
     * she sweeps round outside and comes back down the line under way, which is
     * both what it should look like and what a helmsman would do. */
    const aim = b.approach ?? (b.facing === undefined ? undefined : {
      x: b.target.x - Math.cos(b.facing) * RUN_IN_MAX_PX,
      y: b.target.y - Math.sin(b.facing) * RUN_IN_MAX_PX,
    })
    if (!aim) return berthHelm(s, watched({ ...b, stage: 'alongside' }), cfg)
    const dx = aim.x - s.x, dy = aim.y - s.y
    const d = Math.hypot(dx, dy)

    /* a waypoint is passed rather than hit: the test is whether it is behind the bow */
    const ahead = Math.cos(s.heading) * dx + Math.sin(s.heading) * dy
    if (d < ALONGSIDE_PX * 2 || (ahead < 0 && d < cfg.cruise))
      return berthHelm(s, watched({ ...b, stage: 'alongside' }), cfg)

    const err = wrap(Math.atan2(dy, dx) - s.heading)
    /* AND SHE SLOWS INTO IT, for the same reason. Speed is what makes the turn
     * wide, so a hull that eases off as it nears the waypoint can steer at it
     * instead of around it. */
    const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
    const throttle = d > stopIn + ALONGSIDE_PX * 2 ? 1 : 0
    return { helm: { throttle, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false }, next: watched(b) }
  }

  const dx = b.target.x - s.x, dy = b.target.y - s.y
  const dist = Math.hypot(dx, dy)

  /* inside the berth: no throttle, and swing onto the authored heading.
   *
   * WITH THE RUN-IN BELOW THIS IS NOW ALMOST NEVER A TURN, which is the point.
   * She reaches here already lying along the dock, so the swing is a degree or
   * two of settling rather than the hundred-degree pirouette it used to be. It
   * stays because a berth can be reached from inside the box: a hull that is
   * already tied up and asked to dock again is at zero distance and whatever
   * heading she was left on. */
  if (dist <= ALONGSIDE_PX) {
    const err = b.facing === undefined ? 0 : wrap(b.facing - s.heading)
    if (s.speed < cfg.cruise * 0.12 && Math.abs(err) < ALONGSIDE_RAD)
      return { helm: HELM_IDLE, next: watched({ ...b, stage: 'done' }) }
    return { helm: { throttle: 0, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false }, next: watched(b) }
  }

  /* THE RUN-IN. She steers for a point back down the line she has to end on
   * rather than at the berth itself, so the turn happens out on the water while
   * she still has way on and she arrives already parallel. See RUN_IN_LEAD.
   *
   * A berth with no authored heading keeps the old behaviour of driving at the
   * mark, because there is no line to pick up. */
  let aimX = b.target.x, aimY = b.target.y
  if (b.facing !== undefined) {
    const lead = Math.min(dist * RUN_IN_LEAD, RUN_IN_MAX_PX)
    aimX -= Math.cos(b.facing) * lead
    aimY -= Math.sin(b.facing) * lead
  }

  const err = wrap(Math.atan2(aimY - s.y, aimX - s.x) - s.heading)
  /* DECELERATE ONTO IT. The throttle goes off inside the stopping distance for
   * the current speed, so she coasts in rather than arriving at cruise and
   * stopping instantly, which is the difference between docking and colliding. */
  const stopIn = (s.speed * s.speed) / (2 * cfg.drag)
  const throttle = dist > stopIn + ALONGSIDE_PX ? 1 : 0
  return {
    helm: { throttle, turn: Math.abs(err) < 0.05 ? 0 : Math.sign(err), fullSail: false },
    next: watched(b),
  }
}

/* what the save keeps: the berth she was last tied to, never a point at sea */
export type VesselRecord = {
  /** the composition slot whose berth she is tied to */
  berthedAt: string
  /** how many legs this hull has sailed, which is the only thing a wake earns */
  legs: number
}

export const moored = (v: VesselRecord | undefined): boolean => !!v?.berthedAt
