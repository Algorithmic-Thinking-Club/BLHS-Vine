/* proves a comment sweep touched only comments, by stripping every comment from two
 * versions of each file and comparing what is left
 *
 *   node scripts/code-same.mjs <ref>       compare the working tree against a git ref
 *
 * Reports one line per file whose code moved, and exits non-zero if any did.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'

const REF = process.argv[2] ?? 'HEAD'
const EXT = /\.(ts|tsx|js|mjs|css)$/

/* take every comment out, leaving the code and nothing else */
function strip(src, isCss) {
  let out = ''
  let i = 0
  const n = src.length
  let quote = null
  while (i < n) {
    const c = src[i], d = src[i + 1]
    if (quote) {
      out += c
      if (c === '\\') { out += d ?? ''; i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === '"' || c === "'" || (c === '`' && !isCss)) { quote = c; out += c; i++; continue }
    if (c === '/' && d === '*') {
      const end = src.indexOf('*/', i + 2)
      i = end < 0 ? n : end + 2
      out += ' '
      continue
    }
    if (!isCss && c === '/' && d === '/') {
      const end = src.indexOf('\n', i)
      i = end < 0 ? n : end
      continue
    }
    out += c
    i++
  }
  /* whitespace is not code: a rewrapped comment moves the lines under it */
  return out.replace(/\s+/g, ' ').trim()
}

const changed = execSync(`git diff --name-only ${REF}`, { encoding: 'utf8' })
  .split('\n').map((s) => s.trim()).filter((s) => s && EXT.test(s))

const moved = []
let checked = 0
for (const f of changed) {
  let before
  try { before = execSync(`git show ${REF}:${f}`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }) }
  catch { continue }
  if (!fs.existsSync(f)) { moved.push({ f, why: 'gone from the working tree' }); continue }
  const after = fs.readFileSync(f, 'utf8')
  const isCss = f.endsWith('.css')
  checked++
  const a = strip(before, isCss), b = strip(after, isCss)
  if (a !== b) {
    /* say where they first part company, so the line is findable */
    let k = 0
    while (k < a.length && k < b.length && a[k] === b[k]) k++
    moved.push({ f, why: `code differs from character ${k}: ${JSON.stringify(a.slice(k, k + 90))} became ${JSON.stringify(b.slice(k, k + 90))}` })
  }
}

for (const m of moved) console.log(`MOVED  ${m.f}\n       ${m.why}`)
console.log(`\n${checked} files compared against ${REF}, ${moved.length} with code changes`)
process.exit(moved.length ? 1 : 0)
