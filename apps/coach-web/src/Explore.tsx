import { useEffect, useState } from 'react'
import { BarList } from './cards/charts'
import { postExplore } from './lib/api'
import { useCoach } from './lib/ctx'
import { eur, shortDate } from './lib/format'
import { BASKET_COLOR, type Key } from './lib/i18n'
import { BASKETS, type Basket, type ExploreResult } from './lib/types'

const PERIODS: { key: Key; days: number }[] = [
  { key: 'days30', days: 30 },
  { key: 'days90', days: 90 },
  { key: 'months12', days: 365 },
  { key: 'all', days: 731 },
]
const GROUPS = ['basket', 'category', 'sub', 'month', 'weekday', 'hour', 'merchant'] as const
type Group = (typeof GROUPS)[number] | 'none'

function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - (days - 1))
  return d.toISOString().slice(0, 10)
}

export interface ExplorePreset {
  subs?: string[]
  baskets?: string[]
}

export function Explore({ customerId, today, preset, onClose }: { customerId: string; today: string; preset: ExplorePreset; onClose: () => void }) {
  const { lang, tr, label, overrides, ask } = useCoach()
  const [days, setDays] = useState(90)
  const [group, setGroup] = useState<Group>(preset.subs?.length ? 'none' : 'basket')
  const [basket, setBasket] = useState<Basket | null>((preset.baskets?.[0] as Basket | undefined) ?? null)
  const [category, setCategory] = useState<string | null>(null)
  const [subs, setSubs] = useState<string[]>(preset.subs ?? [])
  const [result, setResult] = useState<ExploreResult | null>(null)

  useEffect(() => {
    let live = true
    postExplore(
      customerId,
      { start: daysBefore(today, days), end: today, group_by: group === 'none' ? [] : [group], baskets: basket ? [basket] : [], categories: category ? [category] : [], subs },
      overrides,
    )
      .then((r) => live && setResult(r))
      .catch(() => live && setResult(null))
    return () => {
      live = false
    }
  }, [customerId, today, days, group, basket, category, subs, overrides])

  const keyLabel = (k: string) => (group === 'month' ? k : group === 'hour' ? `${k}:00` : group === 'weekday' && lang === 'fi' ? ({ Mon: 'Ma', Tue: 'Ti', Wed: 'Ke', Thu: 'To', Fri: 'Pe', Sat: 'La', Sun: 'Su' }[k] ?? k) : label(k))
  const drill = (i: number) => {
    const k = result?.groups?.[i]?.key[0]
    if (!k) return
    if (group === 'basket') {
      setBasket(k as Basket)
      setGroup('category')
    } else if (group === 'category') {
      setCategory(k)
      setGroup('sub')
    } else if (group === 'sub') {
      setSubs([k])
      setGroup('none')
    }
  }
  const filters = [basket && label(basket), category && label(category), ...subs.map(label)].filter(Boolean) as string[]
  const period = tr(PERIODS.find((p) => p.days === days)!.key)
  const question =
    lang === 'fi'
      ? `Kerro menoistani${filters.length ? `: ${filters.join(', ')}` : ''} (${period}). Mitä huomaat?`
      : `Tell me about my spending${filters.length ? ` on ${filters.join(', ')}` : ''} (${period}). What stands out?`

  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={tr('exploreTitle')}>
      <button className="sheet-scrim" onClick={onClose} aria-label={tr('close')} />
      <div className="sheet">
        <div className="sheet-head">
          <div>
            <h2>{tr('exploreTitle')}</h2>
            <p className="muted">{tr('exploreLead')}</p>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label={tr('close')}>
            ×
          </button>
        </div>
        <div className="sheet-body">
          <div className="control">
            <span>{tr('period')}</span>
            <div className="chips wrap">
              {PERIODS.map((p) => (
                <button key={p.days} className={days === p.days ? 'chip on' : 'chip'} onClick={() => setDays(p.days)}>
                  {tr(p.key)}
                </button>
              ))}
            </div>
          </div>
          <div className="control">
            <span>{tr('groupBy')}</span>
            <div className="chips wrap">
              {GROUPS.map((g) => (
                <button key={g} className={group === g ? 'chip on' : 'chip'} onClick={() => setGroup(group === g ? 'none' : g)}>
                  {tr(`g_${g}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="control">
            <span>{tr('g_basket')}</span>
            <div className="chips wrap">
              {BASKETS.map((b) => (
                <button key={b} className={basket === b ? 'chip on' : 'chip'} onClick={() => setBasket(basket === b ? null : b)}>
                  <i style={{ background: BASKET_COLOR[b] }} />
                  {label(b)}
                </button>
              ))}
              {category && (
                <button className="chip on" onClick={() => setCategory(null)}>
                  {label(category)} ×
                </button>
              )}
              {subs.map((s) => (
                <button key={s} className="chip on" onClick={() => setSubs(subs.filter((x) => x !== s))}>
                  {label(s)} ×
                </button>
              ))}
            </div>
          </div>
          {result && (
            <>
              <div className="explore-total">
                <span className="hero-number small">{eur(result.total, lang, { cents: false })}</span>
                <span className="muted">
                  {tr('purchases', { n: result.count })} · ø {eur(result.average, lang)}
                </span>
              </div>
              {result.groups && result.groups.length > 0 && (
                <BarList
                  rows={result.groups.map((g) => ({
                    label: keyLabel(g.key[0]),
                    value: g.total,
                    sub: tr('purchases', { n: g.count }),
                    color: group === 'basket' ? BASKET_COLOR[g.key[0] as Basket] : undefined,
                  }))}
                  onPick={['basket', 'category', 'sub'].includes(group) ? drill : undefined}
                />
              )}
              {result.latest && (
                <div className="txlist">
                  {result.latest.map((x, i) => (
                    <div key={i} className="tx">
                      <span>
                        {label(x.sub)}
                        <small>
                          {shortDate(x.date, lang)} {x.time}
                        </small>
                      </span>
                      <b>{eur(-x.amount, lang)}</b>
                    </div>
                  ))}
                </div>
              )}
              {result.count === 0 && <p className="muted">{tr('noData')}</p>}
            </>
          )}
        </div>
        <div className="sheet-foot">
          <button
            className="btn"
            onClick={() => {
              onClose()
              ask(question)
            }}
          >
            {tr('askAboutThis')}
          </button>
        </div>
      </div>
    </div>
  )
}
