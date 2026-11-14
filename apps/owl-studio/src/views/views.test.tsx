import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../lib/api.ts'
import type { Api } from '../lib/api.ts'
import { fakeApi, fakeStudio, helpSession, process, renderWith, sami, step } from '../test/helpers.tsx'
import type { Process } from '../lib/types.ts'
import { DataView } from './DataView.tsx'
import { HelpView } from './HelpView.tsx'
import { PeopleView } from './PeopleView.tsx'
import { TaskEditor } from './TaskEditor.tsx'
import { TasksView } from './TasksView.tsx'

const sentTask = (api: Api, call = 0) => vi.mocked(api.saveProcess).mock.calls[call][0] as Process
const stepTitles = (container: HTMLElement) => [...container.querySelectorAll('.step-pick-title')].map((el) => el.textContent)

// What Laura said while sealing a box. The last sentence is the rule that must not get lost.
const NARRATION =
  'Okay so now you take the tape and you tape the box shut along the middle seam, all the way across, press it down properly, and then the shipping label goes on the top side of the box. Never put the label over the tape.'
const FIRST_25_WORDS = NARRATION.split(' ').slice(0, 25).join(' ')

describe('reviewing a task', () => {
  it('publishes a reviewed draft, says only "Published", and then asks who learns it', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio({ employees: [{ ...sami, process_ids: [] }] })
    renderWith(<TaskEditor processId="proc-1" />, studio)

    expect(screen.getByText('Draft, needs review')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    // Published is not the same as on someone's glasses: no one has the task yet, and the editor says so.
    expect(await screen.findByText('Published, no one assigned')).toBeTruthy()
    expect(screen.getByText('Published. Now choose who learns it.')).toBeTruthy()
    const sent = sentTask(studio.api)
    expect(sent.status).toBe('published')
    expect(sent.steps.map((s) => s.index)).toEqual([1, 2, 3])
    expect(studio.putProcess).toHaveBeenCalledWith(sent)

    const learners = screen.getByRole('region', { name: 'Who learns this task' })
    expect(within(learners).getByText('A worker gets it the next time they open Owl on their glasses.')).toBeTruthy()
    await user.click(within(learners).getByLabelText(/Sami/))
    await waitFor(() => expect(studio.api.updateEmployee).toHaveBeenCalledWith('emp-sami', { process_ids: ['proc-1'] }))
    expect(studio.reload).toHaveBeenCalled()
  })

  it('removes a step, and Undo puts it back where it was', async () => {
    const user = userEvent.setup()
    const { container } = renderWith(<TaskEditor processId="proc-1" />)

    await user.click(screen.getByRole('button', { name: /Pick the items/ }))
    await user.click(screen.getByRole('button', { name: 'Remove step 2' }))
    expect(stepTitles(container)).toEqual(['Take a medium box', 'Seal and label'])

    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(stepTitles(container)).toEqual(['Take a medium box', 'Pick the items', 'Seal and label'])
    expect(screen.getByRole('heading', { name: 'Step 2 of 3' })).toBeTruthy()
  })

  it('moves a step with the arrow buttons and sends the new order', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio()
    const { container } = renderWith(<TaskEditor processId="proc-1" />, studio)

    await user.click(screen.getByRole('button', { name: 'Move step 1 down' }))
    expect(stepTitles(container)).toEqual(['Pick the items', 'Take a medium box', 'Seal and label'])

    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(studio.api.saveProcess).toHaveBeenCalled())
    const sent = sentTask(studio.api)
    expect(sent.steps.map((s) => [s.id, s.index])).toEqual([
      ['step-2', 1],
      ['step-1', 2],
      ['step-3', 3],
    ])
    expect(sent.status).toBe('draft')
  })

  it('refuses to save what the glasses cannot show: the problem is listed in the page and the cursor goes to the field', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio()
    renderWith(<TaskEditor processId="proc-1" />, studio)

    const title = screen.getByLabelText('Title')
    await user.type(title, ' and put the order sheet on top of it')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(studio.api.saveProcess).not.toHaveBeenCalled()
    const problems = screen.getByRole('region', { name: 'Before this can be published' })
    expect(within(problems).getByRole('button', { name: /Step 1: the title is \d+ characters\. The glasses fit 32\./ })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(title))
  })

  it('does not publish text that was cut from a long narration until a person rewrites it and marks the step reviewed', async () => {
    const user = userEvent.setup()
    const recorded = process({
      steps: [
        step(1, {
          title: 'Tape the box and label it',
          instruction: `${NARRATION.slice(0, 139)}…`,
          say: 'Tape the box shut and put the label on top.',
          check: { kind: 'none', criteria: [], order_lines: null },
          source: { doc: "Laura's recording", quote: NARRATION },
          reviewed: false,
        }),
      ],
    })
    const studio = fakeStudio({ processes: [recorded] })
    renderWith(<TaskEditor processId="proc-1" />, studio)

    // The written instruction lost the last rule; everything Laura said is beside it.
    const instruction = screen.getByLabelText('Instruction on the display') as HTMLTextAreaElement
    expect(instruction.value).not.toContain('Never put the label over the tape.')
    const recording = screen.getByRole('group', { name: "Laura's recording of this step" })
    expect(within(recording).getByText('What Laura said')).toBeTruthy()
    expect(within(recording).getByText(/Never put the label over the tape\./)).toBeTruthy()

    // The step is marked as needing a person, and the task cannot be published.
    expect(screen.getByText('Cut text, needs rewriting')).toBeTruthy()
    expect(screen.getByText('This step needs you.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(studio.api.saveProcess).not.toHaveBeenCalled()
    const problems = screen.getByRole('region', { name: 'Before this can be published' })
    expect(within(problems).getByRole('button', { name: /Step 1: the instruction was cut to fit and ends in "…"/ })).toBeTruthy()
    expect(within(problems).getByRole('button', { name: 'Step 1: read it against what Laura said, then mark it reviewed.' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(instruction))

    // Cut text cannot be called reviewed.
    await user.click(screen.getByRole('button', { name: 'Mark step reviewed' }))
    expect(screen.getByRole('alert').textContent).toBe('The instruction still ends in "…". Rewrite it in full first.')
    expect(screen.getByText('This step needs you.')).toBeTruthy()

    // Rewritten in full and marked by the reviewer, it publishes.
    await user.clear(instruction)
    await user.type(instruction, 'Tape the box shut along the seam. Put the label on top, never over the tape.')
    await user.click(screen.getByRole('button', { name: 'Mark step reviewed' }))
    expect(screen.queryByText('This step needs you.')).toBeNull()
    expect(screen.getByText('Reviewed')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(studio.api.saveProcess).toHaveBeenCalledTimes(1))
    const sent = sentTask(studio.api).steps[0]
    expect(sent.instruction).toBe('Tape the box shut along the seam. Put the label on top, never over the tape.')
    expect(sent.reviewed).toBe(true)
    expect(sent.source?.quote).toBe(NARRATION)
  })

  it('does not take editing for reviewing: a spoken sentence that silently lost the rule blocks publishing until the step is marked', async () => {
    const user = userEvent.setup()
    // The reviewer already rewrote the title and the instruction. What Owl says is still the first 25 words of the
    // narration, cut with no "…", so "Never put the label over the tape." is missing from it.
    const recorded = process({
      steps: [
        step(1, {
          title: 'Tape the box and label it',
          instruction: 'Tape the box shut along the seam. Put the label on top, never over the tape.',
          say: FIRST_25_WORDS,
          check: { kind: 'none', criteria: [], order_lines: null },
          source: { doc: "Laura's recording", quote: NARRATION },
          reviewed: false,
        }),
      ],
    })
    const studio = fakeStudio({ processes: [recorded] })
    renderWith(<TaskEditor processId="proc-1" />, studio)

    expect(FIRST_25_WORDS).not.toContain('Never put the label over the tape.')
    // The hint names the field and says what is wrong with it.
    expect(screen.getByText('These are the first 25 words of what Laura said, and Laura said more. Write one whole sentence for Owl to say.')).toBeTruthy()
    expect((screen.getByLabelText('What Owl says') as HTMLTextAreaElement).getAttribute('aria-describedby')).toBe('step-say-hint')

    // Editing a field is not a review.
    await user.type(screen.getByLabelText('Title'), ' now')
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(studio.api.saveProcess).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Step 1: read it against what Laura said, then mark it reviewed.' })).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Mark step reviewed' })))

    // The reviewer writes the whole sentence and says the step is reviewed. Only then does it publish.
    const say = screen.getByLabelText('What Owl says')
    await user.clear(say)
    await user.type(say, 'Tape the box shut, then put the label on top. Never put the label over the tape.')
    expect(screen.queryByText(/These are the first/)).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Mark step reviewed' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(studio.api.saveProcess).toHaveBeenCalledTimes(1))
    expect(sentTask(studio.api).steps[0].say).toContain('Never put the label over the tape.')
    expect(sentTask(studio.api).steps[0].reviewed).toBe(true)
  })

  it('keeps publishing blocked until every step has been marked reviewed', async () => {
    const user = userEvent.setup()
    const recorded = process({ steps: [step(1, { reviewed: false }), step(2, { reviewed: false }), step(3)] })
    const studio = fakeStudio({ processes: [recorded] })
    renderWith(<TaskEditor processId="proc-1" />, studio)

    expect(screen.getByText(/2 of 3 to review/)).toBeTruthy()
    expect(screen.getAllByText('Needs your review')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Mark step reviewed' }))
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(studio.api.saveProcess).not.toHaveBeenCalled()
    // Publish took the reviewer to the step that is still waiting.
    expect(await screen.findByRole('heading', { name: 'Step 2 of 3' })).toBeTruthy()
    expect(screen.getByText(/1 of 3 to review/)).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Mark step reviewed' }))
    expect(screen.getByText(/every step reviewed/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(studio.api.saveProcess).toHaveBeenCalledTimes(1))
    expect(sentTask(studio.api).steps.map((s) => s.reviewed)).toEqual([true, true, true])
  })

  it('shows the server\'s own sentence if it still refuses to publish', async () => {
    const user = userEvent.setup()
    const refusal = 'Review every step before publishing. Not reviewed yet: step 2.'
    const api = fakeApi({ saveProcess: vi.fn(async () => Promise.reject(new ApiError('server', refusal, 422))) })
    renderWith(<TaskEditor processId="proc-1" />, fakeStudio({ api }))

    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText(refusal)).toBeTruthy()
    expect(screen.getByText('Draft, needs review')).toBeTruthy()
  })

  it('still lets a half reviewed draft be saved, with its steps still marked as not reviewed', async () => {
    const user = userEvent.setup()
    const recorded = process({ steps: [step(1, { instruction: 'First you take a medium box from the stack by the door and you put the order sheet on…', reviewed: false })] })
    const studio = fakeStudio({ processes: [recorded] })
    renderWith(<TaskEditor processId="proc-1" />, studio)

    await user.click(screen.getByRole('button', { name: 'Edit name and language' }))
    await user.type(screen.getByLabelText('In one sentence'), ' Recorded on Friday.')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(studio.api.saveProcess).toHaveBeenCalledTimes(1))
    expect(sentTask(studio.api).status).toBe('draft')
    expect(sentTask(studio.api).steps[0].reviewed).toBe(false)
  })

  it('makes adding a check the obvious next step on a step Owl does not check', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio({ processes: [process({ steps: [step(1, { check: { kind: 'none', criteria: [], order_lines: null } })] })] })
    renderWith(<TaskEditor processId="proc-1" />, studio)

    expect(screen.getByText('Owl does not check this step yet.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add what Owl should check' }))
    const first = screen.getByLabelText('Thing to look for 1')
    expect(document.activeElement).toBe(first)
    await user.type(first, 'The box is taped shut')
    await user.click(screen.getByRole('button', { name: 'Publish' }))

    await waitFor(() => expect(studio.api.saveProcess).toHaveBeenCalled())
    expect(sentTask(studio.api).steps[0].check).toEqual({ kind: 'visual', criteria: ['The box is taped shut'], order_lines: null })
  })

  it('keeps the name, sentence and language folded away until asked, and lets the reviewer correct the language Owl guessed', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio()
    renderWith(<TaskEditor processId="proc-1" />, studio)

    expect(screen.getByRole('heading', { level: 1, name: 'Pick and pack an order' })).toBeTruthy()
    expect(screen.queryByLabelText('Language of this task')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Edit name and language' }))
    await user.selectOptions(screen.getByLabelText('Language of this task'), 'fi')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(studio.api.saveProcess).toHaveBeenCalled())
    expect(sentTask(studio.api).language).toBe('fi')
  })
})

describe('the task list', () => {
  it('lets the badge carry the status and keeps the line under the name short', () => {
    renderWith(<TasksView />)
    expect(screen.getByText('Draft, needs review')).toBeTruthy()
    expect(screen.getByText('3 steps · Recorded by Laura')).toBeTruthy()
  })

  it('says who learns a published task, and says so when no one does', () => {
    const tasks = [process({ id: 'proc-1', status: 'published' }), process({ id: 'proc-2', title: 'Bake rye bread', status: 'published' })]
    renderWith(<TasksView />, fakeStudio({ processes: tasks }))
    expect(screen.getByText('3 steps · Recorded by Laura · Sami learns it')).toBeTruthy()
    expect(screen.getByText('Published')).toBeTruthy()
    expect(screen.getByText('Published, no one assigned')).toBeTruthy()
  })

  it('names the workplace when the server holds more than one', () => {
    const tasks = [process({ id: 'proc-1' }), process({ id: 'proc-2', title: 'Bake rye bread', company: 'Leipomo Ruis' })]
    renderWith(<TasksView />, fakeStudio({ processes: tasks }))
    expect(screen.getByText('Leipomo Ruis · 3 steps · Recorded by Laura')).toBeTruthy()
    expect(screen.getByText('Kide Logistics · 3 steps · Recorded by Laura')).toBeTruthy()
  })

  it('shows a recording while Owl writes its steps', async () => {
    const api = fakeApi({ recordings: vi.fn(async () => [{ id: 'rec-2', title: 'Restock the oat shelf', expert: 'Laura', status: 'processing', steps: [{ index: 1, narration: '', photo_url: null, clip_url: null }], process_id: null }]) })
    renderWith(<TasksView />, fakeStudio({ api }))
    expect(await screen.findByText('Owl is writing the steps')).toBeTruthy()
    expect(screen.getByText('Restock the oat shelf')).toBeTruthy()
  })
})

describe('helping a worker', () => {
  it('sends the message with the spot the expert pointed at', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio({ sessions: [helpSession()] })
    renderWith(<HelpView selectedId="help-1" />, studio)

    const frame = await screen.findByRole('button', { name: /What Sami sees/ })
    const picture = frame.querySelector('img') as HTMLImageElement
    picture.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300, right: 400, bottom: 300, x: 0, y: 0, toJSON: () => ({}) })
    fireEvent.click(frame, { clientX: 100, clientY: 75, detail: 1 })
    expect(screen.getByText('Pointing at the picture')).toBeTruthy()

    await user.type(screen.getByLabelText('Message to Sami'), 'The blue carton, top shelf')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(studio.api.say).toHaveBeenCalledWith('help-1', 'The blue carton, top shelf', { x: 0.25, y: 0.25 }))
    // The marked picture comes back in the conversation, and the mark is used up.
    expect(await screen.findByAltText('The picture with a ring where you pointed')).toBeTruthy()
    expect(screen.queryByText('Pointing at the picture')).toBeNull()
  })

  it('sends a quick reply in one click, without a mark', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio({ sessions: [helpSession()] })
    renderWith(<HelpView selectedId="help-1" />, studio)

    await user.click(await screen.findByRole('button', { name: 'Move closer' }))
    await waitFor(() => expect(studio.api.say).toHaveBeenCalledWith('help-1', 'Move closer', null))
  })

  it('says honestly when the picture is stale', async () => {
    const stale = helpSession({ frame_at: new Date(Date.now() - 20000).toISOString() })
    const api = fakeApi({ helpSession: vi.fn(async () => stale) })
    renderWith(<HelpView selectedId="help-1" />, fakeStudio({ api, sessions: [stale] }))
    expect(await screen.findByText(/No picture for 2\d s\. The glasses may be off or out of range\./)).toBeTruthy()
  })

  it('lists who is waiting, and rests when no one is', () => {
    const { unmount } = renderWith(<HelpView selectedId={null} />, fakeStudio({ sessions: [helpSession()] }))
    expect(screen.getByText('Sami')).toBeTruthy()
    expect(screen.getByText(/^Waiting \d+ s$/)).toBeTruthy()
    unmount()
    renderWith(<HelpView selectedId={null} />, fakeStudio({ sessions: [] }))
    expect(screen.getByText('No one is waiting')).toBeTruthy()
  })
})

describe('adding a person', () => {
  it('sends the name, language, task and glasses, and leaves the welcome to Owl', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio()
    renderWith(<PeopleView selectedId="new" />, studio)

    await user.type(screen.getByLabelText('Name'), 'Aino')
    await user.type(screen.getByLabelText('Job'), 'Packer')
    await user.selectOptions(screen.getByLabelText('Language'), 'fi')
    await user.click(screen.getByLabelText(/Pick and pack an order/))
    await user.selectOptions(screen.getByLabelText('Glasses'), 'glasses-1')
    // Sami has that pair, and the form says what saving does about it.
    expect(screen.getByText('Sami has this pair now. Saving gives it to Aino and leaves Sami without glasses.')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Add this person' }))
    await waitFor(() => expect(studio.api.addEmployee).toHaveBeenCalledWith({ name: 'Aino', language: 'fi', role: 'Packer', process_ids: ['proc-1'], glasses_id: 'glasses-1' }))
    expect(studio.reload).toHaveBeenCalled()
  })

  it('asks for a name before adding anyone', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio()
    renderWith(<PeopleView selectedId="new" />, studio)

    await user.click(screen.getByRole('button', { name: 'Add this person' }))
    expect(studio.api.addEmployee).not.toHaveBeenCalled()
    expect(screen.getByText('Write the name Owl should greet them by.')).toBeTruthy()
  })

  it('sends a hand-written welcome only when it was changed, and can hand it back to Owl', async () => {
    const user = userEvent.setup()
    const studio = fakeStudio()
    renderWith(<PeopleView selectedId="emp-sami" />, studio)

    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(studio.api.updateEmployee).toHaveBeenCalledTimes(1))
    expect(vi.mocked(studio.api.updateEmployee).mock.calls[0][1]).not.toHaveProperty('welcome')

    await user.click(screen.getByRole('button', { name: "Use Owl's wording" }))
    await waitFor(() => expect(studio.api.updateEmployee).toHaveBeenCalledTimes(2))
    expect(vi.mocked(studio.api.updateEmployee).mock.calls[1]).toEqual(['emp-sami', { welcome: '' }])
  })
})

describe('where the data goes', () => {
  it('names the model and keeps apart what Owl controls and what follows others\' terms', async () => {
    renderWith(<DataView />)

    const server = screen.getByRole('region', { name: 'On your Owl server' })
    expect(within(server).getByText('Owl controls this')).toBeTruthy()
    expect(within(server).getByText(/Never saved\. The server reads the picture, sends it to the model and drops it\./)).toBeTruthy()

    const model = screen.getByRole('region', { name: 'Sent to the AI model' })
    expect(within(model).getByText("The model provider's terms apply")).toBeTruthy()
    expect(within(model).getByText('test-model')).toBeTruthy()
    expect(within(model).getByText(/Owl cannot see that and does not promise it\./)).toBeTruthy()

    const meta = screen.getByRole('region', { name: 'Meta and the glasses' })
    expect(within(meta).getByText('Owl does not send task data, pictures or documents to a Meta model.')).toBeTruthy()
    expect(within(meta).getByText(/follows Meta's terms, not Owl's\./)).toBeTruthy()
    expect(screen.queryByText(/Nothing from Owl/)).toBeNull()
  })

  it('says what the server keeps about each worker\'s learning, and that hiding it here is not a lock', async () => {
    renderWith(<DataView />)

    const server = screen.getByRole('region', { name: 'On your Owl server' })
    expect(within(server).getByText(/The run is linked to the worker when\s+the glasses say who is wearing them\./)).toBeTruthy()
    expect(within(server).getByText(/Held in the server's memory, gone when the server restarts\./)).toBeTruthy()

    const limits = screen.getByRole('region', { name: 'Limits you should know' })
    expect(within(limits).getByText(/That is how these screens are made, not a lock/)).toBeTruthy()
    expect(within(limits).getByText(/anyone who has it can read one\s+worker's runs from the server\./)).toBeTruthy()

    // Studio itself shows totals only, and says what they are.
    expect(await screen.findByText('Workers who have used Owl')).toBeTruthy()
    expect(screen.getByText('4 min')).toBeTruthy()
    expect(screen.getByText('For everyone together, without names, since the server last started.')).toBeTruthy()
    expect(screen.queryByText(/no log|no record of who|only the worker/i)).toBeNull()
  })
})
