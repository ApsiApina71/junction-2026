import { Chip, ChipStyle, Page, Panel, ScrollView, TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import shieldCheck from '@wearables-ui-toolkit/icons/svg/shieldcheck__filled.svg'
import { useEffect, useState } from 'react'
import { href } from '../lib/route.ts'
import { useStudio } from '../lib/studio.ts'
import { duration } from '../lib/time.ts'
import type { Stats } from '../lib/types.ts'
import { ICONS } from '../ui/icons.ts'

// Every sentence here says what the code does today and no more (apps/owl-api: main.py, media.py, record.py,
// ask.py, verifier.py, progress.py, persist.py, jepa.py, stage.py, translate.py, docs_process.py, training.py,
// location.py, place.py, assist.py, shift.py; apps/owl-glasses:
// Info.plist, OwlViewModel.swift, OwlCamera.swift). Two things are kept apart on purpose: what Owl's own server
// stores and deletes, which Owl controls and can state exactly, and what happens to data once it has gone to
// someone else (the model provider, Meta), which follows their terms. The same list is in
// docs/specs/onboarding-owl.md ("Where the data goes"). When that code changes, change both.

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
  const visionModel = health?.vision_model ?? health?.model_id
  const nemotron = health?.vision_model?.startsWith('nemotron') ?? false

  return (
    <Page headerText="Your data" enableSystemBarInset={false} className="route">
      <div className="split split-wide">
        <section className="split-list" aria-label="Where your data goes">
          <ScrollView insetForHeader ariaLabel="Where your data goes" className="detail-scroll" tabIndex={0}>
            <div className="column-content data-list">
              <TextView as="h1" textStyle={TextStyle.BODY2_EMPHASIZED}>
                Where your data goes
              </TextView>
              <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="lede">
                Owl has to see and read to teach. This page keeps two things apart: what stays on your own Owl server, which Owl controls, and what is sent out to others, where their terms apply.
              </TextView>
              <section aria-labelledby="data-server" className="data-section">
                <Panel width="100%">
                  <div className="panel-body data-body">
                    <div className="data-head">
                      <TextView as="h2" id="data-server" textStyle={TextStyle.BODY2_EMPHASIZED}>
                        On your Owl server
                      </TextView>
                      <Chip text="Owl controls this" icon={shieldCheck} chipStyle={ChipStyle.EMPHASIZED} />
                    </div>
                    <p className="data-intro uit-text-body2">This is what the server keeps and what it deletes, exactly as it works today.</p>
                    <dl>
                      <dt className="uit-text-body2-emphasized">Documents</dt>
                      <dd className="uit-text-body2">
                        Kept until you delete them on the <a href={href('documents')}>Documents</a> page. The file is deleted from the server and Owl stops answering from it at once.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Recorded photos and clips</dt>
                      <dd className="uit-text-body2">
                        Kept with the task. Faces are blurred before anything is saved. Clips are cut to ten seconds, made small enough for the glasses and saved without sound. They are in a folder
                        with a random name, because the glasses load them by address without a login.
                      </dd>
                      <dt className="uit-text-body2-emphasized">A worker's view during Help</dt>
                      <dd className="uit-text-body2">
                        Kept only while that request is open, in a folder with a random name. Deleted when help ends, and anything left over is deleted when the server starts. It is seen by the expert
                        here, or, when the worker calls the manager on shift, only by that manager on their own glasses. Neither records it.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Pictures sent for a check</dt>
                      <dd className="uit-text-body2">
                        Never saved. The server reads the picture, sends it to the model and drops it. Owl keeps no record of what a worker's camera saw while they worked.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Short clips for knowing which step it is</dt>
                      <dd className="uit-text-body2">
                        Never saved and never sent out: the server compares about two seconds of the worker's view with the expert's clips itself. When the worker confirms a step Owl suggested, the
                        server keeps that look as a row of numbers, an example of the step. No video, and not linked to the worker.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Learning progress</dt>
                      <dd className="uit-text-body2">
                        After each check the server notes, for that run of the task: when it started and finished, which task it was, how many steps were done, and how many problems Owl caught and how
                        many of them were then fixed. The run is linked to the worker when the glasses say who is wearing them. It does not keep what the problem was, and no picture. Saved in a file
                        on the server, so it is still there after a restart. The worker erases their own with Forget me on the glasses.
                      </dd>
                      <dt className="uit-text-body2-emphasized">The end of training</dt>
                      <dd className="uit-text-body2">
                        For a worker in a training period, the server counts per step of the level how many times Owl verified it without the worker asking Owl or calling for help. At the end it
                        suggests Ready or More practice. The worker sees it on the glasses first; only then does the <a href={href('training')}>Training</a> page show it, with those counts, and a
                        person confirms it. No pictures, places or times go into it. Forget me drops it.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Where a trainee is</dt>
                      <dd className="uit-text-body2">
                        Only during a training period, and only after the worker agreed on the glasses. While a step waits for its place, the glasses send a camera picture every few seconds; the
                        server compares it with the photos of the place and drops it. The picture is never saved and never sent to the model. Kept: the area the worker is in now and today's areas, in
                        the server's memory only, deleted when training ends, when the worker says no, or when the server restarts. The <a href={href('map')}>Map</a> shows the current area.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Customer service mode</dt>
                      <dd className="uit-text-body2">
                        Only during training, only for a role that has it, and only while the worker has it on. On a Hint the glasses send the last half minute of the conversation as text. The server
                        uses it for one suggestion and drops it: no sound and no text is saved or logged.
                      </dd>
                      <dt className="uit-text-body2-emphasized">What each worker agreed to</dt>
                      <dd className="uit-text-body2">
                        Whether they allowed camera checks, recording and following their area during training, and when. Saved on the server and on the phone. Without a yes to camera checks the
                        server refuses the pictures.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Tasks, translations, people and recordings</dt>
                      <dd className="uit-text-body2">Saved in a file on the server, so they are still there after a restart. Questions and answers are not saved.</dd>
                      <dt className="uit-text-body2-emphasized">The stage view</dt>
                      <dd className="uit-text-body2">
                        Off unless someone switches on Stage mirroring on the phone. While it is on, the server holds the worker's current screen, what Owl last said and the newest camera picture, at
                        most one a second, and shows them to anyone who opens the stage page with the access token. Each picture replaces the one before, and none is saved.
                      </dd>
                    </dl>
                  </div>
                </Panel>
              </section>

              <section aria-labelledby="data-model" className="data-section">
                <Panel width="100%">
                  <div className="panel-body data-body">
                    <div className="data-head">
                      <TextView as="h2" id="data-model" textStyle={TextStyle.BODY2_EMPHASIZED}>
                        Sent to the AI model
                      </TextView>
                      <Chip text="The model provider's terms apply" icon={ICONS.info} chipStyle={ChipStyle.DEEMPHASIZED} />
                    </div>
                    <p className="data-intro uit-text-body2">
                      Owl sends these to <strong>{model}</strong>, and only while it is answering. What the company that runs the model does with them afterwards, including how long it keeps them,
                      follows that company's terms. Owl cannot see that and does not promise it.
                    </p>
                    <dl>
                      <dt className="uit-text-body2-emphasized">A check</dt>
                      <dd className="uit-text-body2">
                        One picture from the glasses camera, with the step and the expert's photo of it. The model describes what it sees, and your server decides.
                        {nemotron && visionModel !== health?.model_id ? (
                          <>
                            {' '}
                            Checks go to <strong>{visionModel}</strong>, NVIDIA's open-weight model on a Verda GPU server, not to {model}.
                          </>
                        ) : null}
                      </dd>
                      <dt className="uit-text-body2-emphasized">A customer service hint</dt>
                      <dd className="uit-text-body2">
                        The last half minute of the counter conversation as text, and your documents for that worker's company. The model suggests up to three points; each must rest on words found in
                        a document.
                      </dd>
                      <dt className="uit-text-body2-emphasized">A question</dt>
                      <dd className="uit-text-body2">
                        The worker's question, the task and step they are on, and your documents: all of them while they are short enough to fit, otherwise the parts that match the question best.
                      </dd>
                      <dt className="uit-text-body2-emphasized">A new recording</dt>
                      <dd className="uit-text-body2">What the expert said at each step and the photo of it, after faces are blurred, so the model can write the steps.</dd>
                      <dt className="uit-text-body2-emphasized">A task written from a document</dt>
                      <dd className="uit-text-body2">The text of that document.</dd>
                      <dt className="uit-text-body2-emphasized">A translation</dt>
                      <dd className="uit-text-body2">The words of a task, the first time a worker needs it in another language.</dd>
                      <dt className="uit-text-body2-emphasized">If Jev is switched on</dt>
                      <dd className="uit-text-body2">
                        A written description of what the camera saw and the order to compare it with goes to TypeSafe's decision model through OpenRouter, under their terms. No picture is sent to it.
                      </dd>
                    </dl>
                  </div>
                </Panel>
              </section>

              <section aria-labelledby="data-meta" className="data-section">
                <Panel width="100%">
                  <div className="panel-body data-body">
                    <div className="data-head">
                      <TextView as="h2" id="data-meta" textStyle={TextStyle.BODY2_EMPHASIZED}>
                        Meta and the glasses
                      </TextView>
                      <Chip text="Meta's terms apply" icon={ICONS.info} chipStyle={ChipStyle.DEEMPHASIZED} />
                    </div>
                    <dl>
                      <dt className="uit-text-body2-emphasized">What Owl sends</dt>
                      <dd className="uit-text-body2">Owl does not send task data, pictures or documents to a Meta model.</dd>
                      <dt className="uit-text-body2-emphasized">Meta's toolkit in the Owl app</dt>
                      <dd className="uit-text-body2">Its usage and crash reporting is switched off in the app.</dd>
                      <dt className="uit-text-body2-emphasized">Speech on the glasses</dt>
                      <dd className="uit-text-body2">
                        "Hey Meta, start Owl" and the worker's spoken questions are turned into text by Meta's software on the glasses and in Meta's app. Owl gets the text. Where Meta's software does
                        that work is Meta's to say.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Meta's own app and the glasses</dt>
                      <dd className="uit-text-body2">The glasses connect to the phone through Meta's app. What that app and the glasses themselves send to Meta follows Meta's terms, not Owl's.</dd>
                    </dl>
                  </div>
                </Panel>
              </section>

              <section aria-labelledby="data-phone" className="data-section">
                <Panel width="100%">
                  <div className="panel-body data-body">
                    <div className="data-head">
                      <TextView as="h2" id="data-phone" textStyle={TextStyle.BODY2_EMPHASIZED}>
                        On the worker's phone
                      </TextView>
                      <Chip text="Owl controls this" icon={shieldCheck} chipStyle={ChipStyle.EMPHASIZED} />
                    </div>
                    <dl>
                      <dt className="uit-text-body2-emphasized">Saved for working without a connection</dt>
                      <dd className="uit-text-body2">The worker's tasks and the photo of each step, for the glasses and the worker the phone is set up for. Replaced when the tasks change.</dd>
                      <dt className="uit-text-body2-emphasized">The camera</dt>
                      <dd className="uit-text-body2">
                        No picture or clip from the glasses camera stays on the phone. A clip is deleted when its step is over, sent or not, and anything left by a closed app is deleted the next time
                        it starts.
                      </dd>
                    </dl>
                  </div>
                </Panel>
              </section>

              <section aria-labelledby="data-limits" className="data-section">
                <Panel width="100%">
                  <div className="panel-body data-body">
                    <TextView as="h2" id="data-limits" textStyle={TextStyle.BODY2_EMPHASIZED}>
                      Limits you should know
                    </TextView>
                    <dl>
                      <dt className="uit-text-body2-emphasized">A worker's progress is not locked away</dt>
                      <dd className="uit-text-body2">
                        The worker sees their own progress on their glasses, and Studio shows only totals for everyone together, plus the end-of-training result after the worker has seen it. That is
                        how these screens are made, not a lock: the server has one access token for everything, so anyone who has it can read one worker's runs from the server.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Blurring can miss a face</dt>
                      <dd className="uit-text-body2">
                        A detector finds the faces. One it does not find, such as a face turned away, far off or half covered, is saved as it is. Look through a recorded task's photos and clips before
                        you publish it.
                      </dd>
                      <dt className="uit-text-body2-emphasized">If blurring cannot run</dt>
                      <dd className="uit-text-body2">The recorded step is not saved at all, and the expert records it again.</dd>
                      <dt className="uit-text-body2-emphasized">Help is not blurred</dt>
                      <dd className="uit-text-body2">You see the worker's view as it is, with anyone who is in it, until help ends.</dd>
                      <dt className="uit-text-body2-emphasized">Checks are not blurred</dt>
                      <dd className="uit-text-body2">The picture goes to the model as the camera took it.</dd>
                      <dt className="uit-text-body2-emphasized">A check covers what the camera saw</dt>
                      <dd className="uit-text-body2">Owl says a step was checked, not that it is correct. Something hidden from the camera is not checked.</dd>
                      <dt className="uit-text-body2-emphasized">A photo or clip opens for anyone who has its address</dt>
                      <dd className="uit-text-body2">
                        The glasses load pictures and clips by address, without a login. Recorded media and a worker's view during Help sit in folders with random names, so an address cannot be
                        guessed, but whoever is given one can open it.
                      </dd>
                      <dt className="uit-text-body2-emphasized">Recorded tasks cannot be deleted here yet</dt>
                      <dd className="uit-text-body2">Unpublishing takes a task off the glasses. Removing its photos and clips from the server has to be done by whoever runs it.</dd>
                    </dl>
                  </div>
                </Panel>
              </section>
            </div>
          </ScrollView>
        </section>

        <section className="split-detail" aria-label="On your server now">
          <ScrollView ariaLabel="On your server now" className="detail-scroll" tabIndex={0}>
            <div className="column-stack">
              <Panel width="100%">
                <div className="panel-body facts">
                  <TextView as="h2" id="facts-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
                    On your server now
                  </TextView>
                  {connection.state === 'online' || health ? (
                    <dl className="facts-list uit-text-body2">
                      <div>
                        <dt className="uit-text-body2-emphasized">AI model</dt>
                        <dd className="uit-text-body2">{health?.model_id ?? 'Not known'}</dd>
                      </div>
                      {health?.vision_model && health.vision_model !== health.model_id ? (
                        <div>
                          <dt className="uit-text-body2-emphasized">Checks seen by</dt>
                          <dd className="uit-text-body2">{health.vision_model}</dd>
                        </div>
                      ) : null}
                      <div>
                        <dt className="uit-text-body2-emphasized">Server</dt>
                        <dd className="uit-text-body2">{api.config.baseUrl.replace(/^https?:\/\//, '')}</dd>
                      </div>
                      <div>
                        <dt className="uit-text-body2-emphasized">Documents</dt>
                        <dd className="uit-text-body2">{said(docCount)}</dd>
                      </div>
                      <div>
                        <dt className="uit-text-body2-emphasized">Recorded tasks</dt>
                        <dd className="uit-text-body2">{said(recorded)}</dd>
                      </div>
                      <div>
                        <dt className="uit-text-body2-emphasized">Help requests open</dt>
                        <dd className="uit-text-body2">{said(open)}</dd>
                      </div>
                    </dl>
                  ) : (
                    <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                      These show once Studio is connected to your server.
                    </TextView>
                  )}
                </div>
              </Panel>
              <Panel width="100%">
                <div className="panel-body facts">
                  <TextView as="h2" id="totals-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
                    Learning, in totals
                  </TextView>
                  {stats ? (
                    <>
                      <dl className="facts-list uit-text-body2" aria-labelledby="totals-heading">
                        <div>
                          <dt className="uit-text-body2-emphasized">Workers who have used Owl</dt>
                          <dd className="uit-text-body2">{stats.workers}</dd>
                        </div>
                        <div>
                          <dt className="uit-text-body2-emphasized">Tasks finished</dt>
                          <dd className="uit-text-body2">{stats.tasks_finished}</dd>
                        </div>
                        <div>
                          <dt className="uit-text-body2-emphasized">Time to a first finished task, median</dt>
                          <dd className="uit-text-body2">{stats.median_seconds_to_first_finished_task === null ? 'None yet' : duration(stats.median_seconds_to_first_finished_task)}</dd>
                        </div>
                        <div>
                          <dt className="uit-text-body2-emphasized">Problems Owl caught</dt>
                          <dd className="uit-text-body2">{stats.problems_caught}</dd>
                        </div>
                        <div>
                          <dt className="uit-text-body2-emphasized">Of those, fixed</dt>
                          <dd className="uit-text-body2">{stats.problems_fixed}</dd>
                        </div>
                      </dl>
                      <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                        {`For everyone together, without names, for as long as the server has kept its records.${stats.workers === 1 ? " With one worker, these are that person's numbers." : ''}`}
                      </TextView>
                    </>
                  ) : (
                    <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                      The totals show once Studio is connected to your server.
                    </TextView>
                  )}
                </div>
              </Panel>
            </div>
          </ScrollView>
        </section>
      </div>
    </Page>
  )
}
