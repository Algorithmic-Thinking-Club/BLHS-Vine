import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { GrapeComponentProps } from './contract'

type Phase = 'intro' | 'clips' | 'quiz' | 'outro'

export function StandardGrape({ manifest, content, log, complete, exit, theme }: GrapeComponentProps) {
  const intro = content.intro ?? []
  const clips = content.clips ?? []
  const quiz = content.quiz ?? []
  const outro = content.outro ?? []

  const firstPhase: Phase = intro.length ? 'intro' : clips.length ? 'clips' : quiz.length ? 'quiz' : 'outro'
  const [phase, setPhase] = useState<Phase>(firstPhase)
  const [step, setStep] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const shownAt = useRef(Date.now())
  const enteredAt = useRef(Date.now())

  useEffect(() => {
    log({ type: 'grape_enter', grapeId: manifest.id, at: Date.now() })
  }, [log, manifest.id])

  function go(next: Phase) {
    setPhase(next)
    setStep(0)
    setPicked(null)
    shownAt.current = Date.now()
  }

  function advanceIntro() {
    log({ type: 'dialogue_advanced', grapeId: manifest.id, at: Date.now(), index: step })
    if (step + 1 < intro.length) setStep(step + 1)
    else go(clips.length ? 'clips' : quiz.length ? 'quiz' : 'outro')
  }

  function watchClip() {
    const clip = clips[step]
    log({ type: 'clip_start', grapeId: manifest.id, at: Date.now(), clipId: clip.id })
    log({ type: 'clip_complete', grapeId: manifest.id, at: Date.now(), clipId: clip.id, watchedSeconds: clip.durationSeconds ?? 0, skipped: false })
    if (step + 1 < clips.length) {
      setStep(step + 1)
      shownAt.current = Date.now()
    } else go(quiz.length ? 'quiz' : 'outro')
  }

  function answer(choice: number) {
    if (picked !== null) return
    const item = quiz[step]
    const correct = choice === item.correctIndex
    log({ type: 'quiz_item_answered', grapeId: manifest.id, at: Date.now(), itemId: item.id, chosenIndex: choice, correct, responseMs: Date.now() - shownAt.current, attempt: 1 })
    if (correct) setCorrectCount((c) => c + 1)
    setPicked(choice)
  }

  function nextQuiz() {
    if (step + 1 < quiz.length) {
      setStep(step + 1)
      setPicked(null)
      shownAt.current = Date.now()
    } else {
      const scorePercent = Math.round((correctCount / quiz.length) * 100)
      log({ type: 'quiz_submitted', grapeId: manifest.id, at: Date.now(), scorePercent, itemCount: quiz.length })
      go('outro')
    }
  }

  function finish() {
    const scorePercent = quiz.length ? Math.round((correctCount / quiz.length) * 100) : undefined
    log({ type: 'grape_completed', grapeId: manifest.id, at: Date.now(), scorePercent })
    log({ type: 'grape_exit', grapeId: manifest.id, at: Date.now(), completed: true, dwellMs: Date.now() - enteredAt.current })
    complete({ grapeId: manifest.id, quizScorePercent: scorePercent, clipsViewed: clips.map((c) => c.id) })
    exit()
  }

  const c = theme.colors
  const card: CSSProperties = {
    maxWidth: 560,
    width: '100%',
    background: c.surface,
    border: `1px solid ${c.line}`,
    borderRadius: 16,
    padding: 28,
    color: c.text,
    fontFamily: theme.fonts.body,
  }
  const kicker: CSSProperties = {
    fontFamily: theme.fonts.mono,
    fontSize: 11,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: c.accent,
    margin: '0 0 10px',
  }
  const btn: CSSProperties = {
    background: c.accent,
    color: c.ink,
    border: 'none',
    borderRadius: 9,
    padding: '10px 18px',
    fontFamily: theme.fonts.body,
    fontWeight: 600,
    cursor: 'pointer',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(8,10,12,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={card}>
        <p style={kicker}>{manifest.title}</p>

        {phase === 'intro' && (
          <div>
            <p style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: c.textDim, margin: '0 0 4px' }}>{intro[step].speaker}</p>
            <p style={{ fontSize: 18, lineHeight: 1.5, margin: '0 0 22px' }}>{intro[step].text}</p>
            <button style={btn} onClick={advanceIntro}>Continue</button>
          </div>
        )}

        {phase === 'clips' && (
          <div>
            <p style={{ fontSize: 16, margin: '0 0 6px' }}>{clips[step].caption ?? 'Watch the clip'}</p>
            <div style={{ aspectRatio: '16 / 9', background: c.raised, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: c.textDim, fontFamily: theme.fonts.mono, fontSize: 12, margin: '0 0 18px' }}>
              clip {step + 1} of {clips.length}
            </div>
            <button style={btn} onClick={watchClip}>Done watching</button>
          </div>
        )}

        {phase === 'quiz' && (
          <div>
            <p style={{ fontFamily: theme.fonts.mono, fontSize: 11, color: c.textDim, margin: '0 0 8px' }}>question {step + 1} of {quiz.length}</p>
            <p style={{ fontSize: 18, lineHeight: 1.45, margin: '0 0 18px' }}>{quiz[step].prompt}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {quiz[step].choices.map((choice, i) => {
                const isCorrect = i === quiz[step].correctIndex
                const reveal = picked !== null
                const bg = reveal && isCorrect ? '#1f6f4a' : reveal && i === picked ? '#7c2f2f' : c.raised
                return (
                  <button key={i} onClick={() => answer(i)} disabled={reveal} style={{ textAlign: 'left', background: bg, color: c.text, border: `1px solid ${c.line}`, borderRadius: 9, padding: '12px 14px', cursor: reveal ? 'default' : 'pointer', fontFamily: theme.fonts.body, fontSize: 15 }}>
                    {choice}
                  </button>
                )
              })}
            </div>
            {picked !== null && (
              <div style={{ marginTop: 18 }}>
                {quiz[step].explanation && <p style={{ color: c.textDim, fontSize: 14, margin: '0 0 14px' }}>{quiz[step].explanation}</p>}
                <button style={btn} onClick={nextQuiz}>{step + 1 < quiz.length ? 'Next' : 'Finish'}</button>
              </div>
            )}
          </div>
        )}

        {phase === 'outro' && (
          <div>
            {outro.length > 0 ? (
              <p style={{ fontSize: 18, lineHeight: 1.5, margin: '0 0 22px' }}>{outro[0].text}</p>
            ) : (
              <p style={{ fontSize: 18, margin: '0 0 22px' }}>Nice work. You finished {manifest.title}.</p>
            )}
            <button style={btn} onClick={finish}>Back to campus</button>
          </div>
        )}
      </div>
    </div>
  )
}
