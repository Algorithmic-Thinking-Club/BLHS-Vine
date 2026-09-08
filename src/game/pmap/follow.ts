/* walking behind somebody, as one pure decision per frame */

/** how far apart two bodies are on the ground, with the painting's squash taken out */
export function groundApart(
  a: { x: number; y: number }, b: { x: number; y: number }, yScale: number,
): number {
  const ys = yScale || 1
  return Math.hypot(a.x - b.x, (a.y - b.y) / ys)
}

export interface FollowFrame {
  /** where the body being followed is standing this frame */
  leader: { x: number; y: number }
  /** the speed the leader is really travelling at, or null when he has stopped */
  leaderSpeed: number | null
  /** where the follower is standing this frame */
  me: { x: number; y: number }
  /** the distance he keeps, in ground pixels. Two body lengths on every map so far */
  gap: number
  /** the pace the walk was started at, used once the leader has stopped */
  restSpeed: number
  /** the follower's own top speed, which is the scene's SPD and not map.speed */
  ownSpeed: number
  yScale: number
}

export interface FollowStep {
  /** stand still this frame: he is inside the gap and would walk through the leader */
  hold: boolean
  /** the fraction of a frame the walk law is given, so pace and walk cycle scale together */
  paceScale: number
  /** what the gap actually is this frame, so a harness can read the same number */
  apart: number
}

/* stop inside the gap, otherwise match the leader's pace, capped at the follower's own */
export function followStep(f: FollowFrame): FollowStep {
  const apart = groundApart(f.leader, f.me, f.yScale)
  if (apart <= f.gap) return { hold: true, paceScale: 0, apart }
  const want = f.leaderSpeed ?? f.restSpeed
  const own = f.ownSpeed || 1
  return { hold: false, paceScale: Math.max(0, Math.min(1, want / own)), apart }
}
