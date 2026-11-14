import { useCallback, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { fileProblem, lengthText } from '../lib/docs.ts'
import { useNow, usePolling } from '../lib/hooks.ts'
import { useStudio } from '../lib/studio.ts'
import { timeAgo } from '../lib/time.ts'
import type { Answer, Doc } from '../lib/types.ts'
import { Icon } from '../ui/Icon.tsx'
import { OwlFace } from '../ui/Owl.tsx'
import { EmptyState, Loading, Problem } from '../ui/parts.tsx'
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

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Documents</h1>
          <p className="lede">Your own instructions, as you already have them. Owl answers workers' questions from these and from nothing else, and says so when the answer is not in them.</p>
        </div>
      </header>

      <div className="two-col">
        <section aria-labelledby="docs-heading" className="stack">
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
            <Icon name="upload" size={28} />
            <div className="dropzone-text">
              <p className="dropzone-title">{uploading ? `Adding ${uploading}` : 'Drop a document here'}</p>
              <p className="hint">A handbook, a checklist, house rules. Markdown, text or PDF, up to 10 MB each.</p>
            </div>
            <input ref={picker} id="doc-file" className="visually-hidden" type="file" accept=".md,.txt,.pdf" multiple onChange={(event) => void add([...(event.target.files ?? [])])} />
            <button type="button" className="button button-primary" onClick={() => picker.current?.click()} disabled={uploading !== null}>
              Choose a file
            </button>
          </div>

          {problem && <Problem>{problem}</Problem>}

          <h2 id="docs-heading">What Owl has read</h2>
          {docs === null ? (
            !problem && <Loading what="Getting your documents" />
          ) : docs.length === 0 ? (
            <EmptyState title="No documents yet">Add the handbook a new worker would get on paper. Until then Owl answers every question with "ask your shift lead".</EmptyState>
          ) : (
            <ul className="rows" aria-label="Documents">
              {docs.map((doc) => (
                <li key={doc.id}>
                  {confirmId === doc.id ? (
                    <div className="row row-confirm" role="group" aria-label={`Delete ${doc.title}`}>
                      <p className="row-main">
                        <span className="row-title">Delete {doc.title}?</span>
                        <span className="row-meta">Owl stops answering from it straight away, and the file is deleted from your server.</span>
                      </p>
                      <div className="row-actions">
                        <button type="button" className="button button-quiet button-small" onClick={() => setConfirmId(null)} disabled={deleting}>
                          Keep it
                        </button>
                        <button type="button" className="button button-danger button-small" onClick={() => void remove(doc)} disabled={deleting}>
                          {deleting ? 'Deleting' : 'Delete document'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="row">
                      <span className="thumb thumb-icon" aria-hidden="true">
                        <Icon name="documents" />
                      </span>
                      <span className="row-main">
                        <span className="row-title">{doc.title}</span>
                        <span className="row-meta">
                          {doc.filename} · {lengthText(doc.chars)} · added {timeAgo(doc.uploaded_at, now)}
                        </span>
                      </span>
                      <button type="button" className="button button-quiet button-small" onClick={() => setConfirmId(doc.id)} aria-label={`Delete ${doc.title}`}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <TryQuestion hasDocs={!!docs?.length} />
      </div>
    </div>
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

  const ask = async (event: React.FormEvent) => {
    event.preventDefault()
    const text = question.trim()
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
    <section className="panel ask" aria-labelledby="ask-heading">
      <h2 id="ask-heading">Try a question</h2>
      <p className="hint">Ask the way a new worker would on the glasses. You see what Owl answers and which document it took it from.</p>
      <form className="ask-form" onSubmit={(event) => void ask(event)}>
        <label className="visually-hidden" htmlFor="ask-question">
          Your question
        </label>
        <input
          id="ask-question"
          className="input"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="What do I do if an item is out of stock?"
          maxLength={500}
          autoComplete="off"
        />
        <button type="submit" className="button button-secondary" disabled={asking || !question.trim()}>
          {asking ? 'Asking' : 'Ask Owl'}
        </button>
      </form>

      <div className="answer" aria-live="polite">
        <OwlFace state={owl} size={56} />
        <div className="answer-body">
          {asking && <p className="answer-label">Owl is reading your documents</p>}
          {!asking && !answer && !problem && <p className="muted">{hasDocs ? 'The answer shows here, with its source.' : 'Add a document first, then ask about something in it.'}</p>}
          {problem && <Problem>{problem}</Problem>}
          {answer && (
            <>
              <p className="answer-question">"{asked}"</p>
              {answer.found ? (
                <>
                  <p className="answer-label">Owl answers</p>
                  <p className="answer-text">{answer.text}</p>
                  {answer.sources.map((source, i) => (
                    <figure className="source" key={i}>
                      <figcaption>
                        From {source.doc}
                        {source.section ? `, ${source.section}` : ''}
                      </figcaption>
                      <blockquote>{source.quote}</blockquote>
                    </figure>
                  ))}
                </>
              ) : (
                <>
                  <p className="answer-label">Not in your documents</p>
                  <p className="answer-text">{answer.text}</p>
                  <p className="hint">Owl does not guess. Add the document that covers this and it can answer.</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
