import { expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

export type Account = { email: string; password: string; name: string };

export function newAccount(name = "Iza"): Account {
  return { email: `e2e-${randomUUID()}@example.com`, password: `pw-${randomUUID().slice(0, 12)}`, name };
}

export async function signUp(page: Page, account: Account) {
  await page.goto("/signup");
  await page.getByRole("textbox", { name: "Your first name" }).fill(account.name);
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByRole("textbox", { name: /^Password/ }).fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(account.name);
}

export async function logIn(page: Page, account: Account) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByRole("textbox", { name: "Password" }).fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/$/);
}

export async function ask(page: Page, text: string) {
  const input = page.getByRole("textbox", { name: "Message Pingly" });
  await input.fill(text);
  await input.press("Enter");
  // Wait for the answer to this message.
  await expect(page.getByRole("status", { name: "Pingly is thinking" })).toHaveCount(0, { timeout: 20_000 });
}

export async function fakeAIRequests(): Promise<{ body: { messages: { content: string }[]; system: unknown } }[]> {
  const res = await fetch("http://127.0.0.1:4010/__requests");
  return res.json();
}

export async function clearFakeAIRequests() {
  await fetch("http://127.0.0.1:4010/__requests", { method: "DELETE" });
}
