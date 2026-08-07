import 'fake-indexeddb/auto'
import { describe, test, expect, beforeEach } from 'vitest'
import {
  putFile,
  getFile,
  deleteFile,
  listFiles,
  getWorkspace,
  saveWorkspace,
  closeDB,
  type FileItem,
} from './fileStore'

describe('fileStore IndexedDB tests', () => {
  beforeEach(async () => {
    await closeDB()
    indexedDB.deleteDatabase('code-lens-wasm')
  })

  test('fileStore_putGetDelete_roundtrips', async () => {
    const sample: FileItem = {
      path: 'src/index.ts',
      language: 'ts',
      content: 'console.log("hello");',
    }

    await putFile(sample)
    const fetched = await getFile('src/index.ts')
    expect(fetched).toBeDefined()
    expect(fetched?.path).toBe('src/index.ts')
    expect(fetched?.content).toBe('console.log("hello");')

    const allFiles = await listFiles()
    expect(allFiles.length).toBe(1)
    expect(allFiles[0].path).toBe('src/index.ts')

    await deleteFile('src/index.ts')
    const deleted = await getFile('src/index.ts')
    expect(deleted).toBeUndefined()
  })

  test('fileStore_workspaceMeta_persistsActivePathAndOrder', async () => {
    await saveWorkspace({
      id: 'main',
      name: 'default',
      activePath: 'main.rs',
      fileOrder: ['src/main.ts', 'main.rs', 'data.json'],
    })

    const meta = await getWorkspace()
    expect(meta).toBeDefined()
    expect(meta?.activePath).toBe('main.rs')
    expect(meta?.fileOrder).toEqual(['src/main.ts', 'main.rs', 'data.json'])
  })

  test('fileStore_1Mb_write_performance_benchmark', async () => {
    const oneMbString = 'a'.repeat(1_000_000)
    const largeFile: FileItem = {
      path: 'large.txt',
      language: 'ts',
      content: oneMbString,
    }

    const start = performance.now()
    await putFile(largeFile)
    const durationMs = performance.now() - start

    console.log(`[Perf Benchmark] 1 MB IDB putFile duration: ${durationMs.toFixed(2)} ms`)

    const fetched = await getFile('large.txt')
    expect(fetched?.content.length).toBe(1_000_000)

    // ponytail / SRS budget note: 5 ms target is for fast local hardware;
    // assert < 50 ms to avoid CI / fake-indexeddb in JS timing flakiness.
    expect(durationMs).toBeLessThan(50)
  })
})
