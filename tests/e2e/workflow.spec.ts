import { expect, test, type Page } from "@playwright/test";
import { ask, clearFakeAIRequests, fakeAIRequests, logIn, newAccount, signUp } from "./helpers";

const SHOTS = "docs/screenshots";

async function addPersonManually(page: Page, p: { name: string; relationship: string; month?: string; day?: string; memory?: string; email?: string }) {
  await page.goto("/people/new");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(p.name);
  await page.getByRole("combobox", { name: "Relationship" }).fill(p.relationship);
  if (p.month) {
    await page.getByRole("combobox", { name: "Birthday month" }).selectOption({ label: p.month });
    await page.getByRole("combobox", { name: "Birthday day" }).selectOption(p.day!);
  }
  if (p.email) await page.getByRole("textbox", { name: "Email (optional)" }).fill(p.email);
  if (p.memory) await page.getByRole("textbox", { name: "Something to remember (optional)" }).fill(p.memory);
  await page.getByRole("button", { name: "Save person" }).click();
  await expect(page.getByRole("heading", { level: 1, name: p.name })).toBeVisible();
}

test("remember → save → get reminded → take action", async ({ page, browser }) => {
  const account = newAccount("Iza");
  await signUp(page, account);

  // 1. Add a person manually, with a yearly birthday reminder.
  await addPersonManually(page, {
    name: "Anna Smith",
    relationship: "Friend",
    month: "May",
    day: "12",
    email: "anna@example.com",
    memory: "Loves tennis\nWants to visit Italy",
  });
  await expect(page.getByText("May 12", { exact: true })).toBeVisible();
  await expect(page.getByText("reminder on")).toBeVisible();
  await expect(page.getByText("Loves tennis")).toBeVisible();
  await expect(page.getByText("Wants to visit Italy")).toBeVisible();

  // Add, edit and delete a memory on the profile.
  await page.getByRole("textbox", { name: "Add a memory about Anna" }).fill("Favorite color is blue");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByText("Favorite color is blue")).toBeVisible();
  await page.getByRole("button", { name: "Edit “Favorite color is blue”" }).click();
  await page.getByRole("textbox", { name: "Edit memory" }).fill("Favorite color is navy blue");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Favorite color is navy blue")).toBeVisible();
  await page.getByRole("button", { name: "Delete “Favorite color is navy blue”" }).click();
  await expect(page.getByText("Favorite color is navy blue")).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/person.png`, fullPage: true });

  // 2. Tell Pingly about someone new — nothing is saved until confirmed.
  await clearFakeAIRequests();
  await page.getByRole("link", { name: "Ask AI" }).click();
  await expect(page.getByRole("heading", { name: "Ask Pingly" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/ask-empty.png` });
  await ask(page, "I met Emily today. She's a designer and loves hiking.");
  const emilyCard = page.getByTestId("proposal").filter({ hasText: "New person" });
  await expect(emilyCard).toContainText("Emily");
  await expect(emilyCard).toContainText("Loves hiking");
  await page.screenshot({ path: `${SHOTS}/ask-confirm.png` });

  // Privacy: the AI request contained no other contacts and no contact details.
  const [first] = await fakeAIRequests();
  const sent = JSON.stringify(first.body.messages);
  expect(sent).not.toContain("Anna");
  expect(sent).not.toContain("anna@example.com");
  expect(sent).not.toContain("tennis");

  await emilyCard.getByRole("button", { name: "Save" }).click();
  await expect(emilyCard).toContainText("Saved");

  // 3. Get reminded — create a reminder in natural language.
  await ask(page, "Remind me to ask Emily about her new project next Friday.");
  const reminderCard = page.getByTestId("proposal").filter({ hasText: "Ask Emily about the new project" });
  await expect(reminderCard).toContainText("9:00 AM");
  await reminderCard.getByRole("button", { name: "Save" }).click();
  await expect(reminderCard).toContainText("Saved");

  // A new person and a reminder in one go.
  await ask(page, "Remind me to call Mom tomorrow at 6 PM");
  await expect(page.getByTestId("proposal").filter({ hasText: "Call Mom" })).toContainText("Save Mom first");
  await page.getByRole("button", { name: "Save all" }).click();
  await expect(page.getByTestId("proposal").filter({ hasText: "Call Mom" })).toContainText("Saved");

  // AI retrieves saved memories, and only for the person asked about.
  await clearFakeAIRequests();
  await ask(page, "What do I remember about Emily?");
  await expect(page.getByTestId("assistant-message").last()).toContainText("Loves hiking");
  const [recall] = await fakeAIRequests();
  const recallText = JSON.stringify(recall.body.messages[recall.body.messages.length - 1]);
  expect(recallText).toContain("Loves hiking");
  expect(recallText).not.toContain("Wants to visit Italy");

  // 4. Take action — draft a message.
  await ask(page, "Write a friendly follow-up to Emily");
  await expect(page.getByTestId("draft")).toContainText("Hi Emily!");

  // Reminders appear on Today.
  await page.getByRole("link", { name: "Today" }).click();
  await expect(page.getByRole("heading", { name: "Call Mom" })).toBeVisible();
  await expect(page.getByText("Tomorrow · 6:00 PM")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ask Emily about the new project" })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/today.png`, fullPage: true });

  // Complete one, reschedule another.
  const callMom = page.getByRole("article", { name: "Call Mom" });
  await callMom.getByRole("button", { name: "Later" }).click();
  await callMom.getByRole("menuitem", { name: "Next week" }).click();
  await expect(page.getByRole("article", { name: "Call Mom" })).toBeVisible();
  const emilyReminder = page.getByRole("article", { name: "Ask Emily about the new project" });
  await emilyReminder.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("article", { name: "Ask Emily about the new project" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("article", { name: "Ask Emily about the new project" })).toHaveCount(0);

  // Completed reminder shows in Emily's history.
  await page.goto("/people");
  await page.getByRole("link", { name: /Emily/ }).click();
  await expect(page.getByText("History")).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Ask Emily about the new project" })).toBeVisible();

  // People search.
  await page.goto("/people");
  await page.screenshot({ path: `${SHOTS}/people.png` });
  await page.getByPlaceholder(/Search/).fill("emi");
  await expect(page.getByRole("link", { name: /Emily/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Anna Smith/ })).toHaveCount(0);

  // Saved data syncs to another device/session.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await logIn(otherPage, account);
  await otherPage.goto("/people");
  await expect(otherPage.getByRole("link", { name: /Emily/ })).toBeVisible();
  await expect(otherPage.getByRole("link", { name: /Mom/ })).toBeVisible();
  await other.close();
});

test("conflicts and ambiguity are never resolved silently", async ({ page }) => {
  await signUp(page, newAccount("Sam"));
  await addPersonManually(page, { name: "Anna Smith", relationship: "Friend", month: "May", day: "10" });

  await page.goto("/ask");
  await ask(page, "Anna loves tennis, her birthday is May 12, and she just started working at Google.");
  const update = page.getByTestId("proposal").filter({ hasText: "Update Anna Smith" });
  await expect(update).toContainText("May 10");
  await expect(update).toContainText("May 12");
  await expect(update).toContainText("replaces saved value");
  // Not saved until the user confirms.
  await page.goto("/people");
  await page.getByRole("link", { name: /Anna Smith/ }).click();
  await expect(page.getByText("May 10", { exact: true })).toBeVisible();

  // Two people named Anna → Pingly asks which one.
  await addPersonManually(page, { name: "Anna Lee", relationship: "Coworker" });
  await page.goto("/ask");
  await page.getByRole("button", { name: "New chat" }).click();
  await ask(page, "Anna loves tennis, her birthday is May 12, and she just started working at Google.");
  await expect(page.getByRole("button", { name: "Anna Smith (Friend)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Anna Lee (Coworker)" })).toBeVisible();
  await expect(page.getByTestId("proposal")).toHaveCount(0);
});

test("users cannot see each other's people", async ({ page, browser }) => {
  await signUp(page, newAccount("Owner"));
  await addPersonManually(page, { name: "Secret Person", relationship: "Friend", memory: "Private detail" });
  const privateUrl = page.url();

  const other = await browser.newContext();
  const intruder = await other.newPage();
  await signUp(intruder, newAccount("Intruder"));
  await intruder.goto("/people");
  await expect(intruder.getByText("No one here yet")).toBeVisible();
  await intruder.goto(privateUrl);
  await expect(intruder.getByRole("heading", { name: "Person not found" })).toBeVisible();
  await expect(intruder.getByText("Private detail")).toHaveCount(0);
  await other.close();
});

test("delete account removes everything", async ({ page }) => {
  const account = newAccount("Temp");
  await signUp(page, account);
  await addPersonManually(page, { name: "Short Lived", relationship: "Friend" });
  await page.goto("/account");
  await page.getByText("Delete account").click();
  await page.getByRole("textbox", { name: "Type DELETE to confirm" }).fill("DELETE");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByRole("textbox", { name: "Password" }).fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
});
