import { useEffect, useRef, useState } from 'react'
import type { CheckStep } from '../../vine/contract'
import { checksOf, playableSteps, pointsOf, type BeatStep, type BeatWorld, type CoreBeat } from './frames'
import {
  checkIdOf, plainOf, promptOf, scoreOf,
  type PlainField, type PlainRender, type Response,
} from './palette'
import { progressOf, responseOf, showdownReduce, startShowdown, yardsRemaining, type ShowdownState } from './showdown'
import { LATENCY_CONVENTION, latencyOf, markFirst } from './timing'
import { emptyScore, gradeOf, retakeAvailable, type BeatScore } from './score'
import { collectFact, loadSave, recordGrade } from '../save'
import { cordsOf, letterOf, newlyCloseCords } from '../progress'
import { factById } from '../facts'
import { track } from '../telemetry'
import { usePanel } from '../ui/a11y'
import { currentSkin } from '../ui/skin'
import './beats.css'

// THE ACTIVITY RUNNER — the vine's woven-check chassis (§6.7 baseline), playing any
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
      <div {...panel} className={arm === 'plain' ? 'bt-plain' : 'bt-stage'}>
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
  return (
    <>
      <div className="bt-place">{beat.place} · {beat.title}</div>
      {step.kind === 'say' ? (
        <button className="bt-say" onClick={advance}>
          <span className="bt-speaker">{step.line.speaker}</span>
          <span className="bt-text">{step.line.text}</span>
          <span className="bt-cue">🐾</span>
        </button>
      ) : (
        <CheckPlay
          key={`${checkIdOf(step.check)}:${attempt.n}`}
          check={step.check}
          world={world}
          onDone={(response, ms) => {
            const id = checkIdOf(step.check)
            const total = pointsOf(step.check)
            const earned = scoreOf(step.check, response)
            const tries = attempt.n
            accum.current[id] = { earned, total, tries, latencyMs: ms }
            track('check_answered', {
              item: id, kind: step.check.kind, correct: earned === total,
              earned, total, tries, latencyMs: ms, latency: LATENCY_CONVENTION, arm, via: 'woven',
            })
            advance()
          }}
        />
      )}
    </>
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
function CheckPlay({ check, world, onDone }: {
  check: CheckStep
  world?: BeatWorld
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
    return <DoPlay check={check} world={world} render={render} onDone={(r) => onDone(r, latency())} onTouch={touch} />
  }

  const single = render.fields.length === 1 ? render.fields[0] : null

  // one field, one pick: choice, quiz, place, and a `do` with nowhere to walk
  if (single && single.input === 'radio') {
    return (
      <OneOf
        render={render} field={single} picked={picks[single.id]}
        onPick={(v) => set(single.id, v)}
        onDone={() => onDone(picks, latency())}
      />
    )
  }

  // one field, typed: a number, where recognition would be a different measurement
  if (single && single.input === 'text') {
    const typed = picks[single.id] ?? ''
    const right = scoreOf(check, picks) === pointsOf(check)
    return (
      <div className="bt-check">
        <div className="bt-prompt">{render.prompt}</div>
        <div className="bt-numrow">
          <input
            className={`bt-num ${revealed ? (right ? 'bt-opt-true' : 'bt-opt-miss') : ''}`}
            inputMode="decimal" value={typed} disabled={revealed}
            onChange={(e) => set(single.id, e.target.value)}
          />
          {single.label && <span className="bt-unit">{single.label}</span>}
        </div>
        {revealed
          ? (
            <>
              <div className="bt-reply">
                {right ? 'That is the number.' : `Not quite. It is ${single.correct}${single.label ? ` ${single.label}` : ''}.`}
                {replyFor(render, single.id, typed) ? ` ${replyFor(render, single.id, typed)}` : ''}
              </div>
              <button className="bt-go" onClick={() => onDone(picks, latency())}>Keep going</button>
            </>
          )
          : <button className="bt-go" disabled={typed.trim() === ''} onClick={() => setRevealed(true)}>That is my answer</button>}
      </div>
    )
  }

  // rows: a sort into buckets, an ordering into positions
  const allAnswered = render.fields.every((f) => picks[f.id])
  const earned = scoreOf(check, picks)
  return (
    <div className="bt-check">
      <div className="bt-prompt">{render.prompt}</div>
      <div className="bt-sort">
        {render.fields.map((f) => (
          <div className="bt-sortrow" key={f.id}>
            <span className={`bt-sortlabel ${revealed ? (picks[f.id] === f.correct ? 'bt-opt-true' : 'bt-opt-miss') : ''}`}>
              {f.label}{revealed && picks[f.id] !== f.correct && <em> · {labelOf(f, f.correct)}</em>}
            </span>
            <span className="bt-buckets">
              {f.options.map((o) => (
                <button
                  key={o.value}
                  className={`bt-bucket ${picks[f.id] === o.value ? 'bt-bucket-on' : ''}`}
                  disabled={revealed}
                  onClick={() => set(f.id, o.value)}
                >{o.text}</button>
              ))}
            </span>
          </div>
        ))}
      </div>
      {!revealed
        ? <button className="bt-go" disabled={!allAnswered} onClick={() => setRevealed(true)}>That is my answer</button>
        : (
          <>
            {replyFor(render, render.fields[0]?.id ?? '', '') && (
              <div className="bt-reply">{replyFor(render, render.fields[0].id, '')}</div>
            )}
            <button className="bt-go" onClick={() => onDone(picks, latency())}>
              {earned === pointsOf(check) ? 'All of them. Keep going' : 'Noted. Keep going'}
            </button>
          </>
        )}
    </div>
  )
}

const labelOf = (f: PlainField, value: string) => f.options.find((o) => o.value === value)?.text ?? value

/* PICK ONE, in the game arm: a choice, a quiz, a place, and a `do` that has no
 * world to walk in. Its own component because a `do` whose staging is refused has
 * to fall back to exactly this and not to a second copy of it that drifts. */
function OneOf({ render, field, picked, onPick, onDone }: {
  render: PlainRender
  field: PlainField
  picked: string | undefined
  onPick: (value: string) => void
  onDone: () => void
}) {
  return (
    <div className="bt-check">
      <div className="bt-prompt">{render.prompt}</div>
      <div className="bt-options">
        {field.options.map((o) => (
          <button
            key={o.value}
            className={`bt-opt ${picked !== undefined && o.value === field.correct ? 'bt-opt-true' : ''} ${picked === o.value && o.value !== field.correct ? 'bt-opt-miss' : ''}`}
            disabled={picked !== undefined}
            onClick={() => onPick(o.value)}
          >{o.text}</button>
        ))}
      </div>
      {picked !== undefined && (
        <>
          <div className="bt-reply">
            {replyFor(render, field.id, picked) || (picked === field.correct ? 'Right.' : 'Hm. Not quite.')}
          </div>
          <button className="bt-go" onClick={onDone}>Keep going</button>
        </>
      )}
    </div>
  )
}

/* THE SHOWDOWN, in the game arm. The chassis (showdown.ts) holds every piece of
 * state and this draws it. The drive bar is the only thing on screen that the
 * plain arm does not get, and it is a pure function of rounds correct, so the
 * student who is losing on the field is losing on the transcript too and for the
 * same reason. There is no clock in this component either. */
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
  const right = picked !== null && !!round.options[picked].correct
  return (
    <div className="bt-check">
      <div className="bt-prompt">{check.prompt}</div>
      <div className="bt-drive">
        <span className="bt-driveline" style={{ width: `${Math.round(progressOf(s) * 100)}%` }} />
        <span className="bt-driveyards">{yardsRemaining(s)} to go · {check.opponent}</span>
      </div>
      <div className="bt-prompt">{round.prompt}</div>
      <div className="bt-options">
        {round.options.map((o, i) => (
          <button
            key={i}
            className={`bt-opt ${picked !== null && o.correct ? 'bt-opt-true' : ''} ${picked === i && !o.correct ? 'bt-opt-miss' : ''}`}
            disabled={picked !== null}
            onClick={() => { onTouch(); setS((x) => showdownReduce(x, { kind: 'pick', index: i }, check.rounds)) }}
          >{o.text}</button>
        ))}
      </div>
      {picked !== null && (
        <>
          <div className="bt-reply">{round.options[picked].reply || (right ? 'Moved the chains.' : 'No gain.')}</div>
          <button className="bt-go" onClick={() => setS((x) => showdownReduce(x, { kind: 'next' }, check.rounds))}>
            {s.round + 1 >= s.total ? 'The last snap' : 'Next down'}
          </button>
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
function DoPlay({ check, world, render, onDone, onTouch }: {
  check: Extract<CheckStep, { kind: 'do' }>
  world: BeatWorld
  render: PlainRender
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
        render={render} field={render.fields[0]} picked={picked ?? undefined}
        onPick={(v) => { onTouch(); setPicked(v) }}
        onDone={() => onDone({ [check.id]: picked ?? '' })}
      />
    )
  }

  if (reached === null) {
    return (
      <div className="bt-check">
        <div className="bt-prompt">{render.prompt}</div>
        <div className="bt-reply">Go there. The path is marked.</div>
      </div>
    )
  }
  const right = reached === check.goal.anchor
  return (
    <div className="bt-check">
      <div className="bt-prompt">{render.prompt}</div>
      <div className="bt-reply">
        {replyFor(render, check.id, reached) || (right ? 'That is the place.' : 'Not this one.')}
      </div>
      <button className="bt-go" onClick={() => onDone({ [check.id]: reached })}>Keep going</button>
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

  const complete = renders.every((r) => r.fields.every((f) => (picks[f.id] ?? '').trim() !== ''))

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
   * under the item rather than spoken by somebody. */
  if (graded) {
    return (
      <div className="bt-plainform">
        <h2>{beat.title}</h2>
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
                  <p key={f.id}>
                    {f.label ? `${f.label}: ` : ''}
                    {labelOf(f, given)}
                    {given === f.correct ? ' (correct)' : ` (the answer is ${labelOf(f, f.correct)})`}
                    {reply ? ` ${reply}` : ''}
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
      {!checksOnly && beat.steps.map((s, i) => (s.kind === 'say' ? <p key={i}>{s.line.text}</p> : null))}
      {renders.map((r, i) => (
        <fieldset key={r.id}>
          <legend>{promptOf(checks[i])}</legend>
          {r.fields.map((f) => (
            <PlainFieldRow key={f.id} field={f} value={picks[f.id] ?? ''} onSet={(v) => set(r.id, f.id, v)} />
          ))}
        </fieldset>
      ))}
      <button disabled={!complete} onClick={submit}>Submit</button>
    </div>
  )
}

/* one row of the form, drawn from the field the palette derived. A radio for a
 * pick, a select for a row of many, a text box for a number. There is no branch on
 * the check's kind anywhere in this arm any more, which is what stops a new kind
 * from shipping with no control-arm rendering: it has fields or it does not exist. */
function PlainFieldRow({ field, value, onSet }: { field: PlainField; value: string; onSet: (v: string) => void }) {
  if (field.input === 'text') {
    return (
      <label>
        {field.label ? `${field.label} ` : ''}
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
    <>
      {field.label && <p>{field.label}</p>}
      {field.options.map((o) => (
        <label key={o.value}>
          <input type="radio" name={field.id} checked={value === o.value} onChange={() => onSet(o.value)} /> {o.text}
        </label>
      ))}
    </>
  )
}

// ---- result + review ------------------------------------------------------------------

function ResultCard({ beat, score, arm, canRetake, onReview, onClose }: {
  beat: CoreBeat; score: BeatScore; arm: 'game' | 'plain'
  canRetake: boolean; onReview: () => void; onClose: () => void
}) {
  const s = loadSave()
  const entry = s?.ledger.find((e) => e.id === beat.id)
  const grade = entry?.grade ?? gradeOf(score)
  const closeCords = s ? cordsOf(s).filter((c) => !c.earned && c.progress >= 0.5) : []
  return (
    <div className={arm === 'plain' ? 'bt-plainform' : 'bt-check'}>
      <div className="bt-prompt">{beat.title}: done.</div>
      <div className="bt-grade">
        <span className="bt-lettermark">{letterOf(grade)}</span>
        <span className="bt-gradenum">{grade.toFixed(2)} · {score.earned} of {score.total} this run</span>
      </div>
      <div className="bt-takeaways">
        {beat.takeaways.map((id) => {
          const f = factById(id)
          return f ? <div className="bt-fact" key={id}>{f.text}</div> : null
        })}
      </div>
      {closeCords.length > 0 && (
        <div className="bt-counselor">The counselor noticed: {closeCords.map((n) => n.name).join(', ')}. Watch the Handbook.</div>
      )}
      {canRetake && (
        <button className="bt-go" onClick={onReview}>
          Under a B-. The Universal Retake Policy is real here: review, then run it back
        </button>
      )}
      <button className="bt-go" onClick={onClose}>Back to the year</button>
    </div>
  )
}

function ReviewCard({ beat, arm, onRetake, onBack }: { beat: CoreBeat; arm: 'game' | 'plain'; onRetake: () => void; onBack: () => void }) {
  // "legitimate effort" (§8.1): the takeaways come before the retake unlocks
  return (
    <div className={arm === 'plain' ? 'bt-plainform' : 'bt-check'}>
      <div className="bt-prompt">Review first. That is the policy, and it works.</div>
      <div className="bt-takeaways">
        {beat.takeaways.map((id) => {
          const f = factById(id)
          return f ? <div className="bt-fact" key={id}>{f.text}</div> : null
        })}
      </div>
      <button className="bt-go" onClick={onRetake}>Run it back</button>
      <button className="bt-go" onClick={onBack}>Not yet</button>
    </div>
  )
}
