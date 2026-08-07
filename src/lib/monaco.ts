import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import type * as monaco from 'monaco-editor'

export type Monaco = typeof monaco

let monacoPromise: Promise<Monaco> | null = null

export function loadMonaco(): Promise<Monaco> {
  if (monacoPromise) {
    return monacoPromise
  }

  // Setup worker environment before initializing Monaco
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker()
    },
  }

  monacoPromise = import('monaco-editor/editor/editor.api.js') as unknown as Promise<Monaco>
  return monacoPromise
}
