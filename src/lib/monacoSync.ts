import type { editor as MonacoEditor } from 'monaco-editor'
import { type AstNode, findNodePathAt } from './ast'

let ignoreNextCursor = false

export function setIgnoreNextCursor(flag: boolean) {
  ignoreNextCursor = flag
}

export function getIgnoreNextCursor(): boolean {
  return ignoreNextCursor
}

export function nodeToMonacoRange(node: AstNode) {
  return {
    startLineNumber: node.start.row + 1,
    startColumn: node.start.column + 1,
    endLineNumber: node.end.row + 1,
    endColumn: node.end.column + 1,
  }
}

export function highlightNodeInEditor(
  editor: MonacoEditor.IStandaloneCodeEditor,
  node: AstNode,
  prevDecorationIds: string[] = [],
): string[] {
  const range = nodeToMonacoRange(node)
  ignoreNextCursor = true
  editor.revealRangeInCenter(range)
  editor.setPosition({ lineNumber: range.startLineNumber, column: range.startColumn })

  const newDecorations = editor.deltaDecorations(prevDecorationIds, [
    {
      range,
      options: {
        inlineClassName: 'ast-node-highlight',
        isWholeLine: false,
      },
    },
  ])
  return newDecorations
}

export function setupCursorSync(
  editor: MonacoEditor.IStandaloneCodeEditor,
  getAst: () => AstNode | null,
  onSelectNode: (path: AstNode[]) => void,
  debounceMs = 50,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const listener = editor.onDidChangeCursorPosition((e) => {
    if (ignoreNextCursor) {
      ignoreNextCursor = false
      return
    }

    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      const model = editor.getModel()
      const ast = getAst()
      if (!model || !ast) return

      const offset = model.getOffsetAt(e.position)
      const path = findNodePathAt(ast, offset)
      if (path.length > 0) {
        onSelectNode(path)
      }
    }, debounceMs)
  })

  return () => {
    listener.dispose()
    if (timer) clearTimeout(timer)
  }
}
