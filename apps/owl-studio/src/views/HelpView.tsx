import { Button, ButtonGroup, ButtonGroupAlignment, ButtonRail, Card, Chip, ChipStyle, ContainerHeader, CornerRadius, InputTextView, MaterialLibrary, Page, Panel, QuickReplyButton, ScrollView, StaticContainer, TailShapeProvider, TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import { useEffect, useMemo, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { useNow, usePolling } from '../lib/hooks.ts'
import { languageName, speechLocale } from '../lib/languages.ts'
import { CENTER, markFromPoint, markPosition, nudgeMark } from '../lib/mark.ts'
import { href } from '../lib/route.ts'
import { startedAt } from '../lib/seen.ts'
import { onManagerGlasses, onManagerPhone, stepOf, taskOf, useStudio, whereText, workerName, workerOf } from '../lib/studio.ts'
import { clockTime, duration, freshness, timeAgo } from '../lib/time.ts'
import type { HelpSession, Mark } from '../lib/types.ts'
import { ICONS } from '../ui/icons.ts'
import { DangerButton, PrimaryButton, Problem, StatusText, Waiting } from '../ui/meta.tsx'
import { keepCaretKeys } from '../ui/keys.ts'
import type { Tone } from '../ui/meta.tsx'
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
  // Whoever still waits for a person comes first; the server's order (newest first) holds within each group.
  // A call ringing for a manager who answers here, on the phone (JUN-107), waits for a person too.
  const asks = (session: HelpSession) => session.status === 'waiting' || (session.status === 'ringing' && onManagerPhone(session))
  const open = (sessions ?? []).filter((session) => session.status !== 'ended').sort((a, b) => Number(asks(b)) - Number(asks(a)))
  const ended = (sessions ?? []).filter((session) => session.status === 'ended').slice(0, 5)
  const waitingCount = open.filter((session) => session.status === 'waiting').length

  return (
    <Page headerText="Help" headerMetadata={waitingCount ? `${waitingCount} waiting` : undefined} enableSystemBarInset={false} className="route">
      <ScrollView insetForHeader ariaLabel="Help requests" className="route-scroll">
        <div className="route-content">
          <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="lede">
            When a worker is stuck they pinch Help on the glasses. You see what they see and the step they are on, and what you write is spoken in their ear.
          </TextView>

          {sessions === null && connection.state === 'connecting' && <Waiting what="Looking for help requests" />}

          {sessions !== null && open.length === 0 && (
            <Panel width="100%">
              <div className="panel-body panel-owl">
                <img className="owl-figure" src="/owl/full/done.png" alt="" height={220} />
                <div className="panel-body-text">
                  <TextView as="h2" textStyle={TextStyle.BODY2_EMPHASIZED}>
                    No one is waiting
                  </TextView>
                  <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                    A new request shows here and in the menu the moment a worker asks. Keep this page open during the shift.
                  </TextView>
                </div>
              </div>
            </Panel>
          )}

          {open.length > 0 && (
            <ul className="tile-grid" aria-label="Open help requests">
              {open.map((session) => {
                const status =
                  session.status === 'ringing' && onManagerPhone(session)
                    ? { tone: 'warning' as const, text: `Calling ${session.assignee_name ?? 'the shift manager'}: answer here` }
                    : session.status === 'ringing'
                    ? { tone: 'info' as const, text: `Calling ${session.assignee_name ?? 'the shift manager'}` }
                    : session.status === 'accepted'
                      ? { tone: 'info' as const, text: `${session.assignee_name ?? 'The shift manager'} is helping` }
                      : session.status === 'waiting'
                        ? {
                            tone: 'warning' as const,
                            text: `${session.fallback === 'no_answer' && session.assignee_name ? `${session.assignee_name} did not answer · ` : ''}Waiting ${duration(Math.max(0, Math.round((now - startedAt(session, now)) / 1000)))}`,
                          }
                        : { tone: 'quiet' as const, text: `You answered ${timeAgo(lastExpertAt(session), now)}` }
                return (
                  <li key={session.id}>
                    <RequestTile session={session} name={workerName(session, employees)} where={whereText(session, processes)} status={status} />
                  </li>
                )
              })}
            </ul>
          )}

          {ended.length > 0 && (
            <section aria-labelledby="ended-heading" className="route-section">
              <TextView as="h2" id="ended-heading" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                ENDED
              </TextView>
              <ul className="tile-grid" aria-label="Ended help requests">
                {ended.map((session) => (
                  <li key={session.id}>
                    <RequestTile session={session} name={workerName(session, employees)} where={whereText(session, processes)} status={{ tone: 'quiet', text: `Ended ${clockTime(session.updated_at)}` }} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollView>
    </Page>
  )
}

/**
 * One request: who, where they are, and its state in words. A call on the shift manager's glasses is theirs, so it is
 * shown but is not a destination here (JUN-100).
 */
function RequestTile({ session, name, where, status }: { session: HelpSession; name: string; where: string; status: { tone: Tone; text: string } }) {
  const content = (
    <div className="tile-body">
      <ContainerHeader title={name} subtitle={where} icon={ICONS.help} />
      <StatusText tone={status.tone}>{status.text}</StatusText>
    </div>
  )
  if (onManagerGlasses(session)) {
    return (
      <Panel width="100%" className="request-tile">
        {content}
      </Panel>
    )
  }
  return (
    <Card width="100%" className="request-tile" aria-label={`${name}, ${status.text}. ${where}`} onClick={() => (window.location.hash = href('help', session.id))}>
      {content}
    </Card>
  )
}

/** JUN-107: the manager on shift has no glasses and answers the worker's call here, on their phone. */
function AnswerCall({ session, onAnswered }: { session: HelpSession; onAnswered: (session: HelpSession) => void }) {
  const studio = useStudio()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const manager = session.assignee_name ?? 'the shift manager'
  const worker = workerName(session, studio.employees)

  const answer = async (later: boolean) => {
    if (!session.assignee) return
    setBusy(true)
    setProblem(null)
    try {
      onAnswered(later ? await studio.api.laterHelp(session.id, session.assignee) : await studio.api.acceptHelp(session.id, session.assignee))
      if (later) window.location.hash = href('help')
    } catch (error) {
      setProblem(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page headerText={worker} headerMetadata={`Calling ${manager}`} enableSystemBarInset={false} className="route">
      <ScrollView insetForHeader ariaLabel="Help call" className="route-scroll" tabIndex={0}>
        <div className="route-content">
          <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="lede">
            {`${worker} needs help with ${whereText(session, studio.processes)} and is calling ${manager}, the shift manager. When you answer, ${worker}'s glasses say that ${manager} is watching their view.`}
          </TextView>
          {problem && <Problem>{problem}</Problem>}
          <ButtonGroup alignment={ButtonGroupAlignment.START}>
            <PrimaryButton title={`Answer as ${manager}`} icon={ICONS.check} alwaysShowText showLoader={busy} disabled={busy} onClick={() => void answer(false)} />
            <Button title="Later" alwaysShowText disabled={busy} onClick={() => void answer(true)} />
          </ButtonGroup>
        </div>
      </ScrollView>
    </Page>
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
    talk.current?.lastElementChild?.scrollIntoView?.({ block: 'end' })
  }, [messageCount])

  useEffect(() => () => recognition.current?.stop(), [])

  if (!session) {
    return (
      <Page headerText="Help" enableSystemBarInset={false} className="route">
        <ScrollView insetForHeader ariaLabel="Help request" className="route-scroll">
          <div className="route-content">{problem ? <Problem>{problem}</Problem> : <Waiting what="Opening the help request" />}</div>
        </ScrollView>
      </Page>
    )
  }

  if (onManagerGlasses(session)) {
    return (
      <Page headerText={workerName(session, studio.employees)} enableSystemBarInset={false} className="route">
        <ScrollView insetForHeader ariaLabel="Help request" className="route-scroll" tabIndex={0}>
          <div className="route-content">
            <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="lede">
              {session.status === 'ringing'
                ? `Calling ${session.assignee_name ?? 'the shift manager'} on their glasses. If they do not answer in 30 seconds, the request comes here.`
                : `${session.assignee_name ?? 'The shift manager'} is helping on their own glasses. The live view is only for them.`}
            </TextView>
          </div>
        </ScrollView>
      </Page>
    )
  }

  if (session.status === 'ringing' && onManagerPhone(session)) {
    const answered = (next: HelpSession) => {
      setSession(next)
      studio.putSession(next)
    }
    return <AnswerCall session={session} onAnswered={answered} />
  }

  // JUN-107: the manager on shift answered here, on the phone. Their words go to the glasses as the manager's.
  const asManager = session.status === 'accepted' && onManagerPhone(session)
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
      const next = asManager ? await studio.api.say(helpId, message, mark, 'manager') : await studio.api.say(helpId, message, mark)
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
    <Page headerText={name} headerMetadata={ended ? 'Ended' : asManager ? `${session.assignee_name ?? 'Shift manager'} on the call` : session.status === 'connected' ? 'Connected' : 'Waiting'} enableSystemBarInset={false} className="route">
      <div className="console">
        <section className="console-view" aria-labelledby="view-heading">
          <TextView as="h2" id="view-heading" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            {`WHAT ${name.toUpperCase()} SEES`}
          </TextView>
          {problem && <Problem>{problem}</Problem>}
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
            <Panel width="100%" className="frame-empty">
              <div className="panel-body">
                <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                  {ended ? `The picture was deleted when help ended.` : `Waiting for the first picture from ${name}'s glasses.`}
                </TextView>
              </div>
            </Panel>
          )}
          <div className="frame-foot">
            {session.latest_frame_url && !ended ? (
              fresh.live ? (
                <StatusText tone="positive">{fresh.text}</StatusText>
              ) : (
                <StatusText tone="negative">{`${fresh.text}. The glasses may be off or out of range.`}</StatusText>
              )
            ) : (
              <span />
            )}
            {!ended && session.latest_frame_url && (
              <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                {mark ? 'The ring goes on the picture as it is when you send.' : 'Click the picture to point at something.'}
              </TextView>
            )}
          </div>
          <div className="action-dock">
            {ended ? (
              <StatusText tone="quiet">{`Ended ${clockTime(session.updated_at)}`}</StatusText>
            ) : (
              <ButtonGroup alignment={ButtonGroupAlignment.START}>
                <DangerButton title={ending ? 'Ending' : 'End help'} icon={ICONS.x} showLoader={ending} onClick={() => void end()} />
              </ButtonGroup>
            )}
          </div>
        </section>

        <section className="console-talk" aria-labelledby="talk-heading">
          <TextView as="h2" id="talk-heading" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            CONVERSATION
          </TextView>
          <ScrollView ariaLabel="Conversation" className="talk-scroll" tabIndex={session.messages.length ? 0 : undefined}>
            {session.messages.length === 0 ? (
              <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="talk-empty">
                {`Nothing said yet. ${ended ? '' : `Your first message tells ${name} that someone is there.`}`}
              </TextView>
            ) : (
              <ol className="messages" ref={talk} aria-live="polite">
                {session.messages.map((message) => (
                  <Bubble key={message.id} mine={message.from !== 'worker'} who={message.from === 'worker' ? name : message.from === 'manager' ? (asManager ? 'You' : (session.assignee_name ?? 'Shift manager')) : asManager ? 'Owl Studio' : 'You'} at={clockTime(message.at)} text={message.text} image={message.image_url} />
                ))}
              </ol>
            )}
          </ScrollView>

          {!ended && (
            <div className="composer">
              <div className="quick" role="group" aria-label="Quick replies">
                <ButtonRail>
                  {QUICK_REPLIES.map((reply) => (
                    <QuickReplyButton key={reply} title={reply} onClick={() => void send(reply)} />
                  ))}
                </ButtonRail>
              </div>
              {mark && (
                <div className="pointing">
                  <Chip text="Pointing at the picture" icon={ICONS.point} chipStyle={ChipStyle.EMPHASIZED} />
                  <Button title="Remove the ring" icon={ICONS.x} onClick={() => setMark(null)} />
                </div>
              )}
              <InputTextView
                className="send-field"
                text={text}
                hint={`Tell ${name} what to do`}
                actionLabel="Send"
                actionIcon={ICONS.send}
                showLoader={sending}
                loadingLabel="Sending"
                onTextChange={setText}
                onSend={(words) => void send(words)}
                inputProps={{ 'aria-label': `Message to ${name}`, maxLength: 500, onKeyDown: keepCaretKeys }}
              />
              <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                {`Owl reads it aloud in ${name}'s ear${worker ? `, in ${languageName(worker.language)}. Write in that language` : ''}. Enter sends.`}
              </TextView>
              {canDictate && (
                <div className="dictate">
                  <Button title={dictating ? 'Listening, stop' : 'Dictate'} icon={ICONS.mic} alwaysShowText aria-pressed={dictating} onClick={dictate} />
                  <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                    {"Dictation uses your browser's speech service, which may send your voice to the browser's maker."}
                  </TextView>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="console-context" aria-labelledby="context-heading">
          <ScrollView ariaLabel="The step" className="context-scroll" tabIndex={0}>
            <Panel width="100%">
              <div className="panel-body">
                {step && (
                  <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                    {`STEP ${step.index} OF ${task?.steps.length ?? step.index}`}
                  </TextView>
                )}
                <TextView as="h2" id="context-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
                  {step ? step.title : (task?.title ?? 'Not in a task')}
                </TextView>
                {step ? (
                  <>
                    <TextView as="p" textStyle={TextStyle.BODY2}>
                      {step.instruction}
                    </TextView>
                    {step.check.order_lines?.length ? (
                      <ul className="order-summary" aria-label="The order">
                        {step.check.order_lines.map((line) => (
                          <li key={`${line.sku}-${line.name}`}>
                            <TextView as="span" textStyle={TextStyle.BODY2_EMPHASIZED}>
                              {`${line.qty} ×`}
                            </TextView>{' '}
                            <TextView as="span" textStyle={TextStyle.BODY2}>
                              {line.name}
                            </TextView>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {step.reference_image_url && (
                      <figure className="context-photo">
                        <img src={step.reference_image_url} alt={`The expert's photo of step ${step.index} done right`} />
                        <TextView as="span" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                          What it should look like
                        </TextView>
                      </figure>
                    )}
                  </>
                ) : (
                  <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                    {`${name} asked for help outside a step.`}
                  </TextView>
                )}
              </div>
            </Panel>
          </ScrollView>
        </section>
      </div>
    </Page>
  )
}

/** One message: the worker's on the left in the inbound material, the expert's on the right in the outbound one. */
function Bubble({ mine, who, at, text, image }: { mine: boolean; who: string; at: string; text: string; image: string | null }) {
  const material = useMemo(() => (mine ? MaterialLibrary.outboundMessage() : MaterialLibrary.inboundMessage()), [mine])
  const shape = useMemo(() => new TailShapeProvider(mine ? 'right' : 'left', CornerRadius.MEDIUM), [mine])
  return (
    <li className={mine ? 'bubble-row is-mine' : 'bubble-row'}>
      <StaticContainer material={material} shapeProvider={shape} className="bubble">
        <div className="bubble-body">
          <TextView as="p" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
            {`${who} · ${at}`}
          </TextView>
          <TextView as="p" textStyle={TextStyle.BODY2}>
            {text}
          </TextView>
          {image && <img className="bubble-image" src={image} alt="The picture with a ring where you pointed" />}
        </div>
      </StaticContainer>
    </li>
  )
}
