import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const chromiumPath = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? (process.env.PLAYWRIGHT_BROWSERS_PATH ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "America/New_York",
    locale: "en-US",
    trace: "retain-on-failure",
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : {},
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: [
    {
      command: "node tests/support/fake-anthropic.mjs",
      url: "http://127.0.0.1:4010/__requests",
      reuseExistingServer: false,
    },
    {
      // Production build, with the AI pointed at the local fake.
      command: `npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ANTHROPIC_API_KEY: "test-key",
        ANTHROPIC_BASE_URL: "http://127.0.0.1:4010",
        APP_URL: `http://localhost:${PORT}`,
        CRON_SECRET: "e2e-cron-secret",
        RESEND_API_KEY: "",
        REMINDER_EMAIL_FROM: "",
      },
    },
  ],
});
