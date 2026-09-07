/* THE OBJECTIVE PANEL WEARS THE BEACH'S BAR, and this file is the fence.
 *
 * Ash, after playing rail-3: *"the panel on the top middle needs to be the very
 * narrow dark brown panel, the one from the beach map where it says stuff like
 * 'Walk to the pier'."* That bar is `.cs-prompt` in `cutscene/ui-kit.css`, and
 * what it wears is `--kit-art-plaque`.
 *
 * The panel was built wearing `kit-surface-band`, the big nine-sliced parchment
 * plaque the dialogue box and the arrival card wear, which is the natural thing
 * to reach for and is why it needs a test rather than a comment: nothing in the
 * tree fails when one class name is swapped back, and the failure is a hundred
 * pixels of ornate sheet at the top of every frame of the game.
 *
 * These read the files as text on purpose. jsdom does not resolve a background
 * shorthand carrying a custom property, so a computed-style assertion here would
 * pass on an empty string and prove nothing.
 */
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

  /* THE COMMENTS ARE ALLOWED TO SAY THE WORD and the code is not, which is why
   * this strips them first: both files name the band in prose, because the whole
   * point of writing it down is that the next session does not reach for it
   * again. Asserting on the raw text would fail on its own explanation. */
  it('is not the parchment band any more', () => {
    const bare = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(bare(tsx)).toContain('<p className="ob-panel" title={text}>')
    expect(bare(tsx)).not.toContain('kit-surface-band')
    expect(bare(css)).not.toContain('kit-surface-band')
  })

  it('reads at the size the beach bar reads at', () => {
    expect(panelBlock).toContain('calc(16px * var(--kit-text-scale))')
    expect(promptBlock).toContain('calc(16px * var(--kit-text-scale))')
    expect(panelBlock).toContain('color: var(--kit-wood-ink)')
    expect(panelBlock).toContain('--kit-face-body')
  })

  /* THE CAPS ARE A SHARE OF THE WIDTH AND NOT A NUMBER OF PIXELS. The picture is
   * stretched to the box, so its carved ends grow with it; a fixed side padding
   * puts the first and last letters on the carving. `.cs-prompt` measured this
   * once and paid for it, and the panel inherits the number rather than a second
   * guess at it. */
  it('clears the carved ends the way the beach bar does', () => {
    expect(panelBlock).toContain('padding: 8px max(30px, 7.5%) 13px')
    expect(promptBlock).toContain('padding: 8px max(30px, 7.5%) 13px')
  })

  /* NARROW, ONE LINE, TOP CENTRE, AND ABOVE THE BARS: the four things the brief
   * asked for that a restyle could quietly drop. */
  it('stays narrow, single line and above the letterbox', () => {
    expect(panelBlock).toContain('white-space: nowrap')
    expect(panelBlock).toContain('text-overflow: ellipsis')
    expect(panelBlock).toMatch(/max-width: min\(58vw, 640px\)/)
    expect(css).toContain('z-index: 71')
    expect(css).toContain('justify-content: center')
    expect(css).toContain("html[data-movie='1'] .ob-wrap")
  })

  /* THE PLAIN ARM IS A DOCUMENT: no game art and no pixel face, and it still has
   * to be a dark bar with light type rather than nothing at all. */
  it('is a plain dark bar in the plain arm', () => {
    const plain = css.slice(css.indexOf("html[data-skin='plain'] .ob-panel {"))
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
