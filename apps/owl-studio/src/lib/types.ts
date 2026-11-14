// The shapes of docs/specs/owl-contract.md that Owl Studio reads and writes.

export interface Employee {
  id: string
  name: string
  language: string
  role: string
  company: string
  welcome: string
  process_ids: string[]
  glasses_id: string | null
}

/** What Studio sends to add or change an employee. A field that is left out stays as it is. */
export interface EmployeeInput {
  name?: string
  language?: string
  role?: string
  process_ids?: string[]
  glasses_id?: string | null
  /** An empty string hands the welcome back to Owl's own wording. */
  welcome?: string | null
}

export type CheckKind = 'visual' | 'order' | 'none'

export interface OrderLine {
  sku: string | null
  name: string
  qty: number
}

export interface Check {
  kind: CheckKind
  criteria: string[]
  order_lines: OrderLine[] | null
}

export interface Source {
  doc: string
  quote: string
  section?: string | null
}

export interface Step {
  id: string
  index: number
  title: string
  instruction: string
  say: string
  reference_image_url: string | null
  clip_url: string | null
  check: Check
  source: Source | null
  /** False on a step Owl wrote from a recording that no person has read yet. Left out by older servers, which means true. */
  reviewed?: boolean
  /** Where the step happens (JUN-97). During training it is locked on the glasses until the worker gets there. */
  checkpoint?: Checkpoint | null
}

export interface Checkpoint {
  zone_id: string
  /** "Aisle C · Shelf 12", at most 40 characters. */
  label: string
}

export interface Process {
  id: string
  title: string
  summary: string
  company: string
  language: string
  status: 'draft' | 'published'
  source: 'record' | 'docs'
  expert: string | null
  steps: Step[]
}

export interface Answer {
  found: boolean
  text: string
  say: string
  language: string
  sources: Source[]
}

export interface Doc {
  id: string
  title: string
  filename: string
  chars: number
  uploaded_at: string
}

export interface HelpMessage {
  id: number
  from: 'worker' | 'expert'
  text: string
  at: string
  image_url: string | null
}

export interface HelpSession {
  id: string
  status: 'waiting' | 'connected' | 'ended'
  employee_id: string | null
  process_id: string | null
  step_id: string | null
  latest_frame_url: string | null
  frame_at: string | null
  updated_at: string
  messages: HelpMessage[]
}

export interface RecordedStep {
  index: number
  narration: string
  photo_url: string | null
  clip_url: string | null
}

export interface Recording {
  id: string
  title: string
  expert: string | null
  status: 'recording' | 'processing' | 'done' | 'failed'
  steps: RecordedStep[]
  process_id: string | null
}

/** A point in the worker's view, as a share of the frame's width and height from its top left corner. */
export interface Mark {
  x: number
  y: number
}

/** Anonymous totals of how learning goes. No names, no ids: Studio never shows one person's results. */
export interface Stats {
  runs: number
  tasks_finished: number
  workers: number
  median_seconds_to_first_finished_task: number | null
  problems_caught: number
  problems_fixed: number
}

export interface Health {
  status: string
  model_id: string
}

// Training period and target level (JUN-96)

export interface TargetStep {
  process_id: string
  step_id: string
  required: number
}

export interface TrainingPlan {
  id: string
  role: string
  days: number
  target: TargetStep[]
  /** JUN-98: workers in this role may turn on customer service mode on the glasses during training. */
  customer_service?: boolean
}

export interface TrainingRow extends TargetStep {
  title: string
  task: string
  done_without_help: number
  met: boolean
}

export type TrainingResult = 'ready' | 'more_practice'

export interface Training {
  employee_id: string
  plan_id: string
  starts: string
  ends: string
  day: number
  days: number
  days_left: number
  active: boolean
  target: TrainingRow[]
  practise: { process_id: string; step_id: string; title: string }[]
  /** Owl's suggestion. In Studio's list it stays null until the worker has seen it on the glasses. */
  suggestion: TrainingResult | null
  seen_at: string | null
  confirmed: { result: TrainingResult; by: string; at: string; note: string | null } | null
}

/** A row of Studio's training list: the worker's training with their name. */
export interface Trainee extends Training {
  name: string
  role: string
  /** Owl has a suggestion, but the worker has not seen it on the glasses yet. */
  waiting_for_worker?: boolean
}

// Location during training (JUN-97)

export type ZoneKind = 'aisle' | 'packing' | 'loading' | 'other'

/** An area on the map. x, y, w and h are shares of the map's width and height, from the top left. */
export interface Zone {
  id: string
  name: string
  kind: ZoneKind
  x: number
  y: number
  w: number
  h: number
}

export interface Marker {
  payload: string
  kind: 'zone' | 'checkpoint'
  label: string
  zone_id: string
  process_id: string | null
  step_id: string | null
  step_title?: string
  task?: string
  svg: string
}

export interface TraineePlace {
  employee_id: string
  name: string
  zone: { id: string; name: string } | null
  entered_at: string | null
}
