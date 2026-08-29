/* The MicroPython wasm build ships no types.
 *
 * Only what the worker actually calls is declared here, and every line is
 * measured off scripts/mp-spike.mjs rather than copied from the docs, because
 * the docs are wrong about the one that matters: runPython() returns null in
 * this build and values come back out through globals.get().
 */
declare module '@micropython/micropython-webassembly-pyscript/micropython.mjs' {
  export interface MicroPython {
    /* returns null in this build. Read the answer out of globals instead. */
    runPython(code: string): unknown
    /* __main__'s namespace. Carries strings intact in both directions,
     * including quotes, newlines and unicode (measured), which is why nothing
     * here ever splices a value into a python source string. */
    globals: {
      get(key: string): unknown
      set(key: string, value: unknown): void
    }
    /* the in-memory filesystem. A member's island is written here as real
     * files so `import` finds them and a traceback names them.
     *
     * mkdirTree and not mkdir: measured, mkdir throws on a directory that
     * already exists and writeFile never creates a parent, so an island landing
     * in its own folder needs the idempotent one. The real FS has 94 members;
     * these two are what the worker calls. */
    FS: {
      writeFile(path: string, data: string): void
      mkdirTree(path: string): void
    }
  }

  export function loadMicroPython(options?: {
    /* full URL of micropython.wasm. Becomes Module.locateFile, which is the
     * only supported way to point the runtime at a bundler-hashed asset. */
    url?: string
    heapsize?: number
    stdout?: (line: string) => void
    stderr?: (line: string) => void
    linebuffer?: boolean
  }): Promise<MicroPython>
}
