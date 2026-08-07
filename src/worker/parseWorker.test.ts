import { describe, expect, it, vi } from 'vitest'
import { createParseWorker } from './parseWorker'
import type { LangId, ParseResultMsg, WorkerOutbound } from '../lib/ast'

describe('parseWorker', () => {
  it('worker_ping_repliesReady', async () => {
    const messages: WorkerOutbound[] = []
    const loadWasm = vi.fn().mockResolvedValue({
      default: async () => {},
      parse: () => '{}',
    })

    const worker = createParseWorker((m) => messages.push(m), loadWasm)
    await worker.handlePing()

    expect(loadWasm).toHaveBeenCalledTimes(1)
    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatchObject({
      kind: 'ready',
      module: 'code_lens_wasm',
    })
  })

  it('worker_parse_returnsAstForAllLanguages', async () => {
    const messages: WorkerOutbound[] = []
    const fakeParse = (source: string, language: string) => {
      return JSON.stringify({
        language,
        sourceHash: `hash-${language}`,
        ast: {
          type: 'program',
          named: true,
          fieldName: null,
          error: false,
          start: { row: 0, column: 0, byte: 0 },
          end: { row: 0, column: source.length, byte: source.length },
          text: source,
          children: [],
        },
        stats: { parseMs: 1.5, nodeCount: 1, errorCount: 0 },
      })
    }

    const loadWasm = vi.fn().mockResolvedValue({
      default: async () => {},
      parse: fakeParse,
    })

    const worker = createParseWorker((m) => messages.push(m), loadWasm)
    const languages: LangId[] = ['ts', 'tsx', 'rust', 'json']

    for (let idx = 0; idx < languages.length; idx++) {
      const lang = languages[idx]
      await worker.handleParse({
        kind: 'parse',
        id: idx + 1,
        language: lang,
        source: `sample code for ${lang}`,
      })
    }

    // Filter parse:result messages
    const resultMsgs = messages.filter(
      (m): m is ParseResultMsg => m.kind === 'parse:result'
    )

    expect(resultMsgs).toHaveLength(4)
    languages.forEach((lang, idx) => {
      const resMsg = resultMsgs[idx]
      expect(resMsg.id).toBe(idx + 1)
      expect(resMsg.result.language).toBe(lang)
      expect(resMsg.result.sourceHash).toBe(`hash-${lang}`)
      expect(resMsg.result.ast.type).toBe('program')
      expect(resMsg.result.stats).toEqual({
        parseMs: 1.5,
        nodeCount: 1,
        errorCount: 0,
      })
    })
  })
})
