/* THE PROGRESSION ENGINE (GAME-DESIGN §8) — pure functions over the run's ledger.
 *
 * The cord table is the school's, forwarded from Ms. Pinzon via Wiseman, and it
 * lives at `docs/blhs/awards.md`. This file used to cite
 * `docs/research/blhs-awards-authoritative.md`, which has never existed, and so
 * did three other files and two test files. Six citations to a document nobody
 * could open, and under cover of them three criteria on this page were invented.
 *
 * V3, AND IT IS THE LAW THIS FILE IS ORGANISED AROUND: a mechanic that
 * approximates a criterion is never printed as the criterion. So a cord carries
 * `rule`, which is the school's own words and is what a student reads, and
 * `model`, which is what this game actually counts and is printed BESIDE the rule
 * and never instead of it. Where the two are the same, `model` is absent.
 *
 * WHAT WAS INVENTED, NAMED SO IT CANNOT COME BACK:
 *  - "pass = C or better" on AP Honors, AP Capstone and the language cords. The
 *    district passes a D. SBLSD policy 2410 and the BLHS grading scale: A through
 *    D earn the credit, F alone earns nothing, and it is one rule for every
 *    course. Resolved 2026-08-28.
 *  - "three or more years of one world language, through a passed capstone" on
 *    the Seal of Biliteracy. The real rule is Washington's: RCW 28A.300.575 and
 *    WAC 392-410-350, English proficiency plus four credits of one world language
 *    or a qualifying assessment. Resolved 2026-08-28.
 *  - the four-classes-per-credit CTE figure, which came from nowhere. A year-long
 *    class is 1.0 credit in Washington practice, so the cord is two of them.
 *
 * AND WHAT IS STILL UNKNOWN IS MARKED RATHER THAN FILLED. Valedictorian and
 * Salutatorian are real awards this school makes and nobody has published their
 * criteria; Wiseman flagged the gap himself. They appear on the board saying so.
 * There is no athletic cord at all, and NO_ATHLETIC_CORD below says that in the
 * school's absence of words rather than in invented ones.
 */

import type { SaveGame } from './save'
import { rankTrackOf } from './roster/roster'

export function gpaOf(s: SaveGame): number | null {
  if (!s.ledger.length) return null
  let pts = 0, cr = 0
  for (const e of s.ledger) { pts += e.grade * e.credit; cr += e.credit }
  return cr ? Math.round((pts / cr) * 100) / 100 : null
}

export const letterOf = (g: number) =>
  g >= 3.85 ? 'A' : g >= 3.5 ? 'A-' : g >= 3.15 ? 'B+' : g >= 2.85 ? 'B' : g >= 2.5 ? 'B-' :
  g >= 2.15 ? 'C+' : g >= 1.85 ? 'C' : g >= 1.5 ? 'C-' : g >= 1.0 ? 'D' : 'F'

/* THE ONE PASSING RULE, EVERYWHERE.
 *
 * D or better earns the credit; F earns nothing. SBLSD policy 2410's procedure
 * says a student earns credit by "earning a passing grade according to the
 * district's grading policy", and the BLHS scale runs A (4.0) to D (60-66, 1.0)
 * with F (59 and below, 0.0) the only failing mark. There is not a second, higher
 * bar for an AP class, and the C threshold that used to sit in this file was
 * invented. The game's own retake-below-2.7 rule is a GAME rule and is never
 * printed as the school's. */
export const PASSING_GRADE = 1.0
const passed = (e: SaveGame['ledger'][number]) => e.grade >= PASSING_GRADE

/** rank ladder (§8.2): years invested in one programme's track */
export const rankName = (years: number) =>
  years >= 3 ? 'Captain' : years >= 2 ? 'Varsity' : years >= 1 ? 'JV' : null

/* YEARS INVESTED, DERIVED FROM THE COMPLETION RECORD RATHER THAN STORED.
 *
 * `save.ranks` had four readers and zero writers, so every ladder in the game
 * stood at zero forever and the only thing that ever moved one was a test writing
 * the field by hand. Deriving it means a stored count can never disagree with the
 * ledger, which is the failure a writer would have introduced.
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
  /* THE SCHOOL'S OWN WORDS, VERBATIM, and the only string a student reads as the
   * criterion. Where the school did not give words, this says that instead. */
  rule: string
  /** where those words came from, precisely enough to follow */
  source: string
  /* WHAT THIS GAME ACTUALLY COUNTS, when it is not the same thing. Printed beside
   * the rule and never in place of it (V3). Absent when the game counts the
   * criterion itself. */
  model?: string
  /* has anybody published criteria for this award at all. `false` means the award
   * is real and the rule is a gap, which is a different sentence from "you have
   * not earned it yet" and has to read differently on the board. */
  published: boolean
  earned: boolean
  progress: number               // 0..1 toward earning (for the fraying-thread render)
  detail: string                 // live status line ("3 of 5 AP classes passed")
}

const AWARDS = 'docs/blhs/awards.md, from Ms. Pinzon via Wiseman, 2026-06-28'

/* THE SCHOOL AWARDS NO CORD FOR A CAPTAINCY, and the correct response to that is
 * to say so rather than to invent one. Football is season-locked to fall, three
 * season tokens a year over four years is twelve of which four are ever fall, so
 * Captain of a fall sport costs three of the four fall tokens a student will ever
 * hold. A quarter of everything they can spend. What it buys at graduation is a
 * line on the diploma, and that is the honest answer until somebody with
 * authority decides otherwise. */
export const NO_ATHLETIC_CORD =
  'Bonney Lake awards no cord for reaching Captain. Ranks are printed on the diploma instead. ' +
  `Source: ${AWARDS}, which lists every cord the school gives and has no athletic award in it.`

const count = (s: SaveGame, f: (e: SaveGame['ledger'][number]) => boolean) => s.ledger.filter(f).length

/* CREDITS OF ONE WORLD LANGUAGE, which is what the state rule counts and what the
 * old code did not. Class ids are `spanish-3`, `french-1`, `asl-2`, so the family
 * is the id with its trailing sequence number taken off, and the ledger id is
 * `class:<id>`. Counting every language-tagged pass together would let two years
 * of Spanish and two of French earn a seal for proficiency in neither. */
function languageCredits(s: SaveGame): { best: number; family: string | null } {
  const byFamily = new Map<string, number>()
  for (const e of s.ledger) {
    if (!e.tags?.includes('lang') || !passed(e)) continue
    const m = /^class:([a-z]+)-\d+$/.exec(e.id)
    if (!m) continue
    byFamily.set(m[1], (byFamily.get(m[1]) ?? 0) + 1)
  }
  let best = 0, family: string | null = null
  for (const [k, n] of byFamily) if (n > best) { best = n; family = k }
  return { best, family }
}

/** every cord and seal evaluated live against the run (§8.4's authoritative table) */
export function cordsOf(s: SaveGame): CordProgress[] {
  const gpa = gpaOf(s) ?? 0
  const finished = s.introDone && s.year >= 4 // final-GPA cords only settle at graduation
  const cte = count(s, (e) => !!e.tags?.includes('cte') && passed(e))
  const ap = count(s, (e) => !!e.tags?.includes('ap') && passed(e))
  const apSeminar = count(s, (e) => e.id === 'class:ap-seminar' && passed(e))
  const apResearch = count(s, (e) => e.id === 'class:ap-research' && passed(e))
  const lang = languageCredits(s)
  /* THROUGH THE RESOLVER, not through a literal. This read `ranks['keyclub']` by
   * hand, which is the same duplicated-spelling bug the diploma had: the roster is
   * the only thing that knows a programme's track, and a rename there has to move
   * this too or the cord quietly stops counting. */
  const keyYears = ranksOf(s)[rankTrackOf('key-club') ?? 'keyclub'] ?? 0

  return [
    {
      id: 'highest-honors', name: 'Highest Honors', colors: 'double gold',
      rule: 'GPA 3.76-4.0', source: AWARDS, published: true,
      model: 'Counted at graduation, on the credit-weighted GPA of everything on your transcript.',
      earned: finished && gpa >= 3.76, progress: Math.min(1, gpa / 3.76),
      detail: `GPA ${gpa ? gpa.toFixed(2) : '—'} of 3.76`,
    },
    {
      id: 'high-honors', name: 'High Honors', colors: 'black & silver',
      rule: 'GPA 3.5-3.759', source: AWARDS, published: true,
      model: 'Counted at graduation. The two GPA bands are exclusive, so double gold outranks this one.',
      earned: finished && gpa >= 3.5 && gpa < 3.76, progress: Math.min(1, gpa / 3.5),
      detail: `GPA ${gpa ? gpa.toFixed(2) : '—'} of 3.5`,
    },
    {
      id: 'career-readiness', name: 'Career Readiness', colors: 'green, teal & purple',
      rule: 'Must have completed at least two CTE credits', source: AWARDS, published: true,
      model: 'A year-long CTE class is one credit, so the game counts two passed CTE classes. A D passes.',
      earned: cte >= 2, progress: Math.min(1, cte / 2),
      detail: `${cte} of 2 CTE credits`,
    },
    {
      id: 'key-club', name: 'Key Club', colors: 'navy',
      rule: 'Active International Key Club member for at least 2 years, including senior year; GPA over 3.0; '
        + '40+ volunteer hours each year over 4 years (over 160 hours total); attend 15 meetings each year and 5+ service events',
      source: AWARDS, published: true,
      model: 'The game counts the years you invested and your GPA. It does not count hours, meetings or events, '
        + 'because it never asked you for any.',
      earned: keyYears >= 2 && s.year >= 4 && gpa >= 3.0,
      progress: Math.min(1, (Math.min(keyYears, 2) / 2) * 0.7 + (gpa >= 3.0 ? 0.3 : 0)),
      detail: `${keyYears} of 2 years · GPA ${gpa ? gpa.toFixed(2) : '—'} of 3.0`,
    },
    {
      id: 'ap-honors', name: 'AP Honors', colors: 'AP blue',
      rule: 'Pass 5 or more AP courses', source: AWARDS, published: true,
      model: 'Passing means a D or better, which is the district rule for every course. Not the exam: the course.',
      earned: ap >= 5, progress: Math.min(1, ap / 5),
      detail: `${ap} of 5 AP classes passed`,
    },
    {
      id: 'ap-capstone', name: 'AP Capstone', colors: 'capstone silver',
      rule: 'AP Seminar & Research plus 4 additional AP classes', source: AWARDS, published: true,
      model: 'Six passed AP courses in total, two of them Seminar and Research. The table says nothing about the exams.',
      earned: apSeminar >= 1 && apResearch >= 1 && ap >= 6,
      progress: Math.min(1, (apSeminar + apResearch) / 2 * 0.5 + Math.min(1, Math.max(0, ap - 2) / 4) * 0.5),
      /* WORDS, BECAUSE THIS IS DATA AND NOT A DRAWING. This composed a tick and a
       * middle dot into a player-facing string, and a string cannot be redrawn:
       * `docs/ART.md` forbids a font glyph as an icon, and this one reached the
       * Handbook's cords board, the yearbook's threads section and the
       * graduation honesty board, three surfaces that each had to filter it or
       * ship it. `Handbook.tsx` grew a `wordsOnly` replacer for exactly this
       * line. A surface that wants to DRAW the two halves needs them as
       * booleans; until one does, the sentence says what it means. */
      detail: `Seminar ${apSeminar ? 'passed' : 'not yet'}, Research ${apResearch ? 'passed' : 'not yet'}, ${ap} APs passed`,
    },
    {
      id: 'seal-biliteracy', name: 'Seal of Biliteracy', colors: 'gold medal',
      rule: 'Awarded to students who show proficiency in English and at least one other language before high school graduation',
      source: `${AWARDS} · RCW 28A.300.575 · WAC 392-410-350 (OSPI)`, published: true,
      model: 'Washington accepts four credits of one world language, or a qualifying assessment at Intermediate-Mid '
        + 'or better. The game counts the four credits, in ONE language, and takes the English requirement as met by graduating.',
      earned: lang.best >= 4,
      progress: Math.min(1, lang.best / 4),
      detail: lang.family
        ? `${lang.best} of 4 credits in one language (${lang.family})`
        : '0 of 4 credits in one language',
    },
    /* THE TWO THE SCHOOL HAS NOT WRITTEN DOWN.
     *
     * They are real awards and Wiseman flagged the gap himself, so leaving them
     * off the board would be as dishonest as inventing criteria for them: a
     * student reading this page would conclude the school does not give them.
     * They are here, saying what is true, and they are never earned, because a
     * single run has no class rank to compare against. */
    ...['Valedictorian', 'Salutatorian'].map((name, i) => ({
      id: name.toLowerCase(),
      name,
      colors: 'not specified',
      rule: 'Bonney Lake High School has not published criteria for this award.',
      source: `${AWARDS}, which marks this a known gap`,
      model: `In this game it would go to the ${i === 0 ? 'highest' : 'second-highest'} cumulative GPA in the class. `
        + 'That is the game\'s own model and not the school\'s rule, and nothing here claims to know the school\'s.',
      published: false,
      earned: false,
      progress: 0,
      detail: 'criteria not published',
    })),
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
