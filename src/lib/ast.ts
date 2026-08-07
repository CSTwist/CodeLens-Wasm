export type LangId = 'ts' | 'tsx' | 'rust' | 'json'
export interface SourcePos { row: number; column: number; byte: number }
export interface AstNode { type: string; named: boolean; fieldName: string | null; error: boolean; start: SourcePos; end: SourcePos; text: string | null; children: AstNode[] }
export interface ParseStats { parseMs: number; nodeCount: number; errorCount: number }
export interface ParseResult { id: number; language: LangId; sourceHash: string; ast: AstNode; stats: ParseStats }
export interface ParseRequest { kind: 'parse'; id: number; language: LangId; source: string }
export interface Ping { kind: 'ping'; id: number }
export interface Ready { kind: 'ready'; module: string; bytesLoaded: number }
export interface ParseResultMsg { kind: 'parse:result'; id: number; result: ParseResult }
export interface ParseErrorMsg { kind: 'parse:error'; id: number; message: string }
export type WorkerInbound = ParseRequest | Ping
export type WorkerOutbound = Ready | ParseResultMsg | ParseErrorMsg

export function countNodes(node: AstNode | null): number {
  if (!node) return 0
  let count = 1
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child)
    }
  }
  return count
}

export function flatten(node: AstNode | null): AstNode[] {
  if (!node) return []
  const result: AstNode[] = [node]
  if (node.children) {
    for (const child of node.children) {
      result.push(...flatten(child))
    }
  }
  return result
}

export function findNodeAt(node: AstNode | null, byteOffset: number): AstNode | null {
  const path = findNodePathAt(node, byteOffset)
  return path.length > 0 ? path[path.length - 1] : null
}

export function findNodePathAt(node: AstNode | null, byteOffset: number): AstNode[] {
  if (!node) return []
  if (byteOffset < node.start.byte || byteOffset > node.end.byte) {
    return []
  }

  if (node.children) {
    for (const child of node.children) {
      const childPath = findNodePathAt(child, byteOffset)
      if (childPath.length > 0) {
        return [node, ...childPath]
      }
    }
  }

  return node.named ? [node] : []
}
