import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GrapeComponentProps, CheckStep, SceneLine } from './contract'

// The grape-as-SCENE runtime: plays an authored `encounter` as a cinematic RPG beat sequence
// (letterboxed, bottom dialogue box + portrait, typewriter), NOT a centered slideshow. Beats:
// intro dialogue → media → cutscene(say) → woven check (consequential choice / quiz) → outro → reward.
// Wired to the vine: logs events, scores the checks, and reports the result via services.complete().
// NOTE: styling here is intentionally placeholder-clean — the warm bespoke pixel UI kit swaps in once
// approved, and this same beat engine will be hosted inside the in-world 305 room scene. Logic is final.

type Phase = 'intro' | 'media' | 'cutscene' | 'check' | 'outro' | 'reward'

function useTypewriter(text: string, speed = 22) {
  const [n, setN] = useState(0)
  useEffect(() => { setN(0) }, [text])
  useEffect(() => {
    if (n >= text.length) return
    const t = setTimeout(() => setN((x) => x + 1), speed)
    return () => clearTimeout(t)
  }, [n, text, speed])
  return { shown: text.slice(0, n), done: n >= text.length, finish: () => setN(text.length) }
}

export function EncounterScene({ manifest, content, log, complete, exit }: GrapeComponentProps) {
  const enc = content.encounter!
  const order = useMemo<Phase[]>(() => {
    const o: Phase[] = []
    if (enc.intro?.length) o.push('intro')
    if (enc.media) o.push('media')
    if (enc.cutscene?.length) o.push('cutscene')
    o.push('check')
    if (enc.outro?.length) o.push('outro')
    o.push('reward')
    return o
  }, [enc])

  const [pi, setPi] = useState(0)
  const phase = order[pi]
  const next = useCallback(() => setPi((i) => Math.min(order.length - 1, i + 1)), [order.length])

  // score across all checks
  const scored = useRef({ correct: 0, total: 0 })
  useEffect(() => { log({ type: 'grape_enter', grapeId: manifest.id, at: Date.now() }) }, [log, manifest.id])

  // ----- dialogue beats (intro / cutscene-say / outro) -----
  const lines: SceneLine[] = useMemo(() => {
    if (phase === 'intro') return enc.intro ?? []
    if (phase === 'outro') return enc.outro ?? []
    if (phase === 'cutscene') return (enc.cutscene ?? []).filter((s) => s.kind === 'say').map((s) => (s as { line: SceneLine }).line)
    return []
  }, [phase, enc])
  const [li, setLi] = useState(0)
  useEffect(() => { setLi(0) }, [phase])
  const line = lines[li]
  const tw = useTypewriter(line?.text ?? '')
  const advanceLine = () => {
    if (!tw.done) { tw.finish(); return }
    if (li < lines.length - 1) setLi(li + 1)
    else next()
  }

  // ----- the woven check -----
  const [step, setStep] = useState(0)
  const checks = enc.check
  const cur: CheckStep | undefined = checks[step]
  const [picked, setPicked] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const answer = (idx: number) => {
    if (picked !== null) return
    setPicked(idx)
    let ok = false, replyText = ''
    if (cur?.kind === 'choice') { ok = !!cur.options[idx].correct; replyText = cur.options[idx].reply }
    else if (cur?.kind === 'quiz') { ok = idx === cur.item.correctIndex; replyText = cur.item.explanation ?? (ok ? 'Correct.' : 'Not quite.') }
    setFeedback({ ok, text: replyText })
    log({ type: 'quiz_item_answered', grapeId: manifest.id, itemId: cur?.kind === 'choice' ? cur.id : cur?.kind === 'quiz' ? cur.item.id : 'c', chosenIndex: idx, correct: ok, responseMs: 0, attempt: 1, at: Date.now() })
    if (ok) scored.current.correct++
    scored.current.total++  // count every attempt's question once
  }
  const continueCheck = () => {
    // soft progression: a wrong answer lets you retry the SAME step (with the hint already shown)
    if (feedback && !feedback.ok && cur?.kind === 'choice') { setPicked(null); setFeedback(null); scored.current.total--; return }
    setPicked(null); setFeedback(null)
    if (step < checks.length - 1) setStep(step + 1)
    else next()
  }

  // ----- reward / finish -----
  const finished = useRef(false)
  useEffect(() => {
    if (phase !== 'reward' || finished.current) return
    finished.current = true
    const pct = scored.current.total ? Math.round((scored.current.correct / scored.current.total) * 100) : 100
    log({ type: 'grape_completed', grapeId: manifest.id, scorePercent: pct, at: Date.now() })
    complete({ grapeId: manifest.id, quizScorePercent: pct, raw: { encounter: true } })
  }, [phase, complete, log, manifest.id])
  const handbook = enc.reward?.handbookEntryId ? content.handbook?.find((h) => h.id === enc.reward!.handbookEntryId) : undefined

  // keyboard: space/enter advances dialogue
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.key === ' ' || e.key === 'Enter') && (phase === 'intro' || phase === 'outro' || phase === 'cutscene')) { e.preventDefault(); advanceLine() } }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  })

  const portrait = line?.portrait ?? enc.npc.portrait

  return (
    <div style={S.scrim}>
      {/* in-world ROOM STAGE — the encounter plays inside the rendered classroom with the characters in
          it, not letterboxed over nothing. Stub art for now (CSS room + Thor sprite for both, Ash recolored);
          the real measured 305 lab + proper Ash/student sprites swap straight in. */}
      <div style={S.room}>
        <div style={S.board}>{enc.room ? `Room ${enc.room} · Computer Lab` : 'Computer Lab'}</div>
        <div style={{ ...S.desk, left: '22%' }} /><div style={{ ...S.mon, left: '23%' }} />
        <div style={{ ...S.desk, left: '50%' }} /><div style={{ ...S.mon, left: '51%' }} />
        <div style={{ ...S.desk, left: '78%' }} /><div style={{ ...S.mon, left: '79%' }} />
        <img src="/art/characters/thor/south.png" alt="" style={S.ash} />
        <img src="/art/characters/thor/south.png" alt="" style={S.thor} />
      </div>
      <div style={S.barTop} /><div style={S.barBot} />

      {(phase === 'intro' || phase === 'outro' || phase === 'cutscene') && line && (
        <div style={S.dlgWrap} onClick={advanceLine}>
          {portrait && <img src={portrait} alt="" style={S.portrait} />}
          <div style={S.dlg}>
            <div style={S.name}>{line.speaker}</div>
            <div style={S.text}>{tw.shown}</div>
            <div style={S.hint}>{tw.done ? '▶ click or space' : ''}</div>
          </div>
        </div>
      )}

      {phase === 'media' && enc.media && (
        <div style={S.media}>
          <div style={S.mediaTitle}>{enc.media.caption ?? 'Watch'}</div>
          <div style={S.mediaFrame}>
            {enc.media.kind === 'youtube' && enc.media.src
              ? <iframe style={S.iframe} src={enc.media.src} title="clip" allow="autoplay; encrypted-media" />
              : <div style={S.mediaPlaceholder}>video placeholder — ATC records the real clip here</div>}
          </div>
          <button style={S.btn} onClick={next}>Continue ▶</button>
        </div>
      )}

      {phase === 'check' && cur && (cur.kind === 'choice' || cur.kind === 'quiz') && (
        <div style={S.dlgWrap}>
          {portrait && <img src={portrait} alt="" style={S.portrait} />}
          <div style={S.dlg}>
            <div style={S.text}>{cur.kind === 'choice' ? cur.prompt : cur.item.prompt}</div>
            {!feedback && (
              <div style={S.choices}>
                {(cur.kind === 'choice' ? cur.options.map((o) => o.text) : cur.item.choices).map((t, i) => (
                  <button key={i} style={S.choice} onClick={() => answer(i)}>{t}</button>
                ))}
              </div>
            )}
            {feedback && (
              <div>
                <div style={{ ...S.feedback, color: feedback.ok ? '#7fe0a8' : '#f4b66a' }}>{feedback.ok ? '✓ ' : '… '}{feedback.text}</div>
                <button style={S.btn} onClick={continueCheck}>{feedback.ok ? 'Continue ▶' : 'Try again'}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {phase === 'reward' && (
        <div style={S.reward}>
          <div style={S.rewardCard}>
            <div style={S.rewardKicker}>Handbook entry unlocked</div>
            <div style={S.rewardTitle}>{handbook?.heading ?? manifest.title}</div>
            {handbook && <div style={S.rewardBody}>{handbook.body}</div>}
            <div style={S.rewardChip}>★ {manifest.title} learned</div>
            <button style={S.btn} onClick={exit}>Back to campus</button>
          </div>
        </div>
      )}
    </div>
  )
}

const S: Record<string, React.CSSProperties> = {
  scrim: { position: 'fixed', inset: 0, zIndex: 80, background: '#2a2620', overflow: 'hidden' },
  room: { position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, #d9d0bb 0%, #d0c7b1 54%, #9c927b 54%, #7c725c 100%)', overflow: 'hidden' },
  board: { position: 'absolute', top: '13%', left: '32%', width: '36%', height: '19%', background: '#f3f1e8', border: '3px solid #b7ae98', borderRadius: 4, color: '#857c61', font: '700 12px ui-sans-serif, system-ui', padding: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' },
  desk: { position: 'absolute', top: '60%', width: 86, height: 30, background: '#8a7c63', borderRadius: 4, transform: 'translateX(-50%)', boxShadow: '0 6px 10px rgba(0,0,0,0.18)' },
  mon: { position: 'absolute', top: '52%', width: 34, height: 27, background: '#222a30', border: '2px solid #4a525a', borderRadius: 3, transform: 'translateX(-50%)' },
  thor: { position: 'absolute', bottom: '27vh', left: '40%', height: 128, imageRendering: 'pixelated', transform: 'translateX(-50%)', filter: 'drop-shadow(0 6px 6px rgba(0,0,0,0.32))' },
  ash: { position: 'absolute', bottom: '30vh', left: '60%', height: 128, imageRendering: 'pixelated', transform: 'translateX(-50%) scaleX(-1)', filter: 'hue-rotate(150deg) saturate(1.3) drop-shadow(0 6px 6px rgba(0,0,0,0.32))' },
  barTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '12vh', background: 'linear-gradient(to bottom, #0a0c10, rgba(10,12,16,0))' },
  barBot: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '8vh', background: 'linear-gradient(to top, #0a0c10, rgba(10,12,16,0))' },
  dlgWrap: { position: 'absolute', left: '6vw', right: '6vw', bottom: '15vh', display: 'flex', gap: 14, alignItems: 'flex-end', cursor: 'pointer' },
  portrait: { width: 96, height: 96, borderRadius: 10, objectFit: 'cover', border: '2px solid rgba(255,255,255,0.18)', imageRendering: 'pixelated', background: '#1a1d22' },
  dlg: { flex: 1, background: 'rgba(20,22,27,0.96)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: '16px 18px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' },
  name: { color: '#4fd1c5', fontWeight: 800, fontSize: 14, marginBottom: 4, letterSpacing: 0.3 },
  text: { color: '#eef2ec', fontSize: 18, lineHeight: 1.5, minHeight: 27 },
  hint: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 8, textAlign: 'right' },
  choices: { display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 },
  choice: { textAlign: 'left', padding: '11px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.05)', color: '#eef2ec', font: '600 15px ui-sans-serif, system-ui', cursor: 'pointer' },
  feedback: { fontSize: 16, lineHeight: 1.45, margin: '6px 0 12px' },
  btn: { padding: '10px 18px', borderRadius: 10, border: 'none', background: '#4fd1c5', color: '#0b1410', font: '700 14px ui-sans-serif, system-ui', cursor: 'pointer' },
  media: { position: 'absolute', inset: '14vh 8vw', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 },
  mediaTitle: { color: '#eef2ec', fontWeight: 800, fontSize: 18 },
  mediaFrame: { width: '100%', maxWidth: 760, aspectRatio: '16/9', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.16)', background: '#0e1116', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  iframe: { width: '100%', height: '100%', border: 'none' },
  mediaPlaceholder: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
  reward: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  rewardCard: { width: 'min(460px,86vw)', background: 'rgba(20,22,27,0.98)', border: '1px solid rgba(79,209,197,0.4)', borderRadius: 16, padding: 28, textAlign: 'center', boxShadow: '0 18px 50px rgba(0,0,0,0.6)' },
  rewardKicker: { color: '#4fd1c5', fontWeight: 800, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
  rewardTitle: { color: '#fff', fontWeight: 800, fontSize: 24, margin: '6px 0 10px' },
  rewardBody: { color: 'rgba(238,242,236,0.8)', fontSize: 14, lineHeight: 1.5, marginBottom: 14 },
  rewardChip: { display: 'inline-block', padding: '5px 12px', borderRadius: 20, background: 'rgba(79,209,197,0.15)', color: '#4fd1c5', fontWeight: 700, fontSize: 13, marginBottom: 18 },
}
