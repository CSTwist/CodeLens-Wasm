/// <reference lib="webworker" />

declare const self: DedicatedWorkerGlobalScope

import type { AstNode, ParseRequest, WorkerInbound, WorkerOutbound } from '../lib/ast'

export type WasmModule = {
  default: () => Promise<unknown>
  parse: (source: string, language: string) => string
}

export function createParseWorker(
  post: (m: WorkerOutbound) => void,
  loadWasm?: () => Promise<WasmModule>
) {
  let wasmMod: WasmModule | null = null
  let initPromise: Promise<WasmModule> | null = null
  let readyPosted = false

  const ensureWasm = async (): Promise<WasmModule> => {
    if (wasmMod) return wasmMod
    if (initPromise) return initPromise

    initPromise = (async () => {
      const loader = loadWasm ?? (async () => {
        // Vite 8 rejects statically-analyzable dynamic imports of /public files;
        // the self.location.origin runtime value makes it non-analyzable.
        const wasmUrl = self.location.origin + import.meta.env.BASE_URL + 'wasm/code_lens_wasm.js'
        const mod = await import(/* @vite-ignore */ wasmUrl)
        await mod.default()
        return mod as WasmModule
      })

      const mod = await loader()
      wasmMod = mod

      if (!readyPosted) {
        readyPosted = true
        let bytesLoaded = 0
        try {
          if (typeof self !== 'undefined' && self.location?.origin) {
            const baseUrl = import.meta.env?.BASE_URL ?? '/'
            const bgUrl = self.location.origin + baseUrl + 'wasm/code_lens_wasm_bg.wasm'
            const res = await fetch(bgUrl, { method: 'HEAD' })
            if (res.ok) {
              const len = res.headers.get('content-length')
              if (len) bytesLoaded = parseInt(len, 10) || 0
            }
          }
        } catch {
          bytesLoaded = 0
        }
        post({ kind: 'ready', module: 'code_lens_wasm', bytesLoaded })
      }

      return mod
    })()

    return initPromise
  }

  let isParsing = false
  let pendingReq: ParseRequest | null = null

  const executeParse = async (req: ParseRequest) => {
    try {
      const mod = await ensureWasm()
      const rawJson = mod.parse(req.source, req.language)
      const parsed = JSON.parse(rawJson) as {
        sourceHash: string
        ast: AstNode
        parseMs?: number
        nodeCount?: number
        errorCount?: number
        stats?: { parseMs: number; nodeCount: number; errorCount: number }
      }

      const parseMs = parsed.parseMs ?? parsed.stats?.parseMs ?? 0
      const nodeCount = parsed.nodeCount ?? parsed.stats?.nodeCount ?? 0
      const errorCount = parsed.errorCount ?? parsed.stats?.errorCount ?? 0

      post({
        kind: 'parse:result',
        id: req.id,
        result: {
          id: req.id,
          language: req.language,
          sourceHash: parsed.sourceHash,
          ast: parsed.ast,
          stats: { parseMs, nodeCount, errorCount },
        },
      })
    } catch (err) {
      post({
        kind: 'parse:error',
        id: req.id,
        message: String(err instanceof Error ? err.message : err),
      })
    }
  }

  const processQueue = async () => {
    while (pendingReq) {
      const req = pendingReq
      pendingReq = null
      await executeParse(req)
    }
    isParsing = false
  }

  const handleParse = async (req: ParseRequest): Promise<void> => {
    if (isParsing) {
      // Pending queue capacity 1: drop oldest if full
      pendingReq = req
      return
    }

    isParsing = true
    await executeParse(req)
    await processQueue()
  }

  const handlePing = async (): Promise<void> => {
    try {
      await ensureWasm()
    } catch (err) {
      post({
        kind: 'parse:error',
        id: 0,
        message: String(err instanceof Error ? err.message : err),
      })
    }
  }

  return { handlePing, handleParse }
}

if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const worker = createParseWorker((m) => self.postMessage(m))
  self.onmessage = async (e: MessageEvent<WorkerInbound>) => {
    const data = e.data
    if (!data) return
    if (data.kind === 'ping') {
      await worker.handlePing()
    } else if (data.kind === 'parse') {
      await worker.handleParse(data)
    }
  }
}
