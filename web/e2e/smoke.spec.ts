import { expect, test } from '@playwright/test'

// Smoke test of the static site: a recorded trace plays without downloading models.
test('replays a recorded trace and steps through every phase', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ask a question')
  await expect(page.locator('.mode')).toContainText('Recorded run')
  await expect(page.locator('canvas')).toBeVisible()

  const titles = [
    'Chunking',
    'Embedding',
    'Indexing',
    'Query',
    'Retrieval',
    'Reranking',
    'Prompt',
    'Generation',
  ]
  for (const [i, title] of titles.entries()) {
    await page.locator('.rail button').nth(i).click()
    await expect(page.locator('.panel .eyebrow').first()).toContainText(title)
  }
  // The answer streams in and cites its sources.
  await expect(page.locator('.cite').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.status.good')).toContainText('Grounded answer')

  await page.getByRole('button', { name: /Under the hood/ }).click()
  await expect(page.getByRole('dialog')).toContainText('generation')
  await page.keyboard.press('Escape')

  expect(errors).toEqual([])
})

test('runs a guided failure case from its recorded trace', async ({ page }) => {
  await page.goto('/')
  await page.locator('.case', { hasText: 'Out of corpus' }).getByRole('button').click()
  await page.locator('.rail button').nth(7).click()
  await expect(page.locator('.status.critical')).toContainText('Declined', { timeout: 15_000 })
})
