/* THE TURN-IN ARTIFACT, AND THE SNAPSHOT UNDER IT.
 *
 * §80.6, verbatim: *"a transcript frozen at graduation and stored on the save,
 * because `_store.ts`'s `putState` is an upsert with `on conflict do update` and
 * there is no snapshot at all, and the failure that prevents looks exactly like a
 * student cheating in front of a class."*
 *
 * WHAT IT LOOKED LIKE. `Graduation.tsx` computed `runCode(transcriptOf(s))` from
 * the LIVE save at render time and drew that code on the diploma. Then the last
 * button unlocks Gear 2 and the ocean opens, so the graduate plays one more
 * island, the ledger moves, the GPA moves, and the code the teacher's roster
 * computes from the synced save is no longer the code on the printed page. The
 * teacher is holding two different codes for one student in front of a class, and
 * the only reading available to them is that the student made one up. Nothing in
 * the game could have told them otherwise, because the server keeps one row per
 * participant and overwrites it.
 *
 * So the transcript is frozen once, at the moment the stage is walked, and every
 * printed thing is drawn from the frozen copy. The check is the same function on
 * both sides: `canonical` and `runCode` in `src/vine/verify.ts` are pure and
 * dependency-free precisely so the client and `api/teacher.ts` compute the same
 * ten characters over the same string.
 *
 * WHAT THIS FILE DOES NOT DECIDE. Q80.6.d is open: what a Captain receives at
 * graduation when the school awards no cord for it. The honest options on record
 * are the diploma line, a badge, or nothing, and INVENTING A CORD IS NOT ON THE
 * LIST, because the awards table came from Ms. Pinzon through Wiseman and its own
 * Valedictorian and Salutatorian criteria are a gap Wiseman flagged himself. The
 * diploma prints the rank line it already printed and claims nothing further.
 */
import { freezeRun, loadSave, type FrozenRun, type SaveGame } from '../save'
import { cordsOf, transcriptOf } from '../progress'
import { canonical, runCode, type Transcript } from '../../vine/verify'

/** freeze the run, once, at the moment the student walks the stage */
export function sealRun(s: SaveGame): FrozenRun {
  if (s.diploma) return s.diploma
  const transcript = transcriptOf(s)
  const sealed: FrozenRun = { transcript, code: runCode(transcript), year: s.year, at: Date.now() }
  freezeRun(sealed)
  return loadSave()?.diploma ?? sealed
}

/* WHAT THE DIPLOMA READS FROM. A run that has not been sealed yet is computed
 * live, which is what a pre-graduation preview wants; a sealed one is read back
 * whole and never recomputed. Both return the same shape so nothing downstream
 * has to know which it got. */
export function diplomaOf(s: SaveGame): FrozenRun {
  if (s.diploma) return s.diploma
  const transcript = transcriptOf(s)
  return { transcript, code: runCode(transcript), year: s.year, at: 0 }
}

/** is this the code that belongs to this run. The teacher's roster asks the same
 *  question of the synced save with the same two functions. */
export function checkCode(s: SaveGame, code: string): boolean {
  const clean = code.trim().toUpperCase().replace(/\s+/g, '')
  return diplomaOf(s).code === clean
}

/* ---- the artifact a student hands in ----------------------------------------
 *
 * Wiseman on the turn-in summary, `docs/blhs/wiseman-reply.md`: *"it gives
 * advisory teachers a concrete, easy-to-administer outcome, and it's where the AP
 * Research study would pull its comparable variables/data."*
 *
 * The PNG is the thing a student is proud of and the thing a Chromebook cannot
 * always download: a district image that blocks downloads leaves a graduate with
 * nothing to hand in. So there is a plain-text form as well, which pastes into
 * Canvas, Classroom, a form field or an email, carries the same code, and is
 * legible without opening an image. One artifact, two bodies.
 */
export function artifactText(s: SaveGame, d: FrozenRun = diplomaOf(s)): string {
  const t = d.transcript
  const names = new Map(cordsOf(s).map((c) => [c.id, c.name]))
  const cords = t.cords.length ? t.cords.map((id) => names.get(id) ?? id).join(', ') : 'none'
  const ranks = Object.entries(t.ranks).filter(([, y]) => y > 0)
  return [
    'BONNEY LAKE HIGH SCHOOL · the island voyage',
    `Panther: ${t.handle || 'unnamed'}`,
    `Years completed: ${d.year} of 4`,
    `GPA: ${t.gpa === null ? 'unwritten' : t.gpa.toFixed(2)}`,
    `Cords and seals: ${cords}`,
    `Ranks: ${ranks.length ? ranks.map(([track, y]) => `${track} (${y} year${y === 1 ? '' : 's'})`).join(', ') : 'none'}`,
    `Islands completed: ${t.islandsCompleted}`,
    `Places seen: ${t.placesSeen}`,
    `Programmes finished: ${t.programmesCompleted}`,
    `True things learned: ${t.factsLearned}`,
    `Verification: ${d.code}`,
    'Your teacher checks this code against the advisory roster.',
  ].join('\n')
}

/* THE STRING THE CODE IS COMPUTED OVER, exported for the captain's overlay and
 * for a teacher chasing a mismatch by hand. Never shown to a student: it carries
 * the participant id. */
export const codeSubject = (t: Transcript) => canonical(t)
