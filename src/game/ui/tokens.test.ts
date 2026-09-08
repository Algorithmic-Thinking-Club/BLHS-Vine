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
import {
  applySkin, currentSkin, KIT_SKINS, resolveSkin, skinFromArm, skinFromUrl, wearAssignedSkin,
} from './skin'
import { beginAdventure, clearSave, writeSave } from '../save'

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), 'utf8')
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const TOKENS = 'src/game/ui/tokens.css'

/* every stylesheet in the tree, found rather than listed, because the failure
 * these tests exist to catch is a NEW surface that nobody added to a list. */
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
function everySource(dir = 'src'): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(path.resolve(process.cwd(), dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) out.push(...everySource(rel))
    else if (/\.(css|ts|tsx)$/.test(e.name)) out.push(rel)
  }
  return out
}

/* the stylesheets that ARE the kit: the surfaces the painted game shows. */
const KIT = [
  /* THE CONTROL KIT, added 2026-09-01. It is the file every button, tab, field,
   * gauge, socket and stamp in the game is now made of, so it is the one file
   * where a retyped colour would reach twenty surfaces at once. */
  'src/game/ui/controls.css',
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
  /* `_` is in the class because a MAPVIS handle can carry one (`icon_set`), and
   * without it `--kit-art-icon_set` was read as `kit-art-icon` and the audit
   * below silently believed a handle was nulled that was not */
  return new Set([...body.matchAll(/--([a-z0-9_-]+)\s*:/g)].map((m) => m[1]))
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
    /* THE THREE VEILS ARE THE ONLY EXTRACTED VALUES THAT HAVE MOVED, and they
     * moved on an order: the fresh-eyes round of 2026-08-30 read a fullscreen
     * panel over a half-visible world as text-over-text and failed the surface.
     * They are pinned again at the new numbers, because the reason this list
     * exists is that a colour cannot change without somebody saying so, not that
     * a colour can never change. */
    /* MOVED AGAIN ON 2026-09-01, and the arithmetic is at the token. The
     * art-direction pass measured the world behind a panel at four percent
     * luminance and read it as a void rather than as a dimmed island. The three
     * are now within twelve points of each other instead of twenty-two. */
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

/* ---- §16: THE PLAIN ARM HAS NO ART, PROVED BY READING THE TREE -----------
 *
 * The adversarial pass of 2026-08-31 found five surfaces still painting PixelLab
 * art under `html[data-skin='plain']`, and every one of them failed the same
 * way: the rule spelled the png out, so `--kit-art-panel: none` could never
 * reach it. `.bt-stage` was one of them, and that is the frame every scored item
 * in the study is read on.
 *
 * Nothing errors when this rots. A wooden panel appears in a plain sheet, the
 * control arm quietly stops being a control arm, and the only way anyone finds
 * out is by looking. So it is read off the files instead. */

const artHandlesIn = (src: string): string[] =>
  [...src.matchAll(/--kit-art-([A-Za-z0-9_-]+)/g)]
    .map((m) => m[1])
    /* `kit.ts` writes `--kit-art-${v.handle}`, which is not a handle */
    .filter((h) => !h.startsWith('$'))

describe('the plain arm has no art anywhere, and nothing can quietly add some', () => {
  const tokens = strip(read(TOKENS))
  const plain = declaredIn(tokens, "html[data-skin='plain'] {")

  it('nulls every art handle the tree can actually mount', () => {
    const mounted = new Set<string>()
    for (const file of everySource()) {
      if (file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      for (const h of artHandlesIn(read(file))) mounted.add(h)
      /* a `.kit-surface-<handle>` in a className is a mount too: `kit.ts` writes
       * `--kit-art-<handle>` for that same handle at runtime, and the class is
       * the only place in `src/` the name appears */
      for (const m of read(file).matchAll(/kit-surface-([A-Za-z0-9_-]+)/g)) {
        if (!m[1].startsWith('$') && m[1] !== '') mounted.add(m[1])
      }
    }
    /* mounted by `kitFaceStyle.ts` through a variable, so the name only exists
     * in prose there and in the live `/api/v1/ui` record */
    mounted.add('icon_set')
    const unnulled = [...mounted].filter((h) => !plain.has(`kit-art-${h}`)).sort()
    expect(unnulled, 'art handles the plain arm would still paint').toEqual([])
  })

  it('lets no stylesheet spell an art url out where a token cannot reach it', () => {
    const offenders: string[] = []
    for (const file of everyStylesheet()) {
      const css = strip(read(file))
      for (const m of css.matchAll(/([-a-z]+)\s*:\s*([^;{}]*url\(\s*['"]?\/art\/[^;{}]*)/g)) {
        /* tokens.css's own `:root` is where the urls are SUPPOSED to live: that
         * is the indirection every other rule reads through */
        if (file === TOKENS) continue
        offenders.push(`${file}: ${m[1]}: ${m[2].trim()}`)
      }
    }
    expect(offenders, 'literal art urls that `--kit-art-*: none` cannot switch off').toEqual([])
  })

  it('reintroduces no art inside any plain block, in any stylesheet', () => {
    const offenders: string[] = []
    for (const file of everyStylesheet()) {
      const css = strip(read(file))
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1]
        const body = m[2]
        if (!sel.includes("data-skin='plain'")) continue
        if (/url\(/.test(body)) offenders.push(`${file} · ${sel.trim()}: a url`)
        /* `border-image: none` is the OPPOSITE of art and has to be allowed, or
         * this guard forbids the one declaration that turns a frame OFF. Since
         * 2026-08-31 the paper skin draws every panel as a nine-slice, so the
         * plain arm has to say `none` out loud: it would inherit one otherwise,
         * and a carved wooden frame around a worksheet is exactly what this test
         * exists to catch. Any other value is still an offence. */
        for (const bi of body.matchAll(/border-image[a-z-]*:\s*([^;]+)/g)) {
          if (bi[1].trim() !== 'none') offenders.push(`${file} · ${sel.trim()}: a border-image`)
        }
        if (/image-rendering:\s*(pixelated|crisp-edges)/.test(body)) {
          offenders.push(`${file} · ${sel.trim()}: pixel-art rendering`)
        }
      }
    }
    expect(offenders, 'the plain skin painting art back on').toEqual([])
  })

  it('keeps the integer snap in this arm rather than trading it for a size band', () => {
    // the ruling asks for worksheet sizes AND the snap ENGINE-4 added, not one of them
    expect(tokens).toContain("html[data-skin='plain'] *,")
    expect(tokens).toContain('--kit-fs: clamp(15px, var(--kit-fs-raw), 28px);')
    expect(tokens).toContain('--kit-fs: max(1px, round(clamp(15px, var(--kit-fs-raw), 28px), 1px));')
    // and the fallback arm is still a real declaration outside the feature query
    /* SEARCHED FROM THE PLAIN BLOCK, not from the top of the file. The paper skin
     * grew its own clamp on 2026-08-31, so a bare indexOf for 'max(1px, round(clamp('
     * found the PAPER one, which sits earlier, and the ordering check compared two
     * different arms and failed on a file that was correct. */
    const from = tokens.indexOf("html[data-skin='plain'] *,")
    const loose = tokens.indexOf('--kit-fs: clamp(15px, var(--kit-fs-raw), 28px);', from)
    const snapped = tokens.indexOf('--kit-fs: max(1px, round(clamp(15px,', from)
    expect(loose).toBeLessThan(snapped)
  })

  it('casts no shadow and renders no pixel art', () => {
    expect(tokenValue(tokens, 'kit-pixel', "html[data-skin='plain']")).toBe('auto')
    for (const t of ['kit-drop-lg', 'kit-drop-md', 'kit-drop-sm']) {
      /* a transparent offset-zero shadow rather than a deleted token: an unset
       * token makes `filter: drop-shadow(var(--kit-drop-lg))` invalid at
       * computed-value time, and that falls back to INHERIT, not to nothing */
      expect(tokenValue(tokens, t, "html[data-skin='plain']")).toBe('0 0 0 rgba(0, 0, 0, 0)')
    }
  })

  /* FOUND BY LOOKING RATHER THAN BY READING, 2026-08-31: the first plain-arm
   * screenshot of the year sheet came back in Harbormaster. The token layer only
   * ever reached six stylesheets, and `planner.css`, `run.css`, `chart.css`,
   * `beats.css` and `stage/placecard.css` spell the two game faces out about
   * fifty times between them. Four of those are surfaces BLHS content is
   * delivered on. One rule ends all of it and this holds the rule down. */
  it('puts one face on the whole arm, past every stylesheet that spells a game face out', () => {
    expect(tokens).toContain("html[data-skin='plain'] * { font-family: var(--kit-face-body); }")
  })

  it('names a game face in no plain rule anywhere', () => {
    const offenders: string[] = []
    for (const file of everyStylesheet()) {
      const css = strip(read(file))
      for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!m[1].includes("data-skin='plain'")) continue
        if (/Harbormaster|Deckhand|Jersey 25|Pixelify/.test(m[2])) {
          offenders.push(`${file} · ${m[1].trim()}`)
        }
      }
    }
    expect(offenders, 'the plain arm wearing a game face').toEqual([])
  })

  it('gives the arm a system face and no game face, on every one of the three', () => {
    for (const t of ['kit-face-display', 'kit-face-title', 'kit-face-body', 'kit-front-face-display', 'kit-front-face-ui']) {
      const v = tokenValue(tokens, t, "html[data-skin='plain']") ?? ''
      expect(v, `${t} in the plain arm`).toContain('system-ui')
      expect(v).not.toContain('Harbormaster')
      expect(v).not.toContain('Deckhand')
    }
  })
})

/* ---- the wire that was never run ------------------------------------------
 *
 * `save.ts` has recorded the assigned arm since join day and `intent-engine.ts`
 * has read it, and until 2026-08-31 nothing put it on <html>. A student the
 * server had assigned to the control group played the full painted game
 * everywhere except inside four beat screens, which is not a control condition.
 * These hold the wire down at both ends: the pure order, and the attribute. */
describe('the assigned study arm reaches the skin', () => {
  it('ranks the URL over the arm and the arm over any stored preference', () => {
    expect(resolveSkin('?skin=plain', 'game', 'paper')).toBe('plain')
    expect(resolveSkin('?skin=paper', 'plain', 'plain')).toBe('paper')
    // the arm is assigned, not chosen: a settings blob cannot undo it
    expect(resolveSkin('', 'plain', 'paper')).toBe('plain')
    expect(resolveSkin('', 'game', 'plain')).toBe('paper')
    // nobody joined: the preference, then the default
    expect(resolveSkin('', undefined, 'plain')).toBe('plain')
    expect(resolveSkin('', undefined, undefined)).toBe('paper')
    expect(resolveSkin('', null, null)).toBe('paper')
  })

  it('knows an unassigned run is not the same as a game-arm one', () => {
    expect(skinFromArm('plain')).toBe('plain')
    expect(skinFromArm('game')).toBe('paper')
    expect(skinFromArm(undefined)).toBeNull()
  })

  it('writes the attribute off a real save, with nobody asking for a skin', () => {
    clearSave()
    applySkin('paper')
    beginAdventure()
    expect(document.documentElement.dataset.skin).toBeUndefined()

    /* the write alone is the test: `skin.ts` subscribes to the save at import,
     * because the arm arrives LATE (net.ts writes it when the join returns) and
     * a skin decided once at boot is decided before the answer exists */
    writeSave({ arm: 'plain' })
    expect(document.documentElement.dataset.skin).toBe('plain')
    expect(currentSkin()).toBe('plain')

    writeSave({ arm: 'game' })
    expect(document.documentElement.dataset.skin).toBeUndefined()

    writeSave({ arm: 'plain' })
    wearAssignedSkin('paper')     // the settings pass, which must not win
    expect(currentSkin()).toBe('plain')

    clearSave()
    applySkin('paper')
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

/* ---- the integer snap ---------------------------------------------------
 *
 * A container width times a setting is fractional at nearly every window, and a
 * bitmap face resampled at 1.056 of its drawn size drops a column out of a
 * letter. The snap is code rather than a promise, so these hold the two halves
 * of it: the formula exists in both arms, and no surface goes round it. */

/* every stylesheet whose type is sized off a container, a viewport or an em, and
 * therefore every one that could hand the font engine a fraction */
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
    /* THE PAPER SKIN GREW A FLOOR AND A CEILING on 2026-08-31. Ash could not read
     * the panels and the measurement agreed: eight of the yearbook's twelve text
     * elements were under 14px, two of them at 10. A size in this game is a RATIO
     * of its panel, so nothing stopped a ratio resolving to decoration. The snap
     * is unchanged and now wraps a clamp instead of a bare ratio. */
    expect(css).toContain('*, *::before, *::after { --kit-fs: clamp(14px, var(--kit-fs-raw), 44px); }')
    expect(css).toContain('@supports (font-size: round(1px, 1px))')
    expect(css).toContain('round(clamp(14px, var(--kit-fs-raw), 44px), 1px)')
  })

  it('leaves the exact expression that ships today as the fallback arm', () => {
    /* the trap this guards: a var() value is invalid at COMPUTED-value time, and
     * that falls back to inherit rather than to the declaration above it. So the
     * unsupported arm has to be a real declaration outside the feature query. */
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

/* ---- THE KEYBOARD PATH IS VISIBLE, AND STAYS VISIBLE --------------------------
 *
 * Part IV §40.9: "There is a fifth state and the repo actively removes it."
 * `outline: none` appears in five stylesheets and nothing replaced it, so a
 * student driving the game from the keyboard, which §11.3 says is a supported way
 * to play, could not see what was selected in any panel in the game. On a school
 * Chromebook the trackpad is bad enough that keys are the FASTER way to play, so
 * this is not an accommodation, it is the second of the two ways the game is
 * played and it was invisible.
 *
 * The ring is now matched by ELEMENT rather than by a list of eighteen classes,
 * because a list covers the controls that existed the day it was written and the
 * nineteenth button ships blind. These two guard that shape rather than the ring
 * itself: one that the law is a law, and one that nobody re-adds a bare
 * `outline: none` on top of it.
 */
describe('a keyboard player can always see where they are', () => {
  const css = strip(read(TOKENS))

  it('rings every focusable element by kind, not by a list of class names', () => {
    /* the four the browser focuses without help, plus anything given a tabindex.
     * A control cannot be added to this game without being one of them. */
    for (const el of ['button', 'a[href]', 'select', 'summary', "[tabindex]:not([tabindex='-1'])"]) {
      expect(css, `nothing rings a bare <${el}>`).toContain(el)
    }
    expect(css).toContain('.kit-focusable:focus-visible')
    expect(css).toContain('outline: var(--kit-focus-width) solid var(--kit-focus)')
  })

  it('lets nobody switch the ring off again without saying why', () => {
    /* `outline: none` is legitimate in exactly one shape: turning off the default
     * ring in order to draw a better one, in the same block or the next. What is
     * not legitimate is deleting it and stopping. Every occurrence in the tree has
     * to sit in a file that also has a `:focus-visible` rule, which is the cheapest
     * check that catches the real failure and does not fight the real use. */
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
