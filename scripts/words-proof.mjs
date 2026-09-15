/* Every comment in src/ held to one rule: one plain line saying what the code does.
 *
 *   node scripts/words-proof.mjs            report every violation
 *   node scripts/words-proof.mjs --files    just the file names, worst first
 *   node scripts/words-proof.mjs --dir=api  somewhere other than src
 *
 * A comment fails if it names a person, carries a date, cites a brief or a session or
 * a wave, uses an em dash, or runs past one line.
 */
import fs from 'node:fs'
import path from 'node:path'

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const ROOTS = arg('dir', 'src').split(',')
const NAMES_ONLY = process.argv.includes('--files')

const EXT = new Set(['.ts', '.tsx', '.css', '.mjs', '.js'])

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else if (EXT.has(path.extname(e.name))) out.push(p)
  }
  return out
}

/* the comment runs in a file, as {start, end, lines}. Strings that merely contain //
 * are skipped by tracking quotes, which is enough for this repo's source. */
function comments(src) {
  const lines = src.split(/\r?\n/)
  const runs = []
  let block = null
  let inTemplate = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (block) {
      block.lines.push(line)
      if (line.includes('*/')) { block.end = i; runs.push(block); block = null }
      continue
    }
    /* a template literal can hold anything, so nothing inside one is a comment */
    const ticks = (line.match(/`/g) || []).length
    if (inTemplate) { if (ticks % 2 === 1) inTemplate = false; continue }
    const openBlock = line.indexOf('/*')
    const lineSlash = (() => {
      let q = null
      for (let c = 0; c < line.length - 1; c++) {
        const ch = line[c]
        if (q) { if (ch === '\\') c++; else if (ch === q) q = null; continue }
        if (ch === '"' || ch === "'") { q = ch; continue }
        if (ch === '/' && line[c + 1] === '/') return c
        if (ch === '/' && line[c + 1] === '*') return -2 - c
      }
      return -1
    })()
    if (lineSlash <= -2) {
      const at = -(lineSlash + 2)
      if (line.includes('*/', at + 2)) runs.push({ start: i, end: i, lines: [line.slice(at)] })
      else block = { start: i, end: i, lines: [line.slice(at)] }
      continue
    }
    if (lineSlash >= 0) {
      /* a comment with code in front of it is its own one line. Only comments that
       * stand alone on their line run together into one block. */
      const alone = line.slice(0, lineSlash).trim() === ''
      const prev = runs[runs.length - 1]
      if (alone && prev && prev.end === i - 1 && prev.slash && prev.alone) { prev.lines.push(line.slice(lineSlash)); prev.end = i }
      else runs.push({ start: i, end: i, lines: [line.slice(lineSlash)], slash: true, alone })
      continue
    }
    if (ticks % 2 === 1) inTemplate = true
    if (openBlock >= 0) block = { start: i, end: i, lines: [line.slice(openBlock)] }
  }
  return runs
}

/* what the text of a comment run says, with the syntax taken off */
const bodyOf = (run) => run.lines
  .map((l) => l.replace(/^\s*\/\*+/, '').replace(/\*+\/\s*$/, '').replace(/^\s*\*(?!\/)/, '').replace(/^\s*\/\//, '').trim())
  .filter((l) => l.length)

/* the things a comment is not allowed to carry */
const KEEP = /@ts-|eslint|prettier|vite-ignore|istanbul|@vite|webpack|c8 ignore|SPDX|@type\b|@param|@returns/
const RULES = [
  { id: 'em-dash', re: /[—–]/, say: 'an em dash' },
  { id: 'name', re: /\b(Ash|Ashwath|Wiseman|Claude|ChatGPT|GPT|Copilot|the model)\b/, say: 'names a person or an AI' },
  { id: 'date', re: /\b20\d\d-\d\d-\d\d\b/, say: 'carries a date' },
  { id: 'citation', re: /\b(BRIEF-[A-Z0-9-]+|wave\s?\d|WAVE\s?\d|ENGINE-\d|MAPVIS-W\d|§|Q\d\d\.\d)/, say: 'cites a brief, a wave or a section' },
  { id: 'session', re: /\b(this session|last session|a session|the session|today's session|handoff)\b/i, say: 'talks about a session' },
  { id: 'history', re: /\b(used to|it was|previously|before this|the old |stale|superseded|we changed|which is why|the reason|because that cost|had been)\b/i, say: 'explains history or why' },
]

const files = ROOTS.flatMap((r) => (fs.existsSync(r) ? walk(r) : []))
const report = []
let totalRuns = 0

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const runs = comments(src)
  const bad = []
  for (const run of runs) {
    const body = bodyOf(run)
    if (!body.length) continue
    totalRuns++
    const text = body.join(' ')
    if (KEEP.test(text)) continue
    const hits = RULES.filter((r) => r.re.test(text)).map((r) => r.id)
    if (body.length > 1) hits.push('multi-line')
    if (hits.length) bad.push({ line: run.start + 1, hits, text: text.slice(0, 110) })
  }
  if (bad.length) report.push({ file: f.replace(/\\/g, '/'), bad })
}

report.sort((a, b) => b.bad.length - a.bad.length)
const total = report.reduce((n, r) => n + r.bad.length, 0)

if (NAMES_ONLY) {
  for (const r of report) console.log(`${String(r.bad.length).padStart(4)}  ${r.file}`)
} else {
  for (const r of report) {
    console.log(`\n${r.file}  (${r.bad.length})`)
    for (const b of r.bad) console.log(`  ${String(b.line).padStart(5)}  ${b.hits.join(',')}  ${b.text}`)
  }
}
console.log(`\n${total} comments to rewrite across ${report.length} files, out of ${totalRuns} comments in ${files.length} files`)
process.exit(total ? 1 : 0)
