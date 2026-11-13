import type { Lang } from './types'

const locale = (lang: Lang) => (lang === 'fi' ? 'fi-FI' : 'en-IE')

/** Euros for people: whole euros above 100, cents below. */
export function eur(value: number, lang: Lang, opts: { cents?: boolean; sign?: boolean } = {}): string {
  const cents = opts.cents ?? Math.abs(value) < 100
  const s = new Intl.NumberFormat(locale(lang), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(value)
  return opts.sign && value > 0 ? `+${s}` : s
}

export function num(value: number, lang: Lang, digits = 0): string {
  return new Intl.NumberFormat(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

export function pct(share: number, lang: Lang): string {
  return new Intl.NumberFormat(locale(lang), { style: 'percent', maximumFractionDigits: 0 }).format(share)
}

export function shortDate(iso: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00`))
}

export function monthLabel(key: string, lang: Lang): string {
  return new Intl.DateTimeFormat(locale(lang), { month: 'short' }).format(new Date(`${key}-15T12:00:00`))
}

/** Pure what-if maths, identical to the server's, so the slider can move without a round trip. */
export function whatIfAt(baselineMonthly: number, averagePurchase: number, changePct: number, horizonMonths: number) {
  const freedMonthly = -baselineMonthly * (changePct / 100)
  return {
    newMonthly: baselineMonthly + baselineMonthly * (changePct / 100),
    freedMonthly,
    freedYearly: freedMonthly * 12,
    accumulated: freedMonthly * horizonMonths,
    fewerPurchases: averagePurchase ? freedMonthly / averagePurchase : 0,
    extraPerWeek: (freedMonthly * 7) / 30.4375,
  }
}
