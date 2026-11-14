import { Button, TextColor, TextStyle, TextView } from '@wearables-ui-toolkit/mrbd'
import { useState } from 'react'
import { DEFAULT_API_URL, cleanUrl, saveApiConfig } from '../lib/api.ts'
import { useStudio } from '../lib/studio.ts'
import { Dialog, FieldLabel, PrimaryButton, TextField } from '../ui/meta.tsx'

/** Which Owl server Studio talks to. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { api, reconnect } = useStudio()
  const [url, setUrl] = useState(api.config.baseUrl)
  const [token, setToken] = useState(api.config.token)
  const [urlProblem, setUrlProblem] = useState(false)

  const save = () => {
    const address = cleanUrl(url) || DEFAULT_API_URL
    if (!/^https?:\/\/\S+$/.test(address)) {
      setUrlProblem(true)
      document.getElementById('settings-url')?.focus()
      return
    }
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
      actions={
        <>
          <Button title="Cancel" alwaysShowText onClick={onClose} />
          <PrimaryButton title="Save and connect" onClick={save} />
        </>
      }
    >
      <TextField
        id="settings-url"
        label="Owl server address"
        value={url}
        placeholder={DEFAULT_API_URL}
        error={urlProblem ? 'Write the full address, starting with http:// or https://.' : null}
        hint="The computer that runs Owl for your company, for example http://192.168.1.20:8000."
        onChange={(text) => {
          setUrl(text)
          setUrlProblem(false)
        }}
      />
      <div className="field">
        <FieldLabel htmlFor="settings-token">Access token</FieldLabel>
        <input id="settings-token" className="edit-field uit-text-body2" type="password" value={token} autoComplete="off" aria-describedby="settings-token-hint" onChange={(event) => setToken(event.target.value)} />
        <TextView as="p" id="settings-token-hint" textStyle={TextStyle.META1} textColor={TextColor.SECONDARY}>
          Only if the server was started with one. It is kept in this browser.
        </TextView>
      </div>
    </Dialog>
  )
}
