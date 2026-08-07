import { describe, expect, it } from 'vitest'
import { type AstNode, countNodes, findNodeAt, findNodePathAt, flatten } from './ast'

const sampleTree: AstNode = {
  type: 'program',
  named: true,
  fieldName: null,
  error: false,
  start: { row: 0, column: 0, byte: 0 },
  end: { row: 2, column: 1, byte: 30 },
  text: null,
  children: [
    {
      type: 'function_declaration',
      named: true,
      fieldName: null,
      error: false,
      start: { row: 0, column: 0, byte: 0 },
      end: { row: 1, column: 15, byte: 20 },
      text: null,
      children: [
        {
          type: 'identifier',
          named: true,
          fieldName: 'name',
          error: false,
          start: { row: 0, column: 3, byte: 3 },
          end: { row: 0, column: 7, byte: 7 },
          text: 'main',
          children: [],
        },
        {
          type: '(',
          named: false,
          fieldName: null,
          error: false,
          start: { row: 0, column: 7, byte: 7 },
          end: { row: 0, column: 8, byte: 8 },
          text: '(',
          children: [],
        },
      ],
    },
    {
      type: 'ERROR',
      named: true,
      fieldName: null,
      error: true,
      start: { row: 2, column: 0, byte: 22 },
      end: { row: 2, column: 5, byte: 27 },
      text: 'bad',
      children: [],
    },
  ],
}

describe('ast utilities', () => {
  it('countNodes counts all nodes recursively', () => {
    expect(countNodes(sampleTree)).toBe(5)
    expect(countNodes(null)).toBe(0)
  })

  it('flatten flattens tree nodes into array', () => {
    const list = flatten(sampleTree)
    expect(list.length).toBe(5)
    expect(list[0].type).toBe('program')
    expect(list[2].type).toBe('identifier')
  })

  it('findNodeAt finds deepest named node containing byte offset', () => {
    const node = findNodeAt(sampleTree, 5)
    expect(node?.type).toBe('identifier')
    expect(node?.text).toBe('main')
  })

  it('findNodePathAt returns path from root to deepest named node', () => {
    const path = findNodePathAt(sampleTree, 5)
    expect(path.map((n) => n.type)).toEqual(['program', 'function_declaration', 'identifier'])
  })
})
