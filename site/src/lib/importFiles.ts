/**
 * Files picked on the import screen: the JSON from Claude plus the diagram images it names,
 * either as separate files or inside one ZIP. Images are matched to the JSON by file name.
 */
import { MAX_IMPORT_BYTES, imageKey } from './importer'
import { MAX_IMAGE_FILE_BYTES } from './image'

export interface PickedFiles {
  json?: { name: string; text: string }
  /** imageKey(name) → file */
  images: Map<string, File>
  problems: string[]
}

const MAX_ZIP_BYTES = 200 * 1024 * 1024
const MAX_IMAGES = 200
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }

const ext = (name: string) => name.split('.').pop()?.toLowerCase() ?? ''
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? name

export async function readPickedFiles(files: File[], prev?: PickedFiles): Promise<PickedFiles> {
  const out: PickedFiles = { json: prev?.json, images: new Map(prev?.images), problems: [] }
  const addImage = (f: File) => {
    if (out.images.size >= MAX_IMAGES) return out.problems.push(`יותר מ-${MAX_IMAGES} תמונות; השאר הושמטו.`)
    out.images.set(imageKey(f.name), f)
  }
  for (const f of files) {
    const e = ext(f.name)
    if (e === 'json' || f.type === 'application/json') {
      if (f.size > MAX_IMPORT_BYTES) out.problems.push(`${f.name} גדול מ-5MB.`)
      else out.json = { name: f.name, text: await f.text() }
    } else if (e === 'zip' || f.type === 'application/zip') {
      if (f.size > MAX_ZIP_BYTES) {
        out.problems.push(`${f.name} גדול מ-200MB.`)
        continue
      }
      await readZip(f, out, addImage)
    } else if (IMAGE_TYPES[e] || f.type.startsWith('image/')) {
      if (!Object.values(IMAGE_TYPES).includes(f.type)) out.problems.push(`${f.name}: אפשר רק PNG, JPEG, WebP או GIF.`)
      else addImage(f)
    } else {
      out.problems.push(`${f.name}: סוג קובץ לא נתמך.`)
    }
  }
  return out
}

async function readZip(zip: File, out: PickedFiles, addImage: (f: File) => unknown) {
  const { unzipSync } = await import('fflate')
  const tooBig: string[] = []
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
      // Only JSON and images, each within its size limit (the sizes come from the ZIP index,
      // so a "zip bomb" is skipped before it's inflated).
      filter: (f) => {
        const e = ext(f.name)
        if (f.name.endsWith('/') || baseName(f.name).startsWith('.') || f.name.includes('__MACOSX')) return false
        const limit = e === 'json' ? MAX_IMPORT_BYTES : IMAGE_TYPES[e] ? MAX_IMAGE_FILE_BYTES : -1
        if (limit < 0) return false
        if (f.originalSize > limit) {
          tooBig.push(baseName(f.name))
          return false
        }
        return true
      },
    })
  } catch {
    out.problems.push(`${zip.name}: קובץ ZIP לא תקין.`)
    return
  }
  if (tooBig.length) out.problems.push(`גדולים מדי והושמטו: ${tooBig.slice(0, 3).join(', ')}`)
  for (const [path, bytes] of Object.entries(entries)) {
    const name = baseName(path)
    const e = ext(name)
    if (e === 'json') {
      if (!out.json) out.json = { name, text: new TextDecoder().decode(bytes) }
    } else {
      addImage(new File([bytes as BlobPart], name, { type: IMAGE_TYPES[e] }))
    }
  }
}
