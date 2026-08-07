import { useParseStore } from '../store/parseStore'
import { useWorkspaceStore } from '../store/workspaceStore'

interface StatsBarProps {
  fileSizeBytes?: number
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export function StatsBar({ fileSizeBytes = 0 }: StatsBarProps) {
  const { status, stats, lastSourceHash, errorMessage } = useParseStore()
  const { overQuotaWarning, lastError, dismissError } = useWorkspaceStore()

  const wasmStatusText = stats !== null ? 'READY' : status

  return (
    <div
      aria-live="polite"
      className="bg-gray-900 text-gray-200 p-4 rounded-lg font-mono text-sm space-y-2 border border-gray-800"
    >
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
        <div>
          <span className="text-gray-400 block text-xs">WASM Status</span>
          <span className="font-semibold text-emerald-400">{wasmStatusText}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-xs">Node Count</span>
          <span className="font-semibold">{stats ? stats.nodeCount : 0}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-xs">Error Count</span>
          <span className="font-semibold">{stats ? stats.errorCount : 0}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-xs">Parse Time</span>
          <span className="font-semibold">{stats ? `${stats.parseMs.toFixed(2)} ms` : '0.00 ms'}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-xs">File Size</span>
          <span className="font-semibold">{formatBytes(fileSizeBytes)}</span>
        </div>
        <div>
          <span className="text-gray-400 block text-xs">Source Hash</span>
          <span className="font-semibold truncate block" title={lastSourceHash ?? '-'}>
            {lastSourceHash ?? '-'}
          </span>
        </div>
      </div>

      {overQuotaWarning && (
        <div className="mt-2 text-amber-400 bg-amber-950/40 border border-amber-800/60 p-2 rounded text-xs flex items-center justify-between">
          <span>Workspace exceeds 10 MB — quota eviction risk</span>
        </div>
      )}

      {lastError && (
        <div className="mt-2 text-red-400 bg-red-950/40 border border-red-800/60 p-2 rounded text-xs flex items-center justify-between">
          <div>
            <span className="font-bold">Workspace Error:</span> {lastError}
          </div>
          <button
            onClick={dismissError}
            className="text-red-300 hover:text-white ml-2 text-sm leading-none font-bold"
            aria-label="Dismiss error banner"
          >
            ×
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="mt-2 text-red-400 text-xs">
          <span className="font-bold">Parse Error:</span> {errorMessage}
        </div>
      )}
    </div>
  )
}
