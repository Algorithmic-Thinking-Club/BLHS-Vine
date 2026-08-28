const num = (v, d) => {
  const n = Number(v);
  return isFinite(n) ? n : d;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const LIFE_KINDS = ["wander", "cross", "orbit", "drift"];
function cleanLife(raw, depth = 0) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  const kind = LIFE_KINDS.includes(r.kind) ? r.kind : null;
  if (!kind) return null;
  const b = r.bounds;
  const bounds = b && num(b.w, 0) > 1 && num(b.h, 0) > 1 ? { x: Math.round(num(b.x, 0)), y: Math.round(num(b.y, 0)), w: Math.round(num(b.w, 0)), h: Math.round(num(b.h, 0)) } : null;
  const out = { kind, bounds, seed: Math.round(clamp(num(r.seed, 1), 1, 2147483647)) };
  if (r.walkOnly) out.walkOnly = true;
  if (isFinite(Number(r.walkPct))) out.walkPct = clamp(num(r.walkPct, 0), 0, 1);
  if (isFinite(Number(r.phase))) out.phase = clamp(num(r.phase, 0), 0, 1e5);
  if (isFinite(Number(r.rock))) out.rock = clamp(num(r.rock, 0), 0, 45);
  if (isFinite(Number(r.rockRate))) out.rockRate = clamp(num(r.rockRate, 0.35), 0.01, 8);
  if (kind === "wander") {
    out.range = clamp(num(r.range, 40), 4, 4e3);
    out.speedMin = clamp(num(r.speedMin, 14), 0.5, 400);
    out.speedMax = clamp(num(r.speedMax, Math.max(out.speedMin, 26)), out.speedMin, 400);
    out.pauseMin = clamp(num(r.pauseMin, 1.2), 0, 60);
    out.pauseMax = clamp(num(r.pauseMax, Math.max(out.pauseMin, 4.7)), out.pauseMin, 120);
    out.stepMin = clamp(num(r.stepMin, 0.25), 0.02, 1);
    out.stepMax = clamp(num(r.stepMax, Math.max(out.stepMin, 0.8)), out.stepMin, 1);
    out.bob = clamp(num(r.bob, 1.5), 0, 24);
    out.bobRate = clamp(num(r.bobRate, 3.5), 0, 30);
    out.faceMotion = r.faceMotion !== false;
  } else if (kind === "cross") {
    out.cycle = clamp(num(r.cycle, 35), 2, 600);
    out.travel = clamp(num(r.travel, Math.min(9, out.cycle)), 0.5, out.cycle);
    if (isFinite(Number(r.fromX))) out.fromX = num(r.fromX, 0);
    if (isFinite(Number(r.fromY))) out.fromY = num(r.fromY, 0);
    if (isFinite(Number(r.toX))) out.toX = num(r.toX, 0);
    if (isFinite(Number(r.toY))) out.toY = num(r.toY, 0);
    out.swayAmp = clamp(num(r.swayAmp, 18), 0, 400);
    out.swayWaves = clamp(num(r.swayWaves, 1.4), 0, 20);
    out.fade = r.fade !== false;
    out.airborne = !!r.airborne;
    out.faceMotion = r.faceMotion !== false;
  } else if (kind === "orbit") {
    out.period = clamp(num(r.period, 12), 0.5, 600);
    out.radiusX = clamp(num(r.radiusX, 24), 1, 2e3);
    out.radiusY = clamp(num(r.radiusY, Math.max(1, out.radiusX * 0.4)), 1, 2e3);
    out.bob = clamp(num(r.bob, 0), 0, 24);
    out.bobRate = clamp(num(r.bobRate, 3), 0, 30);
    out.faceMotion = r.faceMotion !== false;
  } else {
    out.driftX = clamp(num(r.driftX, 2), 0, 200);
    out.driftY = clamp(num(r.driftY, 1), 0, 200);
    out.period = clamp(num(r.period, 4), 0.2, 600);
    out.faceMotion = !!r.faceMotion;
  }
  if (depth === 0 && kind !== "cross" && Array.isArray(r.states)) {
    const st = [];
    for (const s of r.states.slice(0, 6)) {
      if (!s || typeof s !== "object") continue;
      const q = s;
      const secs = clamp(num(q.secs, 12), 0.2, 3600);
      const state = {
        secs,
        /* an index into the placement's pictures, never a name: the server has
         * already turned the planner's name into this number. A name that got
         * this far is not a number, so it lands on the default 0, which is the
         * placement's own picture. The top is 7 because a placement carries at
         * most 7 extra looks, so 0..7 is every picture there can be. */
        art: clamp(Math.round(num(q.art, 0)), 0, 7),
        /* no fade unless the state asked for one. A fade here is a dip through
         * nothing, because one placement is one sprite: alpha runs to 0 and back
         * at BOTH ends of every state it is set on. Measured with the old 0.15
         * default on a three-state round where nothing asked to fade: alpha 0.00
         * at t=0, so the thing is invisible on the first frame it is ever drawn,
         * and it blanks again at every state change, three times a round. A
         * state that wants the puff still says so. */
        fade: clamp(num(q.fade, 0), 0, Math.min(2, secs / 2))
      };
      const mv = q.move ? cleanLife(q.move, 1) : null;
      if (mv && mv.kind !== "cross") {
        mv.bounds = out.bounds ? { ...out.bounds } : null;
        if (out.walkOnly) mv.walkOnly = true;
        delete mv.phase;
        state.move = mv;
      }
      st.push(state);
    }
    if (st.length > 1) {
      if (!st[0].move) st[0].move = { ...out, bounds: out.bounds ? { ...out.bounds } : null };
      delete st[0].move.phase;
      delete st[0].move.rock;
      delete st[0].move.rockRate;
      out.states = st;
    }
  }
  return out;
}
function facingFrom(dx, dy, yScale = 1) {
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) return "south";
  const a = Math.atan2(dy * yScale, dx) * 180 / Math.PI;
  if (a >= -22.5 && a < 22.5) return "east";
  if (a >= 22.5 && a < 67.5) return "south-east";
  if (a >= 67.5 && a < 112.5) return "south";
  if (a >= 112.5 && a < 157.5) return "south-west";
  if (a >= -67.5 && a < -22.5) return "north-east";
  if (a >= -112.5 && a < -67.5) return "north";
  if (a >= -157.5 && a < -112.5) return "north-west";
  return "west";
}
function separate(pts, yScale = 0.55, strength = 1, stands) {
  const out = pts.map(() => ({ dx: 0, dy: 0 }));
  const PASSES = 2;
  const step = strength * 0.5;
  for (let pass = 0; pass < PASSES; pass++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x + out[j].dx - (a.x + out[i].dx);
        const dy = (b.y + out[j].dy - (a.y + out[i].dy)) / (yScale || 1);
        const want = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= want * want) continue;
        const d = Math.sqrt(d2);
        const ux = d > 1e-3 ? dx / d : i < j ? -1 : 1;
        const uy = d > 1e-3 ? dy / d : 0;
        const push = (want - d) / 2 * step;
        out[i].dx -= ux * push;
        out[i].dy -= uy * push * (yScale || 1);
        out[j].dx += ux * push;
        out[j].dy += uy * push * (yScale || 1);
        moved = true;
      }
    }
    if (!moved) break;
  }
  if (stands)
    for (let i = 0; i < pts.length; i++) {
      const o = out[i];
      if (!o.dx && !o.dy) continue;
      if (!stands(pts[i].x + o.dx, pts[i].y + o.dy)) {
        o.dx = 0;
        o.dy = 0;
      }
    }
  return out;
}
function liveState(states, t) {
  let T = 0;
  for (let i = 0; i < states.length; i++) T += states[i].secs;
  const c = Math.floor(t / T);
  const p = t - c * T;
  let k = 0;
  let start = 0;
  while (k < states.length - 1 && p >= start + states[k].secs) {
    start += states[k].secs;
    k++;
  }
  return { k, c, into: p - start };
}
function share(m, home, n) {
  const b = m.bounds;
  if (!b) return m;
  const hx = clamp(home.x, b.x, b.x + b.w);
  const hy = clamp(home.y, b.y, b.y + b.h);
  return { ...m, bounds: { x: home.x - (hx - b.x) / n, y: home.y - (hy - b.y) / n, w: b.w / n, h: b.h / n } };
}
function rnd(n, seed) {
  let x = (Math.imul(n ^ seed, 2246822519) ^ Math.imul(n + seed, 3266489917)) >>> 0;
  x ^= x >>> 15;
  x = Math.imul(x, 2246822519) >>> 0;
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}
function lifeAt(life, t0, home, canStand) {
  const seed = life.seed || 1;
  const t = t0 + (life.phase || 0);
  const floor = life.walkOnly && canStand ? canStand : null;
  const rock = life.rock ? life.rock * Math.PI / 180 : 0;
  const rot = rock ? rock * Math.sin(t * Math.PI * 2 * (life.rockRate ?? 0.35)) : 0;
  const still = { dx: 0, dy: 0, flip: false, alpha: 1, facing: "south", moving: false, rot, art: 0 };
  if (!life) return still;
  if (life.states && life.states.length > 1) {
    const st = life.states;
    const { k, c, into } = liveState(st, t);
    let movers = 0;
    for (let j = 0; j < st.length; j++) if (st[j].move) movers++;
    const near = movers > 1 && canStand ? (x, y) => canStand(home.x + (x - home.x) * movers, home.y + (y - home.y) * movers) : canStand;
    let ax = home.x;
    let ay = home.y;
    let heldFlip = false;
    let heldFace = "south";
    let cur = null;
    for (let j = 0; j < st.length; j++) {
      const raw = st[j].move;
      if (!raw) continue;
      const eff = life.bounds && !raw.bounds || life.walkOnly && !raw.walkOnly ? {
        ...raw,
        ...life.bounds && !raw.bounds ? { bounds: { ...life.bounds } } : {},
        ...life.walkOnly && !raw.walkOnly ? { walkOnly: true } : {}
      } : raw;
      const m = share(eff, home, movers);
      const own = (j < k ? c + 1 : c) * st[j].secs + (j === k ? into : 0);
      const a2 = lifeAt(m, own, home, near);
      ax += a2.dx;
      ay += a2.dy;
      if (j > 0) {
        const z = lifeAt(m, 0, home, near);
        ax -= z.dx;
        ay -= z.dy;
      }
      if (j === k) cur = a2;
      else if (j < k) {
        heldFlip = a2.flip;
        heldFace = a2.facing;
      }
    }
    let dx = ax - home.x;
    let dy = ay - home.y;
    const box = life.bounds;
    if (box) {
      dx = clamp(home.x + dx, box.x, box.x + box.w) - home.x;
      dy = clamp(home.y + dy, box.y, box.y + box.h) - home.y;
    }
    if (life.walkOnly && canStand && (dx || dy) && !canStand(home.x + dx, home.y + dy)) {
      let lo = 0;
      for (let s = 15; s >= 1; s--) {
        const k2 = s / 16;
        if (canStand(home.x + dx * k2, home.y + dy * k2)) {
          lo = k2;
          break;
        }
      }
      dx *= lo;
      dy *= lo;
    }
    const f = st[k].fade || 0;
    const opening = k === 0 && c === 0;
    const fa = f > 0 ? Math.max(0, Math.min(1, Math.min(opening ? f : into, st[k].secs - into) / f)) : 1;
    const art = st[k].art || 0;
    if (cur) {
      return {
        dx,
        dy,
        flip: cur.flip,
        alpha: cur.alpha * fa,
        facing: cur.facing,
        moving: cur.moving,
        // the placement's own lean rides on every state, on top of whatever the
        // state's own behaviour is leaning through
        rot: cur.rot + rot,
        art
      };
    }
    return { dx, dy, flip: heldFlip, alpha: fa, facing: heldFace, moving: false, rot, art };
  }
  const clearPath = (ax, ay, bx, by) => {
    if (!floor) return true;
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d / 2));
    for (let i = 1; i <= n; i++) {
      const u = i / n;
      if (!floor(ax + (bx - ax) * u, ay + (by - ay) * u)) return false;
    }
    return true;
  };
  if (life.kind === "wander") {
    const b = life.bounds;
    const range = life.range ?? 40;
    const halfW = b ? b.w / 2 : range;
    const halfH = b ? b.h / 2 : range * 0.35;
    const cx = b ? b.x + b.w / 2 : home.x;
    const cy = b ? b.y + b.h / 2 : home.y;
    let px = home.x;
    let py = home.y;
    let clock = 0;
    let flip = false;
    let tw = t;
    for (let pass = 0; pass < 2; pass++) {
      px = home.x;
      py = home.y;
      clock = 0;
      for (let k = 0; k <= 512; k++) {
        const homing = k === 512;
        let tx = homing ? home.x : cx + (rnd(k * 2 + 1, seed) * 2 - 1) * halfW;
        let ty = homing ? home.y : cy + (rnd(k * 2 + 2, seed) * 2 - 1) * halfH;
        if (!homing && floor && (!floor(tx, ty) || !clearPath(px, py, tx, ty))) {
          let found = false;
          for (let try_ = 0; try_ < 12; try_++) {
            const ax = cx + (rnd(k * 40 + try_ * 2 + 3001, seed) * 2 - 1) * halfW;
            const ay = cy + (rnd(k * 40 + try_ * 2 + 3002, seed) * 2 - 1) * halfH;
            if (floor(ax, ay) && clearPath(px, py, ax, ay)) {
              tx = ax;
              ty = ay;
              found = true;
              break;
            }
          }
          if (!found) {
            tx = px;
            ty = py;
          }
        }
        const dist = Math.hypot(tx - px, ty - py);
        const sp = (life.speedMin ?? 14) + rnd(k + 977, seed) * ((life.speedMax ?? 26) - (life.speedMin ?? 14));
        const moveT = dist / Math.max(sp, 0.5);
        const pause = (life.pauseMin ?? 1.2) + rnd(k + 5501, seed) * ((life.pauseMax ?? 4.7) - (life.pauseMin ?? 1.2));
        if (tw < clock + moveT) {
          const u = moveT > 0 ? (tw - clock) / moveT : 1;
          const x = px + (tx - px) * u;
          const y = py + (ty - py) * u;
          flip = tx < px;
          const hop = (life.bob ?? 1.5) * Math.abs(Math.sin(tw * Math.PI * (life.bobRate ?? 3.5)));
          return {
            dx: x - home.x,
            dy: y - home.y - hop,
            flip: (life.faceMotion ?? true) && flip,
            alpha: 1,
            facing: facingFrom(tx - px, ty - py),
            moving: true,
            rot,
            art: 0
          };
        }
        clock += moveT;
        if (tw < clock + pause) {
          flip = tx < px;
          return {
            dx: tx - home.x,
            dy: ty - home.y,
            flip: (life.faceMotion ?? true) && flip,
            alpha: 1,
            facing: facingFrom(tx - px, ty - py),
            moving: false,
            rot,
            art: 0
          };
        }
        clock += pause;
        px = tx;
        py = ty;
      }
      if (!(clock > 0)) break;
      tw = tw % clock;
    }
    return still;
  }
  if (life.kind === "cross") {
    const cycle = life.cycle ?? 35;
    const travel = Math.min(life.travel ?? 9, cycle);
    const u = t % cycle / travel;
    if (u > 1) return { dx: 0, dy: 0, flip: false, alpha: 0, facing: "south", moving: false, rot, art: 0 };
    const b = life.bounds;
    const fx = life.fromX ?? (b ? b.x - 20 : home.x - 200);
    const fy = life.fromY ?? (b ? b.y + b.h * 0.3 : home.y);
    const tx = life.toX ?? (b ? b.x + b.w + 20 : home.x + 200);
    const ty = life.toY ?? (b ? b.y + b.h * 0.6 : home.y);
    const x = fx + (tx - fx) * u;
    const y = fy + (ty - fy) * u + (life.swayAmp ?? 18) * Math.sin(u * Math.PI * 2 * (life.swayWaves ?? 1.4));
    const a2 = life.fade === false ? 1 : Math.min(1, Math.min(u, 1 - u) / 0.1);
    return {
      dx: x - home.x,
      dy: y - home.y,
      flip: (life.faceMotion ?? true) && tx < fx,
      alpha: Math.max(0, a2),
      facing: facingFrom(tx - fx, ty - fy),
      // a pass is travel end to end; there is no standing about in it
      moving: true,
      rot,
      art: 0
    };
  }
  if (life.kind === "orbit") {
    const p2 = life.period ?? 12;
    const a2 = t / p2 * Math.PI * 2;
    const rx = life.radiusX ?? 24;
    const ry = life.radiusY ?? rx * 0.4;
    const hop = (life.bob ?? 0) * Math.abs(Math.sin(t * Math.PI * (life.bobRate ?? 3)));
    return {
      dx: Math.cos(a2) * rx,
      dy: Math.sin(a2) * ry - hop,
      flip: (life.faceMotion ?? true) && Math.sin(a2) < 0,
      alpha: 1,
      // the tangent of the circle is where it is heading
      facing: facingFrom(-Math.sin(a2) * rx, Math.cos(a2) * ry),
      // an orbit never stops going round
      moving: true,
      rot,
      art: 0
    };
  }
  const p = life.period ?? 4;
  const a = t / p * Math.PI * 2;
  return {
    dx: Math.sin(a) * (life.driftX ?? 2),
    dy: Math.cos(a * 0.7) * (life.driftY ?? 1),
    flip: false,
    alpha: 1,
    facing: "south",
    // a drift is a sway that never settles, so its frames keep running
    moving: true,
    rot,
    art: 0
  };
}
export {
  LIFE_KINDS,
  cleanLife,
  facingFrom,
  lifeAt,
  liveState,
  separate
};
