# CodeLens Wasm — Verified Dependency Matrix

```text
====================================================================================================
DOCUMENT METADATA
====================================================================================================
Document Version : 1.1.0
Date             : 2026-08-06
Author / Owner   : Chak
Status           : Verified (live registries + Context7 docs) + Phase 1 build outcomes
Verification     : npm registry API · crates.io API · Context7 (Vite 8 migration, monaco integrate-esm,
                   tree-sitter Rust API) · cargo check/clippy/test · wasm-pack build · browser smoke
Source Reference : IMPLEMENTATION_PLAN.md (§8) · technical-design.md (§5 ADRs)
====================================================================================================
```

---

## 1. JavaScript / Web Dependencies

| Package | Role | Latest stable (2026-08-06) | Pin | Compatibility notes |
| :--- | :--- | :--- | :--- | :--- |
| `react` / `react-dom` | UI framework | 19.2.8 | 19.2.8 | `@types/react` 19.2.18, `@types/react-dom` 19.2.4 (match major). |
| `vite` | Build tool | **8.2.0** | 8.2.0 | **Vite 8 = Rolldown + Oxc** (esbuild/Rollup replaced). Node `^20.19.0 \|\| >=22.12.0` — local node v22.14.0 ✓. `optimizeDeps.esbuildOptions` → `rolldownOptions` (we use neither). `build.commonjsOptions` is a no-op. |
| `@vitejs/plugin-react` | React fast-refresh | 6.0.5 | 6.0.5 | Peer `vite ^8.0.0` ✓. `@rolldown/plugin-babel` + `babel-plugin-react-compiler` peers are **optional** — not needed. |
| `typescript` | Type checking | 7.0.2 | **6.0.3** | ⚠ TS 7.0.2 (native compiler) is latest, but `typescript-eslint` 8.66.0 peers `typescript >=4.8.4 <6.1.0` → **pin 6.0.3** (newest supported). Upgrade when typescript-eslint ≥ 9 adds TS 7 support. |
| `monaco-editor` | Editor | 0.56.0 | 0.56.0 | Local ESM; `?worker` import pattern confirmed in upstream `integrate-esm.md`. No language workers per ADR-07. |
| `zustand` | State | 5.0.14 | 5.0.14 | Peer `react >=18` ✓; `immer` peer optional (not used). |
| `idb` | IndexedDB | 8.0.3 | 8.0.3 | ESM-only — fine with Vite 8. |
| `tailwindcss` + `@tailwindcss/vite` | Styling | 4.3.3 | 4.3.3 | **v4 resolved**: CSS-first (`@import "tailwindcss";`), Vite plugin form, no `tailwind.config.js`. Peer `vite ^5.2–^8` ✓. |
| `vitest` | Unit tests | 4.1.10 | 4.1.10 | Peer `vite ^6\|\|^7\|\|^8` ✓; node `^20\|\|^22\|\|>=24` ✓. |
| `@testing-library/react` + `@testing-library/dom` | DOM tests | 16.3.2 / 10.4.1 | 16.3.2 / 10.4.1 | ⚠ `@testing-library/dom ^10` is a **required** peer of RTL 16 — add both. |
| `jsdom` | Test env | 30.0.1 | 30.0.1 | Peer `jsdom: *` ✓; node ≥ 20 ✓. |
| `fake-indexeddb` | IDB tests | 6.2.5 | 6.2.5 | Works with `idb` 8. |
| `@playwright/test` | E2E | 1.62.1 | 1.62.1 | Node ≥ 20 ✓. |
| `eslint` | Lint | 10.8.0 | 10.8.0 | Flat config only. `typescript-eslint` 8.66 peers `eslint ^8.57\|\|^9\|\|^10` ✓. |
| `typescript-eslint` | TS linting | 8.66.0 | 8.66.0 | ⚠ peer `typescript <6.1.0` — drives the TS 6.0.3 pin above. |
| `vite-plugin-wasm` | Fallback only | 3.6.0 | 3.6.0 | Peer `vite ^2–^8` ✓. Install **only if** the `BASE_URL` wasm asset path breaks (ponytail: no speculative install). |

## 2. Rust Dependencies

| Crate | Role | Latest stable (2026-08-06) | Pin | Compatibility notes |
| :--- | :--- | :--- | :--- | :--- |
| `tree-sitter` | Parser runtime | 0.26.11 | 0.26.11 | ⚠ see Finding 1 — core is ahead of grammar crates. |
| `tree-sitter-typescript` | TS/TSX grammar | 0.23.2 | 0.23.2 | Declares `tree-sitter ^0.24` (transitive only — see Finding 1). |
| `tree-sitter-rust` | Rust grammar | 0.24.2 | 0.24.2 | Declares `tree-sitter ^0.25` (transitive only). |
| `tree-sitter-json` | JSON grammar | 0.24.8 | 0.24.8 | Declares `tree-sitter ^0.24` (transitive only). |
| `tree-sitter-language` | Shared `LanguageFn` | 0.1.7 | (transitive) | The unification crate that makes Finding 1 safe. **Vendored + patched since Phase 2** (see Finding 9). |
| `wasm-bindgen` | JS bindings | 0.2.126 | 0.2.126 | No extra features (serde-serialize dropped in Phase 1 — see Finding 7). wasm-pack 0.15.0 vendors its own wasm-bindgen toolchain (see Finding 4). |
| `js-sys` | Date/Reflect JS interop | 0.3.103 | 0.3 | Added in Phase 1 for `now_ms()` (js_sys::Date::now on wasm32 — std::time::Instant is UNIMPLEMENTED on wasm32-unknown-unknown). |
| `serde` / `serde_json` | JSON serialization | 1.0.229 / 1.0.151 | 1.0.229 / 1.0.151 | No constraints. |
| `wasm-bindgen-test` | Wasm-side tests | 0.3.76 | 0.3.76 | Dev-dep. ⚠ NOT versioned with wasm-bindgen (0.3.76 pairs with wasm-bindgen 0.2.126 via wasm-bindgen-test-shared 0.2.126). |
| `wasm-pack` (tool) | Build tool | 0.15.0 | 0.15.0 | `cargo install wasm-pack` (see Finding 6). ⚠ `--optimize` flag REMOVED in 0.15 — wasm-opt `-Oz` runs by default on release builds (Finding 8). |

## 3. Compatibility Findings & Resolutions

### Finding 1 — tree-sitter core/grammar line split (the one real issue)
`tree-sitter` core is at **0.26.11**, but the three grammar crates sit on
older, **mutually incompatible** lines: typescript 0.23.2 → `^0.24`, rust
0.24.2 → `^0.25`, json 0.24.8 → `^0.24`. **No single released core version
satisfies all three**, and upstream `main` branches match the releases (no
0.26 grammar releases pending as of 2026-08-06).

**Resolution**: keep core at 0.26.11 and grammars at their latest releases.
Since tree-sitter 0.23+, grammar crates expose `LANGUAGE` as a `LanguageFn`
from the shared **`tree-sitter-language` 0.1.7** crate, so each grammar
resolves its own older `tree-sitter` transitively while our crate uses
0.26.11. Interop is confirmed by the 0.26 docs pattern:
`parser.set_language(&tree_sitter_rust::LANGUAGE.into())`. The runtime is
ABI-backward-compatible (`LANGUAGE_VERSION` / `MIN_COMPATIBLE_LANGUAGE_VERSION`).

**Verify at Phase 1** (P1-T4): `cargo tree -d` will show multiple
`tree-sitter` versions — expected; the smoke test proves the mix works.
**Escalation path** (only if compile breaks): pin `tree-sitter` 0.24.x and
drop the Rust grammar for v1; revisit upstream releases at Phase 1 kickoff.

### Finding 2 — TypeScript 7.0.2 vs typescript-eslint
Latest TS is 7.0.2 (native compiler line), but typescript-eslint 8.66.0
peers `typescript <6.1.0`. **Pin `typescript` 6.0.3** — newest supported
stable. Revisit when typescript-eslint ≥ 9 supports TS 7.

### Finding 3 — Vite 8 is Rolldown/Oxc-based
esbuild and Rollup are gone. Nothing in our config uses `esbuildOptions`,
`commonjsOptions`, or Rollup-only plugins, so the migration is a no-op for
us; Monaco's `?worker` imports and `public/` wasm assets are unaffected.
`@vitejs/plugin-react` 6.0.5 peers `vite ^8` ✓.

### Finding 4 — wasm-pack 0.15.0 vendors wasm-bindgen
wasm-pack 0.15.0 no longer pins a `wasm-bindgen-cli` dependency (it
fetches its own binary via `binary-install`). No manual version alignment;
pin crate `wasm-bindgen` 0.2.126 and let the Phase 1 smoke test confirm the
glue.

### Finding 5 — @testing-library/react 16 requires @testing-library/dom
RTL 16.3.2 declares `@testing-library/dom ^10.0.0` as a hard peer — add
`@testing-library/dom` 10.4.1 alongside it.

### Finding 6 — Rust toolchain NOT installed on this machine (RESOLVED in Phase 1)
Verified 2026-08-06: node v22.14.0 ✓ (meets Vite 8's `>=22.12.0`),
pnpm 11.18.0 ✓, git ✓ — but **rustc/cargo/rustup/wasm-pack were absent**.
Phase 1 P1-T1 installed: `winget install Rustlang.Rustup` (rustup 1.29.0 →
rustc/cargo 1.97.1) → `rustup target add wasm32-unknown-unknown` →
`cargo install wasm-pack --locked` (0.15.0). ✅ All verified working.

⚠ **Windows wasm32 cross-compile prerequisites** (Linux CI does not need these):
- tree-sitter's C grammar sources compile via `cc` → requires **clang**
  (`winget install LLVM.LLVM`; binary at `C:\Program Files\LLVM\bin`, which
  must be prepended to PATH in build shells).
- Cross-preprocessing needs C headers (Windows has none for wasm32) →
  **wasi-sdk sysroot**: download `wasi-sdk-33.0-x86_64-windows.tar.gz`,
  extract (here: `C:\wasi-sdk\wasi-sdk-33.0-x86_64-windows`), then set
  persistent user env var:
  `CFLAGS_wasm32-unknown-unknown = -isystem <sysroot>\share\wasi-sysroot\include\wasm32-wasi`.
- Without these: `stdlib.h not found` (no sysroot) and `undefined symbol:
  iswspace/iswalpha` at link (no libc on wasm32-unknown-unknown — fixed with
  wasm32-gated `#[unsafe(no_mangle)] extern "C"` stubs in lib.rs).
- CI (GitHub Actions ubuntu) needs none of this — the Phase 5 CI spec is unchanged.

### Finding 7 — serde-wasm-bindgen 0.6.5 BROKEN on wasm32 (dropped)
`serde_wasm_bindgen::to_value` **silently returns `{}` for any value** on
wasm32-unknown-unknown with wasm-bindgen 0.2.126 (diagnosed with probe
exports: `debug_parse_string` returned full valid JSON while
`debug_to_value_probe` returned `{}`). `from_value` was likewise unusable.
**Resolution**: the `parse` binding returns the result as a JSON **string**
(serde_json `to_string` — string transport proven reliable); the worker
`JSON.parse`s it. `serde-wasm-bindgen` removed from Cargo.toml.
Revisit only if a future upgrade fixes to_value on wasm32.

### Finding 8 — wasm-pack 0.15 removed `--optimize`
wasm-pack 0.15.0 rejects `--optimize` ("unexpected argument"); wasm-opt
`-Oz` runs automatically on release builds (confirmed in build output:
"Optimizing wasm binaries with wasm-opt..."). All docs/scripts updated —
do not pass the flag.

### Finding 9 — tree-sitter-language 0.1.7 wasm shim broken on wasm32 (VENDORED + PATCHED)
`tree-sitter-language` 0.1.7's `wasm/src/stdlib.c` bump allocator heap is
NEVER initialized on wasm32-unknown-unknown: `reset_heap()` is only called
from `wasm_store.c`, which is entirely `TREE_SITTER_FEATURE_WASM`-guarded
(wasmtime) and not compiled in wasm-bindgen builds. Consequences found in
Phase 2: (a) NULL-heap corruption at ~11k nodes; (b) any fix that lets the
C bump grow linear memory collides with Rust's dlmalloc (two top-growers,
sequence-dependent corruption); (c) forwarding to dlmalloc is correct but
was quadratic (first-fit scanning). **Final fix: crate vendored to
`crates/code_lens_wasm/vendor/tree-sitter-language/` (`[patch.crates-io]`),
stdlib.c rewritten as an O(1) size-class-bin allocator** (malloc rounds to
a power-of-two class, head-pop bins, realloc in-place when class unchanged,
free retains in C; dlmalloc only for empty-bin growth). Full narrative in
PHASE_2 §9.1. Also note: wasm-pack 0.15's default wasm-opt level is `-O`
(not `-Oz`).

## 4. Pinning Policy

- `package.json`: `.npmrc` with `save-exact=true`; commit `pnpm-lock.yaml`.
- `Cargo.toml`: exact versions for `wasm-bindgen` and the `tree-sitter`
  line (no caret); commit `Cargo.lock`.
- CI: `pnpm install --frozen-lockfile` + `cargo build --locked`.
- Re-verify this matrix at Phase 1 kickoff and again at Phase 5 (versions
  move fast — tree-sitter grammar releases and typescript-eslint TS 7
  support are the two to watch).
