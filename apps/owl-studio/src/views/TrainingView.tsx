import { useCallback, useEffect, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { useStudio } from '../lib/studio.ts'
import { newId, resultText, todayIso } from '../lib/training.ts'
import type { Employee, Process, Trainee, TrainingPlan, TrainingResult } from '../lib/types.ts'
import { Icon } from '../ui/Icon.tsx'
import { EmptyState, Loading, Problem, StatusTag } from '../ui/parts.tsx'
import { useToast } from '../ui/toast.ts'
import './training.css'

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
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Training</h1>
          <p className="lede">
            Set how long training lasts and the level a new worker reaches, in your own steps. At the end Owl suggests Ready or More practice. The worker sees it on the glasses first, and a person decides.
          </p>
        </div>
      </header>

      {problem && <Problem>{problem}</Problem>}

      <div className="two-col two-col-wide">
        <div className="stack">
          <section aria-labelledby="trainees-heading">
            <h2 id="trainees-heading">In training</h2>
            {trainees === null ? (
              !problem && <Loading what="Getting who is in training" />
            ) : trainees.length === 0 ? (
              <EmptyState title="No one is in training">Start a training period for a new worker below.</EmptyState>
            ) : (
              <ul className="plain-list training-rows" aria-label="In training">
                {trainees.map((trainee) => (
                  <li key={trainee.employee_id}>
                    <TraineeCard trainee={trainee} onChange={load} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {plans && employees && <StartTraining employees={employees} trainees={trainees ?? []} plans={plans} onStarted={load} />}

          <section aria-labelledby="plans-heading">
            <h2 id="plans-heading">Target level per role</h2>
            <p className="hint">Which steps a new worker does without help, and how many times. Only steps Owl verified count. A mistake the worker fixed is learning, not a minus point.</p>
            {plans === null ? null : (
              <div className="stack">
                {plans.map((plan) => (
                  <PlanEditor key={plan.id} plan={plan} processes={processes ?? []} onSaved={load} />
                ))}
                <NewPlan plans={plans} onSaved={load} />
              </div>
            )}
          </section>
        </div>

        <aside className="stack">
          <section className="panel" aria-labelledby="fair-heading">
            <h2 id="fair-heading">What Studio sees</h2>
            <ul className="plain-list">
              <li>Who is in training and which day it is.</li>
              <li>At the end: Owl's suggestion and the steps behind it, after the worker has seen it.</li>
              <li>Not how someone does day by day, no camera pictures, no locations, no times.</li>
            </ul>
          </section>
          <SignEditor />
        </aside>
      </div>
    </div>
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
  return (
    <article className="panel trainee" aria-label={heading}>
      <div className="trainee-head">
        <span className="initial" aria-hidden="true">
          {trainee.name.trim().charAt(0).toUpperCase()}
        </span>
        <div className="row-main">
          <h3 className="row-title">{heading}</h3>
          <span className="row-meta">
            Day {Math.min(trainee.day, trainee.days)} of {trainee.days} · until {trainee.ends}
          </span>
        </div>
        {trainee.confirmed ? (
          <StatusTag tone={trainee.confirmed.result === 'ready' ? 'success' : 'accent'} shape={trainee.confirmed.result === 'ready' ? 'disc' : 'ring'}>
            {resultText(trainee.confirmed.result)}, confirmed by {trainee.confirmed.by}
          </StatusTag>
        ) : trainee.suggestion ? (
          <StatusTag tone="signal" shape="diamond">
            Needs your decision
          </StatusTag>
        ) : (
          <StatusTag tone="muted" shape="ring">
            In training
          </StatusTag>
        )}
      </div>

      {trainee.suggestion && !trainee.confirmed ? (
        <div className="trainee-result">
          <p>
            <strong>Owl suggests: {resultText(trainee.suggestion)}.</strong>{' '}
            {trainee.suggestion === 'ready'
              ? `${trainee.name} has done every step of the level without help.`
              : `Steps to practise: ${trainee.practise.map((step) => step.title).join(', ')}. This is not a fail: training goes on with the glasses.`}
          </p>
          <table className="evidence">
            <caption className="visually-hidden">The evidence: each step of the level, done without help</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col">Without help</th>
              </tr>
            </thead>
            <tbody>
              {trainee.target.map((row) => (
                <tr key={`${row.process_id}/${row.step_id}`}>
                  <th scope="row">{row.title}</th>
                  <td>
                    {row.done_without_help} of {row.required}
                    {row.met ? <span className="visually-hidden">, reached</span> : <span className="muted">, not yet</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint">{trainee.name} saw this on the glasses. Owl gives the evidence; you decide.</p>
          <div className="field-pair">
            <div className="field">
              <label htmlFor={`by-${trainee.employee_id}`}>Your name</label>
              <input id={`by-${trainee.employee_id}`} className="input" value={by} maxLength={60} autoComplete="name" onChange={(event) => setBy(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`extend-${trainee.employee_id}`}>More practice for</label>
              <select id={`extend-${trainee.employee_id}`} className="input" value={extend} onChange={(event) => setExtend(Number(event.target.value))}>
                {[1, 2, 3, 5, 10].map((days) => (
                  <option key={days} value={days}>
                    {days === 1 ? '1 day' : `${days} days`}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error && <p className="field-error">{error}</p>}
          <div className="row-actions">
            <button type="button" className="button button-primary" disabled={busy} onClick={() => void confirm('ready')}>
              <Icon name="check" size={18} />
              Confirm: ready
            </button>
            <button type="button" className="button button-secondary" disabled={busy} onClick={() => void confirm('more_practice')}>
              Confirm: more practice
            </button>
          </div>
        </div>
      ) : trainee.waiting_for_worker ? (
        <p className="hint">Owl has a suggestion. {trainee.name} sees it on the glasses first, then it shows here.</p>
      ) : trainee.confirmed ? (
        <p className="hint">
          {trainee.confirmed.result === 'ready' ? `${trainee.name} works on their own now.` : `${trainee.name} practises with the glasses. Owl suggests again at the end, and ${trainee.name} sees it first.`}
        </p>
      ) : (
        <p className="hint">{trainee.days_left === 1 ? '1 day left.' : `${trainee.days_left} days left.`} How it goes is between {trainee.name} and Owl until the end.</p>
      )}
      {error && !(trainee.suggestion && !trainee.confirmed) && <p className="field-error">{error}</p>}
      <div className="row-actions">
        <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => void stopTraining()}>
          End the training period
        </button>
      </div>
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

  const start = async (event: React.FormEvent) => {
    event.preventDefault()
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

  return (
    <form className="panel" onSubmit={(event) => void start(event)} aria-labelledby="start-heading" noValidate>
      <h2 id="start-heading">Start a training period</h2>
      <div className="field-pair">
        <div className="field">
          <label htmlFor="start-who">Who</label>
          <select id="start-who" className="input" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">Choose a person</option>
            {free.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name}
                {employee.role ? `, ${employee.role}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="start-day">First day</label>
          <input id="start-day" className="input" type="date" value={starts} onChange={(event) => setStarts(event.target.value)} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="start-plan">Level</label>
        <select id="start-plan" className="input" value={planId} onChange={(event) => setPlanId(event.target.value)}>
          <option value="">{byRole ? `The level for ${byRole.role} (${byRole.days} days)` : 'The level for their role'}</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.role} ({plan.days} days)
            </option>
          ))}
        </select>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button button-primary" disabled={busy}>
          Start training
        </button>
      </div>
    </form>
  )
}

function PlanEditor({ plan, processes, onSaved }: { plan: TrainingPlan; processes: Process[]; onSaved: () => Promise<void> }) {
  const { api } = useStudio()
  const toast = useToast()
  const [days, setDays] = useState(plan.days)
  const [target, setTarget] = useState(plan.target)
  const [service, setService] = useState(Boolean(plan.customer_service))
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
  return (
    <details className="panel plan">
      <summary>
        <span className="row-title">{plan.role}</span>
        <span className="row-meta">
          {plan.days} days · {plan.target.length === 1 ? '1 step' : `${plan.target.length} steps`}
          {plan.customer_service ? ' · customer service' : ''}
        </span>
      </summary>
      <div className="field">
        <label htmlFor={`days-${plan.id}`}>Training lasts</label>
        <div className="inline-field">
          <input id={`days-${plan.id}`} className="input input-narrow" type="number" min={1} max={90} value={days} onChange={(event) => setDays(Math.max(1, Math.min(90, Number(event.target.value) || 1)))} />
          <span>days</span>
        </div>
      </div>
      <label className="check-row">
        <input type="checkbox" checked={service} onChange={(event) => setService(event.target.checked)} />
        <span>
          Customer service mode
          <span className="hint"> The worker can turn it on at the counter during training. Owl listens and suggests answers from your documents. Nothing is recorded.</span>
        </span>
      </label>
      {relevant.length === 0 && <p className="hint">Publish a task first. Its steps can then be part of the level.</p>}
      {relevant.map((process) => (
        <fieldset key={process.id} className="field">
          <legend>{process.title}</legend>
          <ul className="plain-list level-steps">
            {process.steps.map((step) => (
              <li key={step.id} className="level-step">
                <label htmlFor={`req-${plan.id}-${process.id}-${step.id}`}>
                  {step.index}. {step.title}
                </label>
                <select
                  id={`req-${plan.id}-${process.id}-${step.id}`}
                  className="input input-narrow"
                  value={required(process.id, step.id)}
                  onChange={(event) => setRequired(process.id, step.id, Number(event.target.value))}
                >
                  <option value={0}>Not in the level</option>
                  {[1, 2, 3, 4, 5, 10].map((n) => (
                    <option key={n} value={n}>
                      {n === 1 ? 'Once without help' : `${n} times without help`}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </fieldset>
      ))}
      {error && <p className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="button button-primary" disabled={busy || !dirty} onClick={() => void save()}>
          Save the level
        </button>
      </div>
    </details>
  )
}

function NewPlan({ plans, onSaved }: { plans: TrainingPlan[]; onSaved: () => Promise<void> }) {
  const { api } = useStudio()
  const [role, setRole] = useState('')
  const [error, setError] = useState('')
  const add = async (event: React.FormEvent) => {
    event.preventDefault()
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
    <form className="inline-form" onSubmit={(event) => void add(event)} noValidate>
      <div className="field">
        <label htmlFor="new-plan-role">A level for another role</label>
        <div className="inline-field">
          <input id="new-plan-role" className="input" value={role} maxLength={60} placeholder="Packer" onChange={(event) => setRole(event.target.value)} />
          <button type="submit" className="button button-secondary">
            <Icon name="plus" size={18} />
            Add
          </button>
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
    </form>
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
    <section className="panel" aria-labelledby="sign-heading">
      <h2 id="sign-heading">Customer service: the sign at the desk</h2>
      <p className="hint">
        In customer service mode the glasses listen during training, only while the worker has it on, and suggest answers from your documents. Nothing is recorded. This sign tells customers.
      </p>
      <div className="field">
        <label htmlFor="sign-text">Text of the sign</label>
        <textarea id="sign-text" className="input" rows={4} maxLength={SIGN_LIMIT} value={text} onChange={(event) => setText(event.target.value)} />
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="row-actions">
        <button type="button" className="button button-secondary button-small" disabled={!text.trim() || text.trim() === saved} onClick={() => void save()}>
          Save
        </button>
        <button type="button" className="button button-quiet button-small" onClick={() => window.print()}>
          <Icon name="print" size={18} />
          Print the sign
        </button>
      </div>
      <div className="print-sheet print-sign" aria-hidden="true">
        <img src="/owl/icon-64.png" alt="" width="96" height="96" />
        <p>{saved}</p>
      </div>
    </section>
  )
}
