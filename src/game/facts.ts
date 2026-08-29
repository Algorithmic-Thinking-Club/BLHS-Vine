/* ONE STATEMENT PER FACT, AND EVERY ONE SAYS WHERE IT CAME FROM.
 *
 * This ships to fourteen year olds who have not started at this school yet, and
 * some of them will believe whatever the game says about it. So a sentence about
 * Bonney Lake lives here once, with the document it came out of and the date
 * somebody checked it, and nothing anywhere else may state the same fact in its
 * own words.
 *
 * IT USED TO LIVE IN A TRANSITION COMPONENT. `FACTS` was an array inside
 * src/app/transitions.tsx, which is a loading screen, and three surfaces imported
 * it from there: the loading card, the Handbook's Facts tab and a beat's takeaway
 * cards. A fact table is not a UI concern and a loading pool is not the fact
 * table; the pool is a view of it, and it is derived at the bottom of this file.
 *
 * WHAT A SOURCE MAY BE. A document this repository holds, with the section, or a
 * public URL. `docs/research/blhs-awards-authoritative.md` and
 * `docs/research/blhs-specifics.md` were cited by eight files and NEITHER HAS
 * EVER EXISTED; the real documents are `docs/blhs/awards.md`, forwarded from
 * Ms. Pinzon via Wiseman, and `docs/blhs/sourced-facts.md`. A citation nobody can
 * follow is not a citation, and eight of them survived because nothing ever
 * checked.
 *
 * AND WHAT A SOURCE MAY NOT BE. If no document says it, it does not go here. The
 * marker for a thing the school really awards whose criteria nobody has published
 * is in progress.ts, next to the cord it is about, and it says so on screen.
 */

export type Fact = {
  id: string
  /** the statement, as a player reads it. One sentence per fact. */
  text: string
  /** the document or URL it came out of, precisely enough to follow */
  source: string
  /** when a person last read that source and confirmed this sentence */
  checked: string
}

const AWARDS = 'docs/blhs/awards.md (Ms. Pinzon via Wiseman)'
const AWARDS_RESOLVED = 'docs/blhs/awards.md, resolved 2026-08-28 from district and OSPI sources'
const SOURCED = 'docs/blhs/sourced-facts.md'
const HANDBOOK = 'docs/blhs/sourced-facts.md · 2025-2026 BLHS Student Handbook'
const CATALOG = 'docs/blhs/sourced-facts.md · 2024-2025 SBLSD Course Catalog'

export const FACTS: Fact[] = [
  { id: 'f-opened', text: 'Bonney Lake High School opened in 2005. The Panthers have been teal and black from day one.', source: `${SOURCED} §5 identity`, checked: '2026-06-28' },
  { id: 'f-ap-school', text: 'BLHS is the AP school of the Sumner-Bonney Lake district. AP Capstone lives here.', source: `${SOURCED} §5 identity`, checked: '2026-06-28' },
  { id: 'f-power', text: 'The POWER values are the school’s compass. You’ll meet all five letters.', source: `${HANDBOOK} p.6`, checked: '2026-06-28' },
  { id: 'f-students', text: 'Around 1,700 students walk the halls of BLHS. Every one of them started as a freshman.', source: `${SOURCED} §5 identity`, checked: '2026-06-28' },
  { id: 'f-becu', text: 'BLHS runs a real in-school BECU branch. It opened back in 2006.', source: `${SOURCED} §5 campus fact`, checked: '2026-06-28' },

  /* THE CORD FACTS, and three of them said something no source does.
   *
   * `f-seal` claimed three years of a language earn the Seal of Biliteracy and
   * `f-capstone` ended "with the exams passed". Neither clause is in the school's
   * table or in the state rule; both were written by somebody filling a gap. The
   * criteria below are the school's own words and the state's own rule, and where
   * the game counts something simpler than the rule, progress.ts says so beside
   * the rule rather than printing the simplification as the criterion. */
  { id: 'f-cte-cord', text: 'Earn two CTE credits and the Career Readiness cord is yours at graduation.', source: `${AWARDS} Career Readiness`, checked: '2026-06-28' },
  { id: 'f-seal', text: 'The Seal of Biliteracy goes to students who show proficiency in English and at least one other language before graduation. In Washington that means four credits of one world language or a qualifying assessment.', source: `${AWARDS} Seal of Biliteracy · RCW 28A.300.575 · WAC 392-410-350`, checked: '2026-08-28' },
  { id: 'f-cords', text: 'The counseling office tracks every honor cord. So does your Handbook.', source: `${SOURCED} §counseling`, checked: '2026-08-28' },
  { id: 'f-honor-gpa', text: 'Double gold cords mean Highest Honors: a 3.76 to 4.0 GPA. Black and silver is High Honors, 3.5 to 3.759.', source: `${AWARDS} Highest Honors, High Honors`, checked: '2026-06-28' },
  { id: 'f-capstone', text: 'AP Capstone is a recipe: AP Seminar, then AP Research, plus four more AP classes.', source: `${AWARDS} AP Capstone`, checked: '2026-06-28' },

  // core-beat takeaways (§7.3) land in this same pool — one truth per fact, one id per card
  { id: 'f-power-full', text: 'Panther POWER: Perseverance, Ownership, Work Ethic, Engagement, Respect. Five letters, the whole culture.', source: `${HANDBOOK} p.6`, checked: '2026-06-28' },
  { id: 'f-monday', text: 'Mondays start late at 8:30 and advisory meets that morning. Every other day starts at 7:25.', source: `${HANDBOOK} p.8 bell schedule`, checked: '2026-06-28' },
  { id: 'f-25th-credit', text: 'Passing advisory pays .125 elective credit each semester. The catalog calls it the 25th credit.', source: `${CATALOG} p.7 · ${HANDBOOK} p.8`, checked: '2026-06-28' },
  { id: 'f-join-clubs', text: 'Joining a club is finding its meeting and walking in. DECA meets Thursdays 2:10 in the 200 Flex.', source: `${SOURCED} §1 clubs hub`, checked: '2026-06-28' },
  { id: 'f-retake', text: 'Score under 79% with real effort behind it and the Universal Retake Policy lets you take the summative again.', source: `${HANDBOOK} §grading policy`, checked: '2026-06-28' },
  { id: 'f-24-credits', text: 'A diploma takes 24 credits: 4 English, 3 math, 3 science, 3 social studies, 2 arts, 2 language, 2 health and fitness, 1 CTE, 4 electives.', source: `${SOURCED} §graduation requirements`, checked: '2026-06-28' },
  { id: 'f-running-start', text: 'Juniors and seniors can Running Start: real courses at local colleges, credit on both transcripts.', source: `${SOURCED} §dual credit`, checked: '2026-06-28' },
  { id: 'f-hsbp', text: 'Every Washington graduate finishes a High School and Beyond Plan: where you are headed after the stage, and how.', source: `${SOURCED} §graduation requirements (non-credit)`, checked: '2026-06-28' },
  { id: 'f-passing-grade', text: 'A D earns the credit and an F earns nothing. That is the district grading policy, and it is the same rule for an AP class as for any other.', source: `${AWARDS_RESOLVED} · SBLSD policy 2410 procedure · BLHS grading scale`, checked: '2026-08-28' },
]

const byId = new Map(FACTS.map((f) => [f.id, f]))
export const factById = (id: string): Fact | undefined => byId.get(id)

/** the loading pool: every fact, as text. The pool is a VIEW of the table and
 *  never a second list, which is what "one statement per fact" costs to keep. */
export const factText = (id: string): string | null => byId.get(id)?.text ?? null
