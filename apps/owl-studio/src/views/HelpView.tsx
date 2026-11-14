import { useEffect, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { useNow, usePolling } from '../lib/hooks.ts'
import { languageName, speechLocale } from '../lib/languages.ts'
import { CENTER, markFromPoint, markPosition, nudgeMark } from '../lib/mark.ts'
import { href } from '../lib/route.ts'
import { startedAt } from '../lib/seen.ts'
import { onManagerGlasses, stepOf, taskOf, useStudio, whereText, workerName, workerOf } from '../lib/studio.ts'
import { clockTime, duration, freshness, timeAgo } from '../lib/time.ts'
import type { HelpSession, Mark } from '../lib/types.ts'
import { Icon } from '../ui/Icon.tsx'
import { OwlFigure } from '../ui/Owl.tsx'
import { Loading, Problem, StatusTag } from '../ui/parts.tsx'
import { useToast } from '../ui/toast.ts'

const QUICK_REPLIES = ['Show me the label', 'Move closer', 'Hold it still', 'That one is right']

/** Workers who are stuck. The expert sees what they see and the step they are on, and guides them. */
export function HelpView({ selectedId }: { selectedId: string | null }) {
  if (selectedId) return <HelpConsole key={selectedId} helpId={selectedId} />
  return <HelpList />
}

function HelpList() {
  const { sessions, employees, processes, connection } = useStudio()
  const now = useNow(1000)
  const open = (sessions ?? []).filter((session) => session.status !== 'ended')
  const ended = (sessions ?? []).filter((session) => session.status === 'ended').slice(0, 5)

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Help</h1>
          <p className="lede">When a worker is stuck they pinch Help on the glasses. You see what they see and the step they are on, and what you write is spoken in their ear.</p>
        </div>
      </header>

      {sessions === null ? (
        connection.state === 'connecting' ? (
          <Loading what="Looking for help requests" />
        ) : null
      ) : open.length === 0 ? (
        <div className="empty empty-owl">
          <OwlFigure state="done" height={168} />
          <div>
            <h2>No one is waiting</h2>
            <p>A new request shows here and in the menu the moment a worker asks. Keep this page open during the shift.</p>
          </div>
        </div>
      ) : (
        <ul className="rows" aria-label="Open help requests">
          {open.map((session) => (
            <li key={session.id}>
              <a className="row row-link" href={onManagerGlasses(session) ? undefined : href('help', session.id)} aria-disabled={onManagerGlasses(session) || undefined}>
                <span className={session.status === 'waiting' ? 'lamp is-on lamp-lg' : 'lamp lamp-lg'} aria-hidden="true" />
                <span className="row-main">
                  <span className="row-title">{workerName(session, employees)}</span>
                  <span className="row-meta">{whereText(session, processes)}</span>
                </span>
                {session.status === 'ringing' ? (
                  <StatusTag tone="muted" shape="ring">
                    Calling {session.assignee_name ?? 'the shift manager'}
                  </StatusTag>
                ) : session.status === 'accepted' ? (
                  <StatusTag tone="accent" shape="ring">
                    {session.assignee_name ?? 'The shift manager'} is helping
                  </StatusTag>
                ) : session.status === 'waiting' ? (
                  <StatusTag tone="signal" shape="diamond">
                    {session.fallback === 'no_answer' && session.assignee_name ? `${session.assignee_name} did not answer · ` : ''}
                    Waiting {duration(Math.max(0, Math.round((now - startedAt(session, now)) / 1000)))}
                  </StatusTag>
                ) : (
                  <StatusTag tone="accent" shape="ring">
                    You answered {timeAgo(lastExpertAt(session), now)}
                  </StatusTag>
                )}
                <span className="row-go" aria-hidden="true">
                  <Icon name="chevron" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {ended.length > 0 && (
        <section aria-labelledby="ended-heading" className="stack">
          <h2 id="ended-heading">Ended</h2>
          <ul className="rows rows-quiet" aria-label="Ended help requests">
            {ended.map((session) => (
              <li key={session.id}>
                <a className="row row-link" href={href('help', session.id)}>
                  <span className="row-main">
                    <span className="row-title">{workerName(session, employees)}</span>
                    <span className="row-meta">{whereText(session, processes)}</span>
                  </span>
                  <StatusTag tone="muted" shape="square">
                    Ended {clockTime(session.updated_at)}
                  </StatusTag>
                  <span className="row-go" aria-hidden="true">
                    <Icon name="chevron" />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function lastExpertAt(session: HelpSession): string | null {
  const mine = session.messages.filter((message) => message.from === 'expert')
  return mine.length ? mine[mine.length - 1].at : null
}

// The browser's speech recognition, where it has one. Only the parts used here.
interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function HelpConsole({ helpId }: { helpId: string }) {
  const studio = useStudio()
  const toast = useToast()
  const now = useNow(1000)
  const [session, setSession] = useState<HelpSession | null>(() => studio.sessions?.find((s) => s.id === helpId) ?? null)
  const [problem, setProblem] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [mark, setMark] = useState<Mark | null>(null)
  const [sending, setSending] = useState(false)
  const [ending, setEnding] = useState(false)
  const [dictating, setDictating] = useState(false)
  const picture = useRef<HTMLImageElement>(null)
  const talk = useRef<HTMLOListElement>(null)
  const recognition = useRef<Recognition | null>(null)

  const ended = session?.status === 'ended'

  usePolling(
    async () => {
      if (ended) return
      try {
        const next = await studio.api.helpSession(helpId)
        setSession(next)
        studio.putSession(next)
        setProblem(null)
      } catch (error) {
        setProblem(messageOf(error))
      }
    },
    2000,
    helpId,
  )

  // Keep the newest words in view.
  const messageCount = session?.messages.length ?? 0
  useEffect(() => {
    const list = talk.current
    if (list) list.scrollTop = list.scrollHeight
  }, [messageCount])

  useEffect(() => () => recognition.current?.stop(), [])

  if (!session) {
    return (
      <div className="view">
        <BackToHelp />
        {problem ? <Problem>{problem}</Problem> : <Loading what="Opening the help request" />}
      </div>
    )
  }

  if (onManagerGlasses(session)) {
    return (
      <div className="view">
        <BackToHelp />
        <p className="lede">
          {session.status === 'ringing'
            ? `Calling ${session.assignee_name ?? 'the shift manager'} on their glasses. If they do not answer in 30 seconds, the request comes here.`
            : `${session.assignee_name ?? 'The shift manager'} is helping on their own glasses. The live view is only for them.`}
        </p>
      </div>
    )
  }

  const worker = workerOf(session, studio.employees)
  const name = worker?.name ?? 'A worker'
  const task = taskOf(session, studio.processes)
  const step = stepOf(session, studio.processes)
  const fresh = freshness(session.frame_at, now)
  const canDictate = recognitionClass() !== null

  const send = async (words: string) => {
    const message = words.trim()
    if (!message || sending || ended) return
    setSending(true)
    setProblem(null)
    try {
      const next = await studio.api.say(helpId, message, mark)
      setSession(next)
      studio.putSession(next)
      setText('')
      setMark(null)
    } catch (error) {
      setProblem(`Your message was not sent. ${messageOf(error)}`)
    } finally {
      setSending(false)
    }
  }

  const end = async () => {
    setEnding(true)
    try {
      const next = await studio.api.endHelp(helpId)
      setSession(next)
      studio.putSession(next)
      setMark(null)
      toast({ message: `Help ended. ${name}'s picture is deleted.` })
    } catch (error) {
      setProblem(messageOf(error))
    } finally {
      setEnding(false)
    }
  }

  const point = (event: React.MouseEvent) => {
    // A keyboard "click" has no position: start in the middle and let the arrow keys move it.
    if (event.detail === 0) {
      setMark(mark ?? CENTER)
      return
    }
    const box = picture.current?.getBoundingClientRect()
    if (box) setMark(markFromPoint(event.clientX, event.clientY, box))
  }

  const movePoint = (event: React.KeyboardEvent) => {
    if (!mark) return
    const by = event.shiftKey ? 0.1 : 0.02
    const moves: Record<string, [number, number]> = { ArrowLeft: [-by, 0], ArrowRight: [by, 0], ArrowUp: [0, -by], ArrowDown: [0, by] }
    if (event.key in moves) {
      event.preventDefault()
      setMark(nudgeMark(mark, ...moves[event.key]))
    } else if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      setMark(null)
    }
  }

  const dictate = () => {
    if (dictating) {
      recognition.current?.stop()
      return
    }
    const Recognizer = recognitionClass()
    if (!Recognizer) return
    const listener = new Recognizer()
    listener.lang = speechLocale(worker?.language ?? 'en')
    listener.interimResults = false
    listener.continuous = false
    listener.onresult = (event) => {
      const heard = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim()
      if (heard) setText((before) => (before ? `${before} ${heard}` : heard))
    }
    listener.onend = () => setDictating(false)
    listener.onerror = () => setDictating(false)
    recognition.current = listener
    setDictating(true)
    listener.start()
  }

  return (
    <div className="view console">
      <BackToHelp />
      <header className="view-head">
        <div>
          <h1>{name}</h1>
          <p className="lede">{whereText(session, studio.processes)}</p>
        </div>
        {ended ? (
          <StatusTag tone="muted" shape="square">
            Ended {clockTime(session.updated_at)}
          </StatusTag>
        ) : (
          <button type="button" className="button button-quiet is-danger" onClick={() => void end()} disabled={ending}>
            {ending ? 'Ending' : 'End help'}
          </button>
        )}
      </header>

      {problem && <Problem>{problem}</Problem>}

      <div className="console-grid">
        <div className="console-main">
          <section className="console-view" aria-labelledby="view-heading">
            <h2 id="view-heading" className="visually-hidden">
              What {name} sees
            </h2>
            {session.latest_frame_url ? (
              <button
                type="button"
                className="frame"
                onClick={point}
                onKeyDown={movePoint}
                aria-label={`What ${name} sees. Click a spot to point at it. With the keyboard: press Enter, move the ring with the arrow keys, Delete removes it.`}
              >
                <img ref={picture} src={session.latest_frame_url} alt="" draggable={false} />
                {mark && <span className="ring" style={markPosition(mark)} />}
              </button>
            ) : (
              <div className="frame frame-empty">
                <p>{ended ? `The picture was deleted when help ended.` : `Waiting for the first picture from ${name}'s glasses.`}</p>
              </div>
            )}
            <div className="frame-foot">
              {session.latest_frame_url && !ended ? (
                fresh.live ? (
                  <StatusTag tone="success" shape="disc">
                    {fresh.text}
                  </StatusTag>
                ) : (
                  <StatusTag tone="danger" shape="square">
                    {fresh.text}. The glasses may be off or out of range.
                  </StatusTag>
                )
              ) : (
                <span />
              )}
              {!ended && session.latest_frame_url && (
                <span className="hint">
                  {mark ? 'The ring goes on the picture as it is when you send.' : 'Click the picture to point at something.'}
                </span>
              )}
            </div>
          </section>

          <section className="panel talk" aria-labelledby="talk-heading">
            <h2 id="talk-heading">Conversation</h2>
            {session.messages.length === 0 ? (
              <p className="muted">Nothing said yet. {ended ? '' : `Your first message tells ${name} that someone is there.`}</p>
            ) : (
              <ol className="messages" ref={talk} aria-live="polite">
                {session.messages.map((message) => (
                  <li key={message.id} className={message.from === 'expert' ? 'message is-mine' : 'message'}>
                    <p className="message-meta">
                      {message.from === 'expert' ? 'You' : name} · {clockTime(message.at)}
                    </p>
                    <p className="message-text">{message.text}</p>
                    {message.image_url && <img className="message-image" src={message.image_url} alt="The picture with a ring where you pointed" />}
                  </li>
                ))}
              </ol>
            )}

            {!ended && (
              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault()
                  void send(text)
                }}
              >
                <div className="quick" role="group" aria-label="Quick replies">
                  {QUICK_REPLIES.map((reply) => (
                    <button key={reply} type="button" className="chip" onClick={() => void send(reply)} disabled={sending}>
                      {reply}
                    </button>
                  ))}
                </div>
                {mark && (
                  <p className="pointing">
                    <Icon name="point" size={18} />
                    Pointing at the picture
                    <button type="button" className="link-button" onClick={() => setMark(null)}>
                      Remove
                    </button>
                  </p>
                )}
                <label className="visually-hidden" htmlFor="help-message">
                  Message to {name}
                </label>
                <textarea
                  id="help-message"
                  className="input"
                  rows={2}
                  maxLength={500}
                  value={text}
                  placeholder={`Tell ${name} what to do`}
                  onChange={(event) => setText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void send(text)
                    }
                  }}
                />
                <p className="hint">
                  Owl reads it aloud in {name}'s ear{worker ? `, in ${languageName(worker.language)}. Write in that language` : ''}. Enter sends.
                </p>
                <div className="composer-actions">
                  {canDictate && (
                    <button type="button" className={dictating ? 'button button-secondary button-small is-on' : 'button button-quiet button-small'} onClick={dictate} aria-pressed={dictating}>
                      <Icon name="mic" size={18} />
                      {dictating ? 'Listening, stop' : 'Dictate'}
                    </button>
                  )}
                  <button type="submit" className="button button-primary" disabled={sending || !text.trim()}>
                    <Icon name="send" size={18} />
                    {sending ? 'Sending' : 'Send'}
                  </button>
                </div>
                {canDictate && <p className="hint">Dictation uses your browser's speech service, which may send your voice to the browser's maker.</p>}
              </form>
            )}
          </section>
        </div>

        <section className="panel context" aria-labelledby="context-heading">
          <h2 id="context-heading">{step ? `Step ${step.index} of ${task?.steps.length ?? step.index}: ${step.title}` : (task?.title ?? 'Not in a task')}</h2>
          {step ? (
            <>
              <p>{step.instruction}</p>
              {step.check.order_lines?.length ? (
                <ul className="order-summary" aria-label="The order">
                  {step.check.order_lines.map((line) => (
                    <li key={`${line.sku}-${line.name}`}>
                      <span className="qty">{line.qty} ×</span> {line.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              {step.reference_image_url && (
                <figure className="media media-small">
                  <img src={step.reference_image_url} alt={`The expert's photo of step ${step.index} done right`} />
                  <figcaption>What it should look like</figcaption>
                </figure>
              )}
            </>
          ) : (
            <p className="muted">{name} asked for help outside a step.</p>
          )}
        </section>
      </div>
    </div>
  )
}

function BackToHelp() {
  return (
    <a className="back-link" href={href('help')}>
      <Icon name="back" size={18} />
      Help
    </a>
  )
}
