import { useRef, useState } from 'react'
import type { CheckStep } from '../../vine/contract'
import { checksOf, pointsOf, type BeatStep, type CoreBeat } from './frames'
import { emptyScore, gradeOf, retakeAvailable, type BeatScore } from './score'
import { collectFact, loadSave, recordGrade } from '../save'
import { cordsOf, letterOf, newlyCloseCords } from '../progress'
import { FACTS } from '../../app/transitions'
import { track } from '../telemetry'
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

type Answer = { earned: number; total: number; tries: number; latencyMs: number }
type Answers = Record<string, Answer>

const checkId = (c: CheckStep): string => (c.kind === 'quiz' ? c.item.id : c.id)

export function CoreBeatRunner({ beat, onClose }: { beat: CoreBeat; onClose: () => void }) {
  const save = loadSave()
  const arm = save?.arm === 'plain' ? 'plain' : 'game'

  const [phase, setPhase] = useState<'play' | 'result' | 'review' | 'retake'>('play')
  const [finalScore, setFinalScore] = useState<BeatScore | null>(null)
  const retaking = useRef(false)

  const finish = (answers: Answers) => {
    const score: BeatScore = {
      ...emptyScore(beat),
      earned: Object.values(answers).reduce((n, a) => n + a.earned, 0),
    }
    const grade = gradeOf(score)
    const before = loadSave()
    recordGrade({
      id: beat.id, title: beat.title, kind: 'core', credit: beat.credit,
      grade, year: beat.year, season: 'Fall',
      ...(retaking.current ? { retaken: true } : {}),
    })
    for (const f of beat.takeaways) collectFact(f)
    const after = loadSave()
    track('core_beat_complete', { id: beat.id, grade, retaken: retaking.current })
    track('gpa_updated', { grade, beat: beat.id })
    if (before && after) {
      for (const c of newlyCloseCords(before, after)) track('cord_progress', { cord: c.id, progress: c.progress })
    }
    setFinalScore(score)
    setPhase('result')
  }

  const startRetake = () => {
    retaking.current = true
    track('retake_used', { beat: beat.id })
    setPhase('retake')
  }

  if (!save) return null

  return (
    <div className="bt-veil">
      <div className={arm === 'plain' ? 'bt-plain' : 'bt-stage'}>
        {(phase === 'play' || phase === 'retake') && (arm === 'plain'
          ? <PlainForm beat={beat} checksOnly={phase === 'retake'} onDone={finish} />
          : <GamePlay beat={beat} checksOnly={phase === 'retake'} onDone={finish} />)}
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

// ---- the game arm: step-by-step, at the player's pace --------------------------------

function GamePlay({ beat, checksOnly, onDone }: {
  beat: CoreBeat
  checksOnly: boolean
  onDone: (answers: Answers) => void
}) {
  const steps: BeatStep[] = checksOnly
    ? checksOf(beat).map((check) => ({ kind: 'check' as const, check }))
    : beat.steps
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
          key={checkId(step.check)}
          check={step.check}
          onDone={(earned, tries, ms) => {
            accum.current[checkId(step.check)] = { earned, total: pointsOf(step.check), tries, latencyMs: ms }
            track('check_answered', { item: checkId(step.check), correct: earned === pointsOf(step.check), tries, latencyMs: ms })
            advance()
          }}
        />
      )}
    </>
  )
}

function CheckPlay({ check, onDone }: { check: CheckStep; onDone: (earned: number, tries: number, ms: number) => void }) {
  const t0 = useRef(Date.now())
  // choice/quiz: the first pick scores; a wrong pick teaches (hint + the truth revealed)
  const [picked, setPicked] = useState<number | null>(null)
  // sort: assign every item, confirm, wrong rows reveal their true bucket
  const [assigned, setAssigned] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState(false)

  if (check.kind === 'choice' || check.kind === 'quiz') {
    const options = check.kind === 'choice'
      ? check.options.map((o) => ({ text: o.text, correct: !!o.correct, reply: o.reply }))
      : check.item.choices.map((c, i) => ({ text: c, correct: i === check.item.correctIndex, reply: check.item.explanation ?? '' }))
    const prompt = check.kind === 'choice' ? check.prompt : check.item.prompt
    const correctIdx = options.findIndex((o) => o.correct)
    return (
      <div className="bt-check">
        <div className="bt-prompt">{prompt}</div>
        <div className="bt-options">
          {options.map((o, i) => (
            <button
              key={i}
              className={`bt-opt ${picked !== null && i === correctIdx ? 'bt-opt-true' : ''} ${picked === i && i !== correctIdx ? 'bt-opt-miss' : ''}`}
              disabled={picked !== null}
              onClick={() => setPicked(i)}
            >{o.text}</button>
          ))}
        </div>
        {picked !== null && (
          <>
            <div className="bt-reply">{options[picked].reply || (options[picked].correct ? 'Right.' : 'Hm. Not quite.')}</div>
            <button className="bt-go" onClick={() => onDone(options[picked].correct ? 1 : 0, 1, Date.now() - t0.current)}>
              Keep going
            </button>
          </>
        )}
      </div>
    )
  }

  // sort
  const allAssigned = check.items.every((it) => assigned[it.label])
  const earned = check.items.filter((it) => assigned[it.label] === it.bucket).length
  return (
    <div className="bt-check">
      <div className="bt-prompt">{check.prompt}</div>
      <div className="bt-sort">
        {check.items.map((it) => (
          <div className="bt-sortrow" key={it.label}>
            <span className={`bt-sortlabel ${revealed ? (assigned[it.label] === it.bucket ? 'bt-opt-true' : 'bt-opt-miss') : ''}`}>
              {it.label}{revealed && assigned[it.label] !== it.bucket && <em> · {it.bucket}</em>}
            </span>
            <span className="bt-buckets">
              {check.buckets.map((b) => (
                <button
                  key={b}
                  className={`bt-bucket ${assigned[it.label] === b ? 'bt-bucket-on' : ''}`}
                  disabled={revealed}
                  onClick={() => setAssigned((a) => ({ ...a, [it.label]: b }))}
                >{b}</button>
              ))}
            </span>
          </div>
        ))}
      </div>
      {!revealed
        ? <button className="bt-go" disabled={!allAssigned} onClick={() => setRevealed(true)}>That is my answer</button>
        : <button className="bt-go" onClick={() => onDone(earned, 1, Date.now() - t0.current)}>
          {earned === check.items.length ? 'All of them. Keep going' : 'Noted. Keep going'}
        </button>}
    </div>
  )
}

// ---- the plain arm (the AP Research control): same content, standard form ------------

function PlainForm({ beat, checksOnly, onDone }: { beat: CoreBeat; checksOnly?: boolean; onDone: (a: Answers) => void }) {
  const checks = checksOf(beat)
  const t0 = useRef(Date.now())
  const [picks, setPicks] = useState<Record<string, string>>({})

  const complete = checks.every((c) =>
    c.kind === 'sort' ? c.items.every((it) => picks[`${checkId(c)}:${it.label}`]) : picks[checkId(c)])

  const submit = () => {
    const out: Answers = {}
    const ms = Date.now() - t0.current
    for (const c of checks) {
      if (c.kind === 'sort') {
        const earned = c.items.filter((it) => picks[`${checkId(c)}:${it.label}`] === it.bucket).length
        out[checkId(c)] = { earned, total: c.items.length, tries: 1, latencyMs: ms }
      } else {
        const options = c.kind === 'choice'
          ? c.options.map((o) => ({ text: o.text, correct: !!o.correct }))
          : c.item.choices.map((t, i) => ({ text: t, correct: i === c.item.correctIndex }))
        const earned = options.find((o) => o.text === picks[checkId(c)])?.correct ? 1 : 0
        out[checkId(c)] = { earned, total: 1, tries: 1, latencyMs: ms }
      }
      track('check_answered', { item: checkId(c), correct: out[checkId(c)].earned === out[checkId(c)].total, tries: 1, latencyMs: ms })
    }
    onDone(out)
  }

  return (
    <div className="bt-plainform">
      <h2>{beat.title}</h2>
      {!checksOnly && beat.steps.map((s, i) => (s.kind === 'say' ? <p key={i}>{s.line.text}</p> : null))}
      {checks.map((c) => (
        <fieldset key={checkId(c)}>
          <legend>{c.kind === 'quiz' ? c.item.prompt : c.prompt}</legend>
          {c.kind === 'sort'
            ? c.items.map((it) => (
              <label key={it.label}>
                {it.label}{' '}
                <select value={picks[`${checkId(c)}:${it.label}`] ?? ''} onChange={(e) => setPicks((p) => ({ ...p, [`${checkId(c)}:${it.label}`]: e.target.value }))}>
                  <option value="" disabled>choose</option>
                  {c.buckets.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </label>
            ))
            : (c.kind === 'choice' ? c.options.map((o) => o.text) : c.item.choices).map((text) => (
              <label key={text}>
                <input
                  type="radio" name={checkId(c)} checked={picks[checkId(c)] === text}
                  onChange={() => setPicks((p) => ({ ...p, [checkId(c)]: text }))}
                /> {text}
              </label>
            ))}
        </fieldset>
      ))}
      <button disabled={!complete} onClick={submit}>Submit</button>
    </div>
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
          const f = FACTS.find((x) => x.id === id)
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
          const f = FACTS.find((x) => x.id === id)
          return f ? <div className="bt-fact" key={id}>{f.text}</div> : null
        })}
      </div>
      <button className="bt-go" onClick={onRetake}>Run it back</button>
      <button className="bt-go" onClick={onBack}>Not yet</button>
    </div>
  )
}
