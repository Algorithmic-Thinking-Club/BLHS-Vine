import { useEffect, useMemo, useRef, useState } from 'react'
import { cinemaOn } from '../stage/cinema'
import type { CheckStep } from '../../vine/contract'
import { checksOf, playableSteps, pointsOf, type BeatStep, type BeatWorld, type CoreBeat } from './frames'
import {
  checkIdOf, fieldRight, plainOf, promptOf, scoreOf,
  type PlainField, type PlainRender, type Response,
} from './palette'
import { progressOf, responseOf, showdownReduce, startShowdown, yardsRemaining, type ShowdownState } from './showdown'
import { LATENCY_CONVENTION, latencyOf, markFirst } from './timing'
import { emptyScore, gradeOf, retakeAvailable, type BeatScore } from './score'
import { collectFact, loadSave, recordGrade } from '../save'
import { cordsOf, letterOf, newlyCloseCords, PASSING_GRADE } from '../progress'
import { factById } from '../facts'
import { track } from '../telemetry'
import { usePanel } from '../ui/a11y'
import { Chip, Field, Gauge, Glyph, Plank, PortraitFrame, useFace } from '../ui/controls'
import { right as sayRight, wrong as sayWrong } from '../ui/feedback'
import { grant } from '../grant'
import './beats.css'
import { walkOf } from './program'

// plays a scored beat in either arm from the same data, then writes the grade to the ledger

type Answer = { earned: number; total: number; tries: number; latencyMs: number }
type Answers = Record<string, Answer>

/** which try at this beat the student is on */
type Attempt = { n: number }

/* both arms take their answer latency from timing.ts, where the convention is written down */

export function CoreBeatRunner(
  { beat, onClose, world, review }: {
    beat: CoreBeat
    onClose: () => void
    /* open on the marks of the sitting already on the ledger, and never play */
    review?: boolean
    /* optional on purpose: a beat with a `do` item is still playable with no map, because the item falls back to naming its places */
    world?: BeatWorld
  },
) {
  const save = loadSave()

  /* `review` opens straight onto the marks, because the sheet's see your answers button opens this runner and a `play` start re-ran and re-graded a beat that had already passed */
  const [phase, setPhase] = useState<'play' | 'result' | 'review' | 'retake' | 'answers'>(
    review ? 'answers' : 'play',
  )
  const [finalScore, setFinalScore] = useState<BeatScore | null>(null)
  const retaking = useRef(false)
  const attempt = useRef<Attempt>({ n: 1 })

  const finish = (answers: Answers) => {
    const score: BeatScore = {
      ...emptyScore(beat),
      earned: Object.values(answers).reduce((n, a) => n + a.earned, 0),
    }
    const grade = gradeOf(score)
    const before = loadSave()
    /* how each item went, so "see your answers" has something to show */
    const marks: Record<string, [number, number]> = {}
    for (const [k, a] of Object.entries(answers)) marks[k] = [a.earned, a.total]
    recordGrade({
      id: beat.id, title: beat.title, kind: beat.kind, credit: beat.credit,
      grade, year: beat.year, season: before?.season ?? 'Fall',
      marks,
      ...(beat.tags?.length ? { tags: beat.tags } : {}),
      ...(retaking.current ? { retaken: true } : {}),
    })
    for (const f of beat.takeaways) collectFact(f)
    const after = loadSave()
    /* one reward pop, in the game arm only, saying the credit rather than the facts */
    /* and only on a pass, so it agrees with the result card's own stamp */
    if (beat.credit > 0 && grade >= PASSING_GRADE) {
      /* through `grant` so a credit that tips a cord over its line says so too */
      /* and it names the thing that was finished, with the credit as the detail under it */
      /* the core beat's `place` is the lesson's own name and a class beat's is a room, so the pop reads whichever of the two the student just finished */
      grant(before, after, {
        what: `${beat.kind === 'core' ? beat.place : beat.title} is done.`,
        detail: `${beat.credit} credit, on your transcript.`,
      })
    }
    track('core_beat_complete', {
      id: beat.id, grade, retaken: retaking.current, tries: attempt.current.n,
      /* the ledger keeps the first attempt's grade, so the event carries that same number rather than a second reading of it */
      firstGrade: after?.ledger.find((e) => e.id === beat.id)?.firstGrade ?? grade,
    })
    track('gpa_updated', { grade, beat: beat.id })
    if (before && after) {
      for (const c of newlyCloseCords(before, after)) track('cord_progress', { cord: c.id, progress: c.progress })
    }
    setFinalScore(score)
    /* the card stays whenever it has something to say, a fail or a pass carrying a retake, because `PASSING_GRADE` is a D and a student who scraped a pass saw only the reward pop and was never told about the retake he is entitled to */
    /* both arms get the result card, because the pop is the celebration and the card is the record: the paint is the variable and what a student is told is not */
    setPhase('result')
  }

  const startRetake = () => {
    retaking.current = true
    attempt.current = { n: attempt.current.n + 1 }
    track('retake_used', { beat: beat.id, tries: attempt.current.n })
    setPhase('retake')
  }

  /* a real panel: focus is held inside it, and Escape only works once the score is up */
  const scoring = phase === 'play' || phase === 'retake'
  const panel = usePanel({
    label: `${beat.title} · ${scoring ? 'questions' : 'your grade'}`,
    onClose,
    closeOnEscape: !scoring,
  })

  if (!save) return null

  return (
    <div className="bt-veil">
      {/* `bt-plain-scoring` lets the plain card scroll with a fixed foot while items are up */}
      <div {...panel} className={beat.chrome === 'screen'
        ? 'bt-crt bt-stage bt-stage-screen'
        : 'bt-stage kit-surface-panel'}>
        {(phase === 'play' || phase === 'retake') && (
          <GamePlay beat={beat} checksOnly={phase === 'retake'} attempt={attempt.current} world={world} onDone={finish} />)}
        {phase === 'result' && finalScore && (
          <ResultCard
            beat={beat} score={finalScore}
            canRetake={retakeAvailable(loadSave()!, beat.id)}
            onReview={() => setPhase('review')}
            onClose={onClose}
          />
        )}
        {phase === 'answers' && (
          <AnswersCard beat={beat} onClose={onClose} />
        )}
        {phase === 'review' && (
          <ReviewCard beat={beat} onRetake={startRetake} onBack={() => setPhase('result')} />
        )}
        {/* a way out that scores nothing and leaves the beat still owed */}
        {/* and never inside a cutscene, where the way on is finishing the items */}
        {scoring && !cinemaOn() && (
          <div className="bt-leave">
            <Plank size="sm" onClick={onClose}>Leave this for now</Plank>
            <span className="bt-leave-why">Nothing is marked until you check your answer. You can come back to this.</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** the reply the author wrote for this pick; `value: ''` is the field-wide one, so a number or an ordering corrects the student who got it wrong and not the one who did not need it */
const replyFor = (r: PlainRender, field: string, value: string): string =>
  r.replies.find((x) => x.field === field && x.value === value)?.text
  ?? r.replies.find((x) => x.field === field && x.value === '')?.text
  ?? ''

const labelOf = (f: PlainField, value: string) => f.options.find((o) => o.value === value)?.text ?? value

/* says whether that was right, in the author's own words, out loud as well as on screen */
function speak(gotAll: boolean, authored: string, truth: string): void {
  if (gotAll) sayRight('Right', authored || undefined)
  else sayWrong('Not quite', authored || truth)
}

// ---- the game arm: step-by-step, at the player's pace --------------------------------

function GamePlay({ beat, checksOnly, attempt, world, onDone }: {
  beat: CoreBeat
  checksOnly: boolean
  attempt: Attempt
  world?: BeatWorld
  onDone: (answers: Answers) => void
}) {
  const steps: BeatStep[] = checksOnly
    ? checksOf(beat).map((check) => ({ kind: 'check' as const, check }))
    : playableSteps(beat)
  const [idx, setIdx] = useState(0)
  const accum = useRef<Answers>({})

  const advance = () => {
    if (idx + 1 >= steps.length) onDone(accum.current)
    else setIdx(idx + 1)
  }

  const step = steps[idx]
  /* how many items there are, counted off the beat so the rail and the score agree */
  const total = steps.filter((s) => s.kind === 'check').length
  const answered = steps.slice(0, idx).filter((s) => s.kind === 'check').length
  const last = idx + 1 >= steps.length

  return (
    <>
      <div className="bt-head">
        <span className="bt-place">{beat.place} · <b>{beat.title}</b></span>
        {total > 0 && (
          <span className="bt-rail">
            <span className="bt-railword">{answered} of {total} answered</span>
            <span className="bt-railpips" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <Chip key={i} state={i < answered ? 'plate_spent' : i === answered && step.kind === 'check' ? 'plate_lit' : 'plate'} />
              ))}
            </span>
          </span>
        )}
      </div>
      {/* one frame per level: the stage is the paper, so a spoken line gets no box of its own */}
      {step.kind === 'say' ? (
        <button className="bt-say" onClick={advance}>
          <span className="bt-speakerrow">
            {/* the speaker's portrait, when the author set one on the line */}
            {/* no caption, because the name plate beside the frame already says it */}
            {step.line.portrait && <PortraitFrame id={step.line.portrait} />}
            <span className="bt-speaker">{step.line.speaker}</span>
          </span>
          <span className="bt-text">{step.line.text}</span>
          <AdvanceCue />
        </button>
      ) : (
        <CheckPlay
          key={`${checkIdOf(step.check)}:${attempt.n}`}
          check={step.check}
          world={world}
          last={last}
          onDone={(response, ms) => {
            const id = checkIdOf(step.check)
            const worth = pointsOf(step.check)
            const earned = scoreOf(step.check, response)
            const tries = attempt.n
            accum.current[id] = { earned, total: worth, tries, latencyMs: ms }
            track('check_answered', {
              item: id, kind: step.check.kind, correct: earned === worth,
              earned, total: worth, tries, latencyMs: ms, latency: LATENCY_CONVENTION, via: 'woven',
            })
            advance()
          }}
        />
      )}
    </>
  )
}

/* the drawn advance cue, with a token-coloured chevron standing in when the kit is off */
/* one paw that bounces, because the four cue frames are colours rather than motion */
const CUE_FACE = 'frame_2'

function AdvanceCue() {
  const drawn = useFace('cue', CUE_FACE)
  if (!drawn) return <span className="bt-cue-mark" aria-hidden="true" />
  return (
    <span className="bt-cue" aria-hidden="true">
      <Glyph piece="cue" face={CUE_FACE} size={26} className="bt-cueframe" />
    </span>
  )
}

/* the check-my-answer button, which says in words what it is waiting for when it is refused */
function Commit({ ready, needs, onCommit, label = 'Check my answer' }: {
  ready: boolean
  /** what is still missing, in words, for the student and for the tooltip */
  needs: string
  onCommit: () => void
  label?: string
}) {
  return (
    <div className="bt-foot">
      <Plank size="md" disabled={!ready} title={ready ? undefined : needs} onClick={onCommit}>{label}</Plank>
      {!ready && <span className="bt-needs">{needs}</span>}
    </div>
  )
}

/* a sort or an ordering done by hand: press a piece, press a place, and it lands there */
function MovePlay({ check, render, picks, revealed, single, onSet, onTouch }: {
  check: CheckStep
  render: ReturnType<typeof plainOf>
  picks: Response
  revealed: boolean
  /** a place holds one piece (an ordering) rather than many (a sort) */
  single: boolean
  onSet: (fieldId: string, value: string) => void
  onTouch: () => void
}) {
  const [held, setHeld] = useState<string | null>(null)
  /* `held` inside a handler is the value from the render that made it, so a press on a piece then a place faster than a re-render read null and the piece went nowhere; the ref is written on the same line as the state so the two never disagree */
  const heldNow = useRef<string | null>(null)
  const take = (v: string | null) => { heldNow.current = v; setHeld(v) }

  /* the places, taken off the first field because every field offers the same ones: the buckets of a sort, the positions of an order */
  const places = render.fields[0]?.options ?? []
  const pool = render.fields.filter((f) => !picks[f.id])
  const inPlace = (v: string) => render.fields.filter((f) => picks[f.id] === v)

  const put = (place: string) => {
    const held = heldNow.current
    if (!held || revealed) return
    /* an ordering's place holds one thing, so dropping onto a full slot swaps the sitting piece back into the pool rather than refusing the only move a student can see */
    if (single) for (const f of inPlace(place)) onSet(f.id, '')
    onSet(held, place)
    take(null)
  }

  const lift = (fieldId: string) => {
    if (revealed) return
    onTouch()
    /* pressing a piece that is already placed takes it back out, which is the undo a student finds without being told there is one */
    if (picks[fieldId]) { onSet(fieldId, ''); take(fieldId); return }
    take(heldNow.current === fieldId ? null : fieldId)
  }

  const labelOfField = (id: string) => render.fields.find((f) => f.id === id)?.label ?? id

  return (
    <div className="bt-move" data-holding={held ? '1' : undefined}>
      {/* a piece lands inside its box, and a full box goes from dashed to solid */}
      <div className="bt-drops" data-count={places.length}>
        {places.map((pl) => {
          const sitting = inPlace(pl.value)
          const lit = !!held && !revealed
          return (
            <div className={`bt-drop${sitting.length ? ' bt-drop-full' : ''}`} key={pl.value}>
              <span className="bt-drop-name">{pl.text}</span>
              <div className={`bt-drop-well${lit ? ' bt-drop-lit' : ''}`} aria-label={sitting.length ? undefined : `${pl.text}, empty`}>
                {sitting.map((f) => {
                  const got = revealed && fieldRight(check, f, picks)
                  return (
                    <button
                      type="button"
                      key={f.id}
                      className={`bt-piece bt-piece-set${revealed ? (got ? ' bt-piece-true' : ' bt-piece-miss') : ''}`}
                      disabled={revealed || lit}
                      aria-label={`${f.label}, in ${pl.text}. Press to take it back.`}
                      onClick={() => lift(f.id)}
                    >
                      {revealed && (
                        <Glyph piece="icon_set" face={got ? 'tick' : 'cross'} size={13} className="bt-piece-mark" />
                      )}
                      {f.label}
                    </button>
                  )
                })}
                {lit && (
                  <button
                    type="button"
                    className="bt-drop-target"
                    aria-label={`Put ${labelOfField(held!)} in ${pl.text}`}
                    onClick={() => put(pl.value)}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* the pool empties as the places fill, so this frame needs no progress bar */}
      <div className="bt-pool" aria-label="Still to place">
        {pool.map((f) => (
          <button
            type="button"
            key={f.id}
            className={`bt-piece${held === f.id ? ' bt-piece-held' : ''}`}
            aria-pressed={held === f.id}
            disabled={revealed}
            onClick={() => lift(f.id)}
          >
            {f.label}
          </button>
        ))}
        {pool.length === 0 && <span className="bt-pool-done">Everything is placed.</span>}
      </div>

      {/* nothing is taken away: a piece in the wrong place keeps its place and gains a line saying where it belonged */}
      {revealed && (
        <ul className="bt-move-truth">
          {render.fields.filter((f) => !fieldRight(check, f, picks)).map((f) => (
            <li key={f.id}>
              <Glyph piece="icon_set" face="tick" size={13} />
              {f.label} goes in {labelOf(f, f.correct)}.
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* the instruction palette never empties because every slot may hold any instruction, which keeps the answer space identical to the form's; scoring reads the slot only through `plainOf`, `scoreOf`, `pointsOf` and `fieldRight`, so the walk below can never reach the grade */


/* the body, the board and the walk live in `program.ts` because the marking needs them too: a program is scored on whether it reaches the flag and not on whether it matches the steps the author happened to type */
function ProgramPlay({ check, render, last, onDone, onTouch }: {
  check: Extract<CheckStep, { kind: 'program' }>
  render: ReturnType<typeof plainOf>
  last: boolean
  onDone: (r: Response) => void
  onTouch: () => void
}) {
  const [picks, setPicks] = useState<Response>({})
  const [revealed, setRevealed] = useState(false)
  /* how far along the walk the body has got, or -1 for nothing running */
  const [at, setAt] = useState(-1)

  const moves = render.fields[0]?.options ?? []
  const filled = render.fields.every((f) => picks[f.id])
  const missing = render.fields.filter((f) => !picks[f.id]).length
  const earned = scoreOf(check, picks)
  const outOf = pointsOf(check)

  const board = check.board
  const written = render.fields.map((f) => picks[f.id] ?? '')
  /* keyed on the answer and not on the walk, because `walkOf` returns a fresh object every call and the dialogue typing re-renders this screen every few frames, which threw the 420ms step timer away before it could ever finish */
  const walk = useMemo(
    () => (board ? walkOf(board, written) : null),
    [board, written.join('|')],
  )

  /* one cell at a time so a student watches their own program happen, and it watches the length rather than the walk as a second fence around the same fresh-object mistake */
  const paces = walk ? walk.path.length : 0
  useEffect(() => {
    if (at < 0 || at >= paces - 1) return
    const t = setTimeout(() => setAt((n) => n + 1), 420)
    return () => clearTimeout(t)
  }, [at, paces])

  /* one rule: an instruction goes into the next empty step and a step that has one gives it back, so the wells are not click targets and a stray click on an empty step does nothing; dragging still works because a drag says exactly which step was meant */
  const fill = (slotId: string, move: string) => {
    onTouch()
    /* a drop cannot land on a step that filled while the pointer was in the air */
    setPicks((p) => (p[slotId] ? p : { ...p, [slotId]: move }))
  }

  /* the updater form reads the current `picks` inside the queue, because two presses closer together than a re-render both read the same `picks`, found the same next empty step, and the second wrote over the first, putting every later answer one place out and grading a program nobody wrote */
  const take = (move: string) => {
    if (revealed) return
    onTouch()
    setPicks((p) => {
      const next = render.fields.find((f) => !p[f.id])
      return next ? { ...p, [next.id]: move } : p
    })
  }

  const clear = (slotId: string) => {
    if (revealed) return
    onTouch()
    setPicks((p) => { const n = { ...p }; delete n[slotId]; return n })
  }

  /* run is the commit and not a rehearsal: a repeatable run would let a student find the answer by trying, which the form has no equivalent of, so one shot like every other item here */
  const run = () => {
    setRevealed(true)
    setAt(0)
    speak(earned === outOf, check.reply ?? '', earned + ' of ' + outOf + ' steps are in the right place.')
  }

  const body = walk ? walk.path[Math.min(at < 0 ? 0 : at, walk.path.length - 1)] : null
  const ran = !!walk && at >= walk.path.length - 1

  return (
    <div
      className="bt-check bt-program"
      data-state={revealed ? (earned === outOf ? 'right' : 'wrong') : filled ? 'answering' : 'presented'}
    >
      <div className="bt-prompt">{render.prompt}</div>

      {board && (
        <div className="bt-board" role="img" aria-label={render.note || 'the board'}>
          {Array.from({ length: board.rows }, (_, row) => (
            <div className="bt-boardrow" key={row}>
              {Array.from({ length: board.cols }, (_, col) => {
                const wall = board.walls.some(([c, r]) => c === col && r === row)
                const flag = board.flag[0] === col && board.flag[1] === row
                const here = !!body && body.col === col && body.row === row
                return (
                  <span
                    key={col}
                    className={'bt-cell' + (wall ? ' bt-cell-wall' : '') + (flag ? ' bt-cell-flag' : '')}
                  >
                    {here && body && <span className={'bt-walker bt-walker-' + body.facing} aria-hidden="true" />}
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* the slots, numbered and in order, every one printing its own label on the first screen because the arm parity test reads it out of here */}
      <div className="bt-slots">
        {render.fields.map((f, i) => {
          const chosen = picks[f.id]
          const text = moves.find((m) => m.value === chosen)?.text
          const right = revealed && fieldRight(check, f, picks)
          /* the next empty step is lit, so there is never a question about where the instruction you press will land */
          const nextEmpty = render.fields.find((q) => !picks[q.id])
          const wellClass = 'bt-slotwell'
            + (chosen ? ' bt-slotwell-full' : '')
            + (revealed ? (right ? ' bt-slotwell-true' : ' bt-slotwell-miss') : '')
            + (!revealed && !chosen && nextEmpty?.id === f.id ? ' bt-slotwell-lit' : '')
          return (
            <div className="bt-slot" key={f.id}>
              <span className="bt-slothead">
                <span className="bt-slotnum">{i + 1}</span>
                <span className="bt-slotname">{f.label}</span>
              </span>
              <button
                type="button"
                className={wellClass}
                disabled={revealed}
                aria-label={chosen
                  ? 'Step ' + (i + 1) + ', ' + text + '. Press to take it out.'
                  : 'Step ' + (i + 1) + ', empty. Press an instruction below to fill it.'}
                onClick={() => { if (chosen) clear(f.id) }}
                /* and dragging works too, because a row of cards over a row of wells is a thing people drag */
                onDragOver={(e) => { if (!revealed && !chosen) e.preventDefault() }}
                onDrop={(e) => {
                  if (revealed || chosen) return
                  e.preventDefault()
                  const move = e.dataTransfer.getData('text/plain')
                  if (move) fill(f.id, move)
                }}
              >
                {text ?? <span className="bt-slotempty">empty</span>}
              </button>
              {/* nothing is taken away: a wrong step keeps what the student chose and gains the instruction that belonged there beside it */}
              {revealed && !right && (
                <span className="bt-truth">
                  <Glyph piece="icon_set" face="tick" size={13} />
                  {labelOf(f, f.correct)}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* the rule is on the screen, because a puzzle whose controls have to be guessed at measures guessing */}
      {!revealed && (
        <p className="bt-how">
          {filled
            ? 'Press a step to take that instruction back out, or press RUN.'
            : 'Press the instructions in the order you want them. Each one goes into the lit step.'}
        </p>
      )}

      <div className="bt-cards" aria-label="Instructions">
        {moves.map((m) => (
          <button
            type="button"
            key={m.value}
            className="bt-card"
            disabled={revealed || filled}
            draggable={!revealed}
            onDragStart={(e) => { onTouch(); e.dataTransfer.setData('text/plain', m.value) }}
            onClick={() => take(m.value)}
          >
            {m.text}
          </button>
        ))}
      </div>

      {!revealed
        ? (
          <Commit
            ready={filled}
            label="RUN"
            needs={missing === 1 ? 'One step is still empty.' : missing + ' steps are still empty.'}
            onCommit={run}
          />
        )
        : (
          <div className="bt-foot">
            {ran && (
              <span className="bt-ran">
                {walk && walk.home
                  ? 'It reached the flag.'
                  : walk && walk.stuck
                    ? 'It walked into the wall and stopped there.'
                    : 'It stopped short of the flag.'}
              </span>
            )}
            <Plank size="md" onClick={() => onDone(picks)}>Keep going</Plank>
            {last && <span className="bt-needs">That was the last one.</span>}
          </div>
        )}
    </div>
  )
}

/* one check in the game arm, drawn off the same derived item the plain form uses */
function CheckPlay({ check, world, last, onDone }: {
  check: CheckStep
  world?: BeatWorld
  last: boolean
  onDone: (r: Response, ms: number) => void
}) {
  const render = plainOf(check)
  const t0 = useRef(Date.now())
  const firstAt = useRef<Record<string, number>>({})
  const [picks, setPicks] = useState<Response>({})
  const [revealed, setRevealed] = useState(false)

  /* the convention, applied: the first input that touches the item, whichever field it lands on, is the moment the student answered */
  const touch = () => markFirst(firstAt.current, render.id)
  const latency = () => latencyOf(t0.current, firstAt.current, render.id)
  const set = (fieldId: string, value: string) => {
    touch()
    setPicks((p) => ({ ...p, [fieldId]: value }))
  }

  if (check.kind === 'showdown') {
    return <ShowdownPlay check={check} onDone={(r) => onDone(r, latency())} onTouch={touch} />
  }
  if (check.kind === 'do' && world) {
    return <DoPlay check={check} world={world} render={render} last={last} onDone={(r) => onDone(r, latency())} onTouch={touch} />
  }

  const single = render.fields.length === 1 ? render.fields[0] : null

  // one field, one pick: choice, quiz, place, and a `do` with nowhere to walk
  if (single && single.input === 'radio') {
    return (
      <OneOf
        check={check} render={render} field={single} picked={picks[single.id]} last={last}
        onPick={(v) => set(single.id, v)}
        onDone={() => onDone(picks, latency())}
      />
    )
  }

  // one field, typed: a number, where recognition would be a different measurement
  if (single && single.input === 'text') {
    const typed = picks[single.id] ?? ''
    /* the palette decides here and in the form: a number is scored against a declared tolerance, so nothing outside `palette.ts` may compare strings */
    const got = fieldRight(check, single, picks)
    const truth = `It is ${single.correct}${single.label ? ` ${single.label}` : ''}.`
    const authored = replyFor(render, single.id, typed)
    return (
      <div className="bt-check" data-state={revealed ? (got ? 'right' : 'wrong') : typed.trim() === '' ? 'presented' : 'answering'}>
        <div className="bt-prompt">{render.prompt}</div>
        <div className="bt-numrow">
          <Field
            label={single.label ? `Your answer, in ${single.label}` : 'Your answer'}
            unit={single.label || undefined}
            inputMode="decimal"
            value={typed}
            disabled={revealed}
            onChange={(e) => set(single.id, e.target.value)}
          />
        </div>
        {revealed
          ? (
            <>
              <div className={`bt-reply${got ? '' : ' bt-reply-miss'}`}>
                {got ? 'That is the number.' : `Not quite. ${truth}`}
                {authored ? ` ${authored}` : ''}
              </div>
              <div className="bt-foot">
                <Plank size="md" onClick={() => onDone(picks, latency())}>Keep going</Plank>
                {last && <span className="bt-needs">That was the last one.</span>}
              </div>
            </>
          )
          : (
            <Commit
              ready={typed.trim() !== ''}
              needs="Type a number first, then press Check my answer."
              onCommit={() => { setRevealed(true); speak(got, authored, truth) }}
            />
          )}
      </div>
    )
  }

  /* the program gets the only frame in here that carries out what the student wrote instead of marking it */
  if (check.kind === 'program') {
    return (
      <ProgramPlay
        check={check} render={render} last={last}
        onDone={(r) => onDone(r, latency())}
        onTouch={touch}
      />
    )
  }

  /* a sort and an ordering get the frame that moves rather than the rows of chips below */
  if (check.kind === 'sort' || check.kind === 'order') {
    const done = render.fields.every((f) => picks[f.id])
    const got = scoreOf(check, picks)
    const of = pointsOf(check)
    return (
      <div className="bt-check" data-state={revealed ? (got === of ? 'right' : 'wrong') : done ? 'answering' : 'presented'}>
        <div className="bt-prompt">{render.prompt}</div>
        <MovePlay
          check={check}
          render={render}
          picks={picks}
          revealed={revealed}
          single={check.kind === 'order'}
          onSet={(id, v) => { if (v === '') { touch(); setPicks((p) => { const n = { ...p }; delete n[id]; return n }) } else set(id, v) }}
          onTouch={touch}
        />
        {!revealed
          ? (
            <Commit
              ready={done}
              needs="Put everything somewhere first, then press Check my answer."
              onCommit={() => { setRevealed(true); speak(got === of, replyFor(render, render.fields[0]?.id ?? '', ''), '') }}
            />
          )
          : (
            <div className="bt-foot">
              <Plank size="md" onClick={() => onDone(picks, latency())}>Keep going</Plank>
              {last && <span className="bt-needs">That was the last one.</span>}
            </div>
          )}
      </div>
    )
  }

  // rows: a sort into buckets, an ordering into positions
  const allAnswered = render.fields.every((f) => picks[f.id])
  const missing = render.fields.filter((f) => !picks[f.id]).length
  const earned = scoreOf(check, picks)
  const outOf = pointsOf(check)
  const rowReply = replyFor(render, render.fields[0]?.id ?? '', '')
  return (
    <div className="bt-check" data-state={revealed ? (earned === outOf ? 'right' : 'wrong') : allAnswered ? 'answering' : 'presented'}>
      <div className="bt-prompt">{render.prompt}</div>
      <div className="bt-sort">
        {render.fields.map((f) => {
          const got = revealed && fieldRight(check, f, picks)
          const rowClass = !revealed ? '' : got ? ' bt-sortrow-true' : ' bt-sortrow-miss'
          return (
            <div className={`bt-sortrow${rowClass}`} key={f.id} role="group" aria-label={f.label}>
              <span className="bt-sortlabel">
                {f.label}
                {/* nothing is taken away: the row keeps its label and gains its truth, and the chosen chip stays selected under it, so the student sees what they thought beside what is so */}
                {revealed && !got && (
                  <span className="bt-truth">
                    <Glyph piece="icon_set" face="tick" size={14} />
                    {labelOf(f, f.correct)}
                  </span>
                )}
              </span>
              <span className="bt-buckets">
                {f.options.map((o) => {
                  const chosen = picks[f.id] === o.value
                  const isTruth = revealed && o.value === f.correct
                  return (
                    <button
                      key={o.value}
                      type="button"
                      className={`bt-bucket${isTruth ? ' bt-bucket-true' : ''}`}
                      aria-pressed={chosen}
                      aria-label={f.label ? `${f.label}: ${o.text}` : o.text}
                      disabled={revealed}
                      onClick={() => set(f.id, o.value)}
                    >
                      <span className="bt-bucketdot" aria-hidden="true" />
                      {o.text}
                    </button>
                  )
                })}
              </span>
            </div>
          )
        })}
      </div>
      {!revealed
        ? (
          <Commit
            ready={allAnswered}
            needs={missing === 1 ? 'One item still has no answer.' : `${missing} items still have no answer.`}
            onCommit={() => {
              setRevealed(true)
              speak(earned === outOf, rowReply, `${earned} of ${outOf} landed in the right place.`)
            }}
          />
        )
        : (
          <>
            {/* how many rows landed right, said in words rather than left to be counted */}
            <div className="bt-count">{earned} of {outOf} in the right place.</div>
            {rowReply && <div className={`bt-reply${earned === outOf ? '' : ' bt-reply-miss'}`}>{rowReply}</div>}
            <div className="bt-foot">
              <Plank size="md" onClick={() => onDone(picks, latency())}>
                {earned === outOf ? 'All of them. Keep going' : 'Noted. Keep going'}
              </Plank>
              {last && <span className="bt-needs">That was the last one.</span>}
            </div>
          </>
        )}
    </div>
  )
}

/* pick one in the game arm, covering a choice, a quiz, a place and a `do` with no world to walk in; its own component so a `do` whose staging is refused falls back to exactly this and not to a copy that drifts */
function OneOf({ check, render, field, picked, last, onPick, onDone }: {
  check: CheckStep
  render: PlainRender
  field: PlainField
  picked: string | undefined
  last: boolean
  onPick: (value: string) => void
  onDone: () => void
}) {
  const done = picked !== undefined
  const got = done && fieldRight(check, field, { [field.id]: picked })
  const authored = done ? replyFor(render, field.id, picked) : ''
  return (
    <div className="bt-check" data-state={!done ? 'presented' : got ? 'right' : 'wrong'}>
      <div className="bt-prompt">{render.prompt}</div>
      <div className="bt-options">
        {field.options.map((o) => {
          const isTruth = done && o.value === field.correct
          const chosen = picked === o.value
          return (
            <button
              key={o.value}
              type="button"
              className={`bt-opt${isTruth ? ' bt-opt-true' : ''}${chosen && !isTruth ? ' bt-opt-miss' : ''}`}
              disabled={done}
              onClick={() => {
                onPick(o.value)
                /* the palette says whether that was right, here as everywhere: the warmth and the score cannot come from two different rules */
                speak(
                  fieldRight(check, field, { [field.id]: o.value }),
                  replyFor(render, field.id, o.value),
                  `The answer is ${labelOf(field, field.correct)}.`,
                )
              }}
            >
              {o.text}
              {/* the word is the state: a drawn tick is worn when the kit is on and the sentence carries it when the kit is off, because no state may be held by colour alone */}
              {isTruth && (
                <span className="bt-optmark bt-optmark-true">
                  <Glyph piece="icon_set" face="tick" size={14} />
                  the answer
                </span>
              )}
              {chosen && !isTruth && (
                <span className="bt-optmark bt-optmark-chose">
                  <Glyph piece="pointer" face="hand" size={14} />
                  you chose
                </span>
              )}
            </button>
          )
        })}
      </div>
      {done && (
        <>
          <div className={`bt-reply${got ? '' : ' bt-reply-miss'}`}>
            {authored || (got ? 'Right.' : 'Hm. Not quite.')}
          </div>
          <div className="bt-foot">
            <Plank size="md" onClick={onDone}>Keep going</Plank>
            {last && <span className="bt-needs">That was the last one.</span>}
          </div>
        </>
      )}
    </div>
  )
}

/* the showdown in the game arm: rounds of questions with a drive bar off rounds correct */
function ShowdownPlay({ check, onDone, onTouch }: {
  check: Extract<CheckStep, { kind: 'showdown' }>
  onDone: (r: Response) => void
  onTouch: () => void
}) {
  const [s, setS] = useState<ShowdownState>(() => startShowdown(check.rounds))
  const round = check.rounds[s.round]

  /* the drive ends exactly once on the transition into done, and depends on the flag rather than the whole state because `s` changes on every pick and this must not fire on any of them */
  useEffect(() => {
    if (s.done) onDone(responseOf(check.id, s))
  }, [s.done])

  if (!round) return null
  const picked = s.picked
  const got = picked !== null && !!round.options[picked].correct
  return (
    <div className="bt-check" data-state={picked === null ? 'presented' : got ? 'right' : 'wrong'}>
      <div className="bt-prompt">{check.prompt}</div>
      <div className="bt-drive">
        <Gauge
          value={progressOf(s)}
          label={`Yards gained against ${check.opponent}`}
          reading={`${yardsRemaining(s)} yards to go`}
        />
        <span className="bt-driveword">{check.opponent} · question {s.round + 1} of {s.total}</span>
      </div>
      <div className="bt-subprompt">{round.prompt}</div>
      <div className="bt-options">
        {round.options.map((o, i) => {
          const isTruth = picked !== null && !!o.correct
          const chosen = picked === i
          return (
            <button
              key={i}
              type="button"
              className={`bt-opt${isTruth ? ' bt-opt-true' : ''}${chosen && !o.correct ? ' bt-opt-miss' : ''}`}
              disabled={picked !== null}
              onClick={() => {
                onTouch()
                speak(!!o.correct, o.reply ?? '', o.correct ? 'Right.' : 'The right answer is marked.')
                setS((x) => showdownReduce(x, { kind: 'pick', index: i }, check.rounds))
              }}
            >
              {o.text}
              {isTruth && (
                <span className="bt-optmark bt-optmark-true">
                  <Glyph piece="icon_set" face="tick" size={14} />
                  the answer
                </span>
              )}
              {chosen && !o.correct && (
                <span className="bt-optmark bt-optmark-chose">
                  <Glyph piece="pointer" face="hand" size={14} />
                  you chose
                </span>
              )}
            </button>
          )
        })}
      </div>
      {picked !== null && (
        <>
          <div className={`bt-reply${got ? '' : ' bt-reply-miss'}`}>
            {round.options[picked].reply || (got ? 'Right.' : 'Not quite.')}
          </div>
          <div className="bt-foot">
            <Plank size="md" onClick={() => setS((x) => showdownReduce(x, { kind: 'next' }, check.rounds))}>
              {s.round + 1 >= s.total ? 'Last question. Keep going' : 'Next question'}
            </Plank>
          </div>
        </>
      )}
    </div>
  )
}

/* a `do` answered by walking: reaching one of the places the item named is the answer */
/* how long a student may hunt for a place before the form is offered beside the walk, long enough to cross the Maw twice and read what is on the way */
const LOST_MS = 45_000

function DoPlay({ check, world, render, last, onDone, onTouch }: {
  check: Extract<CheckStep, { kind: 'do' }>
  world: BeatWorld
  render: PlainRender
  last: boolean
  onDone: (r: Response) => void
  onTouch: () => void
}) {
  const [reached, setReached] = useState<string | null>(null)
  /* a student who cannot find it falls back to the form rather than being stranded */
  const [lost, setLost] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const done = useRef(false)

  /* never stage `guide_to(goal.anchor)` here: an arrow pointing at the goal scored the walking arm correctly every time while the form arm could get the same item wrong, which is a difference in content and not in paint, so the objective line repeats the question without answering it */
  useEffect(() => {
    void world.issue({ kind: 'objective', text: check.prompt })
    const stop = world.onReached((anchor) => {
      if (done.current) return
      /* only the places this item named, because walking past something else on the way is not an answer and treating it as one would score a student on the route they happened to take */
      if (anchor !== check.goal.anchor && !check.decoys.some((d) => d.anchor === anchor)) return
      done.current = true
      onTouch()
      setReached(anchor)
    })
    /* looking is not the measurement: past this a student is scored on navigation rather than on what he learned, so the form comes up beside the walk as a way out without ever replacing it */
    const t = window.setTimeout(() => setLost(true), LOST_MS)
    return () => {
      stop()
      window.clearTimeout(t)
      void world.issue({ kind: 'objective', text: null })
    }
  }, [])

  if (lost && reached === null) {
    return (
      <OneOf
        check={check} render={render} field={render.fields[0]} picked={picked ?? undefined} last={last}
        onPick={(v) => { onTouch(); setPicked(v) }}
        onDone={() => onDone({ [check.id]: picked ?? '' })}
      />
    )
  }

  if (reached === null) {
    return (
      <div className="bt-check" data-state="presented">
        <div className="bt-prompt">{render.prompt}</div>
        {/* the place is NOT named here. That sentence was the answer. */}
        <div className="bt-reply">Walk to the place you think it is.</div>
      </div>
    )
  }
  const got = reached === check.goal.anchor
  const authored = replyFor(render, check.id, reached)
  return (
    <div className="bt-check" data-state={got ? 'right' : 'wrong'}>
      <div className="bt-prompt">{render.prompt}</div>
      <div className={`bt-reply${got ? '' : ' bt-reply-miss'}`}>
        {authored || (got ? 'That is the place.' : 'Not this one.')}
      </div>
      <div className="bt-foot">
        <Plank size="md" onClick={() => onDone({ [check.id]: reached })}>Keep going</Plank>
        {last && <span className="bt-needs">That was the last one.</span>}
      </div>
    </div>
  )
}

/* the activity's place and title */
function CardHead({ beat }: { beat: CoreBeat }) {
  return (
    <div className="bt-head">
      <span className="bt-place">{beat.place} · <b>{beat.title}</b></span>
    </div>
  )
}

// ---- result + review ------------------------------------------------------------------

/* the card every activity ends on: the letter, the grade, what was earned and the way out */
function ResultCard({ beat, score, canRetake, onReview, onClose }: {
  beat: CoreBeat; score: BeatScore
  canRetake: boolean; onReview: () => void; onClose: () => void
}) {
  const s = loadSave()
  const entry = s?.ledger.find((e) => e.id === beat.id)
  const thisRun = gradeOf(score)
  const grade = entry?.grade ?? thisRun
  const differs = Math.abs(grade - thisRun) > 0.005
  const passed = grade >= PASSING_GRADE
  const honors = letterOf(grade) === 'A'
  const closeCords = s ? cordsOf(s).filter((c) => !c.earned && c.progress >= 0.5) : []
  const facts = beat.takeaways.map(factById).filter((f): f is NonNullable<typeof f> => !!f)
  return (
    <div className="bt-result">
      <CardHead beat={beat} />
      <div className="bt-grade">
        <span className="bt-lettermark">{letterOf(grade)}</span>
        <span className="bt-gradelines">
          <span className="bt-gradenum">Grade points {grade.toFixed(2)} of 4.00 · {score.earned} of {score.total} points this run</span>
          <span className="bt-gradesays">
            {differs
              ? `This run scored ${thisRun.toFixed(2)}. The school keeps the higher attempt, so ${grade.toFixed(2)} is the one on your transcript.`
              : 'That letter and that number are what goes on your transcript.'}
          </span>
        </span>
      </div>
      <div className="bt-gaugerow">
        <Gauge
          value={score.total ? score.earned / score.total : null}
          label="Points earned in this activity"
          reading={`${score.earned} of ${score.total}`}
        />
      </div>
      {(passed || honors) && (
        <div className="bt-stamps">
          {/* an island's own activity carries no credit of its own, since the programme's `award` writes the credit-bearing row, and without this guard the card stamps 0 credit earned on every sitting */}
          {passed && beat.credit > 0 && (
            <span className="bt-stamp">
              <Glyph piece="stamp" face="approved" size={26} />
              <span className="bt-stampword">{beat.credit} credit earned</span>
            </span>
          )}
          {honors && (
            <span className="bt-stamp bt-stamp-honor">
              <Glyph piece="stamp" face="awarded" size={26} />
              <span className="bt-stampword">You got an A</span>
            </span>
          )}
        </div>
      )}
      {facts.length > 0 && (
        <div className="bt-takeaways">
          <div className="bt-h">{facts.length === 1 ? 'One fact saved to your Handbook' : `${facts.length} facts saved to your Handbook`}</div>
          {facts.map((f) => <div className="bt-fact" key={f.id}>{f.text}</div>)}
        </div>
      )}
      {closeCords.length > 0 && (
        <div className="bt-counselor">Cords you are close to earning: {closeCords.map((n) => n.name).join(', ')}. Open the Handbook to see them.</div>
      )}
      {canRetake && (
        <div className="bt-retake">
          <span className="bt-needs">You scored under a B-, so you can take this again. The Universal Retake Policy is real at Bonney Lake.</span>
          <Plank size="md" onClick={onReview}>Review, then retake</Plank>
        </div>
      )}
      <div className="bt-out">
        <Plank size="md" onClick={onClose}>Back to the game</Plank>
      </div>
    </div>
  )
}

/* read off `marks` on the ledger row, which `finish` writes every sitting; a row from before `marks` existed says so rather than drawing an empty card, and it shows the prompt and the outcome and never the answer given, because a response is minors' data and does not belong in a browser save */
function AnswersCard({ beat, onClose }: { beat: CoreBeat; onClose: () => void }) {
  const row = loadSave()?.ledger.find((e) => e.id === beat.id)
  const marks = row?.marks
  const items = checksOf(beat)
  const facts = beat.takeaways.map(factById).filter((f): f is NonNullable<typeof f> => !!f)
  return (
    <div className="bt-result">
      <CardHead beat={beat} />
      <div className="bt-prompt">
        {marks ? 'How each question went.' : 'This was sat before the game started keeping the marks.'}
      </div>
      {marks && (
        <ol className="bt-answers">
          {items.map((c) => {
            const id = checkIdOf(c)
            const m = marks[id]
            const right = !!m && m[1] > 0 && m[0] >= m[1]
            return (
              <li key={id} className={`bt-answer${right ? ' bt-answer-right' : ''}`}>
                <span className="bt-answer-mark" aria-hidden="true">{right ? '✓' : '✗'}</span>
                <span className="bt-answer-ask">{promptOf(c)}</span>
                <span className="bt-answer-score">
                  {m ? `${m[0]} of ${m[1]}` : 'not answered'}
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {!!facts.length && (
        <>
          <div className="bt-prompt">What this was about.</div>
          <div className="bt-takeaways">
            {facts.map((f) => <div className="bt-fact" key={f.id}>{f.text}</div>)}
          </div>
        </>
      )}
      <div className="bt-out">
        <Plank size="md" onClick={onClose}>Back to the game</Plank>
      </div>
    </div>
  )
}

function ReviewCard({ beat, onRetake, onBack }: { beat: CoreBeat; onRetake: () => void; onBack: () => void }) {
  // "legitimate effort" (§8.1): the takeaways come before the retake unlocks
  const facts = beat.takeaways.map(factById).filter((f): f is NonNullable<typeof f> => !!f)
  return (
    <div className="bt-result">
      <CardHead beat={beat} />
      {/* `takeaways` is optional, so with no facts this says only that the beat can be taken again, instead of telling a student who just failed to read something that is not there */}
      <div className="bt-prompt">
        {facts.length
          ? 'Read these first. Then you can retake it.'
          : 'You can take this one again. Your better attempt is the one that counts.'}
      </div>
      {facts.length > 0 && (
        <div className="bt-takeaways">
          {facts.map((f) => <div className="bt-fact" key={f.id}>{f.text}</div>)}
        </div>
      )}
      <div className="bt-out">
        <Plank size="md" onClick={onRetake}>Retake it</Plank>
        <Plank size="md" onClick={onBack}>Back to my score</Plank>
      </div>
    </div>
  )
}
