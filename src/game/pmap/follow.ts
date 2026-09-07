/* WALKING BEHIND SOMEBODY, as one pure decision per frame.
 *
 * BRIEF-INTRO-FILM section 2, Ash on rail-4: *"Thor zooms past the principal."*
 * `lead_to` is the word the Maw's rail is written on, and until this file its
 * idea of following was a head start: wait until the leader is two body lengths
 * clear, then walk to the same station at the student's own speed. Nothing
 * after the first frame knew where the leader was.
 *
 * MEASURED EVERY FRAME on the published Maw v6, tunnel to table: the principal
 * left 207,123 and took 3.14 seconds to reach the table at 46 px/s with his
 * eight frame cycle running. Thor covered the same ground in 1.2 seconds at
 * 97 px/s, stood still for the rest of it, and the man he was following walked
 * up behind him and straight through his sprite. Ash read that as the principal
 * having no walk animation, and the drawing was fine: for most of the walk the
 * principal was hidden behind the boy who was supposed to be following him.
 *
 * IT IS HERE AND NOT IN THE TICKER because it is arithmetic with two numbers in
 * it that are easy to get backwards, and both of them have been got backwards in
 * this repository already. The foreshortening divides (`path.ts`, the driven
 * pass, `walk.ts` seen from the other end) and `lead_to` multiplied it; and the
 * student's own speed is the SCENE's `SPD`, twice the map's number since
 * 2026-08-15, so dividing a pace by `map.speed` leaves him exactly twice as
 * fast as the man in front of him, which is the whole defect wearing a fix.
 */

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

/* TWO RULES, AND THE FIRST ONE IS A STOP RATHER THAN A SLOW.
 *
 * Two body lengths is a distance a person can see, and anything inside it is a
 * boy walking through a man. Slowing down inside the gap would still close it
 * whenever the leader is held up by a line of dialogue, which is exactly when
 * the two of them are standing still next to each other.
 *
 * The pace is the LEADER'S while he is moving and the walk's own once he has
 * stopped, so the last few pixels of a follow are closed at a sensible speed
 * rather than at a standstill. It is capped at 1: a follow never makes the
 * student faster than he already is.
 */
export function followStep(f: FollowFrame): FollowStep {
  const apart = groundApart(f.leader, f.me, f.yScale)
  if (apart <= f.gap) return { hold: true, paceScale: 0, apart }
  const want = f.leaderSpeed ?? f.restSpeed
  const own = f.ownSpeed || 1
  return { hold: false, paceScale: Math.max(0, Math.min(1, want / own)), apart }
}
