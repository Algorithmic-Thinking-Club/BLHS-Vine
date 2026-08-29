// THE PLANNER CATALOG (GAME-DESIGN §7.2) — what a CLASS pick can buy.
// EVERY entry is real BLHS content from docs/blhs/sourced-facts.md (law §2.7: real facts
// only, nothing invented): the AP list and grade eligibility are the 2024-2025 SBLSD
// course catalog, the language and CTE sequences likewise. The game-year mapping: year 1
// = 9th grade … year 4 = 12th. Tags feed progress.ts's cord evaluators verbatim ('ap' /
// 'cte' / 'lang' / 'lang-capstone') — a class pick IS cord progress, which is why the
// planner can show counselor hints inline.
//
// WHAT A SEASON TOKEN BUYS IS NO LONGER HERE. `ACTIVITIES`, `ActivityDef`,
// `activityById`, `activityAllowedIn` and `SPORT_SEASONS` were this file's, and every one
// of them was about what EXISTS in the world rather than about one student's sheet. They
// are the roster's now (src/game/roster/roster.ts), because the entry they described
// carried a programme id and a place id in one field and the stadium proves those are two
// things. The planner reads the roster; the roster does not know the planner exists.

// ---- CLASSES (the 2-pick strip) -------------------------------------------------------
// Grade eligibility from the catalog, expressed as game years (1..4). Ledger ids are
// `class:<id>` — progress.ts keys AP Capstone on class:ap-seminar / class:ap-research.
export type Dept = 'ap' | 'lang' | 'cte' | 'arts'

export type ClassDef = {
  id: string
  name: string
  dept: Dept
  years: number[]
  tags: string[]
  /** a prerequisite class id that must be picked in an EARLIER year (language chains) */
  requires?: string
}

const Y = (...ys: number[]) => ys

export const CLASSES: ClassDef[] = [
  // -- the full BLHS AP list (2024-25 catalog; grades -> years) --
  { id: 'ap-human-geo', name: 'AP Human Geography', dept: 'ap', years: Y(1, 2, 3, 4), tags: ['ap'] },
  { id: 'ap-world-history', name: 'AP World History', dept: 'ap', years: Y(2), tags: ['ap'] },
  { id: 'ap-seminar', name: 'AP Seminar (with Honors 10 English)', dept: 'ap', years: Y(2), tags: ['ap'] },
  { id: 'ap-biology', name: 'AP Biology', dept: 'ap', years: Y(2, 3, 4), tags: ['ap'] },
  { id: 'ap-chemistry', name: 'AP Chemistry', dept: 'ap', years: Y(2, 3, 4), tags: ['ap'] },
  { id: 'ap-psychology', name: 'AP Psychology', dept: 'ap', years: Y(2, 3, 4), tags: ['ap'] },
  { id: 'ap-cs-principles', name: 'AP Computer Science Principles', dept: 'ap', years: Y(2, 3, 4), tags: ['ap', 'cte'] },
  { id: 'ap-statistics', name: 'AP Statistics', dept: 'ap', years: Y(2, 3, 4), tags: ['ap', 'cte'] },
  { id: 'ap-music-theory', name: 'AP Music Theory', dept: 'ap', years: Y(2, 3, 4), tags: ['ap'] },
  { id: 'ap-studio-drawing', name: 'AP Studio Art: Drawing', dept: 'ap', years: Y(2, 3, 4), tags: ['ap'] },
  { id: 'ap-studio-2d', name: 'AP Studio Art: 2D Design', dept: 'ap', years: Y(2, 3, 4), tags: ['ap'] },
  { id: 'ap-studio-3d', name: 'AP Studio Art: 3D Design', dept: 'ap', years: Y(2, 3, 4), tags: ['ap'] },
  { id: 'ap-lang', name: 'AP Language and Composition', dept: 'ap', years: Y(3), tags: ['ap'] },
  { id: 'ap-us-history', name: 'AP U.S. History', dept: 'ap', years: Y(3), tags: ['ap'] },
  { id: 'ap-calc-ab', name: 'AP Calculus AB', dept: 'ap', years: Y(3, 4), tags: ['ap'] },
  { id: 'ap-calc-bc', name: 'AP Calculus BC', dept: 'ap', years: Y(3, 4), tags: ['ap'] },
  { id: 'ap-cs-java', name: 'AP Computer Science', dept: 'ap', years: Y(3, 4), tags: ['ap', 'cte'] },
  { id: 'ap-physics-1', name: 'AP Physics 1', dept: 'ap', years: Y(3, 4), tags: ['ap'] },
  { id: 'ap-research', name: 'AP Research', dept: 'ap', years: Y(3, 4), tags: ['ap'] },
  { id: 'ap-spanish', name: 'AP Spanish Language and Culture', dept: 'ap', years: Y(3, 4), tags: ['ap', 'lang', 'lang-capstone'], requires: 'spanish-3' },
  { id: 'ap-lit', name: 'AP Literature and Composition', dept: 'ap', years: Y(4), tags: ['ap'] },
  { id: 'ap-gov', name: 'AP U.S. Government and Politics', dept: 'ap', years: Y(4), tags: ['ap'] },

  // -- world languages (chained sequences) --
  { id: 'spanish-1', name: 'Spanish I', dept: 'lang', years: Y(1, 2, 3, 4), tags: ['lang'] },
  { id: 'spanish-2', name: 'Spanish II', dept: 'lang', years: Y(2, 3, 4), tags: ['lang'], requires: 'spanish-1' },
  { id: 'spanish-3', name: 'Spanish III', dept: 'lang', years: Y(3, 4), tags: ['lang'], requires: 'spanish-2' },
  { id: 'spanish-4', name: 'Spanish IV', dept: 'lang', years: Y(4), tags: ['lang', 'lang-capstone'], requires: 'spanish-3' },
  { id: 'french-1', name: 'French I', dept: 'lang', years: Y(1, 2, 3, 4), tags: ['lang'] },
  { id: 'french-2', name: 'French II', dept: 'lang', years: Y(2, 3, 4), tags: ['lang'], requires: 'french-1' },
  { id: 'french-3', name: 'French III', dept: 'lang', years: Y(3, 4), tags: ['lang'], requires: 'french-2' },
  { id: 'french-4', name: 'French IV', dept: 'lang', years: Y(4), tags: ['lang', 'lang-capstone'], requires: 'french-3' },
  { id: 'asl-1', name: 'American Sign Language I', dept: 'lang', years: Y(1, 2, 3, 4), tags: ['lang', 'cte'] },
  { id: 'asl-2', name: 'American Sign Language II', dept: 'lang', years: Y(2, 3, 4), tags: ['lang', 'cte'], requires: 'asl-1' },

  // -- CTE strands (catalog departments; each feeds a real club/pathway) --
  { id: 'culinary-1', name: 'Culinary Arts I', dept: 'cte', years: Y(1, 2, 3, 4), tags: ['cte'] },
  { id: 'culinary-2', name: 'Culinary Arts II', dept: 'cte', years: Y(2, 3, 4), tags: ['cte'], requires: 'culinary-1' },
  { id: 'culinary-3', name: 'Culinary Arts III', dept: 'cte', years: Y(3, 4), tags: ['cte'], requires: 'culinary-2' },
  { id: 'teaching-academy-1', name: 'Teaching Academy I', dept: 'cte', years: Y(2, 3, 4), tags: ['cte'] },
  { id: 'teaching-academy-2', name: 'Teaching Academy II', dept: 'cte', years: Y(3, 4), tags: ['cte'], requires: 'teaching-academy-1' },
  { id: 'sports-medicine-1', name: 'Sports Medicine I', dept: 'cte', years: Y(2, 3, 4), tags: ['cte'] },
  { id: 'ibam', name: 'Intro to Business and Marketing', dept: 'cte', years: Y(1, 2, 3, 4), tags: ['cte'] },
  { id: 'accounting-1', name: 'Accounting I', dept: 'cte', years: Y(2, 3, 4), tags: ['cte'] },
  { id: 'intro-engineering', name: 'Intro to Engineering Design (PLTW)', dept: 'cte', years: Y(1, 2, 3, 4), tags: ['cte'] },
  { id: 'principles-engineering', name: 'Principles of Engineering (PLTW)', dept: 'cte', years: Y(2, 3, 4), tags: ['cte'], requires: 'intro-engineering' },
  { id: 'aerospace-engineering', name: 'Aerospace Engineering (PLTW)', dept: 'cte', years: Y(3, 4), tags: ['cte'], requires: 'principles-engineering' },
  { id: 'robotics-1', name: 'Robotics I (PLTW)', dept: 'cte', years: Y(2, 3, 4), tags: ['cte'] },
  { id: 'cybersecurity', name: 'Cybersecurity (PLTW)', dept: 'cte', years: Y(2, 3, 4), tags: ['cte'] },
  { id: 'game-design-1', name: 'Game Design I', dept: 'cte', years: Y(1, 2, 3, 4), tags: ['cte'] },
  { id: 'jrotc', name: 'Air Force JROTC', dept: 'cte', years: Y(1, 2, 3, 4), tags: ['cte'] },

  // -- fine / performing arts sequences --
  { id: 'band', name: 'Band', dept: 'arts', years: Y(1, 2, 3, 4), tags: ['arts'] },
  { id: 'choir', name: 'Choir', dept: 'arts', years: Y(1, 2, 3, 4), tags: ['arts'] },
  { id: 'orchestra', name: 'Orchestra', dept: 'arts', years: Y(1, 2, 3, 4), tags: ['arts'] },
  { id: 'drama', name: 'Theatre / Actor’s Studio', dept: 'arts', years: Y(1, 2, 3, 4), tags: ['arts'] },
]

export const classById = (id: string) => CLASSES.find((c) => c.id === id)

/** every class this year's sheet may offer: grade-eligible + prerequisite satisfied by a
 *  class picked (stamped or not) in an EARLIER year */
export function eligibleClasses(year: number, pickedByYear: Record<number, string[]>): ClassDef[] {
  const before = new Set<string>()
  for (let y = 1; y < year; y++) for (const id of pickedByYear[y] ?? []) before.add(id)
  const thisYear = new Set(pickedByYear[year] ?? [])
  return CLASSES.filter((c) =>
    c.years.includes(year) &&
    (!c.requires || before.has(c.requires)) &&
    !before.has(c.id) && !thisYear.has(c.id),
  )
}

/** the inline cord-relevance line (§7.2): why this pick matters, in the counselor's voice */
export function cordHint(tags: string[]): string | null {
  /* THE SEAL HAS NO CAPSTONE. This said "the Seal of Biliteracy's capstone" about
   * a fourth-year language class, which described a rule nobody wrote: Washington
   * counts four credits of one world language, and the fourth one is the fourth
   * credit rather than a capstone that unlocks the other three. */
  if (tags.includes('lang-capstone')) return 'the fourth credit of one language: the Seal of Biliteracy'
  const parts: string[] = []
  if (tags.includes('ap')) parts.push('counts toward AP Honors (5 APs)')
  if (tags.includes('cte')) parts.push('a CTE credit (Career Readiness needs 2)')
  if (tags.includes('lang')) parts.push('a credit toward the Seal of Biliteracy (4 in one language)')
  return parts.length ? parts.join(' · ') : null
}
