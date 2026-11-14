import { Button, ListItem, Page, Panel, ScrollView, StatusIndicatorType, TextColor, TextStyle, TextView, VerticalList, VisualState } from '@wearables-ui-toolkit/mrbd'
import { useMemo, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { glassesName } from '../lib/docs.ts'
import { LANGUAGES, languageName, speechLocale, writesWelcome } from '../lib/languages.ts'
import { href } from '../lib/route.ts'
import { useStudio } from '../lib/studio.ts'
import { count } from '../lib/words.ts'
import type { Employee, EmployeeInput, Process } from '../lib/types.ts'
import { ICONS } from '../ui/icons.ts'
import { Actions, CharacterCount, ChoiceRow, PrimaryButton, Problem, TextField, Waiting } from '../ui/meta.tsx'
import { useToast } from '../ui/toast.ts'
import { ShiftRows } from './ShiftPanel.tsx'

const GLASSES = ['glasses-1', 'glasses-2', 'glasses-3']
const WELCOME_LIMIT = 300

/** New workers: who they are, what they learn, which glasses they wear and how Owl greets them. */
export function PeopleView({ selectedId }: { selectedId: string | null }) {
  const { employees, processes, connection } = useStudio()
  const selected = selectedId && selectedId !== 'new' ? (employees?.find((employee) => employee.id === selectedId) ?? null) : null
  const adding = selectedId === 'new'
  const severalCompanies = new Set((employees ?? []).map((employee) => employee.company).filter(Boolean)).size > 1

  return (
    <Page headerText="People" enableSystemBarInset={false} className="route">
      <div className="split">
        <section className="split-list" aria-label="Everyone">
          <VerticalList insetForHeader ariaLabel="People">
            <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="list-lede">
              Add a new worker, choose their language and their tasks, and give them a pair of glasses. On the first day they say "Hey Meta, start Owl" and the rest is in their own language.
            </TextView>
            {employees === null && connection.state === 'connecting' && <Waiting what="Getting your people" />}
            {employees !== null && employees.length === 0 && (
              <TextView as="p" textStyle={TextStyle.BODY2} className="list-note">
                No one here yet. Add your first new worker: Owl greets them by name on the glasses.
              </TextView>
            )}
            {(employees ?? []).map((employee) => {
              const current = selected?.id === employee.id
              const facts = [severalCompanies && employee.company, employee.role, employee.shift_manager && employee.role?.toLowerCase() !== 'shift manager' && 'Shift manager', languageName(employee.language), tasksText(employee, processes), employee.glasses_id ? `Wears ${glassesName(employee.glasses_id)}` : 'No glasses yet']
              return (
                <ListItem
                  key={employee.id}
                  title={employee.name}
                  subtitle={facts.filter(Boolean).join(' · ')}
                  subtitleMaxLines={4}
                  avatarPrimaryContent={<span className="initial uit-text-body1-emphasized">{employee.name.trim().charAt(0).toUpperCase()}</span>}
                  avatarStatusIndicator={employee.glasses_id ? StatusIndicatorType.POSITIVE : StatusIndicatorType.INACTIVE}
                  visualStateOverride={current ? VisualState.FOCUSED : undefined}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => (window.location.hash = href('people', employee.id))}
                />
              )
            })}
            <ShiftRows />
            <Panel width="100%" className="list-panel">
              <div className="panel-body">
                <TextView as="h2" textStyle={TextStyle.BODY2_EMPHASIZED}>
                  Once, before the first shift
                </TextView>
                <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                  You do this on the work phone, so the new worker never has to take it out.
                </TextView>
                <ol className="steps-list">
                  {['Pair the glasses with the phone in the Meta AI app.', 'Open Owl on the phone and connect it to the glasses.', 'Allow the camera and the microphone for Owl.', 'Give the worker their pair here, under Glasses.'].map((line) => (
                    <li key={line}>
                      <TextView as="span" textStyle={TextStyle.BODY2}>
                        {line}
                      </TextView>
                    </li>
                  ))}
                </ol>
              </div>
            </Panel>
          </VerticalList>
          {!adding && (
            <div className="action-dock">
              <Actions align="start">
                <PrimaryButton title="Add a person" icon={ICONS.plus} onClick={() => (window.location.hash = href('people', 'new'))} />
              </Actions>
            </div>
          )}
        </section>

        <section className="split-detail" aria-label={adding ? 'New person' : (selected?.name ?? 'A welcome in their own language')}>
          {adding || selected ? (
            <PersonForm key={selected?.id ?? 'new'} employee={selected} />
          ) : (
            <ScrollView ariaLabel="About the welcome" className="detail-scroll" tabIndex={0}>
              <Panel width="100%">
                <div className="panel-body panel-owl">
                  <img className="owl-figure" src="/owl/full/welcome.png" alt="" height={240} />
                  <div className="panel-body-text">
                    <TextView as="h2" textStyle={TextStyle.BODY2_EMPHASIZED}>
                      A welcome in their own language
                    </TextView>
                    <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                      Choose a person to see what Owl says to them on their first day, or add someone new. Owl writes the welcome from their name, your company and their first task.
                    </TextView>
                  </div>
                </div>
              </Panel>
            </ScrollView>
          )}
        </section>
      </div>
    </Page>
  )
}

function tasksText(employee: Employee, processes: Process[] | null): string {
  const titles = employee.process_ids.map((id) => processes?.find((process) => process.id === id)?.title).filter(Boolean)
  if (!titles.length) return 'No tasks yet'
  return titles.length === 1 ? (titles[0] as string) : count(titles.length, 'task', 'tasks')
}

function PersonForm({ employee }: { employee: Employee | null }) {
  const studio = useStudio()
  const toast = useToast()
  const [name, setName] = useState(employee?.name ?? '')
  const [role, setRole] = useState(employee?.role ?? '')
  const [language, setLanguage] = useState(employee?.language ?? 'en')
  const [processIds, setProcessIds] = useState<string[]>(employee?.process_ids ?? [])
  const [glassesId, setGlassesId] = useState(employee?.glasses_id ?? '')
  const [shiftManager, setShiftManager] = useState(Boolean(employee?.shift_manager))
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

  const save = async () => {
    if (!name.trim()) {
      setNameMissing(true)
      document.getElementById('person-name')?.focus()
      return
    }
    setBusy(true)
    setProblem(null)
    const input: EmployeeInput = { name: name.trim(), language, role: role.trim(), process_ids: processIds, glasses_id: glassesId || null, shift_manager: shiftManager }
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

  const languageChoices = languages.map((option) => ({ value: option.code, label: option.native, detail: option.native === option.english ? undefined : option.english }))
  const glassesChoices = [{ value: '', label: 'No glasses yet' }, ...pairs.map((pair) => ({ value: pair, label: glassesName(pair), detail: wearer(pair) ? `${wearer(pair)?.name} has them` : undefined }))]

  return (
    <div className="detail-shell">
      <VerticalList ariaLabel={employee ? `${employee.name}, details` : 'New person'} className="detail-list">
        <div className="form-block">
          <TextView as="h2" textStyle={TextStyle.BODY2_EMPHASIZED}>
            {employee ? employee.name : 'New person'}
          </TextView>
          <TextField id="person-name" label="Name" value={name} maxLength={60} onChange={setName} error={nameMissing && !name.trim() ? 'Write the name Owl should greet them by.' : null} />
          <TextField id="person-role" label="Job" value={role} maxLength={60} placeholder="Warehouse picker" onChange={setRole} />
        </div>
        <ChoiceRow label="Language" choices={languageChoices} value={language} onChange={setLanguage} note={languages.find((option) => option.code === language) ? `${languageName(language)}` : language} />
        <ChoiceRow
          label="Glasses"
          choices={glassesChoices}
          value={glassesId}
          onChange={setGlassesId}
          warn={Boolean(takenFrom)}
          note={
            takenFrom
              ? `${takenFrom.name} has this pair now. Saving gives it to ${name.trim() || 'this person'} and leaves ${takenFrom.name} without glasses.`
              : glassesId
                ? `${glassesName(glassesId)}. A pair has one wearer at a time.`
                : 'No glasses yet. A pair has one wearer at a time.'
          }
        />
        <ListItem title="Shift manager" subtitle="When on shift, answers a new worker's Help call on their own glasses and sees the worker's view." subtitleMaxLines={4} showSwitch checked={shiftManager} onCheckedChange={setShiftManager} />
        {studio.processes?.length ? (
          studio.processes.map((process) => (
            <ListItem
              key={process.id}
              title={process.title}
              subtitle={process.status === 'draft' ? 'Task to learn · draft, not on the glasses yet' : 'Task to learn'}
              showSwitch
              checked={processIds.includes(process.id)}
              onCheckedChange={() => toggleTask(process.id)}
            />
          ))
        ) : (
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY} className="list-note">
            There are no tasks yet. Record one on the glasses first.
          </TextView>
        )}

        <section className="form-block" aria-labelledby="welcome-heading">
          <TextView as="h3" id="welcome-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
            The welcome
          </TextView>
          {employee ? (
            <>
              <Panel width="100%">
                <div className="panel-body panel-owl">
                  <img className="owl-figure" src="/owl/full/welcome.png" alt="" height={150} />
                  <TextView as="p" textStyle={TextStyle.BODY2} lang={language}>
                    {welcome}
                  </TextView>
                </div>
              </Panel>
              <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                {`Shown on the glasses and spoken aloud the first time ${employee.name} starts Owl.`}
              </TextView>
              <TextField
                id="person-welcome"
                label="Change the words"
                value={welcome}
                lang={language}
                multiline
                maxLength={WELCOME_LIMIT}
                extra={<CharacterCount used={welcome.trim().length} limit={WELCOME_LIMIT} />}
                hint={writesWelcome(language) ? undefined : `Owl writes the welcome in English and Finnish. In ${languageName(language)} it stays in English until you write it here.`}
                onChange={(text) => {
                  setWelcome(text)
                  setWelcomeEdited(true)
                }}
              />
              <Actions align="start">
                {canSpeak && <Button title="Hear it" icon={ICONS.sound} alwaysShowText onClick={hear} />}
                <Button title="Use Owl's wording" icon={ICONS.undo} alwaysShowText disabled={busy} onClick={() => void resetWelcome()} />
              </Actions>
            </>
          ) : (
            <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
              {`Owl writes the welcome when you add ${name.trim() || 'them'}: their name, your company and their first task${writesWelcome(language) ? '' : ', in English until you write it in their language'}. You can change it afterwards.`}
            </TextView>
          )}
        </section>

        {problem && (
          <div className="form-block">
            <Problem>{problem}</Problem>
          </div>
        )}
      </VerticalList>
      <div className="action-dock">
        <Actions align="end">
          <Button title="Close" alwaysShowText onClick={() => (window.location.hash = href('people'))} />
          <PrimaryButton title={busy ? 'Saving' : employee ? 'Save changes' : 'Add this person'} showLoader={busy} onClick={() => void save()} />
        </Actions>
      </div>
    </div>
  )
}
