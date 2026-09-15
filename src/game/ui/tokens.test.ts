// holds the kit to one system by reading the stylesheets as text: token values, art, and motion
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8')
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const TOKENS = 'src/game/ui/tokens.css'

/* every stylesheet in the tree, found rather than listed, because the failure these tests catch is a new surface nobody added to a list */
function everyStylesheet(dir = 'src'): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) out.push(...everyStylesheet(rel))
    else if (e.name.endsWith('.css')) out.push(rel)
  }
  return out
}

/** every source file that could name a kit handle */
const KIT = [
  /* the control kit: every button, tab, field, gauge, socket and stamp is made of this file, so one retyped colour here reaches twenty surfaces at once */
  'src/game/ui/controls.css',
  'src/game/cutscene/ui-kit.css',
  'src/game/hud/dialogue.css',
  'src/game/hud/hud.css',
  'src/game/hud/wardrobe.css',
  'src/app/settings.css',
  'src/app/theme.css',
]
/* the three that size themselves in container units, which is where the text setting was being dropped */
const CQW_PANELS = ['src/game/hud/hud.css', 'src/game/hud/wardrobe.css', 'src/app/settings.css']

const tokenValue = (css: string, name: string, scope = ':root'): string | null => {
  const block = css.slice(css.indexOf(scope))
  const m = block.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  return m ? m[1].trim() : null
}

/* every declaration in one selector block, so a skin can be compared to :root */
describe('the tokens are extracted, not invented', () => {
  const css = strip(read(TOKENS))

  /* every one of these was typed somewhere else first: left is the token, right is the literal it replaced and the file it was in */
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
    // the three veils are pinned at values that were deliberately changed, not at the originals
    ['kit-veil', 'rgba(14, 10, 8, .6)', 'hud.css .hb-veil, and now every veil in the kit'],
    ['kit-veil-soft', 'rgba(14, 10, 8, .56)', 'settings.css .st-veil'],
    ['kit-veil-pause', 'rgba(16, 11, 8, .48)', 'hud.css .pz-veil'],
    ['kit-drop-lg', '0 12px 30px rgba(2, 8, 10, .65)', 'hud.css .hb-book'],
    ['kit-wood-sheen', 'rgba(210, 170, 110, .35)', 'hud.css .hud-btn'],
    ['kit-plank-shadow', 'rgba(30, 16, 6, .75)', 'dialogue.css .dlg-choice'],
    ['kit-face-display', "'Harbormaster', 'Deckhand', monospace", 'every heading in the kit'],
    ['kit-face-body', "'Deckhand', monospace", 'every line of body copy'],
    ['kit-face-title', "'Harbormaster', monospace", 'hud.css .pz-title'],
    ['kit-art-panel', "url('/art/ui/panel-square.png')", 'hud.css .hb-book'],
    ['kit-art-dialogue', "url('/art/ui/dialogue-box.png')", 'ui-kit.css .cs-dialogue'],
    ['kit-art-plank', "url('/art/ui/plank-button.png')", 'settings.css .st-close'],
    /* the front group: theme.css's twenty-two, which are a different palette on purpose and were aliased rather than merged */
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

})

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
  for (const file of KIT) {
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
      const deaf = [...css.matchAll(/--kit-fs-raw:\s*([^;]*cqw[^;]*);/g)]
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

// type sizes land on whole pixels, because a bitmap face resampled at a fraction loses strokes

/* every stylesheet whose type is sized off a container, a viewport or an em, and therefore every one that could hand the font engine a fraction */
const SIZED = [
  'src/game/ui/controls.css',
  'src/app/settings.css', 'src/app/transitions.css',
  'src/game/beats/beats.css', 'src/game/cutscene/ui-kit.css',
  'src/game/hud/dialogue.css', 'src/game/hud/hud.css', 'src/game/hud/wardrobe.css',
  'src/game/planner/planner.css', 'src/game/run/run.css', 'src/game/world/chart.css',
]

describe('type lands on whole pixels', () => {
  const css = strip(read(TOKENS))

  it('snaps through one formula rather than in every stylesheet', () => {
    // the snap wraps a clamp, so a size that is a ratio of its panel still has a floor and ceiling
    expect(css).toContain('*, *::before, *::after { --kit-fs: clamp(14px, var(--kit-fs-raw), 44px); }')
    expect(css).toContain('@supports (font-size: round(1px, 1px))')
    expect(css).toContain('round(clamp(14px, var(--kit-fs-raw), 44px), 1px)')
  })

  it('leaves the exact expression that ships today as the fallback arm', () => {
    /* a var() value is invalid at computed-value time and falls back to inherit rather than to the declaration above it, so the unsupported arm has to be a real declaration outside the feature query */
    const at = css.indexOf('--kit-fs: clamp(14px, var(--kit-fs-raw), 44px);')
    const gate = css.indexOf('@supports (font-size: round(1px, 1px))')
    expect(at).toBeGreaterThan(-1)
    expect(at).toBeLessThan(gate)
  })

  it('never rounds a real size down to nothing', () => {
    expect(css).toContain('max(1px, round(')
  })

  for (const file of SIZED) {
    it(`${path.basename(file)} sends every relative size through the snap`, () => {
      const sheet = strip(read(file))
      const loose = [...sheet.matchAll(/font-size:\s*([^;]+);/g)]
        .map((m) => m[1].trim())
        .filter((v) => v !== 'var(--kit-fs)')
        // a whole number of pixels is already snapped, and `inherit` is not a size
        .filter((v) => !/^\d+px$/.test(v) && v !== 'inherit')
      expect(loose, `${file} sizes text without snapping it`).toEqual([])
    })
  }
})

// every focusable element carries a visible focus ring, and nothing switches it back off
describe('a keyboard player can always see where they are', () => {
  const css = strip(read(TOKENS))

  it('rings every focusable element by kind, not by a list of class names', () => {
    /* the four the browser focuses without help, plus anything given a tabindex, and a control cannot be added without being one of them */
    for (const el of ['button', 'a[href]', 'select', 'summary', "[tabindex]:not([tabindex='-1'])"]) {
      expect(css, `nothing rings a bare <${el}>`).toContain(el)
    }
    expect(css).toContain('.kit-focusable:focus-visible')
    expect(css).toContain('outline: var(--kit-focus-width) solid var(--kit-focus)')
  })

  it('lets nobody switch the ring off again without saying why', () => {
    // `outline: none` is allowed only in a file that also draws its own focus ring
    const offenders: string[] = []
    for (const file of everyStylesheet()) {
      const sheet = strip(read(file))
      if (!/outline:\s*none/.test(sheet)) continue
      if (!/:focus-visible/.test(sheet) && file !== TOKENS) {
        offenders.push(`${file} switches the focus ring off and never draws one`)
      }
    }
    expect(offenders, 'stylesheets that delete the focus ring without replacing it').toEqual([])
  })
})
