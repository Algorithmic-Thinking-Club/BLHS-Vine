// the reader for the UI kit MAPVIS publishes: handles, urls, partial refusals and applying it
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  applyKit, kitArtUrl, kitCss, kitFace, kitFaults, kitHandle, kitOptedIn,
  kitCached, kitSlot, setKit, KIT_STYLE_ID, type KitPiece,
} from './kit'

const HOST = 'https://mapvis-atc.vercel.app'

/* the real dialogue_box row, css verbatim, sha and slice as published. This is
 * the piece that carries the name-versus-handle trap. */
const DIALOGUE: KitPiece = {
  name: 'dialogue_box', type: 'dialogue_box', w: 518, h: 182,
  slice: { top: 37, right: 43, bottom: 35, left: 43 },
  fill: true, scale: 1, repeat: { x: 'round', y: 'round' },
  src: '/api/v1/ui/dialogue_box/image', sha: '-Dl1zAPUQnW1_YM_TZif5Ae4dHE',
  regions: [
    { name: 'body', kind: 'text', x: 152, y: 37, w: 306, h: 97, wrap: 'wrap', overflow: 'grow' },
    { name: 'portrait', kind: 'picture', x: 43, y: 48, w: 99, h: 99, fit: 'contain', valign: 'bottom' },
  ],
  css: ":root {\n  --kit-slice-dialogue: 37 43 35 43;\n  --kit-slice-w-dialogue: 37px 43px 35px 43px;\n"
    + "  --kit-repeat-dialogue: round;\n}\n\n.kit-surface-dialogue {\n  border-style: solid;\n"
    + "  border-color: transparent;\n  border-width: var(--kit-slice-w-dialogue);\n"
    + "  border-image: var(--kit-art-dialogue, url('/api/v1/ui/dialogue_box/image?v=-Dl1zAPUQnW1'))"
    + ' var(--kit-slice-dialogue) fill / 1 / 0 var(--kit-repeat-dialogue);\n}',
}

/* a sheet: six of the eighteen live pieces are one, and none of them has a slice
 * or a css block because a grid of small faces is not a stretchable surface */
const CHIP: KitPiece = {
  name: 'chip', type: 'chip', w: 384, h: 160,
  src: '/api/v1/ui/chip/image', sha: '72v3eDdtni1-uDDvXj2d3fhWQaQ',
  faces: [
    { name: 'plate', x: 0, y: 15, w: 123, h: 135 },
    { name: 'plate_lit', x: 128, y: 15, w: 128, h: 135 },
  ],
  regions: [{ name: 'plate', kind: 'face', x: 0, y: 15, w: 123, h: 135 }],
}

/* the failure `docs/UI-KIT.md` says breaks border-image with no error at all:
 * the two vertical insets add up to more than the image is tall */
const TALL_SLICE: KitPiece = {
  name: 'badpanel', type: 'panel', w: 403, h: 150,
  slice: { top: 90, right: 38, bottom: 90, left: 47 },
  fill: true, scale: 1, repeat: { x: 'round', y: 'round' },
  src: '/api/v1/ui/badpanel/image', sha: 'zzz',
  css: ".kit-surface-badpanel {\n  border-image: var(--kit-art-badpanel, url('/api/v1/ui/badpanel/image?v=zzz'))"
    + ' 90 38 90 47 fill / 1 / 0 round;\n}',
}

beforeEach(() => {
  document.getElementById(KIT_STYLE_ID)?.remove()
  setKit([])
})

describe('the name on the wire is not the handle the game mounts', () => {
  it('reads the handle out of the css MAPVIS wrote, not off the piece name', () => {
    expect(DIALOGUE.name).toBe('dialogue_box')
    expect(kitHandle(DIALOGUE)).toBe('dialogue')
  })

  it('writes the art token under the handle, so tokens.css is the thing overridden', () => {
    const css = kitCss([DIALOGUE], HOST)
    expect(css).toContain('--kit-art-dialogue:')
    // the trap: a reader that used the name would write a token nothing reads
    expect(css).not.toContain('--kit-art-dialogue_box')
  })

  it('falls back to the name only when there is no css to read a handle out of', () => {
    // a sheet publishes no css, and its own name is the only honest answer
    expect(kitHandle(CHIP)).toBe('chip')
  })
})

describe('the image url', () => {
  it('is absolute against the platform and carries the FULL sha', () => {
    expect(kitArtUrl(DIALOGUE, HOST))
      .toBe(`${HOST}/api/v1/ui/dialogue_box/image?v=-Dl1zAPUQnW1_YM_TZif5Ae4dHE`)
  })

  it('replaces the relative, truncated one MAPVIS wrote inside its own block', () => {
    const css = kitCss([DIALOGUE], HOST)
    // the published block says url('/api/v1/ui/dialogue_box/image?v=-Dl1zAPUQnW1')
    expect(css).not.toContain("url('/api/v1/ui/dialogue_box/image?v=-Dl1zAPUQnW1')")
    expect(css).not.toContain("url('/api/")
    expect(css).toContain(`url('${HOST}/api/v1/ui/dialogue_box/image?v=-Dl1zAPUQnW1_YM_TZif5Ae4dHE')`)
  })

  it('keeps the rest of the published block exactly as it arrived', () => {
    const css = kitCss([DIALOGUE], HOST)
    expect(css).toContain('--kit-slice-dialogue: 37 43 35 43;')
    expect(css).toContain('border-width: var(--kit-slice-w-dialogue);')
    expect(css).toContain('fill / 1 / 0 var(--kit-repeat-dialogue)')
  })
})

describe('a bad slice is refused loudly, and only that piece', () => {
  it('names the piece and the arithmetic that would have failed silently', () => {
    const faults = kitFaults([DIALOGUE, TALL_SLICE, CHIP])
    expect(faults).toHaveLength(1)
    expect(faults[0].key).toBe('badpanel')
    expect(faults[0].why).toContain('90+90')
    expect(faults[0].why).toContain('150')
  })

  it('keeps every other piece, which is the whole law', () => {
    const css = kitCss([DIALOGUE, TALL_SLICE, CHIP], HOST)
    expect(css).toContain('.kit-surface-dialogue')
    expect(css).toContain('--kit-art-chip:')
    expect(css).not.toContain('badpanel')
  })

  it('says so on the console rather than only in a return value', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    applyKit([DIALOGUE, TALL_SLICE], HOST)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('badpanel')
    warn.mockRestore()
  })

  it('refuses a row that carries no art at all', () => {
    const empty: KitPiece = { name: 'ghost', type: 'panel', w: 0, h: 0 }
    expect(kitFaults([empty])).toHaveLength(1)
  })

  it('does NOT refuse a sheet, because a grid of faces is not a broken surface', () => {
    // six of the eighteen live pieces are sheets. A warning that fires six times
    // every boot is a warning nobody reads, which is how the real one gets missed.
    expect(kitFaults([CHIP])).toEqual([])
    const css = kitCss([CHIP], HOST)
    expect(css).toContain('--kit-art-chip:')
    expect(css).not.toContain('.kit-surface-chip')
  })
})

describe('applying it', () => {
  it('injects one style element and replaces it rather than stacking', () => {
    applyKit([DIALOGUE], HOST)
    applyKit([DIALOGUE], HOST)
    const all = document.querySelectorAll(`style#${KIT_STYLE_ID}`)
    expect(all).toHaveLength(1)
    // and one dialogue rule inside it, not two
    expect(all[0].textContent!.match(/\.kit-surface-dialogue \{/g)).toHaveLength(1)
  })

  it('lands last in the head, so its :root beats the one Vite injected at import', () => {
    const other = document.createElement('style')
    document.head.appendChild(other)
    applyKit([DIALOGUE], HOST)
    expect(document.head.lastElementChild?.id).toBe(KIT_STYLE_ID)
    other.remove()
  })

  it('keeps pixel art unsmoothed, reading the token the plain arm sets to auto', () => {
    expect(kitCss([DIALOGUE], HOST)).toContain('image-rendering: var(--kit-pixel')
  })
})

describe('a piece with a slice and no css still mounts', () => {
  /* this has never come off the live route and is the branch that keeps a rename
   * table out of the file: with no css there is no handle to read, so the name is
   * used and nothing invents a mapping */
  const bare: KitPiece = {
    name: 'socket', type: 'socket', w: 424, h: 104,
    slice: { top: 21, right: 29, bottom: 22, left: 29 },
    fill: true, scale: 2, repeat: { x: 'round', y: 'stretch' },
    src: '/api/v1/ui/socket/image', sha: 'q1afFpodeNtCp',
  }

  it('gets a rule built from the slice, at the scale it published', () => {
    const css = kitCss([bare], HOST)
    expect(css).toContain('.kit-surface-socket {')
    expect(css).toContain('border-width: 42px 58px 44px 58px;')
    expect(css).toContain('21 29 22 29 fill / 1 / 0 round stretch')
  })

  it('leaves fill off for the one piece that is drawn as a ring', () => {
    const ring = { ...bare, name: 'highlight_edge', fill: false }
    expect(kitCss([ring], HOST)).not.toContain('fill /')
  })
})

describe('reading a rectangle off a piece', () => {
  it('hands back the authored rect instead of a magic number', () => {
    expect(kitSlot([DIALOGUE], 'dialogue_box', 'body'))
      .toMatchObject({ x: 152, y: 37, w: 306, h: 97, kind: 'text' })
  })

  it('answers to the handle as well as the name, because call sites know one or the other', () => {
    expect(kitSlot([DIALOGUE], 'dialogue', 'portrait')?.valign).toBe('bottom')
  })

  it('is undefined for a region nobody marked, rather than a zero rect', () => {
    expect(kitSlot([DIALOGUE], 'dialogue_box', 'nope')).toBeUndefined()
    expect(kitSlot([DIALOGUE], 'nope', 'body')).toBeUndefined()
  })

  it('cuts a face off a sheet, from faces or from a face-kind region', () => {
    expect(kitFace([CHIP], 'chip', 'plate_lit')).toEqual({ name: 'plate_lit', x: 128, y: 15, w: 128, h: 135 })
    const regionOnly: KitPiece = { ...CHIP, faces: undefined }
    expect(kitFace([regionOnly], 'chip', 'plate')).toEqual({ name: 'plate', x: 0, y: 15, w: 123, h: 135 })
    expect(kitFace([CHIP], 'chip', 'nope')).toBeUndefined()
  })
})

describe('the cache, and the Chromebook that cannot reach the platform', () => {
  it('installs a kit without a fetch, the way setComposition does', () => {
    setKit([DIALOGUE])
    expect(kitCached()).toHaveLength(1)
  })

  it('starts from nothing rather than from a guess', () => {
    setKit([])
    expect(kitCached()).toEqual([])
  })
})

describe('the kit is worn by default, and can be taken off', () => {
  /* the kit is worn by default, and `?kit=0` is what takes it off */
  it('is worn unless somebody says otherwise', () => {
    expect(kitOptedIn('')).toBe(true)
    expect(kitOptedIn('?map=hub')).toBe(true)
    expect(kitOptedIn('?kit=1')).toBe(true)
    expect(kitOptedIn('?kit=on')).toBe(true)
  })

  it('and ?kit=0 takes it off, for a member with no network and for a comparison', () => {
    expect(kitOptedIn('?kit=0')).toBe(false)
    expect(kitOptedIn('?kit=off')).toBe(false)
  })
})

// the plank is the game's own art, so the platform's version of it is read and never worn
const PLANK: KitPiece = {
  name: 'plank', type: 'plank', w: 404, h: 247,
  slice: { top: 25, right: 43, bottom: 43, left: 31 },
  fill: true, scale: 1, repeat: { x: 'round', y: 'round' },
  src: '/api/v1/ui/plank/image', sha: 'plankshaplankshaplanksha',
  css: ".kit-surface-plank {\n  border-image: var(--kit-art-plank, url('/api/v1/ui/plank/image?v=planksha'))"
    + ' 25 43 43 31 fill / 1 / 0 round;\n}',
}

describe("the plank is Ash's, and the platform cannot take it back", () => {
  it('writes no art token for it, so :root in tokens.css stays the answer', () => {
    const css = kitCss([PLANK, DIALOGUE], HOST)
    expect(css).not.toContain('--kit-art-plank')
    /* the dialogue box in the same kit still lands, so this is a refusal of one
     * handle and not of the fetch */
    expect(css).toContain('--kit-art-dialogue')
  })

  it('injects no rule for it either, so nothing can restyle it from the wire', () => {
    expect(kitCss([PLANK], HOST)).not.toContain('.kit-surface-plank')
  })

  it('is not a fault, because there is nothing wrong with the piece', () => {
    // it is a deliberate refusal to WEAR it, not a refusal to read it
    expect(kitFaults([PLANK])).toEqual([])
  })
})
