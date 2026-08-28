/* THE WORKER: a member's python, running off the main thread.
 *
 * The whole reason the sandbox is free. A member's island is a different
 * runtime in a different thread, so an island that crashes, or spins, cannot
 * take the engine down with it: the worst it can do is stop being an island.
 * The July design listed that as something to build; the runtime choice gives
 * it away (VINE-AND-GRAPE.md).
 *
 * WHAT THE SPIKE SETTLED, and must not be relearned (scripts/mp-spike.mjs):
 *   runPython() always returns null in this build. Values come out through
 *   globals.get(), and they come out as JSON strings, which is exactly what a
 *   worker postMessage carries anyway. So the shape that was proven in node is
 *   the shape that ships, rather than an FFI convenience that dies here.
 */
import { loadMicroPython, type MicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs'
/* the wasm goes through the bundler rather than being read off a path we
 * guessed. In dev this resolves inside node_modules; in a production build vite
 * emits a hashed asset and hands back its real URL, and loadMicroPython's `url`
 * option is the supported way to point the runtime at it (it becomes
 * Module.locateFile). Without this, a built worker asks for micropython.wasm
 * next to its own hashed chunk and gets a 404. */
import wasmUrl from '@micropython/micropython-webassembly-pyscript/micropython.wasm?url'
import VINE_PY from './vine.py?raw'
import DRIVER_PY from './driver.py?raw'
import type { FromWorker, ToWorker } from './protocol'

/* tsconfig's lib is DOM, not WebWorker, and adding WebWorker collides with DOM
 * for all 133 files in the project. One cast here is cheaper than that, and it
 * is contained to the single line that needs it. */
const post = (m: FromWorker) => (self as unknown as { postMessage(m: unknown): void }).postMessage(m)

let mp: MicroPython | null = null

/* ~170 KB and under a tenth of a second, which is the entire reason this is
 * MicroPython and not Pyodide: a freshman plays the finished game on a 4 GB
 * school Chromebook. Booted once and reused, so a second island is free. */
async function boot(): Promise<MicroPython> {
  if (mp) return mp
  const py = await loadMicroPython({
    url: wasmUrl,
    stdout: (text) => post({ t: 'print', text }),
    stderr: (text) => post({ t: 'print', text }),
  })
  /* the member-facing module is a real file on the runtime's own filesystem, so
   * `from vine import say` is an ordinary import and not a trick */
  py.FS.writeFile('vine.py', VINE_PY)
  py.runPython(DRIVER_PY)
  mp = py
  return py
}

/* Run one call and forward whatever the pump left in `_step`.
 *
 * A python exception surfaces here with its traceback attached, and this is
 * step three in nine lines: the island stops, the worker survives it, and the
 * engine is told in a message rather than by dying. The spike measured that
 * state defined before the crash is still intact afterwards. */
function pump(py: MicroPython, call: string) {
  try {
    py.runPython(call)
  } catch (e) {
    const traceback = String((e as Error)?.message ?? e).trim()
    /* the last line of a traceback is the sentence a person can act on; the
     * rest is the file and line, which the engine keeps for the console */
    const error = traceback.split('\n').filter(Boolean).pop()?.trim() ?? 'the island stopped'
    post({ t: 'crash', error, traceback })
    return
  }
  post(JSON.parse(py.globals.get('_step') as string) as FromWorker)
}

self.addEventListener('message', (ev: MessageEvent) => { void handle(ev.data as ToWorker) })

/* Strictly one message in, one message out. The engine never sends a resume
 * until an intent has come back, so there is no interleaving to guard against
 * and no SharedArrayBuffer anywhere near this. */
async function handle(msg: ToWorker) {
  let py: MicroPython
  try {
    py = await boot()
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    post({ t: 'crash', error: `micropython did not start: ${why}`, traceback: why })
    return
  }

  if (msg.t === 'run') {
    py.FS.writeFile(msg.name, msg.source)
    py.globals.set('_mod', msg.name.replace(/\.py$/, ''))
    py.globals.set('_entry', msg.entry)
    /* the call is a constant. Everything variable went in through globals. */
    pump(py, '_begin(_mod, _entry)')
    return
  }

  py.globals.set('_reply', JSON.stringify(msg.result))
  pump(py, '_resume(_reply)')
}
