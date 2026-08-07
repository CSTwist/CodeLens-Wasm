declare module 'monaco-editor/editor/editor.api.js' {
  import type * as monaco from 'monaco-editor'
  export = monaco
}

declare module 'monaco-editor/editor/editor.worker.js?worker' {
  const worker: new () => Worker
  export default worker
}
