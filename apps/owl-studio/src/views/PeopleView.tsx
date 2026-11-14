import { useMemo, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { glassesName } from '../lib/docs.ts'
import { LANGUAGES, languageName, speechLocale, writesWelcome } from '../lib/languages.ts'
import { href } from '../lib/route.ts'
import { useStudio } from '../lib/studio.ts'
import type { Employee, EmployeeInput, Process } from '../lib/types.ts'
import { Icon } from '../ui/Icon.tsx'
import { OwlFigure } from '../ui/Owl.tsx'
import { Counter, EmptyState, Loading, Problem, StatusTag } from '../ui/parts.tsx'
import { useToast } from '../ui/toast.ts'

const GLASSES = ['glasses-1', 'glasses-2', 'glasses-3']
const WELCOME_LIMIT = 300

/** New workers: who they are, what they learn, which glasses they wear and how Owl greets them. */
export function PeopleView({ selectedId }: { selectedId: string | null }) {
  const { employees, processes, connection } = useStudio()
  const selected = selectedId && selectedId !== 'new' ? (employees?.find((employee) => employee.id === selectedId) ?? null) : null
  const adding = selectedId === 'new'
  const severalCompanies = new Set((employees ?? []).map((employee) => employee.company).filter(Boolean)).size > 1

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>People</h1>
          <p className="lede">Add a new worker, choose their language and their tasks, and give them a pair of glasses. On the first day they say "Hey Meta, start Owl" and the rest is in their own language.</p>
        </div>
        {!adding && (
          <a className={selected ? 'button button-secondary' : 'button button-primary'} href={href('people', 'new')}>
            <Icon name="plus" size={18} />
            Add a person
          </a>
        )}
      </header>

      <div className={adding || selected ? 'two-col has-detail' : 'two-col'}>
        <div className="stack">
          {employees === null ? (
            connection.state === 'connecting' ? (
              <Loading what="Getting your people" />
            ) : null
          ) : employees.length === 0 ? (
            <EmptyState title="No one here yet">Add your first new worker. Owl greets them by name on the glasses.</EmptyState>
          ) : (
            <ul className="rows" aria-label="People">
              {employees.map((employee) => (
                <li key={employee.id}>
                  <a className="row row-link" href={href('people', employee.id)} aria-current={selected?.id === employee.id ? 'true' : undefined}>
                    <span className="initial" aria-hidden="true">
                      {employee.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="row-main">
                      <span className="row-title">{employee.name}</span>
                      <span className="row-meta">
                        {[severalCompanies && employee.company, employee.role, languageName(employee.language), tasksText(employee, processes)].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {employee.glasses_id ? (
                      <StatusTag tone="accent" shape="ring">
                        Wears {glassesName(employee.glasses_id)}
                      </StatusTag>
                    ) : (
                      <StatusTag tone="muted" shape="square">
                        No glasses yet
                      </StatusTag>
                    )}
                    <span className="row-go" aria-hidden="true">
                      <Icon name="chevron" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <section className="panel checklist" aria-labelledby="once-heading">
            <h2 id="once-heading">Once, before the first shift</h2>
            <p className="hint">You do this on the work phone, so the new worker never has to take it out.</p>
            <ol>
              <li>Pair the glasses with the phone in the Meta AI app.</li>
              <li>Open Owl on the phone and connect it to the glasses.</li>
              <li>Allow the camera and the microphone for Owl.</li>
              <li>Give the worker their pair here, under Glasses.</li>
            </ol>
          </section>
        </div>

        {adding || selected ? (
          <PersonForm key={selected?.id ?? 'new'} employee={selected} />
        ) : (
          <section className="panel person-intro">
            <OwlFigure state="welcome" height={200} />
            <div>
              <h2>A welcome in their own language</h2>
              <p>Choose a person to see what Owl says to them on their first day, or add someone new. Owl writes the welcome from their name, your company and their first task.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function tasksText(employee: Employee, processes: Process[] | null): string {
  const titles = employee.process_ids.map((id) => processes?.find((process) => process.id === id)?.title).filter(Boolean)
  if (!titles.length) return 'No tasks yet'
  return titles.length === 1 ? (titles[0] as string) : `${titles.length} tasks`
}

function PersonForm({ employee }: { employee: Employee | null }) {
  const studio = useStudio()
  const toast = useToast()
  const [name, setName] = useState(employee?.name ?? '')
  const [role, setRole] = useState(employee?.role ?? '')
  const [language, setLanguage] = useState(employee?.language ?? 'en')
  const [processIds, setProcessIds] = useState<string[]>(employee?.process_ids ?? [])
  const [glassesId, setGlassesId] = useState(employee?.glasses_id ?? '')
  const [welcome, setWelcome] = useState(employee?.welcome ?? '')
  const [welcomeEdited, setWelcomeEdited] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [nameMissing, setNameMissing] = useState(false)

  const others = useMemo(() => (studio.employees ?? []).filter((other) => other.id !== employee?.id), [studio.employees, employee])
  const pairs = useMemo(() => [...new Set([...GLASSES, ...others.map((other) => other.glasses_id).filter((id): id is string => !!id), ...(employee?.glasses_id ? [employee.glasses_id] : [])])], [others, employee])
  const wearer = (pair: string) => others.find((other) => other.glasses_id === pair)
  const takenFrom = glassesId ? wearer(glassesId) : undefined
  const languages = LANGUAGES.some((option) => option.code === language) ? LANGUAGES : [...LANGUAGES, { code: language, native: language, english: language, speech: language }]
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  const toggleTask = (id: string) => setProcessIds((ids) => (ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id]))

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setNameMissing(true)
      document.getElementById('person-name')?.focus()
      return
    }
    setBusy(true)
    setProblem(null)
    const input: EmployeeInput = { name: name.trim(), language, role: role.trim(), process_ids: processIds, glasses_id: glassesId || null }
    try {
      if (employee) {
        // The welcome is sent only when it was changed by hand; otherwise Owl keeps it in step with the name and the task.
        if (welcomeEdited) input.welcome = welcome.trim()
        const answer = await studio.api.updateEmployee(employee.id, input)
        setWelcome(answer.welcome)
        setWelcomeEdited(false)
        await studio.reload()
        toast({ message: `Saved. ${answer.name} is up to date.` })
      } else {
        const answer = await studio.api.addEmployee(input)
        await studio.reload()
        toast({ message: `${answer.name} is added. Owl wrote the welcome.` })
        window.location.hash = href('people', answer.id)
      }
    } catch (error) {
      setProblem(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  const resetWelcome = async () => {
    if (!employee) return
    setBusy(true)
    setProblem(null)
    try {
      const answer = await studio.api.updateEmployee(employee.id, { welcome: '' })
      setWelcome(answer.welcome)
      setWelcomeEdited(false)
      await studio.reload()
      toast({ message: 'The welcome is back to Owl\'s wording.' })
    } catch (error) {
      setProblem(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  const hear = () => {
    const utterance = new SpeechSynthesisUtterance(welcome)
    utterance.lang = speechLocale(language)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  return (
    <form className="panel person-form" onSubmit={(event) => void save(event)} noValidate aria-labelledby="person-heading">
      <h2 id="person-heading">{employee ? employee.name : 'New person'}</h2>

      <div className="field">
        <label htmlFor="person-name">Name</label>
        <input
          id="person-name"
          className="input"
          value={name}
          maxLength={60}
          autoComplete="off"
          aria-invalid={nameMissing && !name.trim()}
          aria-describedby={nameMissing && !name.trim() ? 'person-name-error' : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        {nameMissing && !name.trim() && (
          <p className="field-error" id="person-name-error">
            Write the name Owl should greet them by.
          </p>
        )}
      </div>

      <div className="field-pair">
        <div className="field">
          <label htmlFor="person-role">Job</label>
          <input id="person-role" className="input" value={role} maxLength={60} autoComplete="off" placeholder="Warehouse picker" onChange={(event) => setRole(event.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="person-language">Language</label>
          <select id="person-language" className="input" value={language} onChange={(event) => setLanguage(event.target.value)}>
            {languages.map((option) => (
              <option key={option.code} value={option.code}>
                {option.native === option.english ? option.native : `${option.native} (${option.english})`}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="field">
        <legend>Tasks to learn</legend>
        {studio.processes?.length ? (
          <ul className="checks">
            {studio.processes.map((process) => (
              <li key={process.id}>
                <label className="check-row">
                  <input type="checkbox" checked={processIds.includes(process.id)} onChange={() => toggleTask(process.id)} />
                  <span>
                    {process.title}
                    {process.status === 'draft' && <span className="muted"> (draft, not on the glasses yet)</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">There are no tasks yet. Record one on the glasses first.</p>
        )}
      </fieldset>

      <div className="field">
        <label htmlFor="person-glasses">Glasses</label>
        <select id="person-glasses" className="input" value={glassesId} onChange={(event) => setGlassesId(event.target.value)} aria-describedby="person-glasses-hint">
          <option value="">No glasses yet</option>
          {pairs.map((pair) => {
            const worn = wearer(pair)
            return (
              <option key={pair} value={pair}>
                {glassesName(pair)}
                {worn ? ` (${worn.name} has them)` : ''}
              </option>
            )
          })}
        </select>
        <p className="hint" id="person-glasses-hint">
          {takenFrom
            ? `${takenFrom.name} has this pair now. Saving gives it to ${name.trim() || 'this person'} and leaves ${takenFrom.name} without glasses.`
            : 'A pair has one wearer at a time. Giving it to someone takes it from whoever had it.'}
        </p>
      </div>

      <section className="welcome" aria-labelledby="welcome-heading">
        <h3 id="welcome-heading">The welcome</h3>
        {employee ? (
          <>
            <div className="welcome-card">
              <OwlFigure state="welcome" height={132} />
              <p className="welcome-text" lang={language}>
                {welcome}
              </p>
            </div>
            <p className="hint">Shown on the glasses and spoken aloud the first time {employee.name} starts Owl.</p>
            <div className="field">
              <div className="field-label">
                <label htmlFor="person-welcome">Change the words</label>
                <Counter used={welcome.trim().length} limit={WELCOME_LIMIT} unit="characters" />
              </div>
              <textarea
                id="person-welcome"
                className="input"
                rows={3}
                maxLength={WELCOME_LIMIT}
                lang={language}
                value={welcome}
                onChange={(event) => {
                  setWelcome(event.target.value)
                  setWelcomeEdited(true)
                }}
              />
              {!writesWelcome(language) && <p className="hint">Owl writes the welcome in English and Finnish. In {languageName(language)} it stays in English until you write it here.</p>}
            </div>
            <div className="row-actions">
              {canSpeak && (
                <button type="button" className="button button-quiet button-small" onClick={hear}>
                  <Icon name="sound" size={18} />
                  Hear it
                </button>
              )}
              <button type="button" className="button button-quiet button-small" onClick={() => void resetWelcome()} disabled={busy}>
                <Icon name="undo" size={18} />
                Use Owl's wording
              </button>
            </div>
          </>
        ) : (
          <p className="hint">
            Owl writes the welcome when you add {name.trim() || 'them'}: their name, your company and their first task{writesWelcome(language) ? '' : ', in English until you write it in their language'}. You can change it afterwards.
          </p>
        )}
      </section>

      {problem && <Problem>{problem}</Problem>}

      <div className="form-actions">
        <a className="button button-quiet" href={href('people')}>
          Close
        </a>
        <button type="submit" className="button button-primary" disabled={busy}>
          {busy ? 'Saving' : employee ? 'Save changes' : 'Add this person'}
        </button>
      </div>
    </form>
  )
}
