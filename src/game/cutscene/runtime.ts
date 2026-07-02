import type { CutsceneStage, Ease, OverlayState, Script, Step, Vec } from './types'

// The cutscene interpreter. Tick-driven: the host scene calls tick(dtMs) from its own loop,
// so cutscene time and world time can never drift apart. Two execution modes per step:
// LIVE (animated over time) and INSTANT (jump straight to the end state) â€” instant is what
// makes hold-to-skip honest: the world lands exactly where the script would have left it.
//
// Dialogue pacing, letterbox/vignette/fade tweens and typewriter text live here (screen
// space); everything world-side is delegated to the CutsceneStage the scene provides.

const LETTERBOX_MS = 450
const VIGNETTE_MS = 600
const FADE_MS = 500
const CAPTION_FADE_MS = 350
const CHARS_PER_S = 38               // typewriter base speed
const PUNCT_PAUSE_MS = 160           // extra beat after . ! ? â€¦
const DIALOGUE_MIN_MS = 250          // ignore advance clicks for the first beat of a line

const eases: Record<Ease, (v: number) => number> = {
  linear: (v) => v,
  in: (v) => v * v,
  out: (v) => 1 - (1 - v) * (1 - v),
  inOut: (v) => (v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v)),
}

type Tween = { from: number; to: number; ms: number; at: number; ease: (v: number) => number; set: (v: number) => void; done?: () => void }

// one running step's live state
type Live =
  | { k: 'wait'; left: number }
  | { k: 'poll'; poll: () => boolean }
  | { k: 'tween' }                                   // completion signaled by the tween's done()
  | { k: 'say'; elapsed: number; extra: number }     // extra = accumulated punctuation pauses
  | { k: 'caption'; left: number }
  | { k: 'gateWalk'; target: Vec; radius: number; idleAutoMs: number; idle: number; auto: (() => boolean) | null; actor: string }
  | { k: 'gateUi'; id: string }
  | { k: 'gateConfirm' }
  | { k: 'all'; runners: Runner[] }

class Runner {
  steps: Step[]
  i = -1
  live: Live | null = null
  constructor(steps: Step[]) { this.steps = steps }
  get finished() { return this.i >= this.steps.length && this.live === null }
}

export class CutsceneRuntime {
  private stage: CutsceneStage
  private root: Runner | null = null
  private tweens: Tween[] = []
  private listeners = new Set<() => void>()
  private onDone: (() => void) | null = null
  private advanceQueued = false
  private confirmQueued = false
  private uiResolved = new Set<string>()
  playerActor = 'thor'                                // which actor walkTo gates watch

  ui: OverlayState = {
    active: false, letterbox: 0, vignette: 0, fade: 0, fadeColor: '#05070a',
    dialogue: null, caption: null, prompt: null, uiGate: null, skippable: true,
  }

  constructor(stage: CutsceneStage) { this.stage = stage }

  // ---- host API ----------------------------------------------------------------

  play(script: Script, onDone?: () => void) {
    this.root = new Runner(script.steps)
    this.onDone = onDone ?? null
    this.ui.active = true
    this.stage.playerControl(false)
    this.emit()
  }

  get running() { return this.root !== null }

  /** click / space / any-key from the overlay: finish or advance dialogue, resolve confirm gates */
  advance() { this.advanceQueued = true; this.confirmQueued = true }

  /** the overlay's I-3-style UI resolved gate `id` */
  resolveUi(id: string) { this.uiResolved.add(id) }

  /** hold-to-skip fired: fast-forward to the next required gate (or the end) */
  skip() {
    if (!this.root) return
    this.fastForward(this.root)
    this.emit()
  }

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private emit() { for (const fn of this.listeners) fn() }

  // ---- tick --------------------------------------------------------------------

  tick(dtMs: number) {
    if (!this.root) return
    // tweens first so screen-space state settles before step logic reads it
    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i]
      tw.at += dtMs
      const v = Math.min(1, tw.at / tw.ms)
      tw.set(tw.from + (tw.to - tw.from) * tw.ease(v))
      if (v >= 1) { this.tweens.splice(i, 1); tw.done?.() }
    }
    this.step(this.root, dtMs)
    this.advanceQueued = false
    this.confirmQueued = false
    if (this.root.finished) this.finish()
    this.emit()
  }

  private finish() {
    this.root = null
    this.tweens = []
    this.ui.active = false
    this.ui.dialogue = null; this.ui.caption = null; this.ui.prompt = null; this.ui.uiGate = null
    this.stage.playerControl(true)
    const cb = this.onDone; this.onDone = null
    cb?.()
  }

  // advance one runner by dt; recurses into parallel branches
  private step(r: Runner, dt: number) {
    // pump the current live step
    if (r.live) {
      if (!this.pump(r.live, dt)) return       // still busy
      r.live = null
    }
    // start steps until one blocks
    while (r.live === null && r.i < r.steps.length) {
      r.i++
      if (r.i >= r.steps.length) break
      const s = r.steps[r.i]
      r.live = this.begin(s)
      if (r.live && !this.pump(r.live, 0)) return
      r.live = null
    }
  }

  // returns a Live if the step needs time, null if it completed instantly
  private begin(s: Step): Live | null {
    switch (s.t) {
      case 'wait': return { k: 'wait', left: s.ms }
      case 'label': return null
      case 'letterbox': {
        this.tween(this.ui.letterbox, s.on ? 1 : 0, s.ms ?? LETTERBOX_MS, 'inOut', (v) => { this.ui.letterbox = v })
        return null                                  // letterbox never blocks the script
      }
      case 'vignette': {
        this.tween(this.ui.vignette, s.to, s.ms ?? VIGNETTE_MS, 'inOut', (v) => { this.ui.vignette = v })
        return null
      }
      case 'fade': {
        if (s.color) this.ui.fadeColor = s.color
        let settled = false
        this.tween(this.ui.fade, s.to, s.ms ?? FADE_MS, 'inOut', (v) => { this.ui.fade = v }, () => { settled = true })
        return { k: 'poll', poll: () => settled }    // fades DO block (they pace reveals)
      }
      case 'say': {
        this.ui.dialogue = { who: s.who, text: s.text, shown: 0, done: false, portrait: s.portrait }
        return { k: 'say', elapsed: 0, extra: 0 }
      }
      case 'caption': {
        this.ui.caption = { text: s.text, alpha: 0 }
        this.tween(0, 1, CAPTION_FADE_MS, 'out', (v) => { if (this.ui.caption) this.ui.caption.alpha = v })
        return { k: 'caption', left: s.ms }
      }
      case 'camera': {
        const cam = this.stage.cameraGet()
        const to = s.to ?? { x: cam.x, y: cam.y }
        const zoom = s.zoom ?? cam.zoom
        this.stage.cameraFollow(null)
        let settled = false
        const ease = s.ease ?? 'inOut'
        this.tween(0, 1, s.ms, ease, (v) => {
          this.stage.cameraSet(cam.x + (to.x - cam.x) * v, cam.y + (to.y - cam.y) * v, cam.zoom + (zoom - cam.zoom) * v)
        }, () => { settled = true })
        return { k: 'poll', poll: () => settled }
      }
      case 'cameraFollow': this.stage.cameraFollow(s.actor); return null
      case 'actorState': this.stage.actorState(s.actor, s.state); return null
      case 'actorPlace': this.stage.actorPlace(s.actor, s.at.x, s.at.y, s.face); return null
      case 'actorFace': this.stage.actorFace(s.actor, s.dir); return null
      case 'actorShow': this.stage.actorShow(s.actor, s.visible); return null
      case 'actorMove': {
        const poll = this.stage.actorMove(s.actor, s.to.x, s.to.y, s.speed, s.face)
        return { k: 'poll', poll }
      }
      case 'fx': this.stage.fx(s.name, s.at, s.data); return null
      case 'audio': this.stage.audio(s.cue); return null
      case 'stage': {
        const poll = this.stage.call(s.call, s.data)
        return poll ? { k: 'poll', poll } : null
      }
      case 'gate': {
        if (s.kind === 'walkTo') {
          this.ui.prompt = s.prompt ? { text: s.prompt } : null
          this.stage.playerControl(true)             // the scene rails it while a cutscene is active
          return { k: 'gateWalk', target: s.target, radius: s.radius, idleAutoMs: s.idleAutoMs ?? 6000, idle: 0, auto: null, actor: this.playerActor }
        }
        if (s.kind === 'ui') { this.ui.uiGate = { id: s.id }; return { k: 'gateUi', id: s.id } }
        this.ui.prompt = s.prompt ? { text: s.prompt } : null
        return { k: 'gateConfirm' }
      }
      case 'all': {
        const runners = s.steps.map((st) => new Runner([st]))
        return { k: 'all', runners }
      }
    }
  }

  // returns true when the live step is complete
  private pump(live: Live, dt: number): boolean {
    switch (live.k) {
      case 'wait': live.left -= dt; return live.left <= 0
      case 'poll': return live.poll()
      case 'tween': return true
      case 'say': {
        const d = this.ui.dialogue
        if (!d) return true
        live.elapsed += dt
        if (!d.done) {
          const budget = Math.max(0, live.elapsed - live.extra) * (CHARS_PER_S / 1000)
          let shown = d.shown
          while (shown < d.text.length && shown < budget) {
            const ch = d.text[shown]
            shown++
            if ('.!?â€¦'.includes(ch)) live.extra += PUNCT_PAUSE_MS
          }
          d.shown = shown
          if (shown >= d.text.length) d.done = true
          if (this.advanceQueued && live.elapsed > DIALOGUE_MIN_MS) { d.shown = d.text.length; d.done = true }
          return false
        }
        if (this.advanceQueued && live.elapsed > DIALOGUE_MIN_MS) { this.ui.dialogue = null; return true }
        return false
      }
      case 'caption': {
        live.left -= dt
        if (live.left <= 0 && this.ui.caption && this.ui.caption.alpha >= 1) {
          const cap = this.ui.caption
          this.tween(1, 0, CAPTION_FADE_MS, 'in', (v) => { cap.alpha = v }, () => { if (this.ui.caption === cap) this.ui.caption = null })
          return true
        }
        return live.left <= 0 && this.ui.caption === null
      }
      case 'gateWalk': {
        const p = this.stage.actorPos(live.actor)
        const dx = p.x - live.target.x, dy = p.y - live.target.y
        if (dx * dx + dy * dy <= live.radius * live.radius) {
          this.ui.prompt = null
          this.stage.playerControl(false)
          return true
        }
        if (live.auto) { if (live.auto()) return false } // auto-walk running; arrival caught above
        else {
          live.idle += dt
          if (live.idle >= live.idleAutoMs) {          // he goes himself
            this.stage.playerControl(false)
            live.auto = this.stage.actorMove(live.actor, live.target.x, live.target.y, undefined)
          }
        }
        return false
      }
      case 'gateUi': {
        if (this.uiResolved.has(live.id)) { this.uiResolved.delete(live.id); this.ui.uiGate = null; return true }
        return false
      }
      case 'gateConfirm': {
        if (this.confirmQueued) { this.ui.prompt = null; return true }
        return false
      }
      case 'all': {
        let done = true
        for (const child of live.runners) { this.step(child, dt); if (!child.finished) done = false }
        return done
      }
    }
  }

  // ---- skip: apply end states instantly up to the next required gate -------------

  private fastForward(r: Runner) {
    // finish the current live step instantly (unless it's a required gate)
    if (r.live) {
      if (this.liveIsRequiredGate(r, r.live)) return
      this.applyInstantLive(r, r.live)
      r.live = null
    }
    while (r.i < r.steps.length - 1 || (r.i < r.steps.length && r.live === null)) {
      r.i++
      if (r.i >= r.steps.length) break
      const s = r.steps[r.i]
      if (s.t === 'gate' && s.required !== false && (s.kind === 'ui' || s.kind === 'walkTo' || s.kind === 'confirm')) {
        // required interactions survive the skip; walkTo auto-resolves (teleport) unless required
        if (s.required === true || s.kind === 'ui') { r.live = this.begin(s); return }
        if (s.kind === 'walkTo') { this.stage.actorPlace(this.playerActor, s.target.x, s.target.y); continue }
        continue                                      // non-required confirm: drop it
      }
      this.applyInstant(s)
    }
  }

  private liveIsRequiredGate(r: Runner, live: Live): boolean {
    if (live.k === 'gateUi') return true
    const s = r.steps[r.i]
    return s?.t === 'gate' && s.required === true
  }

  private applyInstantLive(r: Runner, live: Live) {
    const s = r.steps[r.i]
    switch (live.k) {
      case 'say': this.ui.dialogue = null; break
      case 'caption': this.ui.caption = null; break
      case 'gateWalk': this.stage.actorPlace(this.playerActor, live.target.x, live.target.y); this.ui.prompt = null; this.stage.playerControl(false); break
      case 'gateConfirm': this.ui.prompt = null; break
      case 'all': for (const child of live.runners) this.fastForward(child); break
      case 'poll':
        // let camera/fade tweens snap: run their tween list to completion
        for (const tw of this.tweens.splice(0)) { tw.set(tw.to); tw.done?.() }
        if (s?.t === 'actorMove') this.stage.actorPlace(s.actor, s.to.x, s.to.y, s.face)
        break
      default: break
    }
  }

  private applyInstant(s: Step) {
    switch (s.t) {
      case 'wait': case 'label': case 'say': case 'caption': break
      case 'letterbox': this.ui.letterbox = s.on ? 1 : 0; break
      case 'vignette': this.ui.vignette = s.to; break
      case 'fade': if (s.color) this.ui.fadeColor = s.color; this.ui.fade = s.to; break
      case 'camera': {
        const cam = this.stage.cameraGet()
        this.stage.cameraFollow(null)
        this.stage.cameraSet(s.to?.x ?? cam.x, s.to?.y ?? cam.y, s.zoom ?? cam.zoom)
        break
      }
      case 'cameraFollow': this.stage.cameraFollow(s.actor); break
      case 'actorState': this.stage.actorState(s.actor, s.state); break
      case 'actorPlace': this.stage.actorPlace(s.actor, s.at.x, s.at.y, s.face); break
      case 'actorFace': this.stage.actorFace(s.actor, s.dir); break
      case 'actorShow': this.stage.actorShow(s.actor, s.visible); break
      case 'actorMove': this.stage.actorPlace(s.actor, s.to.x, s.to.y, s.face); break
      case 'fx': break                                // one-shot particles are skippable noise
      case 'audio': break
      case 'stage': { const poll = this.stage.call(s.call, { ...(s.data as object ?? {}), instant: true }); if (poll) while (!poll()) { /* stage promised instant */ break } break }
      case 'gate': break                              // handled by fastForward
      case 'all': for (const st of s.steps) this.applyInstant(st); break
    }
  }

  private tween(from: number, to: number, ms: number, ease: Ease, set: (v: number) => void, done?: () => void) {
    if (ms <= 0) { set(to); done?.(); return }
    this.tweens.push({ from, to, ms, at: 0, ease: eases[ease], set, done })
  }
}
