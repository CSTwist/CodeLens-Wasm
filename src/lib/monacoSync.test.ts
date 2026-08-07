import { describe, expect, it } from 'vitest'
import type { AstNode } from './ast'
import { getIgnoreNextCursor, nodeToMonacoRange, setIgnoreNextCursor } from './monacoSync'

describe('monacoSync', () => {
  it('converts 0-based tree-sitter coordinates to 1-based Monaco range', () => {
    const node: AstNode = {
      type: 'identifier',
      named: true,
      fieldName: null,
      error: false,
      start: { row: 0, column: 4, byte: 4 },
      end: { row: 0, column: 8, byte: 8 },
      text: 'test',
      children: [],
    }

    const range = nodeToMonacoRange(node)
    expect(range).toEqual({
      startLineNumber: 1,
      startColumn: 5,
      endLineNumber: 1,
      endColumn: 9,
    })
  })

  it('manages ignoreNextCursor flag correctly', () => {
    setIgnoreNextCursor(true)
    expect(getIgnoreNextCursor()).toBe(true)
    setIgnoreNextCursor(false)
    expect(getIgnoreNextCursor()).toBe(false)
  })
})
