/**
 * Copies the Tesseract.js worker and WebAssembly core from node_modules into public/ocr/,
 * so OCR is self-hosted (no CDN). Runs before `dev` and `build` (see package.json).
 * Folders are named by version: the service worker caches them forever, so a new version
 * must get a new URL. The language files (public/ocr/lang-fast-4.1/*.traineddata.gz, from
 * github.com/tesseract-ocr/tessdata_fast) are committed, since they aren't on npm.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const version = (pkg) => JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, 'utf8')).version
const OUT = 'public/ocr'
const worker = `tesseract-${version('tesseract.js')}`
const core = `core-${version('tesseract.js-core')}`

// Drop folders of older versions.
for (const name of readdirSync(OUT)) {
  if ((name.startsWith('tesseract-') && name !== worker) || (name.startsWith('core-') && name !== core)) {
    rmSync(join(OUT, name), { recursive: true, force: true })
  }
}

mkdirSync(join(OUT, worker), { recursive: true })
copyFileSync('node_modules/tesseract.js/dist/worker.min.js', join(OUT, worker, 'worker.min.js'))

// LSTM-only builds (the "fast" language files have no legacy engine); the worker picks one by CPU support.
mkdirSync(join(OUT, core), { recursive: true })
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js']) {
  copyFileSync(join('node_modules/tesseract.js-core', f), join(OUT, core, f))
}
