// the one shirt recolor used by both the wardrobe preview and the world's sprite loader

export const LOOKS: Record<string, { label: string; hue: number | null }> = {
  classic: { label: 'panther teal', hue: null },
  gold: { label: 'panther gold', hue: 46 },
  slate: { label: 'slate', hue: 215 },
  ember: { label: 'ember', hue: 18 },
}

export function lookHue(look: string | undefined): number | null {
  return LOOKS[look ?? 'classic']?.hue ?? null
}

/** recolor the shirt pixels of an ImageData in place */
export function recolorShirt(d: ImageData, hue: number) {
  const p = d.data
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 30) continue
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
    if (mx === mn) continue
    let h = 0
    if (mx === r) h = ((g - b) / (mx - mn)) % 6
    else if (mx === g) h = (b - r) / (mx - mn) + 2
    else h = (r - g) / (mx - mn) + 4
    h = (h * 60 + 360) % 360
    const s = mx === 0 ? 0 : (mx - mn) / mx
    if (h < 150 || h > 215 || s < 0.22) continue
    const c = mx * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = mx - c
    const seg = Math.floor(hue / 60) % 6
    const [nr, ng, nb] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][seg]
    p[i] = Math.round((nr + m) * 255); p[i + 1] = Math.round((ng + m) * 255); p[i + 2] = Math.round((nb + m) * 255)
  }
}

/** draw an image source through the shirt recolor onto a canvas (null hue = as drawn) */
export function drawRecolored(cv: HTMLCanvasElement, img: CanvasImageSource & { width: number; height: number }, hue: number | null) {
  const g = cv.getContext('2d', { willReadFrequently: true })!
  cv.width = img.width as number; cv.height = img.height as number
  g.imageSmoothingEnabled = false
  g.drawImage(img, 0, 0)
  if (hue === null) return
  const d = g.getImageData(0, 0, cv.width, cv.height)
  recolorShirt(d, hue)
  g.putImageData(d, 0, 0)
}
