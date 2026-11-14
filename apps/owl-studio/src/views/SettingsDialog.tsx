import { useState } from 'react'
import { DEFAULT_API_URL, cleanUrl, saveApiConfig } from '../lib/api.ts'
import { useStudio } from '../lib/studio.ts'
import { saveTheme, storedTheme } from '../lib/theme.ts'
import type { Theme } from '../lib/theme.ts'
import { Dialog } from '../ui/parts.tsx'

const THEMES: { theme: Theme; label: string }[] = [
  { theme: 'auto', label: 'Match this device' },
  { theme: 'light', label: 'Light' },
  { theme: 'dark', label: 'Dark' },
]

/** Which Owl server Studio talks to, and how Studio looks. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { api, reconnect } = useStudio()
  const [url, setUrl] = useState(api.config.baseUrl)
  const [token, setToken] = useState(api.config.token)
  const [theme, setTheme] = useState<Theme>(storedTheme)
  const [urlProblem, setUrlProblem] = useState(false)

  const save = (event: React.FormEvent) => {
    event.preventDefault()
    const address = cleanUrl(url) || DEFAULT_API_URL
    if (!/^https?:\/\/\S+$/.test(address)) {
      setUrlProblem(true)
      document.getElementById('settings-url')?.focus()
      return
    }
    saveTheme(theme)
    if (address !== api.config.baseUrl || token.trim() !== api.config.token) {
      saveApiConfig({ baseUrl: address, token })
      reconnect()
    }
    onClose()
  }

  return (
    <Dialog
      title="Settings"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="button button-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="settings-form" className="button button-primary">
            Save and connect
          </button>
        </>
      }
    >
      <form id="settings-form" className="stack" onSubmit={save} noValidate>
        <div className="field">
          <label htmlFor="settings-url">Owl server address</label>
          <input
            id="settings-url"
            className="input"
            type="url"
            inputMode="url"
            value={url}
            placeholder={DEFAULT_API_URL}
            autoComplete="off"
            aria-invalid={urlProblem}
            aria-describedby="settings-url-hint"
            onChange={(event) => {
              setUrl(event.target.value)
              setUrlProblem(false)
            }}
          />
          <p className={urlProblem ? 'field-error' : 'hint'} id="settings-url-hint">
            {urlProblem ? 'Write the full address, starting with http:// or https://.' : 'The computer that runs Owl for your company, for example http://192.168.1.20:8000.'}
          </p>
        </div>
        <div className="field">
          <label htmlFor="settings-token">Access token</label>
          <input id="settings-token" className="input" type="password" value={token} autoComplete="off" aria-describedby="settings-token-hint" onChange={(event) => setToken(event.target.value)} />
          <p className="hint" id="settings-token-hint">
            Only if the server was started with one. It is kept in this browser.
          </p>
        </div>
        <fieldset className="field">
          <legend>Appearance</legend>
          <div className="segmented">
            {THEMES.map((option) => (
              <label key={option.theme} className={theme === option.theme ? 'segment is-on' : 'segment'}>
                <input type="radio" name="theme" checked={theme === option.theme} onChange={() => setTheme(option.theme)} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Dialog>
  )
}
