import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { newId, rectFrom, todayIso } from '../lib/training.ts'
import type { Process, Trainee, TrainingPlan, Zone } from '../lib/types.ts'
import { fakeApi, fakeStudio, process, renderWith, sami, step } from '../test/helpers.tsx'
import { MapView } from './MapView.tsx'
import { TrainingView } from './TrainingView.tsx'

function trainee(patch: Partial<Trainee> = {}): Trainee {
  return {
    employee_id: 'emp-sami',
    name: 'Sami',
    role: 'Warehouse picker',
    plan_id: 'plan-picker',
    starts: '2026-11-11',
    ends: '2026-11-15',
    day: 5,
    days: 5,
    days_left: 0,
    active: true,
    target: [
      { process_id: 'proc-1', step_id: 'step-1', title: 'Take a medium box', task: 'Pick and pack an order', required: 3, done_without_help: 3, met: true },
      { process_id: 'proc-1', step_id: 'step-2', title: 'Pick the items', task: 'Pick and pack an order', required: 3, done_without_help: 2, met: false },
    ],
    practise: [{ process_id: 'proc-1', step_id: 'step-2', title: 'Pick the items' }],
    suggestion: 'more_practice',
    seen_at: '2026-11-15T10:00:00+02:00',
    confirmed: null,
    ...patch,
  }
}

const plan: TrainingPlan = { id: 'plan-picker', role: 'Warehouse picker', days: 5, target: [{ process_id: 'proc-1', step_id: 'step-1', required: 3 }] }

function trainingApi(rows: Trainee[], patch = {}) {
  return fakeApi({
    trainees: vi.fn(async () => rows),
    trainingPlans: vi.fn(async () => [plan]),
    startTraining: vi.fn(async () => ({})),
    confirmTraining: vi.fn(async () => ({})),
    saveTrainingPlan: vi.fn(async (sent) => sent),
    assistSign: vi.fn(async () => 'Owl listens here. Nothing is recorded.'),
    saveAssistSign: vi.fn(async (text) => text),
    ...patch,
  })
}

describe('training', () => {
  it('shows only the day while training goes on, not how the worker is doing', async () => {
    const api = trainingApi([trainee({ day: 2, days_left: 3, suggestion: null, seen_at: null })])
    renderWith(<TrainingView />, fakeStudio({ api, employees: [sami] }))
    const card = await screen.findByRole('article', { name: 'Sami, Warehouse picker' })
    expect(within(card).getByText(/Day 2 of 5/)).toBeTruthy()
    expect(within(card).getByText('In training')).toBeTruthy()
    expect(within(card).queryByRole('table')).toBeNull()
    expect(within(card).queryByText(/Pick the items/)).toBeNull()
  })

  it('waits for the worker to see the result first', async () => {
    const api = trainingApi([trainee({ suggestion: null, seen_at: null, waiting_for_worker: true })])
    renderWith(<TrainingView />, fakeStudio({ api }))
    expect(await screen.findByText(/Sami sees it on the glasses first/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Confirm: ready' })).toBeNull()
  })

  it('shows the evidence, and a person with a name confirms', async () => {
    const user = userEvent.setup()
    const api = trainingApi([trainee()])
    renderWith(<TrainingView />, fakeStudio({ api }))
    const card = await screen.findByRole('article', { name: 'Sami, Warehouse picker' })
    expect(within(card).getByText(/Owl suggests: More practice/)).toBeTruthy()
    expect(within(card).getByText(/Steps to practise: Pick the items/)).toBeTruthy()
    const evidence = within(card).getByRole('table')
    expect(within(evidence).getByRole('rowheader', { name: 'Pick the items' })).toBeTruthy()

    await user.click(within(card).getByRole('button', { name: 'Confirm: more practice' }))
    expect(within(card).getByText('Write your name: the result says who decided it.')).toBeTruthy()
    expect(api.confirmTraining).not.toHaveBeenCalled()

    await user.type(within(card).getByLabelText('Your name'), 'Laura')
    await user.selectOptions(within(card).getByLabelText('More practice for'), '5')
    await user.click(within(card).getByRole('button', { name: 'Confirm: more practice' }))
    await waitFor(() => expect(api.confirmTraining).toHaveBeenCalledWith('emp-sami', 'more_practice', 'Laura', 5))
  })

  it('starts a training period for someone not in training yet', async () => {
    const user = userEvent.setup()
    const leo = { ...sami, id: 'emp-leo', name: 'Leo' }
    const api = trainingApi([trainee()])
    renderWith(<TrainingView />, fakeStudio({ api, employees: [sami, leo] }))
    const who = await screen.findByLabelText('Who')
    expect(within(who).queryByText(/^Sami/)).toBeNull()
    await user.selectOptions(who, 'emp-leo')
    expect(screen.getByRole('option', { name: 'The level for Warehouse picker (5 days)' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Start training' }))
    await waitFor(() => expect(api.startTraining).toHaveBeenCalledWith('emp-leo', todayIso(), null))
  })

  it('sets the level and customer service mode for a role', async () => {
    const user = userEvent.setup()
    const api = trainingApi([])
    const published: Process = process({ status: 'published' })
    renderWith(<TrainingView />, fakeStudio({ api, processes: [published] }))
    await user.click(await screen.findByText('Warehouse picker'))
    await user.selectOptions(screen.getByLabelText('2. Pick the items'), '2')
    await user.click(screen.getByLabelText(/Customer service mode/))
    await user.click(screen.getByRole('button', { name: 'Save the level' }))
    await waitFor(() =>
      expect(api.saveTrainingPlan).toHaveBeenCalledWith({
        ...plan,
        customer_service: true,
        target: [
          { process_id: 'proc-1', step_id: 'step-1', required: 3 },
          { process_id: 'proc-1', step_id: 'step-2', required: 2 },
        ],
      }),
    )
  })

  it('edits the sign at the desk', async () => {
    const user = userEvent.setup()
    const api = trainingApi([])
    renderWith(<TrainingView />, fakeStudio({ api }))
    const text = await screen.findByLabelText('Text of the sign')
    await user.clear(text)
    await user.type(text, 'Our trainee wears Owl glasses.')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.saveAssistSign).toHaveBeenCalledWith('Our trainee wears Owl glasses.'))
  })
})

const zones: Zone[] = [
  { id: 'zone-c', name: 'Aisle C', kind: 'aisle', x: 0.45, y: 0.08, w: 0.14, h: 0.6 },
  { id: 'zone-pack', name: 'Packing', kind: 'packing', x: 0.68, y: 0.08, w: 0.27, h: 0.36 },
]

function mapApi(patch = {}) {
  return fakeApi({
    zones: vi.fn(async () => zones),
    places: vi.fn(async () => [{ employee_id: 'emp-sami', name: 'Sami', zone: { id: 'zone-c', name: 'Aisle C' }, entered_at: '2026-11-15T10:00:00+02:00' }]),
    saveZone: vi.fn(async (zone) => zone),
    deleteZone: vi.fn(async () => undefined),
    addPlacePhoto: vi.fn(async () => process({ steps: [step(1), step(2, { checkpoint: { zone_id: 'zone-c', label: 'Aisle C · Shelf 12', photo_urls: ['http://test/media/places/p/step-2-1.jpg'] } })] })),
    unlockStep: vi.fn(async () => ({})),
    ...patch,
  })
}

describe('map', () => {
  it('shows where each trainee is now', async () => {
    renderWith(<MapView />, fakeStudio({ api: mapApi() }))
    expect(await screen.findByRole('img', { name: /Sami is in Aisle C/ })).toBeTruthy()
    expect(await screen.findByText('Sami: Aisle C')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Print/ })).toBeNull()
  })

  it('renames an area', async () => {
    const user = userEvent.setup()
    const api = mapApi()
    renderWith(<MapView />, fakeStudio({ api }))
    await user.click(await screen.findByRole('button', { name: /^Packing/ }))
    const name = screen.getByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Packing station')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.saveZone).toHaveBeenCalledWith({ ...zones[1], name: 'Packing station' }))
  })

  it('puts a step in a place, saved on the task', async () => {
    const user = userEvent.setup()
    const api = mapApi()
    const studio = fakeStudio({ api, processes: [process({ steps: [step(1), step(2)] })] })
    renderWith(<MapView />, studio)
    await user.click(await screen.findByText('Pick and pack an order'))
    await user.selectOptions(screen.getByLabelText('Area of step 2'), 'zone-c')
    const label = screen.getByLabelText('What the glasses say for step 2')
    await user.clear(label)
    await user.type(label, 'Aisle C · Shelf 12')
    await user.click(screen.getByRole('button', { name: 'Save the places' }))
    await waitFor(() => expect(api.saveProcess).toHaveBeenCalled())
    const sent = vi.mocked(api.saveProcess).mock.calls[0][0] as Process
    expect(sent.steps.map((s) => s.checkpoint)).toEqual([null, { zone_id: 'zone-c', label: 'Aisle C · Shelf 12', photo_urls: [] }])
    expect(studio.putProcess).toHaveBeenCalled()
  })

  it('adds a photo of a place, so Owl knows it from another angle', async () => {
    const user = userEvent.setup()
    const api = mapApi()
    const withPlace = process({ steps: [step(1), step(2, { checkpoint: { zone_id: 'zone-c', label: 'Aisle C · Shelf 12', photo_urls: [] } })] })
    const studio = fakeStudio({ api, processes: [withPlace] })
    renderWith(<MapView />, studio)
    await user.click(await screen.findByText('Pick and pack an order'))
    expect(screen.getByRole('img', { name: "The expert's photo of step 2" })).toBeTruthy()
    const file = new File(['x'], 'shelf.jpg', { type: 'image/jpeg' })
    await user.upload(screen.getByLabelText('Add a photo of the place'), file)
    await waitFor(() => expect(api.addPlacePhoto).toHaveBeenCalledWith('proc-1', 'step-2', file))
    expect(studio.putProcess).toHaveBeenCalled()
  })

  it('keeps the place photos when the places are saved', async () => {
    const user = userEvent.setup()
    const api = mapApi()
    const withPlace = process({ steps: [step(1), step(2, { checkpoint: { zone_id: 'zone-c', label: 'Aisle C', photo_urls: ['http://test/media/places/p/1.jpg'] } })] })
    renderWith(<MapView />, fakeStudio({ api, processes: [withPlace] }))
    await user.click(await screen.findByText('Pick and pack an order'))
    const label = screen.getByLabelText('What the glasses say for step 2')
    await user.type(label, ' · Shelf 12')
    await user.click(screen.getByRole('button', { name: 'Save the places' }))
    await waitFor(() => expect(api.saveProcess).toHaveBeenCalled())
    const sent = vi.mocked(api.saveProcess).mock.calls[0][0] as Process
    expect(sent.steps[1].checkpoint).toEqual({ zone_id: 'zone-c', label: 'Aisle C · Shelf 12', photo_urls: ['http://test/media/places/p/1.jpg'] })
  })

  it('opens a step by hand when Owl does not recognise the place', async () => {
    const user = userEvent.setup()
    const api = mapApi()
    const withPlace = process({ steps: [step(1), step(2, { checkpoint: { zone_id: 'zone-c', label: 'Aisle C · Shelf 12' } })] })
    renderWith(<MapView />, fakeStudio({ api, processes: [withPlace] }))
    await user.selectOptions(await screen.findByLabelText('Trainee'), 'emp-sami')
    await user.selectOptions(screen.getByLabelText('Step'), 'proc-1/step-2')
    await user.click(screen.getByRole('button', { name: 'Open the step' }))
    await waitFor(() => expect(api.unlockStep).toHaveBeenCalledWith('emp-sami', 'proc-1', 'step-2'))
  })
})

describe('training helpers', () => {
  it('draws a rectangle from any two corners, inside the map', () => {
    expect(rectFrom({ x: 0.5, y: 0.6 }, { x: 0.2, y: 0.1 })).toEqual({ x: 0.2, y: 0.1, w: 0.3, h: 0.5 })
    expect(rectFrom({ x: -1, y: 0.5 }, { x: 0.5, y: 2 })).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 })
  })

  it('makes ids no one else has', () => {
    expect(newId('zone', 'Aisle C', [])).toBe('zone-aisle-c')
    expect(newId('zone', 'Aisle C', ['zone-aisle-c'])).toBe('zone-aisle-c-2')
    expect(newId('plan', 'Käsittely', [])).toBe('plan-kasittely')
    expect(newId('plan', '倉庫', [], 'role')).toBe('plan-role')
  })
})
