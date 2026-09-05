// CORE BEAT, YEAR 2 — "The hidden ladder" (§7.3): every real cord and seal, taught two
// years before it is too late to earn them, plus the Universal Retake Policy — which the
// student has probably already USED as a game mechanic by now; this beat names it as the
// real rule it is. All criteria verbatim-faithful to docs/blhs/awards.md (the list
// Ms. Pinzon sent through Mr. Wiseman — she hosts, respectfully), with the 2026-08-28
// resolutions folded in: a D passes, and the Seal is Washington's own rule. No em-dashes
// in player copy (law §2.8).

import type { CoreBeat } from './frames'

const CP = 'Counselor Pinzon'

export const CORE_Y2: CoreBeat = {
  id: 'core:y2',
  year: 2,
  /* "place · title" is printed above every step of this activity in both arms.
   * It was 'the counseling grove · The hidden ladder'. The words pass,
   * 2026-09-04: the room is the counselor's office and the title says what the
   * activity is about. */
  title: 'Honor cords, and how to earn them',
  place: "the counselor's office",
  kind: 'core',
  credit: 0.5,
  takeaways: ['f-honor-gpa', 'f-cte-cord', 'f-capstone', 'f-retake'],
  steps: [
    { kind: 'say', line: { speaker: CP, text: 'A cord is a rope you wear at graduation for an honor you earned. Most seniors hear about them in June, too late to earn half.' } },
    { kind: 'say', line: { speaker: CP, text: 'Two cords come from your GPA. Highest Honors is a 3.76 or better, and its cords are double gold. High Honors is 3.5 and up, in black and silver.' } },
    { kind: 'say', line: { speaker: CP, text: 'Career Readiness takes two CTE credits. CTE means Career and Technical Education. The navy Key Club cord takes two years as an active member including senior year, a 3.0, forty volunteer hours a year, fifteen meetings a year and five service events.' } },
    { kind: 'say', line: { speaker: CP, text: 'AP Honors is five passed AP courses, and passed means a D or better, same as any class here. AP Capstone takes AP Seminar, then AP Research, plus four more AP classes. The Seal of Biliteracy is proficiency in English and one other language, which in Washington means four credits of one world language.' } },
    {
      kind: 'check',
      check: {
        kind: 'sort', id: 'y2-cords',
        prompt: 'Match each honor to what actually earns it.',
        /* the bucket was 'Double gold', which is the colour of the cord and not
         * the name of the honor, so one chip in four named nothing a student
         * could look up. The other three were already honor names. */
        buckets: ['Highest Honors', 'Career Readiness', 'AP Honors', 'Seal of Biliteracy'],
        items: [
          { label: 'A GPA of 3.76 or better', bucket: 'Highest Honors' },
          { label: 'Two CTE credits', bucket: 'Career Readiness' },
          { label: 'Five passed AP classes', bucket: 'AP Honors' },
          { label: 'Four credits of one world language', bucket: 'Seal of Biliteracy' },
        ],
        objective: 'know the real cord criteria',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'One more rule, and it is not a cord. The Universal Retake Policy. You have probably used it already without knowing its name.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y2-retake',
        prompt: 'You scored 71% on a big test and you really worked for it. What does the Universal Retake Policy say?',
        options: [
          { text: 'Tough luck. The grade stands', reply: 'Not here. That is the whole point of the policy.' },
          { text: 'Under 79% with real effort, you retake it', correct: true, reply: 'Exactly. Show the effort you put in, then you take the test again.' },
          { text: 'Only seniors can retake', reply: 'Everyone. Freshman year onward.' },
        ],
        objective: 'know the retake policy',
      },
    },
    { kind: 'say', line: { speaker: CP, text: 'Now you know every cord. Pick the ones you want and start earning them this year.' } },
  ],
}
