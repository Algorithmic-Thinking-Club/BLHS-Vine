// hand-written types for the parts of the MicroPython wasm build the worker calls
declare module '@micropython/micropython-webassembly-pyscript/micropython.mjs' {
  export interface MicroPython {
    /* returns null in this build. Read the answer out of globals instead. */
    runPython(code: string): unknown
    /* the main namespace, carrying strings intact both ways including quotes, newlines and unicode */
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
    /* full url of micropython.wasm, which becomes Module.locateFile */
    url?: string
    heapsize?: number
    stdout?: (line: string) => void
    stderr?: (line: string) => void
    linebuffer?: boolean
  }): Promise<MicroPython>
}
