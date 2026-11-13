import { useEffect, useRef, useState } from 'react'
import { getMeta } from '../lib/api'
import { t, type Key } from '../lib/i18n'
import { load, save } from '../lib/store'
import type { Lang, Persona } from '../lib/types'
import { copy, REPO_URL, VIDEO_URL, type SiteKey } from './copy'

const QUESTIONS: Key[] = ['q_safe', 'q_where', 'q_spender', 'q_dining', 'q_save', 'q_compare']
const START_CUSTOMER = 'CUST00028'

function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <rect x="7" y="7.5" width="18" height="4.4" rx="2.2" fill="var(--b-regular)" />
      <rect x="7" y="13.8" width="8" height="4.4" rx="2.2" fill="var(--b-irregular)" />
      <rect x="7" y="20.1" width="13" height="4.4" rx="2.2" fill="var(--b-everyday)" />
    </svg>
  )
}

export default function Site() {
  const [lang, setLangState] = useState<Lang>(() => load<Lang>('lang', navigator.language.startsWith('fi') ? 'fi' : 'en'))
  const [personas, setPersonas] = useState<Persona[]>([])
  const [who, setWho] = useState(START_CUSTOMER)
  const frame = useRef<HTMLIFrameElement>(null)
  // The demo's address is fixed at first render so changing language or customer never reloads it.
  const [demoSrc] = useState(() => `/app/?c=${START_CUSTOMER}&lang=${lang}`)
  const c = (key: SiteKey) => copy[lang][key]

  useEffect(() => {
    getMeta()
      .then((m) => setPersonas(m.personas))
      .catch(() => setPersonas([]))
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const post = (msg: Record<string, string>) => frame.current?.contentWindow?.postMessage(msg, window.location.origin)
  const wide = () => window.matchMedia('(min-width: 980px)').matches
  const setLang = (l: Lang) => {
    setLangState(l)
    save('lang', l)
    post({ kk: 'lang', lang: l })
  }
  /** On a wide screen the phone beside the text answers; on a phone we open the app itself. */
  const ask = (key: Key) => {
    if (wide()) post({ kk: 'ask', key })
    else window.location.assign(`/app/?c=${who}&lang=${lang}`)
  }
  const pick = (id: string) => {
    setWho(id)
    if (wide()) post({ kk: 'persona', id })
    else window.location.assign(`/app/?c=${id}&lang=${lang}`)
  }

  return (
    <div className="site">
      <header className="nav">
        <a className="brand" href="/">
          <Logo />
          <span>Kolme koria</span>
        </a>
        <nav>
          <a href="#how">{c('nav_how')}</a>
          <a href={REPO_URL}>{c('nav_code')}</a>
          <div className="lang" role="group" aria-label="Language">
            {(['fi', 'en'] as const).map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)} aria-pressed={lang === l}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <div className="split">
        <div className="story">
          <section className="hero">
            <p className="kicker">{c('kicker')}</p>
            <h1>{c('h1')}</h1>
            <p className="lead">{c('lead')}</p>
            <div className="cta">
              <a className="button" href={`/app/?lang=${lang}`}>
                {c('cta_demo')}
              </a>
              {VIDEO_URL && (
                <a className="button quiet" href={VIDEO_URL}>
                  {c('cta_video')}
                </a>
              )}
            </div>
            <div className="bars" aria-hidden="true">
              <span style={{ background: 'var(--b-regular)', flexGrow: 58 }} />
              <span style={{ background: 'var(--b-irregular)', flexGrow: 10 }} />
              <span style={{ background: 'var(--b-everyday)', flexGrow: 32 }} />
            </div>
          </section>

          <section>
            <h2>{c('ask_title')}</h2>
            <p className="sub">{c('ask_lead')}</p>
            <div className="questions">
              {QUESTIONS.map((q) => (
                <button key={q} onClick={() => ask(q)}>
                  {t(lang, q)}
                  <span aria-hidden="true">→</span>
                </button>
              ))}
            </div>
            <p className="hint wide-only">{c('try_hint')}</p>
          </section>

          {personas.length > 0 && (
            <section>
              <h2>{c('who_title')}</h2>
              <p className="sub">{c('who_lead')}</p>
              <div className="people">
                {personas.map((p) => (
                  <button key={p.id} className={who === p.id ? 'on' : ''} onClick={() => pick(p.id)}>
                    <b>
                      {p.name}, {p.age}
                    </b>
                    <span>{p.story[lang]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="device-col wide-only" aria-label={c('nav_demo')}>
          <div className="device">
            <iframe ref={frame} title="Kolme koria" src={demoSrc} />
          </div>
        </aside>
      </div>

      <section className="band">
        <div className="inner">
          <h2>{c('b_title')}</h2>
          <p className="sub">{c('b_lead')}</p>
          <div className="baskets">
            {(['regular', 'irregular', 'everyday'] as const).map((b, i) => (
              <article key={b}>
                <i style={{ background: `var(--b-${b})` }} />
                <h3>{c(`b${i + 1}` as SiteKey)}</h3>
                <p>{c(`b${i + 1}d` as SiteKey)}</p>
              </article>
            ))}
          </div>
          <p className="own">{c('b_own')}</p>
        </div>
      </section>

      <section className="inner">
        <h2>{c('f_title')}</h2>
        <div className="grid">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <article key={n}>
              <h3>{c(`f${n}` as SiteKey)}</h3>
              <p>{c(`f${n}d` as SiteKey)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="band dark" id="how">
        <div className="inner">
          <h2>{c('t_title')}</h2>
          <p className="sub">{c('t_lead')}</p>
          <ol className="flow">
            <li>
              <b>{c('flow_1')}</b>
            </li>
            <li className="strong">
              <b>{c('flow_2')}</b>
              <span>{c('flow_2s')}</span>
            </li>
            <li>
              <b>{c('flow_3')}</b>
              <span>{c('flow_3s')}</span>
            </li>
            <li>
              <b>{c('flow_4')}</b>
            </li>
          </ol>
          <div className="grid four">
            {[1, 2, 3, 4].map((n) => (
              <article key={n}>
                <h3>{c(`t${n}` as SiteKey)}</h3>
                <p>{c(`t${n}d` as SiteKey)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="inner two">
        <div>
          <h2>{c('o_title')}</h2>
          <p className="sub">{c('o_lead')}</p>
          <ul className="list">
            <li>{c('o1')}</li>
            <li>{c('o2')}</li>
            <li>{c('o3')}</li>
          </ul>
        </div>
        <div>
          <h2>{c('p_title')}</h2>
          <p className="sub">{c('p_lead')}</p>
          <h2 className="gap">{c('m_title')}</h2>
          <p className="sub">{c('m_lead')}</p>
        </div>
      </section>

      <section className="band">
        <div className="inner">
          <h2>{c('n_title')}</h2>
          <div className="numbers">
            {[1, 2, 3].map((n) => (
              <div key={n}>
                <b>{c(`n${n}` as SiteKey)}</b>
                <span>{c(`n${n}d` as SiteKey)}</span>
              </div>
            ))}
          </div>
          <p className="hint">{c('n_note')}</p>
          <div className="cta">
            <a className="button" href={`/app/?lang=${lang}`}>
              {c('cta_demo')}
            </a>
            <a className="button quiet" href={REPO_URL}>
              {c('nav_code')}
            </a>
          </div>
        </div>
      </section>

      <footer className="inner foot">
        <div className="brand">
          <Logo size={24} />
          <span>Kolme koria</span>
        </div>
        <p>{c('foot_1')}</p>
        <p>
          {c('foot_2')} {c('foot_3')}
        </p>
      </footer>
    </div>
  )
}
