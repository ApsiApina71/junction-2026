import { useEffect, useState } from 'react'
import { href } from '../lib/route.ts'
import { useStudio } from '../lib/studio.ts'
import { duration } from '../lib/time.ts'
import type { Stats } from '../lib/types.ts'
import { StatusTag } from '../ui/parts.tsx'

// Every sentence here says what the code does today and no more (apps/owl-api: main.py, media.py, record.py,
// ask.py, verifier.py, progress.py; apps/owl-glasses: Info.plist). Two things are kept apart on purpose: what Owl's own server
// stores and deletes, which Owl controls and can state exactly, and what happens to data once it has gone to
// someone else (the model provider, Meta), which follows their terms. When that code changes, change this page.

/** Where the company's data goes: what stays on its own server, what is sent out, and the limits. */
export function DataView() {
  const { api, health, processes, sessions, connection } = useStudio()
  const [docCount, setDocCount] = useState<number | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .docs()
      .then((docs) => !cancelled && setDocCount(docs.length))
      .catch(() => !cancelled && setDocCount(null))
    api
      .stats()
      .then((totals) => !cancelled && setStats(totals))
      .catch(() => !cancelled && setStats(null))
    return () => {
      cancelled = true
    }
  }, [api])

  const open = sessions?.filter((session) => session.status !== 'ended').length ?? null
  const recorded = processes?.filter((process) => process.source === 'record').length ?? null
  const said = (value: number | null | undefined) => (value === null || value === undefined ? 'Not known' : String(value))
  const model = health?.model_id ? health.model_id : 'the model your server is set to use'

  return (
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Where your data goes</h1>
          <p className="lede">Owl has to see and read to teach. This page keeps two things apart: what stays on your own Owl server, which Owl controls, and what is sent out to others, where their terms apply.</p>
        </div>
      </header>

      <div className="two-col two-col-wide">
        <div className="stack data-list">
          <section aria-labelledby="data-server">
            <div className="data-head">
              <h2 id="data-server">On your Owl server</h2>
              <StatusTag tone="accent" shape="ring">
                Owl controls this
              </StatusTag>
            </div>
            <p className="data-intro">This is what the server keeps and what it deletes, exactly as it works today.</p>
            <dl>
              <dt>Documents</dt>
              <dd>
                Kept until you delete them on the <a href={href('documents')}>Documents</a> page. The file is deleted from the server and Owl stops answering from it at once.
              </dd>
              <dt>Recorded photos and clips</dt>
              <dd>Kept with the task. Faces are blurred before anything is saved. Clips are cut to ten seconds, made small enough for the glasses and saved without sound.</dd>
              <dt>A worker's view during Help</dt>
              <dd>Kept only while that request is open, in a folder with a random name. Deleted when help ends, and anything left over is deleted when the server starts.</dd>
              <dt>Pictures sent for a check</dt>
              <dd>Never saved. The server reads the picture, sends it to the model and drops it. Owl keeps no record of what a worker's camera saw while they worked.</dd>
              <dt>Learning progress</dt>
              <dd>
                After each check the server notes, for that run of the task: when it started and finished, which task it was, how many steps were done, and how many problems Owl caught and how many of them were then fixed. The run is linked to the worker when
                the glasses say who is wearing them. It does not keep what the problem was, and no picture. Held in the server's memory, gone when the server restarts.
              </dd>
              <dt>Tasks, people and conversations</dt>
              <dd>Held in the server's memory. They are gone when the server restarts.</dd>
            </dl>
          </section>

          <section aria-labelledby="data-model">
            <div className="data-head">
              <h2 id="data-model">Sent to the AI model</h2>
              <StatusTag tone="muted" shape="square">
                The model provider's terms apply
              </StatusTag>
            </div>
            <p className="data-intro">
              Owl sends these to <strong>{model}</strong>, and only while it is answering. What the company that runs the model does with them afterwards, including how long it keeps them, follows that company's terms. Owl cannot see that and does not promise it.
            </p>
            <dl>
              <dt>A check</dt>
              <dd>One picture from the glasses camera, with the step and the expert's photo of it. The model describes what it sees, and your server decides.</dd>
              <dt>A question</dt>
              <dd>The worker's question, the task and step they are on, and every document you have added.</dd>
              <dt>A new recording</dt>
              <dd>What the expert said at each step and the photo of it, after faces are blurred, so the model can write the steps.</dd>
              <dt>If Jev is switched on</dt>
              <dd>A written description of what the camera saw and the order to compare it with goes to TypeSafe's decision model through OpenRouter, under their terms. No picture is sent to it.</dd>
            </dl>
          </section>

          <section aria-labelledby="data-meta">
            <div className="data-head">
              <h2 id="data-meta">Meta and the glasses</h2>
              <StatusTag tone="muted" shape="square">
                Meta's terms apply
              </StatusTag>
            </div>
            <dl>
              <dt>What Owl sends</dt>
              <dd>Owl does not send task data, pictures or documents to a Meta model.</dd>
              <dt>Meta's toolkit in the Owl app</dt>
              <dd>Its usage and crash reporting is switched off in the app.</dd>
              <dt>Meta's own app and the glasses</dt>
              <dd>The glasses connect to the phone through Meta's app. What that app and the glasses themselves send to Meta follows Meta's terms, not Owl's.</dd>
            </dl>
          </section>

          <section aria-labelledby="data-limits">
            <h2 id="data-limits">Limits you should know</h2>
            <dl>
              <dt>A worker's progress is not locked away</dt>
              <dd>
                The worker sees their own progress on their glasses, and Studio shows only totals for everyone together. That is how these screens are made, not a lock: the server has one access token for everything, so anyone who has it can read one
                worker's runs from the server.
              </dd>
              <dt>Blurring can miss a face</dt>
              <dd>A detector finds the faces. One it does not find, such as a face turned away, far off or half covered, is saved as it is. Look through a recorded task's photos and clips before you publish it.</dd>
              <dt>If blurring cannot run</dt>
              <dd>The recorded step is not saved at all, and the expert records it again.</dd>
              <dt>Help is not blurred</dt>
              <dd>You see the worker's view as it is, with anyone who is in it, until help ends.</dd>
              <dt>Checks are not blurred</dt>
              <dd>The picture goes to the model as the camera took it.</dd>
              <dt>A check covers what the camera saw</dt>
              <dd>Owl says a step was checked, not that it is correct. Something hidden from the camera is not checked.</dd>
              <dt>Recorded tasks cannot be deleted here yet</dt>
              <dd>Unpublishing takes a task off the glasses. Removing its photos and clips from the server has to be done by whoever runs it.</dd>
            </dl>
          </section>
        </div>

        <aside className="panel facts" aria-labelledby="facts-heading">
          <h2 id="facts-heading">On your server now</h2>
          {connection.state === 'online' || health ? (
            <dl className="facts-list">
              <div>
                <dt>AI model</dt>
                <dd>{health?.model_id ?? 'Not known'}</dd>
              </div>
              <div>
                <dt>Server</dt>
                <dd>{api.config.baseUrl.replace(/^https?:\/\//, '')}</dd>
              </div>
              <div>
                <dt>Documents</dt>
                <dd>{said(docCount)}</dd>
              </div>
              <div>
                <dt>Recorded tasks</dt>
                <dd>{said(recorded)}</dd>
              </div>
              <div>
                <dt>Help requests open</dt>
                <dd>{said(open)}</dd>
              </div>
            </dl>
          ) : (
            <p className="muted">These show once Studio is connected to your server.</p>
          )}
          <h2 id="totals-heading">Learning, in totals</h2>
          {stats ? (
            <>
              <dl className="facts-list" aria-labelledby="totals-heading">
                <div>
                  <dt>Workers who have used Owl</dt>
                  <dd>{stats.workers}</dd>
                </div>
                <div>
                  <dt>Tasks finished</dt>
                  <dd>{stats.tasks_finished}</dd>
                </div>
                <div>
                  <dt>Time to a first finished task, median</dt>
                  <dd>{stats.median_seconds_to_first_finished_task === null ? 'None yet' : duration(stats.median_seconds_to_first_finished_task)}</dd>
                </div>
                <div>
                  <dt>Problems Owl caught</dt>
                  <dd>{stats.problems_caught}</dd>
                </div>
                <div>
                  <dt>Of those, fixed</dt>
                  <dd>{stats.problems_fixed}</dd>
                </div>
              </dl>
              <p className="hint">
                For everyone together, without names, since the server last started.{stats.workers === 1 ? ' With one worker, these are that person\'s numbers.' : ''}
              </p>
            </>
          ) : (
            <p className="muted">The totals show once Studio is connected to your server.</p>
          )}
        </aside>
      </div>
    </div>
  )
}
