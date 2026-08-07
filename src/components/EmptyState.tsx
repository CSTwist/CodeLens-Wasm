import { useWorkspaceStore } from '../store/workspaceStore'
import type { LangId } from '../lib/ast'

export function EmptyState() {
  const { addFile } = useWorkspaceStore()

  const handleCreateFile = (lang: LangId) => {
    const ext = lang === 'rust' ? 'rs' : lang === 'json' ? 'json' : 'ts'
    const name = `main.${ext}`
    const content =
      lang === 'rust'
        ? 'fn main() {\n    println!("Hello World!");\n}'
        : lang === 'json'
          ? '{\n  "hello": "world"\n}'
          : 'const hello: string = "world";\nconsole.log(hello);'

    addFile({
      path: name,
      language: lang,
      content,
    })
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gray-900 border border-gray-800 rounded-lg text-center gap-4">
      <div className="w-12 h-12 rounded-full bg-indigo-900/50 flex items-center justify-center text-indigo-400 text-2xl font-bold">
        ⚡
      </div>
      <h2 className="text-xl font-bold text-gray-100">Welcome to CodeLens Wasm</h2>
      <p className="text-sm text-gray-400 max-w-md">
        An in-browser AST visualizer powered by WebAssembly & Rust tree-sitter. Select or create a file to start exploring your code's syntax tree off the main thread.
      </p>
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={() => handleCreateFile('ts')}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-sm font-medium transition-colors"
        >
          + Create TypeScript File
        </button>
        <button
          onClick={() => handleCreateFile('rust')}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-sm font-medium transition-colors"
        >
          + Create Rust File
        </button>
        <button
          onClick={() => handleCreateFile('json')}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-md text-sm font-medium transition-colors"
        >
          + Create JSON File
        </button>
      </div>
    </div>
  )
}
