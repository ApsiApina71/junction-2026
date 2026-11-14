import { describe, expect, it } from 'vitest'
import { process, step } from '../test/helpers.tsx'
import {
  LIMITS,
  counterText,
  countWords,
  cutIssues,
  insertStep,
  isCut,
  learnersText,
  moveStep,
  normalizeForSave,
  originText,
  publishIssues,
  removeStep,
  renumber,
  reviewIssues,
  sayIsCutStart,
  sortProcesses,
  validateProcess,
  withCheckKind,
} from './steps.ts'

const ids = (steps: { id: string }[]) => steps.map((s) => s.id)
const indexes = (steps: { index: number }[]) => steps.map((s) => s.index)

describe('reordering steps', () => {
  const steps = [step(1), step(2), step(3)]

  it('moves a step and numbers the steps 1, 2, 3 again, keeping their ids', () => {
    const moved = moveStep(steps, 2, 0)
    expect(ids(moved)).toEqual(['step-3', 'step-1', 'step-2'])
    expect(indexes(moved)).toEqual([1, 2, 3])
  })

  it('leaves the list alone for a move to the same place or from outside it', () => {
    expect(moveStep(steps, 1, 1)).toBe(steps)
    expect(moveStep(steps, 7, 0)).toBe(steps)
  })

  it('keeps a move past the end inside the list', () => {
    expect(ids(moveStep(steps, 0, 9))).toEqual(['step-2', 'step-3', 'step-1'])
  })

  it('removes a step, and puts it back where it was on undo', () => {
    const without = removeStep(steps, 'step-2')
    expect(ids(without)).toEqual(['step-1', 'step-3'])
    expect(indexes(without)).toEqual([1, 2])
    const back = insertStep(without, steps[1], 1)
    expect(ids(back)).toEqual(['step-1', 'step-2', 'step-3'])
    expect(indexes(back)).toEqual([1, 2, 3])
  })

  it('does not copy a step whose number is already right', () => {
    expect(renumber(steps)[0]).toBe(steps[0])
  })
})

describe('limits', () => {
  it('counts words the way a person would', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   ')).toBe(0)
    expect(countWords('Pick the  three\nitems')).toBe(4)
  })

  it('says how many too many once the limit is passed', () => {
    expect(counterText(12, 32)).toBe('12/32')
    expect(counterText(40, 32)).toBe('40/32, 8 too many')
  })
})

describe('what must be fixed before saving', () => {
  it('finds nothing wrong with a good task', () => {
    expect(validateProcess(process())).toEqual([])
  })

  it('names the step and the field', () => {
    const long = 'x'.repeat(LIMITS.title + 8)
    const issues = validateProcess(process({ steps: [step(1), step(2, { title: long }), step(3, { instruction: ' ' })] }))
    expect(issues).toEqual([
      { stepId: 'step-2', field: 'title', message: 'Step 2: the title is 40 characters. The glasses fit 32.' },
      { stepId: 'step-3', field: 'instruction', message: 'Step 3: write the instruction the worker reads.' },
    ])
  })

  it('asks for a task name and at least one step', () => {
    const issues = validateProcess(process({ title: ' ', steps: [] }))
    expect(issues.map((i) => i.message)).toEqual(['Give the task a name.', 'A task needs at least one step.'])
  })

  it('limits what Owl says to 25 words', () => {
    const say = Array.from({ length: 27 }, () => 'word').join(' ')
    expect(validateProcess(process({ steps: [step(1, { say })] }))[0].message).toBe('Step 1: Owl says 27 words. Keep it to 25.')
  })

  it('wants something to look for in a visual check, since one without can never pass', () => {
    const issues = validateProcess(process({ steps: [step(1, { check: { kind: 'visual', criteria: ['', ' '], order_lines: null } })] }))
    expect(issues[0].field).toBe('criteria')
    expect(issues[0].message).toContain('add at least one thing for Owl to look for')
  })

  it('wants a name and a whole quantity on every order line', () => {
    const bad = step(1, { check: { kind: 'order', criteria: [], order_lines: [{ sku: null, name: 'Oat drink 1 l', qty: 0 }] } })
    expect(validateProcess(process({ steps: [bad] }))[0].message).toBe('Step 1: every product needs a name and a quantity of 1 or more.')
    const empty = step(1, { check: { kind: 'order', criteria: [], order_lines: [] } })
    expect(validateProcess(process({ steps: [empty] }))[0].field).toBe('order')
  })

  it('accepts a step without a check', () => {
    expect(validateProcess(process({ steps: [step(1, { check: { kind: 'none', criteria: [], order_lines: null } })] }))).toEqual([])
  })
})

describe('text that was cut and never rewritten', () => {
  it('knows cut text by its ending', () => {
    expect(isCut('Take the label and put it on the top side of the box, never…')).toBe(true)
    expect(isCut('Wait for the light...  ')).toBe(true)
    expect(isCut('Seal and label')).toBe(false)
  })

  it('does not stop a draft from being saved, but stops it from being published', () => {
    const cut = process({ steps: [step(1, { instruction: 'Tape the box shut and put the label on the top side, and remember…' })] })
    expect(validateProcess(cut)).toEqual([])
    expect(cutIssues(cut)).toEqual([
      { stepId: 'step-1', field: 'instruction', message: 'Step 1: the instruction was cut to fit and ends in "…". Rewrite it in full; everything Laura said is beside it.' },
    ])
    expect(publishIssues(cut)).toHaveLength(1)
  })

})

describe('review is something a person says, not something guessed', () => {
  const narration = 'Tape the box shut along the middle seam, all the way across, press it down, then put the shipping label on the top side. Never put the label over the tape.'

  it('knows a spoken sentence that is only the start of what the expert said', () => {
    const first25 = narration.split(' ').slice(0, 25).join(' ')
    expect(sayIsCutStart(first25, narration)).toBe(true)
    expect(sayIsCutStart(narration, narration)).toBe(false)
    expect(sayIsCutStart('Tape the box shut, then put the label on top. Never over the tape.', narration)).toBe(false)
    expect(sayIsCutStart('', narration)).toBe(false)
    expect(sayIsCutStart('Tape the box', null)).toBe(false)
  })

  it('stops publishing while a step is not reviewed, however the text looks', () => {
    const rewritten = process({ steps: [step(1), step(2, { reviewed: false })] })
    expect(validateProcess(rewritten)).toEqual([])
    expect(reviewIssues(rewritten)).toEqual([{ stepId: 'step-2', field: 'review', message: 'Step 2: read it against what Laura said, then mark it reviewed.' }])
    expect(publishIssues(rewritten)).toHaveLength(1)
    expect(publishIssues(process())).toEqual([])
  })

  it('treats a step from an older server, with no review flag, as reviewed', () => {
    const old = step(1)
    delete old.reviewed
    expect(reviewIssues(process({ steps: [old] }))).toEqual([])
    expect(normalizeForSave(process({ steps: [old] })).steps[0].reviewed).toBe(true)
  })

  it('sends the review flag as the person left it', () => {
    const sent = normalizeForSave(process({ steps: [step(1, { reviewed: false }), step(2)] }))
    expect(sent.steps.map((s) => s.reviewed)).toEqual([false, true])
  })
})

describe('the short line under a task', () => {
  it('says where the steps came from, and nothing the badge already says', () => {
    expect(originText(process())).toBe('Recorded by Laura')
    expect(originText(process({ expert: null }))).toBe('Recorded on the glasses')
    expect(originText(process({ source: 'docs', expert: null }))).toBe('From your documents')
  })

  it('names who learns a task', () => {
    expect(learnersText([])).toBe('')
    expect(learnersText(['Sami'])).toBe('Sami learns it')
    expect(learnersText(['Sami', 'Mikko'])).toBe('Sami and Mikko learn it')
    expect(learnersText(['Sami', 'Mikko', 'Aino'])).toBe('3 people learn it')
  })
})

describe('what is sent to the server', () => {
  it('trims the words, numbers the steps and drops leftovers of another kind of check', () => {
    const edited = process({
      title: '  Pick and pack  ',
      steps: [
        step(1, { index: 5, title: ' Take a box ', check: { kind: 'none', criteria: ['left over'], order_lines: [{ sku: 'X', name: 'left over', qty: 1 }] } }),
        step(2, { index: 9, check: { kind: 'visual', criteria: [' The box is open ', ''], order_lines: [{ sku: 'X', name: 'left over', qty: 1 }] } }),
        step(3, { index: 2, check: { kind: 'order', criteria: ['Every order line is in the box'], order_lines: [{ sku: ' ', name: ' Coffee 500 g ', qty: 2 }] } }),
      ],
    })
    const sent = normalizeForSave(edited)
    expect(sent.title).toBe('Pick and pack')
    expect(indexes(sent.steps)).toEqual([1, 2, 3])
    expect(sent.steps[0].title).toBe('Take a box')
    expect(sent.steps[0].check).toEqual({ kind: 'none', criteria: [], order_lines: null })
    expect(sent.steps[1].check).toEqual({ kind: 'visual', criteria: ['The box is open'], order_lines: null })
    expect(sent.steps[2].check).toEqual({ kind: 'order', criteria: ['Every order line is in the box'], order_lines: [{ sku: null, name: 'Coffee 500 g', qty: 2 }] })
  })

  it('starts a new check with one empty line to fill in, and keeps what was written when switching back', () => {
    const none = { kind: 'none' as const, criteria: [], order_lines: null }
    expect(withCheckKind(none, 'visual').criteria).toEqual([''])
    expect(withCheckKind(none, 'order').order_lines).toEqual([{ sku: null, name: '', qty: 1 }])
    const written = { kind: 'visual' as const, criteria: ['The label is on top'], order_lines: null }
    expect(withCheckKind(withCheckKind(written, 'none'), 'visual').criteria).toEqual(['The label is on top'])
  })
})

describe('the task list', () => {
  it('puts drafts first, since they wait for a person', () => {
    const list = sortProcesses([process({ id: 'a', title: 'Zebra', status: 'published' }), process({ id: 'b', title: 'Mango', status: 'draft' }), process({ id: 'c', title: 'Apple', status: 'published' })])
    expect(list.map((p) => p.id)).toEqual(['b', 'c', 'a'])
  })
})
