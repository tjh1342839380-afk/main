import { zipSync } from 'fflate'
import type { TaskRecord } from '../types'
import { ensureImageCached } from '../store'
import { getNumberedFileNameBase, sanitizeFileNamePart } from './exportFileName'

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const IMAGE_SAVE_FILE_TYPES = [
  {
    description: 'Image files',
    accept: {
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/webp': ['.webp'],
      'image/gif': ['.gif'],
    },
  },
]

export interface DownloadImagesResult {
  successCount: number
  failCount: number
}

export interface DownloadImageZipEntry {
  imageId: string
  fileNameBase?: string
}

export type SaveImageAsResult = 'saved' | 'downloaded' | 'cancelled'

type TaskOutputZipTask = Pick<TaskRecord, 'id' | 'createdAt' | 'outputImages'>

type BrowserWritableFileStream = {
  write: (data: Blob) => Promise<void>
  close: () => Promise<void>
}

type BrowserFileSystemFileHandle = {
  createWritable: () => Promise<BrowserWritableFileStream>
}

type BrowserSaveFilePicker = (options?: {
  suggestedName?: string
  types?: typeof IMAGE_SAVE_FILE_TYPES
}) => Promise<BrowserFileSystemFileHandle>

export { formatExportFileTime } from './exportFileName'

export async function downloadImageIds(imageIds: string[], fileNameBase = 'images'): Promise<DownloadImagesResult> {
  if (imageIds.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const multiple = imageIds.length > 1

  for (let index = 0; index < imageIds.length; index++) {
    try {
      const blob = await getImageBlob(imageIds[index])
      const order = String(index + 1).padStart(2, '0')
      const fileName = multiple
        ? `${fileNameBase}-${order}.${getBlobExtension(blob)}`
        : `${fileNameBase}.${getBlobExtension(blob)}`
      triggerDownload(blob, fileName)
      successCount++
      if (multiple) await delay(100)
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  return { successCount, failCount }
}

export async function saveImageAs(imageIdOrUrl: string, fileNameBase = 'image'): Promise<SaveImageAsResult> {
  const safeFileNameBase = sanitizeFileNamePart(fileNameBase) || 'image'
  const saveFilePicker = getSaveFilePicker()

  if (saveFilePicker) {
    let handle: BrowserFileSystemFileHandle
    try {
      handle = await saveFilePicker({
        suggestedName: `${safeFileNameBase}.${getSuggestedImageExtension(imageIdOrUrl)}`,
        types: IMAGE_SAVE_FILE_TYPES,
      })
    } catch (err) {
      if (isAbortError(err)) return 'cancelled'
      throw err
    }

    const blob = await getImageBlob(imageIdOrUrl)
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return 'saved'
  }

  const blob = await getImageBlob(imageIdOrUrl)
  triggerDownload(blob, `${safeFileNameBase}.${getBlobExtension(blob)}`)
  return 'downloaded'
}

export async function downloadImageEntriesAsZip(entries: DownloadImageZipEntry[], zipFileNameBase = 'images'): Promise<DownloadImagesResult> {
  if (entries.length === 0) return { successCount: 0, failCount: 0 }

  let successCount = 0
  let failCount = 0
  const zipFiles: Record<string, Uint8Array | [Uint8Array, { mtime: Date }]> = {}
  const usedNames = new Set<string>()

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index]
    try {
      const blob = await getImageBlob(entry.imageId)
      const order = String(index + 1).padStart(2, '0')
      const base = sanitizeFileNamePart(entry.fileNameBase || `image-${order}`) || `image-${order}`
      const ext = getBlobExtension(blob)
      let fileName = `${base}.${ext}`
      let duplicateIndex = 2
      while (usedNames.has(fileName)) {
        fileName = `${base}-${String(duplicateIndex).padStart(2, '0')}.${ext}`
        duplicateIndex++
      }
      usedNames.add(fileName)
      zipFiles[fileName] = [new Uint8Array(await blob.arrayBuffer()), { mtime: new Date() }]
      successCount++
    } catch (err) {
      console.error(err)
      failCount++
    }
  }

  if (successCount > 0) {
    const zipped = zipSync(zipFiles, { level: 6 })
    const buffer = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer
    triggerDownload(new Blob([buffer], { type: 'application/zip' }), `${sanitizeFileNamePart(zipFileNameBase) || 'images'}.zip`)
  }

  return { successCount, failCount }
}

export function getTaskOutputImageZipEntries(tasks: TaskOutputZipTask[]): DownloadImageZipEntry[] {
  return [...tasks]
    .sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((task) => getImageZipEntries(task.outputImages || [], `task-${task.id}`))
}

export function getImageZipEntries(imageIds: string[], fileNameBase = 'image'): DownloadImageZipEntry[] {
  return imageIds.map((imageId, index) => ({
    imageId,
    fileNameBase: getNumberedFileNameBase(fileNameBase, index, imageIds.length),
  }))
}

async function getImageBlob(imageIdOrUrl: string): Promise<Blob> {
  let src = imageIdOrUrl
  if (!imageIdOrUrl.startsWith('data:') && !imageIdOrUrl.startsWith('http://') && !imageIdOrUrl.startsWith('https://')) {
    src = await ensureImageCached(imageIdOrUrl) ?? imageIdOrUrl
  }

  const res = await fetch(src)
  if (!res.ok && !src.startsWith('data:')) throw new Error(`读取图片失败：${imageIdOrUrl}`)
  return await res.blob()
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function getBlobExtension(blob: Blob): string {
  return MIME_EXTENSIONS[blob.type.toLowerCase()] ?? blob.type.split('/')[1] ?? 'png'
}

function getSuggestedImageExtension(imageIdOrUrl: string): string {
  const dataUrlMime = imageIdOrUrl.match(/^data:([^;,]+)/)?.[1]?.toLowerCase()
  if (dataUrlMime && MIME_EXTENSIONS[dataUrlMime]) return MIME_EXTENSIONS[dataUrlMime]

  let path = imageIdOrUrl
  try {
    path = new URL(imageIdOrUrl).pathname
  } catch {
    // Not a URL; fall through to the plain string extension check.
  }

  const ext = path.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()
  if (ext === 'jpeg') return 'jpg'
  if (ext && ['png', 'jpg', 'webp', 'gif'].includes(ext)) return ext
  return 'png'
}

function getSaveFilePicker(): BrowserSaveFilePicker | null {
  return (window as typeof window & { showSaveFilePicker?: BrowserSaveFilePicker }).showSaveFilePicker ?? null
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError'
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
