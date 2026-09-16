// core beat, year 4: the cords audit, generated from the student's own save

import type { SaveGame } from '../save'
import { cordsOf, gpaOf } from '../progress'
import type { BeatStep, CoreBeat } from './frames'

const PP = 'Principal Panther'

export function coreY4(save: SaveGame): CoreBeat {
  const cords = cordsOf(save)
  const earned = cords.filter((c) => c.earned)
  const close = cords.filter((c) => !c.earned && c.progress >= 0.5).slice(0, 2)
  const gpa = gpaOf(save)

  const capeLine = earned.length
    ? `If graduation were today, you would wear these cords: ${earned.map((c) => c.name).join(', ')}. You earned them.`
    : 'No cords earned yet, and that is fine. Half of them are decided senior year, which is now.'
  const reachLine = close.length
    ? `You could still earn these this year: ${close.map((c) => c.name).join(', ')}. Ask your counselor what is missing.`
    : 'Anything you have not earned yet is still open this year. Senior grades count.'

  // the GPA check is personal: their real number against the real bands
  /* a student with no grades yet has a blank grade point average rather than the word unwritten */
  const gpaText = gpa === null ? 'blank' : gpa.toFixed(2)
  const correct: 'gold' | 'silver' | 'none' =
    gpa !== null && gpa >= 3.76 ? 'gold' : gpa !== null && gpa >= 3.5 ? 'silver' : 'none'
  const gpaCheck: BeatStep = {
    kind: 'check',
    check: {
      kind: 'choice', id: 'y4-gpa-audit',
      prompt: `Your GPA right now is ${gpaText}. Which honor cord does that earn at graduation?`,
      options: [
        {
          text: 'Highest Honors. GPA 3.76 to 4.0, double gold cords',
          correct: correct === 'gold',
          reply: correct === 'gold' ? 'Highest Honors. Keep that GPA through June.' : 'Not yet. Highest Honors starts at 3.76.',
        },
        {
          text: 'High Honors. GPA 3.5 to 3.759, black and silver cords',
          correct: correct === 'silver',
          reply: correct === 'silver' ? 'High Honors it is, and Highest Honors is only a little further.' : correct === 'gold' ? 'You are above that. Your GPA earns Highest Honors.' : 'High Honors starts at 3.5. Check your GPA again.',
        },
        {
          text: 'Neither yet',
          correct: correct === 'none',
          reply: correct === 'none' ? 'Honest. And senior year grades still count, so it is not settled.' : 'Better than that. Check your GPA again.',
        },
      ],
      objective: 'read your own transcript',
    },
  }

  return {
    id: 'core:y4',
    year: 4,
    /* the title says what the activity does */
    title: 'Check what you have earned',
    place: 'Advisory',
    kind: 'core',
    credit: 0.5,
    takeaways: ['f-hsbp', 'f-honor-gpa'],
    steps: [
      { kind: 'say', line: { speaker: PP, text: 'Senior year, Panther. Let us count what you have earned, like it is already June.' } },
      { kind: 'say', line: { speaker: PP, text: capeLine } },
      { kind: 'say', line: { speaker: PP, text: reachLine } },
      gpaCheck,
      { kind: 'say', line: { speaker: PP, text: 'One thing the state wants before you graduate: a finished High School and Beyond Plan.' } },
      {
        kind: 'check',
        check: {
          kind: 'choice', id: 'y4-hsbp',
          prompt: 'What is the High School and Beyond Plan?',
          options: [
            { text: 'A scholarship essay contest', reply: 'No. It is required of everyone, essay or not.' },
            { text: 'A required plan: where you are headed after graduation, and how', correct: true, reply: 'That one. Every Washington graduate finishes it. No credits attached, no diploma without it.' },
            { text: 'A summer camp application', reply: 'It outlasts any summer. It is your plan for after graduation.' },
          ],
          objective: 'know the HSBP',
        },
      },
      { kind: 'say', line: { speaker: PP, text: 'Gowns are teal. The stole says BONNEY LAKE. The cords go on one at a time, and that part is the point. Finish like a Panther.' } },
    ],
  }
}
