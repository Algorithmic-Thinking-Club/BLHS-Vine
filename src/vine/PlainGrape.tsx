import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GrapeComponentProps } from './contract'

type Phase = 'clips' | 'quiz' | 'done'

// The AP Research control: same content + same logging as StandardGrape, with the game-ness
// stripped out (no character, no dialogue, no rewards, plain layout). Randomizing players
// between this and StandardGrape isolates the "game" variable while holding content constant.
export function PlainGrape({ manifest, content, log, complete, exit }: GrapeComponentProps) {
  const clips = content.clips ?? []
  const quiz = content.quiz ?? []
  const [phase, setPhase] = useState<Phase>(clips.length ? 'clips' : quiz.length ? 'quiz' : 'done')
  const [step, setStep] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const shownAt = useRef(Date.now())
  const enteredAt = useRef(Date.now())

  useEffect(() => {
    log({ type: 'grape_enter', grapeId: manifest.id, at: Date.now() })
  }, [log, manifest.id])

  function nextClip() {
    const clip = clips[step]
    log({ type: 'clip_start', grapeId: manifest.id, at: Date.now(), clipId: clip.id })
    log({ type: 'clip_complete', grapeId: manifest.id, at: Date.now(), clipId: clip.id, watchedSeconds: clip.durationSeconds ?? 0, skipped: false })
    if (step + 1 < clips.length) setStep(step + 1)
    else {
      setPhase(quiz.length ? 'quiz' : 'done')
      setStep(0)
      shownAt.current = Date.now()
    }
  }

  function answer(choice: number) {
    if (picked !== null) return
    const item = quiz[step]
    const ok = choice === item.correctIndex
    log({ type: 'quiz_item_answered', grapeId: manifest.id, at: Date.now(), itemId: item.id, chosenIndex: choice, correct: ok, responseMs: Date.now() - shownAt.current, attempt: 1 })
    if (ok) setCorrect((n) => n + 1)
    setPicked(choice)
  }

  function nextQuiz() {
    if (step + 1 < quiz.length) {
      setStep(step + 1)
      setPicked(null)
      shownAt.current = Date.now()
    } else {
      log({ type: 'quiz_submitted', grapeId: manifest.id, at: Date.now(), scorePercent: Math.round((correct / quiz.length) * 100), itemCount: quiz.length })
      setPhase('done')
    }
  }

  function finish() {
    const scorePercent = quiz.length ? Math.round((correct / quiz.length) * 100) : undefined
    log({ type: 'grape_completed', grapeId: manifest.id, at: Date.now(), scorePercent })
    log({ type: 'grape_exit', grapeId: manifest.id, at: Date.now(), completed: true, dwellMs: Date.now() - enteredAt.current })
    complete({ grapeId: manifest.id, quizScorePercent: scorePercent, clipsViewed: clips.map((cl) => cl.id) })
    exit()
  }

  const plainBtn: CSSProperties = { padding: '9px 16px', background: '#222', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 14 }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#f3f3f3', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'auto' }}>
      <div style={{ maxWidth: 620, width: '100%', margin: '40px 16px', background: '#fff', border: '1px solid #ccc', borderRadius: 6, padding: 24, fontFamily: 'system-ui, Arial, sans-serif', color: '#111' }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18 }}>{manifest.title}</h2>

        {phase === 'clips' && (
          <div>
            <p style={{ margin: '0 0 12px' }}>{clips[step].caption ?? 'Watch the clip.'}</p>
            <div style={{ aspectRatio: '16 / 9', background: '#ddd', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 13, marginBottom: 14 }}>clip {step + 1} / {clips.length}</div>
            <button onClick={nextClip} style={plainBtn}>Watched</button>
          </div>
        )}

        {phase === 'quiz' && (
          <div>
            <p style={{ margin: '0 0 4px', color: '#666', fontSize: 13 }}>Question {step + 1} of {quiz.length}</p>
            <p style={{ margin: '0 0 14px', fontSize: 16 }}>{quiz[step].prompt}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {quiz[step].choices.map((ch, i) => {
                const reveal = picked !== null
                const ok = i === quiz[step].correctIndex
                const color = reveal && ok ? '#0a7' : reveal && i === picked ? '#c33' : '#111'
                return (
                  <button key={i} onClick={() => answer(i)} disabled={reveal} style={{ textAlign: 'left', padding: '10px 12px', border: '1px solid #bbb', borderRadius: 4, background: '#fafafa', cursor: reveal ? 'default' : 'pointer', color, fontSize: 14 }}>
                    {ch}
                  </button>
                )
              })}
            </div>
            {picked !== null && (
              <div style={{ marginTop: 14 }}>
                {quiz[step].explanation && <p style={{ color: '#555', fontSize: 13, margin: '0 0 10px' }}>{quiz[step].explanation}</p>}
                <button onClick={nextQuiz} style={plainBtn}>{step + 1 < quiz.length ? 'Next' : 'See score'}</button>
              </div>
            )}
          </div>
        )}

        {phase === 'done' && (
          <div>
            <p style={{ fontSize: 16, margin: '0 0 14px' }}>{quiz.length ? `You scored ${Math.round((correct / quiz.length) * 100)}%.` : 'Done.'}</p>
            <button onClick={finish} style={plainBtn}>Continue</button>
          </div>
        )}
      </div>
    </div>
  )
}
