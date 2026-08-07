import 'fake-indexeddb/auto'
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'
import { closeDB, getFile } from '../lib/fileStore'

describe('workspaceStore tests', () => {
  beforeEach(async () => {
    await closeDB()
    indexedDB.deleteDatabase('code-lens-wasm')
    useWorkspaceStore.setState({
      files: [],
      activePath: null,
      dirtyPaths: {},
      workspaceBytes: 0,
      overQuotaWarning: false,
      lastError: null,
      isInitialized: false,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('workspaceStore_autoSave_debounced500ms', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const store = useWorkspaceStore.getState()
    await store.init()

    expect(useWorkspaceStore.getState().files.length).toBeGreaterThan(0)

    // Update content
    store.updateFileContent('src/main.ts', 'const x = 42;')
    expect(useWorkspaceStore.getState().dirtyPaths['src/main.ts']).toBe(true)

    // Advance timers by 400ms - not saved yet
    await vi.advanceTimersByTimeAsync(400)
    let savedFile = await getFile('src/main.ts')
    expect(savedFile?.content).not.toBe('const x = 42;')

    // Advance timer past 500ms
    await vi.advanceTimersByTimeAsync(150)
    savedFile = await getFile('src/main.ts')
    expect(savedFile?.content).toBe('const x = 42;')
    expect(useWorkspaceStore.getState().dirtyPaths['src/main.ts']).toBeFalsy()
  })

  test('workspaceStore_sizeCap_rejectsOver2Mb', async () => {
    const store = useWorkspaceStore.getState()
    await store.init()

    const over2MbContent = 'a'.repeat(2_000_001)
    const result = store.updateFileContent('src/main.ts', over2MbContent)

    expect(result).toBe(false)
    expect(useWorkspaceStore.getState().lastError).toContain('2 MB')
    expect(useWorkspaceStore.getState().files.find((f) => f.path === 'src/main.ts')?.content).not.toBe(
      over2MbContent
    )
  })

  test('workspaceStore_closeFlush_savesPendingEdit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const store = useWorkspaceStore.getState()
    await store.init()

    store.updateFileContent('src/main.ts', 'const flushTest = true;')
    expect(useWorkspaceStore.getState().dirtyPaths['src/main.ts']).toBe(true)

    // Simulate beforeunload event
    window.dispatchEvent(new Event('beforeunload'))

    await vi.runAllTimersAsync()

    const savedFile = await getFile('src/main.ts')
    expect(savedFile?.content).toBe('const flushTest = true;')
  })
})
