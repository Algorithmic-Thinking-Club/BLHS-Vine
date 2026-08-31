import { useEffect, useMemo, useRef, useState } from 'react'
import { hasFlag, loadSave, setFlag, type FrozenRun, type SaveGame } from '../save'
import { cordsOf, letterOf, rankName } from '../progress'
import { artifactText, diplomaOf, sealRun } from './diploma'
import { programmeOfRankTrack } from '../roster/roster'
import { track } from '../telemetry'
import './run.css'

// GRADUATION (§9) — the system version of the finale: the cords drape one at a time with
// their REAL criteria and the moment they were earned; the near-miss board seeds the
// replay; the diploma renders as the TURN-IN ARTIFACT (§9.5) with a verification code the
// teacher's roster computes independently from the synced save; the last button unlocks
// Gear 2. The falls-terrace processional, the crowd, the fireworks, and the I-8 pull-out
// are the CEREMONY ART PASS (ledgered in THE-PATH 3.10) — this flow is the spine they
// will dress.

type Stage = 'processional' | 'cords' | 'board' | 'diploma'

/** the moment a cord was earned, read from the ledger — the tiny flashback line (§9.3) */
function earnedMoment(cordId: string, s: SaveGame): string {
  const tagged = (tag: string, n: number) => {
    const hits = s.ledger.filter((e) => e.tags?.includes(tag) && e.grade >= (tag === 'cte' ? 1 : 2))
    const hit = hits[n - 1]
    return hit ? `${hit.title}, year ${hit.year}` : 'the transcript remembers'
  }
  switch (cordId) {
    case 'highest-honors': case 'high-honors': return 'four years of the transcript, all of it'
    case 'career-readiness': return `sealed by ${tagged('cte', 2)}`
    case 'ap-honors': return `the fifth: ${tagged('ap', 5)}`
    case 'ap-capstone': return 'Seminar, Research, and the four that followed'
    case 'seal-biliteracy': return `the capstone: ${tagged('lang-capstone', 1)}`
    case 'key-club': return 'two years of showing up for other people'
    default: return 'earned, and the ledger knows where'
  }
}

export function Graduation({ onClose }: { onClose: () => void }) {
  const s = loadSave()
  const [stage, setStage] = useState<Stage>('processional')
  const [cordIdx, setCordIdx] = useState(0)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  /* THE TRANSCRIPT IS FROZEN THE MOMENT THE STAGE IS WALKED, not read live.
   *
   * The last button on this flow unlocks Gear 2 and the ocean opens, so a
   * graduate plays one more island, the ledger moves, and the code the teacher's
   * roster computes from the synced save stops matching the code on the printed
   * page. The teacher is then holding two codes for one student in front of a
   * class and the only reading available to them is that the student made one up.
   *
   * READ IN A LAZY INITIALISER, WRITTEN IN AN EFFECT, and the split is the whole
   * point. A lazy initialiser runs DURING this component's render, and `sealRun`
   * writes the save, and a write emits, and the emit set state on the Hud that
   * mounted this: React said so out loud, "Cannot update a component (Hud) while
   * rendering a different component (Graduation)", on every graduation in the
   * wave-2 proof. `diplomaOf` is the pure half and answers the same code off the
   * same transcript, so the page renders from it and the freeze happens after
   * the commit, once, and only when the run is really graduated. A preview
   * opened early must never freeze an unfinished run. */
  const [sealed] = useState<FrozenRun | null>(() => {
    const cur = loadSave()
    return cur ? diplomaOf(cur) : null
  })
  useEffect(() => {
    const cur = loadSave()
    if (cur?.graduated) sealRun(cur)     // idempotent: a sealed run returns its own record
  }, [])

  const earned = useMemo(() => (s ? cordsOf(s).filter((c) => c.earned) : []), [s])
  const missed = useMemo(() => {
    if (!s) return []
    const all = cordsOf(s)
    const gotHighest = all.some((c) => c.id === 'highest-honors' && c.earned)
    // the GPA bands are exclusive: High Honors is not "missed" by someone wearing double
    // gold — it was outclassed, and the board only shows honest near-misses
    return all.filter((c) => !c.earned && c.progress > 0 && !(gotHighest && c.id === 'high-honors'))
  }, [s])
  if (!s || !sealed) return null

  const transcript = sealed.transcript
  const code = sealed.code
  const gpa = transcript.gpa

  /* `save.ranks` is keyed by RANK TRACK, which is its own key space and not a
   * programme id. Looking a track up in the programme list printed the raw key
   * whenever the two were spelled differently, and Key Club's are: the track is
   * `keyclub` and the programme is `key-club`, so a graduating student's diploma
   * read "keyclub". The years come off the frozen transcript now, so a rank that
   * moves after graduation does not rewrite a printed diploma. */
  const ranks = Object.entries(transcript.ranks)
    .map(([track, yrs]) => ({ name: programmeOfRankTrack(track)?.name ?? track, rank: rankName(yrs) }))
    .filter((r) => r.rank)

  /* THE CORD NAMES COME OFF THE FROZEN IDS. The cord table itself is content and
   * ships with the deploy, so a name is a lookup; which cords were earned is the
   * run's and is the thing that must not move after the code was computed. */
  const cordName = new Map(cordsOf(s).map((c) => [c.id, c.name]))
  const sealedCords = transcript.cords.map((id) => cordName.get(id) ?? id)

  const finishDiploma = () => {
    if (!hasFlag('gear2')) {
      track('run_complete', { transcript, code })
      track('gear2_unlocked')
      setFlag('gear2')
    }
    onClose()
  }

  const savePng = () => {
    const cv = canvasRef.current ?? document.createElement('canvas')
    drawDiploma(cv, s, sealed)
    const a = document.createElement('a')
    a.download = `blhs-diploma-${s.handle || 'panther'}.png`
    a.href = cv.toDataURL('image/png')
    a.click()
    track('artifact_exported', { code, form: 'png' })
  }

  /* THE SAME ARTIFACT WITH NO IMAGE IN IT. A district image that blocks downloads
   * leaves a graduate holding nothing to hand in, and the turn-in summary is the
   * one thing Wiseman asked for by name. This pastes into Canvas, Classroom, a
   * form field or an email and carries the same code. */
  const copyArtifact = () => {
    const text = artifactText(s, sealed)
    void navigator.clipboard?.writeText(text).catch(() => { /* a blocked clipboard is not a failure worth a dialog */ })
    setCopied(true)
    track('artifact_exported', { code, form: 'text' })
  }

  return (
    <div className="gr-veil">
      <div className="gr-stage">
        {stage === 'processional' && (
          <div className="gr-card kit-surface-panel" onClick={() => setStage(earned.length ? 'cords' : 'board')}>
            <div className="gr-title">Graduation</div>
            <div className="gr-line">The falls terrace, dressed at last. Everyone you met these four years is in the crowd, and the ones you ranked with stand in the front row.</div>
            <div className="gr-line">Thor walks the stage in teal. The stole reads BONNEY LAKE.</div>
            <div className="gr-cue">🐾 tap to walk</div>
          </div>
        )}

        {stage === 'cords' && earned[cordIdx] && (
          <div className="gr-card kit-surface-panel" onClick={() => {
            if (cordIdx + 1 < earned.length) setCordIdx(cordIdx + 1)
            else setStage('board')
          }}>
            <div className="gr-cordname">{earned[cordIdx].name}</div>
            <div className="gr-cordcolors">{earned[cordIdx].colors}</div>
            <div className="gr-line">{earned[cordIdx].rule}</div>
            <div className="gr-moment">{earnedMoment(earned[cordIdx].id, s)}</div>
            <div className="gr-cue">🐾 the cord drapes · {cordIdx + 1} of {earned.length}</div>
          </div>
        )}

        {stage === 'board' && (
          <div className="gr-card kit-surface-panel">
            <div className="gr-title">{earned.length ? 'And the board, for honesty' : 'The board, for next time'}</div>
            {missed.length === 0 && <div className="gr-line">Nothing left unearned that you reached for. Rare.</div>}
            {missed.map((c) => (
              <div className="gr-missrow" key={c.id}>
                <span className="gr-missname">{c.name}</span>
                <span className="gr-missdetail">{c.detail}</span>
              </div>
            ))}
            <div className="gr-line gr-dim">How close you came is the replay seed. The ocean opens after this.</div>
            <button className="yb-turn" onClick={() => setStage('diploma')}>The diploma</button>
          </div>
        )}

        {stage === 'diploma' && (
          <div className="gr-card gr-diploma kit-surface-panel">
            <div className="gr-dip-school">BONNEY LAKE HIGH SCHOOL</div>
            <div className="gr-dip-sub">certifies that the Panther known as</div>
            <div className="gr-dip-name">{s.handle || 'Panther'}</div>
            <div className="gr-dip-sub">completed the four-year voyage</div>
            <div className="gr-dip-grid">
              <span>GPA</span><b>{gpa !== null ? `${gpa.toFixed(2)} (${letterOf(gpa)})` : 'unwritten'}</b>
              <span>Cords &amp; seals</span><b>{sealedCords.length ? sealedCords.join(', ') : 'none'}</b>
              {ranks.length > 0 && <><span>Ranks</span><b>{ranks.map((r) => `${r.rank}, ${r.name}`).join(' · ')}</b></>}
              <span>Islands completed</span><b>{transcript.islandsCompleted}</b>
              <span>Places seen</span><b>{transcript.placesSeen}</b>
              <span>Facts learned</span><b>{transcript.factsLearned}</b>
            </div>
            <div className="gr-dip-code">verification <b>{code}</b></div>
            <div className="gr-dip-sub gr-dim">your teacher's roster shows this same code if this run is really yours</div>
            <div className="gr-dip-actions">
              <button className="yb-turn" onClick={savePng}>Save my diploma</button>
              <button className="yb-turn" onClick={copyArtifact}>{copied ? 'copied ✓' : 'Copy it as text'}</button>
              <button className="yb-turn gr-gear2" onClick={finishDiploma}>The ocean is yours now</button>
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
          </div>
        )}
      </div>
    </div>
  )
}

/* the downloadable artifact: drawn by hand on canvas (no deps), paper + teal,
 * legible in a gradebook at 50% zoom. The composed ART version rides the ceremony
 * art pass.
 *
 * DRAWN FROM THE SEAL AND NOT FROM THE SAVE. It read `gpaOf(s)`, `cordsOf(s)`,
 * `ranksOf(s)` and `transcriptOf(s)` at the moment the button was pressed, so a
 * student who saved their diploma, went back out on the water and saved it again
 * held two different documents with two different codes, and only one of them
 * ever matched the roster. */
function drawDiploma(cv: HTMLCanvasElement, s: SaveGame, sealed: FrozenRun) {
  const W = 900, H = 640
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')!
  g.fillStyle = '#ece2c8'; g.fillRect(0, 0, W, H)
  g.strokeStyle = '#2f6e60'; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28)
  g.strokeStyle = '#8a744f'; g.lineWidth = 2; g.strokeRect(30, 30, W - 60, H - 60)

  const line = (text: string, y: number, size: number, color = '#3c2d1c', bold = false) => {
    g.fillStyle = color
    g.font = `${bold ? 'bold ' : ''}${size}px Georgia, serif`
    g.textAlign = 'center'
    g.fillText(text, W / 2, y)
  }
  const t = sealed.transcript
  const gpa = t.gpa
  const cordName = new Map(cordsOf(s).map((c) => [c.id, c.name]))
  const earned = t.cords.map((id) => cordName.get(id) ?? id)
  /* `save.ranks` is keyed by RANK TRACK, which is its own key space and not a
   * programme id. Looking a track up in the programme list printed the raw key
   * whenever the two were spelled differently, and Key Club's are: the track is
   * `keyclub` and the programme is `key-club`, so a graduating student's diploma
   * read "keyclub". */
  const ranks = Object.entries(t.ranks)
    .map(([track, yrs]) => ({ name: programmeOfRankTrack(track)?.name ?? track, rank: rankName(yrs) }))
    .filter((r) => r.rank)

  line('BONNEY LAKE HIGH SCHOOL', 92, 34, '#1f4a40', true)
  line('the island voyage · four years', 122, 16, '#6a563c')
  line('certifies that the Panther known as', 180, 18)
  line(t.handle || 'Panther', 232, 44, '#1f4a40', true)
  line('completed the four-year run', 266, 18)
  line(`GPA ${gpa !== null ? `${gpa.toFixed(2)} (${letterOf(gpa)})` : 'unwritten'}`, 330, 24, '#3c2d1c', true)
  line(earned.length ? `Cords & seals: ${earned.join(', ')}` : 'Cords & seals: none earned', 368, 17)
  if (ranks.length) line(`Ranks: ${ranks.map((r) => `${r.rank} · ${r.name}`).join('   ')}`, 398, 17)
  line(`${t.islandsCompleted} islands completed · ${t.placesSeen} places seen · ${t.factsLearned} true things learned`, 434, 17)
  line(`verification ${sealed.code}`, 508, 22, '#1f4a40', true)
  line('check against the advisory roster · blhs island explorer', 534, 13, '#8a7a60')
}
