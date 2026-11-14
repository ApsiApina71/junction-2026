import { AvatarShape, Card, CardAboveScrim, ContainerHeader, Page, Panel, ScrimType, ScrollView, TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import { useState } from 'react'
import { usePolling } from '../lib/hooks.ts'
import { href } from '../lib/route.ts'
import { learnersText, originText, sortProcesses, stepsText } from '../lib/steps.ts'
import { useStudio } from '../lib/studio.ts'
import type { Process, Recording } from '../lib/types.ts'
import { StatusText, Waiting } from '../ui/meta.tsx'
import type { Tone } from '../ui/meta.tsx'

/** Every task as a card with the expert's photo: drafts that wait for a person first, then what is on the glasses. Recordings on their way come first. */
export function TasksView() {
  const { api, processes, employees, connection } = useStudio()
  const [recordings, setRecordings] = useState<Recording[]>([])

  // A recording shows here while the expert is still at it and while Owl writes the steps. Once done it is a draft.
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
  const draftCount = (processes ?? []).filter((process) => process.status === 'draft').length

  return (
    <Page headerText="Tasks" headerMetadata={draftCount ? (draftCount === 1 ? '1 draft' : `${draftCount} drafts`) : undefined} enableSystemBarInset={false} className="route">
      <ScrollView insetForHeader ariaLabel="Tasks" className="route-scroll">
        <div className="route-content">
          <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="lede">
            What new workers learn on the glasses. An expert records a task once, you review and publish it here, and each worker gets the tasks you give them.
          </TextView>

          {processes === null && connection.state === 'connecting' && <Waiting what="Getting your tasks" />}

          {processes !== null && processes.length === 0 && recordings.length === 0 && (
            <Panel width="100%">
              <div className="panel-body panel-owl">
                <img className="owl-figure" src="/owl/full/welcome.png" alt="" height={220} />
                <div className="panel-body-text">
                  <TextView as="h2" textStyle={TextStyle.BODY1_EMPHASIZED}>
                    No tasks yet
                  </TextView>
                  <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
                    An experienced worker records the first one on the glasses: say "Hey Meta, start Owl", choose Record a task, and talk through each step while doing it. It arrives here as a draft for you to review.
                  </TextView>
                </div>
              </div>
            </Panel>
          )}

          {(recordings.length > 0 || (processes?.length ?? 0) > 0) && (
            <ul className="card-grid" aria-label="Tasks">
              {recordings.map((recording) => (
                <li key={recording.id}>
                  <RecordingTile recording={recording} />
                </li>
              ))}
              {sortProcesses(processes ?? []).map((process) => {
                const learners = (employees ?? []).filter((employee) => employee.process_ids.includes(process.id)).map((employee) => employee.name)
                return (
                  <li key={process.id}>
                    <TaskCard process={process} learners={learners} showCompany={severalCompanies} />
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </ScrollView>
    </Page>
  )
}

/** One task: the expert's first photo under a scrim, the status in words, the name and one short line. */
function TaskCard({ process, learners, showCompany }: { process: Process; learners: string[]; showCompany: boolean }) {
  const image = process.steps.find((step) => step.reference_image_url)?.reference_image_url
  const draft = process.status === 'draft'
  const status = draft ? 'Draft, needs review' : learners.length ? 'Published' : 'Published, no one assigned'
  const tone: Tone = draft ? 'warning' : learners.length ? 'positive' : 'quiet'
  // One short line: the status carries the state, the editor carries the rest.
  const detail = [showCompany && process.company, stepsText(process.steps.length), originText(process), !draft && learnersText(learners)].filter(Boolean).join(' · ')
  const title = process.title || 'Untitled task'
  return (
    <Card width="100%" bottomScrim={ScrimType.TALL} className="task-card" aria-label={`${title}, ${status}`} onClick={() => (window.location.hash = href('tasks', process.id))}>
      {image ? <img className="card-photo" src={image} alt="" loading="lazy" /> : <img className="card-photo is-owl" src="/owl/full/resting.png" alt="" />}
      <CardAboveScrim className="card-label">
        <StatusText tone={tone}>{status}</StatusText>
        <TextView as="h2" textStyle={TextStyle.BODY1_EMPHASIZED}>
          {title}
        </TextView>
        <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
          {detail}
        </TextView>
      </CardAboveScrim>
    </Card>
  )
}

/** A recording on its way: not a destination yet, so a Panel, with the owl saying what it is doing. */
function RecordingTile({ recording }: { recording: Recording }) {
  const status =
    recording.status === 'recording' ? 'Being recorded on the glasses' : recording.status === 'processing' ? 'Owl is writing the steps' : 'Owl could not write the steps. Record it again.'
  const owl = recording.status === 'failed' ? 'unsure' : recording.status === 'processing' ? 'thinking' : 'watching'
  return (
    <Panel width="100%" className="recording-tile">
      <div className="panel-body">
        <ContainerHeader title={recording.title} subtitle={[stepsText(recording.steps.length), recording.expert].filter(Boolean).join(' · ')} avatarSrc={`/owl/states/${owl}.png`} primaryImageShape={AvatarShape.CIRCLE} />
        <StatusText tone={recording.status === 'failed' ? 'negative' : 'info'}>{status}</StatusText>
      </div>
    </Panel>
  )
}
