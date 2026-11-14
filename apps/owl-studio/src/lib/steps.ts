// Editing a task's steps: order, limits and what must be right before it is saved or published.

import type { Check, CheckKind, Process, Step } from './types.ts'

/** The display limits of the glasses (docs/specs/owl-contract.md). */
export const LIMITS = { title: 32, instruction: 140, sayWords: 25, processTitle: 60, criterion: 120 } as const

export function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

/** "12/32", and how many too many once the limit is passed. */
export function counterText(used: number, limit: number): string {
  return used > limit ? `${used}/${limit}, ${used - limit} too many` : `${used}/${limit}`
}

/** Steps numbered 1, 2, 3 in the order they are in. Ids never change. */
export function renumber(steps: Step[]): Step[] {
  return steps.map((step, i) => (step.index === i + 1 ? step : { ...step, index: i + 1 }))
}

export function moveStep(steps: Step[], from: number, to: number): Step[] {
  if (from === to || from < 0 || from >= steps.length) return steps
  const target = Math.max(0, Math.min(steps.length - 1, to))
  const next = [...steps]
  const [moved] = next.splice(from, 1)
  next.splice(target, 0, moved)
  return renumber(next)
}

export function removeStep(steps: Step[], stepId: string): Step[] {
  return renumber(steps.filter((step) => step.id !== stepId))
}

/** Puts a step back where it was (undo of a delete). */
export function insertStep(steps: Step[], step: Step, at: number): Step[] {
  const next = steps.filter((existing) => existing.id !== step.id)
  next.splice(Math.max(0, Math.min(next.length, at)), 0, step)
  return renumber(next)
}

export function replaceStep(steps: Step[], step: Step): Step[] {
  return steps.map((existing) => (existing.id === step.id ? step : existing))
}

/** A check of another kind, keeping what the reviewer already wrote so switching back loses nothing. */
export function withCheckKind(check: Check, kind: CheckKind): Check {
  if (kind === 'visual') return { ...check, kind, criteria: check.criteria.length ? check.criteria : [''] }
  if (kind === 'order') return { ...check, kind, order_lines: check.order_lines?.length ? check.order_lines : [{ sku: null, name: '', qty: 1 }] }
  return { ...check, kind }
}

export const CHECK_LABEL: Record<CheckKind, string> = {
  none: 'No check',
  visual: 'Owl looks for what you list',
  order: 'Owl checks the order',
}

/**
 * Text the server cut to fit the display ends in "…". That happens when Owl could not rewrite what the expert
 * said, so a person has to: a cut title or instruction is not reviewed yet.
 */
export function isCut(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.endsWith('…') || trimmed.endsWith('...')
}

export function needsRewrite(step: Step): boolean {
  return isCut(step.title) || isCut(step.instruction)
}

/** A step a person has read against what the expert said. Only a step Owl wrote from a recording starts as not reviewed. */
export function isReviewed(step: Step): boolean {
  return step.reviewed !== false
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean)

/**
 * What Owl says is the narration's first words and the narration goes on: the sentence was cut at the word limit
 * without any sign of it, so whatever the expert said after that is missing.
 */
export function sayIsCutStart(say: string, narration: string | null | undefined): boolean {
  const said = words(say)
  const told = words(narration ?? '')
  return said.length > 0 && told.length > said.length && said.every((word, i) => word === told[i])
}

/** Which of a step's three texts look cut. A hint that names the field; the review itself is the person's. */
export function cutHints(step: Step): { title: boolean; instruction: boolean; say: boolean } {
  return { title: isCut(step.title), instruction: isCut(step.instruction), say: sayIsCutStart(step.say, step.source?.quote) }
}

export function unreviewedSteps(process: Process): Step[] {
  return process.steps.filter((step) => !isReviewed(step))
}

export interface Issue {
  /** The step to open, or null when the problem is with the task itself. */
  stepId: string | null
  /** The field to fix: title, summary, instruction, say, criteria, order or steps. */
  field: string
  message: string
}

/** Everything that has to be fixed first. Each message names the step and the field. */
export function validateProcess(process: Process): Issue[] {
  const issues: Issue[] = []
  const title = process.title.trim()
  if (!title) issues.push({ stepId: null, field: 'title', message: 'Give the task a name.' })
  else if (title.length > LIMITS.processTitle) {
    issues.push({ stepId: null, field: 'title', message: `The task name is ${title.length} characters. Shorten it to ${LIMITS.processTitle}.` })
  }
  if (!process.steps.length) issues.push({ stepId: null, field: 'steps', message: 'A task needs at least one step.' })

  process.steps.forEach((step, i) => {
    const at = `Step ${i + 1}`
    const add = (field: string, message: string) => issues.push({ stepId: step.id, field, message: `${at}: ${message}` })
    const stepTitle = step.title.trim()
    if (!stepTitle) add('title', 'give it a title.')
    else if (stepTitle.length > LIMITS.title) add('title', `the title is ${stepTitle.length} characters. The glasses fit ${LIMITS.title}.`)
    const instruction = step.instruction.trim()
    if (!instruction) add('instruction', 'write the instruction the worker reads.')
    else if (instruction.length > LIMITS.instruction) {
      add('instruction', `the instruction is ${instruction.length} characters. The glasses fit ${LIMITS.instruction}.`)
    }
    const words = countWords(step.say)
    if (!words) add('say', 'write what Owl says when the step opens.')
    else if (words > LIMITS.sayWords) add('say', `Owl says ${words} words. Keep it to ${LIMITS.sayWords}.`)
    if (step.check.kind === 'visual') {
      const criteria = step.check.criteria.map((c) => c.trim())
      if (!criteria.some(Boolean)) add('criteria', 'add at least one thing for Owl to look for, or choose No check.')
      else if (criteria.some((c) => c.length > LIMITS.criterion)) add('criteria', `keep each thing to look for under ${LIMITS.criterion} characters.`)
    }
    if (step.check.kind === 'order') {
      const lines = step.check.order_lines ?? []
      if (!lines.length) add('order', 'add at least one product to the order, or choose No check.')
      else if (lines.some((line) => !line.name.trim() || !Number.isInteger(line.qty) || line.qty < 1)) {
        add('order', 'every product needs a name and a quantity of 1 or more.')
      }
    }
  })
  return issues
}

/** What stops a task from going to the glasses, beyond validateProcess: text that was cut and never rewritten. */
export function cutIssues(process: Process): Issue[] {
  const who = process.expert ?? 'the expert'
  const issues: Issue[] = []
  process.steps.forEach((step, i) => {
    for (const field of ['title', 'instruction'] as const) {
      if (isCut(step[field])) {
        issues.push({
          stepId: step.id,
          field,
          message: `Step ${i + 1}: the ${field} was cut to fit and ends in "…". Rewrite it in full; everything ${who} said is beside it.`,
        })
      }
    }
  })
  return issues
}

/** Steps no person has marked as reviewed. Editing a step does not review it: the reviewer says so. */
export function reviewIssues(process: Process): Issue[] {
  const who = process.expert ?? 'the expert'
  const issues: Issue[] = []
  process.steps.forEach((step, i) => {
    if (!isReviewed(step)) issues.push({ stepId: step.id, field: 'review', message: `Step ${i + 1}: read it against what ${who} said, then mark it reviewed.` })
  })
  return issues
}

/** Everything to fix before a task is published: what is wrong, what was cut, and what no person has reviewed. */
export function publishIssues(process: Process): Issue[] {
  return [...validateProcess(process), ...cutIssues(process), ...reviewIssues(process)]
}

/** The task as the server should store it: trimmed words, steps numbered in order, no leftovers from another check kind. */
export function normalizeForSave(process: Process): Process {
  return {
    ...process,
    title: process.title.trim(),
    summary: process.summary.trim(),
    steps: renumber(process.steps).map((step) => {
      const criteria = step.check.criteria.map((c) => c.trim()).filter(Boolean)
      const lines = (step.check.order_lines ?? []).map((line) => ({ sku: line.sku?.trim() || null, name: line.name.trim(), qty: line.qty }))
      // The expert's warning line and done_when are not edited here, but they must survive a save (JUN-106).
      const kept = { warning: step.check.warning?.trim() || null, done_when: step.check.kind === 'visual' ? step.check.done_when?.trim() || null : null }
      const check: Check =
        step.check.kind === 'order'
          ? { kind: 'order', criteria, order_lines: lines, ...kept }
          : { kind: step.check.kind, criteria: step.check.kind === 'visual' ? criteria : [], order_lines: null, ...kept }
      return { ...step, title: step.title.trim(), instruction: step.instruction.trim(), say: step.say.trim(), check, reviewed: isReviewed(step) }
    }),
  }
}

export function sameProcess(a: Process, b: Process): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Drafts first, since they wait for a person; then by name. */
export function sortProcesses(processes: Process[]): Process[] {
  return [...processes].sort((a, b) => Number(a.status === 'published') - Number(b.status === 'published') || a.title.localeCompare(b.title))
}

export function stepById(process: Process | null | undefined, stepId: string | null | undefined): Step | null {
  return process?.steps.find((step) => step.id === stepId) ?? null
}

/** Where the task's steps came from, kept short: the status badge says the rest. */
export function originText(process: Process): string {
  if (process.source === 'docs') return 'From your documents'
  return process.expert ? `Recorded by ${process.expert}` : 'Recorded on the glasses'
}

/** "Sami learns it", "Sami and Mikko learn it", "3 people learn it", or nothing when no one is assigned. */
export function learnersText(names: string[]): string {
  if (names.length === 0) return ''
  if (names.length === 1) return `${names[0]} learns it`
  if (names.length === 2) return `${names[0]} and ${names[1]} learn it`
  return `${names.length} people learn it`
}

export function stepsText(count: number): string {
  return count === 1 ? '1 step' : `${count} steps`
}
