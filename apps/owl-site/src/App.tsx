import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ASSETS, LINKS, hasVideo } from './lib/assets'
import { hasWebGL, prefersReducedMotion } from './lib/motion'
import { Pov } from './Pov'
import { Scene, type Fly } from './three/Scene'

type PovState = 'off' | 'entering' | 'on' | 'leaving'

const FEATURES = [
  {
    name: 'Record',
    title: 'Your best worker, once.',
    text: 'An experienced worker does the task with the glasses on and talks it through. Owl turns it into a guided process: steps, short clips and what to check.',
  },
  {
    name: 'Learn & Check',
    title: 'Every step, in view.',
    text: "The new hire sees each step in the lens and can watch the expert's clip. Owl looks through the camera and catches the wrong product or quantity before the box is sealed.",
  },
  {
    name: 'Ask',
    title: 'Answers from your handbook.',
    text: "Ask out loud. Owl answers from the company's own instructions and names the source. If it isn't written down, Owl says so instead of guessing.",
  },
  {
    name: 'Help',
    title: 'An expert, one tap away.',
    text: 'Stuck? Share the view with a remote expert, who sees the current step and guides by voice.',
  },
]

const POCKET = [
  { title: '“Hey Meta, start Owl.”', text: 'Owl opens by voice. No phone, no app to find.' },
  { title: 'Neural Band', text: 'A pinch confirms. A swipe moves to the next step. Hands stay on the work.' },
  { title: 'Display', text: 'Steps and clips in the right lens. Answers in the open-ear speakers.' },
]

const TRUST = [
  {
    title: 'Never marks a wrong order done.',
    text: "Two frames must agree before a step passes. When the camera can't tell, Owl says it is unsure and asks to look again.",
  },
  {
    title: 'The knowledge stays with the company.',
    text: "Processes and handbooks belong to the employer. Check photos aren't stored, and faces in recordings are blurred.",
  },
  {
    title: 'A learning aid, not a monitor.',
    text: "Owl doesn't score people. Progress belongs to the worker and is shared only with their consent.",
  },
]

function Reveal({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setShown(true), { rootMargin: '0px 0px -12% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`reveal ${shown ? 'shown' : ''} ${className}`}>
      {children}
    </div>
  )
}

function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 40" aria-hidden="true">
      <circle cx="18" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="46" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="4.5" />
      <circle cx="46" cy="20" r="4.5" fill="var(--accent)" />
      <circle cx="18" cy="20" r="4.5" fill="currentColor" />
    </svg>
  )
}

export default function App() {
  const [reduced] = useState(prefersReducedMotion)
  const [webgl] = useState(hasWebGL)
  const [pov, setPov] = useState<PovState>('off')
  const [video, setVideo] = useState<{ mp4: string | null; webm: string | null }>({ mp4: null, webm: null })
  const [heroVisible, setHeroVisible] = useState(true)
  const heroRef = useRef<HTMLElement>(null)
  const povRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([hasVideo(ASSETS.povMp4), hasVideo(ASSETS.povWebm)]).then(([mp4, webm]) =>
      setVideo({ mp4: mp4 ? ASSETS.povMp4 : null, webm: webm ? ASSETS.povWebm : null }),
    )
  }, [])

  useEffect(() => {
    const el = heroRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setHeroVisible(e.isIntersecting))
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const setPovOpacity = useCallback((k: number) => {
    const el = povRef.current
    if (el) el.style.opacity = String(Math.min(1, Math.max(0, (k - 0.62) / 0.38)))
  }, [])

  const enter = useCallback(() => {
    if (pov !== 'off') return
    if (!webgl) {
      setPovOpacity(1)
      setPov('on')
      return
    }
    if (window.scrollY > 40) {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' })
      window.setTimeout(() => setPov('entering'), reduced ? 0 : 650)
    } else {
      setPov('entering')
    }
  }, [pov, webgl, reduced, setPovOpacity])

  const leave = useCallback(() => {
    if (!webgl) {
      setPovOpacity(0)
      setPov('off')
      return
    }
    setPov('leaving')
  }, [webgl, setPovOpacity])

  const onArrived = useCallback((dir: 'in' | 'out') => setPov(dir === 'in' ? 'on' : 'off'), [])

  const fly: Fly = pov === 'entering' || pov === 'on' ? 'in' : pov === 'leaving' ? 'out' : 'orbit'

  return (
    <>
      <header className="nav">
        <a className="brand" href="#top" aria-label="Onboarding Owl, back to top">
          <Mark />
          <span>Onboarding Owl</span>
        </a>
        <nav aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#trust">Trust</a>
          <a href="#pilot">Pilot</a>
        </nav>
        <button type="button" className="btn btn-small" onClick={enter}>
          See through Owl
        </button>
      </header>

      <main id="top">
        <section className="hero" ref={heroRef}>
          <div className="hero-stage" aria-hidden={pov !== 'off'}>
            {webgl ? (
              <Scene
                fly={fly}
                active={heroVisible || pov !== 'off'}
                reduced={reduced}
                videoUrl={video.mp4}
                onProgress={setPovOpacity}
                onArrived={onArrived}
              />
            ) : (
              <div className="scene-fallback" role="img" aria-label="Meta Ray-Ban Display glasses with Onboarding Owl">
                <Mark />
              </div>
            )}
          </div>
          <div className={`hero-copy ${pov !== 'off' ? 'hidden' : ''}`}>
            <p className="eyebrow">For Meta Ray-Ban Display</p>
            <h1>
              Day one.
              <br />
              Done right.
            </h1>
            <p className="lede">
              Onboarding Owl puts your best worker's know-how in front of every new hire's eyes, step by step, and checks
              the work as it happens.
            </p>
            <div className="ctas">
              <button type="button" className="btn" onClick={enter}>
                <EyeIcon /> See through Owl
              </button>
              {LINKS.film && (
                <a className="btn btn-ghost" href={LINKS.film} target="_blank" rel="noreferrer">
                  Watch the film <span aria-hidden="true">›</span>
                </a>
              )}
            </div>
          </div>
          {webgl && pov === 'off' && <p className="hint">Drag to turn the glasses</p>}
        </section>

        <section className="statement">
          <Reveal>
            <p className="big">
              Office onboarding has a hundred apps.
              <br />
              <span className="dim">The warehouse floor has a colleague who's busy.</span>
            </p>
            <p className="support">
              Warehouses, kitchens, bakeries and building sites learn by shadowing. The know-how is tacit, so onboarding is
              slow and costly, and companies end up hiring only people who already know the job.
            </p>
          </Reveal>
        </section>

        <section id="how" className="section">
          <Reveal>
            <p className="eyebrow">How it works</p>
            <h2>Learn the job from the person who does it best.</h2>
          </Reveal>
          <div className="grid four">
            {FEATURES.map((f, i) => (
              <Reveal key={f.name} className="card">
                <span className="step">{String(i + 1).padStart(2, '0')}</span>
                <p className="card-name">{f.name}</p>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="section band">
          <Reveal>
            <p className="eyebrow">Hands-free</p>
            <h2>The phone stays in the pocket.</h2>
            <p className="support">
              The employer pairs the glasses once. After that, the new worker never takes out a phone.
            </p>
          </Reveal>
          <div className="grid three">
            {POCKET.map((p) => (
              <Reveal key={p.title} className="tile">
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </Reveal>
            ))}
          </div>
          <Reveal className="center">
            <button type="button" className="btn" onClick={enter}>
              <EyeIcon /> See what the worker sees
            </button>
          </Reveal>
        </section>

        <section className="section">
          <Reveal className="split">
            <div>
              <p className="eyebrow">Inclusive by design</p>
              <h2>Hire anyone.</h2>
            </div>
            <div className="split-text">
              <p>
                Instructions in the worker's own language. Pictures and clips instead of walls of text for people with
                dyslexia. Calm, repeatable steps for supported employment.
              </p>
              <p>And for everyone, on their first day.</p>
              <ul className="chips" aria-label="Example languages">
                <li>English</li>
                <li>Suomi</li>
                <li>Svenska</li>
                <li>Українська</li>
                <li>العربية</li>
                <li>Español</li>
              </ul>
            </div>
          </Reveal>
        </section>

        <section id="trust" className="section">
          <Reveal>
            <p className="eyebrow">Trust</p>
            <h2>Built to be trusted on the floor.</h2>
          </Reveal>
          <div className="grid three">
            {TRUST.map((t) => (
              <Reveal key={t.title} className="card">
                <h3>{t.title}</h3>
                <p>{t.text}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="pilot" className="section pilot">
          <Reveal>
            <p className="eyebrow">Pilot</p>
            <h2>One site. Three new hires.</h2>
            <p className="support">
              We measure the time until each new hire works alone, and the mistakes Owl caught before they reached a
              customer. Paid per site by the employer.
            </p>
            <div className="ctas center">
              <button type="button" className="btn" onClick={enter}>
                <EyeIcon /> See through Owl
              </button>
              <a className="btn btn-ghost" href={LINKS.repo} target="_blank" rel="noreferrer">
                Source on GitHub <span aria-hidden="true">›</span>
              </a>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="footer">
        <div className="brand">
          <Mark />
          <span>Onboarding Owl</span>
        </div>
        <p>
          Built at Junction 2026 for the Meta challenge “AI Glasses for Everyone, Everyday”. An independent project, not
          affiliated with or endorsed by Meta. Meta, Ray-Ban and Neural Band are trademarks of their owners.
        </p>
      </footer>

      <Pov
        ref={povRef}
        open={pov === 'on' || pov === 'entering'}
        videoUrl={video.mp4}
        webmUrl={video.webm}
        posterUrl={ASSETS.povPoster}
        reduced={reduced}
        onClose={leave}
      />
    </>
  )
}

function EyeIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
    </svg>
  )
}
