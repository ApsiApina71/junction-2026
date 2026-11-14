import { describe, expect, it, vi } from 'vitest'
import { helpSession, process, sami } from '../test/helpers.tsx'
import { ApiError, createApi, detailOf } from './api.ts'
import { fileProblem, glassesName, lengthText } from './docs.ts'
import { languageName, speechLocale, writesWelcome } from './languages.ts'
import { CENTER, markFromPoint, markPosition, nudgeMark } from './mark.ts'
import { href, parseRoute } from './route.ts'
import { activity, whereText } from './studio.ts'
import type { Connection } from './studio.ts'
import { duration, freshness, secondsSince, timeAgo } from './time.ts'

const NOW = Date.parse('2026-11-14T10:00:00+02:00')
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString()

describe('time, as a shift lead would say it', () => {
  it('counts seconds since a moment, and never below zero', () => {
    expect(secondsSince(ago(40), NOW)).toBe(40)
    expect(secondsSince(new Date(NOW + 5000).toISOString(), NOW)).toBe(0)
    expect(secondsSince(null, NOW)).toBeNull()
    expect(secondsSince('not a date', NOW)).toBeNull()
  })

  it('says durations in the largest useful unit', () => {
    expect(duration(40)).toBe('40 s')
    expect(duration(180)).toBe('3 min')
    expect(duration(3900)).toBe('1 h 5 min')
    expect(duration(7200)).toBe('2 h')
  })

  it('says how long ago', () => {
    expect(timeAgo(ago(2), NOW)).toBe('just now')
    expect(timeAgo(ago(40), NOW)).toBe('40 s ago')
    expect(timeAgo(ago(200), NOW)).toBe('3 min ago')
    expect(timeAgo(null, NOW)).toBe('')
  })

  it('tells a live picture from a stale one, honestly', () => {
    expect(freshness(ago(0), NOW)).toEqual({ live: true, text: 'Live, now' })
    expect(freshness(ago(2), NOW)).toEqual({ live: true, text: 'Live, 2 s ago' })
    expect(freshness(ago(6), NOW)).toEqual({ live: true, text: 'Live, 6 s ago' })
    expect(freshness(ago(20), NOW)).toEqual({ live: false, text: 'No picture for 20 s' })
    expect(freshness(ago(150), NOW)).toEqual({ live: false, text: 'No picture for 2 min' })
    expect(freshness(null, NOW)).toEqual({ live: false, text: 'No picture yet' })
  })
})

describe('pointing at the worker\'s view', () => {
  const box = { left: 100, top: 50, width: 400, height: 300 }

  it('turns a click into a share of the picture', () => {
    expect(markFromPoint(200, 125, box)).toEqual({ x: 0.25, y: 0.25 })
    expect(markFromPoint(500, 350, box)).toEqual({ x: 1, y: 1 })
  })

  it('keeps a click outside the picture on its edge', () => {
    expect(markFromPoint(20, 900, box)).toEqual({ x: 0, y: 1 })
  })

  it('has no mark for a picture without a size', () => {
    expect(markFromPoint(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })

  it('moves with the arrow keys and stays inside', () => {
    expect(nudgeMark(CENTER, 0.02, 0)).toEqual({ x: 0.52, y: 0.5 })
    expect(nudgeMark({ x: 0.99, y: 0.01 }, 0.1, -0.1)).toEqual({ x: 1, y: 0 })
  })

  it('places the ring in percent', () => {
    expect(markPosition({ x: 0.25, y: 0.5 })).toEqual({ left: '25%', top: '50%' })
  })
})

describe('files Owl can read', () => {
  it('takes markdown, text and PDF up to 10 MB', () => {
    expect(fileProblem('handbook.md', 2400)).toBeNull()
    expect(fileProblem('RULES.PDF', 9 * 1024 * 1024)).toBeNull()
  })

  it('says what is wrong and what to do about it', () => {
    expect(fileProblem('handbook.docx', 2400)).toBe('Owl reads .md, .txt and .pdf files, and handbook.docx is a .docx file. Save it as a PDF and add that.')
    expect(fileProblem('big.pdf', 14 * 1024 * 1024)).toBe('big.pdf is 14 MB, and Owl takes files up to 10 MB. Split it into parts, or save it without large pictures.')
    expect(fileProblem('empty.txt', 0)).toBe('empty.txt is empty. Check the file and add it again.')
    expect(fileProblem('README', 10)).toContain('not a kind of file Owl knows')
  })

  it('says sizes and glasses in plain words', () => {
    expect(lengthText(2400)).toBe('2,400 characters')
    expect(lengthText(1)).toBe('1 character')
    expect(glassesName('glasses-2')).toBe('Glasses 2')
    expect(glassesName('front-desk')).toBe('front-desk')
  })
})

describe('languages', () => {
  it('names a language in itself first', () => {
    expect(languageName('fi')).toBe('Suomi (Finnish)')
    expect(languageName('en')).toBe('English')
    expect(languageName('fi-FI')).toBe('Suomi (Finnish)')
    expect(languageName('xx')).toBe('xx')
  })

  it('knows which welcomes Owl writes itself', () => {
    expect(writesWelcome('fi')).toBe(true)
    expect(writesWelcome('uk')).toBe(false)
    expect(speechLocale('uk')).toBe('uk-UA')
  })
})

describe('addresses of the views', () => {
  it('reads the part after #', () => {
    expect(parseRoute('#/help/help-1')).toEqual({ view: 'help', id: 'help-1' })
    expect(parseRoute('#/people')).toEqual({ view: 'people', id: null })
    expect(parseRoute('')).toEqual({ view: 'tasks', id: null })
    expect(parseRoute('#/nowhere')).toEqual({ view: 'tasks', id: null })
  })

  it('writes them back the same way', () => {
    expect(href('tasks', 'proc pick')).toBe('#/tasks/proc%20pick')
    expect(parseRoute(href('tasks', 'proc pick')).id).toBe('proc pick')
    expect(href('data')).toBe('#/data')
  })
})

describe('the line under the owl', () => {
  const online: Connection = { state: 'online', message: '' }

  it('lights the lamp when a worker asks for help, with the alert owl', () => {
    const now = activity(online, [helpSession()], [sami], [process()])
    expect(now).toEqual({ tone: 'needs-you', text: 'Sami is asking for help', owl: 'alert', helpId: 'help-1' })
  })

  it('counts several requests', () => {
    const now = activity(online, [helpSession(), helpSession({ id: 'help-2' })], [sami], [process()])
    expect(now.text).toBe('2 people are asking for help')
  })

  it('says who is being helped and on which step, with the watching owl', () => {
    const now = activity(online, [helpSession({ status: 'connected' })], [sami], [process()])
    expect(now).toEqual({ tone: 'calm', text: 'Sami is on step 2, with your help', owl: 'watching', helpId: 'help-1' })
  })

  it('rests when no one asks, and only claims what the server knows', () => {
    expect(activity(online, [helpSession({ status: 'ended' })], [sami], [process()])).toEqual({ tone: 'calm', text: 'No one needs help right now', owl: 'resting', helpId: null })
  })

  it('is unsure when the server cannot be reached', () => {
    expect(activity({ state: 'offline', message: 'x' }, null, null, null).owl).toBe('unsure')
    expect(activity({ state: 'unauthorized', message: 'x' }, null, null, null).text).toBe('The server needs an access token')
  })

  it('describes where a request comes from as far as it says', () => {
    expect(whereText(helpSession(), [process()])).toBe('Pick and pack an order · Step 2: Pick the items')
    expect(whereText(helpSession({ step_id: null }), [process()])).toBe('Pick and pack an order')
    expect(whereText(helpSession({ process_id: null }), [process()])).toBe('Not in a task')
  })
})

describe('the server client', () => {
  const answer = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response
  const config = { baseUrl: 'http://owl.test', token: '' }

  it('says the server did not answer when the request never arrives', async () => {
    const api = createApi(config, async () => {
      throw new TypeError('Failed to fetch')
    })
    const error = await api.health().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).kind).toBe('offline')
    expect((error as ApiError).message).toBe("Owl's server did not answer at http://owl.test. Check that it is running, then try again.")
  })

  it('tells a refused token from a missing thing from a server error', async () => {
    const refused = await createApi(config, async () => answer(401, { detail: 'Missing or wrong API token.' }))
      .processes()
      .catch((e: unknown) => e)
    expect((refused as ApiError).kind).toBe('unauthorized')
    expect((refused as ApiError).message).toContain('access token')

    const missing = await createApi(config, async () => answer(404, { detail: 'No process proc-9.' }))
      .process('proc-9')
      .catch((e: unknown) => e)
    expect((missing as ApiError).kind).toBe('not_found')
    expect((missing as ApiError).message).toBe('No process proc-9.')

    const broken = await createApi(config, async () => answer(503, { detail: 'Cannot reach the model.' }))
      .ask('What if an item is out of stock?')
      .catch((e: unknown) => e)
    expect((broken as ApiError).kind).toBe('server')
    expect((broken as ApiError).status).toBe(503)
    expect((broken as ApiError).message).toBe('Cannot reach the model.')
  })

  it('reads the list of field problems of a 422', async () => {
    const body = { detail: [{ loc: ['body', 'name'], msg: 'String should have at least 1 character' }] }
    expect(detailOf(body)).toBe('name: String should have at least 1 character')
    const error = await createApi(config, async () => answer(422, body))
      .addEmployee({ name: '', language: 'fi' })
      .catch((e: unknown) => e)
    expect((error as ApiError).message).toBe('name: String should have at least 1 character')
  })

  it('falls back to a plain sentence when the server says nothing', async () => {
    const error = await createApi(config, async () => answer(500, null))
      .docs()
      .catch((e: unknown) => e)
    expect((error as ApiError).message).toBe('The server answered with an error (500). Try again in a moment.')
  })

  it('sends the token only when there is one', async () => {
    const seen: (string | null)[] = []
    const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers).get('X-Api-Token'))
      return answer(200, { employees: [sami] })
    })
    await createApi(config, fetchFn).employees()
    await createApi({ ...config, token: 'venue-secret' }, fetchFn).employees()
    expect(seen).toEqual([null, 'venue-secret'])
  })

  it('saves a task with a plain PUT, never as a translation', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => answer(200, process({ language: 'fi' })))
    await createApi(config, fetchFn).saveProcess(process({ language: 'fi' }))
    const [url, init] = fetchFn.mock.calls[0]
    expect(url).toBe('http://owl.test/processes/proc-1')
    expect(init?.method).toBe('PUT')
    expect(JSON.parse(init?.body as string).language).toBe('fi')
  })

  it('sends a mark with a message only when the expert pointed', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => answer(200, helpSession()))
    const api = createApi(config, fetchFn)
    await api.say('help-1', 'The blue carton', { x: 0.42, y: 0.31 })
    await api.say('help-1', 'Move closer')
    expect(JSON.parse(fetchFn.mock.calls[0][1]?.body as string)).toEqual({ from: 'expert', text: 'The blue carton', mark: { x: 0.42, y: 0.31 } })
    expect(JSON.parse(fetchFn.mock.calls[1][1]?.body as string)).toEqual({ from: 'expert', text: 'Move closer' })
    expect(fetchFn.mock.calls[0][0]).toBe('http://owl.test/help/help-1/say')
  })

  it('answers nothing for a delete', async () => {
    const fetchFn = vi.fn(async (_url: string, _init?: RequestInit) => answer(204))
    await expect(createApi(config, fetchFn).deleteDoc('doc-handbook')).resolves.toBeUndefined()
    expect(fetchFn.mock.calls[0][1]?.method).toBe('DELETE')
  })
})
