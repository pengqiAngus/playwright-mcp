import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs";
import path from "path";
import { VisualTestConfig, VisualTestResult } from "./types";
import { z } from "zod";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create screenshots directory
const getProjectRoot = () => {
    // Try to get project root from environment variable
    const projectRoot = process.env.PROJECT_ROOT;
    if (projectRoot) {
        return projectRoot;
    }
    
    // If environment variable is not set, try to derive from current file path
    const currentDir = __dirname;
    // If in node_modules, search upwards until project root is found
    if (currentDir.includes('node_modules')) {
        const parts = currentDir.split(path.sep);
        const nodeModulesIndex = parts.indexOf('node_modules');
        return parts.slice(0, nodeModulesIndex).join(path.sep);
    }
    
    // If in dist directory, return parent directory
    return path.dirname(currentDir);
};

const projectRoot = getProjectRoot();
const screenshotsDir = path.join(projectRoot, "screenshots");
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}

// Login function
async function login(page: any, loginConfig: VisualTestConfig["login"]) {
  if (!loginConfig) return;

  await page.goto(loginConfig.url);
  await page.waitForSelector(loginConfig.usernameSelector);
  await page.waitForSelector(loginConfig.passwordSelector);
  await page.waitForSelector(loginConfig.submitSelector);

  await page.fill(loginConfig.usernameSelector, loginConfig.username);
  await page.fill(loginConfig.passwordSelector, loginConfig.password);
  await page.click(loginConfig.submitSelector);

  if (loginConfig.successSelector) {
    await page.waitForSelector(loginConfig.successSelector);
  } else {
    await page.waitForNavigation();
  }
}

// Auto login function
async function autoLogin(page: any, config: VisualTestConfig["autoLogin"]) {
  if (!config) return false;

  try {
    // Wait for login form elements to appear
    await page.waitForSelector(config.usernameSelector);
    await page.waitForSelector(config.passwordSelector);
    await page.waitForSelector(config.submitSelector);

    // Enter username and password
    await page.fill(config.usernameSelector, config.username);
    await page.fill(config.passwordSelector, config.password);

    // Click login button
    await page.click(config.submitSelector);

    // Wait for login success
    if (config.successSelector) {
      await page.waitForSelector(config.successSelector);
    } else {
      await page.waitForNavigation();
    }

    return true;
  } catch (error) {
    console.error("Auto login failed:", error);
    return false;
  }
}

// Check if redirected to login page
async function checkLoginRedirect(page: any, config: VisualTestConfig) {
  if (!config.autoLogin) return false;

  const currentUrl = page.url();
  const loginUrlPattern = new RegExp(
    config.autoLogin.loginUrlPattern || /login|signin|auth/i
  );

  if (loginUrlPattern.test(currentUrl)) {
    console.log("Detected login page redirect, attempting auto login...");
    const loginSuccess = await autoLogin(page, config.autoLogin);
    if (loginSuccess) {
        // Login successful, revisiting target page
    console.log("Login successful, revisiting target page");
      await page.goto(config.url);
      await page.waitForLoadState("networkidle");
      return true;
    }
  }

  return false;
}

// Perform visual comparison test
async function runVisualTest(config: VisualTestConfig): Promise<VisualTestResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Set viewport size
    const defaultViewport = { width: 1280, height: 720 };
    await page.setViewportSize({
      width: config.viewport?.width ?? defaultViewport.width,
      height: config.viewport?.height ?? defaultViewport.height
    });

    // If need to login, do login first
    if (config.login) {
      await login(page, config.login);
    }

    // Access target page
    await page.goto(config.url);
    await page.waitForLoadState("networkidle");

    // Check if redirected to login page
    await checkLoginRedirect(page, config);

    // Wait for specified element to appear
    if (config.waitForSelector) {
      await page.waitForSelector(config.waitForSelector);
    }

    // Wait for specified time
    if (config.waitForTimeout) {
      await page.waitForTimeout(config.waitForTimeout);
    }

    // Hide elements to ignore
    if (config.ignoreSelectors?.length) {
      await page.evaluate((selectors) => {
        selectors.forEach((selector) => {
          const elements = document.querySelectorAll(selector);
          elements.forEach((el) => {
            (el as HTMLElement).style.visibility = "hidden";
          });
        });
      }, config.ignoreSelectors);
    }

    // Get page screenshot
    const screenshot = await page.screenshot({
      fullPage: !config.selector,
      type: "png",
      ...(config.selector ? { selector: config.selector } : {}),
    });
    console.log("Successfully captured page screenshot");
    // Save current screenshot
    const currentScreenshotPath = path.join(screenshotsDir, "current.png");
    fs.writeFileSync(currentScreenshotPath, screenshot);

    // Baseline screenshot path
    const baselineScreenshotPath = path.join(screenshotsDir, "baseline.png");
    
    // Prioritize checking if baseline image already exists
    if (fs.existsSync(baselineScreenshotPath) ) {
      console.log("Using existing baseline image", baselineScreenshotPath);
    }
    // If provided baseline image path, read from that path
    else if (config.baselineImagePath) {
      try {
        const baselineBuffer = fs.readFileSync(config.baselineImagePath);
        fs.writeFileSync(baselineScreenshotPath, baselineBuffer);
        console.log("Successfully read baseline image from specified path", baselineScreenshotPath);
      } catch (error) {
        console.error("Failed to read baseline image from specified path:", error);
        return {
          success: false,
          error: `Failed to read baseline image: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
    // If provided baseline image data
    else if (config.baselineImage) {
      let baselineBuffer: Buffer;
      if (Buffer.isBuffer(config.baselineImage)) {
        baselineBuffer = config.baselineImage;
      } else {
        baselineBuffer = Buffer.from(config.baselineImage, "base64");
      }
      fs.writeFileSync(baselineScreenshotPath, baselineBuffer);
      console.log("Successfully saved baseline image data");
    }
    // If baseline screenshot does not exist, use current screenshot as baseline
    else {
      fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
      console.log("Created new baseline image");
      return {
        success: true,
        message: "New baseline screenshot created",
        baselineCreated: true,
      };
    }

    // Read baseline screenshot and current screenshot
    const baseline = PNG.sync.read(fs.readFileSync(baselineScreenshotPath));
    const current = PNG.sync.read(screenshot);

    // Check if image dimensions match
    if (
      baseline.width !== current.width ||
      baseline.height !== current.height
    ) {
      fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
      return {
        success: true,
        message: "Baseline screenshot updated",
        baselineUpdated: true,
      };
    }

    // Create difference image
    const { width, height } = baseline;
    const diff = new PNG({ width, height });
    const numDiffPixels = pixelmatch(
      baseline.data,
      current.data,
      diff.data,
      width,
      height,
      { threshold: config.threshold ? config.threshold / 100 : 0.1 }
    );
    // Save difference image
    fs.writeFileSync(
      path.join(screenshotsDir, "diff.png"),
      PNG.sync.write(diff)
    );
    console.log("Created difference image successfully");

    return {
      success: true,
      message: "Created difference image successfully",
      diffPixels: numDiffPixels,
      threshold: config.threshold || 100,
      passed: numDiffPixels < (config.threshold || 100),
    };
  } catch (error) {
    console.error("Visual comparison test failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  } finally {
    await browser.close();
  }
}

// Create MCP server
const server = new McpServer({
  name: "visual-test",
  description: "UI visual comparison test tool",
  version: "1.0.0",
});

// Add visual test tool
server.tool(
  "playwright-ui-test",
  {
    url: z.string(),
    selector: z.string().optional(),
    waitForSelector: z.string().optional(),
    waitForTimeout: z.number().optional(),
    threshold: z.number().optional(),
    ignoreSelectors: z.array(z.string()).optional(),
    viewport: z.object({
      width: z.number(),
      height: z.number()
    }).optional(),
    baselineImagePath: z.string().optional(),
    baselineImage: z.string().optional()
  },
  async (params) => {
    // Get auto login configuration from environment variable or configuration file
    const autoLoginConfig = {
      username: process.env.AUTO_LOGIN_USERNAME,
      password: process.env.AUTO_LOGIN_PASSWORD,
      usernameSelector: process.env.AUTO_LOGIN_USERNAME_SELECTOR || "#username",
      passwordSelector: process.env.AUTO_LOGIN_PASSWORD_SELECTOR || "#password",
      submitSelector:
        process.env.AUTO_LOGIN_SUBMIT_SELECTOR || 'button[type="submit"]',
      successSelector: process.env.AUTO_LOGIN_SUCCESS_SELECTOR,
      loginUrlPattern:
        process.env.AUTO_LOGIN_URL_PATTERN || "login|signin|auth",
    };

    // Get visual test parameters from environment variable or configuration file
    const testConfig = {
      selector: process.env.TEST_SELECTOR || params.selector,
      waitForSelector: process.env.TEST_WAIT_FOR_SELECTOR || params.waitForSelector,
      waitForTimeout: process.env.TEST_WAIT_TIMEOUT ? parseInt(process.env.TEST_WAIT_TIMEOUT) : params.waitForTimeout,
      threshold: process.env.TEST_THRESHOLD ? parseInt(process.env.TEST_THRESHOLD) : params.threshold,
      ignoreSelectors: process.env.TEST_IGNORE_SELECTORS ? process.env.TEST_IGNORE_SELECTORS.split(',') : params.ignoreSelectors,
      viewport: {
        width: process.env.TEST_VIEWPORT_WIDTH ? parseInt(process.env.TEST_VIEWPORT_WIDTH) : (params.viewport?.width || 1280),
        height: process.env.TEST_VIEWPORT_HEIGHT ? parseInt(process.env.TEST_VIEWPORT_HEIGHT) : (params.viewport?.height || 720)
      }
    };

    const result = await runVisualTest({
      url: params.url,
      ...testConfig,
      baselineImagePath: params.baselineImagePath,
      baselineImage: params.baselineImage,
      autoLogin: autoLoginConfig,
    });

    if (result.success) {
      if (result.baselineCreated || result.baselineUpdated) {
        return {
          content: [{
            type: "text" as const,
            text: result.message || "Baseline image updated"
          }]
        };
      }

      return {
        content: [{
          type: "text" as const,
          text: `Difference pixels: ${result.diffPixels}, Threshold: ${result.threshold}, Test ${result.passed ? 'Passed' : 'Failed'}`
        }, {
          type: "image" as const,
          data: result.screenshots?.current || "",
          mimeType: "image/png"
        }, {
          type: "image" as const,
          data: result.screenshots?.diff || "",
          mimeType: "image/png"
        }]
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: result.error || "Unknown error"
      }]
    };
  }
);

// Add test result resource
server.resource(
  "testResult",
  new ResourceTemplate("test://{id}", { list: undefined }),
  async (uri, { id }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Test result ID: ${id}`,
      },
    ],
  })
);
export { server };
