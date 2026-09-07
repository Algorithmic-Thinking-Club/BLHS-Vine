/* GOLDEN HOUR, CARRIED OFF THE BEACH AND ONTO THE PAINTING.
 *
 * Ash, 2026-09-06: *"Golden hour atmosphere keep it, after the island transition
 * loads. right now its empty."* and *"golden hour atmosphere throughout."*
 *
 * WHAT HE MEANS BY KEEP IT. The tile beach he kept is at golden hour and says so
 * in its own comments: a warm tropical tint, a low sun glow, a horizon band, a
 * ray wash and a warm vignette, layered over the composited world. The cover art
 * the crossing lifts on, `loading-port.png`, is a gold sunset. Then the painted
 * map opened at flat noon with a cold teal sea, and against the two screens
 * either side of it that reads as empty.
 *
 * SO IT IS THE SAME FIVE LAYERS, MOVED HERE RATHER THAN INVENTED AGAIN. Every
 * number is the beach's own, so the light does not change when the ocean does.
 *
 * IT IS NOT A SHADER AND IT IS NOT ART. The standing rule is that all art comes
 * from PixelLab and code never draws any; this draws no object, no edge and no
 * shape. It is five canvas gradients over the top of the composited frame, which
 * is the same thing a camera's own light is, and it is the technique already
 * shipped and accepted on the beach.
 *
 * STAGE SIBLINGS ABOVE THE WORLD, NOT CHILDREN OF IT. The world is scaled and
 * panned by the camera; the light is not. A vignette that zoomed with the
 * painting would be a hole in the middle of it.
 */
import { Container, Sprite, Texture } from 'pixi.js'

export type Atmosphere = { layer: Container; resize: (w: number, h: number) => void }

/** a soft radial wash, as a texture. Linear sampling on purpose: this is light. */
export function radial(size: number, stops: [number, string][]): Texture {
  const cv = document.createElement('canvas')
  cv.width = cv.height = size
  const ctx = cv.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const t = Texture.from(cv)
  t.source.scaleMode = 'linear'
  return t
}

/** a vertical band, as a texture */
export function vgradient(size: number, stops: [number, string][]): Texture {
  const cv = document.createElement('canvas')
  cv.width = 8
  cv.height = size
  const ctx = cv.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, size)
  for (const [o, c] of stops) g.addColorStop(o, c)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 8, size)
  const t = Texture.from(cv)
  t.source.scaleMode = 'linear'
  return t
}

/**
 * The five layers, in one container the caller adds above its world and resizes
 * with the window. Nothing in here ticks; light does not animate.
 */
export function goldenHour(): Atmosphere {
  const layer = new Container()
  /* it is light, not a control: it must never eat a click meant for the ground */
  layer.eventMode = 'none'
  layer.interactiveChildren = false

  /* a full-screen warm tint, for cohesive warmth */
  const warm = new Sprite(Texture.WHITE)
  warm.tint = 0xffc87e
  warm.alpha = 0.09
  /* the low sun, upper left */
  const sun = new Sprite(radial(512, [
    [0, 'rgba(255,216,150,0.22)'], [0.5, 'rgba(255,206,138,0.07)'], [1, 'rgba(255,206,138,0)'],
  ]))
  sun.anchor.set(0.5)
  sun.blendMode = 'add'
  /* the gold band fading down across the far water */
  const horizon = new Sprite(vgradient(256, [
    [0, 'rgba(255,196,122,0.16)'], [0.55, 'rgba(255,196,122,0.06)'], [1, 'rgba(255,196,122,0)'],
  ]))
  horizon.blendMode = 'add'
  /* a faint warm diagonal, so the light has a direction the eye can feel */
  const rays = new Sprite(vgradient(512, [
    [0, 'rgba(255,208,140,0.1)'], [0.5, 'rgba(255,208,140,0.03)'], [1, 'rgba(255,208,140,0)'],
  ]))
  rays.anchor.set(0.5)
  rays.rotation = -0.62
  rays.blendMode = 'add'
  /* and a warm vignette, never a black one */
  const vig = new Sprite(radial(512, [
    [0, 'rgba(0,0,0,0)'], [0.45, 'rgba(0,0,0,0)'],
    [0.72, 'rgba(30,19,8,0.34)'], [1, 'rgba(16,9,3,0.78)'],
  ]))

  layer.addChild(warm, sun, horizon, rays, vig)

  const resize = (vw: number, vh: number) => {
    warm.width = vw; warm.height = vh
    sun.width = sun.height = Math.max(vw, vh) * 1.5
    sun.position.set(vw * 0.3, vh * 0.02)
    horizon.width = vw; horizon.height = vh * 0.24
    horizon.position.set(0, 0)
    rays.width = Math.max(vw, vh) * 2.2
    rays.height = Math.max(vw, vh) * 2.2
    rays.position.set(vw * 0.28, vh * 0.3)
    vig.width = vw * 1.5; vig.height = vh * 1.5
    vig.position.set(-vw * 0.25, -vh * 0.25)
  }

  return { layer, resize }
}
