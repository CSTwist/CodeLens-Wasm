# Phase 1: Rust-to-Wasm Parser Crate & JS Bindings

```text
====================================================================================================
PHASE METADATA
====================================================================================================
Phase Number     : Phase 1 of 5
Title            : Rust-to-Wasm Parser Crate & JS Bindings
Version          : 1.1.0
Date             : 2026-08-06
Author / Owner   : Chak
Status           : Completed (2026-08-07)
Source Reference : technical-design.md (§2, §4, §5 ADR-01/02/04/05) · srs.md (FR-02, NFR-04)
Prerequisites    : Node ≥ 20.19 or ≥ 22.12 + pnpm, rustup + wasm32-unknown-unknown, wasm-pack, Chrome
Est. Effort      : ~1.5 days (part-time)
Implementation   : All tasks P1-T1..T8 done; 7/7 native + 1/1 wasm tests green; smoke page
Outcome          : parses in dev AND preview; wasm gzip 615.7 kB ≤ 800 kB (see §9 notes)
====================================================================================================
```

---

## 1. Objective & Scope

### 1.1 Objective
Establish the toolchain and scaffold the Vite + React + TypeScript app,
then author the first-party Rust crate `crates/code_lens_wasm` that wraps
tree-sitter (TypeScript/TSX, Rust, JSON grammars) with a `wasm-bindgen`
`parse()` binding, an iterative AST walker emitting the AstNode JSON shape
(design §4), and parse stats. Wire the wasm-pack build pipeline into
`public/wasm/` with a CI size gate (≤ 800 kB gzip, NFR-04), and prove the
module loads and parses in a browser worker in both dev and prod preview
(verifying the Vite ↔ wasm asset path — the phase-plan "known gotcha").

### 1.2 In-Scope
- Toolchain verification: rustup, `wasm32-unknown-unknown`, wasm-pack, pnpm.
- Manual scaffold of the Vite React app (`package.json`, `vite.config.ts`,
  `tsconfig.json`, `index.html`, Tailwind, ESLint, strict TS).
- `crates/code_lens_wasm` crate with wasm-bindgen glue and language
  registry (`ts`/`tsx`, `rust`, `json`).
- Iterative AST walker → AstNode JSON + stats (parseMs, nodeCount,
  errorCount) + FNV-1a sourceHash.
- Native `cargo test` suite (AST shape, error recovery, empty input, 1 MB
  input < 100 ms).
- `wasm-pack build --target web` → `public/wasm/`; `build:wasm` script;
  `scripts/check-wasm-size.mjs` size gate.
- Browser smoke page (worker loads module, parses one sample per language).
- Exact version pinning (Cargo.toml + package.json).

### 1.3 Out-of-Scope
- Worker protocol / promise client (deferred to Phase 2).
- Monaco Editor integration (deferred to Phase 3).
- IndexedDB workspace (deferred to Phase 4).
- CI workflows, Lighthouse, deploy (deferred to Phase 5).

---

## 2. Dependencies

- **System Prerequisites**: Windows host with PowerShell 7+ (`pwsh`), Node
  ≥ 20.19 or ≥ 22.12 (Vite 8), pnpm, rustup, wasm-pack, Chrome.
- **Design Document References**:
  - §2 Tech Stack (Rust/wasm-bindgen/wasm-pack choices).
  - §4 Data Model (AstNode JSON schema, stats fields, sourceHash).
  - §5 ADR-01 (tree-sitter), ADR-02 (first-party crate, `web-tree-sitter`
    fallback), ADR-04 (Vite over Next.js), ADR-05 (no SAB in v1).
  - §6 Performance budgets (wasm ≤ 800 kB gzip).
- **SRS**: FR-02 (language selector registry), NFR-04 (wasm size budget).

---

## 3. Task List

### **P1-T1: Toolchain Verification**
- **Description**: Verify and install the Phase 1 toolchain prerequisites. ⚠ As of 2026-08-06 the Rust toolchain is NOT installed on this machine (node v22.14.0, pnpm 11.18.0, git present) — see `docs/DEPENDENCY_MATRIX.md` Finding 6.
- **Files Created/Modified**: N/A (system setup).
- **Implementation Details**:
  - `node --version` ≥ 20.19/22.12; `pnpm --version` — both ✓.
  - Install Rust: `winget install Rustlang.Rustup` (or rustup-init.exe), then `rustup default stable`.
  - `rustup target add wasm32-unknown-unknown`.
  - `cargo install wasm-pack` (v0.15.0 — vendors its own wasm-bindgen toolchain; wasm-opt -Oz runs by default on release builds, no `--optimize` flag in 0.15); verify `wasm-pack --version`.
- **Acceptance Criteria**:
  - `wasm-pack --version` prints 0.15.x; `rustup target list --installed`
    contains `wasm32-unknown-unknown`; `cargo --version` works.

### **P1-T2: Vite React App Scaffold (manual)**
- **Description**: Create the web app shell by hand — no `create-vite`
  boilerplate cleanup.
- **Files Created/Modified**:
  - `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`
  - `src/main.tsx`, `src/App.tsx`, `src/styles/index.css`
  - Tailwind **v4.3.3** resolved: use the `@tailwindcss/vite` plugin form
    (peer `vite ^5.2–^8` ✓); CSS-first config (`@import "tailwindcss";` in
    `src/styles/index.css`); no `tailwind.config.js` (v4).
  - `eslint.config.js`
- **Implementation Details**:
  - React 19, TypeScript strict, `@vitejs/plugin-react`.
  - pnpm scripts: `dev`, `build` (`tsc -b && vite build`), `preview`,
    `typecheck` (`tsc --noEmit`), `lint`, `build:wasm`, `test`.
  - Create `public/` dir (wasm output lands here in P1-T6).
- **Acceptance Criteria**:
  - `pnpm typecheck` and `pnpm lint` pass; `pnpm dev` serves a blank app at
    http://localhost:5173.

### **P1-T3: Rust Crate Scaffold**
- **Description**: Create the `crates/code_lens_wasm` library crate.
- **Files Created/Modified**:
  - `crates/code_lens_wasm/Cargo.toml`
  - `crates/code_lens_wasm/src/lib.rs`
- **Implementation Details**:
  - `cargo new --lib crates/code_lens_wasm`; set
    `[lib] crate-type = ["cdylib", "rlib"]` (cdylib for wasm, rlib for
    native tests).
  - Dependencies (verified 2026-08-06 — full matrix in
    `docs/DEPENDENCY_MATRIX.md`): `tree-sitter` 0.26.11,
    `tree-sitter-typescript` 0.23.2, `tree-sitter-rust` 0.24.2,
    `tree-sitter-json` 0.24.8, `wasm-bindgen` 0.2.126 (features
    `serde-serialize`), `serde` 1.0.229, `serde_json` 1.0.151.
  - **tree-sitter multi-version note** (matrix Finding 1): grammar crates
    sit on 0.24/0.25 lines while core is 0.26.11 — expected and safe:
    `LANGUAGE` is a `LanguageFn` from the shared `tree-sitter-language`
    0.1.7 crate, so use `parser.set_language(&LANGUAGE.into())` (0.26 API).
    Run `cargo tree -d` in P1-T4 to confirm the split resolves; escalate
    per matrix §3 if it doesn't.
  - wasm-pack 0.15.0 vendors its own wasm-bindgen toolchain — no manual
    wasm-bindgen-cli alignment needed (matrix Finding 4).
- **Acceptance Criteria**:
  - `cargo check --target wasm32-unknown-unknown` compiles the empty crate.

### **P1-T4: `parse()` Binding + Iterative AST Walker**
- **Description**: Implement the parser binding and AstNode JSON exporter.
- **Files Created/Modified**:
  - `crates/code_lens_wasm/src/lib.rs`
  - `crates/code_lens_wasm/src/ast_json.rs` (walker; module split optional
    but keeps lib.rs small)
- **Implementation Details**:
  - `#[wasm_bindgen] pub fn parse(source: &str, language: &str) -> JsValue`
    → language registry: `ts`/`tsx` → `tree_sitter_typescript::LANGUAGE_TS`
    (+ TSX variant), `rust`, `json`; unknown language → `Err` string.
  - **Iterative** walker (explicit `Vec<(Node, depth)>` stack — no
    recursion; deep nesting must not blow the wasm stack).
  - Emit AstNode JSON per design §4: `type`, `named`, `fieldName` (via
    `field_name_for_child`), `error` (`is_error`/`is_missing`), `start`/
    `end` {row, column, byte}, `text` on leaf nodes truncated to 60 chars,
    `children[]`.
  - Stats: `parseMs` (measured around `parser.parse`), `nodeCount`,
    `errorCount`; FNV-1a `sourceHash` of the source.
  - Build the JSON as `serde_json::Value` → `JsValue` via wasm-bindgen
    `serde-serialize` (`JsValue::from_serde`).
- **Acceptance Criteria**:
  - `cargo test` (native) green for the P1-T5 suite; wasm build succeeds
    (P1-T6); `parse` returns well-formed JSON for all three languages.

### **P1-T5: Native Rust Test Suite**
- **Description**: Unit tests for the walker and error recovery.
- **Files Created/Modified**:
  - `crates/code_lens_wasm/src/lib.rs` (`#[cfg(test)]` module) or
    `tests/` integration tests.
- **Implementation Details** — cover:
  - AST shape: node count + a known `type` and `fieldName` for a small
    sample per language.
  - Error recovery: truncated/broken input yields `error` nodes, not a
    panic.
  - Empty input parses to a non-empty tree (tree-sitter root) with
    `nodeCount ≥ 1`.
  - 1 MB fixture: `parseMs` budget < 100 ms on native (informational;
    strict budget is the browser NFR-01, checked in Phase 2).
  - Deep-nesting fixture (e.g. 10k nested parens) does not overflow.
- **Acceptance Criteria**:
  - `cargo fmt --check` and `cargo clippy -- -D warnings` clean;
    `cargo test` 100% green.

### **P1-T6: wasm-pack Build Pipeline + Size Gate**
- **Description**: Build the wasm module into `public/wasm/` and enforce
  the size budget.
- **Files Created/Modified**:
  - `package.json` (add `"build:wasm"` script)
  - `scripts/check-wasm-size.mjs`
- **Implementation Details**:
  - From `crates/code_lens_wasm`:
    `wasm-pack build --target web --release --out-dir ../../public/wasm --out-name code_lens_wasm`
  - `build:wasm` runs the wasm-pack build then the size gate script
    (gzip-compress `public/wasm/*.wasm` in memory, assert total ≤ 800 kB).
  - Verify `public/wasm/code_lens_wasm.js` (glue) + `_bg.wasm` exist.
- **Acceptance Criteria**:
  - `pnpm build:wasm` succeeds; size gate passes (≤ 800 kB gzip); output
    artifacts present in `public/wasm/`.

### **P1-T7: Browser Smoke Page (dev + preview)**
- **Description**: Prove the module loads and parses inside a worker in
  both dev and production-preview modes.
- **Files Created/Modified**:
  - `src/worker/smokeWorker.ts` (temporary; superseded by Phase 2's
    parseWorker)
  - `src/App.tsx` (temporary smoke UI: language picker + parse button +
    node count)
- **Implementation Details**:
  - Worker loads glue by URL:
    `const mod = await import(/* @vite-ignore */ import.meta.env.BASE_URL + 'wasm/code_lens_wasm.js')`;
    `await mod.default()` init; `mod.parse(source, 'ts')` etc.
  - Smoke UI parses one sample per language (TS, Rust, JSON) and prints
    `nodeCount` / `errorCount`.
  - Verify in `pnpm dev` **and** `pnpm build && pnpm preview`.
  - If asset path breaks (dev vs build drift), apply fallback
    `vite-plugin-wasm` per the phase plan notes — but only then.
- **Acceptance Criteria**:
  - Smoke page parses all three languages in both dev and preview;
    DevTools shows the wasm fetched from the app origin (no CDN).

### **P1-T8: Version Pinning**
- **Description**: Lock exact versions to prevent drift (DCodeBook retro
  lesson). Pin per `docs/DEPENDENCY_MATRIX.md` (verified 2026-08-06).
- **Files Created/Modified**: `Cargo.toml` (exact versions), `package.json`
  (`save-exact` or committed lockfile), `.npmrc` (`save-exact=true`),
  `Cargo.lock` committed.
- **Implementation Details**:
  - JS: `.npmrc` `save-exact=true`; exact pins for `typescript` **6.0.3**
    (not 7.0.2 — typescript-eslint peer ceiling, matrix Finding 2),
    `vite` 8.2.0, `monaco-editor` 0.56.0, `idb` 8.0.3, `tailwindcss`
    + `@tailwindcss/vite` 4.3.3, `vitest` 4.1.10, `eslint` 10.8.0,
    `typescript-eslint` 8.66.0; add `@testing-library/dom` 10.4.1 alongside
    RTL 16.3.2 (required peer, matrix Finding 5).
  - Rust: exact `wasm-bindgen` 0.2.126 + `tree-sitter` line per matrix.

---

## 4. Command Cheatsheet (PowerShell)

```powershell
# Working location
Set-Location "C:\Users\Chak\Desktop\projects\CodeLens Wasm"

# 1. Toolchain
node --version
rustup target add wasm32-unknown-unknown
cargo install wasm-pack

# 2. App scaffold (manual — create files per P1-T2)
pnpm install

# 3. Rust crate
cargo new --lib crates/code_lens_wasm
cargo check --target wasm32-unknown-unknown
cargo fmt --check
cargo clippy -- -D warnings
cargo test

# 4. wasm build + size gate
Set-Location crates/code_lens_wasm
wasm-pack build --target web --release --out-dir ../../public/wasm --out-name code_lens_wasm
Set-Location ../..
node scripts/check-wasm-size.mjs        # pnpm build:wasm runs both

# 5. Smoke verification (both modes!)
pnpm dev          # http://localhost:5173
pnpm build
pnpm preview      # prod asset paths
```

---

## 5. Testing Plan

### 5.1 Rust (native, `cargo test`)
- `parse_ts_sample_returns_expected_node_counts`
- `parse_rust_sample_has_field_names` (e.g. `function_declaration` →
  `name`)
- `parse_json_error_recovery_marks_error_nodes`
- `parse_empty_source_returns_root_with_children`
- `parse_deeply_nested_input_does_not_overflow`
- `parse_unknown_language_returns_error`
- `parse_one_mb_fixture_completes_budget` (informational on native)

### 5.2 Wasm binding (`wasm-pack test --node`)
- `binding_parse_returns_valid_json_roundtrip` — parse TS sample, assert
  JSON parses back with `nodeCount > 0`.

### 5.3 Manual browser smoke
- Dev mode: parse TS/Rust/JSON samples → node counts printed.
- Preview mode: same checks; Network tab shows wasm from app origin only.

---

## 6. Definition of Done Checklist

- [x] Toolchain verified (wasm-pack 0.15.0, wasm32 target, pnpm, Node v22.14.0).
- [x] Vite React app scaffolded; `pnpm typecheck` + `pnpm lint` pass.
- [x] `crates/code_lens_wasm` builds for `wasm32-unknown-unknown`.
- [x] `parse()` returns AstNode JSON per design §4 for ts/tsx/rust/json.
- [x] Iterative walker — deep-nesting test passes.
- [x] `cargo fmt --check`, `cargo clippy -D warnings`, `cargo test` green (7/7).
- [x] `pnpm build:wasm` green; size gate ≤ 800 kB gzip (615.7 kB).
- [x] Smoke page parses all 3 languages in dev AND preview (CDP-verified).
- [x] Critical versions pinned (Cargo.toml exact, `.npmrc save-exact`).

---

## 7. Phase Risks & Mitigations

| Risk Description | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| wasm32 build blockers in tree-sitter grammar crates. | High | Fallback `web-tree-sitter` (ADR-02): same worker architecture, swap only inside the wasm-loading module. Decision deadline: end of P1-T5. |
| Vite dev vs prod wasm asset path mismatch. | Medium | `BASE_URL`-based absolute import (P1-T7 smoke in both modes); fallback `vite-plugin-wasm`. |
| wasm-bindgen/wasm-pack version mismatch. | Low | wasm-pack 0.15.0 vendors its own wasm-bindgen toolchain — no manual cli alignment (matrix Finding 4); pin crate at 0.2.126 exact; smoke test confirms. |
| Bundle size creep from grammar wasm. | Medium | Size-gate script in `build:wasm` + CI (Phase 5). |

---

## 8. Handoff to Next Phase

Before transitioning to Phase 2:
- Git working directory contains the Vite app shell, `crates/code_lens_wasm`,
  `public/wasm/` build artifacts, and `scripts/check-wasm-size.mjs`.
- `pnpm build:wasm` + smoke page verified in dev and preview.
- Phase metadata status set to `Completed`; roadmap status → 🔵 In Progress.

---

## 9. Phase 1 Implementation Notes (learned on the job — read before Phase 2)

1. **Binding returns a JSON string, not an object.** `serde-wasm-bindgen`
   0.6.5's `to_value` silently returns `{}` on wasm32-unknown-unknown with
   wasm-bindgen 0.2.126 (probe-verified). `parse()` therefore returns
   `Result<String, JsValue>` (serde_json `to_string`); the worker
   `JSON.parse`s it. Do NOT reintroduce object transport without re-probing.
2. **Vite 8 dev rejects dynamic imports of `/public` files** when the URL is
   statically analyzable — `@vite-ignore` does NOT help because
   `import.meta.env.BASE_URL` folds to a literal. The worker uses
   `self.location.origin + import.meta.env.BASE_URL + 'wasm/code_lens_wasm.js'`
   (non-analyzable runtime expression) — works in dev AND preview.
3. **`std::time::Instant` is unimplemented on wasm32-unknown-unknown** —
   parseMs uses `js_sys::Date::now()` on wasm32, `SystemTime` natively
   (cfg-gated `now_ms()`).
4. **Windows wasm32 cross-compile needs clang + WASI sysroot headers**
   (LLVM 22.1.8 via winget; wasi-sdk 33 sysroot; persistent
   `CFLAGS_wasm32-unknown-unknown=-isystem ...\include\wasm32-wasi`), and
   libc-wide-char stubs (`iswspace`/`iswalpha`) are required to link the
   rust/typescript scanners. Full detail: DEPENDENCY_MATRIX Finding 6.
5. **wasm-pack 0.15.0 removed `--optimize`** — wasm-opt `-Oz` is automatic
   on release. Final artifact: 615.7 kB gzip (budget 800 kB).
6. **Preview pitfall**: `dist/` only contains `public/wasm/` if `pnpm build`
   runs AFTER `wasm-pack build` — `build:wasm` runs first in `build`.
7. wasm-bindgen-test is 0.3.76 (NOT 0.2.126 — they version independently;
   `=0.2.126` does not exist for it).
