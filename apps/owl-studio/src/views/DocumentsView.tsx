import { Avatar, AvatarSize, Button, IconImage, InputTextView, InputTextViewSize, ListItem, Page, Panel, ScrollView, TextColor, TextStyle, TextView, VerticalList } from '@wearables-ui-toolkit/mrbd'
import { useCallback, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { fileProblem, lengthText } from '../lib/docs.ts'
import { useNow, usePolling } from '../lib/hooks.ts'
import { useStudio } from '../lib/studio.ts'
import { timeAgo } from '../lib/time.ts'
import type { Answer, Doc } from '../lib/types.ts'
import { ICONS } from '../ui/icons.ts'
import { Confirm, DangerButton, PrimaryButton, Problem, StatusText, Waiting } from '../ui/meta.tsx'
import { keepCaretKeys } from '../ui/keys.ts'
import { useToast } from '../ui/toast.ts'

/** The company's own instructions. Owl answers workers' questions from these and from nothing else. */
export function DocumentsView() {
  const { api } = useStudio()
  const toast = useToast()
  const now = useNow(30000)
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [uploading, setUploading] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      setDocs(await api.docs())
    } catch (error) {
      setProblem(messageOf(error))
    }
  }, [api])

  // Read again now and then: someone else may add or delete a document.
  usePolling(load, 30000, api)

  const add = async (files: File[]) => {
    setProblem(null)
    for (const file of files) {
      const why = fileProblem(file.name, file.size)
      if (why) {
        setProblem(why)
        continue
      }
      setUploading(file.name)
      try {
        const doc = await api.uploadDoc(file)
        setDocs((all) => [...(all ?? []).filter((d) => d.id !== doc.id), doc])
        toast({ message: `${doc.title} is added. Owl answers from it now.` })
      } catch (error) {
        setProblem(`${file.name} was not added. ${messageOf(error)}`)
      }
    }
    setUploading(null)
    if (picker.current) picker.current.value = ''
  }

  const remove = async (doc: Doc) => {
    setDeleting(true)
    try {
      await api.deleteDoc(doc.id)
      setDocs((all) => (all ?? []).filter((d) => d.id !== doc.id))
      setConfirmId(null)
      toast({ message: `${doc.title} is deleted. Owl no longer answers from it.` })
    } catch (error) {
      setProblem(`${doc.title} was not deleted. ${messageOf(error)}`)
    } finally {
      setDeleting(false)
    }
  }

  const confirming = docs?.find((doc) => doc.id === confirmId) ?? null

  return (
    <Page headerText="Documents" enableSystemBarInset={false} className="route">
      <div className="split split-wide">
        <section className="split-list" aria-labelledby="docs-heading">
          <VerticalList insetForHeader ariaLabel="Documents">
            <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="list-lede">
              Your own instructions, as you already have them. Owl answers workers' questions from these and from nothing else, and says so when the answer is not in them.
            </TextView>
            <div
              className={dropping ? 'dropzone is-over' : 'dropzone'}
              onDragOver={(event) => {
                event.preventDefault()
                setDropping(true)
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDropping(false)
                void add([...event.dataTransfer.files])
              }}
            >
              <Panel width="100%">
                <div className="panel-body dropzone-body">
                  <span className="dropzone-icon" aria-hidden="true">
                    <IconImage source={ICONS.upload} style={{ inlineSize: '100%', blockSize: '100%' }} />
                  </span>
                  <div className="panel-body-text">
                    <TextView as="p" textStyle={TextStyle.BODY2_EMPHASIZED}>
                      {uploading ? `Adding ${uploading}` : 'Drop a document here'}
                    </TextView>
                    <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                      A handbook, a checklist, house rules. Markdown, text or PDF, up to 10 MB each.
                    </TextView>
                  </div>
                  <input ref={picker} id="doc-file" className="visually-hidden" type="file" accept=".md,.txt,.pdf" multiple onChange={(event) => void add([...(event.target.files ?? [])])} />
                  <PrimaryButton title={uploading ? 'Adding' : 'Choose a file'} icon={ICONS.plus} showLoader={uploading !== null} disabled={uploading !== null} onClick={() => picker.current?.click()} />
                </div>
              </Panel>
            </div>

            {problem && (
              <div className="form-block">
                <Problem>{problem}</Problem>
              </div>
            )}

            <TextView as="h2" id="docs-heading" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="list-label">
              WHAT OWL HAS READ
            </TextView>
            {docs === null && !problem && <Waiting what="Getting your documents" />}
            {docs !== null && docs.length === 0 && (
              <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="list-note">
                No documents yet. Add the handbook a new worker would get on paper. Until then Owl answers every question with "ask your shift lead".
              </TextView>
            )}
            {(docs ?? []).map((doc) => (
              <ListItem
                key={doc.id}
                title={doc.title}
                subtitle={`${doc.filename} · ${lengthText(doc.chars)} · added ${timeAgo(doc.uploaded_at, now)}`}
                subtitleMaxLines={3}
                icon={ICONS.documents}
                accessoryIcon={ICONS.trash}
                accessoryIconAlwaysVisible
                aria-haspopup="dialog"
                ariaLabel={`Delete ${doc.title}`}
                onClick={() => setConfirmId(doc.id)}
              />
            ))}
          </VerticalList>
        </section>

        <section className="split-detail" aria-labelledby="ask-heading">
          <TryQuestion hasDocs={!!docs?.length} />
        </section>
      </div>

      {confirming && (
        <Confirm
          title={`Delete ${confirming.title}?`}
          text="Owl stops answering from it straight away, and the file is deleted from your server."
          onClose={() => setConfirmId(null)}
          buttons={
            <>
              <Button title="Keep it" alwaysShowText disabled={deleting} onClick={() => setConfirmId(null)} />
              <DangerButton title={deleting ? 'Deleting' : 'Delete document'} icon={ICONS.trash} showLoader={deleting} onClick={() => void remove(confirming)} />
            </>
          }
        />
      )}
    </Page>
  )
}

/** Ask as a worker would, and see the answer and where it came from. */
function TryQuestion({ hasDocs }: { hasDocs: boolean }) {
  const { api } = useStudio()
  const [question, setQuestion] = useState('')
  const [asked, setAsked] = useState('')
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const ask = async (words: string) => {
    const text = words.trim()
    if (!text || asking) return
    setAsking(true)
    setAnswer(null)
    setProblem(null)
    setAsked(text)
    try {
      setAnswer(await api.ask(text))
    } catch (error) {
      setProblem(messageOf(error))
    } finally {
      setAsking(false)
    }
  }

  const owl = asking ? 'thinking' : answer ? (answer.found ? 'done' : 'unsure') : 'listening'

  return (
    <ScrollView ariaLabel="Try a question" className="detail-scroll" tabIndex={answer ? 0 : undefined}>
      <Panel width="100%">
        <div className="panel-body ask-body">
          <TextView as="h2" id="ask-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
            Try a question
          </TextView>
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            Ask the way a new worker would on the glasses. You see what Owl answers and which document it took it from.
          </TextView>
          <InputTextView
            className="send-field"
            size={InputTextViewSize.FULL}
            text={question}
            hint="What do I do if an item is out of stock?"
            actionLabel="Ask Owl"
            actionIcon={ICONS.send}
            showLoader={asking}
            loadingLabel="Asking"
            onTextChange={setQuestion}
            onSend={(words) => void ask(words)}
            inputProps={{ 'aria-label': 'Your question', maxLength: 500, onKeyDown: keepCaretKeys }}
          />
          <div className="answer" aria-live="polite">
            <Avatar src={`/owl/states/${owl}.png`} alt="" size={AvatarSize.LARGE} />
            <div className="answer-body">
              {asking && (
                <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                  Owl is reading your documents
                </TextView>
              )}
              {!asking && !answer && !problem && (
                <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                  {hasDocs ? 'The answer shows here, with its source.' : 'Add a document first, then ask about something in it.'}
                </TextView>
              )}
              {problem && <Problem>{problem}</Problem>}
              {answer && (
                <>
                  <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                    {`"${asked}"`}
                  </TextView>
                  {answer.found ? (
                    <>
                      <TextView as="p" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="field-label">
                        Owl answers
                      </TextView>
                      <TextView as="p" textStyle={TextStyle.BODY2}>
                        {answer.text}
                      </TextView>
                      {answer.sources.map((source, i) => (
                        <figure className="source" key={i}>
                          <TextView as="span" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY}>
                            {`From ${source.doc}${source.section ? `, ${source.section}` : ''}`}
                          </TextView>
                          <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                            {source.quote}
                          </TextView>
                        </figure>
                      ))}
                    </>
                  ) : (
                    <>
                      <StatusText tone="warning">Not in your documents</StatusText>
                      <TextView as="p" textStyle={TextStyle.BODY2}>
                        {answer.text}
                      </TextView>
                      <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                        Owl does not guess. Add the document that covers this and it can answer.
                      </TextView>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </Panel>
    </ScrollView>
  )
}
