# CodeLens Wasm — Software Requirements Specification (SRS)

- Status: Draft (Phase 0 deliverable)
- Date: 2026-08-06

---

## 1. Introduction

### 1.1 Purpose
This Software Requirements Specification (SRS) establishes the formal
functional, non-functional, interface, and data requirements for
**CodeLens Wasm**, an in-browser code analyzer that parses source code into
visual ASTs using Rust compiled to WebAssembly. It is the authoritative
"what" baseline; the technical-design document is the "how".

### 1.2 Scope
**What CodeLens Wasm is.** A client-only, single-user web tool: a Monaco
editor pane on the left, a collapsible AST tree on the right, a stats bar,
and an IndexedDB-backed local workspace with file tabs. Parsing runs in a
dedicated Web Worker via a first-party Rust/wasm-bindgen crate wrapping
tree-sitter (TypeScript/TSX, Rust, JSON grammars).

**In Scope (v1 MVP).**
- Rust-to-Wasm parser crate with `parse(source, language)` binding.
- Off-main-thread parsing via a dedicated module worker; typed 5-message
  `postMessage` protocol.
- Monaco Editor (local ESM bundle, dark theme, no CDN, no language services).
- AST tree visualization with named/anonymous toggle and error nodes.
- Bidirectional node ↔ editor synchronization (click-to-reveal,
  cursor-to-highlight).
- Parse stats bar (parse time, node count, error count, wasm load state).
- Local workspace: create/open/rename/delete files, tabs, auto-save,
  persistence across reloads (IndexedDB via `idb`).
- Syntax-error surfacing (tree-sitter `error`/`missing` nodes) — syntax
  only, no semantic diagnostics.

**Out of Scope / Non-Goals (v1 MVP).**
- Languages beyond TypeScript/TSX, Rust, JSON.
- IntelliSense, completions, semantic diagnostics, formatting/code actions.
- Multi-tab sync, collaboration, accounts, backend, cloud sync.
- Shared-memory parallel parsing (SAB/rayon — deferred, ADR-05).

### 1.3 Definitions, Acronyms & Abbreviations
| Term | Definition |
| :--- | :--- |
| **AST** | Abstract Syntax Tree — hierarchical node structure of parsed source. |
| **tree-sitter** | Incremental parser framework with per-language grammars (Rust crates). |
| **wasm** | WebAssembly — the compiled module produced from the Rust crate. |
| **Worker** | Dedicated module Web Worker running the wasm parse off the main thread. |
| **IDB** | IndexedDB — browser storage for the local workspace. |
| **SAB** | SharedArrayBuffer — required for shared-memory parallelism; deferred (ADR-05). |
| **Named node** | tree-sitter node with a named kind (vs. anonymous tokens like `{`, `;`). |

### 1.4 References
| Ref | Document | Path |
| :--- | :--- | :--- |
| [ROADMAP] | Project 5 card | [`PROJECTS_ROADMAP.md`](../../PROJECTS_ROADMAP.md) |
| [TECH] | Technical Design Document | [`technical-design.md`](./technical-design.md) |
| [PLAN] | Phase 0 Plan (Phases 1–5) | [`PHASE_0_TECHNICAL_PLANNING.md`](./PHASE_0_TECHNICAL_PLANNING.md) |

### 1.5 Document Overview
- **§2 Overall Description:** product perspective, functions, user classes,
  environment, constraints.
- **§3 Specific Requirements:** FR-xx, NFR-xx, UI/interaction spec, data
  requirements.
- **§4 Traceability Matrix:** requirement IDs → phases → verification.
- **§5 Appendices:** open risks and post-MVP ideas.

---

## 2. Overall Description

### 2.1 Product Perspective
Standalone, single-user, desktop-first browser application. No backend, no
accounts, no runtime network dependency: the app and all its assets
(Monaco, wasm, grammars) are served statically and the workspace lives in
the user's own IndexedDB. Deployed as a static build to Vercel; CI via
GitHub Actions.

### 2.2 Product Functions
1. **Parse:** typed code → tree-sitter AST (off main thread) → JSON.
2. **Visualize:** collapsible AST tree with error marking and
   named/anonymous filtering.
3. **Synchronize:** AST node ↔ editor range highlight, both directions.
4. **Workspace:** file CRUD, tabs, auto-save, reload persistence.
5. **Report:** parse time / node count / error count / wasm state.

### 2.3 User Classes
Single class: a developer analyzing or studying code in-browser (self,
portfolio audience, interview demo). No roles, no auth.

### 2.4 Operating Environment
- Desktop-first browsers: latest two major versions of Chrome, Edge,
  Firefox, Safari.
- Requires Web Workers, WebAssembly, IndexedDB (all baseline).
- Works fully offline after initial load (no CDN assets — NFR-07).

### 2.5 Constraints
- File size cap 2 MB per file (parse budget + IDB quota sanity).
- One parse at a time in the worker; stale results dropped by sequence
  number.
- Grammar set fixed at TS/TSX, Rust, JSON for v1 (registry makes additions
  a one-liner later).

---

## 3. Specific Requirements

### 3.1 External Interfaces
- **Monaco Editor** (local ESM, `editor.worker` only, `?worker` import).
- **Web Worker API** — dedicated module worker; protocol per [TECH] §4.
- **IndexedDB** via `idb` — `files` and `workspace` stores per [TECH] §4.
- **Wasm module** — wasm-pack `--target web` output in `public/wasm/`,
  loaded by URL with `BASE_URL` (see [PLAN] implementation notes).
- No server APIs, no third-party network calls.

### 3.2 Functional Requirements

| ID | Requirement |
| :--- | :--- |
| FR-01 | Editing code triggers a debounced (300 ms) worker parse for the active file's language. |
| FR-02 | The language selector supports TypeScript/TSX, Rust, JSON; editor model language and parser grammar stay in sync. |
| FR-03 | The AST tree renders the parsed JSON: collapsible nodes, named nodes shown by default, anonymous-token toggle. |
| FR-04 | tree-sitter error/missing nodes are visually marked in both tree and editor. |
| FR-05 | Clicking an AST node reveals the corresponding editor range (Monaco `revealRangeInCenter`) and adds a highlight decoration. |
| FR-06 | Moving the editor cursor/selection highlights the nearest enclosing named node in the tree (debounced inverse sync). |
| FR-07 | The stats bar shows parse time, node count, error count, file size, and wasm module load state. |
| FR-08 | Files can be created, opened, renamed, and deleted; the active file and tab order are persisted. |
| FR-09 | File content auto-saves to IndexedDB (debounced 500 ms) and survives reload. |
| FR-10 | Parse failures surface in the stats bar without breaking the app; stale parse results are discarded. |
| FR-11 | Files above 2 MB are rejected with a clear message. |
| FR-12 | The app runs fully offline after initial load (no CDN-hosted Monaco or other runtime fetches). |

### 3.3 Non-Functional Requirements

| ID | Requirement |
| :--- | :--- |
| NFR-01 | Parsing 1 MB of source completes in < 100 ms inside the worker. |
| NFR-02 | The main thread never blocks on parsing; UI stays responsive during a 5 MB fixture soak. |
| NFR-03 | Worker round-trip overhead is < 16 ms beyond parse time itself. |
| NFR-04 | Wasm assets (3 grammars + glue) ≤ 800 kB gzip total; Monaco loads as a lazy chunk (≤ 4 MB raw). |
| NFR-05 | Lighthouse: performance ≥ 85, accessibility ≥ 95. |
| NFR-06 | The AST tree is fully keyboard-operable (roving tabindex, `aria-expanded`), focus is visible, and Monaco's built-in a11y is preserved. |
| NFR-07 | No user data leaves the browser; no analytics or telemetry. |
| NFR-08 | Repeated parses of a 1 MB fixture show no unbounded heap growth (soak check in CI). |

### 3.4 UI Layout & Interaction Spec
- **Layout:** sidebar (file list) · editor pane (Monaco, ~60% width) · AST
  pane (tree, ~40%) · bottom stats bar. Dark theme.
- **States:** empty workspace (welcome + "new file"), parsing (subtle
  indicator only — no blocking), error (stats bar message; prior AST stays
  visible), large-file rejection (toast/banner).
- **Interactions:** node click → editor reveal; editor cursor move → tree
  highlight; anonymous-toggle switch; collapse/expand per node; file tabs
  with dirty-state dot; rename/delete via context menu or hover actions.
- **A11y:** tree uses `role="tree"`/`treeitem` with roving tabindex;
  stats bar values announced on change (aria-live="polite").

### 3.5 Data Requirements
AstNode JSON schema, ParseResult/protocol messages, and IndexedDB schema are
defined in [TECH] §4 and are binding here by reference.

---

## 4. Traceability Matrix

| Requirement | Delivery Phase | Verification |
| :--- | :--- | :--- |
| FR-01, FR-02 | Phase 1 (smoke) → Phase 2 (worker) | wasm-pack node tests; Vitest (debounce/stale-drop) |
| FR-03–FR-06 | Phase 3 | Playwright (type → AST → click → cursor jumps); a11y pass |
| FR-07 | Phase 2 (stats plumbing) → Phase 3 (UI) | Vitest store tests; Playwright |
| FR-08, FR-09 | Phase 4 | Playwright reload-persistence e2e |
| FR-10 | Phase 2 | Vitest (fake worker, error paths) |
| FR-11, FR-12 | Phase 4 / Phase 3 | Playwright; Network-tab assertion (no CDN) |
| NFR-01–03, 08 | Phase 2 (soak) → Phase 5 (audit) | Playwright perf trace; CI soak |
| NFR-04 | Phase 1 (size gate) → Phase 5 (bundle analysis) | CI size gate; rollup analysis |
| NFR-05 | Phase 5 | Lighthouse CI |
| NFR-06 | Phase 3 | Playwright keyboard walk; axe/manual a11y |
| NFR-07 | Phase 3 | Network-tab assertion (no outbound requests) |

---

## 5. Appendices

### 5.1 Open Risks
Full table in [PLAN] (wasm32 build blockers, Vite↔wasm asset paths, Monaco
bundle weight, IDB quota, version drift, SAB deferral). No open decisions
beyond those recorded there.

### 5.2 Post-MVP Ideas
- Additional grammars (Python, Go, SQL — grammar-registry one-liners).
- Shared-memory parallel parsing (SAB/rayon) — requires COOP/COEP; gated on
  profiling per ADR-05.
- AST-to-source export (JSON download), share links (would add a backend).
- Language services / IntelliSense (deliberately out of v1 scope).
