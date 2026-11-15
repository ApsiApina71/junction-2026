import { describe, expect, it } from 'vitest'
import { HANDBOOK, glassesAside, itemTiming } from './intro'
import { PUT_ON, wearProgress } from './walk'

describe('the handbook intro', () => {
  it('lists a few short items under one title', () => {
    expect(HANDBOOK.items.length).toBeGreaterThanOrEqual(4)
    expect(HANDBOOK.items.length).toBeLessThanOrEqual(6)
    for (const item of HANDBOOK.items) {
      expect(item.title.length, item.title).toBeLessThanOrEqual(16)
      expect(item.detail.length, item.title).toBeLessThanOrEqual(32)
    }
  })

  it('shows the whole list before any item streams into the glasses', () => {
    HANDBOOK.items.forEach((_, i) => {
      expect(itemTiming(i, 0).appear, `item ${i}`).toBe(0)
      expect(itemTiming(i, PUT_ON.CARDS).appear, `item ${i}`).toBe(1)
      expect(itemTiming(i, PUT_ON.CARDS).flight, `item ${i}`).toBe(0)
    })
  })

  it('has every item in the glasses, top one first, before they start to go on', () => {
    HANDBOOK.items.forEach((_, i) => {
      expect(itemTiming(i, PUT_ON.STREAMED - 0.005).flight, `item ${i}`).toBe(1)
      if (i > 0) expect(itemTiming(i, PUT_ON.CARDS + 0.05).flight).toBeLessThanOrEqual(itemTiming(i - 1, PUT_ON.CARDS + 0.05).flight)
    })
    expect(wearProgress(PUT_ON.STREAMED)).toBe(0)
  })

  it('moves the glasses aside only while the handbook is open', () => {
    expect(glassesAside(0)).toBe(0)
    expect(glassesAside(PUT_ON.CARDS)).toBe(1)
    expect(glassesAside(PUT_ON.STREAMED)).toBe(1)
    expect(glassesAside(PUT_ON.STREAMED + 0.1)).toBe(0)
    expect(glassesAside(1)).toBe(0)
  })
})

describe('wearProgress', () => {
  it('runs from the end of the stream to the end of the put-on', () => {
    expect(wearProgress(0)).toBe(0)
    expect(wearProgress(PUT_ON.STREAMED)).toBe(0)
    expect(wearProgress((PUT_ON.STREAMED + 1) / 2)).toBeCloseTo(0.5)
    expect(wearProgress(1)).toBe(1)
    expect(wearProgress(2)).toBe(1)
  })
})
