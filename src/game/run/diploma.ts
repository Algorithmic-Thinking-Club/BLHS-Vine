// the diploma a student hands in: the transcript frozen at graduation, and every wording it uses
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

/* what the diploma reads from: the sealed copy if there is one, a live preview if there is not */
export function diplomaOf(s: SaveGame): FrozenRun {
  if (s.diploma) return s.diploma
  const transcript = transcriptOf(s)
  return { transcript, code: runCode(transcript), year: s.year, at: 0 }
}

/** is this the code that belongs to this run, and the roster asks the same question of the synced save through the same two functions */
export function checkCode(s: SaveGame, code: string): boolean {
  const clean = code.trim().toUpperCase().replace(/\s+/g, '')
  return diplomaOf(s).code === clean
}

/* every fixed string a graduate reads on their own document, in one place */
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

/* the rank lines, spelled through the roster so a rank track's raw key never reaches the page */
export const rankLines = (t: Transcript): { name: string; rank: string }[] =>
  Object.entries(t.ranks)
    .map(([track, yrs]) => ({ name: programmeOfRankTrack(track)?.name ?? track, rank: rankName(yrs) }))
    .filter((r): r is { name: string; rank: string } => !!r.rank)

/** the earned cords, by the school's own names, off the FROZEN ids */
export function sealedCordNames(s: SaveGame, d: FrozenRun): string[] {
  const names = new Map(cordsOf(s).map((c) => [c.id, c.name]))
  return d.transcript.cords.map((id) => names.get(id) ?? id)
}

/* the data rows, one list, read by the card, the drawn picture and the pasteable text */
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

/* the day it was sealed, and `at` is 0 on a preview opened before the run has graduated, so it says so in words rather than printing the epoch */
export function sealedDate(d: FrozenRun): string {
  if (!d.at) return 'not yet, this is a preview'
  const at = new Date(d.at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

/* the file name a student keeps, carrying the handle, the date and the code so two cannot be confused */
export function diplomaFileName(s: SaveGame, d: FrozenRun = diplomaOf(s)): string {
  const who = (s.handle || 'panther').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'panther'
  const day = d.at ? sealedDate(d) : 'preview'
  return `blhs-diploma-${who}-${day}-${d.code}.png`
}

/* real things the student did, counted off the frozen transcript, so the ceremony is never empty */
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

  /* the ladder first, because it is the only one that took four years and the one the school gives nothing for, and `NO_ATHLETIC_CORD` is `progress.ts`'s own sentence about that, quoted rather than paraphrased */
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
  /* always last and always present, because a player who did nothing else still walked the years and a stage that can come out empty is a defect */
  out.push({
    id: 'years',
    name: 'Four years walked',
    what: 'Every year you opened, planned, sat and closed. Nobody does all of it.',
    count: `${d.year} of 4`,
  })
  return out
}

// the same document as plain text, for pasting anywhere a picture cannot go
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

/* the string the code is computed over, exported for the captain's overlay and for chasing a mismatch by hand, and never shown to a player because it carries the participant id */
export const codeSubject = (t: Transcript) => canonical(t)

// the drawn keepsake: frozen copies of the paper colours, so it prints the same in both study arms
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

/* typed here, since the FontFaceSet lib type is not in every lib.dom this builds against */
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
    /* a face that will not load is not a reason to withhold the file, because if the artifact cannot leave the machine there is nothing to hand in */
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

  /* the same rows the card shows in the same order, in two columns so a long cord list has somewhere to go instead of running off the page */
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
    /* a value longer than the column is cut with an ellipsis rather than overrunning the frame, because the printed page has one width and no scroll */
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
