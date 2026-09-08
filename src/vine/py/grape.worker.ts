// the worker: a member's python running off the main thread, so a crash cannot take the engine down
import { loadMicroPython, type MicroPython } from '@micropython/micropython-webassembly-pyscript/micropython.mjs'
/* the wasm goes through the bundler, so the runtime is pointed at its real built URL */
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

/* start MicroPython once for this worker and reuse it for every call and resume */
async function boot(): Promise<MicroPython> {
  if (mp) return mp
  const py = await loadMicroPython({
    url: wasmUrl,
    stdout: (text) => post({ t: 'print', text }),
    stderr: (text) => post({ t: 'print', text }),
  })
  /* the two member-facing modules are written as real files, so importing them is ordinary */
  py.FS.writeFile('vine.py', VINE_PY)
  py.FS.writeFile('grape.py', GRAPE_PY)
  py.runPython(DRIVER_PY)
  mp = py
  return py
}

/* run one call and hand back whatever the pump left in `_step`, or report a crash */
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
  /* everything is inside this guard, so nothing can throw without a message going back */
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
