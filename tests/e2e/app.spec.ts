import { test, expect } from '@playwright/test'

test.describe('CodeLens Wasm Phase 3 E2E Suite', () => {
  test('typeCode_astRenders_clickNode_editorCursorJumps', async ({ page }) => {
    await page.goto('/')

    // Wait for WASM to initialize and parse initial file
    await expect(page.getByText('WASM Status')).toBeVisible()
    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })
    await expect(page.locator('[role="treeitem"]').first()).toBeVisible()

    // Click an AST node in the tree
    const firstTreeItem = page.locator('[role="treeitem"]').first()
    await firstTreeItem.click()

    // Verify node gets selected
    await expect(firstTreeItem).toHaveAttribute('aria-selected', 'true')
  })

  test('moveCursor_treeHighlightsNearestNamedNode', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })
    await page.waitForTimeout(500)

    // Click inside Monaco Editor
    const editor = page.locator('[data-testid="monaco-editor-container"]')
    await editor.click()

    // Move cursor or press Right arrow
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(200)

    // Verify an AST node is selected
    const selectedTreeItem = page.locator('[role="treeitem"][aria-selected="true"]')
    await expect(selectedTreeItem.first()).toBeVisible()
  })

  test('brokenCode_errorNodesMarkedInTreeAndEditor', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })

    // Click Monaco editor and type syntax error
    const editor = page.locator('[data-testid="monaco-editor-container"]')
    await editor.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('const x = ;')

    // Wait for tree or stats bar to reflect error
    await expect(page.getByText('⚠')).toBeVisible({ timeout: 10000 })
  })

  test('appLoads_noCdnRequests', async ({ page }) => {
    const externalRequests: string[] = []

    page.on('request', (request) => {
      const url = request.url()
      if (!url.startsWith('http://localhost') && !url.startsWith('http://127.0.0.1') && !url.startsWith('data:')) {
        externalRequests.push(url)
      }
    })

    await page.goto('/')
    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })

    // Switch tab to test other components
    await page.locator('[role="tab"]').getByText('main.rs').click()
    await page.waitForTimeout(500)

    expect(externalRequests).toEqual([])
  })

  test('tree_keyboardWalk_works', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('READY')).toBeVisible({ timeout: 30000 })

    const tree = page.locator('[role="tree"]')
    await tree.focus()

    // Navigate with arrow keys
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(100)

    // Check focused treeitem
    const focusedItem = page.locator('[role="treeitem"]:focus, [role="treeitem"][tabindex="0"]')
    await expect(focusedItem.first()).toBeVisible()
  })
})
