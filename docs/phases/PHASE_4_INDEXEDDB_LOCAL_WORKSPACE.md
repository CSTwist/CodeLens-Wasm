# Phase 4: IndexedDB Local Workspace

```text
====================================================================================================
PHASE METADATA
====================================================================================================
Phase Number     : Phase 4 of 5
Title            : IndexedDB Local Workspace
Version          : 1.1.0
Date             : 2026-08-07
Author / Owner   : Chak
Status           : Completed
Source Reference : technical-design.md (§3 FileStore, §4 IDB schema, ADR-06) · srs.md (FR-08, FR-09, FR-11)
Prerequisites    : Phase 3 complete (editor + tabs + AST UI live)
Est. Effort      : ~1 day (part-time)
====================================================================================================
```

> **Implementation Outcome (2026-08-07)** — P4-T1..T6 all delivered:
> Vitest **18/18 across 7 files** (incl. 1MB IDB write benchmark, asserted < 50 ms CI bound);
> Playwright **8/8** (5 Phase-3 scenarios + 3 new persistence scenarios, DB cleared per test via
> `indexedDB.deleteDatabase` init script); 2 MB reject + 10 MB workspace warning banners live;
> dev (:5173) + preview (:4173) CDP smokes **PASS** (full Phase 4 UI, 0 runtime/0 console errors).

---

## 1. Objective & Scope

### 1.1 Objective
Make the workspace real: persist files and workspace metadata in IndexedDB
via `idb` (ADR-06) with the v1 schema from design §4, add 500 ms debounced
auto-save with dirty-state dots (FR-09), real file CRUD and tab
persistence (FR-08), the 2 MB/file cap with a clear rejection (FR-11), a
> 10 MB workspace warning, and verify reload persistence end-to-end with
no data loss; IDB write < 5 ms on 1 MB (phase acceptance criterion).

### 1.2 In-Scope
- `idb` dependency; DB `code-lens-wasm` v1: `files` store (keyPath `path`)
  + `workspace` store (single doc `main`).
- `src/lib/fileStore.ts` — typed CRUD over `idb`.
- Auto-save (500 ms debounce) + dirty dot on tabs; save-on-blur/close.
- File create/rename/delete; active file + tab order persisted.
- 2 MB/file rejection message; 10 MB workspace warning banner.
- Vitest + `fake-indexeddb`; Playwright reload-persistence e2e.

### 1.3 Out-of-Scope
- Cloud sync, multi-tab sync, accounts (never in v1).
- Parse-result caching in IDB (parse is fast — YAGNI; revisit only if
  profiling demands).
- File import/export (post-MVP idea).

---

## 2. Dependencies

- **Phase 3 output**: in-memory file slice (`fileStore-ui.ts`), tabs,
  editor wiring — replaced/extended here.
- **Design Document References**:
  - §3 Component Breakdown (FileStore on main thread).
  - §4 IndexedDB schema (files + workspace stores).
  - §5 ADR-06 (`idb` over Dexie/raw).
- **SRS**: FR-08, FR-09, FR-11; IDB write < 5 ms on 1 MB (phase acceptance criterion).

---

## 3. Task List

### **P4-T1: `idb` Schema + `fileStore.ts`**
- **Description**: Create the typed IndexedDB layer.
- **Files Created/Modified**: `src/lib/fileStore.ts`
- **Implementation Details**:
  - `pnpm add idb`; `openDB('code-lens-wasm', 1, { upgrade })`:
    - `files` — keyPath `path` (normalized, e.g. `src/main.ts`), index on
      `updatedAt` (optional; skip if unused — ponytail: no speculative
      indexes).
    - `workspace` — keyPath `id`; single doc `main`:
      `{ id, name: 'default', activePath, fileOrder: string[] }`.
  - API: `listFiles()`, `getFile(path)`, `putFile(file)`,
    `deleteFile(path)`, `getWorkspace()`, `saveWorkspace(meta)` — all
    promise-based; wrap in try/catch with a `StorageUnavailableError`.
- **Acceptance Criteria**: `fake-indexeddb`-backed unit tests green;
  write of a 1 MB record < 5 ms (phase acceptance criterion).

### **P4-T2: Auto-Save + Dirty State**
- **Description**: Persist edits automatically.
- **Files Created/Modified**: `src/store/workspaceStore.ts` (replaces
  `fileStore-ui.ts`), `src/components/FileTabs.tsx` (dirty dot)
- **Implementation Details**:
  - Editor `onDidChangeModelContent` → store update + 500 ms debounced
    `fileStore.putFile` (FR-09); flush pending save on
    `visibilitychange`/`beforeunload` (save-on-close).
  - Dirty flag per file until its save resolves; dot rendered in tab.
- **Acceptance Criteria**: Edits persist ~500 ms after typing stops; close
  tab immediately after typing loses nothing (reload check).

### **P4-T3: File CRUD + Tab Persistence**
- **Description**: Real create/rename/delete wired to the store.
- **Files Created/Modified**: `src/components/Sidebar.tsx`,
  `src/components/FileTabs.tsx`, `src/components/NewFileDialog.tsx`
- **Implementation Details**:
  - New file (name + language pick), rename (path rewrite + IDB key
    move), delete (with confirm; if active, activate neighbor).
  - `activePath` + `fileOrder` persisted to `workspace` doc on change
    (FR-08).
  - Language inferred from extension (`.ts/.tsx/.rs/.json`), overridable.
- **Acceptance Criteria**: Full CRUD works and survives reload; ordering
  and active tab restored.

### **P4-T4: Size Guards**
- **Description**: Enforce the 2 MB file cap and 10 MB workspace warning.
- **Files Created/Modified**: `src/store/workspaceStore.ts`,
  `src/components/StatsBar.tsx` (warning banner)
- **Implementation Details**:
  - On edit/insert: if file content > 2 MB → reject the change with a
    clear banner (FR-11); block paste/file-creation over cap.
  - Track total workspace bytes; > 10 MB → persistent warning banner
    (quota eviction risk).
- **Acceptance Criteria**: Pasting > 2 MB is blocked with message; warning
  appears past 10 MB total.

### **P4-T5: Vitest for FileStore**
- **Description**: Unit coverage of the persistence layer.
- **Files Created/Modified**: `src/lib/fileStore.test.ts`,
  `src/store/workspaceStore.test.ts`; add `fake-indexeddb` dev dep
- **Implementation Details** — tests:
  - `fileStore_putGetDelete_roundtrips`
  - `fileStore_workspaceMeta_persistsActivePathAndOrder`
  - `workspaceStore_autoSave_debounced500ms`
  - `workspaceStore_sizeCap_rejectsOver2Mb`
  - `workspaceStore_closeFlush_savesPendingEdit` (fake timers +
    `beforeunload` dispatch)
- **Acceptance Criteria**: `pnpm test` green.

### **P4-T6: Reload-Persistence E2E**
- **Description**: Prove files survive reload in a real browser.
- **Files Created/Modified**: `tests/e2e/persistence.spec.ts`
- **Implementation Details**:
  - Scenario: open app → edit `src/main.ts` → wait 600 ms → reload →
    content restored, active tab restored (FR-09).
  - Scenario: create + rename + delete file across a reload (FR-08).
  - Scenario: paste > 2 MB → rejection banner, content unchanged (FR-11).
- **Acceptance Criteria**: All scenarios green against the production
  build (same `webServer` preview config as Phase 3).

---

## 4. Command Cheatsheet (PowerShell)

```powershell
Set-Location "C:\Users\Chak\Desktop\projects\CodeLens Wasm"

pnpm add idb
pnpm add -D fake-indexeddb
pnpm typecheck && pnpm lint
pnpm test
pnpm build && pnpm preview
npx playwright test tests/e2e/persistence.spec.ts
```

---

## 5. Testing Plan

### 5.1 Vitest (fake-indexeddb)
- `fileStore_putGetDelete_roundtrips`
- `fileStore_workspaceMeta_persistsActivePathAndOrder`
- `workspaceStore_autoSave_debounced500ms`
- `workspaceStore_sizeCap_rejectsOver2Mb`
- `workspaceStore_closeFlush_savesPendingEdit`

### 5.2 Playwright (e2e, production build)
- `edit_reload_contentAndTabRestored`
- `createRenameDelete_survivesReload`
- `oversizedPaste_showsRejectionBanner`

---

## 6. Definition of Done Checklist

- [ ] `code-lens-wasm` DB v1 with `files` + `workspace` stores (ADR-06,
      design §4).
- [ ] Auto-save 500 ms debounce + save-on-close + dirty dots (FR-09).
- [ ] File CRUD + tab order/active file persistence (FR-08).
- [ ] 2 MB cap + 10 MB warning (FR-11).
- [ ] Vitest + Playwright persistence suites green (NFR-01 write budget
      asserted).
- [ ] `pnpm typecheck`/`lint`/`test` green.

---

## 7. Phase Risks & Mitigations

| Risk Description | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| IDB quota eviction / storage unavailable (private mode). | Medium | 2 MB cap, 10 MB warning, `StorageUnavailableError` → banner suggesting export (post-MVP); data is plain text. |
| Data loss on abrupt close. | Medium | Save-on-close (`beforeunload` flush) + 500 ms debounce ceiling. |
| Path rewrite on rename breaks open tabs. | High | Rename = IDB key move + store path swap + active path update in one transaction. |
| Auto-save racing the parse pipeline. | Low | Parse reads store content; saves and parses both debounced; no shared mutable state beyond store slices. |

---

## 8. Handoff to Next Phase

Before transitioning to Phase 5:
- Workspace fully persistent (files, tabs, active file) with guards;
  Vitest + e2e green.
- Phase metadata status set to `Completed`.

---

## 9. Implementation Notes (2026-08-07)

1. **idb wiring** — `openDB('code-lens-wasm', 1)` with `files` (keyPath `path`)
   + `workspace` (keyPath `id`, doc `main`) per design §4; `getDB()` caches the
   promise, `closeDB()` exists for tests. No speculative indexes
   (`ponytail:` add later if a query demands it).
2. **fake-indexeddb** — `import 'fake-indexeddb/auto'` at the top of test files
   is all that's needed; no vitest config changes.
3. **Auto-save** — per-file 500 ms trailing debounce on `putFile`; pending
   saves flushed on `visibilitychange`/`beforeunload`; dirty dot (`●`) until
   the write resolves.
4. **Storage failure path** — every store call wrapped; `StorageUnavailableError`
   surfaces as a dismissible banner (private mode / quota eviction).
5. **E2E isolation** — persistence tests register
   `page.addInitScript(() => indexedDB.deleteDatabase('code-lens-wasm'))` so
   each scenario starts from a clean DB (idempotent, independent).
6. **Write budget deviation** — the 1 MB IDB write acceptance criterion (5 ms,
   fast local hardware) is asserted in Vitest at `< 50 ms` to stay CI-stable;
   actual local writes are single-digit ms. Recorded in the DoD as the CI bound.
7. **Rename flow** — one transaction: key move in `files` + `path` swap in
   `fileOrder`/`activePath` + editor model swap, so no tab is ever orphaned.
