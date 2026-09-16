/* Every comment held to one rule: one plain line saying what the code does.
 *
 *   node scripts/words-proof.mjs            report every violation
 *   node scripts/words-proof.mjs --files    just the file names, worst first
 *   node scripts/words-proof.mjs --dir=api  somewhere other than src
 *
 * A comment fails if it names a person, carries a date, cites a brief or a wave, uses
 * an em dash, explains history, or runs past one line. A script's own usage block is
 * exempt from the last of those.
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

function walkDir(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '_archive') walkDir(p, out) }
    else if (EXT.has(path.extname(e.name))) out.push(p)
  }
  return out
}

/* the things a comment is not allowed to carry */
const KEEP = /@ts-|eslint|prettier|vite-ignore|istanbul|@vite|webpack|c8 ignore|SPDX|@type\b|@param|@returns|#!/
const RULES = [
  { id: 'em-dash', re: /[—–]/ },
  { id: 'name', re: /\b(Ash|Ashwath|Wiseman|Claude|ChatGPT|Copilot)\b|\bGPT-?\d?\b/ },
  { id: 'date', re: /\b20\d\d-\d\d-\d\d\b/ },
  { id: 'citation', re: /\b(BRIEF-[A-Z0-9-]+|wave\s?\d|WAVE\s?\d|ENGINE-\d|MAPVIS-W\d|§|Q\d\d?\.\d)/ },
  { id: 'session', re: /\b(this session|last session|a session|the session|today's session)\b/i },
  { id: 'history', re: /(used to|than it was|previously|before this,|is now stale|went stale|superseded|we changed|which is why|the reason|had been)/i },
]

const NL = String.fromCharCode(10)

/* strip the delimiters off one comment's raw text and keep the lines that say something */
function bodyOf(raw) {
  return raw.split(NL)
    .map((l) => l.replace(/\r$/, '')
      .replace(/^\s*\/\*+/, '')
      .replace(/\*+\/\s*$/, '')
      .replace(/^\s*\*(?!\/)/, '')
      .replace(/^\s*\/\//, '')
      .trim())
    .filter((l) => l.length)
}

/* every comment in a source file, as {line, lines, text}. a character pass, so a slash
 * inside a string or a template is never read as the start of a comment. */
function commentsIn(src, isCss) {
  const out = []
  let i = 0
  let line = 1
  let quote = null
  const add = (startLine, raw, alone) => {
    const body = bodyOf(raw)
    if (!body.length) return
    out.push({ line: startLine, lines: body.length, text: body.join(' '), alone, endLine: line })
  }
  while (i < src.length) {
    const c = src[i]
    const d = src[i + 1]
    if (c === NL) { line++; i++; continue }
    if (quote) {
      if (c === '\\') { i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'" || (c === '`' && !isCss)) { quote = c; i++; continue }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2)
      const stop = end < 0 ? src.length : end + 2
      const at = line
      for (let k = i; k < stop; k++) if (src[k] === NL) line++
      add(at, src.slice(i, stop), true)
      i = stop
      continue
    }
    if (!isCss && c === '/' && d === '/') {
      const end = src.indexOf(NL, i)
      const stop = end < 0 ? src.length : end
      const startCol = src.lastIndexOf(NL, i) + 1
      const alone = src.slice(startCol, i).trim() === ''
      const prev = out[out.length - 1]
      /* consecutive whole-line comments read as one block */
      if (alone && prev && prev.alone && prev.endLine === line - 1) {
        const more = bodyOf(src.slice(i, stop))
        if (more.length) { prev.text += ' ' + more.join(' '); prev.lines++ }
        prev.endLine = line
      } else {
        add(line, src.slice(i, stop), alone)
      }
      i = stop
      continue
    }
    i++
  }
  return out
}

const files = ROOTS.flatMap((r) => (fs.existsSync(r) ? walkDir(r) : []))
const report = []
let totalRuns = 0

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const runs = commentsIn(src, f.endsWith('.css'))
  const bad = []
  for (const run of runs) {
    const text = run.text.trim()
    if (!text) continue
    totalRuns++
    if (KEEP.test(text)) continue
    /* a command line script's usage block is its help text rather than a code comment */
    const usage = /scripts[\\/]/.test(f) && run.line <= 3
    const hits = RULES.filter((r) => r.re.test(text)).map((r) => r.id)
    if (run.lines > 1 && !usage) hits.push('multi-line')
    if (hits.length) bad.push({ line: run.line, hits, text: text.replace(/\s+/g, ' ').slice(0, 110) })
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
