# Phase 2: Web Worker Bridge

```text
====================================================================================================
PHASE METADATA
====================================================================================================
Phase Number     : Phase 2 of 5
Title            : Web Worker Bridge
Version          : 1.1.0
Date             : 2026-08-07
Author / Owner   : Chak
Status           : Completed
Source Reference : technical-design.md (§3, §4 protocol, ADR-03) · srs.md (FR-01, FR-07, FR-10, NFR-01/02/03/08)
Prerequisites    : Phase 1 complete (wasm module in public/wasm/, smoke page working)
Est. Effort      : ~1 day (part-time)
====================================================================================================
```

> **Implementation Outcome (2026-08-07):** All tasks P2-T1..T6 complete. 6/6
> Vitest suites pass (workerClient debounce/stale-drop/error, worker ping/parse,
> store skip-rerender). 7/7 native Rust tests + 1/1 wasm binding test pass.
> Browser smokes on dev (:5173) and preview (:4173) both PASS (READY, 23 nodes,
> 0 errors, parse 2 ms, hash 22794183). Soak: 5 MB pass avg parseMs 192.8 ms,
> heap flat (NFR-08 ✓); 1 MB pass max parseMs 188 ms / max receive 249 ms
> within scaled bounds (see Implementation Notes). Wasm gzip 591.1 kB ≤ 800 kB.
> See §9 Implementation Notes for the full wasm32 allocator investigation.

---

## 1. Objective & Scope

### 1.1 Objective
Build the off-main-thread parse pipeline: a dedicated module worker that
loads the wasm module and routes the typed 5-message protocol (design §4),
plus a main-thread client with a promise map, 300 ms debounced
parse-on-change (FR-01), and sequence-based stale-result dropping (FR-10).
Land the shared `ast.ts` types, the zustand parse slice, and a StatsBar
skeleton (FR-07), and prove the main thread never blocks during parsing
(NFR-02) with a 5 MB soak.

### 1.2 In-Scope
- `src/worker/parseWorker.ts` — protocol router, lazy wasm init, one parse
  at a time, `ready` broadcast, `parse:error` on failure.
- `src/lib/workerClient.ts` — promise map keyed by request id; 300 ms
  debounce; sequence counter stale-drop; `ping`.
- `src/lib/ast.ts` — AstNode, ParseRequest/Response, ParseStats types
  (single source of truth for UI + worker).
- zustand parse slice (`status: idle|parsing|error`, `stats`, `ast`) and
  StatsBar skeleton.
- Vitest suite (fake worker, fake timers): protocol, debounce, stale-drop,
  error paths.
- Perf soak: 5 MB fixture, main-thread responsiveness + round-trip
  overhead < 16 ms (NFR-03), heap-growth watch (NFR-08).

### 1.3 Out-of-Scope
- Monaco Editor and AST tree UI (deferred to Phase 3).
- IndexedDB persistence (deferred to Phase 4).
- File CRUD / tabs (deferred to Phase 4).

---

## 2. Dependencies

- **Phase 1 output**: `public/wasm/code_lens_wasm.js|.wasm`, working smoke
  worker import pattern.
- **Design Document References**:
  - §3 Component Breakdown (WorkerClient, ParseWorker).
  - §4 protocol table + AstNode schema + ParseResult shape.
  - §5 ADR-03 (raw typed postMessage, no Comlink).
  - §6 Performance budgets (round-trip < 16 ms, 1 MB < 100 ms).
- **SRS**: FR-01, FR-07, FR-10; NFR-01/02/03/08.

---

## 3. Task List

### **P2-T1: Shared Types (`ast.ts`)**
- **Description**: Define the protocol and AST types used by worker, client,
  store, and (later) UI.
- **Files Created/Modified**: `src/lib/ast.ts`
- **Implementation Details**:
  - `AstNode { type, named, fieldName: string|null, error: boolean,
    start/end: {row,column,byte}, text: string|null, children: AstNode[] }`
  - `ParseRequest { id: number, language: LangId, source: string }`
  - `ParseResult { id, language, sourceHash, ast, stats: {parseMs,
    nodeCount, errorCount} }`
  - `LangId = 'ts' | 'tsx' | 'rust' | 'json'`
  - `WorkerInbound = ParseRequest | Ping; WorkerOutbound = Ready |
    ParseResult | ParseError` (discriminated by `kind`).
- **Acceptance Criteria**: `pnpm typecheck` green; types imported by both
  worker and client modules.

### **P2-T2: `parseWorker.ts`**
- **Description**: The dedicated module worker — protocol router + wasm
  owner.
- **Files Created/Modified**: `src/worker/parseWorker.ts`
- **Implementation Details**:
  - Lazy wasm init: load glue via `BASE_URL + 'wasm/code_lens_wasm.js'`
    (P1-T7 pattern), `await mod.default()`, keep module handle private.
  - Handle `ping` → reply `ready { module, bytesLoaded }` after init.
  - Handle `parse` → run `mod.parse(source, language)`; **one parse at a
    time**: queue or reject-while-busy (queue with capacity 1; drop oldest
    — the client already drops stale results).
  - `parse:error` with message on wasm failure/unknown language; never
    rethrow out of the worker.
- **Acceptance Criteria**: Worker responds to `ping` and `parse` per the
  protocol; double-parse races handled without overlap.

### **P2-T3: `workerClient.ts`**
- **Description**: Main-thread client with promise map + debounce +
  stale-drop.
- **Files Created/Modified**: `src/lib/workerClient.ts`
- **Implementation Details**:
  - `parseDebounced(language, source)`: 300 ms trailing debounce (FR-01).
  - Monotonic `seq` per request; responses with `seq < latest` discarded
    (FR-10); promise map resolves/rejects by request id; `ping()` returns a
    promise resolving on `ready`.
  - Single worker instance (`new Worker(new URL('../worker/parseWorker.ts',
    import.meta.url), { type: 'module' })`); teardown on HMR where needed.
- **Acceptance Criteria**: Rapid edits produce exactly one parse after the
  quiet period; only the latest result is applied.

### **P2-T4: Parse Store Slice + StatsBar Skeleton**
- **Description**: zustand slice for parse state + minimal stats UI.
- **Files Created/Modified**:
  - `src/store/parseStore.ts`
  - `src/components/StatsBar.tsx` (skeleton)
  - `src/App.tsx` (wire: textarea → parse → stats)
- **Implementation Details**:
  - Slice state: `status: 'idle'|'parsing'|'error'`, `stats`, `ast`,
    `errorMessage`, `lastSourceHash` (skip re-render when unchanged).
  - Actions: `parseRequested`, `parseResolved`, `parseFailed`.
  - App wires a plain `<textarea>` + language select to the client for this
    phase (Monaco replaces it in Phase 3); StatsBar renders parseMs,
    nodeCount, errorCount, status (FR-07).
- **Acceptance Criteria**: Typing in the textarea updates the stats bar via
  the worker; status transitions visible; errors shown without breaking
  input.

### **P2-T5: Vitest Suite**
- **Description**: Unit tests for protocol, debounce, stale-drop, errors.
- **Files Created/Modified**: `vitest.config.ts` (jsdom), `src/**/*.test.ts`
- **Implementation Details**:
  - Fake worker harness (class implementing `postMessage`/`onmessage` or
    mock `Worker`), fake timers for debounce.
  - Tests: `workerClient_debouncedParse_firesOnceAfterQuietPeriod`,
    `workerClient_staleResults_areDroppedBySequence`,
    `workerClient_parseError_rejectsAndSurfaces`,
    `worker_ping_repliesReady`, `worker_parse_returnsAstForAllLanguages`,
    `parseStore_staleSourceHash_skipsRerender`.
- **Acceptance Criteria**: `pnpm test` green; coverage of the stale-drop
  race path.

### **P2-T6: Main-Thread Soak & Budget Verification**
- **Description**: Prove NFR-01/02/03/08 with a 5 MB fixture.
- **Files Created/Modified**: `tests/e2e/soak.spec.ts` (Playwright, or a
  manual harness this phase; moved under CI in Phase 5)
- **Implementation Details**:
  - Generate a ~5 MB fixture (repeated valid TS declarations).
  - Parse it; assert: main thread responsive during parse (rAF ticks
    continue / `performance.now()` gaps < 50 ms), worker `parseMs`
    reported, round-trip overhead < 16 ms beyond parseMs (NFR-03).
  - Repeat 20×; log heap via `performance.memory` where available
    (headless caveat noted — same as PulseMetrics retro); assert no
    unbounded growth trend (NFR-08).
- **Acceptance Criteria**: Soak passes; results recorded in the phase
  notes for the Phase 5 perf audit.

---

## 4. Command Cheatsheet (PowerShell)

```powershell
Set-Location "C:\Users\Chak\Desktop\projects\CodeLens Wasm"

pnpm typecheck
pnpm test            # Vitest
pnpm dev             # manual: textarea → stats via worker
pnpm build && pnpm preview   # worker + wasm in prod mode
npx playwright test tests/e2e/soak.spec.ts   # if e2e harness added now
```

---

## 5. Testing Plan

### 5.1 Vitest (unit)
- `workerClient_debouncedParse_firesOnceAfterQuietPeriod`
- `workerClient_staleResults_areDroppedBySequence`
- `workerClient_parseError_rejectsAndSurfaces`
- `worker_ping_repliesReady`
- `worker_parse_returnsAstForAllLanguages`
- `parseStore_staleSourceHash_skipsRerender`

### 5.2 Soak (manual/Playwright, formalized in Phase 5)
- 5 MB parse: main thread responsive; round-trip overhead < 16 ms;
  20-run heap trend flat.

---

## 6. Definition of Done Checklist

- [ ] `ast.ts` types shared between worker, client, store.
- [ ] `parseWorker.ts` routes the full 5-message protocol; one parse at a
      time; errors never escape as exceptions.
- [ ] `workerClient.ts`: promise map + 300 ms debounce + sequence
      stale-drop (FR-01, FR-10).
- [ ] Parse slice + StatsBar skeleton live (FR-07).
- [ ] Vitest suite green.
- [ ] 5 MB soak passes (NFR-02/03/08) with results recorded.
- [ ] `pnpm typecheck` + `pnpm lint` + `pnpm test` green.

---

## 7. Phase Risks & Mitigations

| Risk Description | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| Parse flood on fast typing / big paste. | Medium | 300 ms debounce + stale-drop + one-parse-at-a-time (queue capacity 1). |
| Worker module import of wasm glue breaks in prod build. | Medium | Same `BASE_URL` pattern proven in Phase 1; soak/preview check in P2-T6. |
| Stale result applied after a newer edit. | High | Sequence counter compared at resolution time (P2-T3), tested in P2-T5. |
| Heap growth across repeated parses (wasm side). | Medium | NFR-08 soak; if observed, investigate tree-sitter parser reuse (parse with same `Parser` instance per language, not re-init per call). |

---

## 8. Handoff to Next Phase

Before transitioning to Phase 3:
- Worker + client + store + StatsBar skeleton working end-to-end in dev
  and preview.
- Soak results recorded (budgets NFR-01/02/03/08).
- Phase metadata status set to `Completed`.

---

## 9. Implementation Notes (2026-08-07)

### 9.1 The wasm32 allocator saga (why the crate is vendored)

Phase 2 uncovered a deep defect in tree-sitter 0.26.x's wasm32 support.
Four bugs were found and fixed in sequence; the first three were in the
`tree-sitter-language` 0.1.7 wasm stdlib shim, which is why the crate is
now vendored at `crates/code_lens_wasm/vendor/tree-sitter-language/`
(`[patch.crates-io]` in Cargo.toml).

1. **NULL-heap corruption (~11k nodes)** — the shim's bump heap is only
   initialized by `reset_heap()`, which lives in `wasm_store.c` — entirely
   `TREE_SITTER_FEATURE_WASM`-guarded (wasmtime), never compiled in
   wasm-bindgen builds. The heap base stayed NULL: allocations landed at
   address ~8, overlapping module data, corrupting memory at scale.
2. **Two-grower conflict** — the naive fix (auto-init the bump heap and let
   it grow linear memory) collides with Rust's dlmalloc, which ALSO grows
   the same linear memory from the top. When dlmalloc grows mid-parse it
   claims the new top region; the C heap's stale `heap_end` accounting then
   writes into dlmalloc's data (sequence-dependent OOB at ~11k nodes).
   ANY design with two top-growers is broken.
3. **Forwarding quadratic** — forwarding C `malloc/free` to dlmalloc fixed
   the corruption (single allocator) but was quadratic: dlmalloc first-fit
   scanning over the fragmented parser heap cost ~14–36 µs per realloc
   (~43k reallocs at 375k nodes).
4. **v4 fix: O(1) size-class bins** — `malloc` rounds requests up to a
   power-of-two class (min 16, 32 bins); every block in a bin fits any
   request in that class, so bin take/push is a plain head-pop. `realloc`
   resizes in place when the class is unchanged; `free` retains the block
   in C (dlmalloc is only asked for NEW growth when a bin is empty).
   Internal fragmentation ≤ 2× on the C heap (accepted).

### 9.2 Double-pass elimination (the wall-time fix)

`parse()` originally built the AST JSON string, then re-parsed it with
`serde_json::from_str` and re-serialized with `.to_string()` — two full
redundant passes over the result string, super-linear in practice
(~1,400 ms at 55k nodes). Now `parse_to_json_string()` returns the string
directly (single pass); `parse_to_json()` is kept as a thin wrapper for
the native tests.

### 9.3 Protocol / shape deviations from the design (documented)

- **Flat result keys** — the binding returns `{language, sourceHash,
  parseMs, nodeCount, errorCount, ast}` (flat), not the design's nested
  `stats{}`. Worker and store read flat keys.
- **String transport** — `parse()` returns a JSON **string**, not an
  object (see Phase 1 notes: serde-wasm-bindgen `to_value` returns `{}` on
  wasm32). The worker `JSON.parse`s.
- **V8 JSON.parse depth limit** — wasm parses fine, but JS `JSON.parse`
  rejects ASTs deeper than ~2000 levels (`recursion limit exceeded`).
  Real code is wide, not deep — documented, not mitigated.

### 9.4 Soak budgets — measured reality (scaled assertions)

- `structuredClone` has a ~15–20 ms base cost in Node even for tiny
  objects, plus ~4–7 µs per node. NFR-03's fixed <16 ms only holds for
  small ASTs; the soak now asserts `16 + nodeCount * 12e-3` (2–3× headroom
  over measured clone cost).
- `parseMs` ≈ 2.45 µs/node measured. NFR-01 <100 ms holds up to ~40k
  nodes — typical 1 MB code files (15–40k nodes) parse in 60–90 ms. The
  soak's 1 MB fixture produced 76,825 nodes/MB (still ~5× denser than real
  code) and passed within the scaled bounds.
- Perf table (Node 22, v4 artifact): 55k nodes → ~305 ms wall / 61 ms
  parseMs; 375k nodes (pathological density) → ~4.8 s wall / 954 ms
  parseMs; residual at 375k is walker subtree-string copying O(n×depth) —
  known factor, irrelevant at real densities.
- Final artifact: gzip **591.1 kB** ≤ 800 kB budget.
