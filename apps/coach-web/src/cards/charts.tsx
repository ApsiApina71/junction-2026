import { useState } from 'react'
import { useCoach } from '../lib/ctx'
import { eur, monthLabel, num } from '../lib/format'
import { BASKET_COLOR } from '../lib/i18n'
import { SERIES } from '../lib/palette'
import { BASKETS, type Basket, type ChartSpec, type MonthRow } from '../lib/types'

export function StackedShare({ shares }: { shares: Record<Basket, number> }) {
  const { label } = useCoach()
  return (
    <div className="stack" role="img" aria-label={BASKETS.map((b) => `${label(b)} ${Math.round(shares[b] * 100)}%`).join(', ')}>
      {BASKETS.filter((b) => shares[b] > 0.004).map((b) => (
        <span key={b} style={{ flexGrow: shares[b], background: BASKET_COLOR[b] }} />
      ))}
    </div>
  )
}

export function BarList({ rows, unit = '€', color = 'var(--brand)', onPick }: { rows: { label: string; value: number; sub?: string; color?: string }[]; unit?: string; color?: string; onPick?: (i: number) => void }) {
  const { lang } = useCoach()
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9)
  const fmt = (v: number) => (unit === '€' ? eur(v, lang) : `${num(v, lang, Number.isInteger(v) ? 0 : 1)} ${unit}`.trim())
  return (
    <div className="barlist">
      {rows.map((r, i) => {
        const body = (
          <>
            <span className="barlist-top">
              <span className="barlist-label">{r.label}</span>
              <span className="barlist-value">{fmt(r.value)}</span>
            </span>
            <span className="barlist-track">
              <span className="barlist-fill" style={{ width: `${Math.max(1.5, (Math.abs(r.value) / max) * 100)}%`, background: r.color ?? color }} />
            </span>
            {r.sub && <span className="barlist-sub">{r.sub}</span>}
          </>
        )
        return onPick ? (
          <button key={i} className="barlist-row" onClick={() => onPick(i)}>
            {body}
          </button>
        ) : (
          <div key={i} className="barlist-row">
            {body}
          </div>
        )
      })}
    </div>
  )
}

export function MonthlyBars({ months }: { months: MonthRow[] }) {
  const { lang, label, tr } = useCoach()
  const [picked, setPicked] = useState(months.length - 1)
  const W = 320
  const H = 150
  const pad = 4
  const max = Math.max(...months.map((m) => Math.max(m.spending, m.income)), 1)
  const slot = W / months.length
  const bw = Math.min(18, slot - 6)
  const y = (v: number) => (v / max) * (H - pad - 8)
  const m = months[picked]
  return (
    <div className="monthly">
      <div className="monthly-readout" aria-live="polite">
        <strong>{monthLabel(m.month, lang)} {m.month.slice(0, 4)}</strong>
        <span>{tr('income')} {eur(m.income, lang, { cents: false })}</span>
        <span>{tr('spending')} {eur(m.spending, lang, { cents: false })}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label={tr('monthlyTitle')}>
        <line x1="0" x2={W} y1={H} y2={H} className="axis" />
        {months.map((row, i) => {
          const cx = i * slot + slot / 2
          let top = H
          return (
            <g key={row.month} onPointerEnter={() => setPicked(i)} onClick={() => setPicked(i)} className={i === picked ? 'col picked' : 'col'}>
              <rect x={i * slot} y={0} width={slot} height={H + 18} fill="transparent" />
              {BASKETS.map((b) => {
                const h = y(row[b])
                if (h < 0.5) return null
                top -= h
                return <rect key={b} x={cx - bw / 2} y={top + 1} width={bw} height={Math.max(0.5, h - 2)} rx={2} fill={BASKET_COLOR[b]} />
              })}
              <line x1={cx - bw / 2 - 3} x2={cx + bw / 2 + 3} y1={H - y(row.income)} y2={H - y(row.income)} className="income-tick" />
              <text x={cx} y={H + 13} textAnchor="middle" className="tick">
                {monthLabel(row.month, lang).slice(0, 3)}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="legend">
        {BASKETS.map((b) => (
          <span key={b}>
            <i style={{ background: BASKET_COLOR[b] }} />
            {label(b)} {eur(m[b], lang, { cents: false })}
          </span>
        ))}
        <span>
          <i className="income-key" />
          {tr('income')}
        </span>
      </div>
    </div>
  )
}

function LineChart({ spec }: { spec: ChartSpec }) {
  const { lang } = useCoach()
  const [picked, setPicked] = useState(spec.values.length - 1)
  const W = 320
  const H = 130
  const min = Math.min(0, ...spec.values)
  const max = Math.max(...spec.values, min + 1e-9)
  const x = (i: number) => (spec.values.length === 1 ? W / 2 : 8 + (i * (W - 16)) / (spec.values.length - 1))
  const y = (v: number) => H - 6 - ((v - min) / (max - min)) * (H - 16)
  const fmt = (v: number) => (spec.unit === '€' ? eur(v, lang) : `${num(v, lang, 1)} ${spec.unit}`)
  return (
    <div className="monthly">
      <div className="monthly-readout" aria-live="polite">
        <strong>{spec.labels[picked]}</strong>
        <span>{fmt(spec.values[picked])}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title}>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="axis" />
        <polyline points={spec.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--s1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {spec.values.map((v, i) => (
          <g key={i} onPointerEnter={() => setPicked(i)} onClick={() => setPicked(i)}>
            <rect x={x(i) - W / spec.values.length / 2} y={0} width={W / spec.values.length} height={H} fill="transparent" />
            {i === picked && <circle cx={x(i)} cy={y(v)} r={5} fill="var(--s1)" stroke="var(--surface)" strokeWidth="2" />}
          </g>
        ))}
      </svg>
      <div className="axis-ends">
        <span>{spec.labels[0]}</span>
        <span>{spec.labels[spec.labels.length - 1]}</span>
      </div>
    </div>
  )
}

function Donut({ spec }: { spec: ChartSpec }) {
  const { lang } = useCoach()
  // Fold everything past the seventh slice into "other" so colours are never recycled.
  const pairs = spec.labels.map((l, i) => ({ label: l, value: Math.max(0, spec.values[i]) })).sort((a, b) => b.value - a.value)
  const head = pairs.slice(0, 7)
  const tail = pairs.slice(7)
  if (tail.length) head.push({ label: lang === 'fi' ? 'Muut' : 'Other', value: tail.reduce((s, p) => s + p.value, 0) })
  const total = head.reduce((s, p) => s + p.value, 0) || 1
  const R = 44
  const C = 2 * Math.PI * R
  const lengths = head.map((p) => (p.value / total) * C)
  const starts = lengths.map((_, i) => lengths.slice(0, i).reduce((s, l) => s + l, 0))
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={spec.title}>
        {head.map((_, i) => (
          <circle key={i} cx="60" cy="60" r={R} fill="none" stroke={SERIES[i]} strokeWidth="16" strokeDasharray={`${Math.max(0, lengths[i] - 2)} ${C}`} strokeDashoffset={-starts[i]} transform="rotate(-90 60 60)" />
        ))}
      </svg>
      <div className="legend column">
        {head.map((p, i) => (
          <span key={i}>
            <i style={{ background: SERIES[i] }} />
            {p.label}
            <b>{spec.unit === '€' ? eur(p.value, lang, { cents: false }) : `${num(p.value, lang)} ${spec.unit}`}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export function Chart({ spec }: { spec: ChartSpec }) {
  if (spec.chart_type === 'line' && spec.values.length > 1) return <LineChart spec={spec} />
  if (spec.chart_type === 'donut') return <Donut spec={spec} />
  return <BarList rows={spec.labels.map((l, i) => ({ label: l, value: spec.values[i] }))} unit={spec.unit} color="var(--s1)" />
}
