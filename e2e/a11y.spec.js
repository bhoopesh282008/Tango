import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Automated accessibility checks with axe-core: every page, light and dark theme.
// axe finds roughly a third of accessibility problems (missing names, contrast, roles,
// landmarks); it cannot judge reading order or whether a label makes sense. Keyboard and
// screen-reader use still needs a person.

const PAGES = [
  ['/', 'Dashboard', 'Flood damage map'],
  ['/copilot', 'Copilot', 'Situation-Report Copilot'],
  ['/about', 'About', 'Method and limitations'],
  ['/report', 'Situation report', null],
]

test.beforeEach(async ({ page }) => {
  // Past the splash screen, which is shown once per browser session.
  await page.addInitScript(() => sessionStorage.setItem('tango-entered', '1'))
})

for (const scheme of ['light', 'dark']) {
  for (const [path, name, ready] of PAGES) {
    test(`${name} page: no axe violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto(path)
      // Wait for the data to arrive rather than for a fixed time.
      await expect(page.locator('main')).toBeVisible()
      if (ready) await expect(page.getByText(ready, { exact: false }).first()).toBeVisible({ timeout: 30_000 })
      // Entry animations and the map's tiles settle.
      await page.waitForTimeout(1500)

      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'])
        .analyze()

      // Names the rule, its impact and the first few elements: enough to find the cause.
      const summary = violations.map(
        (v) =>
          `${v.impact}: ${v.id} (${v.nodes.length}) ${v.help}\n` +
          v.nodes
            .slice(0, 3)
            .map((n) => `    ${n.target.join(' ')}`)
            .join('\n'),
      )
      expect(summary, summary.join('\n')).toEqual([])
    })
  }
}

test('the dashboard can be used from the keyboard: skip link, then the Export menu', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()

  const exportButton = page.getByRole('button', { name: /export/i })
  await exportButton.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('menuitem').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(exportButton).toBeFocused()
})
