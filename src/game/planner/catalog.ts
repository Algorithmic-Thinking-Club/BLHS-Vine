// the planner catalog, what a class pick can buy, built from the real BLHS course list: grade eligibility is expressed as game years 1 to 4, ledger ids are `class:<id>`, and progress.ts keys AP Capstone on class:ap-seminar and class:ap-research
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

/** every class this year's sheet may offer: grade eligible, with the prerequisite satisfied by a class picked in an earlier year, stamped or not */
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
  /* a fourth year of one language is the fourth credit, not a capstone */
  if (tags.includes('lang-capstone')) return 'the fourth credit of one language: the Seal of Biliteracy'
  const parts: string[] = []
  if (tags.includes('ap')) parts.push('counts toward AP Honors (5 APs)')
  if (tags.includes('cte')) parts.push('a CTE credit (Career Readiness needs 2)')
  if (tags.includes('lang')) parts.push('a credit toward the Seal of Biliteracy (4 in one language)')
  return parts.length ? parts.join(' · ') : null
}

// what the picker offers: every course in catalog order, each with why it is shut

export type ClassOffer = {
  c: ClassDef
  /** why this course cannot go on this year's sheet, or null when it can */
  why: string | null
  /* true when what shuts it is the game's own ladder rather than the district catalog */
  ladder: boolean
}

/* the line above the picker saying the prerequisite order is the game's rule, not the school's */
export const LADDER_NOTE =
  'Some classes need an earlier class first. This game sets that order, not the school.'

/** when a course opens, in the catalog's own grade eligibility */
function whenItOpens(years: number[]): string {
  const ys = [...years].sort((a, b) => a - b)
  if (ys.length === 1) return `open in year ${ys[0]} only`
  const runsToTheEnd = ys[ys.length - 1] === 4 && ys.every((y, i) => y === ys[0] + i)
  if (runsToTheEnd) return `opens in year ${ys[0]}`
  return `open in years ${ys.join(', ')} only`
}

/* every course in the catalog, carrying why it is shut when it is */
export function classOffer(year: number, pickedByYear: Record<number, string[]>): ClassOffer[] {
  const before = new Set<string>()
  for (let y = 1; y < year; y++) for (const id of pickedByYear[y] ?? []) before.add(id)
  const thisYear = new Set(pickedByYear[year] ?? [])
  return CLASSES.map((c): ClassOffer => {
    if (thisYear.has(c.id)) return { c, why: 'already picked this year', ladder: false }
    if (before.has(c.id)) return { c, why: 'you have taken it', ladder: false }
    if (!c.years.includes(year)) return { c, why: whenItOpens(c.years), ladder: false }
    if (c.requires && !before.has(c.requires)) {
      const rung = classById(c.requires)
      return { c, why: `take ${rung?.name ?? c.requires} first`, ladder: true }
    }
    return { c, why: null, ladder: false }
  })
}

/* the four department headings live here rather than in the sheet, because a second copy in a component is a second place a rename has to reach */
export const DEPT_LABEL: Record<Dept, string> = {
  ap: 'Advanced Placement',
  lang: 'World Languages',
  cte: 'Career and Technical',
  arts: 'Arts',
}

export const DEPTS: Dept[] = ['ap', 'lang', 'cte', 'arts']
