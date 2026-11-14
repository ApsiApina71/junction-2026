import type { KeyboardEvent } from 'react'

// Studio is used with a keyboard and a mouse. The toolkit's focus navigation (built for the glasses' D-pad) takes the
// arrow keys; inside a text field they belong to the caret.

/** Keys that move the caret in an edit field. */
export const CARET_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])

/** For a toolkit InputTextView: left, right, Home and End move the caret inside it instead of moving focus. */
export function keepCaretKeys(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') event.stopPropagation()
}
