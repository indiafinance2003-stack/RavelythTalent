import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NODE_ENV: "development",
      APP_URL: process.env.APP_URL ?? baseURL,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://ravelyth_app:test-only@127.0.0.1:5432/ravelyth",
      SESSION_SECRET:
        process.env.SESSION_SECRET ?? "playwright-only-session-secret-32-bytes-minimum",
      CRON_SECRET: process.env.CRON_SECRET ?? "playwright-only-cron-secret",
      UPLOAD_DIR: process.env.UPLOAD_DIR ?? ".\\uploads-playwright",
    },
  },
});
