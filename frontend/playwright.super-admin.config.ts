import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";

const configDirectory = process.cwd();
const envFile = path.resolve(configDirectory, ".env.playwright");

// Keep the Super Admin workspace suite isolated from login-regression.spec.ts.
dotenv.config({ path: envFile, override: false });

export default defineConfig({
  testDir: "./tests",
  testMatch: "super-admin-workspace-regression.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    headless: process.env.PLAYWRIGHT_HEADLESS !== "false",
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
