// Shared iso projection for the overworld, used by BOTH the canvas renderer (water-iso.ts)
// and the React overlays (island markers, the intro cutscene), so everything lands on the
// same world points. The camera is animatable (zoom + centre) so cutscenes can pan/zoom.

export const HW = 15, HH = 7.5 // iso half-tile (2:1 diamond) at zoom 1 — frames the archipelago
export const CLIFF = 22         // island extrusion height in px at zoom 1
export const PROP_ZOOM = HW / 22 // props were authored at HW=22

// Live, mutable camera. Default = the whole archipelago centred on the Commons hub.
// A cutscene tweens these; reset to {1,0,0} when normal play resumes.
export const camera = { zoom: 1, cx: 0, cy: 0 }

// world tile (gx,gy) on the island TOP surface -> screen px, honouring the live camera
export function worldToScreen(gx: number, gy: number, W: number, H: number) {
  const z = camera.zoom, ehw = HW * z, ehh = HH * z
  const ox = W / 2 - (camera.cx - camera.cy) * ehw
  const oy = H / 2 - (camera.cx + camera.cy) * ehh
  return { x: ox + (gx - gy) * ehw, y: oy + (gx + gy) * ehh - CLIFF * z }
}
