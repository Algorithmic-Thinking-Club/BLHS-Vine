/* Does the grape API's core mechanism actually work in MicroPython?
 *
 * The whole design rests on one thing: a member's Python yields an intent, gets
 * paused, and gets resumed with a result the engine hands back. That is
 * generator.send(), and nobody had ever checked it in the wasm build.
 *
 * Two things learned writing this, worth keeping:
 *   runPython() always returns null in this build. Values come out through
 *   globals.get(), which handles numbers and strings cleanly.
 *   So results cross as JSON strings, which is what a worker boundary can carry
 *   anyway. The spike proves the shape we would actually ship.
 *
 * Run: node scripts/mp-spike.mjs
 */
import { loadMicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs'

const mp = await loadMicroPython()
let pass = 0
let fail = 0

const test = (name, fn) => {
  try {
    console.log(`  PASS  ${name}\n        ${fn()}`)
    pass++
  } catch (e) {
    const msg = String(e?.message ?? e).split('\n').filter(Boolean).slice(-1)[0]
    console.log(`  FAIL  ${name}\n        ${msg}`)
    fail++
  }
}
/* run python, read one global back out */
const py = (code, name) => { mp.runPython(code); return mp.globals.get(name) }
const eq = (got, want) => { if (got !== want) throw new Error(`got ${got}, wanted ${want}`); return got }

console.log(`micropython loaded\n`)

test('A  generator.send() exists and resumes with the value sent', () => {
  const r = py(`
import json
def counter():
    a = yield "first"
    b = yield "saw:" + str(a)
    yield "saw:" + str(b)
g = counter()
out_a = json.dumps([g.send(None), g.send(10), g.send(20)])
`, 'out_a')
  return eq(r, '["first", "saw:10", "saw:20"]')
})

test('B  JS drives a member handler step by step, answering each intent', () => {
  mp.runPython(`
import json
def say(text):    return ["say", text]
def choose(opts): return ["choose", opts]

def meet_coach():
    yield say("You here to try out?")
    pick = yield choose(["Yes", "Just looking"])
    if pick == 0:
        score = yield ["play", "DebugRace"]
        yield ["award", score]
    else:
        yield say("Door's open either way.")

_gen = None
def start():
    global _gen, step
    _gen = meet_coach()
    step = json.dumps(_gen.send(None))
def resume(answer_json):
    global step
    try:
        step = json.dumps(_gen.send(json.loads(answer_json)))
    except StopIteration:
        step = "null"
`)
  const trace = []
  const answers = ['null', '0', '42', 'null']
  let intent = JSON.parse(py(`start()`, 'step'))
  for (let i = 0; intent !== null && i < 10; i++) {
    trace.push(`${intent[0]}(${JSON.stringify(intent[1])})`)
    const a = (answers[i] ?? 'null').replace(/'/g, '')
    intent = JSON.parse(py(`resume('${a}')`, 'step'))
  }
  const names = trace.map((t) => t.split('(')[0]).join(' -> ')
  eq(names, 'say -> choose -> play -> award')
  return trace.join('\n        ')
})

test('B2 the branch not taken proves the answer really reached python', () => {
  let intent = JSON.parse(py(`start()`, 'step'))
  const trace = []
  const answers = ['null', '1', 'null']
  for (let i = 0; intent !== null && i < 10; i++) {
    trace.push(intent[1])
    intent = JSON.parse(py(`resume('${answers[i] ?? 'null'}')`, 'step'))
  }
  return eq(trace[2], "Door's open either way.")
})

test('C  a forgotten yield is detectable with no inspect module', () => {
  const r = py(`
def forgot(): return 5
def remembered():
    yield 1
out_c = "real=%s plain=%s" % (type(remembered()).__name__ == "generator",
                              type(forgot()).__name__ == "generator")
`, 'out_c')
  return eq(r, 'real=True plain=False')
})

test('D  classes, inheritance, super, decorators, f-strings', () => {
  return py(`
def bonus(mult):
    def deco(fn):
        def wrapped(self, *a): return fn(self, *a) * mult
        return wrapped
    return deco

class Challenge:
    seconds = 45
    def score(self, right): return 10 if right else -5
    def label(self): return f"{type(self).__name__} ({self.seconds}s)"

class DebugRace(Challenge):
    seconds = 30
    @bonus(3)
    def score(self, right): return super().score(right)

d = DebugRace()
out_d = "%s right=%d wrong=%d" % (d.label(), d.score(True), d.score(False))
`, 'out_d')
})

test('E  a member crash is catchable and the runtime survives it', () => {
  let caught = ''
  try {
    mp.runPython(`raise ValueError("island under construction")`)
  } catch (e) {
    caught = String(e?.message ?? e).split('\n').filter(Boolean).slice(-1)[0].trim()
  }
  if (!caught) throw new Error('the raise never surfaced to JS')
  eq(py(`alive = 40 + 2`, 'alive'), 42)
  eq(py(`out_e = d.label()`, 'out_e'), 'DebugRace (30s)')
  return `caught "${caught}", and state defined before the crash is intact`
})

test('F  the traceback names the line a beginner wrote', () => {
  try {
    mp.runPython(`
def island():
    x = 1
    return x + "not a number"
island()
`)
  } catch (e) {
    const s = String(e?.message ?? e)
    if (!/line \d+/.test(s)) throw new Error(`no line number in: ${s.slice(0, 120)}`)
    return s.split('\n').filter(Boolean).slice(-2).join(' | ').trim()
  }
  throw new Error('no error raised')
})

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
