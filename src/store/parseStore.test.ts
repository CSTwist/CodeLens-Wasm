import { describe, expect, it, vi } from 'vitest'
import { useParseStore } from './parseStore'
import type { ParseResult } from '../lib/ast'

describe('parseStore', () => {
  it('parseStore_staleSourceHash_skipsRerender', () => {
    const spy = vi.fn()
    const unsubscribe = useParseStore.subscribe(spy)

    const result: ParseResult = {
      id: 1,
      language: 'ts',
      sourceHash: 'hash-12345',
      ast: {
        type: 'program',
        named: true,
        fieldName: null,
        error: false,
        start: { row: 0, column: 0, byte: 0 },
        end: { row: 0, column: 5, byte: 5 },
        text: 'hello',
        children: [],
      },
      stats: { parseMs: 2, nodeCount: 1, errorCount: 0 },
    }

    // First call: state changes from null sourceHash to 'hash-12345'
    useParseStore.getState().parseResolved(result)
    expect(spy).toHaveBeenCalledTimes(1)

    spy.mockClear()

    // Second call: same sourceHash 'hash-12345' -> should skip set() / re-render
    useParseStore.getState().parseResolved(result)
    expect(spy).not.toHaveBeenCalled()

    unsubscribe()
  })
})
