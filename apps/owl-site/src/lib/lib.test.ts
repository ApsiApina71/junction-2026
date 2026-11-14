import { describe, expect, it } from 'vitest'
import { isGlb } from './assets'
import { HUD_CYCLE_MS, HUD_FRAMES, hudFrameAt } from './hud'
import { easeInOutCubic } from './motion'

describe('isGlb', () => {
  it('accepts the glTF magic', () => {
    const bytes = new Uint8Array(12)
    bytes.set([0x67, 0x6c, 0x54, 0x46])
    expect(isGlb(bytes.buffer)).toBe(true)
  })

  it('rejects an HTML fallback page', () => {
    expect(isGlb(new TextEncoder().encode('<!doctype html><html>').buffer as ArrayBuffer)).toBe(false)
  })
})

describe('hudFrameAt', () => {
  it('starts at the first frame and moves on after its duration', () => {
    expect(hudFrameAt(0)).toBe(0)
    expect(hudFrameAt(HUD_FRAMES[0].ms)).toBe(1)
  })

  it('loops', () => {
    expect(hudFrameAt(HUD_CYCLE_MS)).toBe(0)
    expect(hudFrameAt(HUD_CYCLE_MS - 1)).toBe(HUD_FRAMES.length - 1)
  })

  it('shows a warning before the step is done', () => {
    const tones = HUD_FRAMES.map((f) => f.tone)
    expect(tones.indexOf('warning')).toBeLessThan(tones.indexOf('ok'))
  })
})

describe('easeInOutCubic', () => {
  it('runs from 0 to 1 and clamps', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5)
    expect(easeInOutCubic(2)).toBe(1)
  })
})
