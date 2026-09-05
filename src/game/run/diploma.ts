/* THE TURN-IN ARTIFACT, AND THE SNAPSHOT UNDER IT.
 *
 * §80.6, verbatim: *"a transcript frozen at graduation and stored on the save,
 * because `_store.ts`'s `putState` is an upsert with `on conflict do update` and
 * there is no snapshot at all, and the failure that prevents looks exactly like a
 * student cheating in front of a class."*
 *
 * WHAT IT LOOKED LIKE. `Graduation.tsx` computed `runCode(transcriptOf(s))` from
 * the LIVE save at render time and drew that code on the diploma. Then the last
 * button unlocks Gear 2 and the ocean opens, so the graduate plays one more
 * island, the ledger moves, the GPA moves, and the code the teacher's roster
 * computes from the synced save is no longer the code on the printed page. The
 * teacher is holding two different codes for one student in front of a class, and
 * the only reading available to them is that the student made one up. Nothing in
 * the game could have told them otherwise, because the server keeps one row per
 * participant and overwrites it.
 *
 * So the transcript is frozen once, at the moment the stage is walked, and every
 * printed thing is drawn from the frozen copy. The check is the same function on
 * both sides: `canonical` and `runCode` in `src/vine/verify.ts` are pure and
 * dependency-free precisely so the client and `api/teacher.ts` compute the same
 * ten characters over the same string.
 *
 * WHAT THIS FILE DOES NOT DECIDE. Q80.6.d is open: what a Captain receives at
 * graduation when the school awards no cord for it. The honest options on record
 * are the diploma line, a badge, or nothing, and INVENTING A CORD IS NOT ON THE
 * LIST, because the awards table came from Ms. Pinzon through Wiseman and its own
 * Valedictorian and Salutatorian criteria are a gap Wiseman flagged himself. The
 * diploma prints the rank line it already printed and claims nothing further.
 *
 * ---- ONE COPY DECK, ADDED 2026-09-01 ---------------------------------------
 *
 * §14.24 found the two artifacts disagreeing with each other: *"The card says
 * 'Facts learned' and the PNG says 'N true things learned'. The card says
 * 'completed the four-year voyage' and the PNG says 'completed the four-year
 * run'. One artifact, two copies of the copy."* A teacher holding a printout and
 * looking at a screen was reading two documents. `DIPLOMA_COPY` and
 * `diplomaRows` are now the single deck: the React card, the PNG and the pasteable
 * text all read them, so a wording can only be changed for all three at once.
 */
import { freezeRun, loadSave, type FrozenRun, type SaveGame } from '../save'
import { cordsOf, rankName, ranksOf, transcriptOf, letterOf, NO_ATHLETIC_CORD } from '../progress'
import { programmeOfRankTrack } from '../roster/roster'
import { canonical, runCode, type Transcript } from '../../vine/verify'

/** freeze the run, once, at the moment the student walks the stage */
export function sealRun(s: SaveGame): FrozenRun {
  if (s.diploma) return s.diploma
  const transcript = transcriptOf(s)
  const sealed: FrozenRun = { transcript, code: runCode(transcript), year: s.year, at: Date.now() }
  freezeRun(sealed)
  return loadSave()?.diploma ?? sealed
}

/* WHAT THE DIPLOMA READS FROM. A run that has not been sealed yet is computed
 * live, which is what a pre-graduation preview wants; a sealed one is read back
 * whole and never recomputed. Both return the same shape so nothing downstream
 * has to know which it got. */
export function diplomaOf(s: SaveGame): FrozenRun {
  if (s.diploma) return s.diploma
  const transcript = transcriptOf(s)
  return { transcript, code: runCode(transcript), year: s.year, at: 0 }
}

/** is this the code that belongs to this run. The teacher's roster asks the same
 *  question of the synced save with the same two functions. */
export function checkCode(s: SaveGame, code: string): boolean {
  const clean = code.trim().toUpperCase().replace(/\s+/g, '')
  return diplomaOf(s).code === clean
}

/* ---- the words, in one place ----------------------------------------------
 *
 * Every string a graduate reads on their own document. Nothing here is a
 * criterion: criteria come from `cordsOf` and only from `cordsOf` (§14.14), and
 * this deck is the frame around them. */
export const DIPLOMA_COPY = {
  school: 'BONNEY LAKE HIGH SCHOOL',
  subtitle: 'four years of high school',
  certifies: 'certifies that the Panther known as',
  completed: 'completed four years of high school',
  verification: 'verification',
  roster: 'your teacher checks this code against the advisory roster',
  unnamed: 'Panther',
} as const

export type DiplomaRow = { label: string; value: string }

/* THE RANKS, SPELLED THROUGH THE ROSTER AND NEVER THROUGH THE RAW KEY.
 *
 * `transcript.ranks` is keyed by RANK TRACK, which is its own key space and not a
 * programme id. Looking a track up in the programme list printed the raw key
 * whenever the two were spelled differently, and Key Club's are: the track is
 * `keyclub` and the programme is `key-club`, so a graduating student's diploma
 * read "keyclub". */
export const rankLines = (t: Transcript): { name: string; rank: string }[] =>
  Object.entries(t.ranks)
    .map(([track, yrs]) => ({ name: programmeOfRankTrack(track)?.name ?? track, rank: rankName(yrs) }))
    .filter((r): r is { name: string; rank: string } => !!r.rank)

/** the earned cords, by the school's own names, off the FROZEN ids */
export function sealedCordNames(s: SaveGame, d: FrozenRun): string[] {
  const names = new Map(cordsOf(s).map((c) => [c.id, c.name]))
  return d.transcript.cords.map((id) => names.get(id) ?? id)
}

/* THE DATA ROWS, ONE LIST, READ BY THE CARD, THE PNG AND THE PASTEABLE TEXT.
 *
 * §14.24 asked for the class and the date, because *"a teacher receiving a PNG
 * has the student's handle and a code and no way to tell which advisory section
 * or which year it came from"*. The class NAME lives on the server as `cls.name`
 * and is not in the save's shape at all, so what a student's own document can
 * honestly carry is the join code they typed, labelled as the code. Q14.24.a asks
 * Wiseman whether a code plus a date is enough to disambiguate a printout, and
 * this is the most the client knows either way. */
export function diplomaRows(s: SaveGame, d: FrozenRun = diplomaOf(s)): DiplomaRow[] {
  const t = d.transcript
  const cords = sealedCordNames(s, d)
  const ranks = rankLines(t)
  const rows: DiplomaRow[] = [
    { label: 'GPA', value: t.gpa === null ? 'none yet' : `${t.gpa.toFixed(2)} (${letterOf(t.gpa)})` },
    { label: 'Cords and seals', value: cords.length ? cords.join(', ') : 'none' },
  ]
  if (ranks.length) rows.push({ label: 'Ranks', value: ranks.map((r) => `${r.rank}, ${r.name}`).join(' · ') })
  rows.push(
    { label: 'Islands completed', value: String(t.islandsCompleted) },
    { label: 'Places you saw', value: String(t.placesSeen) },
    { label: 'Programmes finished', value: String(t.programmesCompleted) },
    { label: 'True things learned', value: String(t.factsLearned) },
    { label: 'Years completed', value: `${d.year} of 4` },
    { label: 'Advisory class code', value: s.classCode || 'joined no class' },
    { label: 'Date finished', value: sealedDate(d) },
  )
  return rows
}

/* THE DAY IT WAS SEALED. `at` is 0 on a preview opened before the run is really
 * graduated, and a preview must never print a date it does not have, so it says
 * so in words rather than printing the epoch. */
export function sealedDate(d: FrozenRun): string {
  if (!d.at) return 'not yet, this is a preview'
  const at = new Date(d.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/* THE FILE A STUDENT KEEPS, NAMED SO TWO OF THEM CANNOT BE CONFUSED.
 *
 * §14.27: *"Same handle, same name, so a second export lands beside the first
 * with a browser-appended number, and if §14.33 has fired in between the student
 * now holds two files with different codes and no way to tell which is current.
 * The date and the code both belong in the filename."* */
export function diplomaFileName(s: SaveGame, d: FrozenRun = diplomaOf(s)): string {
  const who = (s.handle || 'panther').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'panther'
  const day = d.at ? sealedDate(d) : 'preview'
  return `blhs-diploma-${who}-${day}-${d.code}.png`
}

/* ---- WHAT THE STAGE NAMES WHEN NO CORD WAS EARNED --------------------------
 *
 * §14.19, and it is the sharpest finding in the whole finale:
 *
 *   *"A student who earned nothing skips the entire cape ceremony ... the centre
 *   of the finale, the part Wiseman confirmed, the part §9.3 calls the point,
 *   does not happen for the student who most needs a reason to come back."*
 *
 * Its position, which this function is: *"the zero-cord ceremony is not a
 * shortened ceremony, it is a differently populated one. The stage runs the same
 * number of beats and draws them from what the student did earn."*
 *
 * Q14.19.a's recommendation is the fence around it, and it is why nothing below
 * invents an award: *"No new award objects. The stage names real things the
 * student did, in the same card shape, without pretending they are cords."* So
 * every entry here is a count off the frozen transcript, said in the game's own
 * voice, with no colour, no criterion and no claim to be a cord. The last one is
 * unconditional, because §14.19's rule for a member's island is the vine's rule
 * too: a result is always populated, never skipped. */
export type Standing = {
  id: string
  name: string
  /** what it took, in plain words */
  what: string
  /** the count or the span it stands on */
  count: string
}

export function standingsOf(s: SaveGame, d: FrozenRun = diplomaOf(s)): Standing[] {
  const t = d.transcript
  const out: Standing[] = []

  /* the ladder first, because it is the only one that took four years and it is
   * the one the school gives nothing for. `NO_ATHLETIC_CORD` is `progress.ts`'s
   * own sentence about that, quoted rather than paraphrased. */
  for (const [track, years] of Object.entries(ranksOf(s))) {
    const rank = rankName(years)
    if (!rank) continue
    const name = programmeOfRankTrack(track)?.name ?? track
    out.push({
      id: `rank:${track}`,
      name: `${rank}, ${name}`,
      what: rank === 'Captain' ? NO_ATHLETIC_CORD : 'Years in the same sport or club. This counts years, not grades.',
      count: `${years} ${years === 1 ? 'year' : 'years'}`,
    })
  }
  if (t.programmesCompleted > 0) {
    out.push({
      id: 'programmes',
      name: 'Programmes finished',
      what: 'You spent a season token on it and finished it.',
      count: `${t.programmesCompleted} of them`,
    })
  }
  if (t.islandsCompleted > 0) {
    out.push({
      id: 'islands',
      name: 'Islands completed',
      what: 'An island is one club, sport or class. You finished this one.',
      count: `${t.islandsCompleted} of them`,
    })
  }
  if (t.placesSeen > 0) {
    out.push({
      id: 'places',
      name: 'Places you saw',
      what: 'Every place at this school you saw, inside or from outside.',
      count: `${t.placesSeen} ${t.placesSeen === 1 ? 'place' : 'places'}`,
    })
  }
  if (t.factsLearned > 0) {
    out.push({
      id: 'facts',
      name: 'True things learned',
      what: 'Each one is a real thing about Bonney Lake that you did not know four years ago.',
      count: `${t.factsLearned} of them`,
    })
  }
  if (s.stickers.length > 0) {
    out.push({
      id: 'marks',
      name: 'Marks you were given',
      what: 'Given for something you did. Never for a grade.',
      count: `${s.stickers.length} ${s.stickers.length === 1 ? 'mark' : 'marks'}`,
    })
  }
  /* ALWAYS LAST AND ALWAYS PRESENT. A student who did nothing else still walked
   * the years, and a stage that can be empty is the defect §14.19 named. */
  out.push({
    id: 'years',
    name: 'Four years walked',
    what: 'Every year you opened, planned, sat and closed. Nobody does all of it.',
    count: `${d.year} of 4`,
  })
  return out
}

/* ---- the artifact a student hands in ----------------------------------------
 *
 * Wiseman on the turn-in summary, `docs/blhs/wiseman-reply.md`: *"it gives
 * advisory teachers a concrete, easy-to-administer outcome, and it's where the AP
 * Research study would pull its comparable variables/data."*
 *
 * The PNG is the thing a student is proud of and the thing a Chromebook cannot
 * always download: a district image that blocks downloads leaves a graduate with
 * nothing to hand in. So there is a plain-text form as well, which pastes into
 * Canvas, Classroom, a form field or an email, carries the same code, and is
 * legible without opening an image. One artifact, two bodies.
 */
export function artifactText(s: SaveGame, d: FrozenRun = diplomaOf(s)): string {
  const t = d.transcript
  return [
    `${DIPLOMA_COPY.school} · four years of high school`,
    `Panther: ${t.handle || 'unnamed'}`,
    ...diplomaRows(s, d).map((r) => `${r.label}: ${r.value}`),
    `Verification: ${d.code}`,
    'Your teacher checks this code against the advisory roster.',
  ].join('\n')
}

/* THE STRING THE CODE IS COMPUTED OVER, exported for the captain's overlay and
 * for a teacher chasing a mismatch by hand. Never shown to a student: it carries
 * the participant id. */
export const codeSubject = (t: Transcript) => canonical(t)

/* ---- THE KEEPSAKE, DRAWN ---------------------------------------------------
 *
 * The downloadable artifact: drawn by hand on canvas, no dependencies, legible in
 * a gradebook at 50 percent zoom. It moved out of `Graduation.tsx` on 2026-09-01
 * so the copy deck, the rows, the filename and the drawing are one module and a
 * teacher's printout cannot drift from the screen a student is looking at.
 *
 * IT IS DRAWN FROM THE SEAL AND NOT FROM THE SAVE. It read `gpaOf(s)`,
 * `cordsOf(s)`, `ranksOf(s)` and `transcriptOf(s)` at the moment the button was
 * pressed, so a student who saved their diploma, went back out on the water and
 * saved it again held two different documents with two different codes, and only
 * one of them ever matched the roster.
 *
 * ---- WHY IT NOW SETS THE COMMISSIONED FACES ---------------------------------
 *
 * §14.27, verbatim: *"It is drawn in Georgia. `GAME-DESIGN.md` §11.2 forbids
 * system fonts anywhere and commissions two faces through PixelLab. The single
 * artifact that leaves the game and is shown to an adult is the one surface in
 * the build using a system font."*
 *
 * A canvas cannot use a face the DOCUMENT has not loaded, and `@font-face` with
 * `font-display: swap` does not load a face until something asks for it. Both
 * faces are real files in `public/fonts/` declared in `cutscene/ui-kit.css`, so
 * `readyForDiploma()` asks the FontFaceSet for them and waits, and the draw only
 * happens after. A browser with no `document.fonts` (or a face that will not
 * load) falls through to the stack's serif rather than blocking the download,
 * because a graduate holding no file at all is worse than a graduate holding one
 * in the wrong face.
 *
 * ---- AND WHY THIS ONE PALETTE IS TYPED OUT ----------------------------------
 *
 * Every stylesheet in the kit reads `tokens.css` and types no colour of its own.
 * This is not a stylesheet and it deliberately does not read the token layer,
 * because the token layer is the study's INDEPENDENT VARIABLE: `html[data-skin=
 * 'plain']` swaps every value in it. §14.29's rule for this artifact is that it
 * is the instrument rather than the vehicle, that it renders identically in both
 * arms, and that *"an instrument that differs between conditions is not an
 * instrument"*. A canvas that read the live tokens would print a different
 * document for a control-arm student. So the six values below are frozen copies
 * of `:root`'s, each named with the token it was taken from, and they stay frozen
 * on purpose.
 */
const PAPER = {
  ground: '#ece2c8',    // --kit-paper-on-hi
  seal: '#2f6e60',      // --kit-sea-head
  deep: '#234c40',      // --kit-sea-ink
  rule: '#8a744f',      // --kit-edge
  ink: '#4a3826',       // --kit-ink-body
  label: '#6a563c',     // --kit-ink-label
  quiet: '#8a7a60',     // --kit-ink-dim
} as const

const DISPLAY_FACE = 'Harbormaster, Deckhand, serif'
const BODY_FACE = 'Deckhand, serif'

/* TYPED HERE RATHER THAN OFF `Document['fonts']`, because the FontFaceSet lib
 * type is not in every `lib.dom` this repo builds against and a keepsake must not
 * be the reason a build stops. This is the whole of the surface used. */
type FontLoader = { load?: (font: string) => Promise<unknown> }

/** ask the document for the two commissioned faces and wait, at most briefly */
export async function readyForDiploma(): Promise<void> {
  const fonts = (document as unknown as { fonts?: FontLoader }).fonts
  if (!fonts?.load) return
  try {
    await Promise.all([
      fonts.load(`44px ${DISPLAY_FACE}`),
      fonts.load(`17px ${BODY_FACE}`),
    ])
  } catch {
    /* a face that will not load is not a reason to withhold the file. §14.28: if
     * the artifact cannot leave the machine the student has nothing to hand in. */
  }
}

export function drawDiploma(cv: HTMLCanvasElement, s: SaveGame, sealed: FrozenRun): void {
  const W = 900, H = 700
  cv.width = W; cv.height = H
  const g = cv.getContext('2d')
  if (!g) return
  g.fillStyle = PAPER.ground; g.fillRect(0, 0, W, H)
  g.strokeStyle = PAPER.seal; g.lineWidth = 10; g.strokeRect(14, 14, W - 28, H - 28)
  g.strokeStyle = PAPER.rule; g.lineWidth = 2; g.strokeRect(30, 30, W - 60, H - 60)

  const line = (text: string, y: number, size: number, color: string = PAPER.ink, face: string = BODY_FACE) => {
    g.fillStyle = color
    g.font = `${size}px ${face}`
    g.textAlign = 'center'
    g.fillText(text, W / 2, y)
  }
  const t = sealed.transcript

  line(DIPLOMA_COPY.school, 92, 34, PAPER.deep, DISPLAY_FACE)
  line(DIPLOMA_COPY.subtitle, 124, 16, PAPER.label)
  line(DIPLOMA_COPY.certifies, 178, 18)
  line(t.handle || DIPLOMA_COPY.unnamed, 234, 44, PAPER.deep, DISPLAY_FACE)
  line(DIPLOMA_COPY.completed, 268, 18)

  /* THE SAME ROWS THE CARD SHOWS, IN THE SAME ORDER, in two columns so a long
     cord list has somewhere to go instead of running off the page. */
  const rows = diplomaRows(s, sealed)
  let y = 320
  for (const r of rows) {
    g.textAlign = 'right'
    g.font = `15px ${BODY_FACE}`
    g.fillStyle = PAPER.quiet
    g.fillText(r.label, W / 2 - 16, y)
    g.textAlign = 'left'
    g.font = `16px ${BODY_FACE}`
    g.fillStyle = PAPER.ink
    /* a value longer than the column gets cut with an ellipsis rather than
       overrunning the frame: the printed page has one width and no scroll */
    g.fillText(fit(g, r.value, W / 2 - 60), W / 2 + 16, y)
    y += 27
  }

  line(`${DIPLOMA_COPY.verification} ${sealed.code}`, y + 34, 22, PAPER.deep, DISPLAY_FACE)
  line(DIPLOMA_COPY.roster, y + 62, 13, PAPER.quiet)
}

/** the widest prefix of `text` that fits, with a real ellipsis when it does not */
function fit(g: CanvasRenderingContext2D, text: string, max: number): string {
  if (g.measureText(text).width <= max) return text
  let cut = text
  while (cut.length > 1 && g.measureText(`${cut}...`).width > max) cut = cut.slice(0, -1)
  return `${cut}...`
}

/** load the faces, then draw. What "Save my diploma" actually calls. */
export async function renderDiploma(cv: HTMLCanvasElement, s: SaveGame, sealed: FrozenRun): Promise<void> {
  await readyForDiploma()
  drawDiploma(cv, s, sealed)
}
