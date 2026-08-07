# CodeLens Wasm — Technical Design

- Status: Draft (Phase 0 deliverable)
- Date: 2026-08-06
- Project card: Project 5 in [PROJECTS_ROADMAP.md](../../PROJECTS_ROADMAP.md)

## 1. Overview & Goals

CodeLens Wasm is an in-browser code analyzer that parses source code into a
visual AST using Rust compiled to WebAssembly. Skill targets: WebAssembly,
off-main-thread processing with Web Workers, Monaco Editor integration,
local-first storage.

Goals:

- **Parse off the main thread.** All parsing happens in a dedicated Web
  Worker; the UI thread only renders results.
- **Real Rust → Wasm.** A first-party `wasm-bindgen` crate wraps tree-sitter
  and exports a `parse()` binding — not prebuilt JS bindings.
- **Visual AST.** Collapsible node tree with click-to-highlight sync in both
  directions with the editor.
- **Local-first.** Workspace files live in IndexedDB. No backend, no network
  dependency at runtime.
- **Lean.** No CDN-hosted Monaco, no bundler plugins where Vite does it
  natively, no runtime dependency that a few lines of code replace.

## 2. Tech Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| UI Framework | React 19 + Vite (latest stable, pinned at install) | Client-only tool; Vite is first-class for Monaco, wasm, workers (ADR-04). |
| Language | TypeScript (strict) | Shared types for worker protocol + AST JSON. |
| Parser Engine | tree-sitter (Rust crates): TypeScript/TSX, Rust, JSON grammars | Uniform node taxonomy across languages, error recovery, field names (ADR-01). |
| Wasm Toolchain | Rust stable + `wasm32-unknown-unknown`, wasm-bindgen 0.2, wasm-pack, wasm-opt | Roadmap milestone 1 is explicitly a Rust-to-Wasm crate (ADR-02). |
| Editor | Monaco Editor (local ESM bundle, no CDN) | Industry-standard editor; lazy-loaded chunk (ADR-07). |
| Off-Thread | Native dedicated module Worker + typed `postMessage` protocol | One worker, five message types; no Comlink (ADR-03). |
| Storage | IndexedDB via `idb` (~1.4 kB) | Two object stores; raw IDB is boilerplate, Dexie is overkill (ADR-06). |
| UI State | zustand (~1 kB) | High-frequency cross-cutting state (cursor ↔ tree sync) (ADR-08). |
| Styling | Tailwind CSS | Utility chrome around Monaco; consistent with prior projects. |
| Tests | cargo test + wasm-pack test (node) · Vitest + Testing Library · Playwright | Unit (Rust), unit (web), e2e + perf (Chromium). |
| CI / Hosting | GitHub Actions + Vercel (static) | Mirrors DCodeBook / PulseMetrics pipeline. |

## 3. High-Level Architecture

```
┌───────────────────────── BROWSER — MAIN THREAD ─────────────────────────┐
│  EditorPane (Monaco)    AstTree    StatsBar    FileTabs + Sidebar        │
│        │                  │           │              │                   │
│        └──────────────────┴──── zustand store ───────┘                   │
│                             │              │                             │
│                 FileStore (idb)      WorkerClient (promise map)          │
└─────────────────────────────┼──────────────┼────────────────────────────┘
                              │  postMessage (typed JSON, structured clone) │
┌─────────────────────────────┼──────────────┼────────────────────────────┐
│  PARSE WORKER (dedicated module worker)     ▼                            │
│   protocol router → wasm-bindgen glue → code_lens_wasm.wasm              │
│                                        (tree-sitter: TS · Rust · JSON)   │
└──────────────────────────────────────────────────────────────────────────┘
```

Flow: user types in Monaco → store fires debounced parse request →
`WorkerClient` posts `{id, language, source}` → worker parses via wasm →
posts `{id, ast, stats}` → store replaces previous result (stale results by
sequence number are dropped) → AstTree + StatsBar re-render; node click
`revealRangeInCenter`s the editor.

### Component Breakdown

1. **EditorPane** — Monaco instance via a `useMonaco` hook; language model per
   file; cursor/selection events; `deltaDecorations` for AST highlights and
   error ranges.
2. **AstTree** — collapsible tree rendered from `AstNode` JSON; named nodes by
   default, anonymous-token toggle; error nodes styled red; click → editor
   reveal; editor cursor move → nearest node highlight (debounced inverse
   sync).
3. **StatsBar** — parse time, node count, error count, file size, wasm load
   state.
4. **FileTabs / Sidebar** — workspace files: create/open/rename/delete, active
   file.
5. **WorkerClient** — promise map keyed by request id; debounced
   parse-on-change (300 ms); sequence counter discards stale results.
6. **ParseWorker** — protocol router; lazy wasm init; one parse at a time;
   returns `parse:error` on failure.
7. **WasmParser (Rust)** — `parse(source, language) -> JsValue` binding;
   iterative tree walker emitting AstNode JSON + stats.
8. **FileStore** — IndexedDB CRUD (files + workspace stores) on the main
   thread (files ≤ 2 MB; no jank; worker contract stays parse-only).

## 4. Data Model

### AstNode (JSON produced by the wasm crate)

```jsonc
{
  "type": "function_declaration",   // tree-sitter node kind
  "named": true,
  "fieldName": "name",              // field edge label, else null
  "error": false,                   // error / missing / extra nodes
  "start": { "row": 0, "column": 4, "byte": 4 },
  "end":   { "row": 5, "column": 1, "byte": 132 },
  "text": "fn main() {",            // leaf nodes only; truncated to 60 chars
  "children": [ /* AstNode[] */ ]
}
```

- Walker is **iterative** (explicit stack) — deep recursion on pathological
  inputs (e.g. 1 MB of nested parens) must not blow the wasm stack.
- `sourceHash` (FNV-1a of source) lets the UI skip redundant re-renders.

### ParseResult / Protocol

| Direction | Message | Payload |
| :--- | :--- | :--- |
| main → worker | `parse` | `{ id, language, source }` |
| main → worker | `ping` | `{ id }` |
| worker → main | `parse:result` | `{ id, language, sourceHash, ast, stats }` |
| worker → main | `parse:error` | `{ id, message }` |
| worker → main | `ready` | `{ module, bytesLoaded }` |

`stats = { parseMs, nodeCount, errorCount }`. Serialization: structured clone
(JSON) — strings are structured-cloneable and fast at v1 file sizes; the
optimization path (transfer source as `ArrayBuffer`) is documented in the
worker client, deferred.

### IndexedDB schema (v1, via `idb`)

- DB `code-lens-wasm` v1:
  - `files` — keyPath `path` (normalized, e.g. `src/main.ts`):
    `{ path, language, content, updatedAt }`
  - `workspace` — keyPath `id` (single doc `main`):
    `{ id, name, activePath, fileOrder: string[] }`

## 5. Key Design Decisions (ADRs)

### ADR-01: tree-sitter over swc / oxc
- **Options:** tree-sitter (language-agnostic), swc (Rust, JS/TS only), oxc
  (Rust, JS/TS only).
- **Chosen:** tree-sitter.
- **Rationale:** the product is an AST *visualizer*. tree-sitter exposes a
  uniform node taxonomy (named/anonymous), field names, and error recovery
  across languages; swc/oxc are compilation-oriented and JS/TS-only. v1
  languages: TypeScript (incl. TSX), Rust, JSON.
- **Caveat:** no semantic info (types, bindings) — acceptable; we visualize
  syntax trees, not IR.

### ADR-02: first-party wasm-bindgen crate over `web-tree-sitter` npm
- **Options:** (a) own crate: tree-sitter crates + wasm-bindgen glue;
  (b) official `web-tree-sitter` package + per-grammar `.wasm` files.
- **Chosen:** (a).
- **Rationale:** roadmap milestone 1 is explicitly "Rust-to-Wasm parser crate
  and JavaScript bindings"; we own the AST→JSON shape and stats.
- **Fallback:** if wasm32 compilation of the grammar crates hits blockers,
  pivot to (b) — still Rust-derived grammars, same worker architecture; only
  the `WasmParser` module changes.

### ADR-03: raw typed `postMessage` over Comlink
- **Options:** Comlink RPC, raw postMessage, BroadcastChannel.
- **Chosen:** raw postMessage with the 5-message protocol above.
- **Rationale:** one worker, five message types, promise map ≈ 40 lines;
  Comlink hides exactly the transfer semantics we want explicit.
  BroadcastChannel rejected (no multi-tab v1).

### ADR-04: Vite + React over Next.js
- **Options:** Vite SPA, Next.js App Router.
- **Chosen:** Vite.
- **Rationale:** Monaco, wasm and module workers are client-only concerns.
  Vite's `?worker` imports and asset handling are first-class; zero SSR
  surface (Monaco/wasm do not SSR). Next.js buys nothing for a purely
  client-side tool. Deploy: static build on Vercel.

### ADR-05: single-threaded wasm in v1; SharedArrayBuffer/rayon deferred
- **Options:** (a) single-threaded parse in worker; (b) rayon + shared memory
  (requires COOP/COEP cross-origin isolation).
- **Chosen:** (a).
- **Rationale:** tree-sitter parsing is µs–ms; even 1 MB files parse
  < 100 ms in the worker. SAB needs COOP/COEP headers, which complicate
  hosting and can break third-party resources; rayon only pays off on inputs
  we cap anyway (2 MB/file v1). Enablement path recorded in the phase plan —
  revisit only if profiling demands it.

### ADR-06: IndexedDB via `idb` over Dexie / raw API
- **Options:** raw IDB (~100 lines boilerplate), `idb` (~1.4 kB), Dexie
  (~50 kB+).
- **Chosen:** `idb`.
- **Rationale:** promise wrapper, tiny, standard. Dexie is overkill for two
  object stores; raw IDB is boilerplate.

### ADR-07: direct `monaco-editor` over `@monaco-editor/react`
- **Options:** wrapper package (defaults to CDN loader), direct ESM +
  custom hook.
- **Chosen:** direct local ESM with `editor.worker?worker` import.
- **Rationale:** local-first rules out the wrapper's CDN default; the
  `loader.config` workaround buys nothing over a ~40-line `useMonaco` hook.
  Also: no TS/JSON language workers in v1 (no IntelliSense; they are ~2 MB
  extra) — only `editor.worker` loads. Monaco chunk is dynamically imported
  when the editor mounts.

### ADR-08: zustand over Context / Redux
- **Options:** Context + useReducer, zustand (~1 kB), Redux Toolkit.
- **Chosen:** zustand.
- **Rationale:** cursor ↔ tree sync is high-frequency cross-cutting state;
  Context re-render churn handles it poorly. Redux is ceremony for three
  slices.

## 6. Performance Budgets

| Metric | Budget | How verified |
| :--- | :--- | :--- |
| Parse 1 MB source (worker) | < 100 ms | Playwright perf trace + worker-side timing |
| Main thread | zero parse work; UI batched at 60 fps | DevTools performance; 5 MB fixture soak |
| Parse round-trip overhead | < 16 ms beyond parse itself | workerClient timing |
| Wasm assets (3 grammars + glue) | ≤ 800 kB gzip | CI size gate on wasm-pack output |
| Monaco chunk | lazy-loaded, ≤ 4 MB raw | bundle analysis in Phase 5 |
| Lighthouse | perf ≥ 85, a11y ≥ 95 | Phase 5 audit |

## 7. Out of Scope (v1)

- Languages beyond TypeScript/TSX, Rust, JSON.
- IntelliSense, completions, semantic diagnostics (syntax errors only).
- Multi-tab sync, collaboration, accounts, backend, cloud sync.
- Shared-memory parallel parsing (ADR-05).
- Formatting / code actions / prettier.

## 8. Risks (summary — full table in the phase plan)

- wasm32 build issues with grammar crates → fallback `web-tree-sitter`
  (ADR-02).
- Vite ↔ wasm asset path quirks (dev vs build) → `public/` + `BASE_URL`
  pattern, verified by Phase 1 smoke test; fallback `vite-plugin-wasm`.
- Monaco bundle weight → lazy chunk, no language workers.
- IndexedDB quota/eviction → 2 MB/file cap, warn above 10 MB workspace.
- Version drift (wasm-pack, tree-sitter, monaco) → pin exact versions at
  Phase 1 install (lesson from the DCodeBook retro).

## 9. Testing Strategy

- **Rust (native):** AST shape (node counts, field names), error recovery on
  broken input, empty input, 1 MB input (< 100 ms).
- **Wasm bindings:** `wasm-pack test --node` — parse() round-trip, JSON
  validity.
- **Web (Vitest):** worker protocol against a fake worker, FileStore against
  `fake-indexeddb`, store slices, debounce/stale-drop logic.
- **E2E (Playwright):** load app → type code → AST renders → click node →
  editor cursor jumps → reload → files persist. Perf: 100 kB fixture parse
  < 100 ms asserted.
- **CI (GitHub Actions):** rust fmt/clippy/test + wasm build + size gate;
  node typecheck/lint/vitest; Playwright (Chromium); Vercel preview deploy.
