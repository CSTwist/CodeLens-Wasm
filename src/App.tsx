import { useEffect, useRef, useState, useCallback } from 'react'
import type { AstNode, LangId } from './lib/ast'
import { createWorkerClient } from './lib/workerClient'
import { useParseStore } from './store/parseStore'
import { useWorkspaceStore } from './store/workspaceStore'
import { StatsBar } from './components/StatsBar'
import { FileTabs } from './components/FileTabs'
import { EditorPane } from './components/EditorPane'
import { AstTree } from './components/AstTree'
import { EmptyState } from './components/EmptyState'
import { Sidebar } from './components/Sidebar'

export default function App() {
  const { files, activePath, updateFileContent, setLanguage, init, isInitialized } = useWorkspaceStore()
  const activeFile = files.find((f) => f.path === activePath) ?? null

  const [selectedNodePath, setSelectedNodePath] = useState<AstNode[]>([])
  const clientRef = useRef<ReturnType<typeof createWorkerClient> | null>(null)

  const { status, ast, parseRequested, parseResolved, parseFailed } = useParseStore()

  function getClient() {
    if (!clientRef.current) {
      clientRef.current = createWorkerClient()
    }
    return clientRef.current
  }

  // Initialize IndexedDB workspace store on mount
  useEffect(() => {
    init()
  }, [init])

  useEffect(() => {
    const client = getClient()
    return () => {
      client.dispose()
      clientRef.current = null
    }
  }, [])

  const triggerParse = useCallback(
    (lang: LangId, src: string) => {
      if (src.length > 2_000_000) {
        parseFailed('File too large (> 2 MB hard cap)')
        return
      }

      parseRequested()
      const client = getClient()
      client
        .parseDebounced(lang, src)
        .then((res) => {
          parseResolved(res)
        })
        .catch((err) => {
          parseFailed(err instanceof Error ? err.message : String(err))
        })
    },
    [parseRequested, parseResolved, parseFailed]
  )

  // Parse active file when activePath or content/language changes
  useEffect(() => {
    if (activeFile) {
      triggerParse(activeFile.language, activeFile.content)
    }
  }, [activeFile?.path, activeFile?.language, triggerParse])

  const handleSourceChange = (newSrc: string) => {
    if (!activeFile) return
    const success = updateFileContent(activeFile.path, newSrc)
    if (success) {
      triggerParse(activeFile.language, newSrc)
    }
  }

  const handleLanguageChange = (newLang: LangId) => {
    if (!activeFile) return
    setLanguage(activeFile.path, newLang)
    triggerParse(newLang, activeFile.content)
  }

  const handleAstNodeClick = (node: AstNode) => {
    setSelectedNodePath([node])
  }

  const handleSelectNodePath = (path: AstNode[]) => {
    setSelectedNodePath(path)
  }

  const selectedNode = selectedNodePath.length > 0 ? selectedNodePath[selectedNodePath.length - 1] : null
  const fileSizeBytes = activeFile ? new TextEncoder().encode(activeFile.content).length : 0

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen bg-gray-950 text-gray-400 flex items-center justify-center font-mono text-sm">
        Initializing workspace...
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-gray-950 text-gray-100 flex flex-col font-sans overflow-hidden p-4 gap-3">
      {/* Top Navigation / App Bar */}
      <header className="flex items-center justify-between bg-gray-900 border border-gray-800 px-4 py-2 rounded-lg flex-shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold tracking-tight text-indigo-400">CodeLens Wasm</h1>
          {status === 'parsing' && (
            <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/50 px-2 py-0.5 rounded border border-amber-800/50 animate-pulse font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Parsing...
            </span>
          )}
        </div>

        {activeFile && (
          <div className="flex items-center gap-2">
            <label htmlFor="lang-select" className="text-xs font-medium text-gray-400">
              Language:
            </label>
            <select
              id="lang-select"
              value={activeFile.language}
              onChange={(e) => handleLanguageChange(e.target.value as LangId)}
              className="bg-gray-950 border border-gray-700 text-gray-200 text-xs rounded px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="ts">ts</option>
              <option value="tsx">tsx</option>
              <option value="rust">rust</option>
              <option value="json">json</option>
            </select>
          </div>
        )}
      </header>

      {/* Main Workspace Area with Sidebar */}
      <div className="flex-1 flex gap-3 min-h-0">
        <Sidebar />

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {files.length > 0 && activeFile ? (
            <div className="flex-1 flex flex-col min-h-0 gap-2">
              <FileTabs />
              <main className="flex-1 flex gap-3 min-h-0">
                {/* Left Pane: Monaco Editor */}
                <section className="flex-1 flex flex-col min-w-0 h-full" aria-label="Code Editor">
                  <EditorPane
                    activeFile={activeFile}
                    ast={ast}
                    selectedNode={selectedNode}
                    onChange={handleSourceChange}
                    onSelectNodePath={handleSelectNodePath}
                  />
                </section>

                {/* Right Pane: AST Tree Visualizer */}
                <section className="w-[420px] max-w-[50%] flex flex-col min-w-[280px] h-full" aria-label="AST Tree">
                  <AstTree
                    ast={ast}
                    onNodeClick={handleAstNodeClick}
                    selectedNodePath={selectedNodePath}
                  />
                </section>
              </main>
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Footer StatsBar */}
      <footer className="flex-shrink-0">
        <StatsBar fileSizeBytes={fileSizeBytes} />
      </footer>
    </div>
  )
}
