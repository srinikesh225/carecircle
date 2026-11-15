// Regenerates the raster brand assets in public/ from scripts/assets/*.html using headless Chrome.
// Run manually after changing the logo or share image: node scripts/render-assets.mjs
// Outputs are committed, so the normal build does not need a browser.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean)
const chrome = candidates.find((p) => existsSync(p))
if (!chrome) throw new Error('Set CHROME_PATH to a Chrome or Edge executable')

// Headless Chrome has a minimum window size, so small icons are rendered in a 512px window and scaled
// down with the device scale factor (output pixels = window size x scale).
function shot(html, out, w, h, scale = 1) {
  execFileSync(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--force-device-scale-factor=${scale}`,
      '--default-background-color=00000000',
      `--window-size=${w},${h}`,
      `--screenshot=${join(root, 'public', out)}`,
      pathToFileURL(join(root, 'scripts/assets', html)).href,
    ],
    { stdio: 'ignore' },
  )
  console.log(`rendered public/${out} (${Math.round(w * scale)}x${Math.round(h * scale)})`)
}

shot('og.html', 'og-image.png', 1200, 630)
shot('icon.html', 'apple-touch-icon.png', 512, 512, 180 / 512)
shot('icon.html', 'icon-192.png', 512, 512, 192 / 512)
shot('icon.html', 'icon-512.png', 512, 512)
shot('icon.html', 'favicon-32.png', 512, 512, 32 / 512)

// favicon.ico containing the 32x32 PNG (PNG-in-ICO is supported by every current browser).
const png = readFileSync(join(root, 'public/favicon-32.png'))
const header = Buffer.alloc(22)
header.writeUInt16LE(0, 0) // reserved
header.writeUInt16LE(1, 2) // type: icon
header.writeUInt16LE(1, 4) // image count
header.writeUInt8(32, 6) // width
header.writeUInt8(32, 7) // height
header.writeUInt8(0, 8) // palette
header.writeUInt8(0, 9) // reserved
header.writeUInt16LE(1, 10) // colour planes
header.writeUInt16LE(32, 12) // bits per pixel
header.writeUInt32LE(png.length, 14) // image size
header.writeUInt32LE(22, 18) // image offset
writeFileSync(join(root, 'public/favicon.ico'), Buffer.concat([header, png]))
rmSync(join(root, 'public/favicon-32.png'))
console.log('wrote public/favicon.ico')
