import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BasketsCard, CardView, SafeToSpendCard } from './cards/cards'
import { Explore, type ExplorePreset } from './Explore'
import { getBenchmark, getHome, getMeta, postChallenge, postWhatIf, streamChat } from './lib/api'
import { CoachContext, type Coach } from './lib/ctx'
import { eur, shortDate } from './lib/format'
import { BRAND, hasKey, t, type Key } from './lib/i18n'
import { Markdown } from './lib/md'
import { load, save } from './lib/store'
import type { Basket, Card, Challenge, Home, Insight, Lang, Message, Meta, Overrides, Part, Persona, StreamEvent } from './lib/types'

type Intent = 'safe' | 'where' | 'spender' | 'dining' | 'save' | 'compare'
const STARTERS: { key: Key; intent?: Intent }[] = [
  { key: 'q_safe', intent: 'safe' },
  { key: 'q_where', intent: 'where' },
  { key: 'q_spender', intent: 'spender' },
  { key: 'q_dining', intent: 'dining' },
  { key: 'q_save', intent: 'save' },
  { key: 'q_compare', intent: 'compare' },
  { key: 'q_taxis' },
]

/** The logo: three baskets as three bars, in the same colours as every chart. */
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--tile)" />
      <rect x="7" y="7.500" width="18" height="4.400" rx="2.200" fill="var(--b-regular)" />
      <rect x="7" y="13.800" width="8" height="4.400" rx="2.200" fill="var(--b-irregular)" />
      <rect x="7" y="20.100" width="13" height="4.400" rx="2.200" fill="var(--b-everyday)" />
    </svg>
  )
}

function Welcome({ meta, lang, setLang, onPick }: { meta: Meta; lang: Lang; setLang: (l: Lang) => void; onPick: (p: Persona) => void }) {
  return (
    <main className="welcome">
      <div className="welcome-top">
        <LangToggle lang={lang} setLang={setLang} />
      </div>
      <Mark />
      <h1>{BRAND}</h1>
      <p className="tagline">{t(lang, 'tagline')}</p>
      <p className="muted">{t(lang, 'welcomeLead')}</p>
      <h2>{t(lang, 'pickPersona')}</h2>
      <div className="personas">
        {meta.personas.map((p) => (
          <button key={p.id} className="persona" onClick={() => onPick(p)}>
            <span className="avatar">{p.name[0]}</span>
            <span>
              <strong>
                {p.name}, {t(lang, 'yearsOld', { age: p.age })}
              </strong>
              <small>{p.story[lang]}</small>
              <small className="muted">{p.area}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="muted small">{t(lang, 'personaNote')}</p>
    </main>
  )
}

function LangToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div className="lang" role="group" aria-label="Language">
      {(['fi', 'en'] as const).map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

let nextId = 1
const QUERY = new URLSearchParams(window.location.search)

export default function App() {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [failed, setFailed] = useState(false)
  // ?c=CUST00028&lang=fi opens straight into a customer, handy for demo links.
  const [lang, setLangState] = useState<Lang>(() => (QUERY.get('lang') === 'fi' || QUERY.get('lang') === 'en' ? (QUERY.get('lang') as Lang) : load<Lang>('lang', navigator.language.startsWith('fi') ? 'fi' : 'en')))
  const [personaId, setPersonaId] = useState<string | null>(() => QUERY.get('c') ?? load<string | null>('persona', null))
  const [home, setHome] = useState<Home | null>(null)
  const [overrides, setOverrides] = useState<Overrides>(() => (personaId ? load<Overrides>(`overrides:${personaId}`, {}) : {}))
  const [challenges, setChallenges] = useState<Challenge[]>(() => (personaId ? load<Challenge[]>(`challenges:${personaId}`, []) : []))
  const [messages, setMessages] = useState<Message[]>([])
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [exploring, setExploring] = useState<ExplorePreset | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesRef = useRef<Message[]>([])

  const persona = meta?.personas.find((p) => p.id === personaId) ?? null

  useEffect(() => {
    getMeta()
      .then(setMeta)
      .catch(() => setFailed(true))
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    if (!personaId) return
    let live = true
    getHome(personaId, overrides)
      .then((h) => live && setHome(h))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [personaId, overrides])

  // A new question scrolls to the top of the screen so the answer reads downwards from it.
  const lastUserId = [...messages].reverse().find((m) => m.role === 'user')?.id
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  useEffect(() => {
    if (lastUserId) document.getElementById(`m${lastUserId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [lastUserId])

  const setLang = (l: Lang) => {
    setLangState(l)
    save('lang', l)
  }
  /** Switching customer resets the conversation and loads what they chose earlier on this device. */
  const pick = (id: string | null) => {
    abortRef.current?.abort()
    setMessages([])
    setHome(null)
    setBusy(false)
    setOverrides(id ? load<Overrides>(`overrides:${id}`, {}) : {})
    setChallenges(id ? load<Challenge[]>(`challenges:${id}`, []) : [])
    setPersonaId(id)
    save('persona', id)
  }

  const tr = useCallback((key: Key, vars?: Record<string, string | number>) => t(lang, key, vars), [lang])
  const label = useCallback(
    (key: string) => {
      const l = meta?.labels
      if (!l) return key
      if (key in l.baskets) return l.baskets[key as Basket][lang]
      if (key in l.subs) return l.subs[key][lang]
      if (lang === 'fi' && key in l.categories_fi) return l.categories_fi[key]
      return key
    },
    [meta, lang],
  )

  const setOverride = useCallback(
    (target: string, basket: Basket) => {
      setOverrides((prev) => {
        const next = { ...prev, [target]: basket }
        if (personaId) save(`overrides:${personaId}`, next)
        return next
      })
    },
    [personaId],
  )

  const acceptChallenge = useCallback(
    (c: Challenge) => {
      setChallenges((prev) => {
        const next = [...prev.filter((x) => x.target !== c.target), c]
        if (personaId) save(`challenges:${personaId}`, next)
        return next
      })
    },
    [personaId],
  )

  const patchLast = (fn: (m: Message) => Message) => setMessages((prev) => (prev.length ? [...prev.slice(0, -1), fn(prev[prev.length - 1])] : prev))

  const push = (role: Message['role'], parts: Part[], extra: Partial<Message> = {}) => setMessages((prev) => [...prev, { id: nextId++, role, parts, done: true, ...extra }])

  /** Answers that need no language model: the same engine numbers, with a one-line template. */
  const answerLocally = useCallback(
    async (intent: Intent, question: string) => {
      if (!home || !personaId) return
      push('user', [{ kind: 'text', text: question }])
      const e = (v: number) => eur(v, lang, { cents: false })
      const s = home.safe_to_spend
      const card = (c: Card): Part => ({ kind: 'card', ...c })
      const text = (x: string): Part => ({ kind: 'text', text: x })
      try {
        if (intent === 'safe') push('assistant', [text(tr('a_safe', { week: e(s.safe_this_week), day: eur(s.safe_per_day, lang), date: shortDate(s.next_payday, lang) })), card({ card: 'safe_to_spend', data: s })])
        else if (intent === 'where') {
          const b = home.baskets
          push('assistant', [
            text(tr('a_where', { total: e(b.monthly_total), regular: e(b.baskets.regular.monthly), irregular: e(b.baskets.irregular.monthly), everyday: e(b.baskets.everyday.monthly) })),
            card({ card: 'baskets', data: b }),
            card({ card: 'monthly', data: { months: home.monthly } }),
          ])
        } else if (intent === 'spender') push('assistant', [text(tr('a_spender', { type: home.profile.archetype_label[lang] })), card({ card: 'profile', data: home.profile })])
        else if (intent === 'dining') {
          const w = await postWhatIf(personaId, 'Restaurants', -20, overrides)
          push('assistant', [text(tr('a_dining', { base: e(w.baseline_monthly) })), card({ card: 'what_if', data: w })])
        } else if (intent === 'save') {
          const v = home.safe_to_save
          push('assistant', [text(v.suggested_monthly > 0 ? tr('a_save', { monthly: e(v.suggested_monthly) }) : tr('a_saveNone')), card({ card: 'safe_to_save', data: v })])
        } else {
          const bench = await getBenchmark(personaId)
          push('assistant', [text(tr('a_compare')), card({ card: 'benchmark', data: bench })])
        }
      } catch {
        push('assistant', [], { error: tr('errorGeneric') })
      }
    },
    [home, personaId, lang, tr, overrides],
  )

  const ask = useCallback(
    (question: string) => {
      const q = question.trim()
      if (!q || busy || !personaId || !meta) return
      if (!meta.llm_configured) {
        push('user', [{ kind: 'text', text: q }])
        push('assistant', [{ kind: 'text', text: tr('noLlm') }])
        return
      }
      const history = [...messagesRef.current, { id: 0, role: 'user' as const, parts: [{ kind: 'text' as const, text: q }] }]
        .map((m) => ({
          role: m.role,
          content: m.parts
            .map((p) => (p.kind === 'text' ? p.text : `[card shown: ${p.card}]`))
            .join('\n')
            .slice(0, 3900),
        }))
        .filter((m) => m.content)
        .slice(-20)
      setMessages((prev) => [...prev, { id: nextId++, role: 'user', parts: [{ kind: 'text', text: q }], done: true }, { id: nextId++, role: 'assistant', parts: [], activity: tr('thinking') }])
      setBusy(true)
      const controller = new AbortController()
      abortRef.current = controller
      const onEvent = (ev: StreamEvent) => {
        if (ev.type === 'text') {
          patchLast((m) => {
            const last = m.parts[m.parts.length - 1]
            const parts = last?.kind === 'text' ? [...m.parts.slice(0, -1), { ...last, text: last.text + ev.text }] : [...m.parts, { kind: 'text' as const, text: ev.text }]
            return { ...m, parts, activity: null }
          })
        } else if (ev.type === 'tool') {
          const key = `tool_${ev.name}`
          patchLast((m) => ({ ...m, activity: hasKey(key) ? tr(key) : tr('thinking') }))
        } else if (ev.type === 'card') {
          const { type: _type, ...card } = ev
          patchLast((m) => ({ ...m, parts: [...m.parts, { kind: 'card', ...card } as Part] }))
        } else if (ev.type === 'override') {
          setOverride(ev.target, ev.basket)
        } else if (ev.type === 'verified') {
          patchLast((m) => ({ ...m, verified: { checked: ev.checked, unverified: ev.unverified } }))
        } else if (ev.type === 'error') {
          patchLast((m) => ({ ...m, error: tr('errorGeneric'), activity: null }))
        }
      }
      streamChat({ customer_id: personaId, messages: history, language: lang, overrides }, onEvent, controller.signal)
        .catch(() => {
          if (!controller.signal.aborted) patchLast((m) => ({ ...m, error: tr('errorGeneric') }))
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            patchLast((m) => ({ ...m, activity: null, done: true }))
            setBusy(false)
          }
        })
    },
    [busy, personaId, meta, tr, lang, overrides, setOverride],
  )

  const start = useCallback(
    (s: { key: Key; intent?: Intent }) => {
      const q = tr(s.key)
      if (s.intent && meta && !meta.llm_configured) void answerLocally(s.intent, q)
      else ask(q)
    },
    [tr, meta, answerLocally, ask],
  )

  const makeChallenge = useCallback(
    (target: string, changePct: number) => {
      const vars = { target: label(target), pct: String(changePct).replace('-', '−') }
      if (meta?.llm_configured) return ask(tr('challengeAsk', vars))
      if (!personaId) return
      push('user', [{ kind: 'text', text: tr('challengeAsk', vars) }])
      postChallenge(personaId, target, changePct, overrides)
        .then((plan) => push('assistant', [{ kind: 'card', card: 'challenge', data: { title: tr('challengeName', vars), ...plan } }]))
        .catch(() => push('assistant', [], { error: tr('errorGeneric') }))
    },
    [meta, personaId, overrides, ask, tr, label],
  )

  // The marketing page embeds this app and can ask it questions or switch customer (same origin only).
  const remote = useRef({ start, pick, setLang })
  useEffect(() => {
    remote.current = { start, pick, setLang }
  })
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || typeof ev.data !== 'object' || !ev.data) return
      const d = ev.data as { kk?: string; key?: string; id?: string; lang?: string }
      if (d.kk === 'ask') {
        const s = STARTERS.find((x) => x.key === d.key)
        if (s) remote.current.start(s)
      } else if (d.kk === 'persona' && typeof d.id === 'string' && /^CUST\d{5}$/.test(d.id)) remote.current.pick(d.id)
      else if (d.kk === 'lang' && (d.lang === 'fi' || d.lang === 'en')) remote.current.setLang(d.lang)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const coach: Coach = useMemo(
    () => ({ lang, tr, label, ask, overrides, setOverride, challenges, acceptChallenge, makeChallenge, explore: (preset) => setExploring(preset ?? {}) }),
    [lang, tr, label, ask, overrides, setOverride, challenges, acceptChallenge, makeChallenge],
  )

  const insightText = (i: Insight): string => {
    const key = `i_${i.type}`
    if (!hasKey(key)) return i.type
    const money = (k: string) => (typeof i[k] === 'number' ? eur(i[k] as number, lang, { cents: false }) : '')
    return tr(key, {
      amount: money('amount') || money('projected_balance') || money('monthly'),
      days: Number(i.days ?? 0),
      sub: label(String(i.sub ?? '')),
      extra: money('extra'),
      count: Number(i.count ?? 0),
      total: money('total'),
    })
  }
  const onInsight = (i: Insight) => {
    if (i.type === 'other_bank' && meta && !meta.llm_configured) {
      push('assistant', [{ kind: 'card', card: 'other_bank', data: { monthly: Number(i.monthly ?? 0) } }])
      return
    }
    if (i.type === 'saving_room' && meta && !meta.llm_configured) return void answerLocally('save', tr('iq_saving_room'))
    const key = `iq_${i.type}`
    if (hasKey(key)) ask(tr(key, { sub: label(String(i.sub ?? '')).toLowerCase() }))
  }

  if (failed) return <main className="welcome"><Mark /><h1>{BRAND}</h1><p className="muted">{t(lang, 'errorGeneric')}</p></main>
  if (!meta) return <main className="welcome"><Mark /></main>
  if (!persona) return <Welcome meta={meta} lang={lang} setLang={setLang} onPick={(p) => pick(p.id)} />

  const starters = STARTERS.concat(home?.has_mortgage ? [{ key: 'q_mortgage' as Key }] : [])
  return (
    <CoachContext.Provider value={coach}>
      <div className="app">
        <header className="bar">
          <div className="bar-brand">
            <Mark />
            <span>{BRAND}</span>
          </div>
          <div className="bar-right">
            <LangToggle lang={lang} setLang={setLang} />
            <button className="who" onClick={() => pick(null)} aria-label={tr('switchCustomer')} title={tr('switchCustomer')}>
              <span className="avatar small">{persona.name[0]}</span>
              {persona.name}
            </button>
          </div>
        </header>

        <div className="scroll">
          {home ? (
            <>
              <SafeToSpendCard s={home.safe_to_spend} hero />
              {home.insights.length > 0 && (
                <div className="insights">
                  {home.insights.map((i, n) => (
                    <button key={n} className={`insight sev-${i.severity}`} onClick={() => onInsight(i)}>
                      <span className="dot" />
                      {insightText(i)}
                    </button>
                  ))}
                </div>
              )}
              {challenges.map((c) => (
                <div key={c.target} className="active-challenge">
                  <small>{tr('activeChallenge')}</small>
                  <strong>{c.title}</strong>
                  <span>{tr('challengeGoal', { now: eur(c.weekly_now, lang, { cents: false }), goal: eur(c.weekly_goal, lang, { cents: false }), weeks: c.weeks })}</span>
                </div>
              ))}
              <BasketsCard data={home.baskets} compact />
              <p className="coach-line">{tr('greeting', { name: persona.name })}</p>
            </>
          ) : (
            <div className="card hero skeleton" />
          )}

          {messages.map((m) =>
            m.role === 'user' ? (
              <div key={m.id} id={`m${m.id}`} className="msg user">
                {m.parts.map((p, i) => (p.kind === 'text' ? <p key={i}>{p.text}</p> : null))}
              </div>
            ) : (
              <div key={m.id} className="msg coach">
                {m.parts.map((p, i) =>
                  p.kind === 'text' ? (
                    <div key={i} className="prose">
                      <Markdown text={p.text} />
                    </div>
                  ) : (
                    <CardView key={i} card={p} />
                  ),
                )}
                {m.activity && (
                  <div className="activity">
                    <span className="pulse" />
                    {m.activity}
                  </div>
                )}
                {m.verified && m.verified.unverified.length > 0 && <p className="check warn">{tr('unverified', { list: m.verified.unverified.join(', ') })}</p>}
                {m.verified && m.verified.checked > 0 && m.verified.unverified.length === 0 && (
                  <p className="check">
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3.500 8.500l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {m.verified.checked === 1 ? tr('verifiedOne') : tr('verifiedMany', { n: m.verified.checked })}
                  </p>
                )}
                {m.error && <p className="error">{m.error}</p>}
              </div>
            ),
          )}
          <p className="muted small center">{tr('disclaimer')}</p>
          {messages.length > 0 && <div className="tail" />}
        </div>

        <footer className="composer">
          <div className="chips">
            <button className="chip strong" onClick={() => setExploring({})}>
              {tr('explore')}
            </button>
            {starters.map((s) => (
              <button key={s.key} className="chip" disabled={busy || !home} onClick={() => start(s)}>
                {tr(s.key)}
              </button>
            ))}
          </div>
          <form
            onSubmit={(ev) => {
              ev.preventDefault()
              ask(draft)
              setDraft('')
            }}
          >
            <input value={draft} onChange={(ev) => setDraft(ev.target.value)} placeholder={tr('askPlaceholder')} aria-label={tr('askPlaceholder')} maxLength={1000} enterKeyHint="send" />
            <button type="submit" className="send" disabled={busy || !draft.trim()} aria-label={tr('send')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </form>
        </footer>

        {exploring && home && <Explore customerId={persona.id} today={home.today} preset={exploring} onClose={() => setExploring(null)} />}
      </div>
    </CoachContext.Provider>
  )
}
