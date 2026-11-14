import { describe, expect, it, vi } from 'vitest'
import { createPreviewApi } from './api.ts'

describe('public Studio preview', () => {
  it('supplies every admin view without a server or stored credentials', async () => {
    localStorage.setItem('owl.apiUrl', 'https://private.invalid')
    localStorage.setItem('owl.apiToken', 'must-not-be-used')
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network in preview'))
    const api = createPreviewApi()
    const values = await Promise.all([api.health(), api.processes(), api.employees(), api.docs(), api.helpSessions(), api.onShift(), api.trainingPlans(), api.trainees(), api.zones(), api.places(), api.stats(), api.assistSign()])
    expect(values.every(Boolean)).toBe(true)
    expect(api.config.token).toBe('')
    expect(api.config.baseUrl).toBe('Sample workspace')
    expect(fetch).not.toHaveBeenCalled()
    localStorage.clear()
  })

  it('keeps edits in one tab and does not mutate returned data or the next visitor’s samples', async () => {
    const first = createPreviewApi(), second = createPreviewApi()
    const person = (await first.employees())[0]
    const original = person.name
    person.name = 'Unsaved'
    expect((await first.employees())[0].name).toBe(original)
    await first.updateEmployee(person.id, { name: 'Sample edit' })
    expect((await first.employees())[0].name).toBe('Sample edit')
    expect((await second.employees())[0].name).toBe(original)
    expect((await createPreviewApi().employees())[0].name).toBe(original)
  })

  it('lets visitors review a draft and answer sample help without changing live data', async () => {
    const api = createPreviewApi()
    const draft = (await api.processes()).find(process => process.status === 'draft')!
    draft.steps.forEach(step => { step.reviewed = true })
    draft.status = 'published'
    await api.saveProcess(draft)
    expect((await api.process(draft.id)).status).toBe('published')
    const session = (await api.helpSessions())[0]
    const answer = await api.say(session.id, 'Use the blue one-litre carton.')
    expect(answer.messages.at(-1)?.text).toBe('Use the blue one-litre carton.')
    expect((await createPreviewApi().helpSessions())[0].messages).toHaveLength(1)
  })

  it('grounds sample answers in a handbook and says when it has no answer', async () => {
    const api = createPreviewApi()
    const answer = await api.ask('Where does the shipping label go?')
    expect(answer.found).toBe(true)
    expect(answer.sources[0].quote).toBe(answer.text)
    expect((await api.ask('quantum entanglement')).found).toBe(false)
  })
})
