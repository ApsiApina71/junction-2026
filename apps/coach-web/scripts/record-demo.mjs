// Records the captioned demo video by driving the real site and app in Chrome.
// Usage: node scripts/record-demo.mjs [out.webm]   (needs the API on :8000 serving the built app, Chrome and ffmpeg)
// Convert: ffmpeg -i out.webm -vf fps=30 -c:v libx264 -pix_fmt yuv420p -crf 18 kolme-koria-demo.mp4
import puppeteer from 'puppeteer-core'

const BASE = process.env.BASE_URL ?? 'http://localhost:8000'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = process.argv[2] ?? 'kolme-koria-demo.webm'
const CUSTOMER = 'CUST00028'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] })
const page = await browser.newPage()
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 })
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }])

/** Caption bar and click ring live on the top page so they survive scrolling inside the phone. */
async function overlay() {
  await page.evaluate(() => {
    if (document.getElementById('kk-cap')) return
    const style = document.createElement('style')
    style.textContent = `
      #kk-cap { position: fixed; left: 50%; bottom: 34px; transform: translateX(-50%); width: max-content; max-width: 1000px; padding: 14px 26px; border-radius: 18px;
        background: rgb(22 32 26 / 96%); color: #f4f3ee; font: 600 25px/1.3 Inter, system-ui, sans-serif; letter-spacing: -.01em; text-align: center;
        z-index: 99999; opacity: 0; transition: opacity .35s; text-wrap: balance; box-shadow: 0 10px 40px rgb(0 0 0 / 25%); }
      /* On the site the caption sits under the story column, clear of the phone. */
      .site ~ #kk-cap, body:has(.site) #kk-cap { left: 48px; transform: none; max-width: 600px; text-align: left; bottom: 30px; }
      #kk-cap.on { opacity: 1; }
      #kk-ring { position: fixed; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 3px solid #16201a; background: rgb(22 32 26 / 15%);
        z-index: 99998; opacity: 0; pointer-events: none; }
      #kk-ring.go { animation: kk-ring .55s ease-out; }
      @keyframes kk-ring { from { opacity: 1; transform: scale(.4); } to { opacity: 0; transform: scale(1.5); } }`
    document.head.append(style)
    for (const id of ['kk-cap', 'kk-ring']) {
      const el = document.createElement('div')
      el.id = id
      document.body.append(el)
    }
  })
}
async function caption(text) {
  await overlay()
  await page.evaluate((t) => {
    const el = document.getElementById('kk-cap')
    el.classList.remove('on')
    setTimeout(() => { el.textContent = t; if (t) el.classList.add('on') }, 250)
  }, text)
  await wait(300)
}
async function ring(x, y) {
  await page.evaluate((x, y) => {
    const el = document.getElementById('kk-ring')
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.classList.remove('go')
    void el.offsetWidth
    el.classList.add('go')
  }, x, y)
}
const phone = () => page.frames().find((f) => f.url().includes('/app/'))

/** Click the first button containing `text`, on the page or inside the phone, with a visible ring. */
async function tap(where, text, nth = 0) {
  const frame = where === 'phone' ? phone() : page.mainFrame()
  const box = await frame.evaluate((t, n) => {
    const el = [...document.querySelectorAll('button')].filter((b) => b.textContent.includes(t))[n]
    if (!el) return null
    el.scrollIntoView({ block: 'nearest', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }, text, nth)
  if (!box) throw new Error(`no button "${text}" in ${where}`)
  let dx = 0, dy = 0
  if (where === 'phone') {
    const r = await page.evaluate(() => { const b = document.querySelector('.device iframe').getBoundingClientRect(); return { x: b.left, y: b.top } })
    dx = r.x; dy = r.y
  }
  await ring(box.x + dx, box.y + dy)
  await wait(280)
  await frame.evaluate((t, n) => [...document.querySelectorAll('button')].filter((b) => b.textContent.includes(t))[n].click(), text, nth)
}
const phoneScroll = (top) => phone().evaluate((y) => document.querySelector('.scroll').scrollTo({ top: y, behavior: 'smooth' }), top)
const phoneScrollBy = (dy) => phone().evaluate((y) => document.querySelector('.scroll').scrollBy({ top: y, behavior: 'smooth' }), dy)
const pageScroll = (sel) => page.evaluate((s) => document.querySelector(s).scrollIntoView({ behavior: 'smooth', block: 'start' }), sel)
async function slide(n, text, ms) {
  await page.goto(`${BASE}/deck/?s=${n}`, { waitUntil: 'networkidle0' })
  await caption(text)
  await wait(ms)
}
async function slider(to) {
  const f = phone()
  const from = await f.evaluate(() => Number(document.querySelector('.slider').value))
  for (let v = from; v !== to; v += Math.sign(to - from) * 5) {
    await f.evaluate((val) => {
      const el = document.querySelector('.slider')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(val))
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }, v + Math.sign(to - from) * 5)
    await wait(260)
  }
}

// Start from a clean device: no saved labels or challenges for the demo customer.
await page.goto(`${BASE}/app/?c=${CUSTOMER}&lang=en`, { waitUntil: 'networkidle0' })
await page.evaluate((c) => { localStorage.removeItem(`overrides:${c}`); localStorage.removeItem(`challenges:${c}`); localStorage.setItem('lang', '"en"') }, CUSTOMER)

const recorder = await page.screencast({ path: OUT, scale: 1.5 })
const t0 = Date.now()
const mark = (name) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${name}`)

mark('problem')
await slide(2, 'Your bank knows every euro you spend. Ask it where your money goes, and it hands you a list.', 6500)
mark('title')
await slide(1, 'This is Kolme koria. Three baskets. A money coach you can talk to.', 5500)

mark('safe to spend')
await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
await wait(900)
await caption('Mikko opens it and sees one number: what he can safely spend this week.')
await wait(5500)
mark('how calculated')
await tap('phone', 'How is this calculated')
await caption('No black box. Two limits: what his balance allows, and what this pay cycle allows.')
await wait(1800)
await phoneScrollBy(230)
await wait(3600)
await caption('The lower one wins, and every line is there to check.')
await phoneScrollBy(260)
await wait(4200)

mark('where did it go')
await tap('phone', 'Hide')
await pageScroll('.questions')
await wait(700)
await tap('page', 'Where did my money go')
await caption('Where does it all go? Three baskets.')
await wait(3800)
await caption('Regular essentials. Unexpected necessities. And everyday spending, the part that slips through your fingers.')
await wait(3000)
await phoneScrollBy(420)
await wait(4200)

mark('your labels')
await phoneScroll(0)
await wait(1200)
await phoneScrollBy(330)
await wait(900)
await tap('phone', 'Everyday spending')
await caption('It is his data, so they are his labels.')
await wait(900)
await phoneScrollBy(260)
await wait(2200)
await tap('phone', 'Move to')
await wait(900)
await tap('phone', 'Regular essentials', 1)
await caption('Move something, and every figure follows.')
await wait(1500)
await phoneScroll(0)
await wait(3800)

mark('what if')
await tap('page', 'What if I cut dining out')
await caption('What if he ate out a little less?')
await wait(3600)
await caption('He drags, and sees the euros, the visits, and what it does to his week.')
await slider(-40)
await wait(2600)
await tap('phone', 'Make it a challenge')
await caption('One tap turns it into a four-week challenge.')
await wait(2200)
await tap('phone', 'Take the challenge')
await wait(2600)

mark('spender and benchmarks')
await tap('page', 'What kind of spender')
await caption('What kind of spender is he?')
await wait(5200)
await tap('page', 'How do I compare')
await caption('How does he compare with people his age, and with Statistics Finland’s figures?')
await wait(3400)
await tap('phone', 'Finland')
await wait(3800)

mark('trust')
await slide(6, 'A tested engine computes every number. The language model only chooses and explains.', 6500)
await caption('It never does the maths, and it only ever sees one customer. So the model is swappable, down to open models hosted in Europe.')
await wait(6500)
mark('impact')
await slide(8, 'Built for the app one in three Finnish adults already use.', 6000)
mark('end')
await slide(9, '', 5000)

await recorder.stop()
mark('done')
// Leave the demo customer as we found it.
await page.goto(`${BASE}/app/?c=${CUSTOMER}`, { waitUntil: 'networkidle0' })
await page.evaluate((c) => { localStorage.removeItem(`overrides:${c}`); localStorage.removeItem(`challenges:${c}`) }, CUSTOMER)
await browser.close()
