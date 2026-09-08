// hand-written types for the parts of the MicroPython wasm build the worker calls
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
    /* the in-memory filesystem a member's island is written into as real files */
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
