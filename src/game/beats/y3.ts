// CORE BEAT, YEAR 3 — "The long game" (§7.3): the 24 credits and how they stack, dual
// credit in its four real flavors, and AP Capstone's exact recipe. All from the 2024-25
// SBLSD course catalog via docs/blhs/sourced-facts.md. No em-dashes in player copy (law §2.8).

import type { CoreBeat } from './frames'

const CP = 'Counselor Pinzon'

export const CORE_Y3: CoreBeat = {
  id: 'core:y3',
  year: 3,
  title: 'The long game',
  place: 'the counseling grove',
  kind: 'core',
  credit: 0.5,
  takeaways: ['f-24-credits', 'f-running-start', 'f-capstone'],
  steps: [
    { kind: 'say', line: { speaker: CP, text: 'Junior year. Time to count. Twenty-four credits stand between anyone and the stage.' } },
    { kind: 'say', line: { speaker: CP, text: 'They stack like this: four of English. Three each of math, science, and social studies. Two of arts, two of world language, two of health and fitness. One CTE. Four electives.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y3-credits',
        prompt: 'How many credits does a diploma actually take here?',
        options: [
          { text: 'Twenty. Four years, five classes', reply: 'Low. You would be four short on the stage.' },
          { text: 'Twenty-four', correct: true, reply: 'Twenty-four. And advisory quietly hands you the 25th.' },
          { text: 'Thirty', reply: 'Nobody is asking for thirty. Twenty-four.' },
        ],
        objective: 'know the credit total',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'Now the accelerants. AP classes here. College in the High School, real college credit inside these walls. CTE dual credit with industry certificates. And Running Start.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y3-runningstart',
        prompt: 'Running Start means a junior or senior can...',
        options: [
          { text: 'Start the school day early', reply: 'That is just Tuesday. Running Start is bigger.' },
          { text: 'Take real courses at local colleges, credit on both transcripts', correct: true, reply: 'Both transcripts at once. Some students graduate with a year of college done.' },
          { text: 'Skip PE with a sports waiver', reply: 'Different program entirely.' },
        ],
        objective: 'know Running Start',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'And if you are building the Capstone, check the recipe now while it can still be finished.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y3-capstone',
        prompt: 'AP Capstone. The exact recipe?',
        options: [
          { text: 'Any five AP classes', reply: 'That is AP Scholar. Capstone is more specific.' },
          { text: 'AP Seminar, then AP Research, plus four more APs, exams passed', correct: true, reply: 'That is the one. Seminar rides with Honors 10 English here, so the ladder starts sophomore year.' },
          { text: 'Straight A grades in everything', reply: 'Admirable. Not the recipe.' },
        ],
        objective: 'know the Capstone rule',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'Everything you pick now is a door you walk through in two years. Pick doors you want on the other side.' } },
  ],
}
