import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { LangId } from './ast'

export interface FileItem {
  path: string
  language: LangId
  content: string
  updatedAt?: number
}

export interface WorkspaceMeta {
  id: 'main'
  name: string
  activePath: string | null
  fileOrder: string[]
}

export class StorageUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message)
    this.name = 'StorageUnavailableError'
    if (cause) this.cause = cause
  }
}

interface CodeLensDB extends DBSchema {
  files: {
    key: string
    value: FileItem
  }
  workspace: {
    key: string
    value: WorkspaceMeta
  }
}

const DB_NAME = 'code-lens-wasm'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<CodeLensDB>> | null = null

export function getDB(): Promise<IDBPDatabase<CodeLensDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CodeLensDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('files')) {
          // ponytail: keyPath path, no speculative indexes
          db.createObjectStore('files', { keyPath: 'path' })
        }
        if (!db.objectStoreNames.contains('workspace')) {
          db.createObjectStore('workspace', { keyPath: 'id' })
        }
      },
    }).catch((err) => {
      dbPromise = null
      throw new StorageUnavailableError('IndexedDB failed to open', err)
    })
  }
  return dbPromise
}

export async function listFiles(): Promise<FileItem[]> {
  try {
    const db = await getDB()
    return await db.getAll('files')
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err
    throw new StorageUnavailableError('Failed to list files from storage', err)
  }
}

export async function getFile(path: string): Promise<FileItem | undefined> {
  try {
    const db = await getDB()
    return await db.get('files', path)
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err
    throw new StorageUnavailableError(`Failed to get file ${path}`, err)
  }
}

export async function putFile(file: FileItem): Promise<void> {
  try {
    const db = await getDB()
    await db.put('files', {
      ...file,
      updatedAt: file.updatedAt ?? Date.now(),
    })
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err
    throw new StorageUnavailableError(`Failed to put file ${file.path}`, err)
  }
}

export async function deleteFile(path: string): Promise<void> {
  try {
    const db = await getDB()
    await db.delete('files', path)
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err
    throw new StorageUnavailableError(`Failed to delete file ${path}`, err)
  }
}

export async function getWorkspace(): Promise<WorkspaceMeta | undefined> {
  try {
    const db = await getDB()
    return await db.get('workspace', 'main')
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err
    throw new StorageUnavailableError('Failed to get workspace metadata', err)
  }
}

export async function saveWorkspace(meta: WorkspaceMeta): Promise<void> {
  try {
    const db = await getDB()
    await db.put('workspace', meta)
  } catch (err) {
    if (err instanceof StorageUnavailableError) throw err
    throw new StorageUnavailableError('Failed to save workspace metadata', err)
  }
}

export async function closeDB(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null)
    if (db) {
      db.close()
    }
    dbPromise = null
  }
}

export function _resetDBForTest(): void {
  dbPromise = null
}
