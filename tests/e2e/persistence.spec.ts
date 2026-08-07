import { test, expect, type Page } from '@playwright/test'

async function setupCleanApp(page: Page) {
  await page.goto('/')
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const req = window.indexedDB.deleteDatabase('code-lens-wasm')
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      req.onblocked = () => resolve()
    })
  })
  await page.reload()
  await expect(page.getByText('WASM Status')).toBeVisible()
  await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })
}

test.describe('CodeLens Wasm Phase 4 IndexedDB Persistence Suite', () => {
  test('edit_reload_contentAndTabRestored', async ({ page }) => {
    await setupCleanApp(page)

    // Click Monaco editor
    const editor = page.locator('[data-testid="monaco-editor-container"]')
    await editor.click()

    // Add unique string
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('// PERSISTENCE_TEST_MARKER\nconst x = 1;')

    // Wait for debounced auto-save (500 ms) to resolve — the dirty dot (●)
    // in the active tab clears only after the IDB write resolves, which is a
    // deterministic sync point (a fixed sleep here raced the debounce).
    const activeTab = page.locator('[role="tab"][aria-selected="true"]')
    await expect(activeTab.getByText('●')).toBeHidden({ timeout: 5000 })

    // Reload page
    await page.reload()

    await expect(page.getByText('WASM Status')).toBeVisible()
    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })

    // Active file tab should be src/main.ts and editor should contain the marker
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toContainText('src/main.ts')
    await expect(page.locator('[aria-label="Code Editor"]')).toContainText('PERSISTENCE_TEST_MARKER')
  })

  test('createRenameDelete_survivesReload', async ({ page }) => {
    await setupCleanApp(page)

    // Click "+ New" in Sidebar
    await page.locator('aside').getByRole('button', { name: 'New' }).click()

    // Fill in New File dialog
    await page.locator('#new-file-path').fill('temp_module.ts')
    await page.getByRole('button', { name: 'Create File' }).click()

    // Verify temp_module.ts created and active
    await expect(page.locator('[role="tab"][aria-selected="true"]')).toContainText('temp_module.ts')

    // Wait for save
    await page.waitForTimeout(600)

    // Rename temp_module.ts to renamed_module.ts via Sidebar rename button
    const fileRow = page.locator('aside').getByText('temp_module.ts')
    await fileRow.hover()
    await page.getByRole('button', { name: 'Rename temp_module.ts' }).click()

    // Input rename in sidebar
    const renameInput = page.locator('aside input[type="text"]')
    await renameInput.fill('renamed_module.ts')
    await renameInput.press('Enter')

    // Wait for save
    await page.waitForTimeout(600)

    // Reload page
    await page.reload()
    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })

    // Verify renamed_module.ts survives reload and is active
    await expect(page.locator('aside')).toContainText('renamed_module.ts')
    await expect(page.locator('aside')).not.toContainText('temp_module.ts')

    // Delete renamed_module.ts via Sidebar delete button
    const renamedRow = page.locator('aside').getByText('renamed_module.ts')
    await renamedRow.hover()
    await page.getByRole('button', { name: 'Delete renamed_module.ts' }).click()

    // Wait for save
    await page.waitForTimeout(600)

    // Reload page again
    await page.reload()
    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })

    // Verify renamed_module.ts is gone
    await expect(page.locator('aside')).not.toContainText('renamed_module.ts')
  })

  test('oversizedPaste_showsRejectionBanner', async ({ page }) => {
    await setupCleanApp(page)

    // Trigger oversized content in active file using browser evaluate
    await page.evaluate(() => {
      const over2Mb = 'a'.repeat(2_000_005)
      const store = (window as unknown as { useWorkspaceStore?: { getState: () => { updateFileContent: (path: string, content: string) => void } } }).useWorkspaceStore?.getState()
      if (store) {
        store.updateFileContent('src/main.ts', over2Mb)
      }
    })

    // Verify error banner appears in StatsBar
    await expect(page.getByText('2 MB hard cap')).toBeVisible({ timeout: 10000 })
  })
})
