import { defineConfig, devices } from "@playwright/test";

// 获取命令行参数
const targetUrl = process.env.TARGET_URL || "http://localhost:8080";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "html",
  use: {
    baseURL: targetUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // 只在本地测试时启动服务器
  webServer:
    targetUrl === "http://localhost:8080"
      ? {
          command: "pnpm serve",
          url: "http://localhost:8080",
          reuseExistingServer: !process.env.CI,
        }
      : undefined,
});
