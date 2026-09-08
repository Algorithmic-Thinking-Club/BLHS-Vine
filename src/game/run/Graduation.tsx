import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { hasFlag, loadSave, setFlag, type FrozenRun, type SaveGame } from '../save'
import { cordsOf, PASSING_GRADE, ranksOf, type CordProgress } from '../progress'
import {
  diplomaFileName, diplomaOf, diplomaRows, DIPLOMA_COPY, renderDiploma, sealRun,
  standingsOf, artifactText, type Standing,
} from './diploma'
import { gpaThrough } from './yearbook-page'
import { rankTrackOf } from '../roster/roster'
import { track } from '../telemetry'
import { announce, usePanel } from '../ui/a11y'
import { Gauge, Glyph, Plank, useKitReady } from '../ui/controls'
import { note, saved } from '../ui/feedback'
import { AdvanceCue } from './YearStart'
import './run.css'

/* the graduation ceremony as a run of cards: the stage, the cords, the board, the diploma */

type Stage = 'processional' | 'honours' | 'board' | 'diploma'

/* one line saying where a cord came from, either a moment or an accumulation */
type Moment = { kind: 'event' | 'accumulation'; line: string }

function earnedMoment(cordId: string, s: SaveGame): Moment {
  const nth = (tag: string, n: number): string => {
    const hits = s.ledger.filter((e) => e.tags?.includes(tag) && e.grade >= PASSING_GRADE)
    const hit = hits[n - 1]
    return hit ? `${hit.title}, year ${hit.year}` : 'a class on your transcript'
  }
  switch (cordId) {
    case 'highest-honors':
    case 'high-honors':
      return { kind: 'accumulation', line: 'four years of the transcript, all of it' }
    case 'key-club':
      return { kind: 'accumulation', line: 'two years of showing up for other people' }
    case 'career-readiness':
      return { kind: 'event', line: `sealed by ${nth('cte', 2)}` }
    case 'ap-honors':
      return { kind: 'event', line: `the fifth: ${nth('ap', 5)}` }
    case 'ap-capstone':
      return { kind: 'event', line: `Seminar, Research, and the sixth: ${nth('ap', 6)}` }
    case 'seal-biliteracy':
      return { kind: 'event', line: `the fourth credit: ${nth('lang', 4)}` }
    default:
      return { kind: 'event', line: 'earned from what you did these four years' }
  }
}

/** the per-year means an accumulation cord actually stands on (§14.16, §14.3) */
function gpaSeries(s: SaveGame): { year: number; gpa: number }[] {
  const out: { year: number; gpa: number }[] = []
  for (let y = 1; y <= Math.min(4, s.year); y++) {
    const g = gpaThrough(s, y)
    if (g !== null) out.push({ year: y, gpa: g })
  }
  return out
}

/* one card in the ceremony: a clickable region that advances on click or key */
function TapCard({
  label, onAdvance, cue, className = '', children,
}: {
  label: string
  onAdvance: () => void
  cue: string
  className?: string
  children: ReactNode
}) {
  const el = useRef<HTMLDivElement>(null)
  /* focus follows the card across a stage change, so a keyboard player keeps the ring */
  useEffect(() => { el.current?.focus() }, [])
  return (
    <div
      ref={el}
      className={`gr-card gr-tap kit-surface-panel ${className}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      onClick={onAdvance}
    >
      {children}
      <AdvanceCue words={cue} className="gr-cue" />
    </div>
  )
}

export function Graduation({ onClose }: { onClose: () => void }) {
  const s = loadSave()
  const [stage, setStage] = useState<Stage>('processional')
  const [idx, setIdx] = useState(0)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const panel = usePanel({ label: 'Graduation', closeOnEscape: false })
  useKitReady()

  /* the transcript is frozen once, on graduation, so the printed code never moves */
  const [sealed, setSealed] = useState<FrozenRun | null>(() => {
    const cur = loadSave()
    return cur ? diplomaOf(cur) : null
  })
  useEffect(() => {
    const cur = loadSave()
    if (!cur?.graduated) return
    if (cur.diploma) { setSealed(cur.diploma); return }
    /* the run-complete event fires when the run is sealed, not on a later press */
    const rec = sealRun(cur)
    setSealed(rec)
    track('run_complete', { transcript: rec.transcript, code: rec.code })
  }, [])

  /* space and enter advance, on the stages that are a single tap */
  const advanceRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return
      const go = advanceRef.current
      if (!go) return
      e.preventDefault()
      go()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const all = useMemo(() => (s ? cordsOf(s) : []), [s])
  const earned = useMemo(() => all.filter((c) => c.earned), [all])
  /* the board is every cord not already on the cape, minus the GPA band you beat */
  const board = useMemo(() => {
    const gotHighest = all.some((c) => c.id === 'highest-honors' && c.earned)
    return all.filter((c) => !c.earned && !(gotHighest && c.id === 'high-honors'))
  }, [all])
  const standings = useMemo(() => (s && sealed ? standingsOf(s, sealed) : []), [s, sealed])
  const series = useMemo(() => (s ? gpaSeries(s) : []), [s])
  const keyYears = useMemo(() => (s ? ranksOf(s)[rankTrackOf('key-club') ?? 'keyclub'] ?? 0 : 0), [s])

  /* WHEN NO CORD WAS EARNED THE STAGE IS DIFFERENTLY POPULATED, NEVER SKIPPED
   * (§14.19). A member's island inherits the same rule: a result is always
   * populated. `standingsOf` always returns at least one entry. */
  const honours = useMemo<(CordProgress | Standing)[]>(
    () => (earned.length ? earned : standings), [earned, standings])
  const here: CordProgress | Standing | undefined = honours[Math.min(idx, Math.max(0, honours.length - 1))]

  /* the card's sentences are read out loud, so a screen reader gets the criterion */
  useEffect(() => {
    if (!s || !here) return
    if (stage !== 'honours') return
    announce('rule' in here
      ? `${here.name}. ${here.rule}. ${earnedMoment(here.id, s).line}.`
      : `${here.name}. ${here.count}. ${here.what}`)
  }, [stage, here, s])

  if (!s || !sealed) return null

  const code = sealed.code
  const rows = diplomaRows(s, sealed)
  const isCord = (h: CordProgress | Standing): h is CordProgress => 'rule' in h

  const nextHonour = () => {
    if (idx + 1 < honours.length) setIdx(idx + 1)
    else setStage('board')
  }
  /* set during render rather than in an effect, because it is a ref and not
   * state: the key that advances has to be the one this frame's card would use. */
  advanceRef.current = stage === 'processional'
    ? () => setStage('honours')
    : stage === 'honours' ? nextHonour : null

  const savePng = async () => {
    setSaving(true)
    try {
      const cv = canvasRef.current ?? document.createElement('canvas')
      /* the drawn diploma waits for the game's own faces before it paints */
      await renderDiploma(cv, s, sealed)
      const a = document.createElement('a')
      a.download = diplomaFileName(s, sealed)
      a.href = cv.toDataURL('image/png')
      a.click()
      track('artifact_exported', { code, form: 'png' })
      saved('Your diploma is drawn and downloading')
    } finally {
      setSaving(false)
    }
  }

  /* the same diploma as plain text on the clipboard, for a machine that cannot download */
  const copyArtifact = () => {
    const text = artifactText(s, sealed)
    void navigator.clipboard?.writeText(text)
      .then(() => { setCopied(true); saved('The whole thing is on your clipboard') })
      .catch(() => note('This Chromebook would not let the page copy', 'Read the code out to your teacher instead. It is the same code on their roster.'))
    track('artifact_exported', { code, form: 'text' })
  }

  const finish = () => {
    if (!hasFlag('gear2')) { track('gear2_unlocked'); setFlag('gear2') }
    onClose()
  }

  return (
    <div className="gr-veil">
      <div className="gr-stage" {...panel}>
        {stage === 'processional' && (
          <TapCard
            label="Walk the stage"
            cue="walk the stage"
            onAdvance={() => setStage('honours')}
          >
            <h2 className="gr-title">Graduation</h2>
            {/* the processional is written in words, with no art behind it yet */}
            <p className="gr-line">
              Graduation day. Everyone you met these four years is in the crowd.
            </p>
            <p className="gr-line">Thor walks the stage in teal. The stole reads BONNEY LAKE.</p>
          </TapCard>
        )}

        {stage === 'honours' && here && (
          <TapCard
            label={isCord(here)
              ? `${here.name}. Next card, ${idx + 1} of ${honours.length}`
              : `${here.name}. Next card, ${idx + 1} of ${honours.length}`}
            cue={idx + 1 < honours.length ? `${idx + 1} of ${honours.length}` : 'see the cords you missed'}
            className={isCord(here) ? 'gr-cordcard' : 'gr-standcard'}
            onAdvance={nextHonour}
          >
            {isCord(here) ? (
              <>
                <h2 className="gr-cordname">{here.name}</h2>
                <p className="gr-cordcolors">{here.colors}</p>

                {/* the school's own criterion, with what the game counted beside it */}
                <p className="gr-ruleline">
                  <span className="gr-rulelabel">Bonney Lake gives it for</span>
                  <span className="gr-rule">{here.rule}</span>
                </p>
                {here.model && (
                  <p className="gr-modelline">
                    <span className="gr-rulelabel">what this game counted</span>
                    <span className="gr-model">{here.model}</span>
                  </p>
                )}

                <p className="gr-moment">{earnedMoment(here.id, s).line}</p>

                {/* AN ACCUMULATION CORD SHOWS THE ACCUMULATION (§14.16) rather
                    than pointing at one row that did not produce it. */}
                {earnedMoment(here.id, s).kind === 'accumulation' && (
                  here.id === 'key-club'
                    ? <p className="gr-series">{keyYears} {keyYears === 1 ? 'year' : 'years'} in Key Club</p>
                    : (
                      <ul className="gr-series" aria-label="Grade point average, year by year">
                        {series.map((p) => (
                          <li key={p.year}><span className="gr-seriesyear">Year {p.year}</span><b>{p.gpa.toFixed(2)}</b></li>
                        ))}
                      </ul>
                    )
                )}

                <p className="gr-source">{here.source}</p>
              </>
            ) : (
              <>
                {/* A NAMED ACCOMPLISHMENT, IN THE SAME CARD SHAPE AND NEVER
                    DRESSED AS A CORD (Q14.19.a). No colours, no criterion, no
                    gold: what it is, what it took, and the count it stands on. */}
                <h2 className="gr-standname">{here.name}</h2>
                <p className="gr-standcount">{here.count}</p>
                <p className="gr-line">{here.what}</p>
              </>
            )}
          </TapCard>
        )}

        {stage === 'board' && (
          /* the board is a plain region with one real button, not a tap card */
          <div className="gr-card gr-boardcard kit-surface-panel">
            <h2 className="gr-title">{earned.length ? 'The cords you did not earn' : 'The cords you could earn next time'}</h2>
            {board.length === 0 ? (
              <p className="gr-line">Every cord this school gives is on your cape. Nobody does that.</p>
            ) : (
              <>
                <p className="gr-line gr-dim">
                  Everything Bonney Lake gives that is not on your cape, and what each one takes.
                </p>
                <ul className="gr-boardlist">
                  {board.map((c) => (
                    <li className="gr-boardrow" key={c.id}>
                      <span className="gr-boardhead">
                        <span className="gr-boardname">{c.name}</span>
                        <span className="gr-boarddetail">
                          {/* one sentence each for unpublished, approached and untouched */}
                          {!c.published ? 'criteria not published'
                            : c.progress > 0 ? c.detail
                              : 'you never went near this one'}
                        </span>
                      </span>
                      {c.published && <Gauge value={c.progress} label={`${c.name}, ${c.detail}`} />}
                      <span className="gr-boardrule">{c.rule}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="gr-acts">
              <Plank size="lg" onClick={() => setStage('diploma')}>See your diploma</Plank>
            </div>
          </div>
        )}

        {stage === 'diploma' && (
          <div className="gr-card gr-diploma kit-surface-panel">
            <span className="gr-crest" aria-hidden="true" />
            <h2 className="gr-dip-school">{DIPLOMA_COPY.school}</h2>
            <p className="gr-dip-sub">{DIPLOMA_COPY.certifies}</p>
            <p className="gr-dip-name">{s.handle || DIPLOMA_COPY.unnamed}</p>
            <p className="gr-dip-sub">{DIPLOMA_COPY.completed}</p>

            {/* the card, the png and the pasted text read the same rows in the same order */}
            <dl className="gr-dip-grid">
              {rows.map((r) => (
                <div className="gr-dip-pair" key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>

            <p className="gr-dip-code">
              <Glyph piece="stamp" face="sealed" size={26} className="gr-dip-seal" />
              <span className="gr-dip-codelabel">{DIPLOMA_COPY.verification}</span>
              <b>{code}</b>
            </p>
            <p className="gr-dip-sub gr-dim">{DIPLOMA_COPY.roster}</p>
            {/* what to do when nothing downloads: the screen carries the same code */}
            <p className="gr-dip-sub gr-dim">
              If nothing downloads, show them this screen. The code is the same one.
            </p>

            <div className="gr-acts">
              <Plank size="md" busy={saving} glyph={['icon_set', 'star']} onClick={() => { void savePng() }}>
                Save my diploma
              </Plank>
              <Plank size="md" onClick={copyArtifact}>
                {copied ? 'Copied it again' : 'Copy it as text'}
              </Plank>
              <Plank size="md" glyph={['icon_set', 'compass']} onClick={finish}>
                Start free play
              </Plank>
            </div>
            <canvas ref={canvasRef} className="gr-canvas" />
          </div>
        )}
      </div>
    </div>
  )
}
