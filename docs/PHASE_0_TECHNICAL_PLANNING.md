# Phase 0 — Technical Planning & Design

> Part of the CodeLens Wasm project docs (Project 5 on
> [PROJECTS_ROADMAP.md](../../PROJECTS_ROADMAP.md)).
> Companion doc: [technical-design.md](./technical-design.md).
> Precedes Phase 1 — Rust-to-Wasm parser crate.

## Overview / Objective

Phase 0 produces the design and the executable plan for CodeLens Wasm — an
in-browser code analyzer that parses source into visual ASTs using Rust
compiled to WebAssembly, runs parsing off the main thread in a Web Worker,
embeds Monaco Editor, and stores the workspace locally in IndexedDB.

Deliverables of this phase:

- `docs/technical-design.md` — architecture, stack, data model, worker
  protocol, ADRs, performance budgets, out-of-scope list.
- `docs/PHASE_0_TECHNICAL_PLANNING.md` — this document: phase-by-phase task
  breakdown, acceptance criteria, risks, dependencies.
- `PROJECTS_ROADMAP.md` updated — Project 5 status moved from Idea to
  Planning.

This phase intentionally contains **no code**. Implementation starts in
Phase 1.

## Decisions locked in Phase 0

| # | Decision | One-liner |
| :--- | :--- | :--- |
| ADR-01 | tree-sitter over swc/oxc | Language-agnostic, uniform node taxonomy for a visualizer. |
| ADR-02 | first-party wasm-bindgen crate | Own the Rust→Wasm glue per roadmap M1; `web-tree-sitter` is the documented fallback. |
| ADR-03 | raw typed `postMessage` | 5-message protocol, ~40-line promise map; no Comlink. |
| ADR-04 | Vite + React over Next.js | Client-only tool; Monaco/wasm/workers don't SSR. |
| ADR-05 | single-threaded wasm v1 | SAB/rayon deferred; COOP/COEP enablement path recorded. |
| ADR-06 | IndexedDB via `idb` | Tiny promise wrapper; Dexie is overkill. |
| ADR-07 | direct `monaco-editor` | Local ESM, no CDN; no language workers; lazy chunk. |
| ADR-08 | zustand over Context/Redux | 1 kB store for high-frequency sync state. |

Rationale for each: see [technical-design.md](./technical-design.md) §5.

## Prerequisites (for Phase 1)

- Rust stable toolchain via rustup, plus the wasm target:
  `rustup target add wasm32-unknown-unknown`
- wasm-pack: `cargo install wasm-pack` (or via cargo-binstall)
- Node.js ≥ 20.19 or ≥ 22.12 and pnpm (Vite 8 engine requirement)
- Google Chrome (worker + wasm dev/test); no backend, no database, no API
  keys anywhere in this project

## Detailed Tasks

### Phase 1 — Rust-to-Wasm parser crate & JS bindings (roadmap M1)

1.1. Create `crates/code_lens_wasm` (`cargo new --lib`, `crate-type =
["cdylib", "rlib"]`); add deps: `tree-sitter`, `tree-sitter-typescript`,
`tree-sitter-rust`, `tree-sitter-json`, `wasm-bindgen` (feature
`serde-serialize`), `serde`, `serde_json`.
1.2. Implement `parse(source: &str, language: &str) -> JsValue`: language
registry (`ts`/`tsx` → tree-sitter-typescript, `rust`, `json`), **iterative**
tree walker emitting AstNode JSON (type, named, fieldName, error, start/end
row+column+byte, leaf text truncated to 60 chars), stats (nodeCount,
errorCount, parseMs), FNV-1a sourceHash.
1.3. Native `cargo test`: AST shape, field names, error recovery on broken
input, empty input, 1 MB input < 100 ms.
1.4. Build script `pnpm build:wasm` → `wasm-pack build crates/code_lens_wasm
--target web --release --out-dir ../../public/wasm --out-name code_lens_wasm`.
CI size gate: ≤ 800 kB gzip total.
1.5. Smoke page in the Vite app: worker loads the wasm module, parses one
sample per language, prints node counts. Verify in `vite dev` **and**
`vite build && vite preview` (asset-path check — see notes).
1.6. Pin exact versions (Cargo.toml, package.json) — DCodeBook retro lesson.

**Acceptance:** fmt/clippy clean; cargo test green; wasm-pack build green;
smoke page parses TS, Rust and JSON in the browser; wasm loads in prod
preview; size gate passes.

### Phase 2 — Web Worker bridge (roadmap M2)

2.1. `src/worker/parseWorker.ts` — module worker: protocol router
(parse/ping), lazy wasm init, one parse at a time, `ready` broadcast.
2.2. `src/lib/workerClient.ts` — promise map by request id; debounced
parse-on-change (300 ms); sequence counter drops stale results.
2.3. Stats plumbing into the store (parseMs, nodeCount, errorCount, status:
idle/parsing/error); StatsBar skeleton.
2.4. Vitest: worker protocol against a fake worker; debounce + stale-drop
with fake timers.

**Acceptance:** typing triggers worker parses; UI thread never blocks (5 MB
fixture soak, main thread responsive); stale results dropped; parse errors
surfaced, app stays usable.

### Phase 3 — Monaco Editor + AST visualizer (roadmap M3)

3.1. Add `monaco-editor`; `useMonaco` hook with
`monaco-editor/esm/vs/editor/editor.worker?worker` (no language workers, no
`@monaco-editor/react` — ADR-07); dark theme; editor chunk dynamically
imported.
3.2. EditorPane + FileTabs: file → model, language mapping
(typescript/rust/json).
3.3. AstTree: collapsible tree from AstNode JSON; named/anonymous toggle;
error nodes styled; click → `revealRangeInCenter` + `deltaDecorations`;
inverse sync (debounced cursor events → nearest node highlight).
3.4. StatsBar; empty/loading/error states; a11y on the tree (roving
tabindex, aria-expanded).
3.5. Playwright: type → AST updates; click AST node → editor cursor moves;
Network tab shows no CDN requests for Monaco.

**Acceptance:** two-pane app usable end-to-end; sync works both directions;
Monaco served locally; tree keyboard-navigable.

### Phase 4 — IndexedDB local workspace (roadmap M4)

4.1. `idb` schema v1 (files + workspace stores, see design §4); FileStore
module; auto-save debounced 500 ms; create/rename/delete file; active file +
tab order persisted.
4.2. Reload-persistence e2e; size cap 2 MB/file with a friendly error; warn
above 10 MB workspace.

**Acceptance:** files survive reload; no data loss on close; IDB write
< 5 ms on a 1 MB file.

### Phase 5 — Polish, CI & ship (roadmap M5)

5.1. GitHub Actions: Rust job (fmt, clippy, test, wasm-pack build, size
gate) + web job (typecheck, lint, vitest, Playwright) + Vercel preview
deploy.
5.2. Lighthouse audit (perf ≥ 85, a11y ≥ 95); bundle analysis vs budgets
(design §6); README (setup, architecture, demo).
5.3. Deploy to Vercel (static); roadmap status → Shipped; write
`docs/RETRO.md` and add a Retro Log row.

**Acceptance:** CI green on main; Lighthouse budgets met; live URL;
roadmap updated; retro written.

## Technical Implementation Notes

### wasm-pack ↔ Vite integration (the known gotcha)

- Output to `public/wasm/` with `--target web`. The worker loads the glue
  module by URL:
  `const mod = await import(/* @vite-ignore */ import.meta.env.BASE_URL + 'wasm/code_lens_wasm.js')`.
  wasm-pack's web-target `init()` resolves `code_lens_wasm_bg.wasm`
  relative to the glue module's URL — the public-dir layout satisfies that in
  dev, preview, and subpath deployments.
- If import/asset friction appears (Vite version drift), fallbacks:
  `vite-plugin-wasm` + `vite-plugin-top-level-await`, or `--target bundler`
  with a `?url` wasm import. Verify once in Phase 1.6 before building on it.
- Size: wasm-pack 0.15 release builds run wasm-opt -Oz by default (`--optimize` flag removed in 0.15).

### Monaco worker wiring (Vite)

```ts
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";

self.MonacoEnvironment = { getWorker: () => new editorWorker() };
```

Only `editor.worker` loads (no TS/JSON language workers — ADR-07). This
module is imported only from the lazily-loaded editor pane chunk.

### Shared-memory enablement path (deferred — ADR-05)

If rayon is ever needed, this is the full change: add to `vercel.json` and
mirror in dev middleware:

```json
{
  "headers": [{
    "source": "/(.*)",
    "headers": [
      { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
      { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
    ]
  }]
}
```

COEP breaks third-party resources; do **not** enable until profiling demands
it. `vercel.json` ships empty in v1.

## File / Folder Breakdown (target layout)

```
CodeLens Wasm/
├─ docs/
│  ├─ technical-design.md          # this phase (done)
│  └─ PHASE_0_TECHNICAL_PLANNING.md # this phase (done)
├─ crates/code_lens_wasm/          # Phase 1 — Rust parser crate
│  ├─ Cargo.toml
│  └─ src/lib.rs
├─ public/wasm/                    # wasm-pack output (build artifact)
├─ src/
│  ├─ main.tsx · App.tsx · styles/
│  ├─ worker/parseWorker.ts        # Phase 2
│  ├─ lib/workerClient.ts          # Phase 2
│  ├─ lib/ast.ts                   # AstNode types + tree utils
│  ├─ lib/monaco.ts · useMonaco    # Phase 3
│  ├─ lib/fileStore.ts             # Phase 4 (idb)
│  ├─ store/                       # zustand slices (files · parse · ui)
│  └─ components/                  # EditorPane · AstTree · StatsBar · FileTabs · Sidebar
├─ tests/e2e/                      # Playwright
├─ .github/workflows/ci.yml        # Phase 5
├─ vercel.json                     # empty headers placeholder
├─ package.json · vite.config.ts · tsconfig.json   # Tailwind v4: CSS-first, no config file
└─ README.md                       # Phase 5
```

## Acceptance Criteria — Phase 0 (this phase)

- [x] `docs/technical-design.md` exists: stack, architecture, data model,
      worker protocol, ADRs, performance budgets, out-of-scope.
- [x] `docs/PHASE_0_TECHNICAL_PLANNING.md` exists: Phases 1–5 with tasks,
      acceptance criteria, risks, dependencies.
- [x] Roadmap: Project 5 status Idea → Planning.
- [x] Every roadmap milestone (M1–M5) maps to exactly one phase; stack table
      == ADRs == phase tasks; no invented dependencies.

## Verification — Phase 0

- Cross-check (above) passes; the roadmap row for Project 5 reads
  Planning.
- No code was written by design; there is nothing to run.

## Risks & Mitigations

| Risk | Mitigation |
| :--- | :--- |
| wasm32 build blockers in grammar crates | Pivot to `web-tree-sitter` (ADR-02 fallback) — same worker architecture, isolated in `WasmParser`; decide by end of Phase 1.2. |
| Vite ↔ wasm asset path quirks (dev vs build) | `public/` + `BASE_URL` pattern; smoke-tested in Phase 1.5; fallback `vite-plugin-wasm`. |
| Monaco bundle weight | Lazy chunk, editor-only worker, no language services. |
| Deep-nesting stack overflow in wasm | Iterative AST walker (explicit stack) from day one. |
| IDB quota/eviction | 2 MB/file cap, warn > 10 MB workspace; content is plain text. |
| Tool version drift | Pin exact versions at Phase 1 install (DCodeBook retro lesson); CI size gate catches regressions. |
| Shared-memory expectations in roadmap | Handled by ADR-05: transferable buffers + off-main-thread satisfy "multi-threading"; SAB documented as deferred. |
| Scope creep (IntelliSense, more languages) | Out-of-scope list in design §7; new languages are a grammar-registry one-liner later. |

## Dependencies & Packages

**Cargo (Phase 1):** `tree-sitter`, `tree-sitter-typescript`,
`tree-sitter-rust`, `tree-sitter-json`, `wasm-bindgen` (with
`serde-serialize`), `serde`, `serde_json`. Toolchain: rustup
(`wasm32-unknown-unknown`), wasm-pack, wasm-opt (via wasm-pack).

**npm:** `react`, `react-dom`, `monaco-editor`, `idb`, `zustand`,
`tailwindcss`. Dev: `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`,
`@testing-library/react`, `@testing-library/dom`, `@testing-library/user-event`, `jsdom`,
`fake-indexeddb`, `@playwright/test`, `eslint`.

**Deliberately not used:** `@monaco-editor/react`, Comlink, Dexie, Redux,
swc/oxc, `web-tree-sitter` (fallback only), `vite-plugin-wasm` (fallback
only).

## Cross-references

- Roadmap card: [PROJECTS_ROADMAP.md](../../PROJECTS_ROADMAP.md) — Project 5
- Design: [technical-design.md](./technical-design.md)
- Requirements: [srs.md](./srs.md)
- Master plan + per-phase docs: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) and [`phases/`](./phases/)
- Next: Phase 1 doc (created during Phase 1 implementation)
