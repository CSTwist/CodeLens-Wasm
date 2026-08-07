import { useState } from 'react'
import { useWorkspaceStore } from '../store/workspaceStore'
import { NewFileDialog } from './NewFileDialog'

export function Sidebar() {
  const { files, activePath, setActivePath, deleteFile, renameFile, dirtyPaths } = useWorkspaceStore()
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleStartRename = (path: string) => {
    setEditingPath(path)
    setEditValue(path)
  }

  const handleFinishRename = async (oldPath: string) => {
    if (editingPath !== oldPath) return
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== oldPath) {
      await renameFile(oldPath, trimmed)
    }
    setEditingPath(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent, oldPath: string) => {
    if (e.key === 'Enter') {
      handleFinishRename(oldPath)
    } else if (e.key === 'Escape') {
      setEditingPath(null)
    }
  }

  return (
    <aside className="w-56 bg-gray-900 border border-gray-800 rounded-lg flex flex-col min-h-0 select-none overflow-hidden flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800 bg-gray-950/50">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Workspace</span>
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="px-2 py-0.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded text-xs font-medium transition-colors flex items-center gap-1"
          title="New File"
          aria-label="New File"
        >
          <span>+</span>
          <span>New</span>
        </button>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
        {files.map((file) => {
          const isActive = file.path === activePath
          const isDirty = !!dirtyPaths[file.path]
          const isEditing = editingPath === file.path

          return (
            <div
              key={file.path}
              onClick={() => setActivePath(file.path)}
              className={`group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors ${
                isActive
                  ? 'bg-indigo-950/60 text-indigo-300 font-medium border border-indigo-800/40'
                  : 'text-gray-300 hover:bg-gray-800/60 hover:text-gray-100'
              }`}
            >
              {isEditing ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => handleFinishRename(file.path)}
                  onKeyDown={(e) => handleKeyDown(e, file.path)}
                  className="bg-gray-950 border border-indigo-500 text-gray-100 px-1 py-0.5 rounded text-xs w-full focus:outline-none"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <div className="flex items-center gap-1.5 truncate flex-1 min-w-0 pr-1">
                    <span className="truncate">{file.path}</span>
                    {isDirty && <span className="text-amber-400 font-bold text-[10px] leading-none">●</span>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleStartRename(file.path)
                      }}
                      className="p-0.5 text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 rounded"
                      title="Rename"
                      aria-label={`Rename ${file.path}`}
                    >
                      ✎
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteFile(file.path)
                      }}
                      className="p-0.5 text-gray-400 hover:text-red-400 hover:bg-gray-700/50 rounded"
                      title="Delete"
                      aria-label={`Delete ${file.path}`}
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </div>
          )
        })}
        {files.length === 0 && (
          <div className="p-3 text-center text-gray-500 text-xs italic">No files in workspace</div>
        )}
      </div>

      <NewFileDialog isOpen={isNewModalOpen} onClose={() => setIsNewModalOpen(false)} />
    </aside>
  )
}
