import { expect, test } from "@playwright/test";
import { logIn, newAccount, signUp } from "./helpers";

test("signed-out visitors are sent to login", async ({ page }) => {
  await page.goto("/people");
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/ask");
  await expect(page).toHaveURL(/\/login$/);
});

test("sign up, sign out, and log back in", async ({ page }) => {
  const account = newAccount("Jordan");
  await signUp(page, account);
  await expect(page.getByText("Welcome to Pingly")).toBeVisible();

  await page.getByRole("link", { name: "Account" }).click();
  await expect(page.getByText(account.email)).toBeVisible();
  await expect(page.getByText("Time zone: America/New_York")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByRole("textbox", { name: "Password" }).fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();

  await logIn(page, account);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Jordan");
});

test("the reminder job requires its secret and is honest about email config", async ({ request }) => {
  expect((await request.get("/api/cron/reminders")).status()).toBe(401);
  const res = await request.get("/api/cron/reminders", { headers: { Authorization: "Bearer e2e-cron-secret" } });
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.configured).toBe(false);
  expect(body.sent).toBe(0);
  expect(body.warning).toContain("Email is not configured");
});

test("password reset by email link", async ({ page }) => {
  const account = newAccount("Robin");
  await signUp(page, account);
  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto("/forgot");
  await page.getByRole("textbox", { name: "Email" }).fill(account.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If that email has an account")).toBeVisible();

  // Local Supabase delivers auth email to Mailpit.
  let link: string | undefined;
  await expect
    .poll(async () => {
      const search = await (await fetch(`http://127.0.0.1:54324/api/v1/search?query=${encodeURIComponent(`to:"${account.email}"`)}`)).json();
      const id = search.messages?.[0]?.ID;
      if (!id) return undefined;
      const msg = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`)).json();
      link = /https?:\/\/[^\s"<>]+verify[^\s"<>]+/.exec(msg.HTML ?? msg.Text)?.[0]?.replace(/&amp;/g, "&");
      return link;
    }, { timeout: 15_000 })
    .toBeTruthy();

  // Follow Supabase's verify step server-side (the sandboxed browser can't
  // reach the local auth server directly), then open the app link it
  // redirects to. The code exchange itself happens in the browser.
  const verify = await fetch(link!, { redirect: "manual" });
  const appLink = verify.headers.get("location")!;
  expect(appLink).toContain("/auth/confirm");
  await page.goto(appLink);
  await expect(page).toHaveURL(/\/reset-password$/);
  const newPassword = "a-brand-new-password";
  await page.getByRole("textbox", { name: /New password/ }).fill(newPassword);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/account");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await logIn(page, { ...account, password: newPassword });
});
