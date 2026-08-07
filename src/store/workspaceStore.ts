import { create } from 'zustand'
import type { LangId } from '../lib/ast'
import {
  listFiles,
  putFile,
  deleteFile,
  getWorkspace,
  saveWorkspace,
  StorageUnavailableError,
  type FileItem,
  type WorkspaceMeta,
} from '../lib/fileStore'

export type { FileItem, WorkspaceMeta }

export const mapLangToMonaco = (lang: LangId): string => {
  switch (lang) {
    case 'ts':
    case 'tsx':
      return 'typescript'
    case 'rust':
      return 'rust'
    case 'json':
      return 'json'
    default:
      return 'plaintext'
  }
}

export function inferLanguageFromPath(path: string): LangId {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'tsx') return 'tsx'
  if (ext === 'rs') return 'rust'
  if (ext === 'json') return 'json'
  return 'ts'
}

export const DEFAULT_FILES: FileItem[] = [
  {
    path: 'src/main.ts',
    language: 'ts',
    content: `const x: number = 1;\nconsole.log(x);`,
  },
  {
    path: 'main.rs',
    language: 'rust',
    content: `fn main() {\n    println!("Hello, world!");\n}`,
  },
  {
    path: 'data.json',
    language: 'json',
    content: `{\n  "name": "codelens",\n  "version": "0.1.0"\n}`,
  },
]

export interface WorkspaceStoreState {
  files: FileItem[]
  activePath: string | null
  dirtyPaths: Record<string, boolean>
  workspaceBytes: number
  overQuotaWarning: boolean
  lastError: string | null
  isInitialized: boolean

  init: () => Promise<void>
  setActivePath: (path: string | null) => void
  addFile: (file: { path: string; language?: LangId; content?: string }) => boolean
  updateFileContent: (path: string, content: string) => boolean
  setLanguage: (path: string, language: LangId) => void
  renameFile: (oldPath: string, newPath: string) => Promise<boolean>
  deleteFile: (path: string) => Promise<void>
  closeFile: (path: string) => Promise<void>
  dismissError: () => void
  flushPendingSaves: () => Promise<void>
}

// Global timer map for debounced save per path
const pendingSaves = new Map<string, { timer: ReturnType<typeof setTimeout>; saveFn: () => Promise<void> }>()

const computeWorkspaceBytes = (files: FileItem[]): number => {
  return files.reduce((sum, f) => sum + f.content.length, 0)
}

const persistWorkspaceMeta = async (activePath: string | null, files: FileItem[]) => {
  try {
    await saveWorkspace({
      id: 'main',
      name: 'default',
      activePath,
      fileOrder: files.map((f) => f.path),
    })
  } catch (err) {
    if (err instanceof StorageUnavailableError) {
      useWorkspaceStore.getState().dismissError()
      useWorkspaceStore.setState({ lastError: err.message })
    }
  }
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  files: [],
  activePath: null,
  dirtyPaths: {},
  workspaceBytes: 0,
  overQuotaWarning: false,
  lastError: null,
  isInitialized: false,

  init: async () => {
    try {
      let storedFiles = await listFiles()
      const workspaceMeta = await getWorkspace()

      if (storedFiles.length === 0) {
        storedFiles = [...DEFAULT_FILES]
        for (const file of storedFiles) {
          await putFile(file)
        }
        await saveWorkspace({
          id: 'main',
          name: 'default',
          activePath: 'src/main.ts',
          fileOrder: storedFiles.map((f) => f.path),
        })
      }

      let activePath = workspaceMeta?.activePath ?? null
      if (!activePath || !storedFiles.some((f) => f.path === activePath)) {
        activePath = storedFiles.length > 0 ? storedFiles[0].path : null
      }

      if (workspaceMeta?.fileOrder && workspaceMeta.fileOrder.length > 0) {
        const orderMap = new Map(workspaceMeta.fileOrder.map((path, idx) => [path, idx]))
        storedFiles.sort((a, b) => {
          const idxA = orderMap.get(a.path) ?? 999
          const idxB = orderMap.get(b.path) ?? 999
          return idxA - idxB
        })
      }

      const bytes = computeWorkspaceBytes(storedFiles)
      set({
        files: storedFiles,
        activePath,
        workspaceBytes: bytes,
        overQuotaWarning: bytes > 10_000_000,
        isInitialized: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ lastError: message, isInitialized: true })
    }
  },

  setActivePath: (path) => {
    const { files } = get()
    set({ activePath: path })
    persistWorkspaceMeta(path, files)
  },

  addFile: (file) => {
    const { files } = get()
    const path = file.path.trim()
    if (!path) return false

    const content = file.content ?? ''
    if (content.length > 2_000_000) {
      set({ lastError: 'File content exceeds 2 MB hard cap' })
      return false
    }

    const existing = files.find((f) => f.path === path)
    if (existing) {
      set({ activePath: path })
      return true
    }

    const language = file.language ?? inferLanguageFromPath(path)
    const newFile: FileItem = { path, language, content }
    const updatedFiles = [...files, newFile]
    const bytes = computeWorkspaceBytes(updatedFiles)

    set((state) => ({
      files: updatedFiles,
      activePath: path,
      dirtyPaths: { ...state.dirtyPaths, [path]: true },
      workspaceBytes: bytes,
      overQuotaWarning: bytes > 10_000_000,
      lastError: null,
    }))

    // Save immediately or debounced
    const saveFn = async () => {
      try {
        await putFile(newFile)
        set((state) => {
          const nextDirty = { ...state.dirtyPaths }
          delete nextDirty[path]
          return { dirtyPaths: nextDirty }
        })
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          set({ lastError: err.message })
        }
      }
    }
    saveFn()
    persistWorkspaceMeta(path, updatedFiles)
    return true
  },

  updateFileContent: (path, content) => {
    if (content.length > 2_000_000) {
      set({ lastError: 'File content exceeds 2 MB hard cap' })
      return false
    }

    const { files, dirtyPaths } = get()
    const targetFile = files.find((f) => f.path === path)
    if (!targetFile) return false

    if (targetFile.content === content) return true

    const updatedFiles = files.map((f) => (f.path === path ? { ...f, content } : f))
    const bytes = computeWorkspaceBytes(updatedFiles)

    set({
      files: updatedFiles,
      dirtyPaths: { ...dirtyPaths, [path]: true },
      workspaceBytes: bytes,
      overQuotaWarning: bytes > 10_000_000,
      lastError: null,
    })

    // Cancel existing pending save for this path if any
    const existing = pendingSaves.get(path)
    if (existing) {
      clearTimeout(existing.timer)
    }

    const saveFn = async () => {
      pendingSaves.delete(path)
      const currentFile = get().files.find((f) => f.path === path)
      if (!currentFile) return
      try {
        await putFile(currentFile)
        set((state) => {
          const nextDirty = { ...state.dirtyPaths }
          delete nextDirty[path]
          return { dirtyPaths: nextDirty }
        })
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          set({ lastError: err.message })
        }
      }
    }

    const timer = setTimeout(saveFn, 500)
    pendingSaves.set(path, { timer, saveFn })
    return true
  },

  setLanguage: (path, language) => {
    const { files, activePath } = get()
    const updatedFiles = files.map((f) => (f.path === path ? { ...f, language } : f))
    set((state) => ({
      files: updatedFiles,
      dirtyPaths: { ...state.dirtyPaths, [path]: true },
    }))

    const updatedFile = updatedFiles.find((f) => f.path === path)
    if (updatedFile) {
      putFile(updatedFile)
        .then(() => {
          set((state) => {
            const nextDirty = { ...state.dirtyPaths }
            delete nextDirty[path]
            return { dirtyPaths: nextDirty }
          })
        })
        .catch((err) => {
          if (err instanceof StorageUnavailableError) set({ lastError: err.message })
        })
    }
    persistWorkspaceMeta(activePath, updatedFiles)
  },

  renameFile: async (oldPath, newPath) => {
    const trimmedNew = newPath.trim()
    if (!trimmedNew || oldPath === trimmedNew) return true

    const { files, activePath, dirtyPaths } = get()
    if (files.some((f) => f.path === trimmedNew)) {
      set({ lastError: `File ${trimmedNew} already exists` })
      return false
    }

    const targetFile = files.find((f) => f.path === oldPath)
    if (!targetFile) return false

    // Flush any pending save for oldPath
    const pending = pendingSaves.get(oldPath)
    if (pending) {
      clearTimeout(pending.timer)
      pendingSaves.delete(oldPath)
    }

    const newLanguage = inferLanguageFromPath(trimmedNew)
    const newFile: FileItem = {
      ...targetFile,
      path: trimmedNew,
      language: newLanguage,
    }

    const nextFiles = files.map((f) => (f.path === oldPath ? newFile : f))
    const nextActive = activePath === oldPath ? trimmedNew : activePath

    const wasDirty = !!dirtyPaths[oldPath]
    const nextDirty = { ...dirtyPaths }
    delete nextDirty[oldPath]
    if (wasDirty) {
      nextDirty[trimmedNew] = true
    }

    set({
      files: nextFiles,
      activePath: nextActive,
      dirtyPaths: nextDirty,
      lastError: null,
    })

    try {
      await deleteFile(oldPath)
      await putFile(newFile)
      await persistWorkspaceMeta(nextActive, nextFiles)
      if (wasDirty) {
        set((state) => {
          const clearedDirty = { ...state.dirtyPaths }
          delete clearedDirty[trimmedNew]
          return { dirtyPaths: clearedDirty }
        })
      }
      return true
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        set({ lastError: err.message })
      }
      return false
    }
  },

  deleteFile: async (path) => {
    const { files, activePath, dirtyPaths } = get()
    const nextFiles = files.filter((f) => f.path !== path)
    let nextActive = activePath
    if (activePath === path) {
      nextActive = nextFiles.length > 0 ? nextFiles[0].path : null
    }

    const nextDirty = { ...dirtyPaths }
    delete nextDirty[path]

    const pending = pendingSaves.get(path)
    if (pending) {
      clearTimeout(pending.timer)
      pendingSaves.delete(path)
    }

    const bytes = computeWorkspaceBytes(nextFiles)
    set({
      files: nextFiles,
      activePath: nextActive,
      dirtyPaths: nextDirty,
      workspaceBytes: bytes,
      overQuotaWarning: bytes > 10_000_000,
    })

    try {
      await deleteFile(path)
      await persistWorkspaceMeta(nextActive, nextFiles)
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        set({ lastError: err.message })
      }
    }
  },

  closeFile: async (path) => {
    await get().deleteFile(path)
  },

  dismissError: () => {
    set({ lastError: null })
  },

  flushPendingSaves: async () => {
    const pendingList = Array.from(pendingSaves.values())
    pendingSaves.clear()
    for (const item of pendingList) {
      clearTimeout(item.timer)
      await item.saveFn()
    }
  },
}))

// Export useFileStore as alias for backward compatibility
export const useFileStore = useWorkspaceStore

// Setup visibilitychange and beforeunload listeners for auto-save flush
if (typeof window !== 'undefined') {
  ;(window as unknown as { useWorkspaceStore: typeof useWorkspaceStore }).useWorkspaceStore = useWorkspaceStore
  const flush = () => {
    useWorkspaceStore.getState().flushPendingSaves()
  }
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush()
  })
  window.addEventListener('beforeunload', flush)
}
