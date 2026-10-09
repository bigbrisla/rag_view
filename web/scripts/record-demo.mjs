// Records the README demo: docs/demo.mp4, docs/demo.gif and two screenshots.
// Usage: npm run build && npx vite preview --port 4173 &  node scripts/record-demo.mjs
// Requires ffmpeg on PATH.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

const URL = process.env.DEMO_URL ?? 'http://localhost:4173/'
const DOCS = path.resolve(import.meta.dirname, '../../docs')
const TMP = fs.mkdtempSync(path.join(DOCS, '.rec-'))
const size = { width: 1440, height: 900 }

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: size,
  colorScheme: 'dark',
  recordVideo: { dir: TMP, size },
})
const page = await ctx.newPage()
await page.goto(URL)
await page.waitForSelector('canvas')
// The recorded Voyager trace autoplays from chunking to the cited answer.
await page.selectOption('.speed select', '1.5')
await page.waitForSelector('.cite', { timeout: 60_000 })
await page.waitForTimeout(6500)
await page.locator('.cite').first().hover()
await page.waitForTimeout(2500)
const video = page.video()
await ctx.close()
const webm = await video.path()

const mp4 = path.join(DOCS, 'demo.mp4')
const gif = path.join(DOCS, 'demo.gif')
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  webm,
  '-c:v',
  'libx264',
  '-pix_fmt',
  'yuv420p',
  '-crf',
  '24',
  '-movflags',
  '+faststart',
  mp4,
])
execFileSync('ffmpeg', [
  '-y',
  '-loglevel',
  'error',
  '-i',
  webm,
  '-vf',
  'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
  gif,
])

// Static screenshots for the README, one per theme, mid-retrieval.
for (const scheme of ['dark', 'light']) {
  const c = await browser.newContext({ viewport: size, colorScheme: scheme, deviceScaleFactor: 2 })
  const p = await c.newPage()
  await p.goto(URL)
  await p.waitForSelector('canvas')
  await p.locator('.rail button').nth(4).click()
  await p.waitForTimeout(4400)
  await p.evaluate(() => document.querySelector('.play[aria-label="Pause"]')?.click())
  await p.screenshot({ path: path.join(DOCS, `screenshot-${scheme}.png`) })
  await c.close()
}
await browser.close()
fs.rmSync(TMP, { recursive: true, force: true })
for (const f of ['demo.mp4', 'demo.gif', 'screenshot-dark.png', 'screenshot-light.png']) {
  console.log(f, (fs.statSync(path.join(DOCS, f)).size / 1e6).toFixed(1), 'MB')
}
