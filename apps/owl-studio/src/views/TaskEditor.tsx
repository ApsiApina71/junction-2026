import { Button, ButtonGroup, ButtonGroupAlignment, IconTintColor, ListItem, Page, Panel, ScrollView, SubtitleTextColor, TextColor, TextStyle, TextView, VerticalList, VisualState } from '@wearables-ui-toolkit/mrbd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { glassesName } from '../lib/docs.ts'
import { LANGUAGES, languageName } from '../lib/languages.ts'
import { href } from '../lib/route.ts'
import {
  CHECK_LABEL,
  LIMITS,
  countWords,
  counterText,
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
import { ICONS } from '../ui/icons.ts'
import { CharacterCount, ChoiceRow, EditInput, PrimaryButton, Problem, StatusText, TextField, Waiting } from '../ui/meta.tsx'
import type { Tone } from '../ui/meta.tsx'
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
      <Page headerText="Task" enableSystemBarInset={false} className="route">
        <ScrollView insetForHeader ariaLabel="Task" className="route-scroll">
          <div className="route-content">
            <Problem>{loadError}</Problem>
          </div>
        </ScrollView>
      </Page>
    )
  }
  if (!draft || !saved) {
    return (
      <Page headerText="Task" enableSystemBarInset={false} className="route">
        <ScrollView insetForHeader ariaLabel="Task" className="route-scroll">
          <div className="route-content">
            <Waiting what="Opening the task" />
          </div>
        </ScrollView>
      </Page>
    )
  }

  const selected = draft.steps.find((step) => step.id === selectedId) ?? draft.steps[0] ?? null
  const selectedIndex = selected ? draft.steps.findIndex((step) => step.id === selected.id) : -1
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

  const status: { tone: Tone; text: string } = isDraft ? { tone: 'warning', text: 'Draft, needs review' } : learners.length ? { tone: 'positive', text: 'Published' } : { tone: 'quiet', text: 'Published, no one assigned' }
  const languageChoices = languages.map((option) => ({ value: option.code, label: option.native, detail: option.native === option.english ? undefined : option.english }))

  return (
    <Page headerText={draft.title.trim() || 'Untitled task'} enableSystemBarInset={false} className="route">
      <div className="editor-shell">
        <ScrollView insetForHeader ariaLabel="Review the task" className="editor-scroll">
          <div className="editor-content">
            <header className="editor-head">
              <div className="editor-head-line">
                <StatusText tone={status.tone} textStyle={TextStyle.BODY2_EMPHASIZED}>
                  {status.text}
                </StatusText>
                <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                  {[stepsText(draft.steps.length), originText(draft), languageName(draft.language), isDraft && toReview > 0 ? `${toReview} of ${draft.steps.length} to review` : isDraft ? 'every step reviewed' : learnersText(learners.map((e) => e.name))]
                    .filter(Boolean)
                    .join(' · ')}
                </TextView>
                <Button title={detailsOpen ? 'Hide details' : 'Edit name and language'} icon={ICONS.settings} alwaysShowText aria-expanded={detailsOpen} aria-controls="task-details" onClick={() => setDetailsOpen(!detailsOpen)} />
              </div>
              {detailsOpen && (
                <div id="task-details" className="task-details">
                  <Panel width="100%">
                    <div className="panel-body task-details-body">
                      <TextField id="task-title" label="Task name" value={draft.title} maxLength={120} onChange={(title) => setDraft({ ...draft, title })} />
                      <TextField id="task-summary" label="In one sentence" value={draft.summary} multiline onChange={(summary) => setDraft({ ...draft, summary })} />
                    </div>
                  </Panel>
                  <VerticalList ariaLabel="Language of this task" className="inline-list">
                    <ChoiceRow
                      label="Language of this task"
                      choices={languageChoices}
                      value={draft.language}
                      onChange={(language) => setDraft({ ...draft, language })}
                      note={isDraft && draft.source === 'record' ? `${languageName(draft.language)}. Owl guessed this from the recording. Correct it if it is wrong.` : languageName(draft.language)}
                    />
                  </VerticalList>
                </div>
              )}
            </header>

            {problemsOpen && (issues.length > 0 || saveError) && (
              <section className="problems" aria-labelledby="problems-heading">
                <Panel width="100%">
                  <div className="panel-body">
                    <TextView as="h2" id="problems-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
                      <span className="status-text is-warning">{isDraft ? 'Before this can be published' : 'Before this can be saved'}</span>
                    </TextView>
                    {saveError && (
                      <TextView as="p" textStyle={TextStyle.BODY2}>
                        {saveError}
                      </TextView>
                    )}
                  </div>
                </Panel>
                {issues.length > 0 && (
                  <VerticalList ariaLabel="What to fix" className="inline-list">
                    {issues.map((issue) => (
                      <ListItem key={`${issue.stepId}-${issue.field}-${issue.message}`} title={issue.message} icon={ICONS.info} iconTintColor={IconTintColor.WARNING} onClick={() => goTo(issue)} />
                    ))}
                  </VerticalList>
                )}
              </section>
            )}

            <div className="editor-grid">
              <section className="steps-column" aria-labelledby="steps-heading">
                <TextView as="h2" id="steps-heading" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="column-label">
                  STEPS
                </TextView>
                {draft.steps.length === 0 ? (
                  <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                    This task has no steps left. Undo the last removal, or leave without saving.
                  </TextView>
                ) : (
                  <VerticalList ariaLabel="Steps" className="step-list">
                    {draft.steps.map((step, i) => {
                      const isSelected = selected?.id === step.id
                      const hints = cutHints(step)
                      const cut = hints.title || hints.instruction
                      const needsYou = !isReviewed(step) || cut
                      const title = step.title.trim() || 'Untitled step'
                      return (
                        <ListItem
                          key={step.id}
                          data-step-title={title}
                          title={`${i + 1}. ${title}`}
                          subtitle={cut ? 'Cut text, needs rewriting' : needsYou ? 'Needs your review' : `${CHECK_LABEL[step.check.kind]}${stepIsWrong(step.id) ? ' · needs fixing' : ''}`}
                          subtitleTextColor={needsYou || stepIsWrong(step.id) ? SubtitleTextColor.WARNING : SubtitleTextColor.SECONDARY}
                          avatarSrc={step.reference_image_url ?? undefined}
                          icon={step.reference_image_url ? undefined : ICONS.tasks}
                          visualStateOverride={isSelected ? VisualState.FOCUSED : undefined}
                          aria-current={isSelected ? 'step' : undefined}
                          className={drag && drag.over === i && drag.from !== i ? 'is-drop-target' : undefined}
                          draggable
                          onDragStart={(event: React.DragEvent) => {
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData('text/plain', step.id)
                            setDrag({ from: i, over: null })
                          }}
                          onDragOver={(event: React.DragEvent) => {
                            if (!drag) return
                            event.preventDefault()
                            if (drag.over !== i) setDrag({ ...drag, over: i })
                          }}
                          onDrop={(event: React.DragEvent) => {
                            event.preventDefault()
                            if (drag) move(drag.from, i)
                            setDrag(null)
                          }}
                          onDragEnd={() => setDrag(null)}
                          onClick={() => setSelectedId(step.id)}
                        />
                      )
                    })}
                  </VerticalList>
                )}
                {selected && (
                  <ButtonGroup alignment={ButtonGroupAlignment.START}>
                    <Button title={`Move step ${selectedIndex + 1} up`} icon={ICONS.up} disabled={selectedIndex === 0} onClick={() => move(selectedIndex, selectedIndex - 1)} />
                    <Button title={`Move step ${selectedIndex + 1} down`} icon={ICONS.down} disabled={selectedIndex === draft.steps.length - 1} onClick={() => move(selectedIndex, selectedIndex + 1)} />
                    <Button title={`Remove step ${selectedIndex + 1}`} icon={ICONS.trash} onClick={() => remove(selected)} />
                  </ButtonGroup>
                )}
                <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                  Drag a step, or choose it and use the arrows, to change the order.
                </TextView>
                <p className="visually-hidden" aria-live="polite">
                  {moved}
                </p>
                {!isDraft && <Learners process={saved} headingRef={learnersRef} />}
              </section>

              {selected && <StepForm key={selected.id} step={selected} total={draft.steps.length} process={draft} onChange={changeStep} />}
            </div>
          </div>
        </ScrollView>

        <div className="editor-bar">
          <div className="editor-bar-status">
            {issues.length > 0 ? (
              <Button
                title={`${issues.length} to fix before ${isDraft && wrong.length === 0 ? 'publishing' : 'saving'}`}
                icon={ICONS.info}
                alwaysShowText
                onClick={() => {
                  setProblemsOpen(true)
                  goTo(issues[0])
                }}
              />
            ) : (
              <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                {dirty ? 'Not saved yet' : 'Saved'}
              </TextView>
            )}
          </div>
          <ButtonGroup alignment={ButtonGroupAlignment.END}>
            {removed && <Button title="Undo" icon={ICONS.undo} alwaysShowText onClick={undoRemove} />}
            {isDraft ? (
              <>
                <Button title={busy === 'save' ? 'Saving' : 'Save draft'} alwaysShowText disabled={busy !== null || !dirty} onClick={() => void send('save')} />
                <PrimaryButton title={busy === 'publish' ? 'Publishing' : 'Publish'} icon={ICONS.check} disabled={busy !== null} onClick={() => void send('publish')} />
              </>
            ) : (
              <>
                <Button title={busy === 'unpublish' ? 'Unpublishing' : 'Unpublish'} alwaysShowText disabled={busy !== null} onClick={() => void send('unpublish')} />
                <PrimaryButton title={busy === 'save' ? 'Saving' : 'Save changes'} icon={ICONS.check} disabled={busy !== null || !dirty} onClick={() => void send('save')} />
              </>
            )}
          </ButtonGroup>
        </div>
      </div>
    </Page>
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
    <section className="learners" aria-labelledby="learners-heading" ref={headingRef} tabIndex={-1}>
      <div className="learners-head">
        <TextView as="h2" id="learners-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
          Who learns this task
        </TextView>
        <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
          A worker gets it the next time they open Owl on their glasses.
        </TextView>
      </div>
      {employees.length === 0 ? (
        <div className="learners-empty">
          <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
            There is no one to give it to yet.
          </TextView>
          <Button title="Add a person" icon={ICONS.plus} alwaysShowText onClick={() => (window.location.hash = href('people', 'new'))} />
        </div>
      ) : (
        <VerticalList ariaLabel="People who can learn it" className="inline-list learner-list">
          {employees.map((employee) => (
            <ListItem
              key={employee.id}
              title={employee.name}
              subtitle={[languageName(employee.language), employee.glasses_id ? glassesName(employee.glasses_id) : 'no glasses yet'].join(' · ')}
              showSwitch
              checked={employee.process_ids.includes(process.id)}
              disabled={busyId !== null}
              onCheckedChange={() => void toggle(employee)}
            />
          ))}
        </VerticalList>
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
    <>
      <section className="step-form" aria-labelledby="step-heading">
        <Panel width="100%">
          <div className="panel-body step-form-body">
            <div className="step-form-head">
              <TextView as="h2" id="step-heading" textStyle={TextStyle.BODY1_EMPHASIZED}>
                {`Step ${step.index} of ${total}`}
              </TextView>
              {recorded && reviewed && (
                <div className="reviewed-line">
                  <StatusText tone="positive" as="span">
                    Reviewed
                  </StatusText>
                  <Button title="Not yet" alwaysShowText onClick={() => onChange({ ...step, reviewed: false })} />
                </div>
              )}
            </div>

            {!reviewed && (
              <div className="needs-you">
                <TextView as="p" textStyle={TextStyle.BODY2}>
                  <span className="status-text is-warning">
                    <strong>This step needs you.</strong>
                  </span>{' '}
                  {`Owl wrote it from what ${expert} said. Read the title, the instruction and what Owl says against ${step.source ? `everything ${expert} said beside them` : 'the photo'}, fix what is missing, then mark the step reviewed.`}
                </TextView>
                {refused && (
                  <TextView as="p" textStyle={TextStyle.BODY2} role="alert">
                    <span className="status-text is-negative">{refused}</span>
                  </TextView>
                )}
                <PrimaryButton id="step-review" title="Mark step reviewed" icon={ICONS.check} onClick={markReviewed} />
              </div>
            )}

            <TextField
              id="step-title"
              label="Title"
              value={step.title}
              onChange={(title) => onChange({ ...step, title })}
              invalid={titleLength > LIMITS.title || titleLength === 0 || hints.title}
              extra={<CharacterCount used={titleLength} limit={LIMITS.title} />}
              hint={hints.title ? 'Cut to fit. Rewrite it so it does not end in "…".' : undefined}
              hintTone={hints.title ? 'warning' : undefined}
            />
            <TextField
              id="step-instruction"
              label="Instruction on the display"
              value={step.instruction}
              multiline
              onChange={(instruction) => onChange({ ...step, instruction })}
              invalid={instructionLength > LIMITS.instruction || instructionLength === 0 || hints.instruction}
              extra={<CharacterCount used={instructionLength} limit={LIMITS.instruction} />}
              hint={hints.instruction ? 'Cut to fit. Rewrite it so it does not end in "…".' : undefined}
              hintTone={hints.instruction ? 'warning' : undefined}
            />
            <TextField
              id="step-say"
              label="What Owl says"
              value={step.say}
              multiline
              onChange={(say) => onChange({ ...step, say })}
              invalid={sayWords > LIMITS.sayWords || sayWords === 0}
              extra={<WordCount used={sayWords} limit={LIMITS.sayWords} />}
              hint={hints.say ? `These are the first ${sayWords} words of what ${expert} said, and ${expert} said more. Write one whole sentence for Owl to say.` : "Spoken in the worker's ear when the step opens. Say it the way you would to a new colleague."}
              hintTone={hints.say ? 'warning' : undefined}
            />

            <CheckEditor step={step} onChange={onChange} />
          </div>
        </Panel>
      </section>

      <aside className="step-side" aria-label="The recording and the glasses">
        <div className="step-recording" role="group" aria-label={recorded ? `${expert}'s recording of this step` : 'Where this step comes from'}>
          <Panel width="100%">
            <div className="panel-body">
              {step.source && (
                <figure className="narration">
                  <TextView as="span" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="field-label">
                    {recorded ? `What ${expert} said` : `From ${step.source.doc}${step.source.section ? `, ${step.source.section}` : ''}`}
                  </TextView>
                  <TextView as="p" textStyle={TextStyle.BODY2}>
                    {step.source.quote}
                  </TextView>
                </figure>
              )}
              <figure className="media">
                {step.reference_image_url ? (
                  <img src={step.reference_image_url} alt={`The expert's photo of step ${step.index} done right`} />
                ) : (
                  <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                    No photo for this step
                  </TextView>
                )}
                <TextView as="span" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                  {`${recorded ? `${expert}'s photo of the finished step.` : 'The photo of the finished step.'} The worker sees it on the glasses.`}
                </TextView>
              </figure>
              {step.clip_url && (
                <figure className="media">
                  <video src={step.clip_url} controls preload="metadata" playsInline muted aria-label={`The expert's clip of step ${step.index}`} />
                  <TextView as="span" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                    Watch how: played on the glasses when the worker asks.
                  </TextView>
                </figure>
              )}
            </div>
          </Panel>
        </div>
        <section className="preview-panel" aria-labelledby="preview-heading">
          <TextView as="h2" id="preview-heading" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="column-label">
            ON THE GLASSES
          </TextView>
          <GlassesPreview step={step} total={total} />
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            Black is see-through on the glasses, so the worker sees their hands and the task through it.
          </TextView>
        </section>
      </aside>
    </>
  )
}

/** "18/25", or "30/25, 5 too many": the words Owl says. */
function WordCount({ used, limit }: { used: number; limit: number }) {
  return (
    <TextView as="span" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY} aria-live="polite">
      <span className="visually-hidden">words: </span>
      <span className={used > limit ? 'status-text is-warning' : undefined}>{counterText(used, limit)}</span>
    </TextView>
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
      <legend className="field-label">
        <TextView as="span" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY}>
          How Owl checks this step
        </TextView>
      </legend>
      <div id="step-criteria" tabIndex={-1} role="radiogroup" aria-label="How Owl checks this step">
        <VerticalList ariaLabel="Kinds of check" className="inline-list">
          {KINDS.map(({ kind, label }) => (
            <ListItem key={kind} title={label} showRadioButton checked={check.kind === kind} onCheckedChange={() => choose(kind)} />
          ))}
        </VerticalList>
      </div>

      {check.kind === 'none' && (
        <div className="nudge">
          <TextView as="p" textStyle={TextStyle.BODY2}>
            <strong>Owl does not check this step yet.</strong> The worker confirms it with a pinch. Tell Owl what a finished step looks like and it speaks up when something is off.
          </TextView>
          <ButtonGroup alignment={ButtonGroupAlignment.START}>
            <PrimaryButton title="Add what Owl should check" icon={ICONS.plus} onClick={() => choose('visual')} />
            <Button title="Check an order instead" alwaysShowText onClick={() => choose('order')} />
          </ButtonGroup>
        </div>
      )}

      {check.kind === 'visual' && (
        <div className="check-body">
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            Things anyone can see when the step is done right. Owl passes the step only when it has seen every one of them, so keep to one to three.
          </TextView>
          <ul className="criteria">
            {check.criteria.map((criterion, i) => (
              <li key={i}>
                <EditInput
                  value={criterion}
                  label={`Thing to look for ${i + 1}`}
                  placeholder={i === 0 ? 'For example: the box is taped shut' : 'Something to look for'}
                  autoFocus={focusNew && i === check.criteria.length - 1}
                  onChange={(text) => set({ ...check, criteria: check.criteria.map((c, at) => (at === i ? text : c)) })}
                />
                <Button title={`Remove thing to look for ${i + 1}`} icon={ICONS.x} onClick={() => set({ ...check, criteria: check.criteria.filter((_, at) => at !== i) })} />
              </li>
            ))}
          </ul>
          <ButtonGroup alignment={ButtonGroupAlignment.START}>
            <Button
              title="Add another thing to look for"
              icon={ICONS.plus}
              alwaysShowText
              onClick={() => {
                set({ ...check, criteria: [...check.criteria, ''] })
                setFocusNew(true)
              }}
            />
          </ButtonGroup>
        </div>
      )}

      {check.kind === 'order' && (
        <div className="check-body" id="step-order" tabIndex={-1}>
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            Owl counts what it sees in the box against these lines and speaks up about a wrong product or number.
          </TextView>
          <div className="order-lines" role="group" aria-label="Products on the order">
            {lines.map((line, i) => (
              <div className="order-line" key={i}>
                <EditInput value={line.name} label={`Product ${i + 1}`} placeholder="Product" autoFocus={focusNew && i === lines.length - 1} onChange={(text) => setLine(i, { name: text })} />
                <EditInput
                  value={Number.isFinite(line.qty) && line.qty > 0 ? String(line.qty) : ''}
                  label={`How many of product ${i + 1}`}
                  placeholder="How many"
                  inputMode="numeric"
                  onChange={(text) => setLine(i, { qty: Number.parseInt(text.replace(/\D/g, ''), 10) || 0 })}
                />
                <EditInput value={line.sku ?? ''} label={`Code of product ${i + 1}`} placeholder="Code" onChange={(text) => setLine(i, { sku: text || null })} />
                <Button title={`Remove product ${i + 1}`} icon={ICONS.x} onClick={() => set({ ...check, order_lines: lines.filter((_, at) => at !== i) })} />
              </div>
            ))}
          </div>
          <ButtonGroup alignment={ButtonGroupAlignment.START}>
            <Button
              title="Add a product"
              icon={ICONS.plus}
              alwaysShowText
              onClick={() => {
                set({ ...check, order_lines: [...lines, { sku: null, name: '', qty: 1 }] })
                setFocusNew(true)
              }}
            />
          </ButtonGroup>
        </div>
      )}
    </fieldset>
  )
}
