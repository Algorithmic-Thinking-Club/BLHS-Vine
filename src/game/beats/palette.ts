// THE ITEM PALETTE: one table, keyed by kind, that decides what a score IS.
//
// Scoring used to be inline in ActivityRunner.tsx, twice: once in the game arm's
// CheckPlay and once again in the plain arm's submit(). Two switches over the same
// three kinds, written months apart, each free to disagree with the other about
// what a sort row was worth. Nothing caught that, because nothing could: there was
// no single object to compare them against.
//
// So a kind declares three things here and nowhere else:
//
//   points(check)          the denominator. What a perfect answer is worth.
//   score(check, response) the numerator. What this student's answer earned.
//   plain(check)           the control arm's rendering, DERIVED from the item.
//
// `plain` is the load-bearing one and it is why this file exists rather than a
// pair of tidier switches. The AP Research control arm receives whatever this
// function returns. If a member adds a frame kind with a game rendering and no
// plain one, the control student in the same room gets a blank or a broken item
// and the study's content-constancy claim is gone, silently, because both arms
// still emit the same event shape and nothing in the data can tell you. Making
// the plain rendering a REQUIRED field of the palette entry means a kind that
// cannot be rendered in plain cannot be added at all.
//
// BOTH ARMS SCORE THROUGH `score`. The game arm draws its own controls and the
// plain arm draws a form, and then both hand the same `Response` map to the same
// function. That is the arm-parity guarantee by construction: the two arms are
// not "checked to agree", they have no way to disagree.
//
// NOTHING HERE READS A CLOCK. 80.7's timing law: the item scores and the body does
// not. `score` takes a check and a response and has no third argument, which is
// the cheapest possible enforcement of "an island that adds a timing element to a
// scored frame leaves the study" and the reason it is a signature rather than a
// review comment.

import type { CheckStep } from '../../vine/contract'

/* ---- what a student gave, in one shape for every kind and both arms ---------- */

/* field id -> the value the student chose. One flat map of strings, because it
 * has to survive `postMessage` the day a member's Python grape answers an item,
 * and because a shape that is the same for a radio button and for a sort row is a
 * shape the accumulator never has to branch on. */
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
  /* THE REPLY STRINGS, WHICH THE CONTROL ARM USED TO BE DENIED.
   *
   * PlainForm rendered prompts and options and dropped every `reply`, so the arm
   * that is supposed to receive identical content differently presented was
   * receiving LESS INSTRUCTION than the game arm. The game student is told why
   * their answer was wrong and what the truth is; the plain student was told
   * nothing. Multiply by twelve islands and the independent variable is no longer
   * game-ness, it is game-ness plus corrective feedback, and it is not detectable
   * in the data because both arms emit the same event shape.
   *
   * Keyed by field AND value, so the form can print the reply for what the student
   * actually picked, the way the game arm speaks it. A `value` of '' means the
   * author wrote one correction for the whole field rather than one per option,
   * which is the shape a number, an ordering and a place come in, and it prints
   * whatever the student did. */
  replies: { field: string; value: string; text: string }[]
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

/* ONE CORRECTION FOR THE WHOLE FIELD, printed whatever the student did.
 *
 * A number, an ordering and a place carry a single `reply` rather than one per
 * wrong answer, and the obvious mistake is to key it to the correct value, which
 * shows the explanation only to the students who did not need it. `value: ''`
 * means unconditional, so the plain arm prints the correction to the student who
 * got it wrong, which is the whole reason the game arm speaks it. */
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
    /* one point per item that lands in its own place, so three of five in sequence
     * is not scored the same as a guess. The alternative, all-or-nothing, makes a
     * five-item ordering worth the same as a two-option choice and it teaches a
     * student nothing about which part they had right. */
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
    /* THE ANSWER IS AN ANCHOR NAME, in both arms and for the same reason.
     *
     * In the game arm the runner writes the anchor the player actually reached; in
     * the plain arm the student picks its label off a list. Same field id, same
     * value space, same line of scoring, which is what stops a world-staged frame
     * from being a second scoring path nobody audits. */
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
    /* THE PLAIN RENDERING OF A SHOWDOWN IS ITS ROUNDS AS A FORM, and that is not a
     * compromise, it is the point. The drive, the opponent and the yard line are
     * the game-ness; the questions are the content. Stripping the first and
     * keeping the second is exactly what the control arm is for, and here it falls
     * out of the item shape rather than out of somebody writing a second version
     * of the frame by hand. */
    plain: (c) => ({
      id: c.id,
      prompt: c.prompt,
      fields: c.rounds.map((rd) => ({ ...optionFields(`${c.id}:${rd.id}`, rd.options), label: rd.prompt })),
      replies: c.rounds.flatMap((rd) => optionReplies(`${c.id}:${rd.id}`, rd.options)),
    }),
  },
}

/* ---- dispatch ---------------------------------------------------------------
 *
 * TypeScript cannot correlate `c.kind` with `PALETTE[c.kind]` across a union (it
 * will not distribute the lookup), so the three helpers below carry one cast
 * each. The cast is safe by the construction of the table above: every key of
 * PALETTE is a member of CheckStep['kind'] and the mapped type forces its entry
 * to be typed against that exact member. This is the only place the cast lives,
 * which is the whole reason the callers get to be one line. */

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

/* DID THIS ONE FIELD EARN ITS POINT, decided here and nowhere else.
 *
 * THE DEFECT THIS CLOSES, found 2026-09-01 and worth writing at the function
 * because it is the exact shape of failure this file was created to make
 * impossible. `ActivityRunner`'s plain arm marked a row correct with a STRING
 * compare, `given === f.correct`, while `PALETTE.number.score` had scored the
 * same answer with a declared TOLERANCE since the kind was added. On the shipped
 * item (answer 3.76, tolerance 0.05) a control-arm student who typed 3.80 was
 * scored right by the accumulator and told "the answer is 3.76" by the line
 * underneath it, in the same frame. The grade was right, the page was wrong, and
 * the student read the page.
 *
 * WHY A PARTIAL RESPONSE IS AN EXACT ANSWER AND NOT A TRICK. Every `score` in
 * the table above is a SUM OF INDEPENDENT PER-FIELD PREDICATES: a sort counts
 * items whose bucket matches, an ordering counts positions, a showdown counts
 * rounds, and the five single-field kinds read one key. No kind reads a second
 * field to decide the first, so scoring a response carrying one field returns 1
 * exactly when that field is right and 0 otherwise. A kind that ever breaks that
 * would break the accumulator too, because the runner adds item scores together.
 *
 * The value is read out of the response rather than taken as an argument so a
 * caller cannot hand this function a value the accumulator never saw. */
export const fieldRight = (c: CheckStep, f: PlainField, r: Response): boolean =>
  scoreOf(c, { [f.id]: r[f.id] ?? '' }) > 0

/** the response that earns full marks. The plain rendering already knows it, so
 *  reading it back off the fields is what proves the plain arm can reach the same
 *  score the game arm can rather than being a lossy copy of the item. */
export const fullMarks = (c: CheckStep): Response =>
  Object.fromEntries(plainOf(c).fields.map((f) => [f.id, f.correct]))

/* ---- the loader's refusal (K5) ----------------------------------------------
 *
 * An invalid item has to be refused BY NAME, at load, rather than rendered into a
 * frame nobody can answer. Every rule below is one a member has already broken in
 * some codebase: two correct options, none, a `do` with nothing to choose between,
 * an ordering whose positions are not a permutation. The message names the check
 * id, because "invalid item" in a console is not a bug report. */
export function refuseCheck(c: CheckStep): string | null {
  const id = checkIdOf(c)
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
  }
}
