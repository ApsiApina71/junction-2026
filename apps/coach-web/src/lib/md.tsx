import type { ReactNode } from 'react'
import { blocks } from './blocks'

/** Split text into plain and **bold** runs. No HTML is ever injected. */
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((run, i) => (run.startsWith('**') && run.endsWith('**') && run.length > 4 ? <strong key={i}>{run.slice(2, -2)}</strong> : run))
}

export function Markdown({ text }: { text: string }) {
  return (
    <>
      {blocks(text).map((b, i) =>
        b.type === 'p' ? (
          <p key={i}>{inline(b.text)}</p>
        ) : b.type === 'ul' ? (
          <ul key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ul>
        ) : (
          <ol key={i}>
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ol>
        ),
      )}
    </>
  )
}
