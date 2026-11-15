// What Owl shows in Aino's lens at each stop of the walk (JUN-86): the glasses' real screens (apps/owl-glasses,
// OwlScreens.swift, built from Meta's DAT Display components), in their own words and with their own owl faces,
// small and fixed where the display sits. LensCard.tsx draws them; World reports which one is on.
import type { Phase } from './three/tray'

export type Mood = 'welcome' | 'watching' | 'listening' | 'thinking' | 'alert' | 'done'
export type Icon = 'check' | 'play' | 'speech' | 'person' | 'again' | 'back' | 'home' | 'endHelp'
export type LensButton = { icon: Icon; label?: string; primary?: boolean }

export type LensScreen = {
  mood: Mood
  meta?: string
  title?: string
  /** The order block of a step card: a small label and lines with a bold amount. */
  list?: { label: string; lines: [string, string][] }
  /** The correction's evidence: what the list says beside what she has, the part that differs large. */
  evidence?: { left: [string, string, string]; right: [string, string, string]; state: 'wrong' | 'right' }
  body?: string
  note?: string
  buttons: LensButton[]
}

const STEP_BUTTONS: LensButton[] = [{ icon: 'check', label: 'Done', primary: true }, { icon: 'play' }, { icon: 'speech' }, { icon: 'person' }]
const ON_THE_LIST = 'ON THE LIST'
const IN_HANDS = 'IN YOUR HANDS'

export const SCREENS = {
  welcome: { mood: 'welcome', meta: 'Junction 2026 · Crew', title: 'Welcome, Aino', body: 'Your first task: drinks for Fridge 2.', buttons: [{ icon: 'play', label: 'Start', primary: true }] },
  pick: {
    mood: 'watching',
    meta: 'Step 1 of 3',
    title: 'Pick up the drinks',
    list: { label: 'FRIDGE 2 NEEDS', lines: [['1 ×', 'Sparkling water, tray']] },
    note: 'Owl is watching',
    buttons: STEP_BUTTONS,
  },
  wrong: {
    mood: 'alert',
    meta: 'Step 1 of 3 · Check this',
    title: 'Use Sparkling water',
    evidence: { left: [ON_THE_LIST, 'Water', 'Sparkling'], right: [IN_HANDS, 'Water', 'Still'], state: 'wrong' },
    note: 'Fridge 2 takes the sparkling one.',
    buttons: [{ icon: 'again', label: 'Check again', primary: true }, { icon: 'back' }],
  },
  checking: { mood: 'thinking', meta: 'Pick up the drinks', title: 'Checking', body: 'Hold it still for a moment.', buttons: [{ icon: 'back', label: 'Back', primary: true }] },
  right: {
    mood: 'done',
    meta: 'Step 1 of 3 · Check this',
    title: 'That looks right now',
    evidence: { left: [ON_THE_LIST, 'Water', 'Sparkling'], right: [IN_HANDS, 'Water', 'Sparkling'], state: 'right' },
    // The native card keeps its buttons where they were (OwlScreens.correction, fixed: true) and says how to finish.
    note: 'Pinch Check again and Owl checks the step.',
    buttons: [{ icon: 'again', label: 'Check again', primary: true }, { icon: 'back' }],
  },
  goto: {
    mood: 'watching',
    meta: 'Step 2 of 3 · Location on',
    title: 'Go to: Fridge 2',
    body: 'Left wall, by the stage.',
    note: 'Owl opens this step when it sees you are there.',
    buttons: [{ icon: 'person', label: 'Help', primary: true }, { icon: 'home' }],
  },
  answer: {
    mood: 'listening',
    meta: '“Where’s the hardware lab?”',
    body: 'Behind the stage, through the door on the left.',
    note: 'Source: Junction crew handbook · Venue',
    buttons: [{ icon: 'back', label: 'Back', primary: true }, { icon: 'speech' }],
  },
  shelf: {
    mood: 'watching',
    meta: 'Step 3 of 3',
    title: 'Stock Fridge 2',
    list: { label: 'MIDDLE SHELF', lines: [['1 ×', 'Sparkling water, tray']] },
    note: 'Owl is watching',
    buttons: STEP_BUTTONS,
  },
  checkingShelf: { mood: 'thinking', meta: 'Stock Fridge 2', title: 'Checking', body: 'Hold it still for a moment.', buttons: [{ icon: 'back', label: 'Back', primary: true }] },
  stocked: {
    mood: 'done',
    meta: 'Drinks for Fridge 2',
    title: 'Well done',
    body: 'Owl verified both checked steps.',
    note: 'The shelf matches crew lead Eeva’s photo.',
    buttons: [{ icon: 'home', label: 'Home', primary: true }],
  },
  help: {
    mood: 'listening',
    meta: 'Help',
    title: 'An expert is with you',
    body: 'Empty the grounds drawer: the tray at the front, bottom left.',
    note: 'Crew lead Eeva',
    buttons: [{ icon: 'endHelp', label: 'End help', primary: true }],
  },
} satisfies Record<string, LensScreen>

export type ScreenId = keyof typeof SCREENS

/** The screen in her lens at a stop, once she has arrived there; none outside, on the street, or on stage. */
export function screenFor(stop: string, arrived: boolean, phase: Phase): ScreenId | null {
  if (!arrived) return null
  switch (stop) {
    case 'welcome':
      return 'welcome'
    case 'counter':
      return 'pick'
    case 'correction':
      return phase === 'lift' ? 'pick' : 'wrong'
    case 'fixed':
      return phase === 'swap' ? 'wrong' : phase === 'check' ? 'checking' : 'right'
    case 'route':
      return 'goto'
    case 'visitor':
      return 'answer'
    case 'fridge':
      return phase === 'shelf-check' ? 'checkingShelf' : phase === 'shelf-done' ? 'stocked' : 'shelf'
    case 'help':
      return 'help'
    default:
      return null
  }
}
