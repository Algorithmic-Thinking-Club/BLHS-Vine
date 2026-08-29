/* THE KIT IS ONE SYSTEM, HELD TO IT BY READING THE STYLESHEETS.
 *
 * Three claims are made about the kit and all three are the kind that rot
 * silently, because nothing errors when they stop being true:
 *
 *   1. the default skin renders what shipped before the token layer existed. The
 *      only honest proof is that every token's value is the literal it replaced,
 *      byte for byte, so the table below is the diff nobody has to eyeball.
 *   2. every kit stylesheet reads the token layer. A single retyped `#8a744f` is
 *      a surface the plain arm cannot reach, and it is invisible until somebody
 *      switches arms and finds one wooden panel in a plain sheet.
 *   3. every animation has a reduced-motion answer. Six of them did not, and the
 *      way that was found was by grepping, which is a thing that happens once.
 *
 * These read the CSS as text on purpose. happy-dom does not resolve custom
 * properties through `getComputedStyle` the way a browser does, and a test that
 * needed a real engine would be a test that never runs.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { applySkin, currentSkin, KIT_SKINS, skinFromUrl } from './skin'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8')
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const TOKENS = 'src/game/ui/tokens.css'

/* the stylesheets that ARE the kit: the surfaces the painted game shows. Not
 * ui/ui.css, which only `?legacy=1` reaches and which says so in its header. */
const KIT = [
  'src/game/cutscene/ui-kit.css',
  'src/game/hud/dialogue.css',
  'src/game/hud/hud.css',
  'src/game/hud/wardrobe.css',
  'src/app/settings.css',
  'src/app/theme.css',
]
/* the three that size themselves in container units, which is where the text
 * setting was being dropped */
const CQW_PANELS = ['src/game/hud/hud.css', 'src/game/hud/wardrobe.css', 'src/app/settings.css']

const tokenValue = (css: string, name: string, scope = ':root'): string | null => {
  const block = css.slice(css.indexOf(scope))
  const m = block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  return m ? m[1].trim() : null
}

/* every declaration in one selector block, so a skin can be compared to :root */
function declaredIn(css: string, selector: string): Set<string> {
  const at = css.indexOf(selector)
  if (at < 0) return new Set()
  const open = css.indexOf('{', at)
  const close = css.indexOf('\n}', open)
  const body = css.slice(open, close)
  return new Set([...body.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]))
}

describe('the tokens are extracted, not invented', () => {
  const css = strip(read(TOKENS))

  /* EVERY ONE OF THESE WAS TYPED SOMEWHERE ELSE FIRST. Left: the token. Right:
   * the literal that was in the tree on 2026-08-29, and the file it was in. */
  const EXTRACTED: [string, string, string][] = [
    ['kit-ink', '#33261a', 'settings.css .st-idval'],
    ['kit-ink-body', '#4a3826', 'hud.css .hb-page'],
    ['kit-ink-head', '#3c2d1c', 'hud.css .hb-h'],
    ['kit-ink-label', '#6a563c', 'ui-kit.css .cs-continue-hint'],
    ['kit-ink-dim', '#8a7a60', 'hud.css .hb-dim'],
    ['kit-ink-soft', '#7a6a52', 'settings.css .st-about'],
    ['kit-ink-said', '#3b2a1a', 'ui-kit.css .cs-dialogue-text'],
    ['kit-ink-mirror', '#4a3a24', 'wardrobe.css .wd-head'],
    ['kit-paper-hi', '#f2ead4', 'settings.css .st-key'],
    ['kit-paper', '#e6dcc2', 'hud.css .pz-btn'],
    ['kit-paper-lo', '#dbcfaf', 'hud.css .pz-btn'],
    ['kit-paper-on-hi', '#ece2c8', 'hud.css .hb-tab-on'],
    ['kit-paper-on-lo', '#e2d7b8', 'hud.css .hb-tab-on'],
    ['kit-paper-tab-hi', '#e0d5b9', 'hud.css .hb-tab'],
    ['kit-paper-tab-lo', '#d3c6a5', 'hud.css .hb-tab'],
    ['kit-paper-card-hi', '#efe7d1', 'settings.css .st-idcard'],
    ['kit-paper-card-lo', '#e4d8ba', 'settings.css .st-idcard'],
    ['kit-paper-chip-lo', '#cdbf9d', 'wardrobe.css .wd-lockchip'],
    ['kit-edge', '#8a744f', 'hud.css, settings.css, thirteen uses'],
    ['kit-edge-strong', '#a08d64', 'settings.css .st-key'],
    ['kit-wood-hi', '#4a3421', 'ui-kit.css .cs-nameplaque'],
    ['kit-wood-lo', '#382614', 'ui-kit.css .cs-nameplaque'],
    ['kit-wood-edge', '#241708', 'hud.css .hud-btn'],
    ['kit-wood-shadow', '#1a1006', 'hud.css .hud-btn'],
    ['kit-wood-ink', '#e8dcc0', 'hud.css .hud-btn'],
    ['kit-wood-dark-hi', '#3d2b1a', 'ui-kit.css .cs-skip'],
    ['kit-wood-dark-ink', '#cbbd9d', 'ui-kit.css .cs-skip'],
    ['kit-plank-ink', '#f0e4c8', 'dialogue.css .dlg-choice'],
    ['kit-sea', '#3c6e60', 'hud.css .hb-tab-on'],
    ['kit-sea-ink', '#234c40', 'hud.css .hb-tab-on'],
    ['kit-sea-earned', '#2f6e50', 'hud.css .hb-earned'],
    ['kit-gold-hi', '#d8b968', 'hud.css .hud-token'],
    ['kit-gold-lo', '#a07b2c', 'hud.css .hud-token'],
    ['kit-alarm', '#a3492c', 'settings.css .st-dangerhead'],
    ['kit-caption-ink', '#f2e8d2', 'ui-kit.css .cs-caption'],
    ['kit-focus', '#ffd98a', 'dialogue.css .dlg-choice:focus-visible'],
    ['kit-veil', 'rgba(5, 12, 15, .5)', 'hud.css .hb-veil'],
    ['kit-veil-pause', 'rgba(6, 12, 16, .35)', 'hud.css .pz-veil'],
    ['kit-drop-lg', '0 12px 30px rgba(2, 8, 10, .65)', 'hud.css .hb-book'],
    ['kit-wood-sheen', 'rgba(210, 170, 110, .35)', 'hud.css .hud-btn'],
    ['kit-plank-shadow', 'rgba(30, 16, 6, .75)', 'dialogue.css .dlg-choice'],
    ['kit-face-display', "'Harbormaster', 'Deckhand', monospace", 'every heading in the kit'],
    ['kit-face-body', "'Deckhand', monospace", 'every line of body copy'],
    ['kit-face-title', "'Harbormaster', monospace", 'hud.css .pz-title'],
    ['kit-art-panel', "url('/art/ui/panel-square.png')", 'hud.css .hb-book'],
    ['kit-art-dialogue', "url('/art/ui/dialogue-box.png')", 'ui-kit.css .cs-dialogue'],
    ['kit-art-plank', "url('/art/ui/plank-button.png')", 'settings.css .st-close'],
    /* the front group: theme.css's twenty-two, which are a different palette on
     * purpose and were aliased rather than merged */
    ['kit-front-paper', '#e8dcc2', 'theme.css --c-paper'],
    ['kit-front-teal', '#2f8e82', 'theme.css --c-teal'],
    ['kit-front-gold', '#c9a24a', 'theme.css --c-gold'],
    ['kit-front-ease', 'cubic-bezier(0.2, 0.7, 0.2, 1)', 'theme.css --ease-out'],
  ]

  for (const [token, was, where] of EXTRACTED) {
    it(`--${token} is still ${was} (${where})`, () => {
      expect(tokenValue(css, token)).toBe(was)
    })
  }

  it('keeps the two front palettes distinct, which is why they are two groups', () => {
    // theme.css's paper is one byte off the kit's and always was
    expect(tokenValue(css, 'kit-front-paper')).not.toBe(tokenValue(css, 'kit-paper'))
  })
})

describe('every kit stylesheet reads the token layer', () => {
  for (const file of KIT) {
    it(`${path.basename(file)} declares no colour of its own`, () => {
      const css = strip(read(file))
      const raw = [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
      expect(raw, `raw hex left in ${file}`).toEqual([])
    })
  }

  it('every kit stylesheet can reach tokens.css from where it is imported', () => {
    for (const file of KIT) {
      const css = read(file)
      const imports = [...css.matchAll(/@import\s+'([^']+)'/g)].map((m) => m[1])
      const reaches = imports.some((rel) => {
        const target = path.resolve(path.dirname(path.resolve(process.cwd(), file)), rel)
        if (target.endsWith('tokens.css')) return true
        // one hop: dialogue.css imports ui-kit.css, which imports tokens.css
        return fs.existsSync(target) && read(path.relative(process.cwd(), target)).includes('tokens.css')
      })
      expect(reaches, `${file} does not import tokens.css`).toBe(true)
    }
  })

  it('the plain skin overrides every token the default declares', () => {
    const css = strip(read(TOKENS))
    const root = declaredIn(css, ':root {')
    const plain = declaredIn(css, "html[data-skin='plain'] {")
    expect(root.size).toBeGreaterThan(80)
    const missing = [...root].filter((t) => !plain.has(t) && t !== 'kit-text-scale')
    expect(missing, 'tokens the plain arm would inherit from the paper skin').toEqual([])
  })

  it('the plain skin is a different material, not the same one renamed', () => {
    const css = strip(read(TOKENS))
    for (const t of ['kit-paper', 'kit-face-body', 'kit-art-panel', 'kit-wood-hi']) {
      expect(tokenValue(css, t, ':root')).not.toBe(tokenValue(css, t, "html[data-skin='plain']"))
    }
    // and it has no PixelLab art at all, which is the whole point of §16
    expect(tokenValue(css, 'kit-art-panel', "html[data-skin='plain']")).toBe('none')
  })
})

describe('the skin is an attribute, the same way data-rm is', () => {
  it('writes nothing for the default, so a page that never asks looks like today', () => {
    applySkin('plain')
    expect(document.documentElement.dataset.skin).toBe('plain')
    expect(currentSkin()).toBe('plain')
    applySkin('paper')
    expect(document.documentElement.dataset.skin).toBeUndefined()
    expect(currentSkin()).toBe('paper')
  })

  it('reads ?skin= off a URL and refuses anything that is not a skin', () => {
    expect(skinFromUrl('?skin=plain')).toBe('plain')
    expect(skinFromUrl('?skin=paper')).toBe('paper')
    expect(skinFromUrl('?skin=wood')).toBeNull()
    expect(skinFromUrl('')).toBeNull()
  })

  it('names both skins, because one skin is not a system', () => {
    expect(KIT_SKINS.length).toBeGreaterThanOrEqual(2)
  })
})

/* ---- the reduced-motion audit ------------------------------------------ */

const lastClass = (sel: string): string | null => {
  const m = [...sel.matchAll(/\.[a-zA-Z][\w-]*/g)]
  return m.length ? m[m.length - 1][0] : null
}

function animatedSelectors(css: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = m[1].trim()
    const body = m[2]
    if (sel.startsWith('@') || sel.includes('data-rm')) continue
    if (!/(^|;|\s)animation\s*:|animation-name\s*:/.test(body)) continue
    // a keyframe step ("0%, 100%") is not a selector
    if (/^\d|^from|^to/.test(sel)) continue
    out.push(sel)
  }
  return out
}

function reducedClasses(css: string): Set<string> {
  const out = new Set<string>()
  for (const m of css.matchAll(/([^{}]*data-rm[^{}]*)\{/g)) {
    for (const part of m[1].split(',')) {
      const c = lastClass(part)
      if (c) out.add(c)
    }
  }
  return out
}

describe('reduced motion reaches every animation the kit runs', () => {
  const FILES = [...KIT, 'src/game/ui/ui.css']
  for (const file of FILES) {
    it(`${path.basename(file)} answers the setting on every animation it starts`, () => {
      const css = strip(read(file))
      const covered = reducedClasses(css)
      const uncovered = animatedSelectors(css)
        .map((s) => ({ sel: s, key: lastClass(s) }))
        .filter((x) => !x.key || !covered.has(x.key))
        .map((x) => x.sel)
      expect(uncovered, `animations with no html[data-rm='1'] rule in ${file}`).toEqual([])
    })
  }

  it('takes every kit transition to nothing through one rule', () => {
    const css = strip(read(TOKENS))
    const rm = css.slice(css.indexOf("html[data-rm='1'] {"))
    for (const t of ['kit-t-quick', 'kit-t-fast', 'kit-t-mid', 'kit-t-slow']) {
      expect(rm).toContain(`--${t}: 1ms`)
    }
  })

  it('lets no kit stylesheet type its own transition duration', () => {
    for (const file of KIT.filter((f) => !f.endsWith('theme.css'))) {
      const css = strip(read(file))
      const raw = [...css.matchAll(/transition:\s*([^;]+);/g)]
        .map((m) => m[1])
        .filter((v) => /\d+m?s/.test(v))
      expect(raw, `${file} has a hand-typed transition duration`).toEqual([])
    }
  })
})

describe('the text setting reaches a panel that sizes itself in container units', () => {
  for (const file of CQW_PANELS) {
    it(`${path.basename(file)} multiplies every cqw font size by the setting`, () => {
      const css = strip(read(file))
      const deaf = [...css.matchAll(/font-size:\s*([^;]*cqw[^;]*);/g)]
        .map((m) => m[1].trim())
        .filter((v) => !v.includes('--kit-text-scale'))
      expect(deaf, `${file} sizes that ignore data-textsize`).toEqual([])
    })
  }

  it('has a scale for each of S, M and L', () => {
    const css = strip(read(TOKENS))
    expect(tokenValue(css, 'kit-text-scale', ':root')).toBe('1')
    expect(css).toContain("html[data-textsize='s']")
    expect(css).toContain("html[data-textsize='l']")
  })
})
