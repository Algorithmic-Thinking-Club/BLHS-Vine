// CORE BEAT, YEAR 4 — "Finish like a Panther" (§7.3): the cords AUDIT. This beat is
// GENERATED from the student's own save: Principal Panther reads their actual cape
// (cordsOf) and the first check asks what their real GPA earns TODAY — the same math the
// graduation ceremony will use. Plus the High School and Beyond Plan (a real non-credit
// graduation requirement) and the regalia as flavor (teal gowns, the BONNEY LAKE stole —
// reference/blhs-grad-capes). No em-dashes in player copy (law §2.8).

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
    ? `If the stage were today, your cape carries: ${earned.map((c) => c.name).join(', ')}. Earned, not given.`
    : 'No cords locked yet, and that is not a scold. Half of them settle senior year, which is now.'
  const reachLine = close.length
    ? `Still in reach if you move: ${close.map((c) => c.name).join(', ')}. The counselor can name the exact gap.`
    : 'Whatever is still in reach, this is the year it gets reached.'

  // the GPA check is personal: their real number against the real bands
  const gpaText = gpa === null ? 'unwritten' : gpa.toFixed(2)
  const correct: 'gold' | 'silver' | 'none' =
    gpa !== null && gpa >= 3.76 ? 'gold' : gpa !== null && gpa >= 3.5 ? 'silver' : 'none'
  const gpaCheck: BeatStep = {
    kind: 'check',
    check: {
      kind: 'choice', id: 'y4-gpa-audit',
      prompt: `Your GPA stands at ${gpaText}. If you walked the stage today, which honor cord rides it?`,
      options: [
        {
          text: 'Double gold. Highest Honors, 3.76 to 4.0',
          correct: correct === 'gold',
          reply: correct === 'gold' ? 'Double gold. Keep it there through June.' : 'Not yet. Double gold starts at 3.76.',
        },
        {
          text: 'Black and silver. High Honors, 3.5 to 3.759',
          correct: correct === 'silver',
          reply: correct === 'silver' ? 'Black and silver, and double gold is close enough to chase.' : correct === 'gold' ? 'You are past that band. Aim higher on purpose.' : 'High Honors starts at 3.5. Know your number.',
        },
        {
          text: 'Neither yet',
          correct: correct === 'none',
          reply: correct === 'none' ? 'Honest. And senior year grades still count, so it is not settled.' : 'Better than that. Check your number again.',
        },
      ],
      objective: 'read your own transcript',
    },
  }

  return {
    id: 'core:y4',
    year: 4,
    title: 'Finish like a Panther',
    place: 'the Advisory Hearth',
    kind: 'core',
    credit: 0.5,
    takeaways: ['f-hsbp', 'f-honor-gpa'],
    steps: [
      { kind: 'say', line: { speaker: PP, text: 'Last year, Panther. Let us take stock like it is already June.' } },
      { kind: 'say', line: { speaker: PP, text: capeLine } },
      { kind: 'say', line: { speaker: PP, text: reachLine } },
      gpaCheck,
      { kind: 'say', line: { speaker: PP, text: 'One thing the state wants before anyone walks: the High School and Beyond Plan. Yours, finished.' } },
      {
        kind: 'check',
        check: {
          kind: 'choice', id: 'y4-hsbp',
          prompt: 'The High School and Beyond Plan is...',
          options: [
            { text: 'A scholarship essay contest', reply: 'No. It is required of everyone, essay or not.' },
            { text: 'A required plan: where you are headed after graduation, and how', correct: true, reply: 'That one. Every Washington graduate finishes it. No credits attached, no diploma without it.' },
            { text: 'A summer camp application', reply: 'It outlasts any summer. It is your map out of here.' },
          ],
          objective: 'know the HSBP',
        },
      },
      { kind: 'say', line: { speaker: PP, text: 'Gowns are teal. The stole says BONNEY LAKE. The cords go on one at a time, and that part is the point. Finish like a Panther.' } },
    ],
  }
}
