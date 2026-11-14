import type { Api } from '../lib/api.ts'
import type { Answer, Doc, Employee, EmployeeInput, HelpSession, Mark, OnShift, Process, Trainee, TrainingPlan, Zone } from '../lib/types.ts'
import { sampleData } from './data.ts'

const copy = <T,>(value: T): T => structuredClone(value)
const now = () => new Date().toISOString()
const uid = (kind: string) => `preview-${kind}-${crypto.randomUUID()}`
const day = (offset = 0) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)

function row<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find(item => item.id === id)
  if (!item) throw new Error('This sample item is no longer available. Reset the demo to start again.')
  return item
}

function put<T extends { id: string }>(items: T[], item: T): T {
  const at = items.findIndex(current => current.id === item.id)
  if (at < 0) items.push(copy(item))
  else items[at] = copy(item)
  return copy(item)
}

function welcome(person: Employee): string {
  return `Welcome to ${person.company}, ${person.name}! I'm Owl. I'll show you each step of your first tasks.`
}

/** Every response and edit stays in this instance. The demo never creates a real API client or reads credentials. */
export function createPreviewApi(): Api {
  const { processes, employees, plans, zones, documents } = copy(sampleData)
  let docs = documents.map(document => ({
    ...document,
    chars: document.text.length,
    uploaded_at: now(),
  }))
  let sign = 'Owl is helping our new team members learn. This workspace contains fictional sample data.'
  let shifts: OnShift[] = [{ company: 'Kide Logistics', employee_id: 'emp-mika', name: 'Mika' }]
  const sessions: HelpSession[] = [{
    id: 'help-preview', status: 'waiting', routed: 'studio', employee_id: 'emp-sami',
    process_id: 'proc-pick-pack', step_id: 'step-2',
    latest_frame_url: '/studio/preview/media/proc-pick-pack/step-2.jpg',
    frame_at: new Date(Date.now() - 10000).toISOString(), updated_at: now(),
    messages: [{ id: 1, from: 'worker', text: 'Which oat drink goes in this order?', at: now(), image_url: null }],
  }]

  function training(person: Employee, plan: TrainingPlan, starts: string, elapsed = 1): Trainee {
    return {
      employee_id: person.id, name: person.name, role: person.role, plan_id: plan.id,
      starts, ends: new Date(new Date(starts).getTime() + (plan.days - 1) * 86400000).toISOString().slice(0, 10),
      day: elapsed, days: plan.days, days_left: Math.max(0, plan.days - elapsed), active: true,
      target: plan.target.map(target => {
        const process = row(processes, target.process_id)
        const step = row(process.steps, target.step_id)
        return { ...target, title: step.title, task: process.title, done_without_help: 0, met: false }
      }),
      practise: [], suggestion: null, seen_at: null, confirmed: null,
    }
  }
  let trainees = [
    training(row(employees, 'emp-sami'), row(plans, 'plan-warehouse-picker'), day(-2), 3),
    training(row(employees, 'emp-noa'), row(plans, 'plan-cafe-counter'), day(-1), 2),
  ]

  const docRows = (): Doc[] => docs.map(({ id, title, filename, chars, uploaded_at }) => ({ id, title, filename, chars, uploaded_at }))

  function updatePerson(person: Employee, input: EmployeeInput): Employee {
    const updated = { ...person, ...copy(input), welcome: input.welcome ?? person.welcome }
    if (input.welcome === '' || input.welcome === null) updated.welcome = welcome(updated)
    return put(employees, updated)
  }

  async function markedImage(url: string | null, mark: Mark | null): Promise<string | null> {
    if (!url || !mark) return null
    const img = new Image()
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0)
    ctx.beginPath()
    ctx.arc(Math.max(0, Math.min(1, mark.x)) * canvas.width, Math.max(0, Math.min(1, mark.y)) * canvas.height, canvas.width * 0.045, 0, Math.PI * 2)
    ctx.strokeStyle = '#ffe16b'
    ctx.lineWidth = Math.max(3, canvas.width * 0.009)
    ctx.stroke()
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  return {
    config: { baseUrl: 'Sample workspace', token: '' },
    health: async () => ({ status: 'ok', model_id: 'Sample data', vision_model: 'Sample data', step_recognition: 'Sample data' }),
    stats: async () => ({ runs: 18, tasks_finished: 15, workers: employees.length, median_seconds_to_first_finished_task: 420, problems_caught: 6, problems_fixed: 6 }),
    employees: async () => copy(employees),
    addEmployee: async input => {
      const person: Employee = { id: uid('person'), name: input.name?.trim() || 'New worker', language: input.language || 'en', role: input.role || 'New worker', company: 'Kide Logistics', welcome: '', process_ids: [], glasses_id: null }
      return updatePerson(person, { ...input, welcome: input.welcome || welcome(person) })
    },
    updateEmployee: async (id, input) => updatePerson(row(employees, id), input),
    processes: async () => copy(processes),
    process: async id => copy(row(processes, id)),
    saveProcess: async (process: Process) => put(processes, process),
    recordings: async () => [],
    docs: async () => copy(docRows()),
    uploadDoc: async file => {
      if (!/\.(txt|md)$/i.test(file.name)) throw new Error('For this demo, try a .txt or .md file. PDF processing is available in the connected app.')
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a sample document smaller than 2 MB.')
      const text = await file.text()
      const doc = { id: uid('doc'), title: file.name.replace(/\.(txt|md)$/i, ''), filename: file.name, chars: text.length, uploaded_at: now(), text }
      docs.push(doc)
      return copy(docRows().find(item => item.id === doc.id)!)
    },
    deleteDoc: async id => { docs = docs.filter(doc => doc.id !== id) },
    ask: async question => {
      const words = question.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter(word => !['the', 'this', 'that', 'what', 'where', 'when', 'how', 'does', 'for', 'and', 'are', 'can', 'should'].includes(word)) ?? []
      const sections = docs.flatMap(doc => doc.text.split(/\n(?=#{1,4} )/).map(text => ({ doc, text, score: words.reduce((score, word) => score + Number(text.toLocaleLowerCase().includes(word)), 0) })))
      sections.sort((a, b) => b.score - a.score)
      const best = sections[0]
      if (!best || best.score === 0) return { found: false, text: 'The sample handbooks do not contain that answer.', say: 'The sample handbooks do not contain that answer.', language: 'en', sources: [] }
      const text = best.text.replace(/^#{1,6}[^\n]*\n/, '').replace(/\*\*/g, '').trim().slice(0, 750)
      const answer: Answer = { found: true, text, say: text, language: 'en', sources: [{ doc: best.doc.title, quote: text, section: best.text.match(/^#{1,6}\s+([^\n]+)/)?.[1] ?? null }] }
      return answer
    },
    helpSessions: async () => copy(sessions),
    helpSession: async id => copy(row(sessions, id)),
    say: async (id, text, mark = null, from = 'expert') => {
      const session = row(sessions, id)
      const image = await markedImage(session.latest_frame_url, mark)
      session.messages.push({ id: session.messages.length + 1, from, text, at: now(), image_url: image })
      session.status = 'connected'
      session.updated_at = now()
      return copy(session)
    },
    acceptHelp: async (id, employeeId) => {
      const session = row(sessions, id)
      session.status = 'accepted'
      session.assignee = row(employees, employeeId).id
      session.updated_at = now()
      return copy(session)
    },
    laterHelp: async id => {
      const session = row(sessions, id)
      session.status = 'waiting'
      session.routed = 'studio'
      session.assignee = null
      session.updated_at = now()
      return copy(session)
    },
    endHelp: async id => {
      const session = row(sessions, id)
      session.status = 'ended'
      session.latest_frame_url = null
      session.updated_at = now()
      return copy(session)
    },
    onShift: async () => copy(shifts),
    setOnShift: async (company, employeeId) => {
      shifts = shifts.filter(shift => shift.company !== company)
      if (employeeId) { const person = row(employees, employeeId); shifts.push({ company, employee_id: person.id, name: person.name }) }
      return copy(shifts)
    },
    trainingPlans: async () => copy(plans),
    saveTrainingPlan: async plan => put(plans, plan),
    trainees: async () => copy(trainees),
    startTraining: async (employeeId, starts, planId = null) => {
      const person = row(employees, employeeId)
      if (!starts) { trainees = trainees.filter(trainee => trainee.employee_id !== employeeId); return { employee_id: employeeId, plan_id: null } }
      const plan = plans.find(plan => plan.id === planId) ?? plans.find(plan => plan.role === person.role)
      if (!plan) throw new Error('Choose a training role for this sample worker.')
      const next = training(person, plan, starts)
      trainees = [...trainees.filter(trainee => trainee.employee_id !== employeeId), next]
      return copy(next)
    },
    confirmTraining: async (employeeId, result, by, extendDays = 3) => {
      const trainee = trainees.find(trainee => trainee.employee_id === employeeId)
      if (!trainee) throw new Error('This sample worker has no training period.')
      trainee.confirmed = { result, by, at: now(), note: null }
      trainee.active = result === 'more_practice'
      if (trainee.active) { trainee.days += extendDays; trainee.days_left += extendDays; trainee.ends = new Date(new Date(trainee.ends).getTime() + extendDays * 86400000).toISOString().slice(0, 10) }
      return copy(trainee)
    },
    zones: async () => copy(zones),
    saveZone: async (zone: Zone) => put(zones, zone),
    deleteZone: async id => {
      const index = zones.findIndex(zone => zone.id === id)
      if (index >= 0) zones.splice(index, 1)
      for (const process of processes) for (const step of process.steps) if (step.checkpoint?.zone_id === id) step.checkpoint = null
    },
    addPlacePhoto: async (processId, stepId, file) => {
      if (!file.type.startsWith('image/')) throw new Error('Choose an image for this sample place.')
      const process = row(processes, processId), step = row(process.steps, stepId)
      if (!step.checkpoint) throw new Error('Choose an area for this step first.')
      step.checkpoint.photo_urls = [...(step.checkpoint.photo_urls ?? []), URL.createObjectURL(file)]
      return copy(process)
    },
    // The company's own phone video of a step (382caac). In the demo it stays in this tab, like the place photos:
    // nothing is uploaded, so nothing is blurred or cut either.
    addStepClip: async (processId, stepId, file) => {
      if (!file.type.startsWith('video/')) throw new Error('Choose a video for this sample step.')
      if (file.size > 80 * 1024 * 1024) throw new Error('Choose a video smaller than 80 MB.')
      const process = row(processes, processId), step = row(process.steps, stepId)
      step.clip_url = URL.createObjectURL(file)
      return copy(process)
    },
    places: async () => {
      const zone = zones.find(zone => zone.id === 'zone-c')
      return [{ employee_id: 'emp-sami', name: 'Sami', zone: zone ? { id: zone.id, name: zone.name } : null, entered_at: day() }]
    },
    unlockStep: async (employeeId, processId, stepId) => {
      row(employees, employeeId)
      row(row(processes, processId).steps, stepId)
      return { unlocked: true }
    },
    assistSign: async () => sign,
    saveAssistSign: async text => { sign = text; return sign },
  }
}
