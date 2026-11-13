/** A deliberately small Markdown subset: paragraphs, bullet and numbered lists, bold. */
export type Block = { type: 'p'; text: string } | { type: 'ul' | 'ol'; items: string[] }

export function blocks(src: string): Block[] {
  const out: Block[] = []
  for (const raw of src.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line)
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    const last = out[out.length - 1]
    if (bullet) {
      if (last?.type === 'ul') last.items.push(bullet[1])
      else out.push({ type: 'ul', items: [bullet[1]] })
    } else if (numbered) {
      if (last?.type === 'ol') last.items.push(numbered[1])
      else out.push({ type: 'ol', items: [numbered[1]] })
    } else {
      out.push({ type: 'p', text: heading ? `**${heading[1].replaceAll('**', '')}**` : line })
    }
  }
  return out
}
