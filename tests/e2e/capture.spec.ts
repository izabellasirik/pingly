import { expect, test } from "@playwright/test";
import { newAccount, signUp } from "./helpers";

test("the Today capture box hands off to Ask AI", async ({ page }) => {
  await signUp(page, newAccount("Kai"));
  await page.getByRole("textbox", { name: "Tell Pingly something" }).fill("I met Priya today. She's a nurse and loves climbing.");
  await page.getByRole("button", { name: "Send to Pingly" }).click();
  await expect(page).toHaveURL(/\/ask$/);
  const card = page.getByTestId("proposal").filter({ hasText: "Priya" });
  await expect(card).toContainText("Loves climbing");
  // Nothing is saved before confirming.
  await page.getByRole("link", { name: "People" }).click();
  await expect(page.getByText("No one here yet")).toBeVisible();
  // The conversation survives navigation within the tab.
  await page.getByRole("link", { name: "Ask AI" }).click();
  await page.getByTestId("proposal").filter({ hasText: "Priya" }).getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("proposal").filter({ hasText: "Priya" })).toContainText("Saved");
  await page.getByRole("link", { name: "People" }).click();
  await expect(page.getByRole("link", { name: /Priya/ })).toBeVisible();
});

test.describe("desktop and dark mode", () => {
  test.use({ viewport: { width: 1280, height: 860 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 });

  test("screenshots", async ({ page }) => {
    await signUp(page, newAccount("Alex"));
    await page.getByRole("textbox", { name: "Tell Pingly something" }).fill("I met Leo today. He's a chef and loves jazz.");
    await page.getByRole("button", { name: "Send to Pingly" }).click();
    await page.getByTestId("proposal").getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("proposal")).toContainText("Saved");
    await page.getByRole("textbox", { name: "Message Pingly" }).fill("Remind me to call Leo tomorrow at 6 PM");
    await page.getByRole("textbox", { name: "Message Pingly" }).press("Enter");
    await page.getByTestId("proposal").filter({ hasText: "Call Leo" }).getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("proposal").filter({ hasText: "Call Leo" })).toContainText("Saved");
    await page.screenshot({ path: "docs/screenshots/desktop-ask.png" });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Call Leo" })).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/desktop-today.png" });
    await page.emulateMedia({ colorScheme: "dark" });
    await page.waitForTimeout(400); // let color transitions finish
    await page.screenshot({ path: "docs/screenshots/desktop-today-dark.png" });
  });
});
