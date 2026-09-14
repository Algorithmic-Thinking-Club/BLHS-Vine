/* WHAT A PROGRAM DOES WHEN YOU RUN IT.
 *
 * The body, the board, and the walk between them. It lived inside `ActivityRunner`
 * where only the drawing could reach it, which was fine while the only thing that
 * needed to know where the body ended up was the picture of the body. It is not fine
 * any more: the MARKING needs it too.
 *
 * ASH, twice: *"i clicked all the right answers on the minigame, and still got a 0"*
 * and *"IT GAVE ME AN F EVEN THOUGH I REACHED THE END."*
 *
 * He had, and he did. The ATC maze has THREE five-step programs that reach the flag:
 *
 *     forward 2, turn left, forward 3, turn right, forward 3
 *     turn left, forward 3, turn right, forward 2, forward 3
 *     turn left, forward 3, turn right, forward 3, forward 2
 *
 * and the item was marked by comparing each step against the one the author happened
 * to type. So two of the three correct answers scored zero of five. A student who
 * solved the maze, watched his own body walk to the flag, and was then told he had
 * got everything wrong is being taught that the game is broken, which it was.
 *
 * A program is not a spelling test. It is marked on what it does.
 */

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

/* WHAT AN INSTRUCTION MEANS, READ OFF ITS NAME rather than declared beside it, so
 * a member writes "forward 2" and "turn left" and registers nothing. A name this
 * cannot read moves the body not at all, which the student sees happen rather
 * than being told about. */
export function stepsOf(name: string): { turn?: 'left' | 'right'; forward?: number } {
  const n = name.toLowerCase()
  if (n.includes('left')) return { turn: 'left' }
  if (n.includes('right')) return { turn: 'right' }
  const m = n.match(/(\d+)/)
  return { forward: m ? Number(m[1]) : 1 }
}

/** every cell the body passes through, in order, and where it stopped. A wall or
 *  the edge of the board ends the walk at the last legal cell: the program is never
 *  corrected on the way, it is carried out exactly as written, which is the entire
 *  reason there is a RUN button instead of a verdict. */
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
  /* a program with a hole in it is not a solution even if the rest of it would have
   * been: an empty step is a step nobody wrote */
  if (!written.length || written.some((w) => !w)) return false
  return walkOf(board, written).home
}
