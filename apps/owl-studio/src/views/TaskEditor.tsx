import { useEffect, useMemo, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { glassesName } from '../lib/docs.ts'
import { LANGUAGES, languageName } from '../lib/languages.ts'
import { href } from '../lib/route.ts'
import {
  CHECK_LABEL,
  LIMITS,
  countWords,
  cutHints,
  cutIssues,
  insertStep,
  isReviewed,
  learnersText,
  moveStep,
  normalizeForSave,
  originText,
  removeStep,
  replaceStep,
  reviewIssues,
  sameProcess,
  stepsText,
  validateProcess,
  withCheckKind,
} from '../lib/steps.ts'
import type { Issue } from '../lib/steps.ts'
import { useStudio } from '../lib/studio.ts'
import type { Check, CheckKind, Employee, OrderLine, Process, Step } from '../lib/types.ts'
import { Icon } from '../ui/Icon.tsx'
import { Counter, IconButton, Loading, Problem, StatusTag } from '../ui/parts.tsx'
import { useToast, useUnsaved } from '../ui/toast.ts'
import { GlassesPreview } from './GlassesPreview.tsx'

type Busy = 'save' | 'publish' | 'unpublish' | null

/** Review a task before workers use it: read each step against what the expert said, fix it, mark it reviewed, publish. */
export function TaskEditor({ processId }: { processId: string }) {
  const studio = useStudio()
  const toast = useToast()
  const setUnsaved = useUnsaved()
  const [saved, setSaved] = useState<Process | null>(null)
  const [draft, setDraft] = useState<Process | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState<Busy>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [problemsOpen, setProblemsOpen] = useState(false)
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null)
  const [moved, setMoved] = useState('')
  // The last removed step, offered back as Undo in the bar for a while (a toast carries no buttons).
  const [removed, setRemoved] = useState<{ step: Step; at: number } | null>(null)
  const learnersRef = useRef<HTMLElement>(null)

  // Load once. Later answers from the server never overwrite what is being edited.
  useEffect(() => {
    if (saved) return
    const start = (process: Process) => {
      setSaved(process)
      setDraft(process)
      setSelectedId((process.steps.find((step) => !isReviewed(step)) ?? process.steps[0])?.id ?? null)
    }
    const known = studio.processes?.find((process) => process.id === processId)
    if (known) {
      start(known)
      return
    }
    if (studio.processes === null) return
    let cancelled = false
    studio.api
      .process(processId)
      .then((process) => !cancelled && start(process))
      .catch((error: unknown) => !cancelled && setLoadError(messageOf(error)))
    return () => {
      cancelled = true
    }
  }, [saved, studio.processes, studio.api, processId])

  const dirty = !!draft && !!saved && !sameProcess(draft, saved)
  useEffect(() => {
    setUnsaved(dirty)
    return () => setUnsaved(false)
  }, [dirty, setUnsaved])

  // Wrong stops saving. Cut text and steps no person has reviewed stop publishing.
  const wrong = useMemo(() => (draft ? validateProcess(draft) : []), [draft])
  const notReady = useMemo(() => (draft ? [...cutIssues(draft), ...reviewIssues(draft)] : []), [draft])

  if (loadError) {
    return (
      <div className="view">
        <a className="back-link" href={href('tasks')}>
          <Icon name="back" size={18} />
          Tasks
        </a>
        <Problem>{loadError}</Problem>
      </div>
    )
  }
  if (!draft || !saved) {
    return (
      <div className="view">
        <Loading what="Opening the task" />
      </div>
    )
  }

  const selected = draft.steps.find((step) => step.id === selectedId) ?? draft.steps[0] ?? null
  const isDraft = saved.status === 'draft'
  const issues = [...wrong, ...notReady]
  const stepIsWrong = (stepId: string) => wrong.some((issue) => issue.stepId === stepId)
  const toReview = draft.steps.filter((step) => !isReviewed(step)).length
  const learners = (studio.employees ?? []).filter((employee) => employee.process_ids.includes(draft.id))
  const languages = LANGUAGES.some((option) => option.code === draft.language) ? LANGUAGES : [...LANGUAGES, { code: draft.language, native: draft.language, english: draft.language, speech: draft.language }]

  const changeStep = (step: Step) => setDraft({ ...draft, steps: replaceStep(draft.steps, step) })

  const move = (from: number, to: number) => {
    if (to < 0 || to >= draft.steps.length || from === to) return
    setDraft({ ...draft, steps: moveStep(draft.steps, from, to) })
    setMoved(`${draft.steps[from].title || 'Step'} is now step ${to + 1} of ${draft.steps.length}.`)
  }

  const remove = (step: Step) => {
    const at = draft.steps.findIndex((s) => s.id === step.id)
    const rest = removeStep(draft.steps, step.id)
    setDraft({ ...draft, steps: rest })
    if (selected?.id === step.id) setSelectedId(rest[Math.min(at, rest.length - 1)]?.id ?? null)
    toast({ message: `Step ${at + 1} removed.` })
    setRemoved({ step, at })
  }

  const undoRemove = () => {
    if (!removed) return
    setDraft((current) => (current ? { ...current, steps: insertStep(current.steps, removed.step, removed.at) } : current))
    setSelectedId(removed.step.id)
    setRemoved(null)
  }

  /** Opens the step and puts the cursor in the field the problem is about. */
  const goTo = (issue: Issue) => {
    if (issue.stepId) setSelectedId(issue.stepId)
    else setDetailsOpen(true)
    const target = issue.stepId ? `step-${issue.field}` : `task-${issue.field}`
    requestAnimationFrame(() => document.getElementById(target)?.focus())
  }

  const send = async (kind: Exclude<Busy, null>) => {
    const status = kind === 'publish' ? 'published' : kind === 'unpublish' ? 'draft' : saved.status
    // A draft can be saved half reviewed. Nothing is published with a step no person has reviewed.
    const stop = status === 'published' ? issues : wrong
    if (stop.length) {
      setProblemsOpen(true)
      goTo(stop[0])
      return
    }
    setBusy(kind)
    setSaveError(null)
    try {
      const answer = await studio.api.saveProcess({ ...normalizeForSave(draft), status })
      setSaved(answer)
      setRemoved(null)
      setDraft(answer)
      studio.putProcess(answer)
      setProblemsOpen(false)
      if (kind === 'publish') {
        // Published is not yet learned: the next thing to decide is who gets it.
        toast({ message: 'Published. Now choose who learns it.' })
        requestAnimationFrame(() => learnersRef.current?.focus())
      } else {
        toast({
          message:
            kind === 'unpublish'
              ? 'Unpublished. No one gets this task on the glasses now.'
              : answer.status === 'published'
                ? 'Saved. Workers get the new version the next time they open the task.'
                : 'Saved. It stays a draft until you publish it.',
        })
      }
    } catch (error) {
      setSaveError(messageOf(error))
      setProblemsOpen(true)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="view editor">
      <a className="back-link" href={href('tasks')}>
        <Icon name="back" size={18} />
        Tasks
      </a>

      <header className="editor-head">
        <div className="editor-head-line">
          <h1>{draft.title.trim() || 'Untitled task'}</h1>
          {isDraft ? (
            <StatusTag tone="signal" shape="diamond">
              Draft, needs review
            </StatusTag>
          ) : learners.length ? (
            <StatusTag tone="success" shape="disc">
              Published
            </StatusTag>
          ) : (
            <StatusTag tone="muted" shape="ring">
              Published, no one assigned
            </StatusTag>
          )}
          <button type="button" className="button button-quiet button-small" onClick={() => setDetailsOpen(!detailsOpen)} aria-expanded={detailsOpen} aria-controls="task-details">
            {detailsOpen ? 'Hide details' : 'Edit name and language'}
          </button>
        </div>
        <p className="editor-meta">
          {[stepsText(draft.steps.length), originText(draft), languageName(draft.language), isDraft && toReview > 0 ? `${toReview} of ${draft.steps.length} to review` : isDraft ? 'every step reviewed' : learnersText(learners.map((e) => e.name))]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {detailsOpen && (
          <div id="task-details" className="panel task-details">
            <div className="field">
              <label htmlFor="task-title">Task name</label>
              <input id="task-title" className="input" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="task-summary">In one sentence</label>
              <textarea id="task-summary" className="input" rows={2} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="task-language">Language of this task</label>
              <select id="task-language" className="input" value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value })} aria-describedby={isDraft && draft.source === 'record' ? 'task-language-hint' : undefined}>
                {languages.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.native === option.english ? option.native : `${option.native} (${option.english})`}
                  </option>
                ))}
              </select>
              {isDraft && draft.source === 'record' && (
                <p className="hint" id="task-language-hint">
                  Owl guessed this from the recording. Correct it if it is wrong.
                </p>
              )}
            </div>
          </div>
        )}
      </header>

      {problemsOpen && (issues.length > 0 || saveError) && (
        <section className="note note-signal problems" aria-labelledby="problems-heading">
          <span className="shape shape-diamond" aria-hidden="true" />
          <div className="note-body">
            <h2 id="problems-heading">{isDraft ? 'Before this can be published' : 'Before this can be saved'}</h2>
            {saveError && <p>{saveError}</p>}
            {issues.length > 0 && (
              <ul>
                {issues.map((issue) => (
                  <li key={`${issue.stepId}-${issue.field}-${issue.message}`}>
                    <button type="button" className="link-button" onClick={() => goTo(issue)}>
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {!isDraft && <Learners process={saved} headingRef={learnersRef} />}

      <div className="editor-grid">
        <section className="panel steps-panel" aria-labelledby="steps-heading">
          <h2 id="steps-heading">Steps</h2>
          {draft.steps.length === 0 ? (
            <p className="muted">This task has no steps left. Undo the last removal, or leave without saving.</p>
          ) : (
            <ol className="step-list">
              {draft.steps.map((step, i) => {
                const isSelected = selected?.id === step.id
                const hints = cutHints(step)
                const cut = hints.title || hints.instruction
                const classes = ['step-item', isSelected && 'is-selected', drag?.from === i && 'is-dragging', drag && drag.over === i && drag.from !== i && 'is-drop-target'].filter(Boolean).join(' ')
                return (
                  <li
                    key={step.id}
                    className={classes}
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move'
                      event.dataTransfer.setData('text/plain', step.id)
                      setDrag({ from: i, over: null })
                    }}
                    onDragOver={(event) => {
                      if (!drag) return
                      event.preventDefault()
                      if (drag.over !== i) setDrag({ ...drag, over: i })
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      if (drag) move(drag.from, i)
                      setDrag(null)
                    }}
                    onDragEnd={() => setDrag(null)}
                  >
                    <span className="step-grip" aria-hidden="true">
                      <Icon name="grip" size={18} />
                    </span>
                    <button type="button" className="step-pick" onClick={() => setSelectedId(step.id)} aria-current={isSelected ? 'step' : undefined}>
                      <span className="step-number">{i + 1}</span>
                      <span className="step-pick-text">
                        <span className="step-pick-title">{step.title.trim() || 'Untitled step'}</span>
                        {!isReviewed(step) || cut ? (
                          <span className="step-pick-meta is-signal">
                            <span className="shape shape-diamond" aria-hidden="true" />
                            {cut ? 'Cut text, needs rewriting' : 'Needs your review'}
                          </span>
                        ) : (
                          <span className="step-pick-meta">
                            {CHECK_LABEL[step.check.kind]}
                            {stepIsWrong(step.id) ? ' · needs fixing' : ''}
                          </span>
                        )}
                      </span>
                    </button>
                    {isSelected && (
                      <span className="step-tools">
                        <IconButton icon="up" label={`Move step ${i + 1} up`} disabled={i === 0} onClick={() => move(i, i - 1)} />
                        <IconButton icon="down" label={`Move step ${i + 1} down`} disabled={i === draft.steps.length - 1} onClick={() => move(i, i + 1)} />
                        <IconButton icon="trash" tone="danger" label={`Remove step ${i + 1}`} onClick={() => remove(step)} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ol>
          )}
          <p className="hint">Drag a step, or choose it and use the arrows, to change the order.</p>
          <p className="visually-hidden" aria-live="polite">
            {moved}
          </p>
        </section>

        {selected && (
          <>
            <StepForm key={selected.id} step={selected} total={draft.steps.length} process={draft} onChange={changeStep} />
            <aside className="preview-panel" aria-labelledby="preview-heading">
              <h2 id="preview-heading">On the glasses</h2>
              <GlassesPreview step={selected} total={draft.steps.length} />
              <p className="hint">Black is see-through on the glasses, so the worker sees their hands and the task through it.</p>
            </aside>
          </>
        )}
      </div>

      <div className="editor-bar">
        <div className="editor-bar-status">
          {issues.length > 0 ? (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                setProblemsOpen(true)
                goTo(issues[0])
              }}
            >
              {issues.length} to fix<span className="bar-more"> before {isDraft && wrong.length === 0 ? 'publishing' : 'saving'}</span>
            </button>
          ) : (
            <span className="muted">{dirty ? 'Not saved yet' : 'Saved'}</span>
          )}
        </div>
        <div className="editor-bar-actions">
          {removed && (
            <button type="button" className="button button-quiet" onClick={undoRemove}>
              Undo
            </button>
          )}
          {isDraft ? (
            <>
              <button type="button" className="button button-secondary" onClick={() => void send('save')} disabled={busy !== null || !dirty}>
                {busy === 'save' ? 'Saving' : 'Save draft'}
              </button>
              <button type="button" className="button button-primary" onClick={() => void send('publish')} disabled={busy !== null}>
                {busy === 'publish' ? 'Publishing' : 'Publish'}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="button button-quiet" onClick={() => void send('unpublish')} disabled={busy !== null}>
                {busy === 'unpublish' ? 'Unpublishing' : 'Unpublish'}
              </button>
              <button type="button" className="button button-primary" onClick={() => void send('save')} disabled={busy !== null || !dirty}>
                {busy === 'save' ? 'Saving' : 'Save changes'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Publishing a task does not give it to anyone. This is where the reviewer says who learns it. */
function Learners({ process, headingRef }: { process: Process; headingRef: React.RefObject<HTMLElement | null> }) {
  const studio = useStudio()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  // With more than one workplace on the server, a task is offered to the people of its own workplace.
  const employees = (studio.employees ?? []).filter((employee) => !process.company || !employee.company || employee.company === process.company)

  const toggle = async (employee: Employee) => {
    const has = employee.process_ids.includes(process.id)
    setBusyId(employee.id)
    setProblem(null)
    try {
      await studio.api.updateEmployee(employee.id, { process_ids: has ? employee.process_ids.filter((id) => id !== process.id) : [...employee.process_ids, process.id] })
      await studio.reload()
    } catch (error) {
      setProblem(messageOf(error))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="panel learners" aria-labelledby="learners-heading" ref={headingRef} tabIndex={-1}>
      <div className="learners-head">
        <h2 id="learners-heading">Who learns this task</h2>
        <p className="hint">A worker gets it the next time they open Owl on their glasses.</p>
      </div>
      {employees.length === 0 ? (
        <p className="muted">
          There is no one to give it to yet. <a href={href('people', 'new')}>Add a person</a>.
        </p>
      ) : (
        <ul className="learner-list">
          {employees.map((employee) => (
            <li key={employee.id}>
              <label className={employee.process_ids.includes(process.id) ? 'learner is-on' : 'learner'}>
                <input type="checkbox" checked={employee.process_ids.includes(process.id)} disabled={busyId !== null} onChange={() => void toggle(employee)} />
                <span>
                  {employee.name}
                  <span className="learner-meta">
                    {' '}
                    · {languageName(employee.language)}
                    {employee.glasses_id ? ` · ${glassesName(employee.glasses_id)}` : ' · no glasses yet'}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {problem && <Problem>{problem}</Problem>}
    </section>
  )
}

function StepForm({ step, total, process, onChange }: { step: Step; total: number; process: Process; onChange: (step: Step) => void }) {
  const [refused, setRefused] = useState<string | null>(null)
  const titleLength = step.title.trim().length
  const instructionLength = step.instruction.trim().length
  const sayWords = countWords(step.say)
  const recorded = process.source === 'record'
  const expert = process.expert ?? 'the expert'
  const hints = cutHints(step)
  const reviewed = isReviewed(step)

  const markReviewed = () => {
    // Text that still ends in "…" is what the server cut, not what a person wrote: it cannot be called reviewed.
    const cutField = hints.title ? 'title' : hints.instruction ? 'instruction' : null
    if (cutField) {
      setRefused(`The ${cutField} still ends in "…". Rewrite it in full first.`)
      document.getElementById(`step-${cutField}`)?.focus()
      return
    }
    setRefused(null)
    onChange({ ...step, reviewed: true })
  }

  return (
    <section className="panel step-form" aria-labelledby="step-heading">
      <div className="step-form-head">
        <h2 id="step-heading">
          Step {step.index} of {total}
        </h2>
        {recorded && reviewed && (
          <span className="reviewed-line">
            <StatusTag tone="success" shape="disc">
              Reviewed
            </StatusTag>
            <button type="button" className="link-button" onClick={() => onChange({ ...step, reviewed: false })}>
              Not yet
            </button>
          </span>
        )}
      </div>

      {!reviewed && (
        <div className="note note-signal">
          <span className="shape shape-diamond" aria-hidden="true" />
          <div className="note-body">
            <p>
              <strong>This step needs you.</strong> Owl wrote it from what {expert} said. Read the title, the instruction and what Owl says against {step.source ? `everything ${expert} said beside them` : 'the photo'}, fix what is missing, then mark the step reviewed.
            </p>
            {refused && (
              <p className="field-error" role="alert">
                {refused}
              </p>
            )}
            <button type="button" id="step-review" className="button button-secondary" onClick={markReviewed}>
              <Icon name="check" size={18} />
              Mark step reviewed
            </button>
          </div>
        </div>
      )}

      <div className="step-columns">
        <div className="step-written">
          <div className="field">
            <div className="field-label">
              <label htmlFor="step-title">Title</label>
              <Counter used={titleLength} limit={LIMITS.title} unit="characters" />
            </div>
            <input
              id="step-title"
              className="input"
              value={step.title}
              onChange={(event) => onChange({ ...step, title: event.target.value })}
              aria-invalid={titleLength > LIMITS.title || titleLength === 0 || hints.title}
              data-cut={hints.title}
              autoComplete="off"
            />
            {hints.title && <p className="field-error is-signal">Cut to fit. Rewrite it so it does not end in "…".</p>}
          </div>

          <div className="field">
            <div className="field-label">
              <label htmlFor="step-instruction">Instruction on the display</label>
              <Counter used={instructionLength} limit={LIMITS.instruction} unit="characters" />
            </div>
            <textarea
              id="step-instruction"
              className="input"
              rows={5}
              value={step.instruction}
              onChange={(event) => onChange({ ...step, instruction: event.target.value })}
              aria-invalid={instructionLength > LIMITS.instruction || instructionLength === 0 || hints.instruction}
              data-cut={hints.instruction}
            />
            {hints.instruction && <p className="field-error is-signal">Cut to fit. Rewrite it so it does not end in "…".</p>}
          </div>

          <div className="field">
            <div className="field-label">
              <label htmlFor="step-say">What Owl says</label>
              <Counter used={sayWords} limit={LIMITS.sayWords} unit="words" />
            </div>
            <textarea
              id="step-say"
              className="input"
              rows={3}
              value={step.say}
              onChange={(event) => onChange({ ...step, say: event.target.value })}
              aria-invalid={sayWords > LIMITS.sayWords || sayWords === 0}
              data-cut={hints.say}
              aria-describedby="step-say-hint"
            />
            {hints.say ? (
              <p className="field-error is-signal" id="step-say-hint">
                These are the first {sayWords} words of what {expert} said, and {expert} said more. Write one whole sentence for Owl to say.
              </p>
            ) : (
              <p className="hint" id="step-say-hint">
                Spoken in the worker's ear when the step opens. Say it the way you would to a new colleague.
              </p>
            )}
          </div>

          <CheckEditor step={step} onChange={onChange} />
        </div>

        <div className="step-recording" role="group" aria-label={recorded ? `${expert}'s recording of this step` : 'Where this step comes from'}>
          {step.source && (
            <figure className="narration">
              <figcaption>{recorded ? `What ${expert} said` : `From ${step.source.doc}${step.source.section ? `, ${step.source.section}` : ''}`}</figcaption>
              <blockquote>{step.source.quote}</blockquote>
            </figure>
          )}
          <figure className="media">
            {step.reference_image_url ? (
              <img src={step.reference_image_url} alt={`The expert's photo of step ${step.index} done right`} />
            ) : (
              <div className="media-empty">No photo for this step</div>
            )}
            <figcaption>{recorded ? `${expert}'s photo of the finished step.` : 'The photo of the finished step.'} The worker sees it on the glasses.</figcaption>
          </figure>
          {step.clip_url && (
            <figure className="media">
              <video src={step.clip_url} controls preload="metadata" playsInline muted aria-label={`The expert's clip of step ${step.index}`} />
              <figcaption>Watch how: played on the glasses when the worker asks.</figcaption>
            </figure>
          )}
        </div>
      </div>
    </section>
  )
}

const KINDS: { kind: CheckKind; label: string }[] = [
  { kind: 'none', label: 'No check' },
  { kind: 'visual', label: 'Look for things' },
  { kind: 'order', label: 'Check an order' },
]

function CheckEditor({ step, onChange }: { step: Step; onChange: (step: Step) => void }) {
  const check = step.check
  // After "Add", the new empty line takes the focus so the reviewer can type straight away.
  const [focusNew, setFocusNew] = useState(false)
  const set = (next: Check) => onChange({ ...step, check: next })
  const choose = (kind: CheckKind) => {
    set(withCheckKind(check, kind))
    setFocusNew(kind !== 'none')
  }
  const lines = check.order_lines ?? []
  const setLine = (i: number, patch: Partial<OrderLine>) => set({ ...check, order_lines: lines.map((line, at) => (at === i ? { ...line, ...patch } : line)) })

  return (
    <fieldset className="check">
      <legend>How Owl checks this step</legend>
      <div className="segmented" id="step-criteria" tabIndex={-1}>
        {KINDS.map(({ kind, label }) => (
          <label key={kind} className={check.kind === kind ? 'segment is-on' : 'segment'}>
            <input type="radio" name={`check-${step.id}`} checked={check.kind === kind} onChange={() => choose(kind)} />
            <span>{label}</span>
          </label>
        ))}
      </div>

      {check.kind === 'none' && (
        <div className="nudge">
          <p>
            <strong>Owl does not check this step yet.</strong> The worker confirms it with a pinch. Tell Owl what a finished step looks like and it speaks up when something is off.
          </p>
          <div className="nudge-actions">
            <button type="button" className="button button-secondary" onClick={() => choose('visual')}>
              <Icon name="plus" size={18} />
              Add what Owl should check
            </button>
            <button type="button" className="button button-quiet" onClick={() => choose('order')}>
              Check an order instead
            </button>
          </div>
        </div>
      )}

      {check.kind === 'visual' && (
        <div className="check-body">
          <p className="hint">Things anyone can see when the step is done right. Owl passes the step only when it has seen every one of them, so keep to one to three.</p>
          <ul className="criteria">
            {check.criteria.map((criterion, i) => (
              <li key={i}>
                <input
                  className="input"
                  value={criterion}
                  aria-label={`Thing to look for ${i + 1}`}
                  placeholder={i === 0 ? 'For example: the box is taped shut' : ''}
                  autoFocus={focusNew && i === check.criteria.length - 1}
                  onChange={(event) => set({ ...check, criteria: check.criteria.map((c, at) => (at === i ? event.target.value : c)) })}
                />
                <IconButton icon="x" label={`Remove thing to look for ${i + 1}`} onClick={() => set({ ...check, criteria: check.criteria.filter((_, at) => at !== i) })} />
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => {
              set({ ...check, criteria: [...check.criteria, ''] })
              setFocusNew(true)
            }}
          >
            <Icon name="plus" size={18} />
            Add another thing to look for
          </button>
        </div>
      )}

      {check.kind === 'order' && (
        <div className="check-body" id="step-order" tabIndex={-1}>
          <p className="hint">Owl counts what it sees in the box against these lines and speaks up about a wrong product or number.</p>
          <div className="order-lines" role="group" aria-label="Products on the order">
            <div className="order-line order-head" aria-hidden="true">
              <span>Product</span>
              <span>How many</span>
              <span>Code</span>
              <span />
            </div>
            {lines.map((line, i) => (
              <div className="order-line" key={i}>
                <input className="input" value={line.name} aria-label={`Product ${i + 1}`} autoFocus={focusNew && i === lines.length - 1} onChange={(event) => setLine(i, { name: event.target.value })} />
                <input
                  className="input input-number"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={Number.isFinite(line.qty) && line.qty > 0 ? line.qty : ''}
                  aria-label={`How many of product ${i + 1}`}
                  onChange={(event) => setLine(i, { qty: Number.parseInt(event.target.value, 10) || 0 })}
                />
                <input className="input" value={line.sku ?? ''} aria-label={`Code of product ${i + 1}`} onChange={(event) => setLine(i, { sku: event.target.value || null })} />
                <IconButton icon="x" label={`Remove product ${i + 1}`} onClick={() => set({ ...check, order_lines: lines.filter((_, at) => at !== i) })} />
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button button-quiet button-small"
            onClick={() => {
              set({ ...check, order_lines: [...lines, { sku: null, name: '', qty: 1 }] })
              setFocusNew(true)
            }}
          >
            <Icon name="plus" size={18} />
            Add a product
          </button>
        </div>
      )}
    </fieldset>
  )
}
