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
  /* ---- THREE THINGS DONE BY HAND, ONE SHORT LINE BEFORE EACH ------------
   *
   * BRIEF-MAW-RAIL, beat 3, word for word: "Advisory is three things done by
   * hand, each with one short line before it: put the five POWER letters in
   * order, pick when a Monday starts, pick how you join a club. Every answer
   * pops right or wrong on the spot with a one-line reply. No speech before, no
   * result card of a hundred words after: the pop is the result."
   *
   * SIX SPEECHES BECAME THREE LINES. What was here opened with two paragraphs
   * before the first thing a student could touch, put another two between the
   * first item and the second, and closed with a sixth nobody reads. Ash played
   * it: "a bunch of words, a bunch of instructions that open to read more words."
   *
   * THE FACTS DID NOT GO WITH THEM, and that is the part to check when editing
   * this. All four takeaways are still taught: POWER by matching the five,
   * the late start by the line and the item, the 25th credit inside the reply
   * to the Monday item, and joining by the last item. Every one is sourced in
   * `docs/blhs/sourced-facts.md` and none of it is invented to fill a line. */
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
