// The cutscene script language (GAME-DESIGN §12.2). One declarative format powers the intro
// and, later, island cutscenes. Scripts are plain data: an array of steps the runtime plays
// in order. World-touching steps (camera, actors, fx) go through the CutsceneStage interface
// a scene implements; screen-space steps (letterbox, dialogue, captions, fades) render in the
// CutsceneOverlay. Every step knows how to finish INSTANTLY so hold-to-skip can fast-forward
// to the next required interaction without leaving the world in a half-state.
//
// This is a superset of the grape contract's CutsceneStep (src/vine/contract.ts) — that small
// format stays the beginner-facing API and maps into this one.

export type Ease = 'linear' | 'in' | 'out' | 'inOut'

export type Vec = { x: number; y: number }

export type Step =
  // -- timing --
  | { t: 'wait'; ms: number }
  // -- screen space (overlay-owned) --
  | { t: 'letterbox'; on: boolean; ms?: number }
  | { t: 'vignette'; to: number; ms?: number }                    // 0 = none, 1 = fully closed
  | { t: 'fade'; to: number; ms?: number; color?: string }        // full-screen wash, 0 = clear
  | { t: 'say'; who?: string; text: string; portrait?: string }   // typewriter; click/space advances
  | { t: 'caption'; text: string; ms: number }                    // floating one-liner, no box
  // -- world space (stage-owned) --
  | { t: 'camera'; to?: Vec; zoom?: number; ms: number; ease?: Ease }
  | { t: 'cameraFollow'; actor: string | null }
  | { t: 'actorState'; actor: string; state: string }             // sprite-state swap (wake pose etc.)
  | { t: 'actorPlace'; actor: string; at: Vec; face?: string }
  | { t: 'actorMove'; actor: string; to: Vec; speed?: number; face?: string }
  | { t: 'actorFace'; actor: string; dir: string }
  | { t: 'actorShow'; actor: string; visible: boolean }
  | { t: 'fx'; name: string; at?: Vec; data?: unknown }
  | { t: 'audio'; cue: string }
  | { t: 'stage'; call: string; data?: unknown }                  // scene escape hatch (tide override,
                                                                  // sail swap...); may report a done-poll
  // -- input gates (the player acts; skip stops at required ones) --
  | { t: 'gate'; kind: 'walkTo'; target: Vec; radius: number; prompt?: string; idleAutoMs?: number; required?: boolean }
  | { t: 'gate'; kind: 'ui'; id: string; required?: boolean }     // resolved by overlay UI (the I-3 session)
  | { t: 'gate'; kind: 'confirm'; prompt?: string; required?: boolean } // wait for click/space
  // -- structure --
  | { t: 'all'; steps: Step[] }                                   // parallel; done when every branch is
  | { t: 'label'; name: string }

export type Script = { id: string; steps: Step[] }

// What a scene must expose for the runtime to drive it. Positions are in the scene's own
// world units (tile coords for the iso maps). Long-running ops return a poll the runtime
// ticks; instant ops return nothing.
export interface CutsceneStage {
  cameraGet(): { x: number; y: number; zoom: number }
  cameraSet(x: number, y: number, zoom: number): void
  cameraFollow(actor: string | null): void
  actorState(actor: string, state: string): void
  actorPlace(actor: string, x: number, y: number, face?: string): void
  actorMove(actor: string, x: number, y: number, speed?: number, face?: string): () => boolean
  actorPos(actor: string): Vec
  actorFace(actor: string, dir: string): void
  actorShow(actor: string, visible: boolean): void
  fx(name: string, at?: Vec, data?: unknown): void
  audio(cue: string): void
  call(name: string, data?: unknown): (() => boolean) | void
  // true = the player steers (fully or on a rail — the scene decides what a gate allows)
  playerControl(on: boolean): void
}

// Overlay-rendered state, owned by the runtime, read by CutsceneOverlay via subscription.
export type OverlayState = {
  active: boolean
  letterbox: number                                               // 0..1 bar reveal
  vignette: number
  fade: number
  fadeColor: string
  dialogue: null | { who?: string; text: string; shown: number; done: boolean; portrait?: string }
  caption: null | { text: string; alpha: number }
  prompt: null | { text: string }
  uiGate: null | { id: string }                                   // an I-3-style UI session is up
  skippable: boolean
}
