// Copies Excalidraw's fonts into public/ so the whiteboard doesn't depend on a CDN.
// Runs automatically before `npm run dev` and `npm run build`.
// The CJK font (Xiaolai, ~10 MB) is skipped; CJK text falls back to a system font.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const from = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts')
const to = path.join(root, 'public/excalidraw-assets/fonts')
const SKIP = new Set(['Xiaolai'])

if (!fs.existsSync(from)) {
  console.warn('[excalidraw-assets] fonts not found; run npm install first')
  process.exit(0)
}
fs.rmSync(to, { recursive: true, force: true })
for (const dir of fs.readdirSync(from)) {
  if (!SKIP.has(dir)) fs.cpSync(path.join(from, dir), path.join(to, dir), { recursive: true })
}
console.log('[excalidraw-assets] fonts copied to public/excalidraw-assets/fonts')
