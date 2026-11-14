import { useState } from 'react'
import { usePolling } from '../lib/hooks.ts'
import { href } from '../lib/route.ts'
import { learnersText, originText, sortProcesses, stepsText } from '../lib/steps.ts'
import { useStudio } from '../lib/studio.ts'
import type { Recording } from '../lib/types.ts'
import { Icon } from '../ui/Icon.tsx'
import { OwlFace, OwlFigure } from '../ui/Owl.tsx'
import { Loading, StatusTag } from '../ui/parts.tsx'

/** Every task: drafts that wait for a person first, then what is on the glasses. Recordings still on their way show above. */
export function TasksView() {
  const { api, processes, employees, connection } = useStudio()
  const [recordings, setRecordings] = useState<Recording[]>([])

  // A recording shows here while the expert is still at it and while Owl writes the steps. Once done it is a draft below.
  usePolling(
    async () => {
      try {
        setRecordings((await api.recordings()).filter((recording) => recording.status !== 'done'))
      } catch {
        setRecordings([])
      }
    },
    3000,
    api,
  )

  const severalCompanies = new Set((processes ?? []).map((process) => process.company).filter(Boolean)).size > 1

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Tasks</h1>
          <p className="lede">What new workers learn on the glasses. An expert records a task once, you review and publish it here, and each worker gets the tasks you give them.</p>
        </div>
      </header>

      {recordings.length > 0 && (
        <ul className="rows" aria-label="Recordings on their way">
          {recordings.map((recording) => (
            <li key={recording.id}>
              <div className="row">
                {recording.status === 'processing' ? (
                  <OwlFace state="thinking" size={56} />
                ) : (
                  <span className="thumb thumb-icon" aria-hidden="true">
                    <Icon name="glasses" />
                  </span>
                )}
                <span className="row-main">
                  <span className="row-title">{recording.title}</span>
                  <span className="row-meta">
                    {stepsText(recording.steps.length)}
                    {recording.expert ? ` · ${recording.expert}` : ''}
                  </span>
                </span>
                {recording.status === 'recording' && (
                  <StatusTag tone="accent" shape="ring">
                    Being recorded on the glasses
                  </StatusTag>
                )}
                {recording.status === 'processing' && (
                  <StatusTag tone="accent" shape="ring">
                    Owl is writing the steps
                  </StatusTag>
                )}
                {recording.status === 'failed' && (
                  <StatusTag tone="danger" shape="square">
                    Owl could not write the steps. Record it again.
                  </StatusTag>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {processes === null ? (
        connection.state === 'connecting' ? (
          <Loading what="Getting your tasks" />
        ) : null
      ) : processes.length === 0 ? (
        <div className="empty empty-owl">
          <OwlFigure state="welcome" height={168} />
          <div>
            <h2>No tasks yet</h2>
            <p>An experienced worker records the first one on the glasses: say "Hey Meta, start Owl", choose Record a task, and talk through each step while doing it. It arrives here as a draft for you to review.</p>
          </div>
        </div>
      ) : (
        <ul className="rows" aria-label="Tasks">
          {sortProcesses(processes).map((process) => {
            const image = process.steps.find((step) => step.reference_image_url)?.reference_image_url
            const draft = process.status === 'draft'
            const learners = (employees ?? []).filter((employee) => employee.process_ids.includes(process.id)).map((employee) => employee.name)
            // One short line: the badge carries the status, the editor carries the rest.
            const detail = [severalCompanies && process.company, stepsText(process.steps.length), originText(process), !draft && learnersText(learners)].filter(Boolean).join(' · ')
            return (
              <li key={process.id}>
                <a className="row row-link" href={href('tasks', process.id)}>
                  <span className="thumb" aria-hidden="true">
                    {image ? <img src={image} alt="" loading="lazy" /> : <Icon name="tasks" />}
                  </span>
                  <span className="row-main">
                    <span className="row-title">{process.title || 'Untitled task'}</span>
                    <span className="row-meta">{detail}</span>
                  </span>
                  {draft ? (
                    <StatusTag tone="signal" shape="diamond">
                      Draft, needs review
                    </StatusTag>
                  ) : learners.length ? (
                    <StatusTag tone="success" shape="disc">
                      Published
                    </StatusTag>
                  ) : (
                    <StatusTag tone="muted" shape="ring">
                      Published, no one assigned
                    </StatusTag>
                  )}
                  <span className="row-go" aria-hidden="true">
                    <Icon name="chevron" />
                  </span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
