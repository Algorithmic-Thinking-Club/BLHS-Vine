import { useEffect, useRef, useState } from 'react'
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
import './beats.css'

// THE ACTIVITY RUNNER, the vine's woven-check chassis (§6.7 baseline), playing any
// CoreBeat in either study arm from the SAME data (law §2.12: content constant, game-ness
// the variable):
//  - game arm: dialogue at the player's pace, checks woven between lines, warmth on wrong
//    answers (a hint and the truth, never a buzzer), a result card with the real letter.
//  - plain arm: the same lines as plain text, the same items as a standard form (the AP
//    Research control).
// Completion writes the ledger (recordGrade -> GPA §8.1), collects the takeaway facts,
// and fires the §13.1 events. The Universal Retake Policy is the retry mechanic: under a
// B- the checks may run back ONCE, after reviewing the takeaways (score.ts).
//
// BOTH ARMS NOW RENDER THE SAME DERIVED ITEMS, and this is the change that matters more
// than the eight kinds. `palette.ts` turns a check into a PlainRender: a prompt, a list of
// answerable fields with their options, and the reply strings. The plain arm draws that as
// a form. The game arm draws THE SAME OBJECT as buttons in a panel with the dialogue around
// it. Neither arm reads the raw check to decide what an item is any more, and neither one
// scores: they both hand the same Response map back to the same `scoreOf`.
//
// This used to be two switches, one per arm, over three kinds, free to disagree. That is
// how a control arm ends up with a harder version of the same item and nobody finds out,
// because both arms still emit an identical event shape and the data cannot tell you.
//
// ---------------------------------------------------------------------------------------
// EVERY STATE THIS RUNNER CAN BE IN, COUNTED UP FRONT (§40.42), because the order says
// enumerate first and then build each, and because six of these ten had no drawing at all:
//
//   1 idle        the panel is up on a spoken line. The whole card is the button and the
//                 advance cue is moving (§6.5). Drawn: `.bt-say` + the `cue` sheet.
//   2 presented   an item is on screen, answerable, and nothing has been touched. The
//                 commit control is REFUSED and says in words what it is waiting for.
//   3 answering   at least one field is set. The commit control is live. On a sort every
//                 assignment stays reversible right up to the press (§6.8).
//   4 right       committed, and every field earned its point. `right()` speaks the
//                 author's own confirmation.
//   5 wrong       committed, and at least one field did not. Both halves of the mistake
//                 stay on screen: the chosen option keeps its pressed state and the row
//                 gains its truth (§6.9). `wrong()` speaks the author's own reply. Never
//                 a red fill and never a buzzer.
//   6 revealed    the settled state 4 and 5 share: every control is disabled and an
//                 unpicked wrong option is visibly SPENT rather than merely inert.
//   7 finished    the last item is answered. The game arm says so beside the last
//                 "Keep going"; the plain arm's whole graded form IS this state, with the
//                 per-item corrections printed before any grade is shown.
//   8 result      the result card: the letter, the grade to 2dp, the raw count, the
//                 gauge, what was earned, the takeaways, the counselor's line, the way out.
//   9 review      the takeaways again, before the retake unlocks ("legitimate effort").
//  10 retake      the check set running back, attempt 2, with `attempt.n` carrying it.
//
// A note on 7, honestly: handing the accumulator to `finish()` is synchronous, so there is
// no loading frame to draw between the last answer and the result card, and inventing one
// would be a bar that fills on a timer. What 7 gets instead is a word: the last item says
// it is the last one, and the plain arm's graded form is a real screen a student sits on.

type Answer = { earned: number; total: number; tries: number; latencyMs: number }
type Answers = Record<string, Answer>

/* WHICH ATTEMPT THIS IS, and it used to be the literal 1 in five places across
 * both arms, so the retake count could never be anything else. The Universal
 * Retake Policy is real school policy the game teaches correctly and could not
 * measure, and this is the whole of what was missing: the runner already knows,
 * because it is the thing that re-ran the checks. */
type Attempt = { n: number }

/* Both arms take their latency from timing.ts, which is where the convention is
 * written down and the only place it is. The whole-page number the plain form used
 * to report as `latencyMs` is not lost, it is named: `formMs`, which is honestly
 * what it always was. */

export function CoreBeatRunner(
  { beat, onClose, forceArm, world }: {
    beat: CoreBeat
    onClose: () => void
    /* AS_PLAIN, HERE FROM THE FIRST SCORED THING RATHER THAN RETROFITTED.
     *
     * Normally the arm is whatever the participant was assigned at join and
     * nothing in the world may choose it. This overrides it for ONE activity,
     * which is what `yield self.play(X, as_plain=True)` becomes: an author
     * saying this particular beat should read the same either way.
     *
     * In practice it can only ever force plain, because src/vine/intents.ts
     * refuses the other direction: letting an island force the game arm would
     * let one island opt the control group out of being a control group. */
    forceArm?: 'game' | 'plain'
    /* W8. Optional on purpose: a beat with a `do` item is still playable with no
     * map, because the item falls back to naming its places. See frames.ts. */
    world?: BeatWorld
  },
) {
  const save = loadSave()
  /* THE ARM, AND WHY THE SKIN IS THE LAST WORD RATHER THAN A SECOND SOURCE.
   *
   * An assigned arm always wins: a joined student's condition is the server's to
   * say and nothing on the page may move it. The skin is only consulted when
   * there is NO arm, which is a run nobody joined and which produces no study
   * row. That case is `?skin=plain`, the review door, and without this line it
   * lied: the whole game went plain and this one frame, the frame every scored
   * item in the run is read on, stayed a painted panel. */
  const arm = forceArm
    ?? save?.arm
    ?? (currentSkin() === 'plain' ? 'plain' : 'game')

  const [phase, setPhase] = useState<'play' | 'result' | 'review' | 'retake'>('play')
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
    recordGrade({
      id: beat.id, title: beat.title, kind: beat.kind, credit: beat.credit,
      grade, year: beat.year, season: before?.season ?? 'Fall',
      ...(beat.tags?.length ? { tags: beat.tags } : {}),
      ...(retaking.current ? { retaken: true } : {}),
    })
    for (const f of beat.takeaways) collectFact(f)
    const after = loadSave()
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
    setPhase('result')
  }

  const startRetake = () => {
    retaking.current = true
    attempt.current = { n: attempt.current.n + 1 }
    track('retake_used', { beat: beat.id, tries: attempt.current.n })
    setPhase('retake')
  }

  /* THE ONE PANEL IN THE KIT THAT WAS NOT A PANEL.
   *
   * Six surfaces use `usePanel` and this one did not, which is why the wave-2
   * proof could not get rid of it: it clicked `.bt-close` and `.bt-veil`, and
   * neither was ever a dismiss, so the planner opened UNDERNEATH the quiz and
   * the capture named "10-planner" is a picture of the quiz. That is the
   * screenshot defect. Underneath it were three real ones: Tab walked out of a
   * graded frame into the HUD behind it, a screen reader was never told the
   * frame was there, and `panelDepth()` read zero, so the place card believed
   * the world was quiet and could talk over a scored item.
   *
   * `closeOnEscape` is false while the items are up and true once the result is
   * on screen, which is the distinction `a11y.ts` wrote the option for: "a panel
   * that is not dismissible (a graded frame mid-run)". A student cannot escape
   * out of a score; they can leave the card that reports it. */
  const scoring = phase === 'play' || phase === 'retake'
  const panel = usePanel({
    label: `${beat.title} · ${scoring ? 'activity' : 'result'}`,
    onClose,
    closeOnEscape: !scoring,
  })

  if (!save) return null

  return (
    <div className="bt-veil">
      <div {...panel} className={arm === 'plain' ? 'bt-plain' : 'bt-stage kit-surface-panel'}>
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
        {phase === 'review' && (
          <ReviewCard beat={beat} arm={arm} onRetake={startRetake} onBack={() => setPhase('result')} />
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

/* WARMTH, IN THE AUTHOR'S OWN WORDS, THROUGH THE KIT'S ONE FEEDBACK SET.
 *
 * §6.9 is the law: "a wrong answer in this game is met with warmth and
 * information. Not with a penalty and not with a colour that means failure." The
 * mechanism that delivers it is the DATA and not a tone setting, so this hands
 * `feedback.ts` the reply the author wrote for the answer the student actually
 * gave and never a generic line. `wrong()` is warm ink on the same paper
 * `right()` uses; nothing in this file fills anything with the alarm colour.
 *
 * It also says it out loud: `feedback()` announces through the kit's one live
 * region, so a correction reaches a student who cannot see the card. */
function speak(gotAll: boolean, authored: string, truth: string): void {
  if (gotAll) sayRight('That is it', authored || undefined)
  else sayWrong('Have another look', authored || truth)
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
  /* THE SPINE, READ OFF THE BEAT RATHER THAN TYPED. §6.9's open finding is that a
   * student is never told how many items there are or which one they are on, and
   * §6.4's law is that the scorable spine is derived and never declared, so the
   * rail counts the same steps `checksOf` counts and cannot disagree with the
   * denominator on the result card. */
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
      {step.kind === 'say' ? (
        <button className="bt-say kit-surface-dialogue" onClick={advance}>
          <span className="bt-speakerrow">
            {/* PORTRAIT, WHICH `SceneLine` HAS CARRIED SINCE THE BOX WAS WRITTEN
                AND NOTHING HAS EVER DRAWN. §6.5's own want, in one line: an author
                who sets one on a beat's line now sees it, in the kit's drawn frame,
                and `PortraitFrame` says out loud in the console when the art is
                missing rather than hiding the face silently. */}
            {step.line.portrait && <PortraitFrame src={step.line.portrait} caption={step.line.speaker} />}
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

/* THE ADVANCE CUE, DRAWN. It was the emoji paw print, which `docs/ART.md` rules
 * out ("Icons are drawn, never an emoji or a font glyph") and which §6.5 already
 * named as a placeholder that twenty islands would otherwise inherit. The kit
 * publishes a four frame paw on the `cue` sheet, so the frames are stacked and
 * shown one at a time by the stylesheet.
 *
 * WHEN NOBODY DREW IT, a token-coloured chevron stands in rather than a
 * character. The kit only wears its faces behind `?kit=1`, so that fallback is
 * what a student sees today and it had to be as deliberate as the drawing. */
const CUE_FRAMES = ['frame_1', 'frame_2', 'frame_3', 'frame_4']

function AdvanceCue() {
  const drawn = useFace('cue', 'frame_1')
  if (!drawn) return <span className="bt-cue-mark" aria-hidden="true" />
  return (
    <span className="bt-cue" aria-hidden="true">
      {CUE_FRAMES.map((f, i) => (
        <Glyph key={f} piece="cue" face={f} size={26} className={`bt-cueframe bt-cf${i + 1}`} />
      ))}
    </span>
  )
}

/* THE COMMIT CONTROL, AND WHY IT IS ITS OWN COMPONENT.
 *
 * `docs/ops/BRIEF-UI.md` item 8: "the four disabled buttons in ActivityRunner.tsx
 * replaced by controls that answer". Four commits in this file could be refused
 * and all four were a grey rectangle that did nothing when pressed and said
 * nothing about why. A refused control now carries the reason in words beside
 * itself and in its own tooltip, off the SAME completeness test that gates the
 * press, so the sentence cannot drift from the rule. */
function Commit({ ready, needs, onCommit, label = 'That is my answer' }: {
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

/* ONE CHECK, IN THE GAME ARM, RENDERED OFF THE SAME DERIVED ITEM THE FORM USES.
 *
 * `plainOf` gives the prompt, the answerable fields and the replies. What changes
 * between the arms is the control and the warmth around it: buttons in a panel and
 * a spoken correction here, radios and printed corrections there. The item itself
 * is one object and neither arm gets to have its own version of it.
 *
 * Two kinds ask for more than a field list and get their own branch: `showdown`,
 * which is round by round and carries a drive between rounds, and `do`, which is
 * answered by walking somewhere when there is a world to walk in. */
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
              needs="Type a number first, then this is your answer."
              onCommit={() => { setRevealed(true); speak(got, authored, truth) }}
            />
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
            needs={missing === 1 ? 'One row still has nothing on it.' : `${missing} rows still have nothing on them.`}
            onCommit={() => {
              setRevealed(true)
              speak(earned === outOf, rowReply, `${earned} of ${outOf} landed in the right place.`)
            }}
          />
        )
        : (
          <>
            {/* THE COUNT §6.9 SAYS IS MISSING. Five rows used to reveal at once
                with nothing saying how many were right, so a student who got four
                of five read four confirmations and one correction at the same time
                and was never told it was four. */}
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

/* THE SHOWDOWN, in the game arm. The chassis (showdown.ts) holds every piece of
 * state and this draws it. The drive bar is the only thing on screen that the
 * plain arm does not get, and it is a pure function of rounds correct, so the
 * student who is losing on the field is losing on the transcript too and for the
 * same reason. There is no clock in this component either.
 *
 * THE BAR IS THE KIT'S GAUGE NOW rather than a `<span>` with an inline width, so
 * the drawn track and its drawn fill are the same ones the arrival cover and the
 * result card use, and a reader is told the number through `role=progressbar`
 * instead of watching a decoration it cannot see. */
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
          label={`Yards to the line against ${check.opponent}`}
          reading={`${yardsRemaining(s)} to go`}
        />
        <span className="bt-driveword">{check.opponent} · down {s.round + 1} of {s.total}</span>
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
                speak(!!o.correct, o.reply ?? '', o.correct ? 'Moved the chains.' : 'No gain.')
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
            {round.options[picked].reply || (got ? 'Moved the chains.' : 'No gain.')}
          </div>
          <div className="bt-foot">
            <Plank size="md" onClick={() => setS((x) => showdownReduce(x, { kind: 'next' }, check.rounds))}>
              {s.round + 1 >= s.total ? 'The last snap' : 'Next down'}
            </Plank>
          </div>
        </>
      )}
    </div>
  )
}

/* A `do`, WITH A WORLD TO DO IT IN. W8's whole surface, and it is this small.
 *
 * The beat asks for the arrow to the goal with `guide_to`, which is an intent an
 * island can already issue, and then waits for the one event it is allowed to
 * hear: the player reached a named anchor. Every anchor named by the item counts,
 * the goal and the decoys alike, because walking to the wrong place IS the wrong
 * answer and the student has to be able to give it. `scoreOf` decides which one it
 * was, in the same line it decides a quiz. */
function DoPlay({ check, world, render, last, onDone, onTouch }: {
  check: Extract<CheckStep, { kind: 'do' }>
  world: BeatWorld
  render: PlainRender
  last: boolean
  onDone: (r: Response) => void
  onTouch: () => void
}) {
  const [reached, setReached] = useState<string | null>(null)
  /* THE STAGING CAN BE REFUSED, AND A REFUSED ITEM MUST NOT BE A LOCKED DOOR.
   *
   * `guide_to` answers `{ok: false}` when the map has no anchor by that name,
   * which is the single most likely mistake an author will make here. Waiting on
   * an arrival that can never come would strand the student inside a beat with no
   * way out and no way to say why. So a refusal drops the item to the same
   * buttons a runner with no world shows, and the student answers the question
   * they were always going to be asked. The author still learns: the refusal
   * carries their anchor name and lands in the console. */
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
        <div className="bt-reply">Go there. The path is marked.</div>
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

  /* PER-ITEM CORRECTIVE FEEDBACK, WHICH THIS ARM USED TO BE DENIED (L2).
   *
   * The form rendered the prompts and the options and dropped every `reply`. The
   * game student was told why they were wrong and what the truth is; the control
   * student was told nothing and moved straight to a grade. Content constancy is
   * the study's whole claim and this broke it in the direction that flatters the
   * treatment, across every island at once, undetectably, because both arms emit
   * the same event shape.
   *
   * So the same words, presented the way this arm presents everything: printed
   * under the item rather than spoken by somebody.
   *
   * AND CORRECTNESS IS THE PALETTE'S TO SAY, WHICH IT WAS NOT. This compared
   * `given === f.correct`, a raw string compare, while `PALETTE.number.score` had
   * been scoring the same answer against a declared tolerance since the kind was
   * added. On the shipped item (answer 3.76, tolerance 0.05) a control-arm student
   * who typed 3.80 was scored correct by the accumulator and told "the answer is
   * 3.76" by the line under it, in the same frame. `fieldRight` is now the only
   * thing either arm asks. */
  if (graded) {
    const earned = Object.values(graded).reduce((n, a) => n + a.earned, 0)
    const outOf = Object.values(graded).reduce((n, a) => n + a.total, 0)
    return (
      <div className="bt-plainform">
        <h2>{beat.title}</h2>
        {/* THE PLACE, WHICH THIS ARM WAS NOT GIVEN. The game arm prints
            "place · title" at the top of every screen of the activity and the
            plain arm printed the title alone, so one line of authored content
            reached one arm only, in the direction that flatters the treatment. */}
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
      {!checksOnly && beat.steps.map((s, i) => (s.kind === 'say' ? <p key={i}>{s.line.text}</p> : null))}
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

/* one row of the form, drawn from the field the palette derived. A radio for a
 * pick, a select for a row of many, a text box for a number. There is no branch on
 * the check's kind anywhere in this arm any more, which is what stops a new kind
 * from shipping with no control-arm rendering: it has fields or it does not exist.
 *
 * EVERY CONTROL HERE HAS A NAME MADE OF WORDS. A number field carried the UNIT as
 * its label and the unit is optional, so on an item that declared none the input
 * had no label and no aria-label at all and a screen reader said "edit text" on a
 * SCORED item. A radio group with no label was the same defect one level up: a
 * showdown puts several groups inside one fieldset, so the legend cannot name
 * them. */
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
          <option value="" disabled>choose</option>
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

/* THE CARD'S OWN HEAD, IN WHICHEVER ARM IT IS BEING READ IN.
 *
 * The game arm draws the place beside the title, which is the line that tells a
 * student the activity belongs to a room in the world. The plain arm gets the
 * same two pieces of content as a real heading and a line under it, because §16
 * is a document and a document has headings; what it is not allowed to do is
 * quietly print one fewer piece of content than the treatment arm, which is
 * exactly what it used to do with `beat.place`. */
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

/* THE RESULT CARD IS THE ENDING OF EVERY ACTIVITY IN THE GAME.
 *
 * §10.22 states it as a law rather than as a convenience: "one result. ResultCard
 * is the ending of every activity in the game, so a member never designs a win
 * screen and no island's ending looks unlike the rest of the game." Four core
 * beats, fifty-one class beats and every island an ATC member will ever write end
 * here, so this is the single highest-leverage card in the project.
 *
 * WHAT IT SAYS, AND WHICH NUMBER IS WHICH. §6.18's open want is "a result card
 * that states which number it is showing", because the card reads the LEDGER
 * (`entry?.grade`) and was handed THIS RUN's score, and after a retake that did
 * not beat the first attempt those are two different numbers with nothing on
 * screen saying so. Both are printed now and the card says out loud which one is
 * the transcript's.
 *
 * GOLD IS EARNED HONORS AND NOTHING ELSE (docs/ART.md), so the `stamp` sheet's
 * gold rosette is spent on an A and on nothing else. Passing wears the plain
 * approval stamp, which is what earning the credit actually is. */
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
          <span className="bt-gradenum">{grade.toFixed(2)} · {score.earned} of {score.total} this run</span>
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
              <span className="bt-stampword">Top marks</span>
            </span>
          )}
        </div>
      )}
      {facts.length > 0 && (
        <div className="bt-takeaways">
          <div className="bt-h">{facts.length === 1 ? 'One card you keep' : `${facts.length} cards you keep`}</div>
          {facts.map((f) => <div className="bt-fact" key={f.id}>{f.text}</div>)}
        </div>
      )}
      {closeCords.length > 0 && (
        <div className="bt-counselor">The counselor noticed: {closeCords.map((n) => n.name).join(', ')}. Watch the Handbook.</div>
      )}
      {canRetake && (
        <div className="bt-retake">
          <span className="bt-needs">Under a B-. The Universal Retake Policy is real here, and it is the school's own.</span>
          {arm === 'plain'
            ? <button onClick={onReview}>Review, then run it back</button>
            : <Plank size="md" onClick={onReview}>Review, then run it back</Plank>}
        </div>
      )}
      <div className="bt-out">
        {arm === 'plain'
          ? <button onClick={onClose}>Back to the year</button>
          : <Plank size="md" onClick={onClose}>Back to the year</Plank>}
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
      <div className="bt-prompt">Review first. That is the policy, and it works.</div>
      <div className="bt-takeaways">
        {facts.map((f) => <div className="bt-fact" key={f.id}>{f.text}</div>)}
      </div>
      <div className="bt-out">
        {arm === 'plain'
          ? (
            <>
              <button onClick={onRetake}>Run it back</button>
              <button onClick={onBack}>Not yet</button>
            </>
          )
          : (
            <>
              <Plank size="md" onClick={onRetake}>Run it back</Plank>
              <Plank size="md" onClick={onBack}>Not yet</Plank>
            </>
          )}
      </div>
    </div>
  )
}
