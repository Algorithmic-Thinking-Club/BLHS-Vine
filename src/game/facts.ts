/* one statement per fact about the school, each with the document it came from and the date */

export type Fact = {
  id: string
  /** the statement, as a player reads it. One sentence per fact. */
  text: string
  /** the document or URL it came out of, precisely enough to follow */
  source: string
  /** when a person last read that source and confirmed this sentence */
  checked: string
}

/* the source lines a student reads, naming the school's document rather than a repo path */
const AWARDS = 'the BLHS awards list, from Ms. Pinzon'
const AWARDS_RESOLVED = 'the BLHS awards list, checked against district and state records'
const SOURCED = 'Bonney Lake High School'
const HANDBOOK = 'the 2025-2026 BLHS Student Handbook'
const CATALOG = 'the 2024-2025 Sumner-Bonney Lake course catalog'

export const FACTS: Fact[] = [
  { id: 'f-opened', text: 'Bonney Lake High School opened in 2005. The Panthers have been teal and black from day one.', source: `${SOURCED} §5 identity`, checked: '2026-06-28' },
  { id: 'f-ap-school', text: 'BLHS is the AP school of the Sumner-Bonney Lake district. AP Capstone lives here.', source: `${SOURCED} §5 identity`, checked: '2026-06-28' },
  { id: 'f-power', text: 'The POWER values are what Bonney Lake expects from every student. You will see all five letters.', source: `${HANDBOOK} p.6`, checked: '2026-06-28' },
  { id: 'f-students', text: 'Around 1,700 students walk the halls of BLHS. Every one of them started as a freshman.', source: `${SOURCED} §5 identity`, checked: '2026-06-28' },
  { id: 'f-becu', text: 'BLHS has a real BECU credit union branch inside the school. It opened in 2006.', source: `${SOURCED} §5 campus fact`, checked: '2026-06-28' },

  /* the cord facts, whose criteria are the school's own words and the state rule */
  { id: 'f-cte-cord', text: 'CTE means Career and Technical Education. Earn two CTE credits and you get the Career Readiness cord at graduation.', source: `${AWARDS} Career Readiness`, checked: '2026-06-28' },
  { id: 'f-seal', text: 'The Seal of Biliteracy goes to students who show proficiency in English and at least one other language before graduation. In Washington that means four credits of one world language, or passing an approved language test.', source: `${AWARDS} Seal of Biliteracy · RCW 28A.300.575 · WAC 392-410-350`, checked: '2026-08-28' },
  { id: 'f-cords', text: 'The counseling office tracks every honor cord. This game tracks them for you too.', source: `${SOURCED} §counseling`, checked: '2026-08-28' },
  { id: 'f-honor-gpa', text: 'Double gold cords mean Highest Honors: a 3.76 to 4.0 GPA. Black and silver is High Honors, 3.5 to 3.759.', source: `${AWARDS} Highest Honors, High Honors`, checked: '2026-06-28' },
  { id: 'f-capstone', text: 'AP Capstone is six classes: AP Seminar, then AP Research, plus four more AP classes.', source: `${AWARDS} AP Capstone`, checked: '2026-06-28' },

  // core-beat takeaways (§7.3) land in this same pool — one truth per fact, one id per card
  { id: 'f-power-full', text: 'Panther POWER: Perseverance, Ownership, Work Ethic, Engagement, Respect. Those are the five things the school asks of you.', source: `${HANDBOOK} p.6`, checked: '2026-06-28' },
  { id: 'f-monday', text: 'Mondays start late at 8:30 and Advisory meets that morning. Every other day starts at 7:25.', source: `${HANDBOOK} p.8 bell schedule`, checked: '2026-06-28' },
  { id: 'f-25th-credit', text: 'Passing Advisory earns 0.125 of an elective credit each semester. The course catalog calls it the 25th credit.', source: `${CATALOG} p.7 · ${HANDBOOK} p.8`, checked: '2026-06-28' },
  { id: 'f-join-clubs', text: 'Joining a club is finding its meeting and walking in. DECA meets Thursdays 2:10 in the 200 Flex.', source: `${SOURCED} §1 clubs hub`, checked: '2026-06-28' },
  { id: 'f-retake', text: 'Score under 79% with real effort behind it and the Universal Retake Policy lets you retake the test.', source: `${HANDBOOK} §grading policy`, checked: '2026-06-28' },
  { id: 'f-24-credits', text: 'A diploma takes 24 credits: 4 English, 3 math, 3 science, 3 social studies, 2 arts, 2 language, 2 health and fitness, 1 CTE, 4 electives.', source: `${SOURCED} §graduation requirements`, checked: '2026-06-28' },
  { id: 'f-running-start', text: 'Juniors and seniors can do Running Start: real courses at local colleges, credit on both transcripts.', source: `${SOURCED} §dual credit`, checked: '2026-06-28' },
  { id: 'f-hsbp', text: 'Every Washington graduate finishes a High School and Beyond Plan: where you are headed after high school, and how.', source: `${SOURCED} §graduation requirements (non-credit)`, checked: '2026-06-28' },
  { id: 'f-passing-grade', text: 'A D earns the credit and an F earns nothing. That is the district grading policy, and it is the same rule for an AP class as for any other.', source: `${AWARDS_RESOLVED} · SBLSD policy 2410 procedure · BLHS grading scale`, checked: '2026-08-28' },
]

const byId = new Map(FACTS.map((f) => [f.id, f]))
export const factById = (id: string): Fact | undefined => byId.get(id)

/** the loading pool: every fact, as text. The pool is a VIEW of the table and
 *  never a second list, which is what "one statement per fact" costs to keep. */
export const factText = (id: string): string | null => byId.get(id)?.text ?? null
