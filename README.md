# CodeLens Wasm

In-browser developer tool to parse source code into visual ASTs via Rust and WebAssembly, entirely off the main thread.

## Features

- **Monaco Code Editor**: Full-featured code editing experience with syntax highlighting and theme support.
- **Real-Time AST Visualizer**: Interactive hierarchical visualization of tree-sitter concrete syntax trees.
- **Multi-Language Tree-Sitter Grammars**: Supports TypeScript, TSX, Rust, and JSON grammar parsing.
- **Web Worker Offloading**: AST parsing executes inside dedicated Web Workers to ensure 60fps main-thread responsiveness.
- **IndexedDB Local Workspace**: Persistent client-side project and file storage using IndexedDB.
- **Offline & No-CDN Design**: Self-contained web application requiring zero external CDN dependencies at runtime.

## Tech Stack

| Component | Tech / Library |
| --- | --- |
| **Frontend Framework** | React 19 + Vite 8 (Rolldown engine) |
| **WASM Parser** | Rust + Tree-Sitter + `wasm-bindgen` |
| **Code Editor** | Monaco Editor (direct ESM, lazy dynamic import — ADR-07) |
| **Concurrency** | Dedicated Web Worker |
| **Client Storage** | IndexedDB via `idb` |
| **State Management** | Zustand |
| **Styling** | Tailwind CSS v4 |
| **Testing** | Vitest (Unit) + Playwright (E2E) |

## Available Scripts

| Command | Description |
| --- | --- |
| `pnpm dev` | Starts local Vite development server. |
| `pnpm build` | Compiles TypeScript (`tsc -b`) and bundles production assets via Vite. |
| `pnpm build:wasm` | Builds Rust crate into WebAssembly (`wasm-pack build --target web --release`) into `public/wasm`. |
| `pnpm preview` | Serves production build locally for verification on port 4173. |
| `pnpm typecheck` | Validates TypeScript types across application code and tests. |
| `pnpm lint` | Runs ESLint to check code formatting and code quality rules. |
| `pnpm test` | Runs Vitest unit tests in jsdom environment. |
| `pnpm test:e2e` | Runs Playwright end-to-end user journey tests in headless Chromium. |

## Local Setup

### Prerequisites
- **Node.js**: Node version `>=20.19` or `>=22.12`.
- **pnpm**: Version `11.18.0`.
- **Rust**: Version `1.97+` with the `wasm32-unknown-unknown` target installed (`rustup target add wasm32-unknown-unknown`).
- **wasm-pack**: Version `0.15` (`cargo install wasm-pack --locked`).
- **WASI SDK (Windows / Linux C headers)**: LLVM clang and WASI SDK sysroot headers (e.g. `wasi-sdk-33.0`) with `CFLAGS_wasm32-unknown-unknown` set to `-isystem <path-to-wasi-sysroot>/include/wasm32-wasi`.

### Quick Start

```bash
# 1. Install Node dependencies
pnpm install

# 2. Compile WebAssembly module
pnpm build:wasm

# 3. Start local development server
pnpm dev
```

## Architecture & Worker Offloading

Parsing operations run completely off the main thread inside a dedicated Web Worker (`src/workers/parser.worker.ts`).
- The WebAssembly binary is loaded inside the worker via URL import (`new URL('/wasm/code_lens_wasm_bg.wasm', import.meta.url)`).
- Raw source code is transferred to the worker, parsed via tree-sitter Rust bindings, and serialized into JSON strings.
- High-frequency parse requests are debounced on the UI thread to guarantee steady frame rates and responsive editing.

### Documentation Map
- [Technical Design](docs/technical-design.md) — System architecture, worker flow, and data pipelines.
- [Software Requirements Spec (SRS)](docs/srs.md) — Functional requirements, NFR budgets, and constraints.
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) — Phase breakdown, architectural decisions, and task checklists.
- [Dependency Matrix](docs/DEPENDENCY_MATRIX.md) — Package dependency audit and rationale.
- [Phase Documentation](docs/phases/) — Historical execution logs and phase retrospectives.

## CI & Deployment

- **GitHub Actions**: Automated CI workflow (`.github/workflows/ci.yml`) runs on push and pull requests, executing Rust check/clippy/wasm size gate, pnpm build, Vitest, bundle size check, and Playwright E2E suites.
- **Vercel Deployment**: Configured via `vercel.json`. Automated deployments require `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` repository secrets.

## Known Limitations & Budgets

- **File Size Cap**: Hard limit of 2 MB per file for AST parsing.
- **Workspace Storage**: 10 MB total workspace warning threshold.
- **AST Depth Limit**: Maximum recursion depth of ~2,000 nodes due to `JSON.parse` stack limits.
- **Parse Performance Budget**: `< 100 ms` parse latency target for typical 1 MB source files.
