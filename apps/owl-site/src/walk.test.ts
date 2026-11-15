import { describe, expect, it } from 'vitest'
import { BEATS, DWELL, INTRO_SCREENS, LEAD_SCREENS, PUT_ON_SCREENS, STOP_SCREENS, WALK_SCREENS, alongPath, beatAt, leadProgress, legAt, putOnProgress, stopIndex } from './walk'

describe('BEATS', () => {
  it('keeps unique ids and one short line per stop', () => {
    expect(new Set(BEATS.map(b => b.id)).size).toBe(BEATS.length)
    for (const beat of BEATS) expect(beat.line.length, beat.id).toBeLessThanOrEqual(46)
  })

  it('starts outside Hype and ends at the stage', () => {
    expect(BEATS[0].id).toBe('arrive')
    expect(BEATS[0].cam.pos[2]).toBeGreaterThan(16)
    expect(BEATS.at(-1)?.id).toBe('done')
  })

  it('stands every stop at eye height, inside the hall once past the lobby', () => {
    for (const { id, cam } of BEATS) {
      const [x, y, z] = cam.pos
      expect(y, id).toBeGreaterThan(1.4)
      expect(y, id).toBeLessThan(2)
      if (z < 4) expect(Math.abs(x), id).toBeLessThan(12.5)
    }
  })

  it('walks in through the front doors and the hall door, not through walls', () => {
    const into = BEATS[stopIndex('welcome')]
    expect(into.via?.some(([x, , z]) => z > 16 && Math.abs(x) < 1.6)).toBe(true)
    const hall = BEATS[stopIndex('counter')]
    expect(hall.via?.some(([x, , z]) => z < 4 && Math.abs(x) < 1.7)).toBe(true)
  })
})

describe('the fridge run', () => {
  it('tells the task in order: counter, the wrong drink, the swap, the way, the hacker, the fridge', () => {
    const order = ['counter', 'correction', 'fixed', 'route', 'visitor', 'fridge', 'help', 'done'].map(stopIndex)
    for (let i = 1; i < order.length; i += 1) expect(order[i], `stop ${i}`).toBe(order[i - 1] + 1)
  })

  it('walks round the hacker, not through him', () => {
    const hacker: [number, number] = [0.85, -19.6]
    const legs = [BEATS[stopIndex('visitor')], BEATS[stopIndex('fridge')]]
    for (const beat of legs) {
      const points = [...(beat.via ?? []), beat.cam.pos]
      for (const [x, , z] of points) expect(Math.hypot(x - hacker[0], z - hacker[1]), beat.id).toBeGreaterThan(1)
    }
  })
})

describe('leadProgress and putOnProgress', () => {
  it('runs the lead first, then puts the glasses on over the next screens of scrolling', () => {
    const lead = LEAD_SCREENS * 1000
    expect(leadProgress(0, 1000)).toBe(0)
    expect(leadProgress(lead / 2, 1000)).toBe(0.5)
    expect(leadProgress(lead, 1000)).toBe(1)
    expect(putOnProgress(lead, 1000)).toBe(0)
    expect(putOnProgress(lead + PUT_ON_SCREENS * 500, 1000)).toBe(0.5)
    expect(putOnProgress(INTRO_SCREENS * 1000, 1000)).toBe(1)
    expect(putOnProgress(-200, 1000)).toBe(0)
    expect(putOnProgress(50_000, 1000)).toBe(1)
    expect(putOnProgress(100, 0)).toBe(0)
    expect(leadProgress(100, 0)).toBe(0)
  })
})

describe('beatAt', () => {
  it('gives each stop its own number of screens', () => {
    expect(beatAt(0, 800, [2, 1, 1])).toEqual({ index: 0, progress: 0 })
    expect(beatAt(800, 800, [2, 1, 1])).toEqual({ index: 0, progress: 0.5 })
    expect(beatAt(1600, 800, [2, 1, 1])).toEqual({ index: 1, progress: 0 })
    expect(beatAt(2000, 800, [2, 1, 1])).toEqual({ index: 1, progress: 0.5 })
  })

  it('stays on the first and last stop outside the walk', () => {
    expect(beatAt(-500, 800, STOP_SCREENS).index).toBe(0)
    expect(beatAt(100_000, 800, STOP_SCREENS)).toEqual({ index: BEATS.length - 1, progress: 1 })
  })

  it('does not divide by zero', () => {
    expect(beatAt(100, 0, STOP_SCREENS)).toEqual({ index: 0, progress: 0 })
    expect(beatAt(100, 800, [])).toEqual({ index: 0, progress: 0 })
  })

  it('adds the stops up', () => {
    expect(WALK_SCREENS).toBeCloseTo(STOP_SCREENS.reduce((a, b) => a + b, 0))
  })
})

describe('legAt', () => {
  const beats = [{}, { dwell: 0.2 }, {}, {}]
  it('stands still first, then moves to the next stop', () => {
    expect(legAt(2, 0.2, beats)).toEqual({ stop: 2, next: 3, move: 0 })
    expect(legAt(2, DWELL, beats).move).toBe(0)
    expect(legAt(2, 1, beats)).toEqual({ stop: 2, next: 3, move: 1 })
    expect(legAt(2, (1 + DWELL) / 2, beats).move).toBeCloseTo(0.5)
  })

  it('uses a stop’s own dwell', () => {
    expect(legAt(1, 0.6, beats).move).toBeCloseTo(0.5)
  })

  it('stays at the last stop', () => {
    expect(legAt(3, 0.9, beats)).toEqual({ stop: 3, next: 3, move: 0 })
    expect(legAt(99, 0.9, beats)).toEqual({ stop: 3, next: 3, move: 0 })
  })
})

describe('alongPath', () => {
  it('moves by distance along the points and points the way', () => {
    const path: [number, number, number][] = [[0, 0, 0], [0, 0, -2], [2, 0, -2]]
    expect(alongPath(path, 0).at).toEqual([0, 0, 0])
    expect(alongPath(path, 0.25).at).toEqual([0, 0, -1])
    expect(alongPath(path, 0.25).dir).toEqual([0, 0, -1])
    expect(alongPath(path, 0.75).at).toEqual([1, 0, -2])
    expect(alongPath(path, 0.75).dir).toEqual([1, 0, 0])
    expect(alongPath(path, 1).at).toEqual([2, 0, -2])
  })
})
