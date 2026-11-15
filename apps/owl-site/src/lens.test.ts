import { describe, expect, it } from 'vitest'
import { SCREENS, screenFor, type LensScreen } from './lens'
import { BEATS } from './walk'

describe('the screens in her lens', () => {
  it('are each one card with a title or words, and one primary button', () => {
    for (const [id, screen] of Object.entries(SCREENS) as [string, LensScreen][]) {
      expect(Boolean(screen.title || screen.body), id).toBe(true)
      expect(screen.buttons.filter(b => b.primary), id).toHaveLength(1)
      expect(screen.buttons.length, id).toBeLessThanOrEqual(4)
      if (screen.title) expect(screen.title.length, id).toBeLessThanOrEqual(24)
    }
  })

  it('tell the Fridge 2 story, not an older one', () => {
    const words = JSON.stringify(SCREENS)
    expect(words).toContain('Fridge 2')
    for (const old of ['Oat drink', 'snack point', 'warehouse', 'Pick the items']) expect(words).not.toContain(old)
  })

  it('show nothing until she has arrived, and nothing outside or on stage', () => {
    for (const beat of BEATS) expect(screenFor(beat.id, false, 'idle'), beat.id).toBeNull()
    expect(screenFor('arrive', true, 'idle')).toBeNull()
    expect(screenFor('done', true, 'stocked')).toBeNull()
  })

  it('follow what Owl is doing at the counter and at the fridge', () => {
    expect(screenFor('counter', true, 'idle')).toBe('pick')
    expect(screenFor('correction', true, 'lift')).toBe('pick')
    expect(screenFor('correction', true, 'wrong')).toBe('wrong')
    expect(screenFor('fixed', true, 'swap')).toBe('wrong')
    expect(screenFor('fixed', true, 'check')).toBe('checking')
    expect(screenFor('fixed', true, 'done')).toBe('right')
    expect(screenFor('route', true, 'carry')).toBe('goto')
    expect(screenFor('visitor', true, 'carry')).toBe('answer')
    expect(screenFor('fridge', true, 'stow')).toBe('shelf')
    expect(screenFor('fridge', true, 'shelf-check')).toBe('checkingShelf')
    expect(screenFor('fridge', true, 'shelf-done')).toBe('stocked')
    expect(screenFor('help', true, 'stocked')).toBe('help')
  })
})
