import { test, expect } from "@playwright/test";

test("optional packs stay off by default, synchronize and require a fresh Ready", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  const button = (page: typeof host, name: string) =>
    page.getByRole("button", { name, exact: false });
  try {
    await host.goto("/");
    await button(host, "Let’s play").click();
    await host.getByLabel("Your name", { exact: true }).fill("Pack host");
    await button(host, "Create our room").click();
    await expect(host.locator(".availability")).toContainText(
      "200 questions available",
    );
    const code = await host.locator(".room-code").innerText();
    await guest.goto(`/?room=${code}`);
    await guest.getByLabel("Your name", { exact: true }).fill("Pack guest");
    await button(guest, "Join your person").click();
    for (const page of [host, guest]) {
      await expect(button(page, "Spicy (18+)")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(button(page, "Dark humor")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
    await expect(button(guest, "Spicy (18+)")).toBeDisabled();
    await button(host, "I’m ready").click();
    await button(guest, "I’m ready").click();
    await expect(button(host, "Start our game")).toBeEnabled();
    await button(host, "Spicy (18+)").click();
    await expect(button(guest, "Spicy (18+)")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(button(host, "I’m ready")).toBeVisible();
    await expect(button(guest, "I’m ready")).toBeVisible();
    await expect(button(host, "Start our game")).toBeDisabled();
    await button(host, "All standard packs").click();
    await expect(host.locator(".availability")).toContainText(
      "40 questions available",
    );
    await expect(button(host, "Spicy (18+)")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await button(host, "Dark humor").click();
    await expect(host.locator(".availability")).toContainText(
      "80 questions available",
    );
    await button(host, "Spicy (18+)").click();
    await expect(host.locator(".availability")).toContainText(
      "40 questions available",
    );
    await button(host, "All standard packs").click();
    await expect(host.locator(".availability")).toContainText(
      "240 questions available",
    );
    await expect(button(host, "Spicy (18+)")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(button(host, "Dark humor")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await button(host, "All standard packs").click();
    await button(host, "Dark humor").click();
    await expect(host.locator(".availability")).toContainText(
      "0 questions available",
    );
    await expect(host.getByText(/Only 0 questions available/)).toBeVisible();
    await button(host, "Spicy (18+)").click();
    await host.reload();
    await expect(button(host, "Spicy (18+)")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(button(guest, "Spicy (18+)")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await button(host, "This or That").click();
    await host.getByRole("button", { name: "5", exact: true }).click();
    await button(host, "No limit").click();
    await expect(guest.locator(".availability")).toContainText(
      "10 questions available",
    );
    for (const width of [360, 390, 768, 1440, 1920]) {
      await host.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      expect(
        await host.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await button(host, "Spicy (18+)").scrollIntoViewIfNeeded();
      await host.screenshot({
        path: `qa/optional-packs-${width}.png`,
        fullPage: true,
      });
    }
    await button(host, "I’m ready").click();
    await button(guest, "I’m ready").click();
    await button(host, "Start our game").click();
    await expect(host.locator(".question-area h1")).toBeVisible();
    await expect(guest.locator(".question-area h1")).toHaveText(
      await host.locator(".question-area h1").innerText(),
    );
    await expect(host.locator(".question-area")).toContainText("Spicy (18+)");
    await host.locator(".answer-option").first().click();
    await expect(guest.locator(".reveal-grid")).toHaveCount(0);
    await guest.locator(".answer-option").first().click();
    await expect(host.locator(".round-result")).toBeVisible();
    await expect(guest.locator(".round-result")).toBeVisible();
    await button(host, "Leave room").click();
    await button(guest, "Leave room").click();
  } finally {
    await hostContext.close();
    await guestContext.close();
  }
});
