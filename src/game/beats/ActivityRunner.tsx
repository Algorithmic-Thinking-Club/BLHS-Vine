import { useEffect, useRef, useState } from 'react'
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
import { currentSkin } from '../ui/skin'
import { Chip, Field, Gauge, Glyph, Plank, PortraitFrame, useFace } from '../ui/controls'
import { right as sayRight, wrong as sayWrong } from '../ui/feedback'
import { grant } from '../grant'
import './beats.css'

// plays a scored beat in either arm from the same data, then writes the grade to the ledger

type Answer = { earned: number; total: number; tries: number; latencyMs: number }
type Answers = Record<string, Answer>

/** which try at this beat the student is on */
type Attempt = { n: number }

/* both arms take their answer latency from timing.ts, where the convention is written down */

export function CoreBeatRunner(
  { beat, onClose, forceArm, world, review }: {
    beat: CoreBeat
    onClose: () => void
    /* open on the marks of the sitting already on the ledger, and never play */
    review?: boolean
    /** forces one activity to read plain, whatever arm the student was assigned */
    forceArm?: 'game' | 'plain'
    /* W8. Optional on purpose: a beat with a `do` item is still playable with no
     * map, because the item falls back to naming its places. See frames.ts. */
    world?: BeatWorld
  },
) {
  const save = loadSave()
  /* an assigned arm always wins, and the skin is only consulted when there is no arm */
  const arm = forceArm
    ?? save?.arm
    ?? (currentSkin() === 'plain' ? 'plain' : 'game')

  /* ---- 'answers' IS A WAY IN, NOT A WAY ON (Ash, 2026-09-09) ------------
   *
   * *"If they have passed, maybe the dialogue says 'Advisory is done for this
   * year, see answers?' and an option shows up, which they click to open and see
   * their answers."*
   *
   * The sheet's button was wired to open the runner, and the runner opens on
   * `play`, so pressing "see your answers" on a PASSED Advisory started a fresh
   * quiz and re-graded him. Opening straight onto the marks is the whole of the
   * fix, and it is a phase rather than a second panel because the card that
   * knows how to draw a beat's items is already in this file. */
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
    if (arm !== 'plain' && beat.credit > 0 && grade >= PASSING_GRADE) {
      /* through `grant` so a credit that tips a cord over its line says so too */
      /* and it names the thing that was finished, with the credit as the detail under it */
      /* the core beat's `place` is the lesson's own name ("Advisory") and a
       * class beat's is a room, so the pop reads whichever of the two is the
       * thing the student just finished */
      grant(before, after, {
        what: `${beat.kind === 'core' ? beat.place : beat.title} is done.`,
        detail: `${beat.credit} credit, on your transcript.`,
      })
    }
    track('core_beat_complete', {
      id: beat.id, grade, retaken: retaking.current, arm, tries: attempt.current.n,
      /* the first attempt's grade is the study's number and the ledger keeps it,
       * so the event carries the same one rather than a second reading of it */
      firstGrade: after?.ledger.find((e) => e.id === beat.id)?.firstGrade ?? grade,
    })
    track('gpa_updated', { grade, beat: beat.id })
    if (before && after) {
      for (const c of newlyCloseCords(before, after)) track('cord_progress', { cord: c.id, progress: c.progress })
    }
    setFinalScore(score)
    /* ---- THE CARD IS KEPT WHENEVER THERE IS AN OFFER ON IT ---------------
     *
     * The game arm skipped the result card on ANY pass, on the reasoning that
     * the reward pop is the result. That was true while a pass meant a good
     * grade. It stopped being true the moment `PASSING_GRADE` became a D: a
     * student who scraped two of seven now passes, the pop says "Advisory is
     * done. 0.5 credit, on your transcript", the panel shuts, and the Universal
     * Retake he is entitled to is never mentioned. The plain arm, which always
     * shows the card, offered it. Two arms disagreeing about what a student is
     * told he may do is a confound as well as a bug.
     *
     * So the card stays whenever it has something to say: a fail, or a pass
     * carrying a retake. A clean pass still gets the pop and nothing else. */
    /* ---- AND NOW IT IS ALWAYS KEPT, IN BOTH ARMS ------------------------
     *
     * This is a STUDY defect before it is a game one. The plain arm always saw
     * the result card: the letter, the points, the credit, and the beat's
     * takeaway facts written out. The game arm saw a two-line reward pop and the
     * panel shut. So the two arms were shown different CONTENT at the one moment
     * the study is measuring, and the arm that read the facts was the control.
     * Every measured difference between them carried that.
     *
     * The pop still fires; it is the celebration. The card is the record, and
     * both arms get it. Ash's own rule: the paint is the variable, what a
     * student is told is not. */
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
      <div {...panel} className={arm === 'plain'
        ? `bt-plain${scoring ? ' bt-plain-scoring' : ''}`
        : 'bt-stage kit-surface-panel'}>
        {(phase === 'play' || phase === 'retake') && (arm === 'plain'
          ? <PlainForm beat={beat} checksOnly={phase === 'retake'} attempt={attempt.current} arm={arm} onDone={finish} />
          : <GamePlay beat={beat} checksOnly={phase === 'retake'} attempt={attempt.current} arm={arm} world={world} onDone={finish} />)}
        {phase === 'result' && finalScore && (
          <ResultCard
            beat={beat} score={finalScore} arm={arm}
            canRetake={retakeAvailable(loadSave()!, beat.id)}
            onReview={() => setPhase('review')}
            onClose={onClose}
          />
        )}
        {phase === 'answers' && (
          <AnswersCard beat={beat} arm={arm} onClose={onClose} />
        )}
        {phase === 'review' && (
          <ReviewCard beat={beat} arm={arm} onRetake={startRetake} onBack={() => setPhase('result')} />
        )}
        {/* a way out that scores nothing and leaves the beat still owed */}
        {/* and never inside a cutscene, where the way on is finishing the items */}
        {scoring && !cinemaOn() && (
          <div className="bt-leave">
            {arm === 'plain'
              ? <button type="button" onClick={onClose}>Leave this for now</button>
              : <Plank size="sm" onClick={onClose}>Leave this for now</Plank>}
            <span className="bt-leave-why">Nothing is marked until you check your answer. You can come back to this.</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** the reply the author wrote for this pick. `value: ''` is the field-wide one, so
 *  a number or an ordering corrects the student who got it wrong rather than the
 *  one who did not need it. */
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

function GamePlay({ beat, checksOnly, attempt, arm, world, onDone }: {
  beat: CoreBeat
  checksOnly: boolean
  attempt: Attempt
  arm: 'game' | 'plain'
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
              earned, total: worth, tries, latencyMs: ms, latency: LATENCY_CONVENTION, arm, via: 'woven',
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

  /* the places, taken off the first field because every field offers the same
   * ones: the buckets of a sort, the positions of an order */
  const places = render.fields[0]?.options ?? []
  const pool = render.fields.filter((f) => !picks[f.id])
  const inPlace = (v: string) => render.fields.filter((f) => picks[f.id] === v)

  const put = (place: string) => {
    if (!held || revealed) return
    /* an ordering's place holds one thing, so dropping onto a full slot swaps
     * the sitting piece back into the pool rather than refusing. A refusal here
     * would be the game saying no to the only move a student can see. */
    if (single) for (const f of inPlace(place)) onSet(f.id, '')
    onSet(held, place)
    setHeld(null)
  }

  const lift = (fieldId: string) => {
    if (revealed) return
    onTouch()
    /* pressing a piece that is already placed takes it back out, which is the
     * undo a student finds without being told there is one */
    if (picks[fieldId]) { onSet(fieldId, ''); setHeld(fieldId); return }
    setHeld((h) => (h === fieldId ? null : fieldId))
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

      {/* THE POOL EMPTIES AS THE PLACES FILL, which is the progress bar this
          frame does not need: a student can see how much is left by looking at
          what is still in their hand. */}
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

      {/* AND THE TRUTH, WHEN IT IS TIME, BESIDE WHAT THEY THOUGHT. §6.9: nothing
          is taken away. A piece in the wrong place keeps its place and gains a
          line saying where it belonged. */}
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

  /* the convention, applied: the first input that touches the item, whichever
   * field it lands on, is the moment the student answered */
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
    /* THE PALETTE DECIDES, HERE AND IN THE FORM. A number is scored against a
     * declared tolerance, so nothing outside `palette.ts` may compare strings. */
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
                {/* §6.9: NOTHING IS TAKEN AWAY. The row keeps its label and gains
                    its truth, and the chosen chip keeps its selected state under
                    it, so the student sees what they thought beside what is so. */}
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

/* PICK ONE, in the game arm: a choice, a quiz, a place, and a `do` that has no
 * world to walk in. Its own component because a `do` whose staging is refused has
 * to fall back to exactly this and not to a second copy of it that drifts. */
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
                /* the palette says whether that was right, here as everywhere:
                 * the warmth and the score cannot come from two different rules */
                speak(
                  fieldRight(check, field, { [field.id]: o.value }),
                  replyFor(render, field.id, o.value),
                  `The answer is ${labelOf(field, field.correct)}.`,
                )
              }}
            >
              {o.text}
              {/* THE WORD IS THE STATE. A drawn tick is worn when the kit is on and
                  the sentence carries it when the kit is off, because §40.31 will
                  not have a state that only a colour is holding. */}
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

  /* the drive ends exactly once, on the transition into done. Depending on the
   * flag rather than on the whole state is deliberate: `s` changes every pick and
   * this must not fire on any of them. */
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

/* a `do` answered by walking: the arrow points, and reaching a named anchor is the answer */
function DoPlay({ check, world, render, last, onDone, onTouch }: {
  check: Extract<CheckStep, { kind: 'do' }>
  world: BeatWorld
  render: PlainRender
  last: boolean
  onDone: (r: Response) => void
  onTouch: () => void
}) {
  const [reached, setReached] = useState<string | null>(null)
  /* a refused staging falls back to buttons rather than stranding the student */
  const [staged, setStaged] = useState<'waiting' | 'refused'>('waiting')
  const [picked, setPicked] = useState<string | null>(null)
  const done = useRef(false)

  /* staged once, when the item comes on screen, and torn down when it leaves. The
   * empty dependency list is the whole intent: re-issuing the arrow on every
   * render would fight the player for the camera. */
  useEffect(() => {
    void world.issue({ kind: 'guide_to', anchor: check.goal.anchor }).then((r) => {
      if (!r.ok) { console.warn(`[check ${check.id}] cannot stage in the world: ${r.why}`); setStaged('refused') }
    })
    return world.onReached((anchor) => {
      if (done.current) return
      /* only the places this item named. Walking past something else on the way is
       * not an answer, and treating it as one would score a student on the route
       * they happened to take. */
      if (anchor !== check.goal.anchor && !check.decoys.some((d) => d.anchor === anchor)) return
      done.current = true
      onTouch()
      setReached(anchor)
    })
  }, [])

  if (staged === 'refused' && reached === null) {
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
        <div className="bt-reply">Walk to {check.goal.label}. The arrow points the way.</div>
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

// ---- the plain arm (the AP Research control): same content, standard form ------------

function PlainForm({ beat, checksOnly, attempt, arm, onDone }: {
  beat: CoreBeat; checksOnly?: boolean; attempt: Attempt; arm: 'game' | 'plain'
  onDone: (a: Answers) => void
}) {
  const checks = checksOf(beat)
  const renders = checks.map(plainOf)
  const t0 = useRef(Date.now())
  const [picks, setPicks] = useState<Response>({})
  /* the convention lives at the top of this file. Per-item, stamped when the
   * answer is given rather than reconstructed at submit, because a form is
   * answerable in any order and the submit click is one number for the page. */
  const answeredAt = useRef<Record<string, number>>({})
  const [graded, setGraded] = useState<Answers | null>(null)

  const set = (itemId: string, fieldId: string, value: string) => {
    markFirst(answeredAt.current, itemId)
    setPicks((p) => ({ ...p, [fieldId]: value }))
  }

  const blanks = renders.reduce((n, r) => n + r.fields.filter((f) => (picks[f.id] ?? '').trim() === '').length, 0)
  const complete = blanks === 0

  const submit = () => {
    const out: Answers = {}
    const formMs = Date.now() - t0.current
    for (const c of checks) {
      const id = checkIdOf(c)
      const ms = latencyOf(t0.current, answeredAt.current, id)
      const total = pointsOf(c)
      const earned = scoreOf(c, picks)
      out[id] = { earned, total, tries: attempt.n, latencyMs: ms }
      track('check_answered', {
        item: id, kind: c.kind, correct: earned === total,
        earned, total, tries: attempt.n, latencyMs: ms, latency: LATENCY_CONVENTION,
        formMs, arm, via: 'form',
      })
    }
    setGraded(out)
  }

  /* the graded form: the same authored replies, printed, with the palette saying what is right */
  if (graded) {
    const earned = Object.values(graded).reduce((n, a) => n + a.earned, 0)
    const outOf = Object.values(graded).reduce((n, a) => n + a.total, 0)
    return (
      <div className="bt-plainform">
        <h2>{beat.title}</h2>
        {/* the place, so both arms print the same authored content */}
        <p className="bt-plainplace">{beat.place}</p>
        <p className="bt-plainscore">{earned} of {outOf} correct.</p>
        {renders.map((r, i) => {
          const c = checks[i]
          const a = graded[checkIdOf(c)]
          return (
            <fieldset key={r.id}>
              <legend>{r.prompt}</legend>
              <p>{a.earned} of {a.total} correct.</p>
              {r.fields.map((f) => {
                const given = picks[f.id] ?? ''
                const reply = replyFor(r, f.id, given)
                return (
                  <p className="bt-plainrow" key={f.id}>
                    {f.label ? `${f.label}: ` : ''}
                    {labelOf(f, given)}
                    {fieldRight(c, f, picks) ? ' (correct)' : ` (the answer is ${labelOf(f, f.correct)})`}
                    {reply ? <em> {reply}</em> : ''}
                  </p>
                )
              })}
            </fieldset>
          )
        })}
        <button onClick={() => onDone(graded)}>Continue</button>
      </div>
    )
  }

  return (
    <div className="bt-plainform">
      <h2>{beat.title}</h2>
      <p className="bt-plainplace">{beat.place}</p>
      {/* ---- WHO IS SPEAKING (Ash, 2026-09-09) ----------------------------
          *
          * The plain arm printed the words and dropped the name, so several lines
          * from different people ran together as one anonymous paragraph. The
          * game arm reads "Mr. Wiseman" and then the line. Who said a thing is
          * CONTENT, not paint: it is how a student knows the counselor from the
          * principal, and the study cannot afford one arm knowing that and the
          * other not. The portrait stays out, because that is paint. */}
      {!checksOnly && beat.steps.map((s, i) => (s.kind === 'say' ? (
        <p key={i}>
          {s.line.speaker && <b className="bt-plainspeaker">{s.line.speaker}: </b>}
          {s.line.text}
        </p>
      ) : null))}
      {renders.map((r, i) => (
        <fieldset key={r.id}>
          <legend>{promptOf(checks[i])}</legend>
          {r.fields.map((f) => (
            <PlainFieldRow key={f.id} field={f} prompt={r.prompt} value={picks[f.id] ?? ''} onSet={(v) => set(r.id, f.id, v)} />
          ))}
        </fieldset>
      ))}
      <button disabled={!complete} title={complete ? undefined : 'Every question needs an answer first.'} onClick={submit}>Submit</button>
      {/* the refused control says what it is waiting for here too. A control arm
          that cannot tell a student why it will not move measures usability
          rather than presentation, which is the wrong variable. */}
      {!complete && (
        <span className="bt-needs">
          {blanks === 1 ? 'One question still has no answer.' : `${blanks} questions still have no answer.`}
        </span>
      )}
    </div>
  )
}

/* one row of the plain form: a radio, a select or a text box, each with a name made of words */
function PlainFieldRow({ field, prompt, value, onSet }: {
  field: PlainField
  /** the item's own question, which is the group's name when the row has none */
  prompt: string
  value: string
  onSet: (v: string) => void
}) {
  if (field.input === 'text') {
    return (
      <label>
        {field.label ? `Your answer, in ${field.label} ` : 'Your answer '}
        <input type="text" inputMode="decimal" value={value} onChange={(e) => onSet(e.target.value)} />
      </label>
    )
  }
  if (field.input === 'select') {
    return (
      <label>
        {field.label}{' '}
        <select value={value} onChange={(e) => onSet(e.target.value)}>
          <option value="" disabled>Pick one</option>
          {field.options.map((o) => <option key={o.value} value={o.value}>{o.text}</option>)}
        </select>
      </label>
    )
  }
  return (
    <div className="bt-plaingroup" role="group" aria-label={field.label || prompt}>
      {field.label && <p>{field.label}</p>}
      {field.options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={field.id} checked={value === o.value} onChange={() => onSet(o.value)} /> {o.text}
        </label>
      ))}
    </div>
  )
}

/* the activity's place and title, drawn the way whichever arm is reading it draws things */
function CardHead({ beat, arm }: { beat: CoreBeat; arm: 'game' | 'plain' }) {
  if (arm === 'plain') {
    return (
      <>
        <h2>{beat.title}</h2>
        <p className="bt-plainplace">{beat.place}</p>
      </>
    )
  }
  return (
    <div className="bt-head">
      <span className="bt-place">{beat.place} · <b>{beat.title}</b></span>
    </div>
  )
}

// ---- result + review ------------------------------------------------------------------

/* the card every activity ends on: the letter, the grade, what was earned and the way out */
function ResultCard({ beat, score, arm, canRetake, onReview, onClose }: {
  beat: CoreBeat; score: BeatScore; arm: 'game' | 'plain'
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
    <div className={arm === 'plain' ? 'bt-plainform bt-result' : 'bt-result'}>
      <CardHead beat={beat} arm={arm} />
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
          {passed && (
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
          {arm === 'plain'
            ? <button onClick={onReview}>Review, then retake</button>
            : <Plank size="md" onClick={onReview}>Review, then retake</Plank>}
        </div>
      )}
      <div className="bt-out">
        {arm === 'plain'
          ? <button onClick={onClose}>Back to the game</button>
          : <Plank size="md" onClick={onClose}>Back to the game</Plank>}
      </div>
    </div>
  )
}

/* ---- WHAT HE GOT, ITEM BY ITEM (Ash, 2026-09-09) -------------------------
 *
 * Read off `marks` on the ledger row, which `finish` writes on every sitting.
 * A row from before this existed carries none, and that says so rather than
 * drawing an empty card: the honest answer to "see your answers" for a sitting
 * nobody recorded is that it was not recorded.
 *
 * IT SHOWS THE PROMPT AND THE OUTCOME, NOT THE ANSWER HE GAVE. The response
 * itself is minors' data and belongs in the study's own log behind a participant
 * id, not in a browser save; what a student wants back is which ones he got.
 * The takeaways are underneath, because they are the answers in the only sense
 * that helps him next year. */
function AnswersCard({ beat, arm, onClose }: { beat: CoreBeat; arm: 'game' | 'plain'; onClose: () => void }) {
  const row = loadSave()?.ledger.find((e) => e.id === beat.id)
  const marks = row?.marks
  const items = checksOf(beat)
  const facts = beat.takeaways.map(factById).filter((f): f is NonNullable<typeof f> => !!f)
  return (
    <div className={arm === 'plain' ? 'bt-plainform bt-result' : 'bt-result'}>
      <CardHead beat={beat} arm={arm} />
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
        {arm === 'plain'
          ? <button onClick={onClose}>Back to the game</button>
          : <Plank size="md" onClick={onClose}>Back to the game</Plank>}
      </div>
    </div>
  )
}

function ReviewCard({ beat, arm, onRetake, onBack }: { beat: CoreBeat; arm: 'game' | 'plain'; onRetake: () => void; onBack: () => void }) {
  // "legitimate effort" (§8.1): the takeaways come before the retake unlocks
  const facts = beat.takeaways.map(factById).filter((f): f is NonNullable<typeof f> => !!f)
  return (
    <div className={arm === 'plain' ? 'bt-plainform bt-result' : 'bt-result'}>
      <CardHead beat={beat} arm={arm} />
      <div className="bt-prompt">Read these first. Then you can retake it.</div>
      <div className="bt-takeaways">
        {facts.map((f) => <div className="bt-fact" key={f.id}>{f.text}</div>)}
      </div>
      <div className="bt-out">
        {arm === 'plain'
          ? (
            <>
              <button onClick={onRetake}>Retake it</button>
              <button onClick={onBack}>Back to my score</button>
            </>
          )
          : (
            <>
              <Plank size="md" onClick={onRetake}>Retake it</Plank>
              <Plank size="md" onClick={onBack}>Back to my score</Plank>
            </>
          )}
      </div>
    </div>
  )
}
