import { useState } from 'react'
import { useWorkspaceStore } from '../store/workspaceStore'
import { NewFileDialog } from './NewFileDialog'

export function FileTabs() {
  const { files, activePath, setActivePath, closeFile, dirtyPaths } = useWorkspaceStore()
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <div className="flex items-center bg-gray-900 border-b border-gray-800 text-sm overflow-x-auto select-none rounded-t-lg">
      {files.map((file) => {
        const isActive = file.path === activePath
        const isDirty = !!dirtyPaths[file.path]

        return (
          <div
            key={file.path}
            onClick={() => setActivePath(file.path)}
            className={`flex items-center gap-2 px-3 py-2 border-r border-gray-800 cursor-pointer transition-colors ${
              isActive
                ? 'bg-gray-950 text-indigo-400 font-medium border-t-2 border-t-indigo-500'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
            role="tab"
            aria-selected={isActive}
          >
            <span className="truncate max-w-[140px] flex items-center gap-1">
              {file.path}
              {isDirty && <span className="text-amber-400 font-bold text-[10px] leading-none">●</span>}
            </span>
            <span className="text-[10px] uppercase font-mono px-1 py-0.5 rounded bg-gray-800 text-gray-400">
              {file.language}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeFile(file.path)
              }}
              className="text-gray-500 hover:text-gray-300 p-0.5 rounded hover:bg-gray-700/50"
              title="Close tab"
              aria-label={`Close ${file.path}`}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        onClick={() => setIsModalOpen(true)}
        className="px-3 py-2 text-gray-400 hover:text-indigo-400 hover:bg-gray-800/50 transition-colors text-base"
        title="New file"
        aria-label="New file"
      >
        +
      </button>

      <NewFileDialog isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}
