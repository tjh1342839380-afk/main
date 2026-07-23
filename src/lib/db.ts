import type { AgentConversation, StoredAgentReferenceFile, TaskRecord, StoredImage, StoredImageThumbnail } from '../types'

const DB_NAME = 'gpt-image-2-for-tjh'
const LEGACY_DB_NAME = 'gpt-image-' + 'playground'
const LEGACY_DB_MIGRATION_STORAGE_KEY = 'gpt-image-2-for-tjh:indexeddb-migrated'
const DB_VERSION = 4
const STORE_TASKS = 'tasks'
const STORE_IMAGES = 'images'
const STORE_THUMBNAILS = 'thumbnails'
const STORE_AGENT_CONVERSATIONS = 'agentConversations'
const STORE_AGENT_FILES = 'agentFiles'
const THUMBNAIL_MAX_SIZE = 720
const THUMBNAIL_QUALITY = 0.9
const THUMBNAIL_VERSION = 2

export const CURRENT_THUMBNAIL_VERSION = THUMBNAIL_VERSION

function createSchema(db: IDBDatabase) {
  if (!db.objectStoreNames.contains(STORE_TASKS)) {
    db.createObjectStore(STORE_TASKS, { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains(STORE_IMAGES)) {
    db.createObjectStore(STORE_IMAGES, { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains(STORE_THUMBNAILS)) {
    db.createObjectStore(STORE_THUMBNAILS, { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains(STORE_AGENT_CONVERSATIONS)) {
    db.createObjectStore(STORE_AGENT_CONVERSATIONS, { keyPath: 'id' })
  }
  if (!db.objectStoreNames.contains(STORE_AGENT_FILES)) {
    db.createObjectStore(STORE_AGENT_FILES, { keyPath: 'id' })
  }
}

function openNamedDB(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      createSchema(db)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function getAllFromDB(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const req = tx.objectStore(storeName).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function putAllToDB(db: IDBDatabase, storeName: string, items: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    for (const item of items) store.put(item)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

let legacyMigrationPromise: Promise<void> | null = null

function hasMigratedLegacyDB() {
  try {
    return window.localStorage.getItem(LEGACY_DB_MIGRATION_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function markLegacyDBMigrated() {
  try {
    window.localStorage.setItem(LEGACY_DB_MIGRATION_STORAGE_KEY, 'true')
  } catch {
    // localStorage 不可用时只依赖当前会话的 migration promise。
  }
}

async function migrateLegacyDBIfNeeded(db: IDBDatabase) {
  if (hasMigratedLegacyDB()) return

  const existingTasks = await getAllFromDB(db, STORE_TASKS)
  const existingImages = await getAllFromDB(db, STORE_IMAGES)
  if (existingTasks.length > 0 || existingImages.length > 0) {
    markLegacyDBMigrated()
    return
  }

  let legacyDB: IDBDatabase | null = null
  try {
    legacyDB = await openNamedDB(LEGACY_DB_NAME)
    for (const storeName of [STORE_TASKS, STORE_IMAGES, STORE_THUMBNAILS, STORE_AGENT_CONVERSATIONS, STORE_AGENT_FILES]) {
      const items = await getAllFromDB(legacyDB, storeName)
      if (items.length > 0) await putAllToDB(db, storeName, items)
    }
  } catch (err) {
    console.warn('Failed to migrate legacy IndexedDB:', err)
  } finally {
    legacyDB?.close()
    markLegacyDBMigrated()
  }
}

async function openDB(): Promise<IDBDatabase> {
  const db = await openNamedDB(DB_NAME)
  legacyMigrationPromise ??= migrateLegacyDBIfNeeded(db)
  await legacyMigrationPromise
  return db
}

function dbTransaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode)
        const store = tx.objectStore(storeName)
        const req = fn(store)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

// ===== Tasks =====

export function getAllTasks(): Promise<TaskRecord[]> {
  return dbTransaction(STORE_TASKS, 'readonly', (s) => s.getAll())
}

export function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.put(task))
}

export function deleteTask(id: string): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.delete(id))
}

export function clearTasks(): Promise<undefined> {
  return dbTransaction(STORE_TASKS, 'readwrite', (s) => s.clear())
}

// ===== Agent conversations =====

export function getAllAgentConversations(): Promise<AgentConversation[]> {
  return dbTransaction(STORE_AGENT_CONVERSATIONS, 'readonly', (s) => s.getAll())
}

export function putAgentConversation(conversation: AgentConversation): Promise<IDBValidKey> {
  return dbTransaction(STORE_AGENT_CONVERSATIONS, 'readwrite', (s) => s.put(conversation))
}

export function clearAgentConversations(): Promise<undefined> {
  return dbTransaction(STORE_AGENT_CONVERSATIONS, 'readwrite', (s) => s.clear())
}

export function replaceAgentConversations(conversations: AgentConversation[]): Promise<undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_AGENT_CONVERSATIONS, 'readwrite')
        const store = tx.objectStore(STORE_AGENT_CONVERSATIONS)
        store.clear()
        for (const conversation of conversations) store.put(conversation)
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      }),
  )
}

// ===== Agent reference files =====

export function getAgentReferenceFile(id: string): Promise<StoredAgentReferenceFile | undefined> {
  return dbTransaction(STORE_AGENT_FILES, 'readonly', (s) => s.get(id))
}

export function getAllAgentReferenceFiles(): Promise<StoredAgentReferenceFile[]> {
  return dbTransaction(STORE_AGENT_FILES, 'readonly', (s) => s.getAll())
}

export function putAgentReferenceFile(file: StoredAgentReferenceFile): Promise<IDBValidKey> {
  return dbTransaction(STORE_AGENT_FILES, 'readwrite', (s) => s.put(file))
}

export function deleteAgentReferenceFile(id: string): Promise<undefined> {
  return dbTransaction(STORE_AGENT_FILES, 'readwrite', (s) => s.delete(id))
}

export function clearAgentReferenceFiles(): Promise<undefined> {
  return dbTransaction(STORE_AGENT_FILES, 'readwrite', (s) => s.clear())
}

// ===== Images =====

export function getImage(id: string): Promise<StoredImage | undefined> {
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.get(id))
}

export function getStoredImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  return dbTransaction(STORE_THUMBNAILS, 'readonly', (s) => s.get(id))
}

export async function getStoredFreshImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const thumbnail = await getStoredImageThumbnail(id)
  return thumbnail?.thumbnailVersion === THUMBNAIL_VERSION ? thumbnail : undefined
}

export function putImageThumbnail(thumbnail: StoredImageThumbnail): Promise<IDBValidKey> {
  return dbTransaction(STORE_THUMBNAILS, 'readwrite', (s) => s.put(thumbnail))
}

export async function getImageThumbnail(id: string): Promise<StoredImageThumbnail | undefined> {
  const existingThumbnail = await getStoredImageThumbnail(id)
  if (existingThumbnail?.thumbnailVersion === THUMBNAIL_VERSION) {
    const image = await getImage(id)
    if (image && (!image.width || !image.height) && existingThumbnail.width && existingThumbnail.height) {
      await putImage({ ...image, width: existingThumbnail.width, height: existingThumbnail.height })
    }
    return existingThumbnail
  }

  const image = await getImage(id)
  if (!image) return undefined
  const legacyImage = image as StoredImage & Partial<StoredImageThumbnail>
  if (legacyImage.thumbnailDataUrl && legacyImage.thumbnailVersion === THUMBNAIL_VERSION) {
    const thumbnail: StoredImageThumbnail = {
      id,
      thumbnailDataUrl: legacyImage.thumbnailDataUrl,
      width: legacyImage.width,
      height: legacyImage.height,
      thumbnailVersion: THUMBNAIL_VERSION,
    }
    await putImageThumbnail(thumbnail)
    if ((!image.width || !image.height) && thumbnail.width && thumbnail.height) {
      await putImage({ ...image, width: thumbnail.width, height: thumbnail.height })
    }
    return thumbnail
  }

  const metadata = await safeCreateImageThumbnail(image.dataUrl)
  if (!metadata.thumbnailDataUrl) return undefined
  const thumbnail: StoredImageThumbnail = {
    id,
    thumbnailDataUrl: metadata.thumbnailDataUrl,
    width: metadata.width,
    height: metadata.height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
  await putImageThumbnail(thumbnail)
  if (metadata.width && metadata.height && (image.width !== metadata.width || image.height !== metadata.height)) {
    await putImage({ ...image, width: metadata.width, height: metadata.height })
  }
  return thumbnail
}

export function getAllImages(): Promise<StoredImage[]> {
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.getAll())
}

export function getAllImageIds(): Promise<string[]> {
  return dbTransaction(STORE_IMAGES, 'readonly', (s) => s.getAllKeys()).then((keys) =>
    keys.map(String),
  )
}

export function putImage(image: StoredImage): Promise<IDBValidKey> {
  return dbTransaction(STORE_IMAGES, 'readwrite', (s) => s.put(image))
}

export function deleteImage(id: string): Promise<undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).delete(id)
        tx.objectStore(STORE_THUMBNAILS).delete(id)
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

export function clearImages(): Promise<undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction([STORE_IMAGES, STORE_THUMBNAILS], 'readwrite')
        tx.objectStore(STORE_IMAGES).clear()
        tx.objectStore(STORE_THUMBNAILS).clear()
        tx.oncomplete = () => resolve(undefined)
        tx.onerror = () => reject(tx.error)
      }),
  )
}

// ===== Image hashing & dedup =====

export async function hashDataUrl(dataUrl: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return hashDataUrlFallback(dataUrl)
  }

  const data = new TextEncoder().encode(dataUrl)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function hashDataUrlFallback(dataUrl: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193

  for (let i = 0; i < dataUrl.length; i++) {
    const code = dataUrl.charCodeAt(i)
    h1 ^= code
    h1 = Math.imul(h1, 0x01000193)
    h2 ^= code
    h2 = Math.imul(h2, 0x27d4eb2d)
  }

  return `fallback-${(h1 >>> 0).toString(16).padStart(8, '0')}${(h2 >>> 0).toString(16).padStart(8, '0')}`
}

export interface StoreImageResult {
  id: string
  width?: number
  height?: number
}

/**
 * 存储图片，若已存在（按 hash 去重）则跳过。
 * 返回 image id 及图片真实宽高。
 */
export async function storeImage(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<string> {
  return (await storeImageWithSize(dataUrl, source)).id
}

export async function storeImageWithSize(dataUrl: string, source: NonNullable<StoredImage['source']> = 'upload'): Promise<StoreImageResult> {
  const id = await hashDataUrl(dataUrl)
  const existing = await getImage(id)
  if (!existing) {
    const thumbnail = await safeCreateImageThumbnail(dataUrl)
    await putImage({
      id,
      dataUrl,
      createdAt: Date.now(),
      source,
      width: thumbnail.width,
      height: thumbnail.height,
    })
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
    return { id, width: thumbnail.width, height: thumbnail.height }
  }

  if ((await getStoredImageThumbnail(id))?.thumbnailVersion !== THUMBNAIL_VERSION) {
    const thumbnail = await safeCreateImageThumbnail(existing.dataUrl)
    const width = thumbnail.width ?? existing.width
    const height = thumbnail.height ?? existing.height
    if (thumbnail.width && thumbnail.height && (existing.width !== thumbnail.width || existing.height !== thumbnail.height)) {
      await putImage({ ...existing, width: thumbnail.width, height: thumbnail.height })
    }
    if (thumbnail.thumbnailDataUrl) {
      await putImageThumbnail({
        id,
        thumbnailDataUrl: thumbnail.thumbnailDataUrl,
        width: thumbnail.width,
        height: thumbnail.height,
        thumbnailVersion: THUMBNAIL_VERSION,
      })
    }
    return { id, width, height }
  }
  return { id, width: existing.width, height: existing.height }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片加载失败'))
    image.src = dataUrl
  })
}

async function createImageThumbnail(dataUrl: string): Promise<Omit<StoredImageThumbnail, 'id'>> {
  const image = await loadImage(dataUrl)
  const width = image.naturalWidth
  const height = image.naturalHeight
  if (width <= 0 || height <= 0) throw new Error('图片尺寸无效')

  const scale = Math.min(1, THUMBNAIL_MAX_SIZE / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持 Canvas')
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height)

  return {
    thumbnailDataUrl: canvas.toDataURL('image/webp', THUMBNAIL_QUALITY),
    width,
    height,
    thumbnailVersion: THUMBNAIL_VERSION,
  }
}

async function safeCreateImageThumbnail(dataUrl: string): Promise<Partial<Omit<StoredImageThumbnail, 'id'>>> {
  try {
    return await createImageThumbnail(dataUrl)
  } catch {
    return {}
  }
}
