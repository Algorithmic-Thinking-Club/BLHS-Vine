// GPA, ranks and graduation cords, worked out from the run's ledger of classes and activities

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

/** the one passing rule everywhere: a D or better earns the credit, an F earns nothing */
export const PASSING_GRADE = 1.0
const passed = (e: SaveGame['ledger'][number]) => e.grade >= PASSING_GRADE

/** rank ladder (§8.2): years invested in one programme's track */
export const rankName = (years: number) =>
  years >= 3 ? 'Captain' : years >= 2 ? 'Varsity' : years >= 1 ? 'JV' : null

/** how many years the student has put into each rank track, counted off the completion record */
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
  // true when this cord is only decided at graduation rather than earned along the way
  settlesAtGraduation?: boolean
  earned: boolean
  progress: number               // 0..1 toward earning (for the fraying-thread render)
  detail: string                 // live status line ("3 of 5 AP classes passed")
}

// the source line a student reads under a cord, naming a school document they could go and find
const AWARDS = 'the BLHS awards list, from Ms. Pinzon'

/** what the game says about there being no cord for reaching Captain */
export const NO_ATHLETIC_CORD =
  'Bonney Lake awards no cord for reaching Captain. Your rank is printed on your diploma instead. ' +
  `Source: ${AWARDS}.`

const count = (s: SaveGame, f: (e: SaveGame['ledger'][number]) => boolean) => s.ledger.filter(f).length

/** passed credits in the student's strongest single world language, and which one it is */
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
  // Key Club's rank track is looked up on the roster rather than spelled out here
  const keyYears = ranksOf(s)[rankTrackOf('key-club') ?? 'keyclub'] ?? 0

  return [
    {
      id: 'highest-honors', name: 'Highest Honors', colors: 'double gold',
      rule: 'GPA 3.76-4.0', source: AWARDS, published: true,
      model: 'Counted at graduation, from your GPA across all four years.',
      settlesAtGraduation: true,
      earned: finished && gpa >= 3.76, progress: Math.min(1, gpa / 3.76),
      // a student with no grades yet is told so, rather than being shown a 0.00
      /* ---- A GPA AT ITS TARGET SAYS SO (Ash, 2026-09-09) ---------------
       *
       * *"I'm not on year 4 yet, but the highest honors bar and the high honors
       * bar are showing nearly full. Is this normal? It's not earned yet, which
       * is correct."*
       *
       * The bar was right and the sentence beside it was not: a student holding
       * a 4.00 read "GPA 4.00 of 3.76" off a full bar and had no idea whether
       * that was good news. These two settle at graduation, which is the whole
       * of why they are not earned yet, so that is what the line says. */
      detail: !gpa ? 'No GPA yet. You need 3.76.'
        : gpa >= 3.76 ? `GPA ${gpa.toFixed(2)}. On track, counted at graduation.`
          : `GPA ${gpa.toFixed(2)} of 3.76`,
    },
    {
      id: 'high-honors', name: 'High Honors', colors: 'black & silver',
      rule: 'GPA 3.5-3.759', source: AWARDS, published: true,
      model: 'Counted at graduation. You can only get one of these two, and Highest Honors comes first.',
      settlesAtGraduation: true,
      earned: finished && gpa >= 3.5 && gpa < 3.76,
      /* a GPA past 3.76 is not more of THIS cord, it is a different one */
      progress: gpa >= 3.76 ? 0 : Math.min(1, gpa / 3.5),
      detail: !gpa ? 'No GPA yet. You need 3.5.'
        /* and this one has a ceiling as well as a floor: a 3.9 is Highest
         * Honors and is NOT this cord, so a full bar here would be a lie */
        : gpa >= 3.76 ? `GPA ${gpa.toFixed(2)}. Above this one: you are on Highest Honors.`
          : gpa >= 3.5 ? `GPA ${gpa.toFixed(2)}. On track, counted at graduation.`
            : `GPA ${gpa.toFixed(2)} of 3.5`,
    },
    {
      id: 'career-readiness', name: 'Career Readiness', colors: 'green, teal & purple',
      rule: 'Must have completed at least two CTE credits', source: AWARDS, published: true,
      model: 'Pass two CTE classes. CTE is Career and Technical Education, like Culinary Arts. A D passes.',
      earned: cte >= 2, progress: Math.min(1, cte / 2),
      /* ---- A COUNT STOPS AT ITS OWN TARGET (Ash, 2026-09-09) -------------
       *
       * *"All three years, its only shown 'CTE credit' and its just been adding
       * on, 1/2, 2/2, 3/2, 4/2, etc."*
       *
       * `progress` was clamped and the sentence beside it was not, so a student
       * who passed four CTE classes read "4 of 2 CTE credits" off a full bar.
       * Every counted cord below now says how many it needed, not how many it
       * has been handed. */
      detail: `${Math.min(cte, 2)} of 2 CTE credits`,
    },
    {
      id: 'key-club', name: 'Key Club', colors: 'navy',
      rule: 'Active International Key Club member for at least 2 years, including senior year; GPA over 3.0; '
        + '40+ volunteer hours each year over 4 years (over 160 hours total); attend 15 meetings each year and 5+ service events',
      source: AWARDS, published: true,
      model: 'This game only counts your years in Key Club and your GPA. '
        + 'It does not count hours, meetings or events.',
      earned: keyYears >= 2 && s.year >= 4 && gpa >= 3.0,
      /* ---- A GATE IS NOT PROGRESS (Ash, 2026-09-09) --------------------
       *
       * *"She says 'still working towards Key Club' even though I havent done
       * it... bit weird. Oh I realize why it says Key Club, as its a GPA
       * thing."*
       *
       * The bar was seven tenths years and three tenths GPA, so a student who
       * had never once joined Key Club and simply had good grades read thirty
       * percent, which put the cord in the counselor's "working towards" list
       * and in the closing film's drape. He had not started it.
       *
       * The GPA is a requirement the cord can FAIL on, not a thing you do
       * towards it. The bar measures the joining; the sentence names the gate,
       * and says so when the gate is the thing in the way. */
      progress: Math.min(keyYears, 2) / 2,
      detail: [
        `${Math.min(keyYears, 2)} of 2 years`,
        !gpa ? 'no GPA yet'
          : gpa >= 3.0 ? `GPA ${gpa.toFixed(2)}, over the 3.0 it needs`
            : `GPA ${gpa.toFixed(2)}, under the 3.0 it needs`,
      ].join(' · '),
    },
    {
      id: 'ap-honors', name: 'AP Honors', colors: 'AP blue',
      rule: 'Pass 5 or more AP courses', source: AWARDS, published: true,
      model: 'Passing means a D or better, the same as any other class. The class counts, not the AP exam.',
      earned: ap >= 5, progress: Math.min(1, ap / 5),
      detail: `${Math.min(ap, 5)} of 5 AP classes passed`,
    },
    {
      id: 'ap-capstone', name: 'AP Capstone', colors: 'capstone silver',
      rule: 'AP Seminar & Research plus 4 additional AP classes', source: AWARDS, published: true,
      model: 'Pass six AP classes in all. Two of them have to be AP Seminar and AP Research. The exams are not counted.',
      earned: apSeminar >= 1 && apResearch >= 1 && ap >= 6,
      progress: Math.min(1, (apSeminar + apResearch) / 2 * 0.5 + Math.min(1, Math.max(0, ap - 2) / 4) * 0.5),
      // words rather than tick marks, because this string is printed and a glyph cannot be redrawn
      detail: `Seminar ${apSeminar ? 'passed' : 'not yet'}, Research ${apResearch ? 'passed' : 'not yet'}, ${ap} APs passed`,
    },
    {
      id: 'seal-biliteracy', name: 'Seal of Biliteracy', colors: 'gold medal',
      rule: 'Awarded to students who show proficiency in English and at least one other language before high school graduation',
      source: `${AWARDS} · RCW 28A.300.575 · WAC 392-410-350 (OSPI)`, published: true,
      model: 'Take four credits of the same world language. '
        + 'Graduating counts as the English part.',
      earned: lang.best >= 4,
      progress: Math.min(1, lang.best / 4),
      detail: lang.family
        ? `${lang.best} of 4 credits in one language (${lang.family})`
        : '0 of 4 credits in one language',
    },
    // two real awards with no published criteria, listed saying so and never earned
    ...['Valedictorian', 'Salutatorian'].map((name, i) => ({
      id: name.toLowerCase(),
      name,
      colors: 'color not announced',
      rule: 'Bonney Lake High School has not published criteria for this award.',
      source: `${AWARDS}, which marks this a known gap`,
      model: `In this game it would go to the ${i === 0 ? 'highest' : 'second-highest'} GPA in the class. `
        + 'That is the game\'s own model, not a rule from Bonney Lake.',
      published: false,
      earned: false,
      progress: 0,
      detail: 'Not awarded in this game.',
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
