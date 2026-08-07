# Phase 3: Monaco Editor & AST Visualizer

```text
====================================================================================================
PHASE METADATA
====================================================================================================
Phase Number     : Phase 3 of 5
Title            : Monaco Editor & AST Visualizer
Version          : 1.1.0
Date             : 2026-08-07
Author / Owner   : Chak
Status           : Completed
Source Reference : technical-design.md (§3, §5 ADR-07, §6 budgets) · srs.md (FR-02..FR-06, FR-12, NFR-04/05/06/07)
Prerequisites    : Phase 2 complete (worker bridge + parse slice live)
Est. Effort      : ~2–3 days (part-time)
====================================================================================================
```

---

## 1. Objective & Scope

### 1.1 Objective
Deliver the two-pane experience: Monaco Editor as the editing pane (local
ESM bundle, editor worker only, lazy chunk — ADR-07), and a collapsible AST
tree pane with bidirectional synchronization (node click → editor reveal +
decoration, FR-05; editor cursor → nearest named node highlight, FR-06),
named/anonymous toggle and error styling (FR-03/04), full state handling
(empty/loading/error), the completed StatsBar, and tree accessibility
(NFR-06). Prove with Playwright that the whole loop works and zero CDN
requests occur (FR-12, NFR-07).

### 1.2 In-Scope
- `monaco-editor` install (local, no `@monaco-editor/react`); `useMonaco`
  hook; `editor.worker?worker` wiring; dark theme; lazy chunk import.
- EditorPane + FileTabs (in-memory files this phase — persistence is
  Phase 4) + language mapping (`ts`/`tsx`/`rust`/`json`).
- AstTree: collapsible tree, named/anonymous toggle, error nodes.
- Bidirectional sync via `revealRangeInCenter` + `deltaDecorations` and
  debounced cursor events.
- States: empty workspace, parsing indicator, error banner, oversized-file
  rejection stub (full cap in Phase 4).
- Playwright e2e (type → AST → click → cursor jump; no-CDN assertion) +
  a11y pass.

### 1.3 Out-of-Scope
- IndexedDB persistence / real file CRUD (deferred to Phase 4).
- Language services, IntelliSense, semantic diagnostics (never in v1).
- More grammars beyond ts/tsx/rust/json (post-MVP).

---

## 2. Dependencies

- **Phase 2 output**: `workerClient`, parse slice, `ast.ts` types.
- **Design Document References**:
  - §3 Component Breakdown (EditorPane, AstTree, StatsBar, FileTabs).
  - §5 ADR-07 (direct monaco, no language workers, lazy chunk).
  - §6 budgets (Monaco ≤ 4 MB raw lazy chunk).
- **SRS**: FR-02–06, FR-12; NFR-04/05/06/07; §3.4 UI layout & interaction
  spec.

---

## 3. Task List

### **P3-T1: Monaco Integration (`useMonaco` hook)**
- **Description**: Install and wire Monaco as a local lazy-loaded module.
- **Files Created/Modified**:
  - `src/lib/monaco.ts` — `MonacoEnvironment` + re-exports
  - `src/lib/useMonaco.ts` — React hook
  - `src/components/EditorPane.tsx` (partial)
- **Implementation Details**:
  - `pnpm add monaco-editor`; dynamic import of
    `monaco-editor/esm/vs/editor/editor.api` inside the hook so the
    ~3–4 MB chunk only loads when the editor mounts (NFR-04).
  - Worker wiring (design §5 notes):
    `import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'`
    → `self.MonacoEnvironment = { getWorker: () => new editorWorker() }`
  - Dark theme; `automaticLayout: true`.
- **Acceptance Criteria**: Editor renders in dev and preview; Network tab
  shows the monaco chunk loading lazily and **no CDN requests** (FR-12,
  NFR-07).

### **P3-T2: EditorPane + FileTabs + Language Mapping**
- **Description**: Wire files (in-memory) to editor models and languages.
- **Files Created/Modified**:
  - `src/components/EditorPane.tsx`
  - `src/components/FileTabs.tsx`
  - `src/store/fileStore-ui.ts` (in-memory slice: `files: {path, language,
    content}[]`, `activePath`) — replaced by real persistence in Phase 4
- **Implementation Details**:
  - Map `LangId` → Monaco language id (`typescript`, `rust`, `json`);
    `ts`/`tsx` share the TS model language for v1 (no JSX-specific
    language worker needed for editing).
  - `monaco.editor.createModel(content, lang)` per file; dispose on close;
    `setModel` on tab switch.
  - Default workspace: `src/main.ts` (TS sample), `main.rs`, `data.json`.
- **Acceptance Criteria**: Tab switching swaps models and language; editor
  content flows to the Phase 2 parse pipeline (FR-02).

### **P3-T3: AstTree Component**
- **Description**: Render AstNode JSON as a collapsible tree.
- **Files Created/Modified**:
  - `src/components/AstTree.tsx`
  - `src/lib/ast.ts` (add tree utils: `countNodes`, `flatten`, `findNodeAt`)
- **Implementation Details**:
  - Recursive render with per-node collapse state (max depth guard 8 for
    default expansion); virtualized rendering only if nodeCount > 2k
    (ponytail: skip virtualization until measured).
  - Named nodes shown by default; anonymous-token toggle (FR-03).
  - Error/missing nodes styled red + ⚠ marker (FR-04).
  - A11y: `role="tree"`/`treeitem`, roving tabindex, `aria-expanded`,
    `aria-selected` (NFR-06).
- **Acceptance Criteria**: Tree renders for all three languages; toggle
  works; error nodes visible on broken input; keyboard operable.

### **P3-T4: Node → Editor Sync**
- **Description**: AST node click reveals and decorates the editor range.
- **Files Created/Modified**: `src/lib/monacoSync.ts`, `AstTree.tsx`
  (onNodeClick), `EditorPane.tsx` (decoration support)
- **Implementation Details**:
  - Click → `editor.revealRangeInCenter({startLineNumber, startColumn,
    endLineNumber, endColumn})` (tree-sitter emits 0-based row/column;
    Monaco is 1-based — add 1 to row and column) +
    `deltaDecorations` highlight (class `ast-node-highlight`) + clear
    previous.
  - Also `editor.setPosition` to the node start for cursor parity (FR-05).
- **Acceptance Criteria**: Clicking any tree node jumps the editor and
  highlights the exact range.

### **P3-T5: Editor → Tree Sync**
- **Description**: Cursor movement highlights the nearest enclosing named
  node.
- **Files Created/Modified**: `src/lib/monacoSync.ts` (inverse direction),
  `AstTree.tsx` (highlighted path state)
- **Implementation Details**:
  - `editor.onDidChangeCursorPosition` → debounced (50 ms) → walk AST for
    the deepest named node whose byte range contains the cursor → expand
    ancestor path + `aria-selected`/highlight (FR-06).
  - Byte-based: Monaco positions → offset via `model.getOffsetAt`.
- **Acceptance Criteria**: Moving the cursor updates tree highlight within
  100 ms; no feedback loops between P3-T4/T5 highlights.

### **P3-T6: States + StatsBar + Error Surface**
- **Description**: Complete the UI states and stats reporting.
- **Files Created/Modified**: `src/components/StatsBar.tsx` (complete),
  `src/components/EmptyState.tsx`, `App.tsx` (layout assembly)
- **Implementation Details**:
  - StatsBar: parseMs, nodeCount, errorCount, file size, wasm state,
    `aria-live="polite"` (FR-07, NFR-06).
  - Empty workspace → welcome + "new file" CTA; parsing → subtle inline
    indicator (no blocking); error → banner in stats bar, previous AST
    stays visible (FR-10).
  - Oversized-file rejection stub (message only; hard cap lands in P4-T4).
- **Acceptance Criteria**: All four states visible and correct; stats
  announced to screen readers.

### **P3-T7: Playwright E2E + A11y Pass**
- **Description**: End-to-end verification of the interaction loop.
- **Files Created/Modified**: `playwright.config.ts` (webServer →
  `pnpm preview` after `pnpm build`), `tests/e2e/app.spec.ts`
- **Implementation Details** — scenarios:
  - `typeCode_astRenders_clickNode_editorCursorJumps` (FR-01/03/05)
  - `moveCursor_treeHighlightsNearestNamedNode` (FR-06)
  - `brokenCode_errorNodesMarkedInTreeAndEditor` (FR-04)
  - `appLoads_noCdnRequests` — assert zero external network requests
    (FR-12, NFR-07)
  - `tree_keyboardWalk_works` — tab/arrow navigation (NFR-06)
- **Acceptance Criteria**: All scenarios green in CI-style headless
  Chromium against the production build.

---

## 4. Command Cheatsheet (PowerShell)

```powershell
Set-Location "C:\Users\Chak\Desktop\projects\CodeLens Wasm"

pnpm add monaco-editor
pnpm typecheck && pnpm lint
pnpm dev                     # manual two-pane verification
pnpm build && pnpm preview
npx playwright install chromium
npx playwright test          # e2e against preview (webServer config)
```

---

## 5. Testing Plan

### 5.1 Playwright (e2e, production build)
- `typeCode_astRenders_clickNode_editorCursorJumps`
- `moveCursor_treeHighlightsNearestNamedNode`
- `brokenCode_errorNodesMarkedInTreeAndEditor`
- `appLoads_noCdnRequests`
- `tree_keyboardWalk_works`

### 5.2 Manual
- Dark theme consistency; Monaco lazy-load behavior in Network tab;
- Cursor ↔ tree sync latency feel (< 100 ms).

---

## 6. Definition of Done Checklist

- [ ] Monaco loads lazily from local bundle; zero CDN requests (FR-12).
- [ ] EditorPane + FileTabs with language mapping (FR-02).
- [ ] AstTree: collapse, named/anonymous toggle, error nodes (FR-03/04).
- [ ] Node → editor reveal + decoration (FR-05); cursor → tree highlight
      (FR-06).
- [ ] All four UI states + StatsBar complete (FR-07, FR-10).
- [ ] Tree keyboard-operable (NFR-06); stats aria-live.
- [ ] Playwright suite green; `pnpm typecheck`/`lint` green.

---

## 7. Phase Risks & Mitigations

| Risk Description | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| Monaco bundle weight or worker wiring breakage. | Medium | Lazy chunk + editor worker only (ADR-07); no-CDN e2e assertion catches regressions. |
| Row/column index mismatch between tree-sitter and Monaco. | Medium | Shared byte-offset mapping via `model.getOffsetAt`/`getPositionAt`; unit-test the mapping in P3-T5. |
| Feedback loop between the two sync directions. | Medium | Distinct highlight classes + `ignoreNextCursor` flag while applying reveal. |
| Large AST rendering jank (10k+ nodes). | Medium | Default collapse depth 8; virtualization only if measured > 2k visible nodes (ponytail). |

---

## 8. Handoff to Next Phase

Before transitioning to Phase 4:
- Two-pane app fully interactive (editor ↔ tree ↔ stats) in dev and
  preview; e2e green.
- Phase metadata status set to `Completed`.

---

## 9. Implementation Notes (2026-08-07)

> **Implementation Outcome** — All P3-T1..T7 delivered and verified:
> Vitest **12/12** green (6 original + ast + monacoSync suites) ·
> Playwright **5/5** green against the production preview + real wasm worker
> (12.8s) · Monaco lazy chunk **2,620.73 kB raw / 671.27 kB gzip** (≤ 4 MB
> raw NFR-04 ✓) · zero CDN requests (FR-12/NFR-07) · keyboard tree walk
> (NFR-06) · dev + preview CDP smokes PASS (READY / 23 nodes / 0 errors).

1. **Monaco wiring (ADR-07)** — direct `monaco-editor` ESM; the worker is
   wired via `import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'`
   + `self.MonacoEnvironment = { getWorker: () => new editorWorker() }`;
   the editor itself is loaded with a **lazy dynamic import** of
   `monaco-editor/esm/vs/editor/editor.api` so the ~2.6 MB chunk only loads
   on first editor use.
2. **Coordinate mapping** — tree-sitter emits 0-based row/column; Monaco is
   1-based: add 1 to both axes for `revealRangeInCenter`/`setPosition`. The
   reverse direction (cursor → node) uses the shared byte-offset mapping
   (`model.getOffsetAt` → byte-based `findNodeAt` walk over the AST).
3. **Bidirectional sync** — node click applies a distinct
   `ast-node-highlight` decoration (cleared on next click) + `setPosition`;
   cursor moves are debounced 50 ms and guarded by an `ignoreNextCursor`
   flag while a reveal is being applied (no feedback loop).
4. **Tree UX (ponytail)** — default expansion depth 8; named-only default
   with an anonymous-token toggle; error/missing nodes styled red with ⚠.
   No virtualization: only add if measured > 2k visible nodes.
5. **Vite 8 note** — Rolldown advisory recommends
   `build.rolldownOptions.output.codeSplitting` (the `rollupOptions` key is
   renamed in Vite 8); current lazy chunking works without it — revisit if
   chunk tuning is needed (see PHASE_5 note).

