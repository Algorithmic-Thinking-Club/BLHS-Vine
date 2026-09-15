/* checks the objective bar keeps wearing the beach prompt's drawn plaque */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = (f: string) => readFileSync(fileURLToPath(new URL(f, import.meta.url)), 'utf8')
const css = here('./objective.css')
const tsx = here('./Objective.tsx')
const prompt = here('../cutscene/ui-kit.css')

/* the `.cs-prompt` block, which is the thing being matched */
const promptBlock = prompt.slice(prompt.indexOf('.cs-prompt {'), prompt.indexOf('@keyframes cs-pulse'))
/* the `.ob-panel` block, up to its first `}` at the start of a line */
const panelBlock = css.slice(css.indexOf('.ob-panel {'), css.indexOf('@keyframes ob-drop'))

describe('the objective panel is the beach bar', () => {
  it('wears the drawn piece the beach prompt wears', () => {
    expect(panelBlock).toContain('background: var(--kit-art-plaque) center / 100% 100% no-repeat')
    expect(promptBlock).toContain('background: var(--kit-art-plaque) center / 100% 100% no-repeat')
  })

  /* the comments are allowed to name the band, so they are stripped before matching */
  it('is not the parchment band any more', () => {
    const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
    /* the one line is still its own element wearing its own class */
    expect(bare(tsx)).toMatch(/className="ob-panel"/)
    expect(bare(tsx)).toMatch(/title=\{text\}/)
    /* the bar may not wear the band and the sheet under it must, asserted on the class attribute rather than the whole file because the file draws two surfaces and only one is the single line at the top of the game */
    expect(bare(tsx)).not.toMatch(/className="ob-panel[^"]*kit-surface-band/)
    expect(bare(tsx)).toMatch(/className="ob-sheet kit-surface-band"/)
    /* the sheet is allowed the band and the bar is not: a task list is the ornate parchment sheet the dialogue box wears, and one line of chrome at the top of every frame is not */
    const panelOnly = bare(css).slice(0, bare(css).indexOf('.ob-sheet {'))
    expect(panelOnly).not.toContain('kit-surface-band')
  })

  it('reads at the size the beach bar reads at', () => {
    expect(panelBlock).toContain('calc(16px * var(--kit-text-scale))')
    expect(promptBlock).toContain('calc(16px * var(--kit-text-scale))')
    expect(panelBlock).toContain('color: var(--kit-wood-ink)')
    expect(panelBlock).toContain('--kit-face-body')
  })

  /* the side padding is a share of the width, so the letters clear the carved ends */
  it('clears the carved ends the way the beach bar does', () => {
    expect(panelBlock).toContain('padding: 8px max(30px, 7.5%) 13px')
    expect(promptBlock).toContain('padding: 8px max(30px, 7.5%) 13px')
  })

  /* narrow, one line, top centre and above the bars: the four properties a restyle could quietly drop */
  it('stays narrow, single line and above the letterbox', () => {
    expect(panelBlock).toContain('white-space: nowrap')
    expect(panelBlock).toContain('text-overflow: ellipsis')
    expect(panelBlock).toMatch(/max-width: min\(58vw, 640px\)/)
    expect(css).toContain('z-index: 71')
    expect(css).toContain('justify-content: center')
    expect(css).toContain("html[data-movie='1'] .ob-wrap")
  })

  /* the plain arm is a document: no game art and no pixel face, and still a dark bar with light type rather than nothing at all */
  it('is a plain dark bar in the plain arm', () => {
    /* bounded to its own block, because slicing to the end of the file became a false failure the moment the task sheet added plain-arm rules underneath */
    const from = css.indexOf("html[data-skin='plain'] .ob-panel {")
    const plain = css.slice(from, css.indexOf('}', from) + 1)
    expect(plain).toContain('background-image: none')
    expect(plain).toContain('background-color: var(--kit-wood-lo)')
    expect(plain).toContain('color: var(--kit-wood-ink)')
    expect(plain).not.toMatch(/Deckhand|Harbormaster/)
  })

  /* the behaviour the restyle was not allowed to touch */
  it('still says the island line, then the scene, then the year', () => {
    expect(tsx).toContain('said ?? world ?? objectiveLine(o, map)')
  })
})
