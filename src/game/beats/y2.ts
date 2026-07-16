// CORE BEAT, YEAR 2 — "The hidden ladder" (§7.3): every real cord and seal, taught two
// years before it is too late to earn them, plus the Universal Retake Policy — which the
// student has probably already USED as a game mechanic by now; this beat names it as the
// real rule it is. All criteria verbatim-faithful to blhs-awards-authoritative.md (the
// list Ms. Pinzon sent through Mr. Wiseman — she hosts, respectfully). No em-dashes in
// player copy (law §2.8).

import type { CoreBeat } from './frames'

const CP = 'Counselor Pinzon'

export const CORE_Y2: CoreBeat = {
  id: 'core:y2',
  year: 2,
  title: 'The hidden ladder',
  place: 'the counseling grove',
  kind: 'core',
  credit: 0.5,
  takeaways: ['f-honor-gpa', 'f-cte-cord', 'f-capstone', 'f-retake'],
  steps: [
    { kind: 'say', line: { speaker: CP, text: 'Most seniors learn about the cords in June, when it is too late to earn half of them. You get the tour in year two. Use it.' } },
    { kind: 'say', line: { speaker: CP, text: 'The GPA cords first. Double gold means Highest Honors, a 3.76 or better. Black and silver is High Honors, 3.5 and up.' } },
    { kind: 'say', line: { speaker: CP, text: 'Career Readiness takes two CTE credits. Key Club’s navy cord takes two active years including senior year, a 3.0, and real service hours.' } },
    { kind: 'say', line: { speaker: CP, text: 'AP Honors is five passed AP classes. AP Capstone is a recipe: Seminar, then Research, plus four more. And the Seal of Biliteracy is proficiency in English and another language.' } },
    {
      kind: 'check',
      check: {
        kind: 'sort', id: 'y2-cords',
        prompt: 'Match each honor to what actually earns it.',
        buckets: ['Double gold', 'Career Readiness', 'AP Honors', 'Seal of Biliteracy'],
        items: [
          { label: 'A GPA of 3.76 or better', bucket: 'Double gold' },
          { label: 'Two CTE credits', bucket: 'Career Readiness' },
          { label: 'Five passed AP classes', bucket: 'AP Honors' },
          { label: 'Proficiency in two languages', bucket: 'Seal of Biliteracy' },
        ],
        objective: 'know the real cord criteria',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'One more rung, and it is not a cord. The Universal Retake Policy. You may have already leaned on it without knowing its name.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y2-retake',
        prompt: 'You scored 71% on a summative and you genuinely worked for it. What does the Universal Retake Policy say?',
        options: [
          { text: 'Tough luck. The grade stands', reply: 'Not here. That is the whole point of the policy.' },
          { text: 'Under 79% with legitimate effort, you retake it', correct: true, reply: 'Exactly. Effort first, then the second chance. It is real, and it is yours.' },
          { text: 'Only seniors can retake', reply: 'Everyone. Freshman year onward.' },
        ],
        objective: 'know the retake policy',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'The ladder is not hidden anymore. Climb what you want to climb, and start this year.' } },
  ],
}
