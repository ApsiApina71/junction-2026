import { Button, ContainerHeader, ListItem, Page, Panel, ScrollView, TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import { useCallback, useEffect, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { useStudio } from '../lib/studio.ts'
import { newId, resultText, todayIso } from '../lib/training.ts'
import { count } from '../lib/words.ts'
import type { Employee, Process, Trainee, TrainingPlan, TrainingResult } from '../lib/types.ts'
import { ICONS } from '../ui/icons.ts'
import { Actions, ChoiceRow, FieldLabel, InlineList, PrimaryButton, Problem, StatusText, TextField, Waiting } from '../ui/meta.tsx'
import type { Tone } from '../ui/meta.tsx'
import { useToast } from '../ui/toast.ts'

// JUN-96 and JUN-98. Owl gives evidence, a person decides. The rules this page keeps:
// - During training Studio shows only that a person is in training and which day it is, not how they are doing.
// - At the end Owl suggests "Ready" or "More practice". The worker sees it on the glasses first; only then is it here,
//   with its evidence, and a person confirms it. That result is the only thing Studio shows about one worker.

const SIGN_LIMIT = 300

/** The company's training: who is in it, the levels per role, and the sign for customer service mode. */
export function TrainingView() {
  const { api, employees, processes } = useStudio()
  const [trainees, setTrainees] = useState<Trainee[] | null>(null)
  const [plans, setPlans] = useState<TrainingPlan[] | null>(null)
  const [problem, setProblem] = useState('')

  const load = useCallback(
    () =>
      Promise.all([api.trainees(), api.trainingPlans()])
        .then(([rows, saved]) => {
          setTrainees(rows)
          setPlans(saved)
          setProblem('')
        })
        .catch((error) => setProblem(messageOf(error))),
    [api],
  )

  useEffect(() => {
    let cancelled = false
    Promise.all([api.trainees(), api.trainingPlans()])
      .then(([rows, saved]) => {
        if (cancelled) return
        setTrainees(rows)
        setPlans(saved)
      })
      .catch((error) => !cancelled && setProblem(messageOf(error)))
    return () => {
      cancelled = true
    }
  }, [api])

  return (
    <Page headerText="Training" enableSystemBarInset={false} className="route">
      <div className="split split-wide">
        <section className="split-list" aria-label="Training">
          <ScrollView insetForHeader ariaLabel="Training" className="detail-scroll">
            <div className="column-content">
              <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="lede">
                Set how long training lasts and the level a new worker reaches, in your own steps. At the end Owl suggests Ready or More practice. The worker sees it on the glasses first, and a person decides.
              </TextView>

              {problem && <Problem>{problem}</Problem>}

              <section aria-labelledby="trainees-heading" className="route-section">
                <TextView as="h2" id="trainees-heading" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="field-label">
                  In training
                </TextView>
                {trainees === null && !problem && <Waiting what="Getting who is in training" />}
                {trainees !== null && trainees.length === 0 && (
                  <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                    No one is in training. Start a training period for a new worker below.
                  </TextView>
                )}
                {trainees !== null && trainees.length > 0 && (
                  <ul className="tile-grid training-rows" aria-label="In training">
                    {trainees.map((trainee) => (
                      <li key={trainee.employee_id}>
                        <TraineeCard trainee={trainee} onChange={load} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {plans && employees && <StartTraining employees={employees} trainees={trainees ?? []} plans={plans} onStarted={load} />}

              <section aria-labelledby="plans-heading" className="route-section">
                <TextView as="h2" id="plans-heading" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="field-label">
                  Target level per role
                </TextView>
                <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                  Which steps a new worker does without help, and how many times. Only steps Owl verified count. A mistake the worker fixed is learning, not a minus point.
                </TextView>
                {plans !== null && (
                  <div className="plans">
                    {plans.map((plan) => (
                      <PlanEditor key={plan.id} plan={plan} processes={processes ?? []} onSaved={load} />
                    ))}
                    <NewPlan plans={plans} onSaved={load} />
                  </div>
                )}
              </section>
            </div>
          </ScrollView>
        </section>

        <section className="split-detail" aria-label="What Studio sees and the sign at the desk">
          <ScrollView ariaLabel="What Studio sees" className="detail-scroll">
            <div className="column-stack">
              <Panel width="100%">
                <div className="panel-body">
                  <TextView as="h2" id="fair-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
                    What Studio sees
                  </TextView>
                  <ul className="dot-list" aria-labelledby="fair-heading">
                    {['Who is in training and which day it is.', "At the end: Owl's suggestion and the steps behind it, after the worker has seen it.", 'Not how someone does day by day, no camera pictures, no locations, no times.'].map((line) => (
                      <li key={line}>
                        <TextView as="span" textStyle={TextStyle.BODY2}>
                          {line}
                        </TextView>
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
              <SignEditor />
            </div>
          </ScrollView>
        </section>
      </div>
    </Page>
  )
}

function TraineeCard({ trainee, onChange }: { trainee: Trainee; onChange: () => Promise<void> }) {
  const { api } = useStudio()
  const toast = useToast()
  const [by, setBy] = useState('')
  const [extend, setExtend] = useState(3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const confirm = async (result: TrainingResult) => {
    if (!by.trim()) {
      setError('Write your name: the result says who decided it.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.confirmTraining(trainee.employee_id, result, by.trim(), extend)
      toast({ message: result === 'ready' ? `${trainee.name} is ready. The glasses say so too.` : `${trainee.name} goes on practising for ${extend} more days.` })
      await onChange()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const stopTraining = async () => {
    setBusy(true)
    try {
      await api.startTraining(trainee.employee_id, null)
      toast({ message: `${trainee.name}'s training period has ended. Location and listening are off for them.` })
      await onChange()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const heading = `${trainee.name}${trainee.role ? `, ${trainee.role}` : ''}`
  const state: { tone: Tone; text: string } = trainee.confirmed
    ? { tone: trainee.confirmed.result === 'ready' ? 'positive' : 'info', text: `${resultText(trainee.confirmed.result)}, confirmed by ${trainee.confirmed.by}` }
    : trainee.suggestion
      ? { tone: 'warning', text: 'Needs your decision' }
      : { tone: 'quiet', text: 'In training' }
  const extendChoices = [1, 2, 3, 5, 10].map((days) => ({ value: String(days), label: count(days, 'day', 'days') }))
  return (
    <article className="trainee" aria-label={heading}>
      <Panel width="100%">
        <div className="panel-body trainee-body">
          <ContainerHeader title={heading} subtitle={`Day ${Math.min(trainee.day, trainee.days)} of ${trainee.days} · until ${trainee.ends}`} avatarPrimaryContent={<span className="initial uit-text-body1-emphasized">{trainee.name.trim().charAt(0).toUpperCase()}</span>} />
          <StatusText tone={state.tone}>{state.text}</StatusText>

          {trainee.suggestion && !trainee.confirmed ? (
            <div className="trainee-result">
              <TextView as="p" textStyle={TextStyle.BODY2}>
                <strong>{`Owl suggests: ${resultText(trainee.suggestion)}.`}</strong>{' '}
                {trainee.suggestion === 'ready'
                  ? `${trainee.name} has done every step of the level without help.`
                  : `Steps to practise: ${trainee.practise.map((step) => step.title).join(', ')}. This is not a fail: training goes on with the glasses.`}
              </TextView>
              <table className="evidence">
                <caption className="visually-hidden">The evidence: each step of the level, done without help</caption>
                <thead>
                  <tr>
                    <th scope="col" className="uit-text-meta1-emphasized">
                      Step
                    </th>
                    <th scope="col" className="uit-text-meta1-emphasized">
                      Without help
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trainee.target.map((row) => (
                    <tr key={`${row.process_id}/${row.step_id}`}>
                      <th scope="row" className="uit-text-body2">
                        {row.title}
                      </th>
                      <td className="uit-text-body2">
                        {row.done_without_help} of {row.required}
                        {row.met ? <span className="visually-hidden">, reached</span> : <span className="status-text is-warning">, not yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                They saw this on the glasses first. Owl gives the evidence; you decide.
              </TextView>
              <TextField id={`by-${trainee.employee_id}`} label="Your name" value={by} maxLength={60} onChange={setBy} error={error || null} />
              <InlineList label="More practice">
                <ChoiceRow label="More practice for" choices={extendChoices} value={String(extend)} onChange={(days) => setExtend(Number(days))} />
              </InlineList>
              <Actions align="start">
                <PrimaryButton title="Confirm: ready" icon={ICONS.check} disabled={busy} onClick={() => void confirm('ready')} />
                <Button title="Confirm: more practice" alwaysShowText disabled={busy} onClick={() => void confirm('more_practice')} />
              </Actions>
            </div>
          ) : (
            <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
              {trainee.waiting_for_worker
                ? `Owl has a suggestion. ${trainee.name} sees it on the glasses first, then it shows here.`
                : trainee.confirmed
                  ? trainee.confirmed.result === 'ready'
                    ? `${trainee.name} works on their own now.`
                    : `${trainee.name} practises with the glasses. Owl suggests again at the end, and they see it first.`
                  : `${count(trainee.days_left, 'day', 'days')} left. How it goes is between them and Owl until the end.`}
            </TextView>
          )}
          {error && !(trainee.suggestion && !trainee.confirmed) && <StatusText tone="negative">{error}</StatusText>}
          <Actions align="start">
            <Button title="End the training period" alwaysShowText disabled={busy} onClick={() => void stopTraining()} />
          </Actions>
        </div>
      </Panel>
    </article>
  )
}

function StartTraining({ employees, trainees, plans, onStarted }: { employees: Employee[]; trainees: Trainee[]; plans: TrainingPlan[]; onStarted: () => Promise<void> }) {
  const { api } = useStudio()
  const toast = useToast()
  const free = employees.filter((employee) => !trainees.some((trainee) => trainee.employee_id === employee.id))
  const [employeeId, setEmployeeId] = useState('')
  const [starts, setStarts] = useState(todayIso())
  const [planId, setPlanId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const chosen = free.find((employee) => employee.id === employeeId) ?? null
  const byRole = chosen ? plans.find((plan) => plan.role.trim().toLowerCase() === chosen.role.trim().toLowerCase()) : undefined

  if (!free.length) return null

  const start = async () => {
    if (!chosen) {
      setError('Choose who starts training.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await api.startTraining(chosen.id, starts, planId || null)
      toast({ message: `${chosen.name} is in training from ${starts}. They see the level on the glasses from day one.` })
      setEmployeeId('')
      setPlanId('')
      await onStarted()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const whoChoices = [{ value: '', label: 'Choose a person' }, ...free.map((employee) => ({ value: employee.id, label: employee.name, detail: employee.role || undefined }))]
  const levelChoices = [{ value: '', label: byRole ? `The level for ${byRole.role} (${count(byRole.days, 'day', 'days')})` : 'The level for their role' }, ...plans.map((plan) => ({ value: plan.id, label: `${plan.role} (${count(plan.days, 'day', 'days')})` }))]

  return (
    <section aria-labelledby="start-heading">
      <Panel width="100%">
        <div className="panel-body start-body">
          <TextView as="h2" id="start-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
            Start a training period
          </TextView>
          <InlineList label="Who and which level">
            <ChoiceRow label="Who" choices={whoChoices} value={employeeId} onChange={setEmployeeId} />
            <ChoiceRow label="Level" choices={levelChoices} value={planId} onChange={setPlanId} />
          </InlineList>
          <div className="field">
            <FieldLabel htmlFor="start-day">First day</FieldLabel>
            <input id="start-day" className="edit-field uit-text-body2" type="date" value={starts} onChange={(event) => setStarts(event.target.value)} />
          </div>
          {error && <StatusText tone="negative">{error}</StatusText>}
          <Actions align="start">
            <PrimaryButton title="Start training" icon={ICONS.training} disabled={busy} showLoader={busy} onClick={() => void start()} />
          </Actions>
        </div>
      </Panel>
    </section>
  )
}

function PlanEditor({ plan, processes, onSaved }: { plan: TrainingPlan; processes: Process[]; onSaved: () => Promise<void> }) {
  const { api } = useStudio()
  const toast = useToast()
  const [days, setDays] = useState(plan.days)
  const [target, setTarget] = useState(plan.target)
  const [service, setService] = useState(Boolean(plan.customer_service))
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const dirty = days !== plan.days || service !== Boolean(plan.customer_service) || JSON.stringify(target) !== JSON.stringify(plan.target)
  const required = (processId: string, stepId: string) => target.find((t) => t.process_id === processId && t.step_id === stepId)?.required ?? 0

  const setRequired = (processId: string, stepId: string, value: number) => {
    const rest = target.filter((t) => !(t.process_id === processId && t.step_id === stepId))
    setTarget(value > 0 ? [...rest, { process_id: processId, step_id: stepId, required: value }] : rest)
  }

  const save = async () => {
    setBusy(true)
    setError('')
    try {
      // The order of the steps in the task is the order on the glasses.
      const order = (t: { process_id: string; step_id: string }) => {
        const p = processes.findIndex((process) => process.id === t.process_id)
        const s = processes[p]?.steps.findIndex((step) => step.id === t.step_id) ?? 0
        return p * 1000 + s
      }
      await api.saveTrainingPlan({ ...plan, days, customer_service: service, target: [...target].sort((a, b) => order(a) - order(b)) })
      toast({ message: `The level for ${plan.role} is saved.` })
      await onSaved()
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const relevant = processes.filter((process) => process.status === 'published' || target.some((t) => t.process_id === process.id))
  const requiredChoices = [0, 1, 2, 3, 4, 5, 10].map((n) => ({ value: String(n), label: n === 0 ? 'Not in the level' : n === 1 ? 'Once without help' : `${n} times without help` }))
  return (
    <div className="plan">
      <InlineList label={`The level for ${plan.role}`}>
        <ListItem
          title={plan.role}
          subtitle={`${count(plan.days, 'day', 'days')} · ${count(plan.target.length, 'step', 'steps')}${plan.customer_service ? ' · customer service' : ''}`}
          icon={ICONS.training}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
        {open && (
          <>
            <ListItem title="Training lasts" subtitle={count(days, 'day', 'days')} showSlider sliderMinimumValue={1} sliderMaximumValue={30} sliderValue={days} sliderIncrementPercentage={1 / 29} onSliderValueChange={(value) => setDays(Math.max(1, Math.min(30, Math.round(value))))} />
            <ListItem
              title="Customer service mode"
              subtitle="At the counter during training, Owl listens and suggests answers. Nothing is recorded."
              subtitleMaxLines={4}
              showSwitch
              checked={service}
              onCheckedChange={setService}
            />
            {relevant.map((process) =>
              process.steps.map((step) => (
                <ChoiceRow
                  key={`${process.id}/${step.id}`}
                  label={`${step.index}. ${step.title}`}
                  note={`${process.title} · ${requiredChoices.find((choice) => choice.value === String(required(process.id, step.id)))?.label ?? ''}`}
                  choices={requiredChoices}
                  value={String(required(process.id, step.id))}
                  onChange={(value) => setRequired(process.id, step.id, Number(value))}
                />
              )),
            )}
          </>
        )}
      </InlineList>
      {open && (
        <div className="plan-foot">
          {relevant.length === 0 && (
            <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
              Publish a task first. Its steps can then be part of the level.
            </TextView>
          )}
          {error && <StatusText tone="negative">{error}</StatusText>}
          <Actions align="start">
            <PrimaryButton title="Save the level" icon={ICONS.check} disabled={busy || !dirty} onClick={() => void save()} />
          </Actions>
        </div>
      )}
    </div>
  )
}

function NewPlan({ plans, onSaved }: { plans: TrainingPlan[]; onSaved: () => Promise<void> }) {
  const { api } = useStudio()
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const add = async () => {
    const name = role.trim()
    if (!name) {
      setError('Write the role, for example "Warehouse picker".')
      return
    }
    const planId = newId('plan', name, plans.map((plan) => plan.id), 'role')
    try {
      await api.saveTrainingPlan({ id: planId, role: name, days: 5, target: [] })
      setRole('')
      setError('')
      await onSaved()
    } catch (err) {
      setError(messageOf(err))
    }
  }
  return (
    <div className="new-plan">
      <TextField id="new-plan-role" label="A level for another role" value={role} maxLength={60} placeholder="Packer" onChange={setRole} error={error || null} />
      <Actions align="start">
        <Button title="Add" icon={ICONS.plus} alwaysShowText onClick={() => void add()} />
      </Actions>
    </div>
  )
}

/** JUN-98: the sign at the counter that tells customers Owl is listening. */
function SignEditor() {
  const { api } = useStudio()
  const toast = useToast()
  const [saved, setSaved] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    api
      .assistSign()
      .then((sign) => {
        if (cancelled) return
        setSaved(sign)
        setText(sign)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [api])

  if (saved === null) return null

  const save = async () => {
    try {
      const sign = await api.saveAssistSign(text.trim())
      setSaved(sign)
      setText(sign)
      toast({ message: 'The sign is saved.' })
    } catch (err) {
      setError(messageOf(err))
    }
  }

  return (
    <section aria-labelledby="sign-heading">
      <Panel width="100%">
        <div className="panel-body sign-body">
          <TextView as="h2" id="sign-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
            Customer service: the sign at the desk
          </TextView>
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            In customer service mode the glasses listen during training, only while the worker has it on, and suggest answers from your documents. Nothing is recorded. This sign tells customers.
          </TextView>
          <TextField id="sign-text" label="Text of the sign" value={text} multiline maxLength={SIGN_LIMIT} onChange={setText} error={error || null} />
          <Actions align="start">
            <PrimaryButton title="Save" icon={ICONS.check} disabled={!text.trim() || text.trim() === saved} onClick={() => void save()} />
            <Button title="Print the sign" icon={ICONS.print} alwaysShowText onClick={() => window.print()} />
          </Actions>
        </div>
      </Panel>
      <div className="print-sheet print-sign" aria-hidden="true">
        <img src="/owl/icon-64.png" alt="" width="96" height="96" />
        <p>{saved}</p>
      </div>
    </section>
  )
}
