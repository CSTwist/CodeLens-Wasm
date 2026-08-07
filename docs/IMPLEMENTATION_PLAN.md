# CodeLens Wasm — Implementation Master Plan

```text
====================================================================================================
PROJECT METADATA
====================================================================================================
Document Version : 1.0.0
Date             : 2026-08-06
Author / Owner   : Chak
Status           : Approved-for-Implementation
Source Reference : PHASE_0_TECHNICAL_PLANNING.md · technical-design.md (v1.0.0) · srs.md (v1.0.0)
Target Platform  : Web (React 19 + Vite, Rust → Wasm, Web Worker, Monaco, IndexedDB)
Repository Root  : C:\Users\Chak\Desktop\projects\CodeLens Wasm
====================================================================================================
```

---

## 1. Executive Summary

**CodeLens Wasm** is an in-browser code analyzer that parses source code into
visual ASTs using Rust compiled to WebAssembly. Parsing runs off the main
thread in a dedicated Web Worker via a first-party `wasm-bindgen` crate
wrapping tree-sitter (TypeScript/TSX, Rust, JSON grammars); Monaco Editor
provides the editing pane; a collapsible AST tree provides bidirectional
node ↔ range synchronization; and an IndexedDB-backed local workspace keeps
files on-device with no backend. This master plan defines a 5-phase
sequential roadmap from zero code to production delivery on Vercel, with
GitHub Actions CI. Each phase doc (`docs/phases/PHASE_{n}_*.md`) carries
concrete `P{n}-T{m}` tasks, PowerShell commands, acceptance criteria, and a
Definition of Done checklist, strictly aligned with the technical design
(ADRs), the SRS (FR/NFR IDs), and the roadmap milestones (M1–M5).

---

## 2. Phase Overview Table

| Phase | Title | Roadmap Milestones | Core Scope | Key Deliverables | Exit Criteria | Est. Effort (Part-Time) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Phase 1** | Rust-to-Wasm Parser Crate & JS Bindings | M1 | Toolchain (rustup, wasm-pack), Vite React app scaffold, `crates/code_lens_wasm` with tree-sitter (TS/TSX, Rust, JSON), wasm-bindgen `parse()` glue, iterative AST walker → AstNode JSON + stats, `public/wasm/` build pipeline + size gate, browser smoke page. | `crates/code_lens_wasm/` (Cargo.toml + lib.rs), `public/wasm/code_lens_wasm.js|.wasm`, Vite app skeleton, `build:wasm` script, `scripts/check-wasm-size.mjs`. | `cargo fmt/clippy/test` green; `wasm-pack build` green; total wasm ≤ 800 kB gzip; smoke page parses TS, Rust, JSON in dev **and** prod preview; versions pinned. | ~1.5 days |
| **Phase 2** | Web Worker Bridge | M2 | `parseWorker.ts` protocol router (parse/ping, lazy wasm init, one parse at a time), `workerClient.ts` promise map + 300 ms debounce + sequence stale-drop, shared `ast.ts` types, parse store slice, StatsBar skeleton. | `src/worker/parseWorker.ts`, `src/lib/workerClient.ts`, `src/lib/ast.ts`, zustand parse slice. | Vitest green (protocol, debounce, stale-drop, error paths); 5 MB soak leaves main thread responsive; parse errors surfaced without breaking UI. | ~1 day |
| **Phase 3** | Monaco Editor & AST Visualizer | M3 | Local `monaco-editor` ESM + `editor.worker?worker` + lazy chunk + dark theme (ADR-07); EditorPane + FileTabs + language mapping; AstTree (collapsible, named/anonymous toggle, error nodes); bidirectional sync (click→reveal, cursor→highlight); empty/loading/error states; tree a11y. | `lib/monaco.ts` + `useMonaco` hook, `EditorPane`, `AstTree`, `StatsBar`, decorations module. | Playwright e2e green (type → AST → click node → editor cursor jumps; Network tab: zero CDN requests); tree keyboard-operable; inverse sync verified. | ~2–3 days |
| **Phase 4** | IndexedDB Local Workspace | M4 | `idb` schema v1 (`files`, `workspace` stores), `fileStore.ts` CRUD, 500 ms debounced auto-save + dirty dot, tabs + active file persisted, 2 MB/file cap + 10 MB workspace warning. | `src/lib/fileStore.ts`, `code-lens-wasm` IDB v1. | Reload-persistence e2e green (no data loss on close); IDB write < 5 ms on 1 MB file; Vitest + `fake-indexeddb` green. | ~1 day |
| **Phase 5** | Polish, CI & Ship | M5 | GitHub Actions (Rust job: fmt/clippy/test/wasm-pack + size gate; web job: typecheck/lint/vitest/Playwright), Lighthouse audit (perf ≥ 85, a11y ≥ 95), bundle analysis vs budgets, README, Vercel static deploy, RETRO + roadmap 🟢. | `.github/workflows/ci.yml`, `README.md`, live URL, `docs/RETRO.md`. | CI green on main; Lighthouse budgets met; live deploy verified; roadmap status Shipped; retro written and logged. | ~1–1.5 days |

**Total Estimated Effort**: ~1.5–2 weeks (part-time execution).

---

## 3. Phase Dependency Diagram

```text
+-------------------------------------------------------------+
| Phase 1: Rust-to-Wasm Parser Crate & JS Bindings            |
| - Toolchain: rustup + wasm32-unknown-unknown, wasm-pack      |
| - Vite React app skeleton (manual scaffold)                  |
| - crates/code_lens_wasm: tree-sitter TS/Rust/JSON grammars   |
| - wasm-bindgen parse() glue + iterative AST walker + stats   |
| - public/wasm build pipeline + ≤800 kB gzip size gate        |
| - Browser smoke page (dev + preview)                         |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Phase 2: Web Worker Bridge                                  |
| - parseWorker.ts: protocol router, lazy wasm init           |
| - workerClient.ts: promise map, 300 ms debounce, stale-drop |
| - ast.ts shared types + zustand parse slice + StatsBar      |
| - Vitest (fake worker) + 5 MB main-thread soak              |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Phase 3: Monaco Editor & AST Visualizer                     |
| - monaco-editor local ESM, editor.worker only, lazy chunk   |
| - EditorPane + FileTabs + language mapping                  |
| - AstTree: collapsible, named/anonymous toggle, errors      |
| - Bidirectional sync: click→reveal, cursor→highlight        |
| - States + a11y + Playwright e2e                            |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Phase 4: IndexedDB Local Workspace                          |
| - idb schema v1 (files, workspace) + fileStore.ts           |
| - 500 ms auto-save + dirty dot, tabs persisted              |
| - File CRUD UI, 2 MB cap, 10 MB warning                     |
| - Vitest (fake-indexeddb) + reload e2e                      |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Phase 5: Polish, CI & Ship                                  |
| - GitHub Actions: Rust job + web job + size gate            |
| - Lighthouse + bundle analysis vs budgets                   |
| - README, Vercel static deploy                              |
| - RETRO.md + PROJECTS_ROADMAP.md → 🟢                       |
+-------------------------------------------------------------+
```

*Note on sequencing*: the phases are strictly sequential (P1 → P2 → P3 → P4 →
P5). Phase 2 depends on the wasm module from Phase 1; Phase 3 consumes the
worker bridge from Phase 2; Phase 4's workspace UI is built on the editor
surface from Phase 3; Phase 5 gates on everything prior. No phase may start
before the previous phase's Definition of Done checklist is complete.

---

## 4. Per-Phase Summary Descriptions

### Phase 1 — Rust-to-Wasm Parser Crate & JS Bindings
Phase 1 establishes the toolchain (rustup, `wasm32-unknown-unknown`
target, wasm-pack, pnpm) and scaffolds the Vite + React + TypeScript app
(manual scaffold — no `create-vite` boilerplate cleanup). The Rust crate
`crates/code_lens_wasm` is authored with `wasm-bindgen` glue exporting
`parse(source, language) -> JsValue`, a language registry (TS/TSX, Rust,
JSON via tree-sitter crates), an **iterative** AST walker emitting AstNode
JSON (type, named, fieldName, error, start/end row+column+byte, truncated
leaf text) plus stats (nodeCount, errorCount, parseMs) and an FNV-1a
sourceHash (design §4). Native `cargo test` covers AST shape and error
recovery. `wasm-pack build --target web` outputs to `public/wasm/`, and a
size-gate script enforces the ≤ 800 kB gzip budget (NFR-04). A browser
smoke page loads the module in a worker and parses one sample per language
in both dev and prod preview (verifies the Vite ↔ wasm asset path, the
known gotcha from the phase plan).

### Phase 2 — Web Worker Bridge
Phase 2 builds the off-main-thread pipeline per design §3/§4: a dedicated
module worker (`parseWorker.ts`) routing the 5-message protocol
(parse/ping/parse:result/parse:error/ready) with lazy wasm init and
single-parse-at-a-time semantics; a main-thread client (`workerClient.ts`)
with a promise map keyed by request id, 300 ms debounced parse-on-change
(FR-01), and a sequence counter that discards stale results (FR-10); shared
`ast.ts` types; a zustand parse slice (status, stats, result) with a
StatsBar skeleton (FR-07). Vitest covers protocol, debounce and stale-drop
against a fake worker; a 5 MB fixture soak verifies NFR-02 (main thread
never blocks).

### Phase 3 — Monaco Editor & AST Visualizer
Phase 3 delivers the two-pane experience per SRS §3.4: `monaco-editor`
installed as a local ESM bundle wired through `editor.worker?worker` (no
language workers, no `@monaco-editor/react`, lazy-loaded chunk — ADR-07,
NFR-04); EditorPane + FileTabs with language mapping; AstTree rendering
AstNode JSON as a collapsible tree with named/anonymous toggle and styled
error nodes (FR-03/FR-04); bidirectional sync — AST node click reveals and
decorates the editor range (FR-05), editor cursor moves highlight the
nearest enclosing named node (FR-06); empty/loading/error states and the
complete StatsBar; tree a11y (roving tabindex, `aria-expanded`, aria-live
stats — NFR-06). Playwright e2e asserts the full interaction loop and that
zero CDN requests occur (FR-12, NFR-07).

### Phase 4 — IndexedDB Local Workspace
Phase 4 implements local-first persistence per design §4: `idb` schema v1
(`files` keyed by normalized path; single `workspace` doc with active file
and tab order), `fileStore.ts` CRUD, 500 ms debounced auto-save with a
dirty-state dot (FR-09), file create/rename/delete and tab persistence
(FR-08), a 2 MB/file cap with a clear rejection message (FR-11) and a
> 10 MB workspace warning. Vitest exercises the store against
`fake-indexeddb`; Playwright verifies reload persistence (IDB write
< 5 ms on 1 MB — phase acceptance criterion).

### Phase 5 — Polish, CI & Ship
Phase 5 hardens and ships: GitHub Actions CI with a Rust job (fmt, clippy,
test, wasm-pack build, size gate) and a web job (typecheck, lint, Vitest,
Playwright e2e) plus Vercel preview deploys; Lighthouse audit (perf ≥ 85,
a11y ≥ 95 — NFR-05) and bundle analysis vs the design §6 budgets; project
README; static deploy to Vercel (empty `vercel.json` headers placeholder
per ADR-05); `docs/RETRO.md` and the roadmap status flipped to Shipped (🟢).

---

## 5. Cross-Phase Testing Strategy

Progressive automated verification across all phases:

```text
Phase 1: cargo fmt/clippy/test + wasm-pack build + size gate + browser smoke (dev & preview)
Phase 2: Vitest (protocol, debounce, stale-drop, error paths) + 5 MB main-thread soak
Phase 3: Playwright e2e (type → AST → click → cursor) + no-CDN assertion + a11y walk
Phase 4: Vitest (fake-indexeddb fileStore) + Playwright reload-persistence e2e
Phase 5: Full CI suite green + Lighthouse budgets + bundle analysis vs budgets
```

- **Rust tests**: `cargo test` (native) for AST shape/error recovery;
  `wasm-pack test --node` for the `parse()` binding round-trip.
- **Web unit**: Vitest + Testing Library (jsdom), `fake-indexeddb`.
- **E2E**: Playwright (Chromium) against `vite preview` (production build,
  so wasm asset paths match prod) via `webServer` config.
- **Perf**: Playwright trace + worker-side timing asserts 1 MB parse
  < 100 ms (NFR-01) and round-trip overhead < 16 ms (NFR-03); soak for
  unbounded heap growth (NFR-08).
- **Final Release Gate**: Phase 5 requires zero failing tests and met
  Lighthouse budgets before sign-off.

---

## 6. Project-Wide Definition of Done (DoD)

To declare CodeLens Wasm complete, every criterion must hold:

- [ ] All 5 roadmap milestones (M1–M5) fully satisfied per the phase docs.
- [ ] `cargo fmt` and `cargo clippy` clean; `cargo test` 100% green;
      `wasm-pack build` succeeds.
- [ ] Total wasm assets ≤ 800 kB gzip (size-gate script passes).
- [ ] `pnpm typecheck`, `pnpm lint`, Vitest and Playwright suites green.
- [ ] Design doc specifications (AstNode schema, worker protocol, IDB
      schema) verified 1:1 against implementation (checked at P5-T5
      close-out).
- [ ] Lighthouse performance ≥ 85 and accessibility ≥ 95 (NFR-05).
- [ ] No CDN requests at runtime; app works offline after load (FR-12).
- [ ] `docs/RETRO.md` completed; `PROJECTS_ROADMAP.md` updated to Shipped
      (🟢); Retro Log row added.

---

## 7. Progress Tracking & Milestone Updates

1. **Phase Kickoff**: update `PROJECTS_ROADMAP.md` — CodeLens Wasm status
   from Planning (🟡) to In Progress (🔵); log kickoff timestamp.
2. **Task Execution**: as `P{n}-T{m}` tasks complete, check the matching
   items in the phase doc's Definition of Done and testing sections.
3. **Phase Gate Completion**: run the phase doc's verification commands;
   confirm the DoD checklist; flip the phase metadata status to
   `Completed`.
    - ✅ **Phase 1 gate passed 2026-08-07** — DoD fully checked (PHASE_1 §6);
      PHASE_1 metadata → Completed; roadmap → 🔵 In Progress.
    - ✅ **Phase 2 gate passed 2026-08-07** — DoD fully checked (PHASE_2 §6);
      6/6 Vitest suites, 7/7 Rust tests, 1/1 wasm binding test, soak within
      scaled NFR bounds, dev+preview smokes PASS; PHASE_2 metadata →
      Completed. Wasm allocator investigation documented in PHASE_2 §9 and
      DEPENDENCY_MATRIX Finding 9.
    - ✅ **Phase 3 gate passed 2026-08-07** — DoD fully checked (PHASE_3 §6);
      12/12 Vitest, 5/5 Playwright (e2e vs production preview + real wasm
      worker), monaco lazy chunk 2,620.73 kB raw / 671.27 kB gzip (≤ 4 MB),
      zero CDN, keyboard tree walk, dev+preview smokes PASS; PHASE_3
      metadata → Completed.
    - ✅ **Phase 4 gate passed 2026-08-07** — DoD fully checked (PHASE_4 §6);
      18/18 Vitest across 7 files (incl. 1 MB IDB write benchmark < 50 ms CI
      bound), 8/8 Playwright (incl. reload-persistence scenarios),
      2 MB/10 MB guards live, dev+preview smokes PASS; PHASE_4
      metadata → Completed.
4. **Final Delivery (Phase 5 Gate)**: flip roadmap status to Shipped (🟢);
   commit and tag `v1.0.0-release`.

---

## 8. Prerequisites Checklist

Before Phase 1 execution, the host must satisfy:

- [ ] **OS**: Windows 10/11 with PowerShell 7+ (`pwsh`) — current env OK.
- [ ] **Node.js ≥ 20.19 or ≥ 22.12** and **pnpm** (local: node v22.14.0, pnpm 11.18.0 — ✓ verified 2026-08-06).
- [x] **Rust toolchain** via rustup, with `wasm32-unknown-unknown` target
      added. ✅ Installed in P1-T1 (2026-08-07): rustup 1.29.0, rustc/cargo
      1.97.1, target present.
- [x] **wasm-pack** installed (`cargo install wasm-pack --locked` v0.15.0 —
      vendors its own wasm-bindgen toolchain). ✅ Installed in P1-T1.
- [x] **Windows wasm32 C cross-compile deps** (host-only — not needed on CI):
      LLVM/clang 22.1.8 (winget), wasi-sdk 33 sysroot headers, persistent
      `CFLAGS_wasm32-unknown-unknown` user env var (matrix Finding 6).
- [ ] **Google Chrome** (worker + wasm dev/test).
- [ ] No backend, database, or API keys required at any point.

### 8.1 Verified Dependency Matrix (2026-08-06)

All versions verified against the npm registry, crates.io API, and Context7
docs on 2026-08-06. Full table with compatibility notes:
**`docs/DEPENDENCY_MATRIX.md`**. Highlights:

- Pin `typescript` **6.0.3** (latest is 7.0.2 but typescript-eslint 8.66
  peers `<6.1.0`); pin `vite` 8.2.0 + `@vitejs/plugin-react` 6.0.5 +
  `monaco-editor` 0.56.0 + `idb` 8.0.3 + `tailwindcss`/`@tailwindcss/vite`
  4.3.3 (v4 CSS-first, plugin form).
- tree-sitter core 0.26.11 + grammar crates at their own latest releases
  (typescript 0.23.2, rust 0.24.2, json 0.24.8) — grammar crates sit on
  0.24/0.25 lines; interop via shared `tree-sitter-language` 0.1.7 and
  `set_language(&LANGUAGE.into())`. Verify with `cargo tree -d` in P1.
- Add `@testing-library/dom` 10.4.1 (required peer of RTL 16).
- wasm-pack 0.15.0 vendors wasm-bindgen — pin crate `wasm-bindgen` 0.2.126.

---

## 9. Risk Watch-List Per Phase

| Phase | Top Identified Risk | Impact | Mitigation Strategy |
| :--- | :--- | :--- | :--- |
| **Phase 1** | wasm32 build blockers in tree-sitter grammar crates. | High | Pivot to `web-tree-sitter` fallback (ADR-02) — same worker architecture, isolated in `WasmParser`; decision by end of P1-T5. |
| **Phase 1** | Vite ↔ wasm asset path drift (dev vs build). | Medium | `public/` + `BASE_URL` pattern; smoke test both modes in P1-T7; fallback `vite-plugin-wasm`. |
| **Phase 2** | Huge-file parse flooding / stale results racing. | Medium | 2 MB cap (FR-11), 300 ms debounce, sequence stale-drop, one parse at a time. |
| **Phase 3** | Monaco bundle weight / worker wiring mistakes. | Medium | Lazy chunk, editor worker only (ADR-07); Network-tab assertion in e2e. |
| **Phase 4** | IndexedDB quota eviction / data loss on close. | Medium | 2 MB/file cap, 10 MB workspace warning, 500 ms auto-save, reload e2e. |
| **Phase 5** | CI flakiness (wasm under headless Chromium) / Lighthouse variance. | Medium | Pin versions; Playwright against `vite preview`; Lighthouse CI thresholds with retries. |

---

## 10. Document Map

| Document | Path | Status |
| :--- | :--- | :--- |
| Technical Design (ADRs, protocol, schemas, budgets) | `docs/technical-design.md` | ✅ Phase 0 |
| Requirements (FR/NFR, UI spec) | `docs/srs.md` | ✅ Phase 0 |
| Phase 0 Planning (risks, deps, wasm↔Vite notes) | `docs/PHASE_0_TECHNICAL_PLANNING.md` | ✅ Phase 0 |
| **This master plan** | `docs/IMPLEMENTATION_PLAN.md` | ✅ Phase 0 |
| Phase 1 — Rust-to-Wasm Parser Crate | `docs/phases/PHASE_1_RUST_TO_WASM_PARSER_CRATE.md` | ✅ Phase 0 (planned) |
| Phase 2 — Web Worker Bridge | `docs/phases/PHASE_2_WEB_WORKER_BRIDGE.md` | ✅ Phase 0 (planned) |
| Phase 3 — Monaco Editor & AST Visualizer | `docs/phases/PHASE_3_MONACO_AND_AST_VISUALIZER.md` | ✅ Phase 0 (planned) |
| Phase 4 — IndexedDB Local Workspace | `docs/phases/PHASE_4_INDEXEDDB_LOCAL_WORKSPACE.md` | ✅ Phase 0 (planned) |
| Phase 5 — Polish, CI & Ship | `docs/phases/PHASE_5_POLISH_CI_AND_SHIP.md` | ✅ Phase 0 (planned) |
