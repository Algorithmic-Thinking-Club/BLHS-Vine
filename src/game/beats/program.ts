/* a program is marked on what it does, never on matching the steps the author happened to type: three different five-step programs reach the ATC maze flag, so step by step comparison scored two of those three zero out of five */

export type Cell = { col: number; row: number; facing: 'north' | 'south' | 'east' | 'west' }

export type ProgramBoard = {
  cols: number
  rows: number
  walls: [number, number][]
  flag: [number, number]
  start: Cell
}

const AHEAD: Record<Cell['facing'], [number, number]> = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
}
const RIGHT_OF: Record<Cell['facing'], Cell['facing']> = {
  north: 'east', east: 'south', south: 'west', west: 'north',
}
const LEFT_OF: Record<Cell['facing'], Cell['facing']> = {
  north: 'west', west: 'south', south: 'east', east: 'north',
}

/* what an instruction means is read off its name, so a member writes forward 2 or turn left and registers nothing, and a name this cannot read moves the body not at all where the student can see it */
export function stepsOf(name: string): { turn?: 'left' | 'right'; forward?: number } {
  const n = name.toLowerCase()
  if (n.includes('left')) return { turn: 'left' }
  if (n.includes('right')) return { turn: 'right' }
  const m = n.match(/(\d+)/)
  return { forward: m ? Number(m[1]) : 1 }
}

/* every cell the body passes through, in order, and where a wall or the board edge stopped it */
export function walkOf(board: ProgramBoard, written: string[]) {
  const blocked = new Set(board.walls.map(([c, r]) => c + ',' + r))
  const legal = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < board.cols && r < board.rows && !blocked.has(c + ',' + r)
  let at: Cell = { col: board.start.col, row: board.start.row, facing: board.start.facing }
  const path: Cell[] = [{ ...at }]
  let stuck = false
  for (const name of written) {
    if (stuck) break
    const step = stepsOf(name)
    if (step.turn) {
      at = { ...at, facing: step.turn === 'left' ? LEFT_OF[at.facing] : RIGHT_OF[at.facing] }
      path.push({ ...at })
      continue
    }
    for (let i = 0; i < (step.forward ?? 0); i++) {
      const [dx, dy] = AHEAD[at.facing]
      const next: Cell = { col: at.col + dx, row: at.row + dy, facing: at.facing }
      if (!legal(next.col, next.row)) { stuck = true; break }
      at = next
      path.push({ ...at })
    }
  }
  return { path, stuck, home: at.col === board.flag[0] && at.row === board.flag[1] }
}

/** does this program solve the board: every step written, and the body on the flag */
export function solves(board: ProgramBoard | undefined, written: string[]): boolean {
  if (!board) return false
  /* a program with a hole in it is not a solution even if the rest of it would have been: an empty step is a step nobody wrote */
  if (!written.length || written.some((w) => !w)) return false
  return walkOf(board, written).home
}
