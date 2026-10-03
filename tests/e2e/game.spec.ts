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
    await noOverflow(a);
    await a.screenshot({ path: "qa/entry-desktop.png", fullPage: true });
    await a.getByRole("button", { name: "Create our room" }).click();
    await expect(
      a.getByRole("heading", { name: "Set the mood." }),
    ).toBeVisible();
    const code = await a.locator(".room-code").innerText();
    await b.goto(`/?room=${code}`);
    await b.getByLabel("Your name", { exact: true }).fill("Sam");
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
      await expect(a.locator(".countdown-stage")).not.toBeVisible();
      await expect(a.locator(".question-area h1")).toBeVisible();
      await expect(b.locator(".question-area h1")).toHaveText(
        await a.locator(".question-area h1").innerText(),
      );
      modes.add(await a.locator(".mode-ribbon .active").innerText());
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
      }
      if (await a.locator("#answer").count()) {
        await Promise.all([
          a
            .locator("#answer")
            .fill("A picnic by the lake.\nWith our favorite snacks."),
          b.locator("#answer").fill("A picnic, good company, and snacks."),
        ]);
        await a.getByRole("button", { name: "Submit answer" }).click();
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
