// one table, keyed by kind, saying what an item is worth, how it scores, and how it reads as a form

import type { CheckStep } from '../../vine/contract'
import { solves } from './program'

/* ---- what a student gave, in one shape for every kind and both arms ---------- */

/* field id to the value the student chose, one flat map of strings for every kind */
export type Response = Record<string, string>

/* ---- the derived plain rendering -------------------------------------------- */

/** an option a student can pick. `value` is what scoring sees, `text` is what the
 *  student reads. They are kept apart because a `place` item's value is an anchor
 *  name and a choice's is an index, and neither should be the words on screen. */
export type PlainOption = { value: string; text: string }

/** one answerable row. A choice is one field; a sort is one field per item. */
export type PlainField = {
  id: string
  /** the row's own label, empty when the item is a single field under its prompt */
  label: string
  input: 'radio' | 'select' | 'text'
  options: PlainOption[]
  /** the value that scores. `text` fields carry the answer as typed digits. */
  correct: string
}

/** what the control arm renders, and the thing an arm-parity test compares. */
export type PlainRender = {
  id: string
  prompt: string
  fields: PlainField[]
  /* the reply for each answer, keyed by field and value; a value of '' prints whatever they did */
  replies: { field: string; value: string; text: string }[]
  /* ---- WHAT THE GAME ARM READS OFF ITS CHROME --------------------------
   *
   * Standing beside the prompt rather than inside it, because the two arms
   * must show the SAME prompt and a parity test holds them to it. This is for
   * the content a game arm happens to carry on a bar, a banner or a gauge: the
   * showdown's opponent was on the drive bar in one arm and nowhere at all in
   * the other, so the control answered a quiz with nobody across from it. */
  note?: string
}

/* ---- the table -------------------------------------------------------------- */

type ByKind = { [K in CheckStep['kind']]: Extract<CheckStep, { kind: K }> }

type Entry<K extends CheckStep['kind']> = {
  points: (c: ByKind[K]) => number
  score: (c: ByKind[K], r: Response) => number
  plain: (c: ByKind[K]) => PlainRender
}

/** an option list with the correct index marked, which choice, quiz and a showdown
 *  round all are underneath. Value is the index, never the words, so two options
 *  that read the same do not collapse into one answer. */
function optionFields(id: string, options: { text: string; correct?: boolean }[]): PlainField {
  return {
    id,
    label: '',
    input: 'radio',
    options: options.map((o, i) => ({ value: String(i), text: o.text })),
    correct: String(options.findIndex((o) => o.correct)),
  }
}

const optionReplies = (field: string, options: { reply?: string }[]) =>
  options.map((o, i) => ({ field, value: String(i), text: o.reply ?? '' })).filter((r) => r.text !== '')

/* one correction for the whole field, printed whatever the student answered */
const oneReply = (f: PlainField, reply: string | undefined): PlainRender['replies'] =>
  reply ? [{ field: f.id, value: '', text: reply }] : []

export const PALETTE: { [K in CheckStep['kind']]: Entry<K> } = {
  choice: {
    points: () => 1,
    score: (c, r) => (r[c.id] === String(c.options.findIndex((o) => o.correct)) ? 1 : 0),
    plain: (c) => ({
      id: c.id,
      prompt: c.prompt,
      fields: [optionFields(c.id, c.options)],
      replies: optionReplies(c.id, c.options),
    }),
  },

  quiz: {
    points: () => 1,
    score: (c, r) => (r[c.item.id] === String(c.item.correctIndex) ? 1 : 0),
    plain: (c) => ({
      id: c.item.id,
      prompt: c.item.prompt,
      fields: [{
        id: c.item.id,
        label: '',
        input: 'radio',
        options: c.item.choices.map((t, i) => ({ value: String(i), text: t })),
        correct: String(c.item.correctIndex),
      }],
      /* a quiz item carries ONE explanation for the item rather than one per
       * option, so every option shows it. Withholding it from the plain arm was
       * the same defect as withholding a choice's replies. */
      replies: c.item.explanation
        ? [{ field: c.item.id, value: '', text: c.item.explanation }]
        : [],
    }),
  },

  sort: {
    points: (c) => c.items.length,
    score: (c, r) => c.items.filter((it) => r[`${c.id}:${it.label}`] === it.bucket).length,
    plain: (c) => ({
      id: c.id,
      prompt: c.prompt,
      fields: c.items.map((it) => ({
        id: `${c.id}:${it.label}`,
        label: it.label,
        input: 'select' as const,
        options: c.buckets.map((b) => ({ value: b, text: b })),
        correct: it.bucket,
      })),
      replies: [],
    }),
  },

  number: {
    points: () => 1,
    /* TOLERANCE IS ABSOLUTE AND DECLARED. A blank or a word scores zero rather
     * than throwing, because a student typing "twenty four" is a wrong answer and
     * not a crash. */
    score: (c, r) => {
      const given = Number((r[c.id] ?? '').trim())
      if (!Number.isFinite(given) || (r[c.id] ?? '').trim() === '') return 0
      return Math.abs(given - c.answer) <= (c.tolerance ?? 0) ? 1 : 0
    },
    plain: (c) => {
      const f: PlainField = {
        id: c.id, label: c.unit ?? '', input: 'text', options: [], correct: String(c.answer),
      }
      return { id: c.id, prompt: c.prompt, fields: [f], replies: oneReply(f, c.reply) }
    },
  },

  order: {
    /* one point per item that lands in its own place, so a partly right order still earns */
    points: (c) => c.items.length,
    score: (c, r) => c.items.filter((it) => r[`${c.id}:${it.label}`] === String(it.position)).length,
    plain: (c) => ({
      id: c.id,
      prompt: c.prompt,
      fields: c.items.map((it) => ({
        id: `${c.id}:${it.label}`,
        label: it.label,
        input: 'select' as const,
        options: c.items.map((_, i) => ({ value: String(i + 1), text: `Position ${i + 1}` })),
        correct: String(it.position),
      })),
      replies: c.reply && c.items.length
        ? [{ field: `${c.id}:${c.items[0].label}`, value: '', text: c.reply }] : [],
    }),
  },

  place: {
    points: () => 1,
    score: (c, r) => (r[c.id] === c.correct ? 1 : 0),
    plain: (c) => {
      const f: PlainField = {
        id: c.id,
        label: '',
        input: 'radio',
        options: c.regions.map((g) => ({ value: g.name, text: g.label })),
        correct: c.correct,
      }
      return { id: c.id, prompt: c.prompt, fields: [f], replies: oneReply(f, c.reply) }
    },
  },

  do: {
    points: () => 1,
    /* the answer is an anchor name in both arms, so there is one line of scoring */
    score: (c, r) => (r[c.id] === c.goal.anchor ? 1 : 0),
    plain: (c) => {
      const f: PlainField = {
        id: c.id,
        label: '',
        input: 'radio',
        options: [c.goal, ...c.decoys].map((g) => ({ value: g.anchor, text: g.label })),
        correct: c.goal.anchor,
      }
      return { id: c.id, prompt: c.prompt, fields: [f], replies: oneReply(f, c.reply) }
    },
  },

  showdown: {
    points: (c) => c.rounds.length,
    score: (c, r) => c.rounds.filter((rd) => r[`${c.id}:${rd.id}`] === String(rd.options.findIndex((o) => o.correct))).length,
    /* a showdown reads as a form of its rounds, since the questions are the content */
    plain: (c) => ({
      id: c.id,
      prompt: c.prompt,
      /* the game arm reads the opponent twice, on the drive bar and over every
       * question, and the form had it nowhere */
      note: c.opponent ? `Against ${c.opponent}.` : undefined,
      fields: c.rounds.map((rd) => ({ ...optionFields(`${c.id}:${rd.id}`, rd.options), label: rd.prompt })),
      replies: c.rounds.flatMap((rd) => optionReplies(`${c.id}:${rd.id}`, rd.options)),
    }),
  },

  /* A PROGRAM, SCORED SLOT BY SLOT AND NEVER BY THE CARD THAT LANDED THERE.
   *
   * The response key is the slot's 1-based number. That is the entire reason this
   * is not an `order`: an order keys on the item's LABEL, so a program that uses
   * one instruction twice folds two slots into one answer, and the response that
   * is supposed to earn full marks quietly scores one short. No validator catches
   * it and no test covers it, which is what makes it worth a kind of its own.
   *
   * Two slots reading the same words therefore still answer apart, and two cards
   * reading the same words are genuinely interchangeable, which is the fair
   * answer: what a student wrote is the sequence of moves, not which physical
   * card they picked up. */
  program: {
    points: (c) => c.slots.length,
    /* ---- A PROGRAM IS MARKED ON WHAT IT DOES ---------------------------
     *
     * ASH, twice: *"i clicked all the right answers on the minigame, and still got a
     * 0"* and *"IT GAVE ME AN F EVEN THOUGH I REACHED THE END."*
     *
     * This counted steps that matched the ones the author typed. The ATC maze has
     * THREE five-step programs that reach the flag, so two of the three right answers
     * scored zero of five: a student solved it, watched his own body walk onto the
     * flag, and was told he had got every step wrong. With the second question that
     * is one of six, which is an F for solving the problem.
     *
     * A program that reaches the flag is a correct program. One that does not gets
     * credit per step, which is the partial marking this always was and is the right
     * shape for a near miss. */
    score: (c, r) => {
      const written = c.slots.map((_, i) => r[`${c.id}:${i + 1}`] ?? '')
      if (solves(c.board, written)) return c.slots.length
      return c.slots.filter((s, i) => r[`${c.id}:${i + 1}`] === s.move).length
    },
    /* THE BOARD GOES IN `note` AND NOT IN THE PROMPT. Both arms must show the same
     * prompt and a parity test holds them to it, so the figure rides beside it, the
     * way the showdown's opponent does. Without it the control arm is asked to put
     * five instructions in order with no problem to solve, which stops being
     * reasoning and becomes recall: a different construct, not a different
     * presentation, and the comparison would be measuring two things. */
    plain: (c) => {
      const fields = c.slots.map((s, i) => ({
        id: `${c.id}:${i + 1}`,
        label: s.label,
        input: 'select' as const,
        /* every move is offered at every slot, so the answer space is identical in
         * both arms. A game arm that took cards out of a pool as they were used
         * would be a game arm with fewer wrong answers available than the form. */
        options: c.moves.map((m) => ({ value: m.name, text: m.label })),
        correct: s.move,
      }))
      return {
        id: c.id,
        prompt: c.prompt,
        note: c.grid,
        fields,
        replies: fields.length ? oneReply(fields[0], c.reply) : [],
      }
    },
  },
}

/* dispatch: the one place a check is looked up in the table, cast included */

const entry = (c: CheckStep) => PALETTE[c.kind] as unknown as Entry<CheckStep['kind']> & {
  points: (c: CheckStep) => number
  score: (c: CheckStep, r: Response) => number
  plain: (c: CheckStep) => PlainRender
}

/** total scorable points: the denominator on the result card and the transcript */
export const pointsOf = (c: CheckStep): number => entry(c).points(c)

/** what this response earned. The ONLY scoring function in the game. */
export const scoreOf = (c: CheckStep, r: Response): number => entry(c).score(c, r)

/** the control arm's rendering, derived. Never authored twice, never `as_plain: false`. */
export const plainOf = (c: CheckStep): PlainRender => entry(c).plain(c)

/** the ledger/telemetry id of a check. A quiz carries its id on its item; every
 *  other kind carries its own, which is why every new kind above has an `id`. */
export const checkIdOf = (c: CheckStep): string => (c.kind === 'quiz' ? c.item.id : c.id)

/** the question, in the words the author wrote, identical in both arms */
export const promptOf = (c: CheckStep): string => (c.kind === 'quiz' ? c.item.prompt : c.prompt)

/* did this one field earn its point, answered by the same scoring the whole item uses.
 *
 * A PROGRAM IS THE ONE ITEM WHERE A STEP CANNOT BE JUDGED ALONE. It is marked on
 * whether the whole thing reaches the flag, so a student who found a different route
 * than the author typed has five right steps and not one: asking about each of them on
 * its own would tick the ones that coincide and cross the ones that do not, over the
 * top of a full mark. The other kinds are per-field and unchanged. */
export const fieldRight = (c: CheckStep, f: PlainField, r: Response): boolean => {
  if (c.kind === 'program') {
    const written = c.slots.map((_, i) => r[`${c.id}:${i + 1}`] ?? '')
    if (solves(c.board, written)) return true
    return r[f.id] === plainOf(c).fields.find((q) => q.id === f.id)?.correct
  }
  return scoreOf(c, { [f.id]: r[f.id] ?? '' }) > 0
}

/** the response that earns full marks. The plain rendering already knows it, so
 *  reading it back off the fields is what proves the plain arm can reach the same
 *  score the game arm can rather than being a lossy copy of the item. */
export const fullMarks = (c: CheckStep): Response =>
  Object.fromEntries(plainOf(c).fields.map((f) => [f.id, f.correct]))

/* refuse an item that cannot be answered, by name, at load rather than on screen */
export function refuseCheck(c: CheckStep): string | null {
  const id = checkIdOf(c)
  /* ---- A KIND NOBODY HAS IS REFUSED FIRST ---------------------------------
   *
   * The switch below has a case per kind and no default, so an item whose `kind` is a
   * typo fell straight through it and was reported VALID. The next thing that touches
   * it is `entry()`, which reads `PALETTE[c.kind]` and gets undefined, and the frame
   * after that is a property read on undefined: a white page, not a refusal.
   *
   * A member's island is the whole reason this matters. The kinds arrive over the
   * worker as strings a person typed in Python, so "muliple" instead of "multiple" is
   * an ordinary Tuesday, and what he should get is a sentence naming his own word and
   * the ones that exist. */
  if (!(c.kind in PALETTE))
    return `check "${id}" is a "${String(c.kind)}", which is not a kind of question this game has. `
      + `It has: ${Object.keys(PALETTE).sort().join(', ')}`
  const oneCorrect = (opts: { correct?: boolean }[], where: string) => {
    const n = opts.filter((o) => o.correct).length
    if (n !== 1) return `${where} must have exactly one correct option, it has ${n}`
    if (opts.length < 2) return `${where} must offer at least two options`
    return null
  }
  switch (c.kind) {
    case 'choice': return oneCorrect(c.options, `check "${id}"`)
    case 'quiz':
      if (c.item.choices.length < 2) return `check "${id}" must offer at least two options`
      return c.item.correctIndex >= 0 && c.item.correctIndex < c.item.choices.length
        ? null : `check "${id}" has correctIndex ${c.item.correctIndex} and ${c.item.choices.length} choices`
    case 'sort': {
      if (!c.items.length) return `check "${id}" has no items to sort`
      const stray = c.items.find((it) => !c.buckets.includes(it.bucket))
      return stray ? `check "${id}" sorts "${stray.label}" into "${stray.bucket}", which is not one of its buckets` : null
    }
    case 'number':
      return Number.isFinite(c.answer) ? null : `check "${id}" has no finite answer`
    case 'order': {
      const want = c.items.map((_, i) => i + 1).join(',')
      const got = c.items.map((it) => it.position).sort((a, b) => a - b).join(',')
      return want === got ? null : `check "${id}" positions must be 1..${c.items.length} exactly once, they are ${got}`
    }
    case 'place':
      if (c.regions.length < 2) return `check "${id}" must name at least two regions`
      return c.regions.some((g) => g.name === c.correct)
        ? null : `check "${id}" is correct on region "${c.correct}", which it does not name`
    case 'do':
      /* the one every author will hit: a world-staged item with no wrong place to
       * go renders in the control arm as a question with a single option. */
      return c.decoys.length ? null : `check "${id}" is a do with no decoys, so the plain arm has one option and no question`
    case 'showdown': {
      if (!c.rounds.length) return `check "${id}" is a showdown with no rounds`
      for (const rd of c.rounds) {
        const bad = oneCorrect(rd.options, `check "${id}" round "${rd.id}"`)
        if (bad) return bad
      }
      return null
    }
    case 'program': {
      if (!c.slots.length) return `check "${id}" is a program with no slots to fill`
      /* one move is not a choice, and the form would render a select with a single
       * option, which is the same defect `do` with no decoys has */
      if (c.moves.length < 2) return `check "${id}" must offer at least two instructions`
      const twice = c.moves.find((m, i) => c.moves.findIndex((n) => n.name === m.name) !== i)
      if (twice) return `check "${id}" offers the instruction "${twice.name}" twice, so two options carry one value`
      const stray = c.slots.find((s) => !c.moves.some((m) => m.name === s.move))
      return stray
        ? `check "${id}" wants "${stray.move}" at "${stray.label}", which is not one of its instructions`
        : null
    }
  }
}
