import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { fakeApi, fakeStudio, helpSession, renderWith, sami } from '../test/helpers.tsx'
import { HelpView } from './HelpView.tsx'
import { PeopleView } from './PeopleView.tsx'

const mika = { ...sami, id: 'emp-mika', name: 'Mika', role: 'Shift manager', process_ids: [], glasses_id: 'glasses-7', shift_manager: true }

describe('the manager on shift (JUN-100)', () => {
  it('sets who is on shift', async () => {
    const user = userEvent.setup()
    const api = fakeApi({ onShift: vi.fn(async () => []), setOnShift: vi.fn(async (company, id) => [{ company, employee_id: id, name: 'Mika' }]) })
    renderWith(<PeopleView selectedId={null} />, fakeStudio({ api, employees: [sami, mika] }))
    await user.click(await screen.findByRole('button', { name: /^Manager on shift/ }))
    await user.click(screen.getByRole('radio', { name: /^Mika/ }))
    await waitFor(() => expect(api.setOnShift).toHaveBeenCalledWith('Kide Logistics', 'emp-mika'))
    expect(await screen.findByText('Mika is on shift. Help calls ring their glasses first.')).toBeTruthy()
  })

  it('marks a person as a shift manager', async () => {
    const user = userEvent.setup()
    const api = fakeApi({ onShift: vi.fn(async () => []) })
    renderWith(<PeopleView selectedId="emp-sami" />, fakeStudio({ api, employees: [sami] }))
    await user.click(screen.getByRole('switch', { name: /^Shift manager/ }))
    await user.click(screen.getByRole('button', { name: /Save/ }))
    await waitFor(() => expect(api.updateEmployee).toHaveBeenCalledWith('emp-sami', expect.objectContaining({ shift_manager: true })))
  })

  it('shows a call on the manager\'s glasses without opening its live view here', async () => {
    const ringing = helpSession({ id: 'help-2', status: 'ringing', routed: 'manager', assignee: 'emp-mika', assignee_name: 'Mika' })
    const missed = helpSession({ id: 'help-3', status: 'waiting', routed: 'studio', assignee_name: 'Mika', fallback: 'no_answer' })
    renderWith(<HelpView selectedId={null} />, fakeStudio({ sessions: [ringing, missed], employees: [sami, mika] }))
    expect(screen.getByText('Calling Mika')).toBeTruthy()
    expect(screen.getByText(/Mika did not answer/)).toBeTruthy()
    // The call is the manager's: it is shown, but it opens nothing here.
    expect(screen.getByText('Calling Mika').closest('[role="button"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Mika did not answer/ })).toBeTruthy()
  })

  it('keeps the live view of an answered call for the manager', async () => {
    const accepted = helpSession({ status: 'accepted', routed: 'manager', assignee: 'emp-mika', assignee_name: 'Mika' })
    const api = fakeApi({ helpSession: vi.fn(async () => accepted) })
    renderWith(<HelpView selectedId="help-1" />, fakeStudio({ api, sessions: [accepted] }))
    expect(await screen.findByText(/Mika is helping on their own glasses/)).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })
})

describe('the manager answers on the phone (JUN-107)', () => {
  const phoneCall = helpSession({ status: 'ringing', routed: 'manager', assignee: 'emp-mika', assignee_name: 'Mika', answers_on: 'phone' })

  it('lists the call as one to answer here', () => {
    renderWith(<HelpView selectedId={null} />, fakeStudio({ sessions: [phoneCall], employees: [sami, mika] }))
    expect(screen.getByText('Calling Mika: answer here')).toBeTruthy()
  })

  it('answers as Mika, then talks as the manager', async () => {
    const user = userEvent.setup()
    const accepted = { ...phoneCall, status: 'accepted' as const }
    const api = fakeApi({
      helpSession: vi.fn(async () => phoneCall),
      acceptHelp: vi.fn(async () => accepted),
      say: vi.fn(async () => accepted),
    })
    renderWith(<HelpView selectedId="help-1" />, fakeStudio({ api, sessions: [phoneCall], employees: [sami, mika] }))
    await user.click(await screen.findByRole('button', { name: 'Answer as Mika' }))
    await waitFor(() => expect(api.acceptHelp).toHaveBeenCalledWith('help-1', 'emp-mika'))
    const field = await screen.findByLabelText('Message to Sami')
    await user.type(field, 'Take the one on the left.{Enter}')
    await waitFor(() => expect(api.say).toHaveBeenCalledWith('help-1', 'Take the one on the left.', null, 'manager'))
  })

  it('can say Later, and the call goes to Studio', async () => {
    const user = userEvent.setup()
    const api = fakeApi({ helpSession: vi.fn(async () => phoneCall), laterHelp: vi.fn(async () => ({ ...phoneCall, status: 'waiting', routed: 'studio', fallback: 'later' })) })
    renderWith(<HelpView selectedId="help-1" />, fakeStudio({ api, sessions: [phoneCall], employees: [sami, mika] }))
    await user.click(await screen.findByRole('button', { name: 'Later' }))
    await waitFor(() => expect(api.laterHelp).toHaveBeenCalledWith('help-1', 'emp-mika'))
  })
})
