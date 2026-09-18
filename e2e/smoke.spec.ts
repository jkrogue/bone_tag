import { test, expect, type Page } from '@playwright/test'

const WIDTH = 390
const HEIGHT = 844
const HOLD_HOLD_MS = 650

const SHOTS_DIR =
  '/private/tmp/claude-501/-Users-justin-code-bone-tag/0304f9a7-fb2f-4975-90c7-66e9b6ad6d2b/scratchpad/shots'

interface DebugBone {
  id: string
  displayName: string
  meshNames: string[]
}

interface DebugGameState {
  phase: string
  roundIndex: number
  results: unknown[]
  missHintAt: number | null
  stats: { played: number }
  currentBone: () => DebugBone | undefined
  max: () => number
}

interface DebugMesh {
  material: unknown
}

interface BoneTagDebugWindow {
  __boneTag?: { getState: () => DebugGameState }
  __boneTagRaycast?: (clientX: number, clientY: number) => string | null
  __boneTagGetMesh?: (name: string) => DebugMesh | undefined
}

/** Console/page-error text allow-listed as noise, not real failures. */
const ALLOWED_ERROR_PATTERNS = [/THREE\.Clock/i, /swiftshader/i, /SwiftShader/i, /GPU stall/i, /ANGLE/i]

function attachConsoleGuard(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (ALLOWED_ERROR_PATTERNS.some((re) => re.test(text))) return
    errors.push(text)
  })
  page.on('pageerror', (err) => {
    const text = String(err)
    if (ALLOWED_ERROR_PATTERNS.some((re) => re.test(text))) return
    errors.push(text)
  })
  return errors
}

async function gotoFresh(page: Page): Promise<void> {
  await page.goto('/?debug=1')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForFunction(() => !!(window as unknown as { __boneTag?: unknown }).__boneTag)
}

async function getPhase(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as BoneTagDebugWindow).__boneTag!.getState().phase)
}

async function getRoundIndex(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as BoneTagDebugWindow).__boneTag!.getState().roundIndex)
}

async function getResultsLength(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as BoneTagDebugWindow).__boneTag!.getState().results.length)
}

async function getCurrentBone(page: Page): Promise<DebugBone | null> {
  return page.evaluate(() => {
    const s = (window as unknown as BoneTagDebugWindow).__boneTag!.getState()
    return s.currentBone() ?? null
  })
}

async function getMax(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as BoneTagDebugWindow).__boneTag!.getState().max())
}

async function getStats(page: Page): Promise<{ played: number }> {
  return page.evaluate(() => (window as unknown as BoneTagDebugWindow).__boneTag!.getState().stats)
}

interface MeshHit {
  x: number
  y: number
  mesh: string
}

/** Probes a grid of screen points via the same raycast used by the hold gesture, returning up to `limit` points that hit distinct meshes. */
async function scanForMeshHits(page: Page, limit: number): Promise<MeshHit[]> {
  const hits: MeshHit[] = []
  const seen = new Set<string>()
  for (let y = 190; y <= HEIGHT - 90 && hits.length < limit; y += 32) {
    for (let x = 18; x <= WIDTH - 18 && hits.length < limit; x += 32) {
      const mesh = await page.evaluate(
        ({ x, y }) => (window as unknown as BoneTagDebugWindow).__boneTagRaycast!(x, y),
        { x, y },
      )
      if (mesh && !seen.has(mesh)) {
        seen.add(mesh)
        hits.push({ x, y, mesh })
      }
    }
  }
  return hits
}

/** Whether the target's own mesh material differs (object identity) from an untouched mesh's — evidence the Reveal highlight applied. */
async function targetMaterialSwapped(page: Page, targetMeshName: string, otherMeshName: string): Promise<boolean> {
  return page.evaluate(
    ({ targetMeshName, otherMeshName }) => {
      const w = window as unknown as BoneTagDebugWindow
      const tm = w.__boneTagGetMesh!(targetMeshName)
      const om = w.__boneTagGetMesh!(otherMeshName)
      return !!tm && !!om && tm.material !== om.material
    },
    { targetMeshName, otherMeshName },
  )
}

async function holdAt(page: Page, x: number, y: number, midHoldScreenshot?: string): Promise<void> {
  await page.mouse.move(x, y)
  await page.mouse.down()
  if (midHoldScreenshot) {
    await page.waitForTimeout(200)
    await page.screenshot({ path: midHoldScreenshot })
    await page.waitForTimeout(HOLD_HOLD_MS - 200)
  } else {
    await page.waitForTimeout(HOLD_HOLD_MS)
  }
  await page.mouse.up()
}

/** Plays one round: scans for a bone hit, holds on it, asserts the round advanced, then advances to the next round/summary. */
async function playRound(
  page: Page,
  roundIndex: number,
  opts: { midHoldScreenshot?: string; roundResultScreenshot?: string } = {},
): Promise<void> {
  const target = await getCurrentBone(page)
  expect(target, `expected a current bone at round ${roundIndex}`).not.toBeNull()

  const hits = await scanForMeshHits(page, 4)
  expect(hits.length, 'expected at least one screen point to hit a bone mesh').toBeGreaterThan(0)

  const resultsBefore = await getResultsLength(page)
  const primary = hits[0]

  await holdAt(page, primary.x, primary.y, opts.midHoldScreenshot)

  await expect.poll(() => getPhase(page)).toBe('roundResult')
  expect(await getResultsLength(page)).toBe(resultsBefore + 1)

  await expect(page.locator('.round-result-card')).toBeVisible()
  await expect(page.locator('.round-result-heading')).not.toBeEmpty()
  await expect(page.locator('.round-result-points')).toContainText(/pts|×/)

  const other = hits.slice(1).find((h) => target && !target.meshNames.includes(h.mesh))
  if (other && target) {
    const swapped = await targetMaterialSwapped(page, target.meshNames[0], other.mesh)
    expect(swapped, 'expected the target bone mesh material to change during reveal').toBe(true)
  }

  if (opts.roundResultScreenshot) {
    await page.screenshot({ path: opts.roundResultScreenshot })
  }

  const button = page.getByRole('button', { name: /Next bone|See results/ })
  await button.click()
}

test.describe('Bone Tag smoke', () => {
  test('fresh state through howto, miss, five rounds, and summary restore', async ({ page }) => {
    const errors = attachConsoleGuard(page)

    await gotoFresh(page)

    await expect.poll(() => getPhase(page), { timeout: 30_000 }).toBe('howto')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByText('How to play')).toBeVisible()
    await page.screenshot({ path: `${SHOTS_DIR}/howto.png` })

    await page.getByRole('button', { name: "Let's go" }).click()
    await expect.poll(() => getPhase(page)).toBe('playing')

    const firstBone = await getCurrentBone(page)
    expect(firstBone).not.toBeNull()
    await expect(page.locator('.bt-prompt')).toContainText('Find the')
    await expect(page.locator('.bt-prompt')).toContainText(firstBone!.displayName)
    await page.screenshot({ path: `${SHOTS_DIR}/playing.png` })

    // Hold on empty space (top-left corner, outside the skeleton and any HUD button).
    await holdAt(page, 5, 5)
    const missHintAt = await page.evaluate(
      () => (window as unknown as BoneTagDebugWindow).__boneTag!.getState().missHintAt,
    )
    expect(missHintAt).not.toBeNull()
    expect(await getResultsLength(page)).toBe(0)
    await expect(page.getByText('Hold on a bone')).toBeVisible()
    // Let the miss toast's 1.5s fade fully finish so it doesn't bleed into the next screenshot.
    await page.waitForTimeout(1600)

    for (let i = 0; i < 5; i++) {
      await playRound(page, i, {
        midHoldScreenshot: i === 0 ? `${SHOTS_DIR}/mid-hold.png` : undefined,
        roundResultScreenshot: i === 0 ? `${SHOTS_DIR}/round-result.png` : undefined,
      })
    }

    await expect.poll(() => getPhase(page)).toBe('summary')
    await expect(page.locator('.bt-summary-card')).toBeVisible()

    const max = await getMax(page)
    const totalText = (await page.locator('.bt-summary__total').textContent()) ?? ''
    expect(totalText.replace(/,/g, '')).toContain(`/ ${max}`)

    const tileRowText = (await page.locator('.bt-tile-row').textContent()) ?? ''
    expect(tileRowText).toContain('|')
    const emojiCount = (tileRowText.match(/[🟩🟨🟥]/gu) ?? []).length
    expect(emojiCount).toBe(5)

    const stats = await getStats(page)
    expect(stats.played).toBe(1)
    await expect(page.locator('.bt-summary__stats')).toContainText('Played 1')

    await page.screenshot({ path: `${SHOTS_DIR}/summary.png` })

    // Reload after finishing the day: should restore straight to summary.
    await page.reload()
    await page.waitForFunction(() => !!(window as unknown as { __boneTag?: unknown }).__boneTag)
    await expect.poll(() => getPhase(page), { timeout: 30_000 }).toBe('summary')
    await expect(page.locator('.bt-summary-card')).toBeVisible()

    expect(errors, `unexpected console/page errors: ${JSON.stringify(errors)}`).toEqual([])
  })

  test('mid-game restore keeps progress after reload', async ({ page }) => {
    const errors = attachConsoleGuard(page)

    await gotoFresh(page)

    await expect.poll(() => getPhase(page), { timeout: 30_000 }).toBe('howto')
    await page.getByRole('button', { name: "Let's go" }).click()
    await expect.poll(() => getPhase(page)).toBe('playing')

    await playRound(page, 0)
    await expect.poll(() => getPhase(page)).toBe('playing')
    await playRound(page, 1)

    await expect.poll(() => getRoundIndex(page)).toBe(2)

    await page.reload()
    await page.waitForFunction(() => !!(window as unknown as { __boneTag?: unknown }).__boneTag)

    await expect.poll(() => getPhase(page), { timeout: 30_000 }).toBe('playing')
    expect(await getRoundIndex(page)).toBe(2)
    await expect(page.locator('.bt-hud__bar')).toBeVisible()

    expect(errors, `unexpected console/page errors: ${JSON.stringify(errors)}`).toEqual([])
  })
})
