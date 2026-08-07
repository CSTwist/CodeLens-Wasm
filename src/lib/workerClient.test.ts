import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWorkerClient } from './workerClient'
import type { ParseResult, WorkerInbound } from './ast'

class FakeWorker implements Partial<Worker> {
  onmessage: ((this: Worker, ev: MessageEvent) => unknown) | null = null
  postedMessages: WorkerInbound[] = []

  postMessage(message: WorkerInbound): void {
    this.postedMessages.push(message)
  }

  terminate(): void {
    // noop
  }

  emitMessage(data: unknown): void {
    const handler = this.onmessage
    if (handler) {
      handler.call(this as unknown as Worker, { data } as MessageEvent)
    }
  }
}

describe('workerClient', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('workerClient_debouncedParse_firesOnceAfterQuietPeriod', async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient({
      worker: worker as unknown as Worker,
      debounceMs: 300,
    })

    const p1 = client.parseDebounced('ts', 'const a = 1')
    vi.advanceTimersByTime(100)
    const p2 = client.parseDebounced('ts', 'const a = 2')

    // Before timer fires, no parse message sent
    expect(worker.postedMessages.filter((m) => m.kind === 'parse')).toHaveLength(0)

    // Advance timer past quiet period
    await vi.advanceTimersByTimeAsync(300)

    // Now ping should be sent
    expect(worker.postedMessages).toContainEqual({ kind: 'ping', id: 1 })

    // Simulate worker replying ready
    worker.emitMessage({ kind: 'ready', module: 'code_lens_wasm', bytesLoaded: 1234 })
    await Promise.resolve()

    // Only 1 parse message sent, with latest source 'const a = 2'
    const parseMsgs = worker.postedMessages.filter((m) => m.kind === 'parse')
    expect(parseMsgs).toHaveLength(1)
    expect(parseMsgs[0]).toEqual({
      kind: 'parse',
      id: 2,
      language: 'ts',
      source: 'const a = 2',
    })

    // Simulate worker returning parse result
    const mockResult: ParseResult = {
      id: 2,
      language: 'ts',
      sourceHash: 'hash-a2',
      ast: {
        type: 'program',
        named: true,
        fieldName: null,
        error: false,
        start: { row: 0, column: 0, byte: 0 },
        end: { row: 0, column: 11, byte: 11 },
        text: 'const a = 2',
        children: [],
      },
      stats: { parseMs: 1, nodeCount: 1, errorCount: 0 },
    }

    worker.emitMessage({ kind: 'parse:result', id: 2, result: mockResult })

    const res1 = await p1
    const res2 = await p2
    expect(res1).toEqual(mockResult)
    expect(res2).toEqual(mockResult)
  })

  it('workerClient_staleResults_areDroppedBySequence', async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient({
      worker: worker as unknown as Worker,
      debounceMs: 300,
    })

    // Issue first parse
    const p1 = client.parseDebounced('ts', 'code1')
    await vi.advanceTimersByTimeAsync(300)
    worker.emitMessage({ kind: 'ready', module: 'code_lens_wasm', bytesLoaded: 100 })
    await Promise.resolve()

    // First parse message sent with id 2
    expect(worker.postedMessages).toContainEqual({
      kind: 'parse',
      id: 2,
      language: 'ts',
      source: 'code1',
    })

    // Issue second parse
    const p2 = client.parseDebounced('ts', 'code2')
    await vi.advanceTimersByTimeAsync(300)
    await Promise.resolve()

    // Second parse message sent with id 3
    expect(worker.postedMessages).toContainEqual({
      kind: 'parse',
      id: 3,
      language: 'ts',
      source: 'code2',
    })

    // Now latestSeq is 3. Emit result for stale id 2
    worker.emitMessage({
      kind: 'parse:result',
      id: 2,
      result: {
        id: 2,
        language: 'ts',
        sourceHash: 'stale',
        ast: {} as unknown as ParseResult['ast'],
        stats: { parseMs: 1, nodeCount: 1, errorCount: 0 },
      },
    })

    // Emit result for id 3
    const validResult: ParseResult = {
      id: 3,
      language: 'ts',
      sourceHash: 'fresh',
      ast: {} as unknown as ParseResult['ast'],
      stats: { parseMs: 2, nodeCount: 2, errorCount: 0 },
    }

    worker.emitMessage({ kind: 'parse:result', id: 3, result: validResult })

    const res2 = await p2
    expect(res2.sourceHash).toBe('fresh')

    // p1 was never resolved because id 2 was dropped as stale
    let p1Resolved = false
    p1.then(() => {
      p1Resolved = true
    })
    await Promise.resolve()
    expect(p1Resolved).toBe(false)
  })

  it('workerClient_parseError_rejectsAndSurfaces', async () => {
    const worker = new FakeWorker()
    const client = createWorkerClient({
      worker: worker as unknown as Worker,
      debounceMs: 300,
    })

    const promise = client.parseDebounced('ts', 'invalid')
    await vi.advanceTimersByTimeAsync(300)
    worker.emitMessage({ kind: 'ready', module: 'code_lens_wasm', bytesLoaded: 100 })
    await Promise.resolve()

    const parseMsg = worker.postedMessages.find((m) => m.kind === 'parse')!
    expect(parseMsg).toBeDefined()

    worker.emitMessage({
      kind: 'parse:error',
      id: parseMsg.id,
      message: 'Failed to parse wasm source',
    })

    await expect(promise).rejects.toThrow('Failed to parse wasm source')
  })
})
