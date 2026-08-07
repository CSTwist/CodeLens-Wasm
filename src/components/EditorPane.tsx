import { useEffect, useRef } from 'react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { useMonaco } from '../lib/useMonaco'
import { type FileItem, mapLangToMonaco } from '../store/workspaceStore'
import type { AstNode } from '../lib/ast'
import { highlightNodeInEditor, setupCursorSync } from '../lib/monacoSync'

interface EditorPaneProps {
  activeFile: FileItem | null
  ast: AstNode | null
  selectedNode: AstNode | null
  onChange: (content: string) => void
  onSelectNodePath: (path: AstNode[]) => void
}

export function EditorPane({
  activeFile,
  ast,
  selectedNode,
  onChange,
  onSelectNodePath,
}: EditorPaneProps) {
  const monaco = useMonaco()
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const decorationsRef = useRef<string[]>([])
  const astRef = useRef<AstNode | null>(ast)
  const isUpdatingValueRef = useRef<boolean>(false)

  // Keep astRef up to date for cursor listener closure
  useEffect(() => {
    astRef.current = ast
  }, [ast])

  // Initialize Monaco Editor instance
  useEffect(() => {
    if (!monaco || !containerRef.current) return

    const editor = monaco.editor.create(containerRef.current, {
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      tabSize: 2,
    })

    editorRef.current = editor

    // Setup cursor movement sync (editor -> tree)
    const cleanupCursorSync = setupCursorSync(
      editor,
      () => astRef.current,
      (path) => onSelectNodePath(path),
      50
    )

    return () => {
      cleanupCursorSync()
      editor.dispose()
      editorRef.current = null
    }
  }, [monaco])

  // Synchronize model with activeFile
  useEffect(() => {
    if (!monaco || !editorRef.current || !activeFile) return

    const editor = editorRef.current
    const uri = monaco.Uri.parse(`inmemory://workspace/${activeFile.path}`)
    let model = monaco.editor.getModel(uri)
    const monacoLang = mapLangToMonaco(activeFile.language)

    if (!model) {
      model = monaco.editor.createModel(activeFile.content, monacoLang, uri)
    } else {
      if (model.getLanguageId() !== monacoLang) {
        monaco.editor.setModelLanguage(model, monacoLang)
      }
      if (model.getValue() !== activeFile.content && !isUpdatingValueRef.current) {
        model.setValue(activeFile.content)
      }
    }

    if (editor.getModel() !== model) {
      editor.setModel(model)
    }

    // Subscribe to content changes
    const subscription = model.onDidChangeContent(() => {
      if (isUpdatingValueRef.current) return
      const val = model.getValue()
      onChange(val)
    })

    return () => {
      subscription.dispose()
    }
  }, [monaco, activeFile?.path, activeFile?.language])

  // Update content if activeFile content changed from external source (e.g. initial load)
  useEffect(() => {
    if (!monaco || !editorRef.current || !activeFile) return
    const model = editorRef.current.getModel()
    if (model && model.getValue() !== activeFile.content) {
      isUpdatingValueRef.current = true
      model.setValue(activeFile.content)
      isUpdatingValueRef.current = false
    }
  }, [activeFile?.content])

  // Highlight node when selected in tree
  useEffect(() => {
    if (!editorRef.current || !selectedNode) return
    decorationsRef.current = highlightNodeInEditor(
      editorRef.current,
      selectedNode,
      decorationsRef.current
    )
  }, [selectedNode])

  if (!monaco) {
    return (
      <div className="flex-1 bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-center text-gray-400 font-mono text-sm">
        Loading Monaco Editor...
      </div>
    )
  }

  return (
    <div className="flex-1 h-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        className="flex-1 w-full h-full min-h-[300px]"
        data-testid="monaco-editor-container"
      />
    </div>
  )
}
