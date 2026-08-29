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
import GRAPE_PY from './grape.py?raw'
import DRIVER_PY from './driver.py?raw'
import { PROTOCOL, type FromWorker, type PyStep, type ToWorker } from './protocol'

/* tsconfig's lib is DOM, not WebWorker, and adding WebWorker collides with DOM
 * across every file in src. One cast here is cheaper than that, and it is
 * contained to the single line that needs it. */
const post = (m: FromWorker) => (self as unknown as { postMessage(m: unknown): void }).postMessage(m)

let mp: MicroPython | null = null

/* ~170 KB and under a tenth of a second, which is the entire reason this is
 * MicroPython and not Pyodide: a freshman plays the finished game on a 4 GB
 * school Chromebook. Booted once per session and reused for every call and
 * resume in it. NOT once per game: openGrape makes a worker per island, so a
 * second island pays the boot again. That is the honest reading of one `new
 * Worker` in runGrape.ts, and it is fine at this size; a shared worker would be
 * a change there rather than a comment here. */
async function boot(): Promise<MicroPython> {
  if (mp) return mp
  const py = await loadMicroPython({
    url: wasmUrl,
    stdout: (text) => post({ t: 'print', text }),
    stderr: (text) => post({ t: 'print', text }),
  })
  /* THE TWO MEMBER-FACING MODULES ARE REAL FILES on the runtime's own
   * filesystem, so `from vine import say` and `from grape import on_talk` are
   * ordinary imports and not a trick. They are written HERE, by the engine,
   * which is what makes a member's own copy of either one harmless: theirs is
   * for their editor, this one is the one that runs. */
  py.FS.writeFile('vine.py', VINE_PY)
  py.FS.writeFile('grape.py', GRAPE_PY)
  py.runPython(DRIVER_PY)
  mp = py
  return py
}

/* Run one call and hand back whatever the pump left in `_step`.
 *
 * A python exception surfaces here with its traceback attached, and this is
 * the sandbox in nine lines: the island stops, the worker survives it, and the
 * engine is told in a message rather than by dying. The spike measured that
 * state defined before the crash is still intact afterwards, which is why a
 * crash inside one handler does not cost the island its other handlers. */
function step(py: MicroPython, call: string): PyStep | null {
  try {
    py.runPython(call)
  } catch (e) {
    const traceback = String((e as Error)?.message ?? e).trim()
    /* the last line of a traceback is the sentence a person can act on; the
     * rest is the file and line, which the engine keeps for the console */
    const error = traceback.split('\n').filter(Boolean).pop()?.trim() ?? 'the island stopped'
    post({ t: 'crash', error, traceback })
    return null
  }
  return JSON.parse(py.globals.get('_step') as string) as PyStep
}

self.addEventListener('message', (ev: MessageEvent) => { void handle(ev.data as ToWorker) })

/* Strictly one message in, one message out. The engine never sends a resume
 * until an intent has come back, so there is no interleaving to guard against
 * and no SharedArrayBuffer anywhere near this. */
async function handle(msg: ToWorker) {
  /* EVERYTHING is inside this, and that is the point rather than tidiness.
   *
   * handle() is invoked as a floating promise, so anything that throws out of
   * it becomes a rejection nobody catches: no message goes back, and the engine
   * waits for an answer that is never coming. A silent hang is worse than a
   * crash and it is the one failure the sandbox exists to make impossible, so
   * the guard has to cover the filesystem write and the JSON parse too, not
   * just the runtime starting. Found by review: a filename the filesystem
   * refused hung the harness on "is running" with nothing on screen. */
  try {
    if (msg.t === 'load' && msg.v !== PROTOCOL) {
      /* the two halves are built from the same repo, so this is a stale cached
       * chunk rather than a real disagreement. Said out loud because the same
       * situation with no check is an island that fails in a way nobody can read. */
      post({
        t: 'crash',
        error: `this worker speaks protocol ${PROTOCOL} and the page speaks ${msg.v}. Reload the page.`,
        traceback: `protocol ${msg.v} !== ${PROTOCOL}`,
      })
      return
    }

    const py = await boot()

    if (msg.t === 'load') {
      const dir = `islands/${msg.island}`
      /* mkdirTree and not mkdir: mkdir throws on a directory that already
       * exists, which is every load after the first, and writeFile never
       * creates a parent. Both measured. */
      py.FS.mkdirTree(dir)
      for (const [name, source] of Object.entries(msg.files)) {
        py.FS.writeFile(`${dir}/${name}`, source)
      }
      py.globals.set('_island', msg.island)
      py.globals.set('_entry', msg.entry)
      py.globals.set('_names', JSON.stringify(Object.keys(msg.files)))
      py.globals.set('_manifest', JSON.stringify(msg.manifest))
      /* the call is a constant. Everything variable went in through globals. */
      send(step(py, '_load(_island, _entry, _names, _manifest)'))
      return
    }

    if (msg.t === 'call') {
      py.globals.set('_handler', msg.handler)
      send(step(py, '_call(_handler)'))
      return
    }

    py.globals.set('_reply', JSON.stringify(msg.result))
    send(step(py, '_resume(_reply)'))
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e)
    post({ t: 'crash', error: mp ? why : `micropython did not start: ${why}`, traceback: why })
  }
}

/* the version is stamped here rather than in python, so one file knows it */
function send(s: PyStep | null) {
  if (!s) return
  post(s.t === 'ready' ? { t: 'ready', v: PROTOCOL, handlers: s.handlers } : s)
}
