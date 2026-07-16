// THE UI BUS — how world code (any lane's scene, POI, or cutscene) opens the vine's
// sit-down UIs without importing React or touching this lane's files. The Maw's chart
// table (cave-mechanics POI 'maw-chart-table') calls requestUi('planner'); the lectern
// calls requestUi('handbook'). The mounted HUD listens and opens the real thing.
// One window CustomEvent, no coupling, works from Pixi callbacks and cutscene steps alike.

export type UiRequest = 'planner' | 'handbook' | 'chart' | 'settings' | 'advisory'

const EVENT = 'blhs:open-ui'

export function requestUi(which: UiRequest) {
  window.dispatchEvent(new CustomEvent<UiRequest>(EVENT, { detail: which }))
}

export function onUiRequest(fn: (which: UiRequest) => void): () => void {
  const h = (e: Event) => fn((e as CustomEvent<UiRequest>).detail)
  window.addEventListener(EVENT, h)
  return () => window.removeEventListener(EVENT, h)
}
