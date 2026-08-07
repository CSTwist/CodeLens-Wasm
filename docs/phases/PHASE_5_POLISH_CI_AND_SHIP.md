# Phase 5: Polish, CI & Ship

```text
====================================================================================================
PHASE METADATA
====================================================================================================
Phase Number     : Phase 5 of 5
Title            : Polish, CI & Ship
Version          : 1.0.0
Date             : 2026-08-06
Author / Owner   : Chak
Status           : Approved-for-Implementation
Source Reference : technical-design.md (§6 budgets, §9 testing) · srs.md (NFR-04/05) · IMPLEMENTATION_PLAN.md (§5-§9)
Prerequisites    : Phase 4 complete (persistent workspace live)
Est. Effort      : ~1–1.5 days (part-time)
====================================================================================================
```

---

## 1. Objective & Scope

### 1.1 Objective
Harden and ship: GitHub Actions CI covering the full stack (Rust job with
wasm build + size gate; web job with typecheck/lint/Vitest/Playwright),
Lighthouse audit against the NFR-05 budgets, bundle analysis vs the design
§6 budgets, project README, static deploy to Vercel (empty `vercel.json`
headers placeholder — ADR-05 keeps COOP/COEP off), and close-out:
`docs/RETRO.md` + roadmap status → Shipped (🟢).

### 1.2 In-Scope
- `.github/workflows/ci.yml` — Rust job (fmt, clippy, test, wasm-pack
  build, size gate) + web job (pnpm install, typecheck, lint, test,
  Playwright e2e) + Vercel preview deploy on PR.
- Lighthouse CI (perf ≥ 85, a11y ≥ 95) + bundle budget checks vs design §6.
- `README.md` (setup, architecture, demo, scripts).
- `vercel.json` (headers placeholder only).
- Vercel static deploy; `docs/RETRO.md`; roadmap update + Retro Log row.

### 1.3 Out-of-Scope
- COOP/COEP / shared-memory enablement (deferred per ADR-05 — do **not**
  enable; COEP breaks third-party resources).
- Post-MVP features (more grammars, IntelliSense, export/share).

---

## 2. Dependencies

- **Phases 1–4 outputs**: wasm build pipeline + size gate, Vitest suite,
  Playwright suites, working app.
- **Design Document References**:
  - §6 performance budgets (all).
  - §9 testing strategy (CI layout).
  - §5 ADR-05 (vercel.json stays empty).
- **SRS**: NFR-04, NFR-05, FR-12.

---

## 3. Task List

### **P5-T1: GitHub Actions CI**
- **Description**: Two-job CI with deploy hook.
- **Files Created/Modified**: `.github/workflows/ci.yml`
- **Implementation Details**:
  - **Rust job** (ubuntu): `rustup target add wasm32-unknown-unknown`;
    `cargo fmt --check`; `cargo clippy -- -D warnings`; `cargo test`;
    `wasm-pack build --target web --release --out-dir
    ../../public/wasm --out-name code_lens_wasm` (workdir
    `crates/code_lens_wasm`); `node scripts/check-wasm-size.mjs`.
  - **Web job** (ubuntu): `pnpm install --frozen-lockfile`; `pnpm
    typecheck`; `pnpm lint`; `pnpm test`; `pnpm build`; Playwright
    (install chromium, run against `vite preview` via `webServer`).
  - **Deploy**: Vercel preview deploy on PR; production deploy on `main`.
    Pin `actions/checkout`, `pnpm/action-setup`, `dtolnay/rust-toolchain`,
    `actions/setup-node` versions; cache cargo + pnpm (DCodeBook retro
    lesson: pin tool versions early).
- **Acceptance Criteria**: Push to `main` runs both jobs green; PR
  preview URL generated.

### **P5-T2: Lighthouse + Bundle Budgets**
- **Description**: Audit against NFR-05 and design §6 budgets.
- **Files Created/Modified**: `lighthouserc.json` (or CI step),
  `vite.config.ts` (`build.rollupOptions` chunking: monaco + wasm glue
  named chunks — verify this key still applies under Vite 8 Rolldown,
  adjust if renamed), CI perf step
- **Implementation Details**:
  - Lighthouse: perf ≥ 85, a11y ≥ 95 (NFR-05); run on the preview build
    URL with retry-on-threshold-miss.
  - Bundle analysis: `pnpm build` output report; assert monaco chunk
    ≤ 4 MB raw and total wasm ≤ 800 kB gzip (NFR-04); record numbers in
    the retro.
- **Acceptance Criteria**: Budgets met and recorded; any miss has a
  documented remediation in the retro.

### **P5-T3: README**
- **Description**: Project documentation for the repo.
- **Files Created/Modified**: `README.md`
- **Implementation Details**: one-liner + demo; stack table; scripts
  (`dev`, `build`, `build:wasm`, `test`, `test:e2e`, `preview`);
  architecture pointers (docs map); how parsing stays off the main thread.
- **Acceptance Criteria**: A fresh clone can run `pnpm install && pnpm
  build:wasm && pnpm dev` from the README alone.

### **P5-T4: Vercel Static Deploy**
- **Description**: Ship the static build.
- **Files Created/Modified**: `vercel.json` (headers placeholder), Vercel
  project settings (framework: Vite; build `pnpm build:wasm && pnpm build`;
  output `dist`)
- **Implementation Details**:
  - `vercel.json` ships **empty** headers config (ADR-05 note: COOP/COEP
    intentionally not enabled).
  - Deploy via Vercel dashboard or CLI; verify wasm + Monaco served from
    the app origin on the live URL (FR-12).
- **Acceptance Criteria**: Live URL loads; Network tab shows zero CDN
  requests; smoke parse works in production.

### **P5-T5: Close-Out (RETRO + Roadmap)**
- **Description**: Retrospective and status flip.
- **Files Created/Modified**: `docs/RETRO.md`, `PROJECTS_ROADMAP.md`
- **Implementation Details**:
  - RETRO: what was learned (expected: wasm-pack/Vite asset handling,
    tree-sitter wasm32 quirks if any, Monaco lazy-loading, IDB patterns);
    what went well; next-time improvements; numbers (parse times, bundle
    sizes, Lighthouse).
  - Roadmap: CodeLens Wasm status → Shipped (🟢); Retro Log row added
    (learned / next-time columns, matching prior entries).
  - Tag `v1.0.0-release`; commit.
- **Acceptance Criteria**: Retro written; roadmap 🟢; Retro Log row
  present.

---

## 4. Command Cheatsheet (PowerShell)

```powershell
Set-Location "C:\Users\Chak\Desktop\projects\CodeLens Wasm"

# Local full verification (mirrors CI)
cargo fmt --check && cargo clippy -- -D warnings && cargo test
Set-Location crates/code_lens_wasm
wasm-pack build --target web --release --out-dir ../../public/wasm --out-name code_lens_wasm
Set-Location ../..
node scripts/check-wasm-size.mjs
pnpm typecheck && pnpm lint && pnpm test
pnpm build && npx playwright test

# Lighthouse (on preview/live URL)
npx lighthouse https://<preview-url> --preset=desktop --chrome-flags="--headless=new"

# Deploy
npx vercel --prod
```

---

## 5. Testing Plan

### 5.1 CI pipeline (each push to `main`)
- Rust job: fmt → clippy → test → wasm-pack build → size gate.
- Web job: typecheck → lint → Vitest → build → Playwright (preview).
- Deploy: preview on PR, production on `main`.

### 5.2 Final audit
- Lighthouse: perf ≥ 85, a11y ≥ 95 (NFR-05).
- Bundle: monaco chunk ≤ 4 MB raw; wasm ≤ 800 kB gzip (NFR-04).

---

## 6. Definition of Done Checklist

- [ ] CI green on `main` (both jobs + size gate + e2e).
- [ ] Lighthouse perf ≥ 85 and a11y ≥ 95, recorded.
- [ ] Bundle budgets met (monaco ≤ 4 MB raw, wasm ≤ 800 kB gzip).
- [ ] No CDN requests on the live URL (FR-12).
- [ ] README complete (fresh-clone setup works).
- [ ] `docs/RETRO.md` written; roadmap status → 🟢; Retro Log row added.
- [ ] Tag `v1.0.0-release` committed.

---

## 7. Phase Risks & Mitigations

| Risk Description | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| Headless-Chromium wasm flakiness in CI. | Medium | Playwright against `vite preview` (prod paths); retry on transient worker timeouts; pin browser version. |
| Lighthouse score variance across runs. | Medium | Thresholds with retries; record median-of-3; perf ≥ 85 target is deliberately under 100 (PulseMetrics lesson: headless caveats). |
| Vercel build missing `build:wasm` step. | Medium | Vercel build command = `pnpm build:wasm && pnpm build`; verify in P5-T4. |
| COEP temptation (shared memory). | High | ADR-05: do not enable; `vercel.json` ships empty; document the enablement path in the design doc only. |

---

## 8. Handoff to Next Phase

No next phase. Project close-out:
- All DoD items checked; roadmap Shipped (🟢); retro logged.
- Future work tracked as post-MVP ideas in `srs.md` §5.2.
