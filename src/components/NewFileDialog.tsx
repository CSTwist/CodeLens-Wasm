import { useState, useEffect } from 'react'
import type { LangId } from '../lib/ast'
import { useWorkspaceStore, inferLanguageFromPath } from '../store/workspaceStore'

interface NewFileDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function NewFileDialog({ isOpen, onClose }: NewFileDialogProps) {
  const [filePath, setFilePath] = useState('')
  const [language, setLanguage] = useState<LangId>('ts')
  const [isLangCustomized, setIsLangCustomized] = useState(false)
  const { addFile, files } = useWorkspaceStore()
  const [localError, setLocalError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      setFilePath('')
      setLanguage('ts')
      setIsLangCustomized(false)
      setLocalError(null)
    }
  }, [isOpen])

  const handlePathChange = (val: string) => {
    setFilePath(val)
    setLocalError(null)
    if (!isLangCustomized) {
      setLanguage(inferLanguageFromPath(val))
    }
  }

  const handleLanguageChange = (lang: LangId) => {
    setLanguage(lang)
    setIsLangCustomized(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = filePath.trim()
    if (!trimmed) {
      setLocalError('File path cannot be empty')
      return
    }

    if (files.some((f) => f.path === trimmed)) {
      setLocalError(`File "${trimmed}" already exists`)
      return
    }

    const defaultContent =
      language === 'rust'
        ? 'fn main() {\n    println!("Hello, world!");\n}'
        : language === 'json'
          ? '{\n  "name": "example"\n}'
          : '// New file\n'

    const success = addFile({
      path: trimmed,
      language,
      content: defaultContent,
    })

    if (success) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-5 w-full max-w-md shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <h3 className="text-base font-semibold text-indigo-400">Create New File</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-200 text-lg leading-none"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-file-path" className="block text-xs font-medium text-gray-400 mb-1">
              File Path / Name
            </label>
            <input
              id="new-file-path"
              type="text"
              placeholder="e.g. src/utils.ts or config.json"
              value={filePath}
              onChange={(e) => handlePathChange(e.target.value)}
              className="w-full bg-gray-950 border border-gray-700 text-gray-100 text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              autoFocus
            />
          </div>

          <div>
            <label htmlFor="new-file-language" className="block text-xs font-medium text-gray-400 mb-1">
              Language
            </label>
            <select
              id="new-file-language"
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value as LangId)}
              className="w-full bg-gray-950 border border-gray-700 text-gray-100 text-sm rounded px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
            >
              <option value="ts">TypeScript (.ts)</option>
              <option value="tsx">React TSX (.tsx)</option>
              <option value="rust">Rust (.rs)</option>
              <option value="json">JSON (.json)</option>
            </select>
          </div>

          {localError && <div className="text-red-400 text-xs font-mono">{localError}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium transition-colors"
            >
              Create File
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
