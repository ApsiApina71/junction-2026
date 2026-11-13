export type Lang = 'fi' | 'en'
export type Basket = 'regular' | 'irregular' | 'everyday'
export const BASKETS: Basket[] = ['regular', 'irregular', 'everyday']
export type Overrides = Record<string, Basket>

export interface Persona {
  id: string
  name: string
  age: number
  area: string | null
  story: Record<Lang, string>
}

export interface Meta {
  today: string
  personas: Persona[]
  labels: {
    baskets: Record<Basket, Record<Lang, string>>
    subs: Record<string, Record<Lang, string>>
    categories_fi: Record<string, string>
  }
  llm_configured: boolean
  model_id: string
}

export interface DueItem {
  item: string
  amount: number
  due?: string
}

export interface SafeToSpend {
  today: string
  next_payday: string
  days_to_payday: number
  balance: number
  safe_until_payday: number
  safe_per_day: number
  safe_this_week: number
  status: 'comfortable' | 'on_track' | 'tight' | 'stop'
  limited_by: 'balance' | 'income'
  balance_view: { balance: number; still_due_before_payday: DueItem[]; cushion_kept: number; available: number }
  income_view: {
    pay_per_cycle: number
    regular_essentials: number
    unexpected_reserve: number
    saving_habit: number
    everyday_budget: number
    everyday_spent_since_payday: number
    left: number
  }
  typical_everyday_per_day: number
  projected_balance_at_payday_at_usual_pace: number
  cushion_beyond_safe: number
}

export interface SafeToSave {
  suggested_monthly: number
  suggested_one_off_now: number
  monthly_surplus: { median: number; cautious: number; months: { month: string; net: number }[] }
  already_saving_monthly: number
  emergency_fund: { target: number; monthly_mandatory: number; balance: number; months_covered: number | null; gap: number }
}

export interface BasketDetail {
  monthly: number
  share: number
  purchases_per_month: number
  top: { sub: string; category: string; monthly: number; purchases_per_month: number }[]
  largest: { date: string; sub: string; amount: number }[]
}

export interface Baskets {
  period_days: number
  monthly_total: number
  baskets: Record<Basket, BasketDetail>
}

export interface MonthRow {
  month: string
  income: number
  regular: number
  irregular: number
  everyday: number
  invested: number
  moved_to_other_bank: number
  spending: number
  net: number
}

export interface Profile {
  archetype: string
  archetype_label: Record<Lang, string>
  monthly_income: number
  monthly_spending: number
  basket_shares: Record<Basket, number>
  traits: Record<string, number>
}

export interface WhatIf {
  target: string
  matched_transactions: number
  change_pct: number
  baseline_monthly: number
  new_monthly: number
  freed_monthly: number
  freed_yearly: number
  horizon_months: number
  annual_return_pct: number
  accumulated_over_horizon: number
  purchases_per_month: number
  average_purchase: number
  equivalent_fewer_purchases_per_month: number
  safe_per_week_now: number
  extra_per_week: number
}

export interface Benchmark {
  peers: {
    group: string
    group_size: number
    metrics: Record<string, { you: number; peer_median: number; percentile: number }>
  }
  statistics_finland: {
    age_group_of_household_reference_person: string
    rows: { category: string; you_monthly: number; finland_monthly: number; coicop_label: string }[]
    note: string
    source: string
  }
  your_area: {
    postal_code: string
    name: string
    municipality: string | null
    median_income_per_person_monthly: number
    finland_median_income_per_person_monthly: number
    your_income_monthly: number
    year: string
  } | null
  your_area_source: string
}

export interface ChartSpec {
  title: string
  chart_type: 'bar' | 'line' | 'donut'
  labels: string[]
  values: number[]
  unit: string
}

export interface Challenge {
  title: string
  target: string
  change_pct: number
  weeks: number
  weekly_now: number
  weekly_goal: number
  frees_over_challenge: number
  frees_yearly: number
  start: string
}

export interface Insight {
  type: string
  severity: string
  [key: string]: unknown
}

export interface Home {
  customer: { id: string; age: number; postal_code: string; area: string | null }
  today: string
  safe_to_spend: SafeToSpend
  safe_to_save: SafeToSave
  baskets: Baskets
  monthly: MonthRow[]
  profile: Profile
  insights: Insight[]
  recurring: Record<string, unknown>
  has_mortgage: boolean
}

export interface ExploreResult {
  period: { start: string; end: string }
  total: number
  count: number
  average: number
  group_by?: string[]
  groups?: { key: string[]; total: number; count: number }[]
  groups_truncated?: boolean
  latest?: { date: string; time: string; category: string; sub: string; amount: number; merchant: string | null }[]
}

export type Card =
  | { card: 'safe_to_spend'; data: SafeToSpend }
  | { card: 'safe_to_save'; data: SafeToSave }
  | { card: 'baskets'; data: Baskets }
  | { card: 'monthly'; data: { months: MonthRow[] } }
  | { card: 'profile'; data: Profile }
  | { card: 'what_if'; data: WhatIf }
  | { card: 'benchmark'; data: Benchmark }
  | { card: 'chart'; data: ChartSpec }
  | { card: 'challenge'; data: Challenge }
  | { card: 'other_bank'; data: { monthly: number } }

export type Part = { kind: 'text'; text: string } | ({ kind: 'card' } & Card)

export interface Message {
  id: number
  role: 'user' | 'assistant'
  parts: Part[]
  activity?: string | null
  error?: string
  done?: boolean
}

export type StreamEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | ({ type: 'card' } & Card)
  | { type: 'override'; target: string; basket: Basket }
  | { type: 'error'; message: string }
  | { type: 'done' }
