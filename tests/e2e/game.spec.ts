import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
const widths = [360, 390, 768, 1440, 1920];
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function captureState(page: Page, state: string) {
  const previous = page.viewportSize()!;
  for (const width of widths) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await noOverflow(page);
    const inaccessible = await page
      .locator("button:visible")
      .evaluateAll((buttons) =>
        buttons
          .filter((button) => !(button as HTMLButtonElement).disabled)
          .flatMap((button) => {
            const rect = button.getBoundingClientRect();
            return rect.height < 44 ||
              rect.width < 44 ||
              rect.left < 0 ||
              rect.right > innerWidth
              ? [button.textContent?.trim()]
              : [];
          }),
      );
    expect(
      inaccessible,
      `${state} at ${width}px: reachable 44px controls`,
    ).toEqual([]);
    await page.screenshot({
      path: `qa/${state}-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  }
  await page.setViewportSize(previous);
}
test("keyboard focus, reduced motion and long room labels at narrow widths", async ({
  page,
}) => {
  mkdirSync("qa", { recursive: true });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 360, height: 844 });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.locator(".brand")).toBeFocused();
  await page.keyboard.press("Tab");
  const play = page.getByRole("button", { name: "Let’s play" });
  await expect(play).toBeFocused();
  expect(await play.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe(
    "solid",
  );
  expect(await play.evaluate((el) => getComputedStyle(el).outlineWidth)).toBe(
    "3px",
  );
  expect(
    await play.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.screenshot({
    path: "qa/keyboard-360.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.keyboard.press("Enter");
  await page
    .getByLabel("Your name", { exact: true })
    .fill("Alexandria-Rose-Marie");
  await page.getByRole("button", { name: "Create our room" }).click();
  await expect(
    page.getByRole("heading", { name: "Set the mood." }),
  ).toBeVisible();
  await captureState(page, "long-name-lobby");
  await page.locator(".custom-details summary").click();
  await page.getByRole("button", { name: "Add a room question" }).click();
  await page
    .getByLabel("Question (")
    .fill("What little moment together would you happily relive? ".repeat(4));
  await page
    .getByRole("button", { name: "Save question", exact: true })
    .click();
  await captureState(page, "custom-question");
  // Reflow equivalent of a 1440px viewport at 200%; not a native browser-zoom test.
  await page.setViewportSize({ width: 720, height: 500 });
  await noOverflow(page);
  await expect(page.getByRole("button", { name: "I’m ready" })).toBeEnabled();
  await page.getByRole("button", { name: "Leave room", exact: false }).click();
});

test("responsive home, entry, lobby, all four mechanics, final results, replay and leave with two independent browsers", async ({
  browser,
}) => {
  mkdirSync("qa", { recursive: true });
  const errors: string[] = [];
  const aContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const bContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const a = await aContext.newPage(),
    b = await bContext.newPage();
  for (const p of [a, b]) {
    p.on("pageerror", (error) => errors.push(error.message));
  }
  try {
    await a.goto("/");
    await a.evaluate(() => document.fonts.ready);
    for (const width of widths) {
      await a.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await noOverflow(a);
      await a.screenshot({ path: `qa/home-${width}.png`, fullPage: true });
    }
    await a.getByRole("button", { name: "Let’s play" }).click();
    await a.getByLabel("Your name", { exact: true }).fill("Alex");
    await captureState(a, "create");
    await noOverflow(a);
    await a.screenshot({ path: "qa/entry-desktop.png", fullPage: true });
    await a.getByRole("button", { name: "Create our room" }).click();
    await expect(
      a.getByRole("heading", { name: "Set the mood." }),
    ).toBeVisible();
    const code = await a.locator(".room-code").innerText();
    await b.goto(`/?room=${code}`);
    await b.getByLabel("Your name", { exact: true }).fill("Sam");
    await captureState(b, "join");
    await b.screenshot({ path: "qa/entry-mobile.png", fullPage: true });
    await b.getByRole("button", { name: "Join your person" }).click();
    await expect(
      b.getByRole("heading", { name: "Set the mood." }),
    ).toBeVisible();
    await a.getByRole("button", { name: "5", exact: true }).click();
    await expect(
      b.getByRole("button", { name: "5", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await a.getByRole("button", { name: "No limit", exact: true }).click();
    // A temporary question uses the same editor and selection path as a real game.
    await a.locator(".custom-details summary").click();
    await a.getByRole("button", { name: "Add a room question" }).click();
    await a
      .getByLabel("Question (")
      .fill("Who is most likely to plan our next adventure?");
    await a.getByRole("button", { name: "Save question", exact: true }).click();
    await expect(a.locator(".custom-list li")).toHaveCount(1);
    await a.locator(".custom-details summary").click();
    for (const width of widths) {
      await a.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await noOverflow(a);
      await a.screenshot({ path: `qa/lobby-${width}.png`, fullPage: true });
    }
    await a.setViewportSize({ width: 1440, height: 1000 });
    await b.getByRole("button", { name: "I’m ready" }).click();
    await a.getByRole("button", { name: "I’m ready" }).click();
    await a.getByRole("button", { name: "Start our game" }).click();
    const modes = new Set<string>();
    for (let round = 0; round < 5; round++) {
      // A missing countdown can also mean the next round has not rendered yet.
      // Wait for the actual answer controls before inspecting the random mode.
      await expect(a.locator("#answer, .answer-option").first()).toBeVisible();
      await expect(b.locator("#answer, .answer-option").first()).toBeVisible();
      await expect(a.locator(".question-area h1")).toBeVisible();
      await expect(b.locator(".question-area h1")).toHaveText(
        await a.locator(".question-area h1").innerText(),
      );
      const mode = (await a.locator(".mode-ribbon .active").innerText())
        .replace(/[^a-zA-Z]+/g, "-")
        .replace(/^-|-$/g, "");
      modes.add(mode);
      await captureState(a, `answer-${mode}`);
      if (round === 0) {
        for (const width of widths) {
          await a.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
          await noOverflow(a);
          await a.screenshot({
            path: `qa/question-${width}.png`,
            fullPage: true,
          });
        }
        await a.setViewportSize({ width: 1440, height: 1000 });
        await bContext.setOffline(true);
        await expect(a.locator(".pause-panel")).toBeVisible();
        await captureState(a, "paused");
        await bContext.setOffline(false);
        await expect(
          a.locator("#answer, .answer-option").first(),
        ).toBeVisible();
        await expect(
          b.locator("#answer, .answer-option").first(),
        ).toBeVisible();
      }
      if (await a.locator("#answer").count()) {
        await Promise.all([
          a
            .locator("#answer")
            .fill("A picnic by the lake.\nWith our favorite snacks."),
          b.locator("#answer").fill("A picnic, good company, and snacks."),
        ]);
        await a.getByRole("button", { name: "Submit answer" }).click();
        await captureState(a, "submitted");
        await expect(b.locator(".reveal-grid")).toHaveCount(0);
        if (round === 0) {
          await b.reload();
          await expect(b.locator("#answer")).toBeVisible();
          await expect(
            b.getByText("A picnic by the lake.", { exact: false }),
          ).toHaveCount(0);
          await b
            .locator("#answer")
            .fill("A picnic, good company, and snacks.");
        }
        await b.getByRole("button", { name: "Submit answer" }).click();
        const aVotes = a.locator(".vote-options button").first(),
          bVotes = b.locator(".vote-options button").first();
        await expect(a.locator(".evaluation")).toBeVisible();
        await captureState(a, `evaluate-${mode}`);
        if (await aVotes.count()) await aVotes.click();
        if (await bVotes.count()) await bVotes.click();
      } else {
        await expect(a.locator(".answer-option").first()).toBeVisible();
        if (round === 0) {
          await a.locator(".answer-option").first().click();
          await b.reload();
          await expect(b.locator(".answer-option").first()).toBeVisible();
          await expect(b.locator(".reveal-grid")).toHaveCount(0);
          await b.locator(".answer-option").first().click();
        } else {
          await Promise.all([
            a.locator(".answer-option").first().click(),
            b.locator(".answer-option").first().click(),
          ]);
        }
      }
      await expect(a.locator(".round-result")).toBeVisible();
      await expect(b.locator(".round-result")).toBeVisible();
      await captureState(a, `reveal-${mode}`);
      await noOverflow(b);
      if (round === 0) {
        await a.screenshot({ path: "qa/reveal-desktop.png", fullPage: true });
        await b.screenshot({ path: "qa/reveal-mobile.png", fullPage: true });
      }
      await a.getByRole("button", { name: /^Continue/ }).click();
      await expect(
        a.getByRole("button", {
          name: "Waiting for your partner",
          exact: false,
        }),
      ).toBeDisabled();
      await b.getByRole("button", { name: /^Continue/ }).click();
      if (round < 4)
        await expect(a.locator(".round-topline")).toContainText(
          `0${round + 2}`,
        );
    }
    expect(modes.size).toBe(4);
    await expect(a.locator(".final-screen")).toBeVisible();
    await expect(b.locator(".final-screen")).toBeVisible();
    for (const width of widths) {
      await a.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      await noOverflow(a);
      await a.screenshot({ path: `qa/results-${width}.png`, fullPage: true });
    }
    await b.getByRole("button", { name: "Play again" }).click();
    await expect(a.getByRole("button", { name: "I’m ready" })).toBeVisible();
    await expect(
      a.getByRole("button", { name: "Start our game" }),
    ).toBeDisabled();
    await a.getByRole("button", { name: "Leave room", exact: false }).click();
    await expect(a.getByRole("button", { name: "Let’s play" })).toBeVisible();
    await b.getByRole("button", { name: "Leave room", exact: false }).click();
    expect(errors).toEqual([]);
  } finally {
    await aContext.close();
    await bContext.close();
  }
});
