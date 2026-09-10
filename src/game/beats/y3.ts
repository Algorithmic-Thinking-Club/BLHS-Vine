// CORE BEAT, YEAR 3 — "The long game" (§7.3): the 24 credits and how they stack, dual
// credit in its four real flavors, and AP Capstone's exact recipe. All from the 2024-25
// SBLSD course catalog via docs/blhs/sourced-facts.md. No em-dashes in player copy (law §2.8).

import type { CoreBeat } from './frames'

const CP = 'Counselor Pinzon'

export const CORE_Y3: CoreBeat = {
  id: 'core:y3',
  year: 3,
  /* was 'the counseling grove · The long game'. Same ruling as y2: the real room
   * and a title that names the subject. */
  title: 'The 24 credits a diploma takes',
  /* WHERE IT REALLY STAGES (Ash, 2026-09-09). The runner prints this over every
   * step in both arms, and it said "the counselor's office" over a beat the
   * objective bar sends a student to the HEARTH for and the Maw's own island
   * plays at the fire. One of the two was lying and it was this one. */
  place: 'Advisory',
  kind: 'core',
  credit: 0.5,
  takeaways: ['f-24-credits', 'f-running-start', 'f-capstone'],
  steps: [
    { kind: 'say', line: { speaker: CP, text: 'Junior year. Time to count. Twenty-four credits stand between you and graduation.' } },
    { kind: 'say', line: { speaker: CP, text: 'Here they are: four of English. Three each of math, science, and social studies. Two of arts, two of world language, two of health and fitness. One CTE, which means Career and Technical Education. Four electives.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y3-credits',
        prompt: 'How many credits does a diploma actually take here?',
        options: [
          { text: 'Twenty. Four years, five classes', reply: 'Low. You would be four credits short at graduation.' },
          { text: 'Twenty-four', correct: true, reply: 'Twenty-four. And Advisory earns you the 25th.' },
          { text: 'Thirty', reply: 'Nobody is asking for thirty. Twenty-four.' },
        ],
        objective: 'know the credit total',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'Four ways to get ahead. AP classes here. College in the High School, which is real college credit in a class here. CTE dual credit, which comes with an industry certificate. And Running Start.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y3-runningstart',
        prompt: 'What does Running Start let a junior or senior do?',
        options: [
          { text: 'Start the school day early', reply: 'That is just a normal Tuesday. Running Start is college classes.' },
          { text: 'Take real courses at local colleges, credit on both transcripts', correct: true, reply: 'Both transcripts at once. Some students graduate with a year of college done.' },
          { text: 'Skip PE with a sports waiver', reply: 'Different program entirely.' },
        ],
        objective: 'know Running Start',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'And if you want AP Capstone, check what it takes now, while there is still time to finish it.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y3-capstone',
        prompt: 'Which classes does AP Capstone take?',
        options: [
          { text: 'Any five AP classes', reply: 'That is AP Scholar. Capstone is more specific.' },
          { text: 'AP Seminar, then AP Research, plus four more APs, exams passed', correct: true, reply: 'That is the one. AP Seminar is taken with Honors 10 English here, so you start sophomore year.' },
          { text: 'Straight A grades in everything', reply: 'Good grades help. They are not what Capstone asks for.' },
        ],
        objective: 'know the Capstone rule',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'What you pick now decides what you can take as a senior. Pick classes you actually want.' } },
  ],
}
