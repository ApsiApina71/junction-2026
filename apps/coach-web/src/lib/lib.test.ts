import { describe, expect, it } from 'vitest'
import { parseSse } from './api'
import { eur, whatIfAt } from './format'
import { hasKey, t } from './i18n'
import { blocks } from './blocks'

describe('whatIfAt', () => {
  it('matches the server formula', () => {
    const w = whatIfAt(200, 25, -20, 12)
    expect(w.freedMonthly).toBeCloseTo(40)
    expect(w.newMonthly).toBeCloseTo(160)
    expect(w.freedYearly).toBeCloseTo(480)
    expect(w.fewerPurchases).toBeCloseTo(1.6)
    expect(w.extraPerWeek).toBeCloseTo((40 * 7) / 30.4375)
  })
  it('handles increases and zero tickets', () => {
    expect(whatIfAt(100, 0, 50, 12).freedMonthly).toBeCloseTo(-50)
    expect(whatIfAt(100, 0, 50, 12).fewerPurchases).toBe(0)
  })
})

describe('parseSse', () => {
  it('returns complete events and keeps the unfinished tail', () => {
    const { events, rest } = parseSse('data: {"type":"text","text":"Hei"}\n\ndata: {"type":"done"}\n\ndata: {"type":"te')
    expect(events).toEqual([{ type: 'text', text: 'Hei' }, { type: 'done' }])
    expect(rest).toBe('data: {"type":"te')
  })
  it('drops malformed events', () => {
    expect(parseSse('data: nope\n\n').events).toEqual([])
  })
})

describe('format and i18n', () => {
  it('formats euros in both languages', () => {
    expect(eur(1234.5, 'en', { cents: false })).toContain('1,23')
    expect(eur(12.5, 'fi')).toContain('12,50')
    expect(eur(40, 'en', { sign: true }).startsWith('+')).toBe(true)
  })
  it('fills variables and knows its keys', () => {
    expect(t('en', 'perDay', { amount: '€5' })).toBe('€5 a day')
    expect(t('fi', 'yearsOld', { age: 21 })).toBe('21 v')
    expect(hasKey('tool_run_sql')).toBe(true)
    expect(hasKey('tool_unknown')).toBe(false)
  })
})

describe('markdown blocks', () => {
  it('groups lists and paragraphs', () => {
    expect(blocks('Hello\n\n- a\n- b\n1. x\n2. y\n## Title')).toEqual([
      { type: 'p', text: 'Hello' },
      { type: 'ul', items: ['a', 'b'] },
      { type: 'ol', items: ['x', 'y'] },
      { type: 'p', text: '**Title**' },
    ])
  })
})
