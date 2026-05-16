import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 90_000,
  expect: {
    timeout: 20_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:3000",
    headless: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: [
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream"
      ]
    }
  },
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000/health",
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    {
      name: "chromium-desktop",
      testMatch: /.*ui\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"]
      }
    },
    {
      name: "chromium-mobile",
      testMatch: /.*ui\.spec\.mjs/,
      use: {
        ...devices["Pixel 5"],
        permissions: ["microphone"]
      }
    },
    {
      name: "chromium-live",
      testMatch: /.*live\.spec\.mjs/,
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone"]
      }
    }
  ]
});
