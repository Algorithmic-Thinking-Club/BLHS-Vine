/* runs every named proof once against the deploy and reports what each one did
 *
 *   node scripts/live-run.mjs
 *   node scripts/live-run.mjs --only=dimwit,arrival-proof
 *
 * The exit code is what counts, not the PASS lines: a proof that dies part way prints
 * no failures at all and would otherwise read as green.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const LIVE = 'https://blhs-island-explorer.vercel.app'
const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`))
  return hit ? hit.slice(k.length + 3) : d
}
const ONLY = (arg('only', '') || '').split(',').filter(Boolean)

/* every named proof, with the way each one is told where the deploy is */
const PROOFS = [
  /* these take the deploy as --base and use --live only to permit it */
  { name: 'dimwit', args: ['--live', `--base=${LIVE}`, '--shots=reference/_archive/build-shots/dimwit-live'] },
  { name: 'arrival-proof', args: ['--live', `--base=${LIVE}`] },
  { name: 'ending-fix', args: ['--live', `--base=${LIVE}`] },
  { name: 'travel-proof', args: ['--live', `--base=${LIVE}`] },
  { name: 'sail-home-proof', args: ['--live', `--base=${LIVE}`] },
  { name: 'travel-pick-proof', args: ['--live', `--base=${LIVE}`] },
  { name: 'surfaces', args: ['--live', `--base=${LIVE}`] },
  { name: 'wave4-proof', args: [`--base=${LIVE}`] },
  { name: 'link-proof', args: ['--live', `--base=${LIVE}`] },
  { name: 'handover-proof', args: ['--live', `--base=${LIVE}`] },
  { name: 'wear-proof', args: ['--live', `--base=${LIVE}`] },
  /* these read the deploy off --live themselves */
  { name: 'sail-machine-proof', args: ['--live'] },
  { name: 'atc-island-proof', args: ['--live'] },
  { name: 'atc-quiz-proof', args: ['--live'] },
  { name: 'atc-tasks-proof', args: ['--live'] },
  { name: 'atc-walk-proof', args: ['--live'] },
  { name: 'atc-stamp-proof', args: ['--live'] },
  { name: 'atc-voyage-proof', args: ['--live'] },
  { name: 'atc-dock-proof', args: ['--live'] },
  /* these take it as the first positional argument */
  { name: 'grape-proof', args: [LIVE, '--live'] },
  { name: 'maw1-proof', args: [LIVE] },
]

const run = (name, args) => new Promise((done) => {
  const p = spawn('node', [`scripts/${name}.mjs`, ...args], { shell: false })
  let out = ''
  const t0 = Date.now()
  const kill = setTimeout(() => { try { p.kill('SIGKILL') } catch {} }, 8 * 60 * 1000)
  p.stdout.on('data', (d) => { out += d })
  p.stderr.on('data', (d) => { out += d })
  p.on('close', (code) => {
    clearTimeout(kill)
    const pass = (out.match(/^PASS\b/gm) || []).length
    const fail = (out.match(/^FAIL\b/gm) || []).length
    const threw = /Execution context was destroyed|triggerUncaughtException|ERR_MODULE|SyntaxError|Cannot find module/.test(out)
    done({ name, code, pass, fail, threw, secs: Math.round((Date.now() - t0) / 1000), out })
  })
})

const wanted = ONLY.length ? PROOFS.filter((p) => ONLY.includes(p.name)) : PROOFS
const rows = []
for (const p of wanted) {
  if (!fs.existsSync(`scripts/${p.name}.mjs`)) { console.log(`SKIP  ${p.name}, not on disk`); continue }
  process.stdout.write(`running ${p.name} ... `)
  const r = await run(p.name, p.args)
  rows.push(r)
  console.log(`${r.pass}P/${r.fail}F exit ${r.code}${r.threw ? ' THREW' : ''} in ${r.secs}s`)
}

const dir = 'reference/_archive/build-shots/live-run'
fs.mkdirSync(dir, { recursive: true })
for (const r of rows) fs.writeFileSync(path.join(dir, `${r.name}.log`), r.out)

const table = [
  '| proof | pass | fail | exit | seconds |',
  '| --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.name} | ${r.pass} | ${r.fail} | ${r.code}${r.threw ? ' (threw)' : ''} | ${r.secs} |`),
].join('\n')
console.log('\n' + table + '\n')
fs.writeFileSync(path.join(dir, 'live-run.md'), table + '\n')

const bad = rows.filter((r) => r.code !== 0 || r.fail > 0 || r.threw)
console.log(bad.length ? `NOT GREEN: ${bad.map((r) => r.name).join(', ')}` : 'every named proof is green against the deploy')
process.exit(bad.length ? 1 : 0)
