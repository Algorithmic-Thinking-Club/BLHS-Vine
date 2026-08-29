// THE PROGRESSION ENGINE (GAME-DESIGN §8) — pure functions over the run's ledger.
// GPA is a credit-weighted mean on the real BLHS 4.0 scale; the cords table mirrors
// docs/research/blhs-awards-authoritative.md EXACTLY (nothing invented; Valedictorian
// stays out until real criteria exist). The Handbook's cord tracker, the planner's margin
// notes, and the cape ceremony all read THIS module — one truth for what was earned.

import type { SaveGame } from './save'

export function gpaOf(s: SaveGame): number | null {
  if (!s.ledger.length) return null
  let pts = 0, cr = 0
  for (const e of s.ledger) { pts += e.grade * e.credit; cr += e.credit }
  return cr ? Math.round((pts / cr) * 100) / 100 : null
}

export const letterOf = (g: number) =>
  g >= 3.85 ? 'A' : g >= 3.5 ? 'A-' : g >= 3.15 ? 'B+' : g >= 2.85 ? 'B' : g >= 2.5 ? 'B-' :
  g >= 2.15 ? 'C+' : g >= 1.85 ? 'C' : g >= 1.5 ? 'C-' : g >= 1.0 ? 'D' : 'F'

/** rank ladder (§8.2): years invested in one programme's track */
export const rankName = (years: number) =>
  years >= 3 ? 'Captain' : years >= 2 ? 'Varsity' : years >= 1 ? 'JV' : null

/* YEARS INVESTED, DERIVED FROM THE COMPLETION RECORD RATHER THAN STORED.
 *
 * `save.ranks` had four readers and zero writers, so every ladder in the game
 * stood at zero forever and the only thing that ever moved one was a test
 * writing the field by hand. Deriving it means a stored count can never disagree
 * with the ledger, which is the failure a writer would have introduced.
 *
 * A year counts once no matter how many times the programme was replayed inside
 * it, because a ladder is years invested and not visits made. The stored field is
 * still merged in, because a save written before this shipped carries real
 * progress in it and a forward-compatible read defaults rather than wipes. */
export function ranksOf(s: SaveGame): Record<string, number> {
  const years = new Map<string, Set<number>>()
  for (const c of s.completions ?? []) {
    if (!c.rank) continue
    const set = years.get(c.rank) ?? new Set<number>()
    set.add(c.year)
    years.set(c.rank, set)
  }
  const out: Record<string, number> = { ...s.ranks }
  for (const [track, set] of years) out[track] = Math.max(out[track] ?? 0, set.size)
  return out
}

export type CordProgress = {
  id: string
  name: string
  colors: string                 // the real cord colors, for the tracker art
  rule: string                   // the criteria in plain words (shown to students verbatim)
  earned: boolean
  progress: number               // 0..1 toward earning (for the fraying-thread render)
  detail: string                 // live status line ("3 of 5 AP classes passed")
}

const count = (s: SaveGame, f: (e: SaveGame['ledger'][number]) => boolean) => s.ledger.filter(f).length

/** every cord/seal evaluated live against the run (§8.4's authoritative table) */
export function cordsOf(s: SaveGame): CordProgress[] {
  const gpa = gpaOf(s) ?? 0
  const finished = s.introDone && s.year >= 4 // final-GPA cords only settle at graduation
  const cte = count(s, (e) => !!e.tags?.includes('cte') && e.grade >= 1)
  const ap = count(s, (e) => !!e.tags?.includes('ap') && e.grade >= 2)          // pass = C or better
  const apSeminar = count(s, (e) => e.id === 'class:ap-seminar' && e.grade >= 2)
  const apResearch = count(s, (e) => e.id === 'class:ap-research' && e.grade >= 2)
  const lang = count(s, (e) => !!e.tags?.includes('lang') && e.grade >= 2)
  const langCap = count(s, (e) => !!e.tags?.includes('lang-capstone') && e.grade >= 2)
  const keyYears = ranksOf(s)['keyclub'] ?? 0

  return [
    {
      id: 'highest-honors', name: 'Highest Honors', colors: 'double gold',
      rule: 'Finish with a GPA of 3.76 to 4.0.',
      earned: finished && gpa >= 3.76, progress: Math.min(1, gpa / 3.76),
      detail: `GPA ${gpa ? gpa.toFixed(2) : '—'} of 3.76`,
    },
    {
      id: 'high-honors', name: 'High Honors', colors: 'black & silver',
      rule: 'Finish with a GPA of 3.5 to 3.759.',
      earned: finished && gpa >= 3.5 && gpa < 3.76, progress: Math.min(1, gpa / 3.5),
      detail: `GPA ${gpa ? gpa.toFixed(2) : '—'} of 3.5`,
    },
    {
      id: 'career-readiness', name: 'Career Readiness', colors: 'green, teal & purple',
      rule: 'Earn two or more CTE credits.',
      earned: cte >= 2, progress: Math.min(1, cte / 2),
      detail: `${cte} of 2 CTE credits`,
    },
    {
      id: 'key-club', name: 'Key Club', colors: 'navy',
      rule: 'Two or more years in Key Club including senior year, GPA 3.0 or better, service events each year.',
      earned: keyYears >= 2 && s.year >= 4 && gpa >= 3.0,
      progress: Math.min(1, (Math.min(keyYears, 2) / 2) * 0.7 + (gpa >= 3.0 ? 0.3 : 0)),
      detail: `${keyYears} of 2 years · GPA ${gpa ? gpa.toFixed(2) : '—'} of 3.0`,
    },
    {
      id: 'ap-honors', name: 'AP Honors', colors: 'AP blue',
      rule: 'Pass five or more AP classes.',
      earned: ap >= 5, progress: Math.min(1, ap / 5),
      detail: `${ap} of 5 AP classes passed`,
    },
    {
      id: 'ap-capstone', name: 'AP Capstone', colors: 'capstone silver',
      rule: 'Pass AP Seminar, AP Research, and four more AP classes.',
      earned: apSeminar >= 1 && apResearch >= 1 && ap >= 6,
      progress: Math.min(1, (apSeminar + apResearch) / 2 * 0.5 + Math.min(1, Math.max(0, ap - 2) / 4) * 0.5),
      detail: `Seminar ${apSeminar ? '✓' : '·'} Research ${apResearch ? '✓' : '·'} · ${ap} APs passed`,
    },
    {
      id: 'seal-biliteracy', name: 'Seal of Biliteracy', colors: 'gold medal',
      rule: 'Three or more years of one world language, through a passed capstone.',
      earned: lang >= 3 && langCap >= 1,
      progress: Math.min(1, (Math.min(lang, 3) / 3) * 0.8 + (langCap ? 0.2 : 0)),
      detail: `${lang} of 3 language years · capstone ${langCap ? '✓' : 'not yet'}`,
    },
  ]
}

/** honor-reveal moments (§8.4): fire the first time a cord becomes reachable-and-close */
export function newlyCloseCords(before: SaveGame, after: SaveGame): CordProgress[] {
  const prev = new Map(cordsOf(before).map((c) => [c.id, c.progress]))
  return cordsOf(after).filter((c) => c.progress >= 0.5 && (prev.get(c.id) ?? 0) < 0.5 && !c.earned)
}

/** the run summarized for the turn-in artifact (§9.5). The SAME function runs client-side
 *  (stamping the diploma) and server-side (api/teacher's roster column) over the synced
 *  save — that is what makes the verification code checkable. */
export function transcriptOf(s: SaveGame): import('../vine/verify').Transcript {
  return {
    participantId: s.participantId ?? 'castaway',
    handle: s.handle,
    gpa: gpaOf(s),
    cords: cordsOf(s).filter((c) => c.earned).map((c) => c.id).sort(),
    ranks: ranksOf(s),
    islandsCompleted: Object.values(s.islands).filter((st) => st === 'completed').length,
    /* EXPOSURE AND COMPLETION ARE TWO NUMBERS. Places seen is the awareness
     * measure and programmes finished is the learning one, and counting either as
     * the other moves the independent variable's extent by the modelling. */
    placesSeen: new Set((s.exposure ?? []).map((e) => e.place)).size,
    programmesCompleted: new Set((s.completions ?? []).map((c) => c.programme)).size,
    factsLearned: s.facts.length,
    years: s.year,
  }
}
