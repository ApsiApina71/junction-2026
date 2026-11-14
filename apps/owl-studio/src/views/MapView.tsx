import { Button, ListItem, Page, Panel, ScrollView, TextColor, TextStyle, TextView, VerticalList, VisualState } from '@wearables-ui-toolkit/mrbd'
import { useEffect, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { usePolling } from '../lib/hooks.ts'
import { useStudio } from '../lib/studio.ts'
import { rectFrom, zoneId } from '../lib/training.ts'
import type { Process, Step, TraineePlace, Zone, ZoneKind } from '../lib/types.ts'
import { ICONS } from '../ui/icons.ts'
import { Actions, ChoiceRow, DangerButton, PrimaryButton, Problem, StatusText, TextField } from '../ui/meta.tsx'
import { useToast } from '../ui/toast.ts'

// JUN-97. No markers: Owl recognises a step's place in the worker's camera picture, from the expert's photo of the step
// and the place photos added here. It follows which area a worker is in only during their training period and only
// after they agreed on the glasses. Studio sees the current area, never a trail: the server keeps today's areas in memory and drops them when
// training ends.

const KIND_NAME: Record<ZoneKind, string> = { aisle: 'Aisle', packing: 'Packing', loading: 'Loading', other: 'Other' }
const LABEL_LIMIT = 40
// The map is drawn in these units; zones are stored as shares of it.
const MAP_W = 1000
const MAP_H = 600

export function MapView() {
  const { api, processes } = useStudio()
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [places, setPlaces] = useState<TraineePlace[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [drawing, setDrawing] = useState(false)
  const [problem, setProblem] = useState('')
  const toast = useToast()

  useEffect(() => {
    let cancelled = false
    api
      .zones()
      .then((found) => {
        if (cancelled) return
        setZones(found)
        setProblem('')
      })
      .catch((error) => !cancelled && setProblem(messageOf(error)))
    return () => {
      cancelled = true
    }
  }, [api])

  // The live map: where each trainee is now.
  usePolling(
    async () => {
      try {
        setPlaces(await api.places())
      } catch {
        // The zones' own problem line says when the server is away.
      }
    },
    4000,
    api,
  )

  const addZone = async (rect: { x: number; y: number; w: number; h: number }) => {
    const all = zones ?? []
    const name = `Area ${all.length + 1}`
    const zone: Zone = { id: zoneId(name, all), name, kind: 'other', ...rect }
    try {
      await api.saveZone(zone)
      setZones([...all, zone])
      setSelected(zone.id)
      toast({ message: `${name} is on the map. Give it a name.` })
    } catch (error) {
      setProblem(messageOf(error))
    }
  }

  const saveZone = async (zone: Zone) => {
    try {
      await api.saveZone(zone)
      setZones((zones ?? []).map((z) => (z.id === zone.id ? zone : z)))
      toast({ message: `${zone.name} is saved.` })
    } catch (error) {
      setProblem(messageOf(error))
    }
  }

  const removeZone = async (zone: Zone) => {
    try {
      await api.deleteZone(zone.id)
      setZones((zones ?? []).filter((z) => z.id !== zone.id))
      setSelected(null)
      toast({ message: `${zone.name} is off the map.` })
    } catch (error) {
      setProblem(messageOf(error))
    }
  }

  const chosen = zones?.find((zone) => zone.id === selected) ?? null

  return (
    <Page headerText="Map" enableSystemBarInset={false} className="route">
      <div className="split split-wide">
        <section className="split-list" aria-label="The map">
          <ScrollView insetForHeader ariaLabel="The map" className="detail-scroll">
            <div className="column-content">
              <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="lede">
                Draw the areas of your workplace and say where each step happens. No markers to put up: during training a step opens on the glasses when Owl recognises its place in the camera picture, and you see which area each trainee is in now.
              </TextView>

              {problem && <Problem>{problem}</Problem>}

              <section aria-labelledby="map-heading">
                <Panel width="100%">
                  <div className="panel-body map-body">
                    <div className="map-head">
                      <TextView as="h2" id="map-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
                        Now
                      </TextView>
                      {drawing ? (
                        <PrimaryButton title="Drag on the map to draw" icon={ICONS.plus} aria-pressed onClick={() => setDrawing(false)} />
                      ) : (
                        <Button title="Draw an area" icon={ICONS.plus} alwaysShowText aria-pressed={false} onClick={() => setDrawing(true)} />
                      )}
                    </div>
                    {zones && (
                      <ZoneMap
                        zones={zones}
                        places={places}
                        selected={selected}
                        drawing={drawing}
                        onSelect={setSelected}
                        onDraw={(rect) => {
                          setDrawing(false)
                          void addZone(rect)
                        }}
                      />
                    )}
                    <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY} aria-live="polite">
                      {places.length === 0
                        ? 'No one in training is being followed right now. It starts when a trainee agrees on the glasses.'
                        : places.map((place) => `${place.name}: ${place.zone ? place.zone.name : 'not recognised yet'}`).join(' · ')}
                    </TextView>
                  </div>
                </Panel>
              </section>

              <Checkpoints zones={zones ?? []} processes={processes ?? []} />
            </div>
          </ScrollView>
        </section>

        <section className="split-detail" aria-label="Areas">
          <ScrollView ariaLabel="Areas" className="detail-scroll">
            <div className="column-stack">
              {chosen ? (
                <ZoneForm key={chosen.id} zone={chosen} onSave={saveZone} onRemove={removeZone} onClose={() => setSelected(null)} />
              ) : (
                <section aria-labelledby="areas-heading" className="route-section">
                  <TextView as="h2" id="areas-heading" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="field-label list-label">
                    Areas
                  </TextView>
                  {zones && zones.length === 0 ? (
                    <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY} className="list-note">
                      No areas yet. Draw the aisles, the packing station and the loading bay on the map.
                    </TextView>
                  ) : (
                    <VerticalList ariaLabel="Areas" className="inline-list">
                      {(zones ?? []).map((zone) => (
                        <ListItem key={zone.id} title={zone.name} subtitle={KIND_NAME[zone.kind]} icon={ICONS.map} visualStateOverride={selected === zone.id ? VisualState.FOCUSED : undefined} onClick={() => setSelected(zone.id)} />
                      ))}
                    </VerticalList>
                  )}
                </section>
              )}
              <Unlock places={places} processes={processes ?? []} />
              <Panel width="100%">
                <div className="panel-body">
                  <TextView as="h2" id="follow-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
                    What is followed
                  </TextView>
                  <ul className="dot-list" aria-labelledby="follow-heading">
                    {[
                      'Only during a worker\'s training period, and only after they agreed on the glasses. The glasses show when it is on.',
                      "The area they are in now and today's areas, on the server's memory only. Never saved to disk.",
                      'Owl recognises the place on your own server. The camera pictures are compared and dropped, never saved and never sent to the model.',
                      'Deleted when training ends or the worker says no. Not part of their training result.',
                    ].map((line) => (
                      <li key={line}>
                        <TextView as="span" textStyle={TextStyle.BODY2}>
                          {line}
                        </TextView>
                      </li>
                    ))}
                  </ul>
                </div>
              </Panel>
            </div>
          </ScrollView>
        </section>
      </div>
    </Page>
  )
}

function ZoneMap({
  zones,
  places,
  selected,
  drawing,
  onSelect,
  onDraw,
}: {
  zones: Zone[]
  places: TraineePlace[]
  selected: string | null
  drawing: boolean
  onSelect: (id: string) => void
  onDraw: (rect: { x: number; y: number; w: number; h: number }) => void
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [start, setStart] = useState<{ x: number; y: number } | null>(null)
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null)

  const point = (event: React.PointerEvent) => {
    const box = svg.current?.getBoundingClientRect()
    if (!box || !box.width || !box.height) return { x: 0, y: 0 }
    return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height }
  }

  const draft = start && end ? rectFrom(start, end) : null
  return (
    <svg
      ref={svg}
      className={drawing ? 'zone-map is-drawing' : 'zone-map'}
      viewBox={`0 0 ${MAP_W} ${MAP_H}`}
      role="img"
      aria-label={`Map of ${zones.length} areas. ${places.filter((p) => p.zone).map((p) => `${p.name} is in ${p.zone?.name}`).join('. ')}`}
      onPointerDown={(event) => {
        if (!drawing) return
        event.currentTarget.setPointerCapture?.(event.pointerId)
        setStart(point(event))
        setEnd(point(event))
      }}
      onPointerMove={(event) => start && setEnd(point(event))}
      onPointerUp={() => {
        if (draft && draft.w > 0.03 && draft.h > 0.03) onDraw(draft)
        setStart(null)
        setEnd(null)
      }}
    >
      <rect className="zone-floor" x={0} y={0} width={MAP_W} height={MAP_H} />
      {zones.map((zone) => {
        const here = places.filter((place) => place.zone?.id === zone.id)
        return (
          <g key={zone.id} className={`zone zone-${zone.kind}${selected === zone.id ? ' is-selected' : ''}${here.length ? ' is-occupied' : ''}`} onClick={() => !drawing && onSelect(zone.id)}>
            <rect x={zone.x * MAP_W} y={zone.y * MAP_H} width={zone.w * MAP_W} height={zone.h * MAP_H} rx={10} />
            <text className="zone-name" x={zone.x * MAP_W + 12} y={zone.y * MAP_H + 30}>
              {zone.name}
            </text>
            {here.map((place, n) => (
              <g key={place.employee_id} className="trainee-dot" transform={`translate(${zone.x * MAP_W + 26}, ${zone.y * MAP_H + 66 + n * 40})`}>
                <circle r={15} />
                <text className="trainee-initial" y={6}>
                  {place.name.charAt(0).toUpperCase()}
                </text>
                <text className="trainee-name" x={24} y={6}>
                  {place.name}
                </text>
              </g>
            ))}
          </g>
        )
      })}
      {draft && <rect className="zone-draft" x={draft.x * MAP_W} y={draft.y * MAP_H} width={draft.w * MAP_W} height={draft.h * MAP_H} rx={10} />}
    </svg>
  )
}

function ZoneForm({ zone, onSave, onRemove, onClose }: { zone: Zone; onSave: (zone: Zone) => Promise<void>; onRemove: (zone: Zone) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(zone.name)
  const [kind, setKind] = useState<ZoneKind>(zone.kind)
  const kindChoices = (Object.keys(KIND_NAME) as ZoneKind[]).map((k) => ({ value: k, label: KIND_NAME[k] }))
  return (
    <section aria-labelledby="zone-heading">
      <Panel width="100%">
        <div className="panel-body zone-body">
          <TextView as="h2" id="zone-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
            {zone.name}
          </TextView>
          <TextField id="zone-name" label="Name" value={name} maxLength={60} onChange={setName} />
          <VerticalList ariaLabel="Kind of area" className="inline-list">
            <ChoiceRow label="Kind" choices={kindChoices} value={kind} onChange={setKind} />
          </VerticalList>
          <Actions align="start">
            <PrimaryButton title="Save" icon={ICONS.check} disabled={!name.trim()} onClick={() => name.trim() && void onSave({ ...zone, name: name.trim(), kind })} />
            <Button title="Close" alwaysShowText onClick={onClose} />
            <DangerButton title="Remove" icon={ICONS.trash} onClick={() => void onRemove(zone)} />
          </Actions>
        </div>
      </Panel>
    </section>
  )
}

/** Where each step happens. Saved on the task itself, so the glasses get it with the task. */
function Checkpoints({ zones, processes }: { zones: Zone[]; processes: Process[] }) {
  const { api, putProcess } = useStudio()
  const toast = useToast()
  const [edits, setEdits] = useState<Record<string, Step['checkpoint']>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [open, setOpen] = useState('')
  const key = (process: Process, step: Step) => `${process.id}/${step.id}`
  const current = (process: Process, step: Step) => (key(process, step) in edits ? edits[key(process, step)] : (step.checkpoint ?? null))
  const set = (process: Process, step: Step, value: Step['checkpoint']) => setEdits({ ...edits, [key(process, step)]: value })

  const save = async (process: Process) => {
    setBusy(process.id)
    setError('')
    try {
      const steps = process.steps.map((step) => {
        const cp = current(process, step)
        return { ...step, checkpoint: cp && cp.zone_id && cp.label.trim() ? { zone_id: cp.zone_id, label: cp.label.trim(), photo_urls: cp.photo_urls ?? [] } : null }
      })
      const saved = await api.saveProcess({ ...process, steps })
      putProcess(saved)
      setEdits(Object.fromEntries(Object.entries(edits).filter(([k]) => !k.startsWith(`${process.id}/`))))
      toast({ message: `The places of "${process.title}" are saved.` })
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy('')
    }
  }

  const zoneChoices = [{ value: '', label: 'Anywhere' }, ...zones.map((zone) => ({ value: zone.id, label: zone.name }))]
  return (
    <section aria-labelledby="checkpoints-heading" className="route-section">
      <TextView as="h2" id="checkpoints-heading" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="field-label">
        Where each step happens
      </TextView>
      <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
        A step with a place is locked on the glasses during training until Owl recognises the place in the camera picture. Owl learns the place from the expert's photo of the step; add photos from other angles so it knows the place better. Leave the place empty for a step that can happen anywhere.
      </TextView>
      {zones.length === 0 && (
        <TextView as="p" textStyle={TextStyle.BODY2} textColor={TextColor.SECONDARY}>
          Draw an area first.
        </TextView>
      )}
      {error && <StatusText tone="negative">{error}</StatusText>}
      {zones.length > 0 &&
        processes.map((process) => {
          const dirty = process.steps.some((step) => key(process, step) in edits)
          const isOpen = open === process.id
          return (
            <div key={process.id} className="plan">
              <VerticalList ariaLabel={`Places of ${process.title}`} className="inline-list">
                <ListItem title={process.title} subtitle={`${process.steps.filter((step) => step.checkpoint).length} steps with a place`} icon={ICONS.map} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : process.id)} />
                {isOpen &&
                  process.steps.map((step) => {
                    const cp = current(process, step)
                    return (
                      <ChoiceRow
                        key={step.id}
                        label={`Area of step ${step.index}`}
                        note={`${step.index}. ${step.title} · ${cp?.zone_id ? (zones.find((z) => z.id === cp.zone_id)?.name ?? cp.zone_id) : 'Anywhere'}`}
                        choices={zoneChoices}
                        value={cp?.zone_id ?? ''}
                        onChange={(zoneId) => set(process, step, zoneId ? { zone_id: zoneId, label: cp?.label || zones.find((z) => z.id === zoneId)?.name || '', photo_urls: cp?.photo_urls ?? [] } : null)}
                      />
                    )
                  })}
              </VerticalList>
              {isOpen && (
                <div className="plan-foot checkpoint-fields">
                  {process.steps.map((step) => {
                    const cp = current(process, step)
                    const id = `cp-${process.id}-${step.id}`
                    return (
                      <div key={step.id} className="checkpoint-step">
                        <TextField
                          id={`${id}-label`}
                          label={`What the glasses say for step ${step.index}`}
                          value={cp?.label ?? ''}
                          maxLength={LABEL_LIMIT}
                          placeholder={cp ? 'Aisle C · Shelf 12' : 'Choose an area first'}
                          onChange={(text) => cp && set(process, step, { ...cp, label: text })}
                        />
                        {step.checkpoint && <PlacePhotos process={process} step={step} />}
                      </div>
                    )
                  })}
                  <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
                    {'The glasses say "Go to:" and the text you write, with the step\'s photo. Save a place before you add photos of it.'}
                  </TextView>
                  <Actions align="start">
                    <PrimaryButton title="Save the places" icon={ICONS.check} disabled={!dirty || busy === process.id} onClick={() => void save(process)} />
                  </Actions>
                </div>
              )}
            </div>
          )
        })}
    </section>
  )
}

/** The pictures Owl recognises a step's place from: the expert's photo of the step, and photos added here. */
function PlacePhotos({ process, step }: { process: Process; step: Step }) {
  const { api, putProcess } = useStudio()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const extra = step.checkpoint?.photo_urls ?? []
  const inputId = `place-photo-${process.id}-${step.id}`
  const picker = useRef<HTMLInputElement>(null)

  const add = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      putProcess(await api.addPlacePhoto(process.id, step.id, file))
      toast({ message: `Owl knows "${step.checkpoint?.label}" from one more angle.` })
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (url: string) => {
    setBusy(true)
    try {
      const steps = process.steps.map((s) => (s.id === step.id && s.checkpoint ? { ...s, checkpoint: { ...s.checkpoint, photo_urls: extra.filter((u) => u !== url) } } : s))
      putProcess(await api.saveProcess({ ...process, steps }))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="place-photos">
      <TextView as="span" textStyle={TextStyle.META1_EMPHASIZED} textColor={TextColor.SECONDARY} className="field-label">
        Owl knows this place from
      </TextView>
      <ul className="place-photo-list" aria-label={`Photos of the place of step ${step.index}`}>
        {step.reference_image_url && (
          <li>
            <img src={step.reference_image_url} alt={`The expert's photo of step ${step.index}`} />
            <TextView as="span" textStyle={TextStyle.META2} textColor={TextColor.SECONDARY}>
              {"Expert's photo"}
            </TextView>
          </li>
        )}
        {extra.map((url, n) => (
          <li key={url}>
            <img src={url} alt={`Photo ${n + 1} of the place`} />
            <Button title={`Remove photo ${n + 1}`} icon={ICONS.x} disabled={busy} onClick={() => void remove(url)} />
          </li>
        ))}
      </ul>
      {extra.length < 8 && (
        <>
          <input ref={picker} id={inputId} className="visually-hidden" type="file" accept="image/jpeg,image/png" aria-label="Add a photo of the place" disabled={busy} onChange={(event) => void add(event.target.files?.[0])} />
          <Button title="Add a photo of the place" icon={ICONS.plus} alwaysShowText disabled={busy} onClick={() => picker.current?.click()} />
        </>
      )}
      {!step.reference_image_url && extra.length === 0 && (
        <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
          No picture yet: Owl cannot recognise this place until you add one.
        </TextView>
      )}
      {error && <StatusText tone="negative">{error}</StatusText>}
    </div>
  )
}

/** Owl does not recognise the place (new shelves, bad light): open the step for the worker by hand. */
function Unlock({ places, processes }: { places: TraineePlace[]; processes: Process[] }) {
  const { api } = useStudio()
  const toast = useToast()
  const [who, setWho] = useState('')
  const [step, setStep] = useState('')
  const [error, setError] = useState('')
  const options = processes.flatMap((process) => process.steps.filter((s) => s.checkpoint).map((s) => ({ value: `${process.id}/${s.id}`, text: `${process.title} · ${s.index}. ${s.title}` })))
  if (!places.length || !options.length) return null

  const open = async () => {
    const [processId, stepId] = step.split('/')
    if (!who || !processId) {
      setError('Choose the trainee and the step.')
      return
    }
    try {
      await api.unlockStep(who, processId, stepId)
      toast({ message: `The step is open on ${places.find((p) => p.employee_id === who)?.name}'s glasses.` })
      setError('')
    } catch (err) {
      setError(messageOf(err))
    }
  }

  const whoChoices = [{ value: '', label: 'Choose' }, ...places.map((place) => ({ value: place.employee_id, label: place.name }))]
  const stepChoices = [{ value: '', label: 'Choose' }, ...options.map((option) => ({ value: option.value, label: option.text }))]
  return (
    <section aria-labelledby="unlock-heading">
      <Panel width="100%">
        <div className="panel-body unlock-body">
          <TextView as="h2" id="unlock-heading" textStyle={TextStyle.BODY2_EMPHASIZED}>
            Open a step by hand
          </TextView>
          <TextView as="p" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
            When Owl does not recognise the place, for example after the shelves have moved.
          </TextView>
          <VerticalList ariaLabel="Trainee and step" className="inline-list">
            <ChoiceRow label="Trainee" choices={whoChoices} value={who} onChange={setWho} />
            <ChoiceRow label="Step" choices={stepChoices} value={step} onChange={setStep} />
          </VerticalList>
          {error && <StatusText tone="negative">{error}</StatusText>}
          <Actions align="start">
            <Button title="Open the step" icon={ICONS.check} alwaysShowText onClick={() => void open()} />
          </Actions>
        </div>
      </Panel>
    </section>
  )
}
