import { describe, expect, it } from 'vitest'
import { hot, parseFx } from './fx'

describe('parseFx', () => {
  it('is all on without the parameter, except the post-processing on touch screens', () => {
    expect(parseFx('')).toEqual({ light: true, air: true, show: true })
    expect(parseFx('?utm=x')).toEqual({ light: true, air: true, show: true })
    expect(parseFx('', true)).toEqual({ light: false, air: true, show: true })
  })

  it('shows the page without any look with off, for comparison', () => {
    expect(parseFx('?fx=off')).toEqual({ light: false, air: false, show: false })
    expect(parseFx('?fx=off', true)).toEqual({ light: false, air: false, show: false })
    expect(parseFx('?fx=all', true)).toEqual({ light: true, air: true, show: true })
  })

  it('turns on the named looks, in any case and with spaces', () => {
    expect(parseFx('?fx=light')).toEqual({ light: true, air: false, show: false })
    expect(parseFx('?fx=Air,%20show')).toEqual({ light: false, air: true, show: true })
  })

  it('turns on everything with all, and ignores names it does not know', () => {
    expect(parseFx('?fx=all')).toEqual({ light: true, air: true, show: true })
    expect(parseFx('?fx=bloom')).toEqual({ light: false, air: false, show: false })
  })
})

describe('hot', () => {
  it('keeps the colour as it is without the real-light look', () => {
    expect(hot('#ff8000', 3, false).getHex()).toBe(0xff8000)
  })

  it('pushes the colour over white with it, keeping its hue', () => {
    const c = hot('#ffffff', 2.5, true)
    expect([c.r, c.g, c.b]).toEqual([2.5, 2.5, 2.5])
  })
})
