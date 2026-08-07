import type {
  LangId,
  ParseResult,
  Ready,
  WorkerInbound,
  WorkerOutbound,
} from './ast'

export interface WorkerClientOptions {
  worker?: Worker
  debounceMs?: number
}

export function createWorkerClient(opts?: WorkerClientOptions) {
  const debounceMs = opts?.debounceMs ?? 300
  const worker =
    opts?.worker ??
    new Worker(new URL('../worker/parseWorker.ts', import.meta.url), {
      type: 'module',
    })

  let seq = 0
  let latestSeq = 0

  let pingPromise: Promise<Ready> | null = null
  let pendingPingResolver: ((ready: Ready) => void) | null = null

  const pendingRequests = new Map<
    number,
    {
      resolve: (res: ParseResult) => void
      reject: (err: Error) => void
    }
  >()

  worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
    const msg = e.data
    if (!msg) return

    if (msg.kind === 'ready') {
      if (pendingPingResolver) {
        pendingPingResolver(msg)
        pendingPingResolver = null
      }
      return
    }

    if (msg.kind === 'parse:result') {
      if (msg.id < latestSeq) {
        // Stale result: drop it (FR-10)
        pendingRequests.delete(msg.id)
        return
      }
      const pending = pendingRequests.get(msg.id)
      if (pending) {
        pendingRequests.delete(msg.id)
        pending.resolve(msg.result)
      }
      return
    }

    if (msg.kind === 'parse:error') {
      if (msg.id < latestSeq) {
        // Stale error: drop it (FR-10)
        pendingRequests.delete(msg.id)
        return
      }
      const pending = pendingRequests.get(msg.id)
      if (pending) {
        pendingRequests.delete(msg.id)
        pending.reject(new Error(msg.message))
      }
      return
    }
  }

  function ping(): Promise<Ready> {
    if (pingPromise) return pingPromise
    pingPromise = new Promise<Ready>((resolve) => {
      pendingPingResolver = resolve
      const id = ++seq
      const msg: WorkerInbound = { kind: 'ping', id }
      worker.postMessage(msg)
    })
    return pingPromise
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  let pendingDeferred: {
    promise: Promise<ParseResult>
    resolve: (res: ParseResult) => void
    reject: (err: unknown) => void
  } | null = null

  function parseDebounced(
    language: LangId,
    source: string
  ): Promise<ParseResult> {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }

    if (!pendingDeferred) {
      let resolve!: (res: ParseResult) => void
      let reject!: (err: unknown) => void
      const promise = new Promise<ParseResult>((res, rej) => {
        resolve = res
        reject = rej
      })
      pendingDeferred = { promise, resolve, reject }
    }

    const currentDeferred = pendingDeferred

    timer = setTimeout(async () => {
      timer = null
      pendingDeferred = null

      try {
        await ping()
        seq++
        const reqId = seq
        latestSeq = reqId

        pendingRequests.set(reqId, {
          resolve: currentDeferred.resolve,
          reject: (err) => currentDeferred.reject(err),
        })

        const msg: WorkerInbound = {
          kind: 'parse',
          id: reqId,
          language,
          source,
        }
        worker.postMessage(msg)
      } catch (err) {
        currentDeferred.reject(err)
      }
    }, debounceMs)

    return currentDeferred.promise
  }

  function dispose() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    worker.terminate()
  }

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      dispose()
    })
  }

  return {
    ping,
    parseDebounced,
    dispose,
  }
}
