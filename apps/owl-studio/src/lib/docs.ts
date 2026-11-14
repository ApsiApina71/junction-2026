// What Owl can read, checked before a file is sent so the person hears why straight away.

export const MAX_DOC_BYTES = 10 * 1024 * 1024
export const DOC_TYPES = ['md', 'txt', 'pdf']

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)
}

/** Why this file cannot be added, with what to do about it; null when it can. */
export function fileProblem(name: string, bytes: number): string | null {
  const dot = name.lastIndexOf('.')
  const type = dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
  if (!DOC_TYPES.includes(type)) {
    const what = type ? `a .${type} file` : 'not a kind of file Owl knows'
    return `Owl reads .md, .txt and .pdf files, and ${name} is ${what}. Save it as a PDF and add that.`
  }
  if (bytes === 0) return `${name} is empty. Check the file and add it again.`
  if (bytes > MAX_DOC_BYTES) return `${name} is ${megabytes(bytes)} MB, and Owl takes files up to 10 MB. Split it into parts, or save it without large pictures.`
  return null
}

/** "2,400 characters", so a document's size means something without talking about bytes. */
export function lengthText(chars: number): string {
  return `${chars.toLocaleString('en-US')} ${chars === 1 ? 'character' : 'characters'}`
}

/** "Glasses 1" for the id glasses-1; other ids are shown as they are. */
export function glassesName(id: string): string {
  const match = /^glasses-(\d+)$/.exec(id)
  return match ? `Glasses ${match[1]}` : id
}
