import { useEffect, useRef, useState } from 'react'
import { messageOf } from '../lib/api.ts'
import { usePolling } from '../lib/hooks.ts'
import { useStudio } from '../lib/studio.ts'
import { rectFrom, zoneId } from '../lib/training.ts'
import type { Process, Step, TraineePlace, Zone, ZoneKind } from '../lib/types.ts'
import { Icon } from '../ui/Icon.tsx'
import { EmptyState, Problem } from '../ui/parts.tsx'
import { useToast } from '../ui/toast.ts'
import './training.css'

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
    <div className="view">
      <header className="view-head">
        <div>
          <h1>Map</h1>
          <p className="lede">
            Draw the areas of your workplace and say where each step happens. No markers to put up: during training a step opens on the glasses when Owl recognises its place in the camera picture, and you see which area each trainee is in now.
          </p>
        </div>
      </header>

      {problem && <Problem>{problem}</Problem>}

      <div className="two-col two-col-wide">
        <div className="stack">
          <section className="panel" aria-labelledby="map-heading">
            <div className="data-head">
              <h2 id="map-heading">Now</h2>
              <button type="button" className={drawing ? 'button button-primary button-small' : 'button button-secondary button-small'} aria-pressed={drawing} onClick={() => setDrawing(!drawing)}>
                <Icon name="plus" size={18} />
                {drawing ? 'Drag on the map to draw' : 'Draw an area'}
              </button>
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
            <p className="hint" aria-live="polite">
              {places.length === 0
                ? 'No one in training is being followed right now. It starts when a trainee agrees on the glasses.'
                : places.map((place) => `${place.name}: ${place.zone ? place.zone.name : 'not recognised yet'}`).join(' · ')}
            </p>
          </section>

          <Checkpoints zones={zones ?? []} processes={processes ?? []} />
        </div>

        <aside className="stack">
          {chosen ? (
            <ZoneForm key={chosen.id} zone={chosen} onSave={saveZone} onRemove={removeZone} onClose={() => setSelected(null)} />
          ) : (
            <section className="panel" aria-labelledby="areas-heading">
              <h2 id="areas-heading">Areas</h2>
              {zones && zones.length === 0 ? (
                <EmptyState title="No areas yet">Draw the aisles, the packing station and the loading bay on the map.</EmptyState>
              ) : (
                <ul className="plain-list zone-list">
                  {(zones ?? []).map((zone) => (
                    <li key={zone.id}>
                      <button type="button" className="button button-quiet button-small" onClick={() => setSelected(zone.id)}>
                        {zone.name}
                        <span className="muted"> · {KIND_NAME[zone.kind]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <Unlock places={places} processes={processes ?? []} />
          <section className="panel" aria-labelledby="follow-heading">
            <h2 id="follow-heading">What is followed</h2>
            <ul className="plain-list">
              <li>Only during a worker's training period, and only after they agreed on the glasses. The glasses show when it is on.</li>
              <li>The area they are in now and today's areas, on the server's memory only. Never saved to disk.</li>
              <li>Owl recognises the place on your own server. The camera pictures are compared and dropped, never saved and never sent to the model.</li>
              <li>Deleted when training ends or the worker says no. Not part of their training result.</li>
            </ul>
          </section>
        </aside>
      </div>

    </div>
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
  return (
    <form
      className="panel"
      aria-labelledby="zone-heading"
      onSubmit={(event) => {
        event.preventDefault()
        if (name.trim()) void onSave({ ...zone, name: name.trim(), kind })
      }}
    >
      <h2 id="zone-heading">{zone.name}</h2>
      <div className="field">
        <label htmlFor="zone-name">Name</label>
        <input id="zone-name" className="input" value={name} maxLength={60} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="zone-kind">Kind</label>
        <select id="zone-kind" className="input" value={kind} onChange={(event) => setKind(event.target.value as ZoneKind)}>
          {(Object.keys(KIND_NAME) as ZoneKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_NAME[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="form-actions">
        <button type="button" className="button button-quiet is-danger" onClick={() => void onRemove(zone)}>
          <Icon name="trash" size={18} />
          Remove
        </button>
        <button type="button" className="button button-quiet" onClick={onClose}>
          Close
        </button>
        <button type="submit" className="button button-primary" disabled={!name.trim()}>
          Save
        </button>
      </div>
    </form>
  )
}

/** Where each step happens. Saved on the task itself, so the glasses get it with the task. */
function Checkpoints({ zones, processes }: { zones: Zone[]; processes: Process[] }) {
  const { api, putProcess } = useStudio()
  const toast = useToast()
  const [edits, setEdits] = useState<Record<string, Step['checkpoint']>>({})
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
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

  return (
    <section aria-labelledby="checkpoints-heading">
      <h2 id="checkpoints-heading">Where each step happens</h2>
      <p className="hint">A step with a place is locked on the glasses during training until Owl recognises the place in the camera picture. Owl learns the place from the expert's photo of the step; add photos from other angles so it knows the place better. Leave the place empty for a step that can happen anywhere.</p>
      {zones.length === 0 && <p className="hint">Draw an area first.</p>}
      {error && <p className="field-error">{error}</p>}
      {zones.length > 0 &&
        processes.map((process) => {
          const dirty = process.steps.some((step) => key(process, step) in edits)
          return (
            <details key={process.id} className="panel plan">
              <summary>
                <span className="row-title">{process.title}</span>
                <span className="row-meta">{process.steps.filter((step) => step.checkpoint).length} steps with a place</span>
              </summary>
              <ul className="plain-list">
                {process.steps.map((step) => {
                  const cp = current(process, step)
                  const id = `cp-${process.id}-${step.id}`
                  return (
                    <li key={step.id} className="checkpoint-row">
                      <span className="checkpoint-step">
                        {step.index}. {step.title}
                      </span>
                      <label className="visually-hidden" htmlFor={`${id}-zone`}>
                        Area of step {step.index}
                      </label>
                      <select
                        id={`${id}-zone`}
                        className="input"
                        value={cp?.zone_id ?? ''}
                        onChange={(event) => set(process, step, event.target.value ? { zone_id: event.target.value, label: cp?.label || zones.find((z) => z.id === event.target.value)?.name || '', photo_urls: cp?.photo_urls ?? [] } : null)}
                      >
                        <option value="">Anywhere</option>
                        {zones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                      <label className="visually-hidden" htmlFor={`${id}-label`}>
                        What the glasses say for step {step.index}
                      </label>
                      <input
                        id={`${id}-label`}
                        className="input"
                        value={cp?.label ?? ''}
                        maxLength={LABEL_LIMIT}
                        placeholder="Aisle C · Shelf 12"
                        disabled={!cp}
                        onChange={(event) => cp && set(process, step, { ...cp, label: event.target.value })}
                      />
                      {step.checkpoint && <PlacePhotos process={process} step={step} />}
                    </li>
                  )
                })}
              </ul>
              <p className="hint">The glasses say "Go to:" and the text you write, with the step's photo. Save a place before you add photos of it.</p>
              <div className="form-actions">
                <button type="button" className="button button-primary" disabled={!dirty || busy === process.id} onClick={() => void save(process)}>
                  Save the places
                </button>
              </div>
            </details>
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
      <span className="place-photos-title">Owl knows this place from</span>
      <ul className="place-photo-list" aria-label={`Photos of the place of step ${step.index}`}>
        {step.reference_image_url && (
          <li>
            <img src={step.reference_image_url} alt={`The expert's photo of step ${step.index}`} />
            <span className="muted">Expert's photo</span>
          </li>
        )}
        {extra.map((url, n) => (
          <li key={url}>
            <img src={url} alt={`Photo ${n + 1} of the place`} />
            <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => void remove(url)}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      {extra.length < 8 && (
        <label className="button button-secondary button-small" htmlFor={inputId}>
          <Icon name="plus" size={18} />
          Add a photo of the place
          <input id={inputId} className="visually-hidden" type="file" accept="image/jpeg,image/png" disabled={busy} onChange={(event) => void add(event.target.files?.[0])} />
        </label>
      )}
      {!step.reference_image_url && extra.length === 0 && <p className="hint">No picture yet: Owl cannot recognise this place until you add one.</p>}
      {error && <p className="field-error">{error}</p>}
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

  const open = async (event: React.FormEvent) => {
    event.preventDefault()
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

  return (
    <form className="panel" aria-labelledby="unlock-heading" onSubmit={(event) => void open(event)} noValidate>
      <h2 id="unlock-heading">Open a step by hand</h2>
      <p className="hint">When Owl does not recognise the place, for example after the shelves have moved.</p>
      <div className="field">
        <label htmlFor="unlock-who">Trainee</label>
        <select id="unlock-who" className="input" value={who} onChange={(event) => setWho(event.target.value)}>
          <option value="">Choose</option>
          {places.map((place) => (
            <option key={place.employee_id} value={place.employee_id}>
              {place.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="unlock-step">Step</label>
        <select id="unlock-step" className="input" value={step} onChange={(event) => setStep(event.target.value)}>
          <option value="">Choose</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.text}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="submit" className="button button-secondary">
          Open the step
        </button>
      </div>
    </form>
  )
}
