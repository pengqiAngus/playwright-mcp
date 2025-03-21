# @mcp/playwright-visual-test

A visual regression testing tool based on Playwright, supporting UI screenshot comparison and automated testing.

## Installation

```bash
npm install @mcp/playwright-visual-test
# or
yarn add @mcp/playwright-visual-test
# or
pnpm add @mcp/playwright-visual-test
```

## Features

- Support for multiple viewport size testing
- Configurable comparison threshold
- Support for ignoring dynamic content areas
- Automatic comparison report generation
- Integration with MCP protocol

## API Documentation

### runTest(options)

Main test function, accepts the following parameters:

- `url`: Target page URL
- `viewport`: Viewport size configuration `{ width: number, height: number }`
- `waitForSelector?`: Optional, wait for specific element to appear
- `ignoreSelectors?`: Optional, array of selectors to ignore
- `threshold?`: Optional, pixel comparison threshold (0-1)

## License

MIT 

# MCP Playwright Visual Test Tool Configuration Guide

In mcp.json, you can configure the Playwright visual test tool as follows:

```json
{
  "mcp-playwright": {
    "command": "npx",
    "args": [
      "-y",
      "mcp-playwright-visual-test"
    ],
    "env": {
      // Auto login configuration
      "AUTO_LOGIN_USERNAME": "your-username",
      "AUTO_LOGIN_PASSWORD": "your-password",
      "AUTO_LOGIN_USERNAME_SELECTOR": "#userNameSignIn",
      "AUTO_LOGIN_PASSWORD_SELECTOR": "#passwordSignIn",
      "AUTO_LOGIN_SUBMIT_SELECTOR": "input[type=\"submit\"]",
      "AUTO_LOGIN_SUCCESS_SELECTOR": "", // Optional, element selector after successful login
      "AUTO_LOGIN_URL_PATTERN": "login|signin|auth", // Login page URL match pattern

      // Visual test configuration
      "TEST_SELECTOR": "", // Optional, selector for element to screenshot
      "TEST_WAIT_FOR_SELECTOR": "", // Optional, wait for specific element
      "TEST_WAIT_TIMEOUT": 10000, // Optional, wait timeout in milliseconds
      "TEST_THRESHOLD": 20, // Optional, pixel comparison threshold (0-100)
      "TEST_IGNORE_SELECTORS": ".dynamic-content,.ads", // Optional, selectors to ignore, comma separated
      "TEST_VIEWPORT_WIDTH": 1440, // Optional, viewport width, default 1280
      "TEST_VIEWPORT_HEIGHT": 800, // Optional, viewport height, default 720

      // Project configuration
      "PROJECT_ROOT": "D:/myProject/quickstart-resources/weather-server-typescript" // Project root path
    }
  }
}
```

## Configuration Details

### Auto Login Configuration

- `AUTO_LOGIN_USERNAME`: Login username
- `AUTO_LOGIN_PASSWORD`: Login password
- `AUTO_LOGIN_USERNAME_SELECTOR`: Username input field selector
- `AUTO_LOGIN_PASSWORD_SELECTOR`: Password input field selector
- `AUTO_LOGIN_SUBMIT_SELECTOR`: Login button selector
- `AUTO_LOGIN_SUCCESS_SELECTOR`: Element selector after successful login (optional)
- `AUTO_LOGIN_URL_PATTERN`: Login page URL match pattern for auto-detecting login page redirects

### Visual Test Configuration

- `TEST_SELECTOR`: Selector for element to screenshot, captures entire page if not set
- `TEST_WAIT_FOR_SELECTOR`: Wait for specific element before taking screenshot
- `TEST_WAIT_TIMEOUT`: Timeout for waiting for element (milliseconds)
- `TEST_THRESHOLD`: Pixel difference threshold for image comparison (0-100), default 100
- `TEST_IGNORE_SELECTORS`: List of selectors to ignore during comparison, comma separated
- `TEST_VIEWPORT_WIDTH`: Browser viewport width, default 1280
- `TEST_VIEWPORT_HEIGHT`: Browser viewport height, default 720

### Project Configuration

- `PROJECT_ROOT`: Absolute path to project root directory for storing screenshots and files

## Notes

1. All configuration items are optional, but it's recommended to configure essential login information and viewport size
2. Screenshots will be saved in the `screenshots` folder in the project root directory
3. Comparison results will generate three files:
   - `current.png`: Current test screenshot
   - `baseline.png`: Baseline screenshot
   - `diff.png`: Difference comparison image
4. On first run, the current screenshot will automatically be set as the baseline image 