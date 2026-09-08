// the year one core beat: the POWER values, the Monday late start, and how joining a club works

import type { CoreBeat } from './frames'

const PP = 'Principal Panther'
/* the portrait id for Principal Panther, cropped from the character MAPVIS drew for the Maw */
/* exported so every screen he speaks on wears the same face */
export const PP_FACE = 'principal'

export const CORE_Y1: CoreBeat = {
  id: 'core:y1',
  year: 1,
  /* the title and the place are read together at the top of every screen of this activity */
  title: 'POWER, Mondays, and joining a club',
  place: 'Advisory',
  kind: 'core',
  credit: 0.5,
  takeaways: ['f-power-full', 'f-monday', 'f-25th-credit', 'f-join-clubs'],
  /* three things done by hand, each with one short line before it and a reply after it */
  steps: [
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'Every year here starts in Advisory. These five are Panther POWER.' } },
    {
      kind: 'check',
      check: {
        kind: 'sort', id: 'y1-power',
        prompt: 'Put each POWER value with its letter.',
        buckets: ['P', 'O', 'W', 'E', 'R'],
        items: [
          { label: 'Perseverance', bucket: 'P' },
          { label: 'Ownership', bucket: 'O' },
          { label: 'Work Ethic', bucket: 'W' },
          { label: 'Engagement', bucket: 'E' },
          { label: 'Respect', bucket: 'R' },
        ],
        objective: 'name the five POWER values',
      },
    },
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'Mondays start late here, and Advisory meets that morning.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y1-monday',
        prompt: 'It is Monday morning at Bonney Lake. When does school start?',
        options: [
          { text: '7:25, same as every day', reply: 'That is Tuesday through Friday. Mondays are the late ones.' },
          /* THE 25TH CREDIT RIDES HERE. It used to have a speech of its own, and
           * the reply to the item it belongs to is where a student is actually
           * reading. .125 a semester over eight semesters is the one credit. */
          { text: '8:30. Mondays start late', correct: true, reply: 'Right. Pass Advisory every semester and it is worth one elective credit, the 25th credit.' },
          { text: 'Whenever you wake up', reply: 'Bold. Wrong, but bold.' },
        ],
        objective: 'know the Monday late start',
      },
    },
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'Every island out there is a real club, sport or class at this school.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y1-joining',
        prompt: 'You want in on a club. What do you actually do?',
        options: [
          { text: 'File a form with the main office', reply: 'No forms. The office would just point you back at the meeting.' },
          { text: 'Wait to be invited', reply: 'You would be waiting a while. Clubs here take whoever shows up.' },
          { text: 'Find its meeting time and walk in', correct: true, reply: 'That is the whole trick. Your Guide has every room and time.' },
        ],
        objective: 'know how joining works',
      },
    },
  ],
}
