import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { LINKS } from './lib/assets'
import { hasWebGL, prefersReducedMotion } from './lib/motion'
import { ASIDE, EXAMPLE, HANDBOOK, glassesAside, itemTiming } from './intro'
import { LensCard } from './LensCard'
import type { ScreenId } from './lens'
import { BEATS, END_SCREENS, INTRO_SCREENS, STOP_SCREENS, TASK, WALK_SCREENS, beatAt, leadProgress, putOnProgress } from './walk'

const PutOn = lazy(() => import('./three/PutOn'))
const World = lazy(() => import('./three/World'))
const HEADLINE = 'The new way to onboard workers.\nRight in the lens.'
const CLOSING = 'Tonight, Junction’s fridges. Tomorrow, your warehouse.'
const LEGAL = 'A Junction 2026 prototype for Meta’s “AI Glasses for Everyone, Everyday” challenge. Not affiliated with Meta or Junction. Interactive prototype: a made-up 3D Hype with made-up people; the tags stand in for what Owl tells the wearer. Meta, Ray-Ban and Neural Band are trademarks of their owners.'

/** The owl silhouette (shared/brand/owl-mark.svg) beside the name; `big` stacks them for the ending. */
function OwlBrand({ big = false }: { big?: boolean }) {
  const size = big ? 64 : 32
  return <p className={big ? 'wordmark big' : 'wordmark'}><img src={`${import.meta.env.BASE_URL}owl/logo-light.svg`} alt="" width={size} height={size} /><span>OwlBoarding</span></p>
}

/** A line whose words rise in one after another when `on`, and leave together. A newline starts a new row. */
function Line({ text, on, as: Tag = 'p', className }: { text: string; on: boolean; as?: 'p' | 'h1' | 'h2'; className?: string }) {
  const rows = text.split('\n').map(row => row.split(' '))
  const firsts = rows.map((_, r) => rows.slice(0, r).reduce((sum, words) => sum + words.length, 0))
  return (
    <Tag className={`line${on ? ' on' : ''}${className ? ` ${className}` : ''}`} aria-hidden={on ? undefined : true}>
      {rows.map((words, r) => (
        <span key={r} className="row">
          {words.map((word, i) => (
            <span key={i}>
              <span className="w" style={{ '--i': firsts[r] + i } as CSSProperties}>{word}</span>
              {i < words.length - 1 ? ' ' : ''}
            </span>
          ))}
        </span>
      ))}
    </Tag>
  )
}

export default function App() {
  const [webgl] = useState(hasWebGL)
  return <main>{webgl ? <Walk /> : <Compact />}</main>
}

type WalkRef = { index: number; within: number; ended: boolean }

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The handbook's items, for the put-on's progress `p`: each comes into the list, then streams into the glasses, which
 * stand aside where PutOn puts them (intro.ts). The list sits in a full-screen box, so the items' resting places are
 * their offsets, which transforms do not change.
 */
function streamHandbook(p: number, stage: HTMLElement, wrap: HTMLElement | null, reduced: boolean) {
  if (!wrap) return
  const width = stage.clientWidth
  const height = stage.clientHeight
  const tall = width < height * 0.9
  const aside = glassesAside(p)
  const tx = ((1 + (tall ? 0 : ASIDE.wide * aside)) / 2) * width
  const ty = ((1 - (tall ? ASIDE.tall * aside : 0)) / 2) * height
  const items = [...wrap.querySelectorAll<HTMLElement>('li')]
  // All the reading first, then all the writing, so a scroll frame lays the page out once.
  const rests = items.map(li => [li.offsetLeft + li.offsetWidth / 2, li.offsetTop + li.offsetHeight / 2])
  items.forEach((li, i) => {
    const { appear, flight } = itemTiming(i, p)
    if (reduced) {
      li.style.opacity = String(appear * (1 - flight))
      li.style.transform = ''
      return
    }
    const e = flight * flight * flight
    const dx = (tx - rests[i][0]) * e + (1 - appear) * 18
    const dy = (ty - rests[i][1]) * e
    li.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(1 - 0.82 * e).toFixed(3)})`
    li.style.opacity = String(appear * (1 - smooth(0.7, 1, flight)))
  })
}

/** Without 3D the walk has nothing to show, so the page is one short screen instead. */
function Compact() {
  return (
    <section className="compact">
      <h1>{HEADLINE}</h1>
      <p className="example">{EXAMPLE.title} {EXAMPLE.body}</p>
      <OwlBrand />
      <p className="task">{TASK}</p>
      <ol>{BEATS.map(b => <li key={b.id}>{b.line}</li>)}</ol>
      <h2>{CLOSING}</h2>
      <div className="ending-links">
        {LINKS.film && <a href={LINKS.film} target="_blank" rel="noreferrer">Watch the film</a>}
        <a href={LINKS.studio} target="_blank" rel="noreferrer">View admin dashboard</a>
        <a href={LINKS.repo} target="_blank" rel="noreferrer">Source on GitHub</a>
      </div>
      <p className="legal-inline">{LEGAL}</p>
    </section>
  )
}

function Walk() {
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const lidTop = useRef<HTMLDivElement>(null)
  const lidBottom = useRef<HTMLDivElement>(null)
  const putOn = useRef(0)
  const handbook = useRef<HTMLDivElement>(null)
  const walk = useRef<WalkRef>({ index: 0, within: 0, ended: false })
  const pointer = useRef({ x: 0, y: 0 })
  const [index, setIndex] = useState(0)
  const [wearing, setWearing] = useState(false)
  // The world behind the landing is hidden until the lenses open, so it waits until the glasses are near the eyes.
  const [nearEyes, setNearEyes] = useState(false)
  const [landing, setLanding] = useState(true)
  // The lead: the headline at the top, then the statement of what the example is, until the handbook comes in.
  const [atTop, setAtTop] = useState(true)
  const [example, setExample] = useState(false)
  const [ended, setEnded] = useState(false)
  const [inView, setInView] = useState(true)
  const [ready, setReady] = useState(false)
  const [reduced, setReduced] = useState(prefersReducedMotion)
  const [glassesReady, setGlassesReady] = useState(false)
  const onGlassesReady = useCallback(() => setGlassesReady(true), [])
  const still = useRef(reduced)
  useEffect(() => {
    still.current = reduced
  }, [reduced])

  // The eyelids: 0 open, 1 closed. The world drives them for the blinks between far stops and at the end.
  const onLids = useCallback((closed: number) => {
    const shut = Math.min(1, Math.max(0, closed))
    if (lidTop.current) lidTop.current.style.transform = `translateY(${(shut - 1) * 100}%)`
    if (lidBottom.current) lidBottom.current.style.transform = `translateY(${(1 - shut) * 100}%)`
  }, [])
  const onStop = useCallback((stop: number) => setIndex(stop), [])
  const [screen, setScreen] = useState<ScreenId | null>(null)
  const onScreen = useCallback((id: ScreenId | null) => setScreen(id), [])

  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true))
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMedia = () => setReduced(media.matches)
    const onPointer = (e: PointerEvent) => {
      pointer.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 }
    }
    media.addEventListener('change', onMedia)
    window.addEventListener('pointermove', onPointer, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      media.removeEventListener('change', onMedia)
      window.removeEventListener('pointermove', onPointer)
    }
  }, [])

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const el = root.current
      const st = stage.current
      if (!el || !st) return
      const rect = el.getBoundingClientRect()
      const viewport = window.innerHeight
      const scrolled = -rect.top
      const lead = leadProgress(scrolled, viewport)
      const p = putOnProgress(scrolled, viewport)
      putOn.current = p
      st.style.setProperty('--lead', lead.toFixed(4))
      st.style.setProperty('--puton', p.toFixed(4))
      streamHandbook(p, st, handbook.current, still.current)
      setAtTop(lead < EXAMPLE.SHOW)
      setExample(lead >= EXAMPLE.SHOW && p < 0.03)
      setWearing(p >= 0.96)
      setNearEyes(p >= 0.7)
      setLanding(p < 1)
      setInView(rect.bottom > 0 && rect.top < viewport)
      // The stops start once the glasses are on, measured from the middle of the viewport.
      const position = scrolled - INTRO_SCREENS * viewport + viewport / 2
      const at = beatAt(position, viewport, STOP_SCREENS)
      const within = position < 0 ? 0 : at.progress
      const end = position >= (WALK_SCREENS + 0.15) * viewport
      walk.current = { index: at.index, within, ended: end }
      setEnded(end)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  const walking = wearing && !ended
  return <section id="walk" className={`walk${wearing ? ' wearing' : ''}${ended ? ' ended' : ''}`} ref={root} aria-label="Aino’s first crew shift at Junction 2026, through her glasses">
    <div className={reduced ? 'stage still' : 'stage'} ref={stage}>
      <div className="scene" aria-hidden="true">
        <Suspense fallback={null}><World walk={walk} pointer={pointer} onLids={onLids} onStop={onStop} onScreen={onScreen} reduced={reduced} active={inView && !ended && nearEyes} /></Suspense>
      </div>
      <div className="shade" aria-hidden="true" />
      <div className="caption" aria-hidden="true">
        <p className="task">{TASK}</p>
        <div className="lines">{BEATS.map((b, i) => <Line key={b.id} text={b.line} on={walking && i === index} />)}</div>
        <ol className="stops">{BEATS.map((b, i) => <li key={b.id} className={i <= index ? 'on' : undefined} />)}</ol>
      </div>
      <LensCard id={walking ? screen : null} />
      <p className="sim-note" aria-hidden="true">Interactive prototype</p>
      <div className="lid lid-top" ref={lidTop} aria-hidden="true" />
      <div className="lid lid-bottom" ref={lidBottom} aria-hidden="true" />
      <div className={glassesReady ? 'landing ready' : 'landing'} aria-hidden={wearing || undefined}>
        <div className="landing-backdrop" />
        <Suspense fallback={null}><PutOn progress={putOn} reduced={reduced} active={landing && inView} interactive={!wearing} onReady={onGlassesReady} /></Suspense>
        <div className="landing-brand"><OwlBrand /></div>
        <div className="handbook-wrap" ref={handbook}>
          <div className="handbook">
            <p className="handbook-kicker">{HANDBOOK.kicker}</p>
            <h2>{HANDBOOK.title}</h2>
            <ul>
              {HANDBOOK.items.map(item => (
                <li key={item.title}><i /><b>{item.title}</b><span>{item.detail}</span></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="landing-copy">
          <Line as="h1" text={HEADLINE} on={ready && atTop} />
          <p className="scroll-hint"><span className="scroll-cue" aria-hidden="true" />Scroll to put them on</p>
        </div>
        <div className="landing-example">
          <Line as="h2" text={EXAMPLE.title} on={example} />
          <Line text={EXAMPLE.body} on={example} className="sub" />
        </div>
      </div>
      <div className="ending" aria-hidden={ended ? undefined : true}>
        <OwlBrand big />
        <Line as="h2" text={CLOSING} on={ended} />
        <div className="ending-links">
          {LINKS.film && <a href={LINKS.film} target="_blank" rel="noreferrer" tabIndex={ended ? undefined : -1}>Watch the film</a>}
          <a href={LINKS.studio} target="_blank" rel="noreferrer" tabIndex={ended ? undefined : -1}>View admin dashboard</a>
          <a href={LINKS.repo} target="_blank" rel="noreferrer" tabIndex={ended ? undefined : -1}>Source on GitHub</a>
        </div>
        <p className="legal">{LEGAL}</p>
      </div>
    </div>
    <div className="beats">
      <div style={{ height: `${INTRO_SCREENS * 100}svh` }} aria-hidden="true" />
      {BEATS.map((b, i) => <article key={b.id} id={`stop-${i}`} className="beat" style={{ height: `${(b.screens ?? 1) * 100}svh` }}>
        <h2 className="visually-hidden">{b.line}</h2>
      </article>)}
      <div style={{ height: `${END_SCREENS * 100}svh` }} />
    </div>
  </section>
}
