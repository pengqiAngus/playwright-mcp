# @mcp/playwright-visual-test
[![smithery badge](https://smithery.ai/badge/@pengqiAngus/playwright-mcp)](https://smithery.ai/server/@pengqiAngus/playwright-mcp)

基于 Playwright 的视觉回归测试工具，支持 UI 界面截图对比和自动化测试。

## 安装

### Installing via Smithery

To install @mcp/playwright-visual-test for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@pengqiAngus/playwright-mcp):

```bash
npx -y @smithery/cli install @pengqiAngus/playwright-mcp --client claude
```

### Manual Installation
```bash
npm install @mcp/playwright-visual-test
# 或
yarn add @mcp/playwright-visual-test
# 或
pnpm add @mcp/playwright-visual-test
```

## 使用方法

```typescript
import { runTest } from '@mcp/playwright-visual-test';

// 运行视觉测试
await runTest({
  url: 'https://example.com',
  viewport: { width: 1280, height: 720 },
  // 可选：等待特定元素
  waitForSelector: '#content',
  // 可选：忽略某些元素
  ignoreSelectors: ['.dynamic-content']
});
```

## 特性

- 支持多种视口大小的测试
- 可配置的对比阈值
- 支持忽略动态内容区域
- 自动生成对比报告
- 与 MCP 协议集成

## API 文档

### runTest(options)

主要测试函数，接受以下参数：

- `url`: 要测试的页面 URL
- `viewport`: 视口大小配置 `{ width: number, height: number }`
- `waitForSelector?`: 可选，等待特定元素出现
- `ignoreSelectors?`: 可选，忽略的元素选择器数组
- `threshold?`: 可选，像素对比阈值 (0-1)

## 许可证

MIT 

# MCP Playwright 视觉测试工具配置说明

在 mcp.json 中，您可以通过以下方式配置 Playwright 视觉测试工具：

```json
{
  "mcp-playwright": {
    "command": "npx",
    "args": [
      "-y",
      "mcp-playwright-visual-test"
    ],
    "env": {
      // 自动登录配置
      "AUTO_LOGIN_USERNAME": "your-username",
      "AUTO_LOGIN_PASSWORD": "your-password",
      "AUTO_LOGIN_USERNAME_SELECTOR": "#userNameSignIn",
      "AUTO_LOGIN_PASSWORD_SELECTOR": "#passwordSignIn",
      "AUTO_LOGIN_SUBMIT_SELECTOR": "input[type=\"submit\"]",
      "AUTO_LOGIN_SUCCESS_SELECTOR": "", // 可选，登录成功后的元素选择器
      "AUTO_LOGIN_URL_PATTERN": "login|signin|auth", // 登录页面URL匹配模式

      // 视觉测试配置
      "TEST_SELECTOR": "", // 可选，指定要截图的元素选择器
      "TEST_WAIT_FOR_SELECTOR": "", // 可选，等待特定元素出现
      "TEST_WAIT_TIMEOUT": 10000, // 可选，等待超时时间（毫秒）
      "TEST_THRESHOLD": 20, // 可选，像素对比阈值（0-100）
      "TEST_IGNORE_SELECTORS": ".dynamic-content,.ads", // 可选，忽略的元素选择器，用逗号分隔
      "TEST_VIEWPORT_WIDTH": 1440, // 可选，视口宽度，默认1280
      "TEST_VIEWPORT_HEIGHT": 800, // 可选，视口高度，默认720

      // 项目配置
      "PROJECT_ROOT": "D:/myProject/quickstart-resources/weather-server-typescript" // 项目根目录路径
    }
  }
}
```

## 配置项说明

### 自动登录配置

- `AUTO_LOGIN_USERNAME`: 登录用户名
- `AUTO_LOGIN_PASSWORD`: 登录密码
- `AUTO_LOGIN_USERNAME_SELECTOR`: 用户名输入框的选择器
- `AUTO_LOGIN_PASSWORD_SELECTOR`: 密码输入框的选择器
- `AUTO_LOGIN_SUBMIT_SELECTOR`: 登录按钮的选择器
- `AUTO_LOGIN_SUCCESS_SELECTOR`: 登录成功后的元素选择器（可选）
- `AUTO_LOGIN_URL_PATTERN`: 登录页面URL匹配模式，用于自动检测登录页面重定向

### 视觉测试配置

- `TEST_SELECTOR`: 指定要截图的元素选择器，不设置则截取整个页面
- `TEST_WAIT_FOR_SELECTOR`: 等待特定元素出现后再进行截图
- `TEST_WAIT_TIMEOUT`: 等待元素出现的超时时间（毫秒）
- `TEST_THRESHOLD`: 图片对比的像素差异阈值（0-100），默认为100
- `TEST_IGNORE_SELECTORS`: 需要在对比时忽略的元素选择器列表，多个选择器用逗号分隔
- `TEST_VIEWPORT_WIDTH`: 浏览器视口宽度，默认为1280
- `TEST_VIEWPORT_HEIGHT`: 浏览器视口高度，默认为720

### 项目配置

- `PROJECT_ROOT`: 项目根目录的绝对路径，用于存储截图等文件

## 注意事项

1. 所有配置项都是可选的，但建议至少配置必要的登录信息和视口大小
2. 截图将保存在项目根目录的 `screenshots` 文件夹中
3. 对比结果会生成三个文件：
   - `current.png`: 当前测试的截图
   - `baseline.png`: 基准截图
   - `diff.png`: 差异对比图
4. 如果是首次运行，当前截图会自动设置为基准图片