import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(configDirectory, ".env.playwright");

// Load credentials before Playwright evaluates the test files.
dotenv.config({ path: envFile, override: false });

export default defineConfig({
  testDir: "./tests",
  testMatch: "login-regression.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  timeout: 30_000,
  expect: { timeout: 7_500 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    headless: process.env.PLAYWRIGHT_HEADLESS === "true",
    extraHTTPHeaders: { "ngrok-skip-browser-warning": "true" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
