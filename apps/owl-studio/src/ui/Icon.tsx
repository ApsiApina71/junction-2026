// Stroke icons drawn here, so the app ships no icon files. Always used beside a text label or with an aria-label on its button.

import type { ReactNode } from 'react'

export type IconName =
  | 'tasks'
  | 'documents'
  | 'people'
  | 'help'
  | 'data'
  | 'settings'
  | 'grip'
  | 'up'
  | 'down'
  | 'trash'
  | 'plus'
  | 'x'
  | 'check'
  | 'chevron'
  | 'back'
  | 'upload'
  | 'mic'
  | 'send'
  | 'point'
  | 'glasses'
  | 'sound'
  | 'undo'
  | 'info'
  | 'training'
  | 'map'
  | 'print'

const PATHS: Record<IconName, ReactNode> = {
  tasks: (
    <>
      <path d="M10.5 6h9.5M10.5 12h9.5M10.5 18h9.5" />
      <path d="M3.5 6l1.4 1.4L7.5 4.8M3.5 12l1.4 1.4 2.6-2.6M3.5 18l1.4 1.4 2.6-2.6" />
    </>
  ),
  documents: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  people: (
    <>
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M3 20v-1a4 4 0 0 1 4-4h5a4 4 0 0 1 4 4v1" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M21 20v-1a4 4 0 0 0-3-3.87" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M5.6 5.6l3.9 3.9M14.5 14.5l3.9 3.9M18.4 5.6l-3.9 3.9M9.5 14.5l-3.9 3.9" />
    </>
  ),
  data: (
    <>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6z" />
      <path d="M9 12l2.2 2.2L15 10.4" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M19 7h1M4 17h3M13 17h7" />
      <circle cx="16" cy="7" r="2.5" />
      <circle cx="10" cy="17" r="2.5" />
    </>
  ),
  grip: (
    <g fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.4" />
      <circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" />
      <circle cx="15" cy="18" r="1.4" />
    </g>
  ),
  up: <path d="M12 19V6M6 11.5L12 5.5l6 6" />,
  down: <path d="M12 5v13M6 12.5l6 6 6-6" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  chevron: <path d="M9 6l6 6-6 6" />,
  back: <path d="M15 6l-6 6 6 6" />,
  upload: <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  send: <path d="M21 3L10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z" />,
  point: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  glasses: (
    <>
      <circle cx="7" cy="14" r="3.5" />
      <circle cx="17" cy="14" r="3.5" />
      <path d="M10.5 14h3M3.5 14L5 7M20.5 14L19 7" />
    </>
  ),
  sound: <path d="M4 9.5v5h3.5L12 18V6L7.5 9.5zM15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />,
  undo: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <circle cx="12" cy="7.6" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),  training: (
    <>
      <path d="M2.5 9L12 4.5 21.5 9 12 13.5z" />
      <path d="M6.5 11v4.5c1.6 1.6 3.4 2.5 5.5 2.5s3.9-.9 5.5-2.5V11M21.5 9v5.5" />
    </>
  ),
  map: (
    <>
      <path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
      <path d="M9 4.5v13M15 6.5v13" />
    </>
  ),
  print: (
    <>
      <path d="M7 9V3.5h10V9M7 17H4.5V10a1 1 0 0 1 1-1h13a1 1 0 0 1 1 1v7H17" />
      <path d="M7 14h10v6.5H7z" />
    </>
  ),
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
