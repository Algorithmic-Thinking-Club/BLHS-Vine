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

/* GRADUATION (§14), the finale as a run of cards: the processional, the cords
 * draping one at a time with their REAL criteria, the honesty board, and the
 * diploma, which is the study's turn-in artifact and the one screen in this game
 * a student hands to somebody else.
 *
 * The falls-terrace processional, the crowd, the caps and the archipelago
 * pull-out are the ceremony art pass. This flow is the spine they will dress, and
 * §14.13's own note about that is the instruction: *"one card, one tap, no
 * assets, legible at Chromebook distance ... it is what should be protected when
 * the ceremony gets dressed."*
 *
 * ---- FOUR THINGS THIS REBUILD FIXED, EACH ONE NAMED IN THE WALKTHROUGH ------
 *
 * 1. IT WAS A KEYBOARD DEAD END (§14.34). *"Every advance in the ceremony is a
 *    click on a `div`. The cards carry no `role`, no `tabIndex` and no key
 *    handler, so there is no keyboard path through the finale at all."* And it is
 *    the only route to the diploma, which is the turn-in artifact. Every card is
 *    a real control now and the overlay is a real panel: focus enters it, Tab
 *    cannot leave it, and the background is inert. It takes `closeOnEscape:
 *    false`, because §14.35 is right that a close button on a diploma invites a
 *    student to dismiss their own conclusion.
 *
 * 2. THE STUDENT WITH NO CORDS SKIPPED THE CEREMONY (§14.19). The line was
 *    `setStage(earned.length ? 'cords' : 'board')`, so *"the centre of the
 *    finale, the part Wiseman confirmed, the part §9.3 calls the point, does not
 *    happen for the student who most needs a reason to come back."* The stage
 *    always runs now. When no cord was earned it is populated from what the
 *    student really did, off `standingsOf`, in the same card shape and with no
 *    invented award anywhere: Q14.19.a's recommendation on record is *"no new
 *    award objects"*, and the visual distinction between a cord and a named
 *    accomplishment is where the honesty lives.
 *
 * 3. THE BOARD SHOWED LEAST TO THE STUDENT WHO KNEW LEAST (§14.20). It filtered
 *    on `progress > 0`, so a cord nobody ever approached vanished, and *"the
 *    board that exists to say what is still out there says the least to the
 *    student furthest from it."* Every cord is on it now: the ones in reach show
 *    their distance and the ones untouched show their criterion, because a
 *    freshman who learns the Seal of Biliteracy exists has learned the thing the
 *    game is for.
 *
 * 4. THE OUTCOME EVENT WAS BEHIND A PRESS (§14.32). `run_complete` fired from
 *    `finishDiploma`, so *"every student who alt-tabs, refreshes or runs out of
 *    block on the diploma has a completed run with no outcome row."* It fires
 *    from the state change now, once, on the same effect that seals the
 *    transcript. `gear2_unlocked` stays on the button, because §14.32 says so in
 *    as many words: that one genuinely is a choice the student makes.
 *
 * ---- AND ONE LAW THIS FILE OBEYS AND NEVER WRITES ---------------------------
 *
 * §14.14: *"nothing in island content should ever hand-write a criterion string.
 * An island that mentions a cord reads it from `cordsOf`."* That is the vine's
 * own contract and the ceremony is where it matters most, because this sentence
 * leaves the building in a student's memory. Every criterion on every card below
 * is `c.rule` out of `progress.ts`, sourced to `docs/blhs/awards.md`, printed
 * beside `c.model` where the game counts something other than what the school
 * states. There is not one composed criterion in this file.
 *
 * ---- THE ARM DOES NOT BRANCH HERE, ON PURPOSE (§14.29) ----------------------
 *
 * *"The diploma is not content and it is not vehicle. It is the instrument, and
 * an instrument that differs between conditions is not an instrument."* There is
 * no arm test anywhere in this component. What differs between the two arms is
 * the skin, which is CSS, and no criterion, no number and no code moves with it.
 */

type Stage = 'processional' | 'honours' | 'board' | 'diploma'

/* ---- WHERE A CORD CAME FROM (§14.15, §14.16) -----------------------------
 *
 * Under the rule, one line naming where the cord came from: the player's own
 * transcript quoted back at them, by title, in the year it happened. No other
 * screen in the run does anything like it.
 *
 * TWO KINDS, AND THE DISTINCTION IS ITSELF TEACHABLE (§14.16). *"Some cords are
 * earned by an event and some are earned by an accumulation. A GPA cord has no
 * moment because no single grade produced it. Saying 'four years of the
 * transcript, all of it' is a truer sentence than picking an arbitrary entry and
 * pretending it was the one."* An accumulation card shows the SHAPE of the
 * accumulation instead of a moment, which is what that section asks for.
 *
 * THE PASSING BAR IS THE DISTRICT'S, NOT AN INVENTED ONE. This function used to
 * read `e.grade >= (tag === 'cte' ? 1 : 2)`, which is the invented C threshold
 * `progress.ts`'s own header names and retracts: SBLSD policy 2410 and the BLHS
 * scale pass a D, one rule for every course. `PASSING_GRADE` is that one rule and
 * this reads it rather than restating it.
 *
 * AND AP CAPSTONE NAMES ITS SIXTH AP NOW. §14.16: *"its criterion is Seminar plus
 * Research plus four more APs, which means there genuinely is a last one, and
 * `earnedMoment` does not name it while `tagged('ap', 6)` would. It is worth
 * taking, because AP Capstone is the cord with the longest planning horizon in
 * the game."* */
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

/* ---- ONE CARD IN THE RUN OF CARDS ---------------------------------------
 *
 * THE SHAPE IS THE DIALOGUE BOX'S, on purpose. §14.34's own answer to the
 * keyboard dead end is not a key handler bolted onto a card: *"the ceremony
 * advances through the same affordance the dialogue box uses ... Two components
 * rendering one dialogue box is Q2.3.a. A third one rendering it as a graduation
 * card is the same mistake a third time."* So this copies `DialogueBox`'s
 * contract rather than inventing a fourth one: a clickable region carrying
 * `role="button"`, a real tab stop, an accessible name that is WORDS, space and
 * enter on a window listener, and the card's actual sentences pushed through
 * `announce` so a reader gets the criterion rather than only the label.
 *
 * It is a region rather than a real `<button>` element for one reason and it is a
 * content one: a cord card carries a heading, four paragraphs and a list, none of
 * which may legally sit inside a `<button>`, and the plain arm's ruling asks for
 * *"real headings"* in as many words. */
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
  /* FOCUS FOLLOWS THE CARD ACROSS A STAGE CHANGE. `usePanel` puts focus on the
   * first card when the ceremony opens, and without this the next stage's card is
   * a fresh element and focus falls back to nowhere, so a keyboard player loses
   * the ring halfway through the finale. A mouse user sees nothing: `:focus-
   * visible` does not paint for a programmatic focus that followed a click. */
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
   * same transcript, so the page renders from it and the freeze happens after the
   * commit, once, and only when the run is really graduated. A preview opened
   * early must never freeze an unfinished run. */
  const [sealed, setSealed] = useState<FrozenRun | null>(() => {
    const cur = loadSave()
    return cur ? diplomaOf(cur) : null
  })
  useEffect(() => {
    const cur = loadSave()
    if (!cur?.graduated) return
    if (cur.diploma) { setSealed(cur.diploma); return }
    /* THE OUTCOME EVENT FIRES FROM THE STATE CHANGE (§14.32), not from the last
     * press. It was behind `finishDiploma`, and a bell, a battery, a closed lid
     * or an alt-tab on the diploma left a completed run with no outcome row at
     * all. The seal is idempotent and a run has exactly one first seal, so this
     * is exactly-once without a flag of its own. */
    const rec = sealRun(cur)
    setSealed(rec)
    track('run_complete', { transcript: rec.transcript, code: rec.code })
  }, [])

  /* SPACE AND ENTER ADVANCE, WHICH IS THE DIALOGUE BOX'S OWN CONTRACT
   * (`DialogueBox.tsx:236`) and the reason §14.34 asks the ceremony to share the
   * affordance rather than grow a fourth one. It is armed only on the two stages
   * that are a single tap: the board and the diploma carry real planks, and a
   * window listener swallowing space there would eat the key that presses them. */
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
  /* THE BOARD IS EVERY CORD THAT IS NOT ALREADY ON THE CAPE (§14.20). The one
   * exclusion is a real one and it is the school's: the GPA bands are exclusive,
   * so a student wearing double gold did not MISS High Honors, they outclassed
   * it, and putting it on a near-miss board would be the game inventing a
   * disappointment. */
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

  /* THE CARD IS SAID OUT LOUD, because `role="button"` with an accessible name
   * means a reader is handed the NAME and not the contents, which is the same
   * trade `DialogueBox` makes and the same fix: the sentences go through the
   * kit's one live region. Losing them here would lose the criterion, and the
   * criterion is the highest-value content in the finale (§14.13). */
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
      /* the commissioned faces are asked for and waited on before the draw, so
       * the one artifact that leaves the game is not set in a system serif
       * (§14.27). `renderDiploma` gives up on a face that will not load rather
       * than withholding the file. */
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

  /* THE SAME ARTIFACT WITH NO IMAGE IN IT (§14.28). A district image that blocks
   * downloads leaves a graduate holding nothing to hand in, and the turn-in
   * summary is the one thing Wiseman asked for by name. This pastes into Canvas,
   * Classroom, a form field or an email and carries the same code. */
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
            {/* THE FIGURE IS OUT, AND THE PARAGRAPH IS BACK, ON ASH'S WORD.
                2026-09-02: "the graduation gown on thor looks like a joke,
                complete different thor and ugly gown."

                What was here was a PixelLab generation of Thor in regalia. The
                art-direction agent had measured it as recognisably Thor and
                conditionally passed it; Ash looked at it and did not, and his
                verdict after looking is the only gate. It is kept at
                `reference/_archive/build-shots/ui/generated/05-graduate-*.png`
                rather than deleted, because the record of what was tried is
                worth more than the file.

                SO THE PAYOFF IS A PARAGRAPH AGAIN, and that is a real hole
                rather than a resting place: §14 wants the falls terrace, the
                crowd, the cape and the cords draping onto a body. The route to
                it is not another freehand generation. `principal-pro` in the
                Maw's own library is a panther in exactly this regalia, drawn in
                MAPVIS's character pipeline at the game's own resolution, and it
                is the proof that the pipeline can make this figure properly. */}
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

                {/* THE SCHOOL'S OWN WORDS FIRST, AND LABELLED AS THE SCHOOL'S.
                    V3's law in `progress.ts`: a mechanic that approximates a
                    criterion is never printed AS the criterion, so `rule` is what
                    a student reads and `model` sits beside it saying what this
                    game actually counted. Where the two are the same there is no
                    model and nothing is printed. */}
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
          /* NOT A TAP CARD. `run.css` set `cursor: pointer` on every `.gr-card`
             and this one has never had a handler, so the board showed a hand and
             did nothing on every graduation since it was written. It is a plain
             region with one real control at the bottom. */
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
                          {/* THREE DIFFERENT SENTENCES FOR THREE DIFFERENT
                              STATES, and the third one is the one that must not
                              be faked: Valedictorian and Salutatorian are real
                              awards whose criteria nobody has published, Wiseman
                              flagged the gap himself, and §14.14's rule is that
                              an unearnable cord that lies about how to earn it is
                              worse than one that is absent. */}
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

            {/* ONE COPY DECK (§14.24). The card, the PNG and the pasteable text
                read the same rows in the same order out of `diploma.ts`, so a
                teacher holding a printout and looking at a screen is reading one
                document rather than two. */}
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
            {/* §14.28's fallback path, said out loud where a student can act on
                it: the roster is the evidence and the file is the keepsake, so a
                machine that will not download anything has cost the student
                nothing at all. */}
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
