// Files Lauri drops into public/ (JUN-88, JUN-89). Until they exist, the page uses its built-in placeholders.
const base = import.meta.env.BASE_URL

export const ASSETS = {
  glasses: `${base}models/owl-glasses.glb`,
  band: `${base}models/neural-band.glb`,
  povMp4: `${base}video/pov-loop.mp4`,
  povWebm: `${base}video/pov-loop.webm`,
  povPoster: `${base}video/pov-poster.jpg`,
}

export const LINKS = {
  repo: 'https://github.com/ApsiApina71/junction-2026',
  // The public 2-minute film (JUN-50). Empty hides the button.
  film: '',
}

/** True when the bytes start with the binary glTF magic "glTF". */
export function isGlb(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) return false
  const magic = new Uint8Array(buffer, 0, 4)
  return magic[0] === 0x67 && magic[1] === 0x6c && magic[2] === 0x54 && magic[3] === 0x46
}

/** The model's bytes, or null when the file is missing (dev servers answer a missing file with index.html). */
export async function fetchGlb(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = await res.arrayBuffer()
    return isGlb(buffer) ? buffer : null
  } catch {
    return null
  }
}

/** True when the URL serves a video. */
export async function hasVideo(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok && (res.headers.get('content-type') ?? '').startsWith('video/')
  } catch {
    return false
  }
}
