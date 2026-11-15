import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Original vector artwork. Each named segment is a 3-second, seamless Lottie loop.
// No raster layers, expressions, remote assets, or LottieFiles account required.
const palette = {
  body: '#77b4a8', wing: '#55968b', cheek: '#b6d9cb', face: '#f6f3e7',
  eye: '#203d39', beak: '#dfae62', light: '#fcfaf3', foot: '#3b746b',
}
const rgb = hex => [...hex.slice(1).matchAll(/../g)].map(x => parseInt(x[0], 16) / 255).concat(1)
const fixed = k => ({ a: 0, k })
const states = ['welcome', 'listening', 'thinking', 'alert', 'done', 'help']
const ease = { i: { x: [0.65], y: [1] }, o: { x: [0.35], y: [0] } }
function motion(make) {
  const keys = states.flatMap((name, index) => make(name).map(([t, s]) => ({ t: index * 90 + t, s: Array.isArray(s) ? s : [s], ...ease })))
  return { a: 1, k: [...keys, { t: 540, s: keys[0].s }] }
}
const loop = (a, b, c = a) => [[0, a], [35, b], [70, c], [89, a]]
const transform = (p = [0, 0], a = [0, 0], r = fixed(0), s = fixed([100, 100])) => ({
  o: fixed(100), r, p: fixed([...p, 0]), a: fixed([...a, 0]), s,
})
function path(commands) {
  const v = [], i = [], o = []
  for (const cmd of commands) {
    const [kind, ...n] = cmd
    if (kind === 'M' || kind === 'L') { v.push(n); i.push([0, 0]); o.push([0, 0]) }
    if (kind === 'C') {
      const prev = v.at(-1)
      o[o.length - 1] = [n[0] - prev[0], n[1] - prev[1]]
      v.push([n[4], n[5]]); i.push([n[2] - n[4], n[3] - n[5]]); o.push([0, 0])
    }
  }
  return { ty: 'sh', ks: fixed({ v, i, o, c: true }) }
}
const ellipse = (x, y, w, h) => ({ ty: 'el', p: fixed([x, y]), s: fixed([w, h]) })
const fill = c => ({ ty: 'fl', c: fixed(rgb(palette[c])), o: fixed(100), r: 1 })
let next = 2
const layers = []
function layer(name, shapes, color, ks = transform(), parent = 1) {
  layers.push({ ddd: 0, ind: next++, ty: 4, nm: name, sr: 1, parent, ks,
    ao: 0, shapes: [...shapes, fill(color)], ip: 0, op: 540, st: 0, bm: 0 })
}
// Layer order is front to back, as in After Effects.
for (const x of [120, 200]) {
  const blink = motion(name => {
    const normal = name === 'done' ? 38 : name === 'alert' ? 110 : 100
    return [[0, [100, normal]], [51, [100, normal]], [54, [100, 8]], [57, [100, normal]], [89, [100, normal]]]
  })
  const look = motion(name => loop([x, 133, 0], [x + (name === 'thinking' ? 5 : name === 'listening' ? -3 : 0), 133 + (name === 'thinking' ? -5 : 0), 0]))
  const ks = { ...transform([x, 133], [x, 133], fixed(0), blink), p: look }
  ks.o = motion(name => loop(name === 'done' ? 0 : 100, name === 'done' ? 0 : 100))
  layer(`Happy eye ${x}`, [path([['M',x-15,135],['C',x-8,121,x+8,121,x+15,135],['L',x+12,138],['C',x+5,130,x-5,130,x-12,138]])], 'eye', { ...transform(), o: motion(name => loop(name === 'done' ? 100 : 0, name === 'done' ? 100 : 0)) })
  layer(`Concerned brow ${x}`, [path([['M',x-15,104],['C',x-8,101,x+5,101,x+13,108],['L',x+11,111],['C',x+3,106,x-8,105,x-13,108]])], 'wing', { ...transform(), o: motion(name => loop(name === 'alert' ? 100 : 0, name === 'alert' ? 100 : 0)) })
  layer(`Eye light ${x}`, [ellipse(x - 5, 126, 8, 10)], 'light', ks)
  layer(`Eye ${x}`, [ellipse(x, 135, 29, 40)], 'eye', ks)
}
layer('Beak', [path([['M',149,160],['C',149,154,171,154,171,160],['C',171,167,163,174,160,174],['C',157,174,149,167,149,160]])], 'beak')
layer('Left face', [ellipse(121, 135, 91, 104)], 'face')
layer('Right face', [ellipse(199, 135, 91, 104)], 'face')
layer('Face bridge', [ellipse(160, 147, 90, 65)], 'face')
for (const [x, y] of [[145, 209], [175, 209], [160, 224]]) {
  layer('Belly feather', [path([['M',x-4,y],['L',x,y+5],['L',x+4,y],['C',x+4,y+10,x-4,y+10,x-4,y]])], 'body')
}
layer('Belly', [ellipse(160, 219, 115, 67)], 'cheek')
layer('Left wing', [path([['M',82,163],['C',62,162,52,190,57,216],['C',59,232,74,215,85,192],['C',91,178,91,164,82,163]])], 'wing',
  transform([81, 167], [81, 167], motion(name => loop(0, name === 'done' ? 28 : name === 'welcome' ? 8 : 3))))
layer('Right wing', [path([['M',238,163],['C',258,162,268,190,263,216],['C',261,232,246,215,235,192],['C',229,178,229,164,238,163]])], 'wing',
  transform([239, 167], [239, 167], motion(name => name === 'welcome' || name === 'help' ? [[0,-12],[18,-70],[30,-48],[42,-70],[58,-12],[89,-12]] : loop(0, name === 'done' ? -28 : -3))))
layer('Body', [path([['M',85,92],['C',77,69,78,41,97,51],['L',116,64],['C',143,55,178,55,204,64],['L',223,51],['C',242,41,243,69,235,92],['C',255,124,256,170,247,210],['C',238,251,205,270,160,270],['C',115,270,82,251,73,210],['C',64,170,65,124,85,92]])], 'body')
layer('Left foot', [ellipse(124, 270, 35, 16)], 'foot')
layer('Right foot', [ellipse(196, 270, 35, 16)], 'foot')
layers.push({ ddd: 0, ind: 1, ty: 3, nm: 'Character motion', sr: 1,
  ks: { ...transform([160,160],[160,160]),
    r: motion(name => loop(name === 'alert' ? -5 : 0, name === 'listening' ? -7 : name === 'thinking' ? 5 : name === 'alert' ? -3 : 2)),
    p: motion(name => loop([160,160,0],[160, name === 'done' ? 152 : 157,0])),
  }, ip:0, op:540, st:0 })
const animation = { v:'5.12.2', fr:30, ip:0, op:540, w:320, h:320, nm:'Onboarding Owl companion', ddd:0, assets:[], layers,
  markers:states.map((cm,i)=>({cm,tm:i*90,dr:90})) }
const out = fileURLToPath(new URL('../public/owl/', import.meta.url))
mkdirSync(out,{recursive:true})
writeFileSync(`${out}companion.json`,JSON.stringify(animation))
// Static poster matches the welcome pose and remains available if JS or animation loading fails.
const body = 'M85 92C77 69 78 41 97 51L116 64C143 55 178 55 204 64L223 51C242 41 243 69 235 92C255 124 256 170 247 210C238 251 205 270 160 270C115 270 82 251 73 210C64 170 65 124 85 92Z'
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320"><g fill="${palette.foot}"><ellipse cx="124" cy="270" rx="17.5" ry="8"/><ellipse cx="196" cy="270" rx="17.5" ry="8"/></g><path fill="${palette.body}" d="${body}"/><ellipse fill="${palette.cheek}" cx="160" cy="219" rx="57.5" ry="33.5"/><g fill="${palette.wing}"><path d="M82 163C62 162 52 190 57 216C59 232 74 215 85 192C91 178 91 164 82 163Z"/><path d="M238 163C258 162 268 190 263 216C261 232 246 215 235 192C229 178 229 164 238 163Z"/></g><g fill="${palette.face}"><ellipse cx="160" cy="147" rx="45" ry="32.5"/><ellipse cx="121" cy="135" rx="45.5" ry="52"/><ellipse cx="199" cy="135" rx="45.5" ry="52"/></g><path fill="${palette.beak}" d="M149 160C149 154 171 154 171 160C171 167 163 174 160 174C157 174 149 167 149 160Z"/><g fill="${palette.eye}"><ellipse cx="120" cy="135" rx="14.5" ry="20"/><ellipse cx="200" cy="135" rx="14.5" ry="20"/></g><g fill="${palette.light}"><ellipse cx="115" cy="126" rx="4" ry="5"/><ellipse cx="195" cy="126" rx="4" ry="5"/></g><g fill="${palette.body}"><path d="M141 209L145 214L149 209C149 219 141 219 141 209Z"/><path d="M171 209L175 214L179 209C179 219 171 219 171 209Z"/><path d="M156 224L160 229L164 224C164 234 156 234 156 224Z"/></g></svg>`
writeFileSync(`${out}companion.svg`,svg)
console.log(`Wrote original owl: ${Math.round(JSON.stringify(animation).length/1024)} KB, ${states.length} named states`)
