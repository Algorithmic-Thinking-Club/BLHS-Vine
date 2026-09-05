// CORE BEAT, YEAR 1 — "This is the place" (§7.3). The fixed measured content every
// student gets: POWER values, the Monday rhythm, how joining actually works. Every fact
// here is real (docs/blhs/sourced-facts.md: the 2025-26 Student Handbook and the
// clubs hub). Voice: Principal Panther, warm, never corporate. No em-dashes in player
// copy (law §2.8).

import type { CoreBeat } from './frames'

const PP = 'Principal Panther'
/* HIS FACE, AND IT IS LOCKED.
 *
 * `SceneLine.portrait` has carried an id since the box was written and NOTHING
 * had ever set one, so `public/art/portraits/` did not exist and every
 * conversation in the game was a faceless box. The dialogue box's portrait frame
 * was rebuilt for it and had nothing to hold.
 *
 * A PixelLab portrait was drawn for the slot on 2026-09-01 and Ash rejected it
 * the next day: *"the principal panther profile photo on 19 is completely wrong.
 * principal panther will now be locked. it is the `principal-pro` asset from
 * MAPVIS -> panthers maw."* So the id is unchanged and the file behind it is
 * MAPVIS's own drawing. Do not generate another one.
 *
 * WHERE THE FILE COMES FROM, written here because `public/art/` and `scripts/`
 * are both gitignored in this repo and a recipe that does not survive a clone is
 * not a recipe:
 *
 *   source  MAPVIS-next/work/panther-maw/library/principal-pro/south-0.png
 *           (the eight-direction character MAPVIS drew for the Maw; `south-0`
 *           is the one frame that faces the player)
 *   cut     crop 48x48 at (27, 13), then nearest 2x -> 96x96
 *
 * Crop and grid snap only. Nothing is painted or recoloured: `docs/ART.md`'s
 * pipeline allows both as post-processing, and 96 is exactly the aperture inside
 * the drawn portrait frame, so it lands at an integer scale rather than smearing
 * the one face in the game. */
/* EXPORTED, BECAUSE TWO SCREENS WEAR THIS FACE AND ONLY ONE OF THEM DID.
 * `YearStart.tsx` speaks as Principal Panther for three lines and drew no
 * portrait at all, so a student met the name two screens before the face and
 * then met the face without being told it was the same person. The lock and its
 * recipe are written above, so the name of the face is read from here rather
 * than spelled again over there. */
export const PP_FACE = 'principal'

export const CORE_Y1: CoreBeat = {
  id: 'core:y1',
  year: 1,
  /* THE TITLE AND THE PLACE ARE READ TOGETHER, at the top of every screen of
   * this activity in both arms ("place · title"). They were 'This is the place'
   * and 'the Advisory Hearth', which named neither the room nor the lesson.
   * The words pass, 2026-09-04: Advisory is Advisory, and a title says what the
   * activity teaches. */
  title: 'POWER, Mondays, and joining a club',
  place: 'Advisory',
  kind: 'core',
  credit: 0.5,
  takeaways: ['f-power-full', 'f-monday', 'f-25th-credit', 'f-join-clubs'],
  steps: [
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'This is Advisory. Every year at Bonney Lake starts here. Most Mondays we sit down together and make sure nobody is lost.' } },
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'The POWER values are what we ask of every student here. Perseverance, Ownership, Work Ethic, Engagement, Respect.' } },
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
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'Mondays start late here. School starts at 8:30 instead of 7:25, and Advisory meets that morning.' } },
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'Advisory is not filler. Pass it every semester and you earn one elective credit over four years. The catalog calls it the 25th credit.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y1-monday',
        prompt: 'It is Monday morning at Bonney Lake. When does school start?',
        options: [
          { text: '7:25, same as every day', reply: 'That is Tuesday through Friday. Mondays are the late ones.' },
          { text: '8:30. Mondays start late', correct: true, reply: 'Right. Late start, and Advisory meets that morning.' },
          { text: 'Whenever you wake up', reply: 'Bold. Wrong, but bold.' },
        ],
        objective: 'know the Monday late start',
      },
    },
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'Every island out there is a real club, a real sport or a real class. To join one, you just show up.' } },
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'DECA meets Thursdays at 2:10 in the 200 Flex. Robotics builds Mondays and Thursdays in rooms 206 and 207. Your Handbook keeps the whole list.' } },
    {
      kind: 'check',
      check: {
        kind: 'choice', id: 'y1-joining',
        prompt: 'You want in on a club. What do you actually do?',
        options: [
          { text: 'File a form with the main office', reply: 'No forms. The office would just point you back at the meeting.' },
          { text: 'Wait to be invited', reply: 'You would be waiting a while. Clubs here take whoever shows up.' },
          { text: 'Find its meeting time and walk in', correct: true, reply: 'That is the whole trick. The Handbook has every room and time.' },
        ],
        objective: 'know how joining works',
      },
    },
    /* IT USED TO SEND HIM BACK TO A THING HE HAD ALREADY DONE. `objective.ts`
     * runs the `plan` phase BEFORE the `core` phase, so by the time Advisory
     * ends his year sheet is stamped, and this line told him to go and spend
     * three season tokens the game would then refuse. */
    { kind: 'say', line: { speaker: PP, portrait: PP_FACE, text: 'That is the start, Panther. Your year is planned, so the rest of it is out on the water.' } },
  ],
}
