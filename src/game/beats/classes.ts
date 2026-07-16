// CLASS BEATS (§7.4) — the 2-3 minute focus-class scenes, GENERATED from the catalog so
// all ~45 real courses play without a line of invented course content: the beat teaches
// what the class IS, where it sits in the ladder (prerequisites), and which real cord it
// feeds — and the checks are derived from those same truths, so the grading is honest.
// Passing writes a tagged ledger entry: sitting AP Human Geography literally moves the
// AP Honors counter (progress.ts reads the tags). Deeper per-course flavor (the "one
// taste of the real course" minigames) is a later content pass on this same chassis.

import type { CheckStep } from '../../vine/contract'
import type { ClassDef } from '../planner/catalog'
import { classById } from '../planner/catalog'
import type { BeatStep, CoreBeat } from './frames'

const HALL: Record<ClassDef['dept'], string> = {
  ap: 'the AP Academy',
  lang: 'the international hall',
  cte: 'the Trades Harbor',
  arts: 'the arts wing',
}

const T = 'The instructor'

function cordCheck(c: ClassDef): CheckStep {
  const isAp = c.tags.includes('ap')
  const isCte = c.tags.includes('cte')
  const isCapstone = c.tags.includes('lang-capstone')
  const isLang = c.tags.includes('lang')

  const AP = { text: 'AP Honors. Five passed AP classes earn it.', key: 'ap' }
  const CTE = { text: 'Career Readiness. It counts as a CTE credit.', key: 'cte' }
  const SEAL = { text: 'The Seal of Biliteracy. Language years add up.', key: 'lang' }
  const BOTH = { text: 'Two at once. AP Honors and a CTE credit.', key: 'both' }
  const CAP = { text: 'It can cap a Seal of Biliteracy track.', key: 'cap' }
  const NONE = { text: 'No cord rides on it. Some things you take for the love of it.', key: 'none' }

  const correctKey = isAp && isCte ? 'both' : isCapstone ? 'cap' : isAp ? 'ap' : isCte && isLang ? 'both-lang' : isCte ? 'cte' : isLang ? 'lang' : 'none'
  // assemble exactly three options, one correct, distractors from the other cords
  const pool = [AP, CTE, SEAL, BOTH, CAP, NONE]
  const correct =
    correctKey === 'both' ? BOTH
      : correctKey === 'cap' ? CAP
        : correctKey === 'ap' ? AP
          : correctKey === 'both-lang' ? { text: 'Two at once. A CTE credit, and it keeps a language track alive.', key: 'both-lang' }
            : correctKey === 'cte' ? CTE
              : correctKey === 'lang' ? SEAL
                : NONE
  const distractors = pool.filter((o) => o.key !== correct.key && o.key !== 'both' && o.key !== 'cap').slice(0, 2)
  // a dual-count class makes its single-cord options HALF true — the reply says so
  const dual = correctKey === 'both' || correctKey === 'both-lang'
  const options = [...distractors.map((o) => ({
    text: o.text,
    reply: dual && (o.key === 'ap' || o.key === 'cte' || o.key === 'lang')
      ? 'True, but only half of it. This class pulls double duty.'
      : 'Not this one. Check the sheet again.',
  })),
  { text: correct.text, correct: true, reply: 'Exactly. The counselor keeps count either way.' }]

  return {
    kind: 'choice', id: `${c.id}-cord`,
    prompt: `Graduation day: which honor does ${c.name} actually move?`,
    options,
    objective: 'know what the class counts toward',
  }
}

function ladderCheck(c: ClassDef): CheckStep | null {
  if (!c.requires) return null
  const req = classById(c.requires)
  if (!req) return null
  return {
    kind: 'choice', id: `${c.id}-ladder`,
    prompt: `What does ${c.name} expect you to have behind you?`,
    options: [
      { text: 'Nothing. It is open to anyone', reply: `It builds on ${req.name}. The ladder is real.` },
      { text: `${req.name}, from an earlier year`, correct: true, reply: 'Right. One rung at a time.' },
      { text: 'A signed permission slip', reply: 'No slips. Just the rung below it.' },
    ],
    objective: 'know the prerequisite',
  }
}

/** the generated 2-3 minute class beat — same chassis as the core beats (§7.4) */
export function classBeat(c: ClassDef, year: number): CoreBeat {
  const steps: BeatStep[] = [
    { kind: 'say', line: { speaker: T, text: `${c.name}. Take a seat.` } },
    {
      kind: 'say', line: {
        speaker: T,
        text: c.requires && classById(c.requires)
          ? `This course builds straight on ${classById(c.requires)!.name}. You climbed that rung already, which is why you are in the room.`
          : `No prerequisites here. You showed up, and that is the whole entry fee.`,
      },
    },
    { kind: 'check', check: cordCheck(c) },
  ]
  const ladder = ladderCheck(c)
  if (ladder) steps.push({ kind: 'check', check: ladder })
  steps.push({ kind: 'say', line: { speaker: T, text: 'That is the shape of it. The grade goes on the sheet either way, so make the semester count.' } })

  return {
    id: `class:${c.id}`,
    year,
    title: c.name,
    place: HALL[c.dept],
    kind: 'class',
    tags: c.tags,
    credit: 0.5,
    takeaways: [],
    steps,
  }
}

/** has this class been sat already? (ledger truth, any year) */
export const classDone = (ledger: { id: string }[], classId: string): boolean =>
  ledger.some((e) => e.id === `class:${classId}`)
