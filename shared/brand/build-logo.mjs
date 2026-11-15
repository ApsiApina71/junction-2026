import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// One editable drawing supplies both apps. Runtime assets stay inside each app.
const source = readFileSync(new URL('./owl-mark.svg', import.meta.url), 'utf8')
const light = source.replace('#111111', '#ffffff')
const favicon = source.replace('fill="#111111"', 'fill="currentColor"').replace(
  '>\n',
  '>\n  <style>:root { color: #111111; } @media (prefers-color-scheme: dark) { :root { color: #ffffff; } }</style>\n',
)

writeFileSync(new URL('./owl-mark-light.svg', import.meta.url), light)
for (const app of ['owl-site', 'owl-studio']) {
  const publicDir = new URL(`../../apps/${app}/public/`, import.meta.url)
  const owlDir = new URL('owl/', publicDir)
  mkdirSync(owlDir, { recursive: true })
  writeFileSync(new URL('logo.svg', owlDir), source)
  writeFileSync(new URL('logo-light.svg', owlDir), light)
  writeFileSync(new URL('favicon.svg', publicDir), favicon)
}
console.log('Updated the Owl logo and light/dark favicons for owl-site and owl-studio.')
