import { useState } from 'react'
import { useCoach } from '../lib/ctx'
import { eur, num, pct, shortDate, whatIfAt } from '../lib/format'
import { BASKET_COLOR, hasKey, type Key } from '../lib/i18n'
import { BASKETS, type Basket, type Baskets, type Benchmark, type Card, type Challenge, type Profile, type SafeToSave, type SafeToSpend, type WhatIf } from '../lib/types'
import { BarList, Chart, MonthlyBars, StackedShare } from './charts'

function Row({ label, value, strong, minus }: { label: string; value: string; strong?: boolean; minus?: boolean }) {
  return (
    <div className={strong ? 'calc-row strong' : 'calc-row'}>
      <span>{label}</span>
      <span>
        {minus ? '− ' : ''}
        {value}
      </span>
    </div>
  )
}

export function SafeBreakdown({ s }: { s: SafeToSpend }) {
  const { lang, tr } = useCoach()
  const e = (v: number) => eur(v, lang)
  const b = s.balance_view
  const i = s.income_view
  return (
    <div className="calc">
      <p className="muted">{tr('twoLimits')}</p>
      <div className={s.limited_by === 'balance' ? 'calc-col winner' : 'calc-col'}>
        <h4>{tr('balanceView')}</h4>
        <Row label={tr('balanceNow')} value={e(b.balance)} />
        {b.still_due_before_payday.map((d) => {
          const key = `due_${d.item}`
          return <Row key={d.item} minus label={hasKey(key) ? tr(key, { date: d.due ? shortDate(d.due, lang) : '' }) : d.item} value={e(d.amount)} />
        })}
        <Row minus label={tr('cushionKept')} value={e(b.cushion_kept)} />
        <Row strong label={tr('available')} value={e(b.available)} />
      </div>
      <div className={s.limited_by === 'income' ? 'calc-col winner' : 'calc-col'}>
        <h4>{tr('incomeView')}</h4>
        <Row label={tr('payPerCycle')} value={e(i.pay_per_cycle)} />
        <Row minus label={tr('regularEssentials')} value={e(i.regular_essentials)} />
        <Row minus label={tr('unexpectedReserve')} value={e(i.unexpected_reserve)} />
        {i.saving_habit > 0 && <Row minus label={tr('savingHabit')} value={e(i.saving_habit)} />}
        <Row label={tr('everydayBudget')} value={e(i.everyday_budget)} />
        <Row minus label={tr('spentSincePayday')} value={e(i.everyday_spent_since_payday)} />
        <Row strong label={tr('left')} value={e(i.left)} />
      </div>
      <p className="muted">{s.limited_by === 'balance' ? tr('limitedBy_balance') : tr('limitedBy_income', { amount: e(s.cushion_beyond_safe) })}</p>
    </div>
  )
}

export function SafeToSpendCard({ s, hero }: { s: SafeToSpend; hero?: boolean }) {
  const { lang, tr } = useCoach()
  const [open, setOpen] = useState(false)
  const budget = Math.max(s.income_view.everyday_budget, 1)
  const used = Math.min(1, Math.max(0, s.income_view.everyday_spent_since_payday / budget))
  return (
    <section className={hero ? 'card hero' : 'card'}>
      <div className="eyebrow">{tr('safeThisWeek')}</div>
      <div className="hero-line">
        <span className="hero-number">{eur(s.safe_this_week, lang, { cents: false })}</span>
        <span className={`pill status-${s.status}`}>{tr(`status_${s.status}`)}</span>
      </div>
      <div className="hero-sub">
        {tr('perDay', { amount: eur(s.safe_per_day, lang) })} · {tr('daysToPayday', { days: s.days_to_payday })}
      </div>
      <div className="meter" role="img" aria-label={`${tr('spentSincePayday')} ${pct(used, lang)}`}>
        <span style={{ width: `${used * 100}%` }} />
      </div>
      <div className="meter-ends">
        <span>
          {tr('spentSincePayday')} {eur(s.income_view.everyday_spent_since_payday, lang, { cents: false })}
        </span>
        <span>
          {tr('everydayBudget')} {eur(s.income_view.everyday_budget, lang, { cents: false })}
        </span>
      </div>
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? tr('hide') : tr('howCalculated')}
      </button>
      {open && <SafeBreakdown s={s} />}
    </section>
  )
}

export function BasketsCard({ data, compact }: { data: Baskets; compact?: boolean }) {
  const { lang, tr, label, setOverride, explore } = useCoach()
  const [open, setOpen] = useState<Basket | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const shares = Object.fromEntries(BASKETS.map((b) => [b, data.baskets[b].share])) as Record<Basket, number>
  return (
    <section className="card">
      <div className="eyebrow">{tr('whereMoneyGoes')}</div>
      <div className="card-lead">
        <strong>{eur(data.monthly_total, lang, { cents: false })}</strong> {tr('perMonth')}
      </div>
      <StackedShare shares={shares} />
      <div className="basket-rows">
        {BASKETS.map((b) => {
          const d = data.baskets[b]
          const isOpen = open === b
          return (
            <div key={b} className="basket">
              <button className="basket-head" onClick={() => setOpen(isOpen ? null : b)} aria-expanded={isOpen}>
                <i style={{ background: BASKET_COLOR[b] }} />
                <span className="basket-name">
                  {label(b)}
                  {!compact && <small>{tr(`basketHint_${b}`)}</small>}
                </span>
                <span className="basket-amount">
                  {eur(d.monthly, lang, { cents: false })}
                  <small>{pct(d.share, lang)}</small>
                </span>
              </button>
              {isOpen && (
                <div className="basket-body">
                  {compact && <p className="muted">{tr(`basketHint_${b}`)}</p>}
                  {d.top.map((s) => (
                    <div key={s.sub} className="sub">
                      <button className="sub-main" onClick={() => explore({ subs: [s.sub] })}>
                        <span>{label(s.sub)}</span>
                        <small>{tr('timesPerMonth', { n: num(s.purchases_per_month, lang, 1) })}</small>
                      </button>
                      <span className="sub-amount">{eur(s.monthly, lang, { cents: false })}</span>
                      <button className="chip tiny" onClick={() => setMoving(moving === s.sub ? null : s.sub)} aria-expanded={moving === s.sub}>
                        {tr('moveTo')}
                      </button>
                      {moving === s.sub && (
                        <div className="move">
                          {BASKETS.filter((x) => x !== b).map((x) => (
                            <button
                              key={x}
                              className="chip"
                              onClick={() => {
                                setOverride(s.sub, x)
                                setMoving(null)
                              }}
                            >
                              <i style={{ background: BASKET_COLOR[x] }} />
                              {label(x)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {d.top.length === 0 && <p className="muted">{tr('noData')}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="muted small">
        {tr('avgPerMonth', { days: data.period_days })}. {tr('yourLabels')}
      </p>
    </section>
  )
}

export function WhatIfCard({ data }: { data: WhatIf }) {
  const { lang, tr, label, makeChallenge } = useCoach()
  const [change, setChange] = useState(Math.round(data.change_pct))
  const w = whatIfAt(data.baseline_monthly, data.average_purchase, change, 12)
  const e = (v: number) => eur(v, lang, { cents: Math.abs(v) < 20 })
  const n = Math.abs(w.fewerPurchases)
  const name = label(data.target)
  return (
    <section className="card">
      <div className="eyebrow">{tr('whatIfTitle', { target: name })}</div>
      <div className="whatif-big">
        <span className="hero-number small">{eur(w.freedMonthly, lang, { cents: false, sign: true })}</span>
        <span className="muted">{tr('freedPerMonth').toLowerCase()}</span>
      </div>
      <input
        className="slider"
        type="range"
        min={-100}
        max={50}
        step={5}
        value={change}
        onChange={(ev) => setChange(Number(ev.target.value))}
        aria-label={tr('whatIfTitle', { target: name })}
        style={{ '--fill': `${((change + 100) / 150) * 100}%` } as React.CSSProperties}
      />
      <div className="slider-ends">
        <span>−100 %</span>
        <strong>
          {change > 0 ? '+' : ''}
          {change} %
        </strong>
        <span>+50 %</span>
      </div>
      <div className="stats">
        <div>
          <small>{tr('nowPerMonth')}</small>
          <b>{e(data.baseline_monthly)}</b>
        </div>
        <div>
          <small>{tr('thenPerMonth')}</small>
          <b>{e(w.newMonthly)}</b>
        </div>
        <div>
          <small>{tr('freedPerYear')}</small>
          <b>{eur(w.freedYearly, lang, { cents: false, sign: true })}</b>
        </div>
      </div>
      {n >= 0.1 && (
        <p className="muted">
          {tr(w.fewerPurchases >= 0 ? 'fewerPurchases' : 'morePurchases', { n: num(n, lang, 1), avg: eur(data.average_purchase, lang) })}{' '}
          <span className="nowrap">{tr('extraPerWeek', { delta: eur(w.extraPerWeek, lang, { sign: true }) })}.</span>
        </p>
      )}
      {change < 0 && (
        <button className="btn ghost" onClick={() => makeChallenge(data.target, change)}>
          {tr('makeChallenge')}
        </button>
      )}
    </section>
  )
}

export function ProfileCard({ data }: { data: Profile }) {
  const { lang, tr } = useCoach()
  const x = data.traits
  const archKey = `arch_${data.archetype}` as Key
  const traits: { label: string; value: string; share: number; note?: string }[] = [
    { label: tr('trait_savings_rate'), value: pct(x.savings_rate, lang), share: Math.min(1, x.savings_rate / 0.3) },
    { label: tr('trait_weekend'), value: pct(x.weekend_share_of_everyday, lang), share: x.weekend_share_of_everyday, note: tr('trait_weekendEven', { share: pct(x.weekend_share_if_even, lang) }) },
    { label: tr('trait_payday'), value: `${num(x.payday_week_vs_other_days, lang, 1)}×`, share: Math.min(1, x.payday_week_vs_other_days / 3) },
    {
      label: tr('trait_small'),
      value: tr('trait_smallValue', { n: num(x.small_purchases_per_month, lang), amount: eur(x.small_purchases_eur_per_month, lang, { cents: false }) }),
      share: Math.min(1, x.small_purchases_per_month / 40),
    },
    { label: tr('trait_eatingOut'), value: pct(x.eating_out_share_of_food, lang), share: x.eating_out_share_of_food },
    { label: tr('trait_volatility'), value: pct(x.monthly_spending_volatility, lang), share: Math.min(1, x.monthly_spending_volatility) },
  ]
  return (
    <section className="card">
      <div className="eyebrow">{tr('profileTitle')}</div>
      <h3 className="arch">{data.archetype_label[lang]}</h3>
      <p>{hasKey(archKey) ? tr(archKey) : ''}</p>
      <StackedShare shares={data.basket_shares} />
      <div className="traits">
        {traits.map((r) => (
          <div key={r.label} className="trait">
            <span className="trait-top">
              <span>{r.label}</span>
              <b>{r.value}</b>
            </span>
            <span className="barlist-track">
              <span className="barlist-fill" style={{ width: `${Math.max(2, r.share * 100)}%` }} />
            </span>
            {r.note && <small>{r.note}</small>}
          </div>
        ))}
      </div>
    </section>
  )
}

function Pair({ name, you, other, otherLabel, note }: { name: string; you: number; other: number; otherLabel: string; note?: string }) {
  const { lang, tr } = useCoach()
  const max = Math.max(you, other, 1)
  return (
    <div className="pair">
      <div className="pair-name">{name}</div>
      <div className="pair-bar">
        <span className="pair-key">{tr('you')}</span>
        <span className="barlist-track">
          <span className="barlist-fill" style={{ width: `${Math.max(1.5, (you / max) * 100)}%`, background: 'var(--s1)' }} />
        </span>
        <b>{eur(you, lang, { cents: false })}</b>
      </div>
      <div className="pair-bar">
        <span className="pair-key">{otherLabel}</span>
        <span className="barlist-track">
          <span className="barlist-fill" style={{ width: `${Math.max(1.5, (other / max) * 100)}%`, background: 'var(--ink-3)' }} />
        </span>
        <b>{eur(other, lang, { cents: false })}</b>
      </div>
      {note && <small className="muted">{note}</small>}
    </div>
  )
}

export function BenchmarkCard({ data }: { data: Benchmark }) {
  const { tr, label } = useCoach()
  const [tab, setTab] = useState<'peers' | 'finland' | 'area'>('peers')
  const m = data.peers.metrics
  const peerKeys = ['spending', 'basket:everyday', 'Restaurants', 'Groceries', 'Transportation', 'Entertainment'].filter((k) => m[k])
  const peerName = (k: string) => (k === 'spending' ? tr('spending') : k.startsWith('basket:') ? label(k.slice(7)) : label(k))
  const group = /aged ([\d+-]+)/.exec(data.peers.group)?.[1] ?? ''
  return (
    <section className="card">
      <div className="eyebrow">{tr('benchTitle')}</div>
      <div className="tabs" role="tablist">
        {(['peers', 'finland', ...(data.your_area ? ['area'] : [])] as const).map((k) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k as typeof tab)}>
            {tr(k === 'peers' ? 'benchPeers' : k === 'finland' ? 'benchFinland' : 'benchArea')}
          </button>
        ))}
      </div>
      {tab === 'peers' && (
        <>
          {peerKeys.map((k) => (
            <Pair key={k} name={peerName(k)} you={m[k].you} other={m[k].peer_median} otherLabel={tr('peerMedian')} note={tr('percentile', { p: m[k].percentile })} />
          ))}
          <p className="muted small">{tr('peersGroup', { group, n: data.peers.group_size })}</p>
        </>
      )}
      {tab === 'finland' && (
        <>
          {data.statistics_finland.rows.map((r) => (
            <Pair key={r.category} name={r.category.split(' + ').map(label).join(' + ')} you={r.you_monthly} other={r.finland_monthly} otherLabel={tr('finlandAvg')} />
          ))}
          <p className="muted small">
            {data.statistics_finland.note} {data.statistics_finland.source}.
          </p>
        </>
      )}
      {tab === 'area' && data.your_area && (
        <>
          <BarList
            rows={[
              { label: tr('yourIncome'), value: data.your_area.your_income_monthly, color: 'var(--s1)' },
              { label: tr('areaMedian', { area: data.your_area.name }), value: data.your_area.median_income_per_person_monthly, color: 'var(--ink-3)' },
              { label: tr('finlandMedian'), value: data.your_area.finland_median_income_per_person_monthly, color: 'var(--ink-3)' },
            ]}
          />
          <p className="muted small">
            {data.your_area_source} ({data.your_area.year}). {tr('perMonth')}.
          </p>
        </>
      )}
    </section>
  )
}

export function SafeToSaveCard({ data }: { data: SafeToSave }) {
  const { lang, tr } = useCoach()
  const f = data.emergency_fund
  const covered = f.months_covered ?? 0
  return (
    <section className="card">
      <div className="eyebrow">{tr('saveTitle')}</div>
      <div className="stats two">
        <div>
          <small>{tr('saveMonthly')}</small>
          <b className="big">{eur(data.suggested_monthly, lang, { cents: false })}</b>
        </div>
        <div>
          <small>{tr('saveOneOff')}</small>
          <b className="big">{eur(data.suggested_one_off_now, lang, { cents: false })}</b>
        </div>
      </div>
      <h4>{tr('emergencyFund')}</h4>
      <div className="meter good" role="img" aria-label={tr('monthsCovered', { n: num(covered, lang, 1) })}>
        <span style={{ width: `${Math.min(1, covered / 3) * 100}%` }} />
      </div>
      <p className="muted">
        {tr('monthsCovered', { n: num(covered, lang, 1) })} {data.already_saving_monthly > 0 ? tr('alreadySaving', { amount: eur(data.already_saving_monthly, lang, { cents: false }) }) : ''}
      </p>
    </section>
  )
}

export function ChallengeCard({ data }: { data: Challenge }) {
  const { lang, tr, challenges, acceptChallenge } = useCoach()
  const on = challenges.some((c) => c.target === data.target && c.start === data.start)
  return (
    <section className="card challenge">
      <div className="eyebrow">{tr('challengeTitle')}</div>
      <h3>{data.title}</h3>
      <p>{tr('challengeGoal', { now: eur(data.weekly_now, lang, { cents: false }), goal: eur(data.weekly_goal, lang, { cents: false }), weeks: data.weeks })}</p>
      <p className="muted">{tr('challengeFrees', { amount: eur(data.frees_over_challenge, lang, { cents: false }), yearly: eur(data.frees_yearly, lang, { cents: false }) })}</p>
      <button className={on ? 'btn done' : 'btn'} disabled={on} onClick={() => acceptChallenge(data)}>
        {on ? tr('accepted') : tr('accept')}
      </button>
    </section>
  )
}

export function OtherBankCard({ monthly }: { monthly: number }) {
  const { lang, tr } = useCoach()
  const [clicked, setClicked] = useState(false)
  return (
    <section className="card">
      <div className="eyebrow">{tr('otherBankTitle')}</div>
      <p>{tr('otherBankBody', { amount: eur(monthly, lang, { cents: false }) })}</p>
      <button className="btn ghost" onClick={() => setClicked(true)}>
        {tr('linkBank')}
      </button>
      {clicked && <p className="muted small">{tr('linkBankDemo')}</p>}
    </section>
  )
}

export function CardView({ card }: { card: Card }) {
  const { tr } = useCoach()
  switch (card.card) {
    case 'safe_to_spend':
      return <SafeToSpendCard s={card.data} />
    case 'safe_to_save':
      return <SafeToSaveCard data={card.data} />
    case 'baskets':
      return <BasketsCard data={card.data} />
    case 'monthly':
      return (
        <section className="card">
          <div className="eyebrow">{tr('monthlyTitle')}</div>
          <MonthlyBars months={card.data.months} />
        </section>
      )
    case 'profile':
      return <ProfileCard data={card.data} />
    case 'what_if':
      return <WhatIfCard data={card.data} />
    case 'benchmark':
      return <BenchmarkCard data={card.data} />
    case 'challenge':
      return <ChallengeCard data={card.data} />
    case 'other_bank':
      return <OtherBankCard monthly={card.data.monthly} />
    case 'chart':
      return (
        <section className="card">
          <div className="eyebrow">{card.data.title}</div>
          <Chart spec={card.data} />
        </section>
      )
    default:
      return null
  }
}
