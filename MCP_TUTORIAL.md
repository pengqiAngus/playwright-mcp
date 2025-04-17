# MCP (Model Context Protocol)工具 开发教程

## 目录
1. [简介](#简介)
2. [核心概念](#核心概念)
3. [使用示例](#使用示例)
4. [最佳实践](#最佳实践)

## 简介

MCP (Model Context Protocol) 是一个用于构建 AI 模型与外部工具交互的协议。它允许我们创建自定义工具和资源，使 AI 模型能够执行特定的任务。
MCP工具开发使用modelcontextprotocol 这个SDK， github地址： 
https://github.com/modelcontextprotocol


## 核心概念

### 1. StdioServerTransport

StdioServerTransport 是 MCP 的传输层，它通过标准输入输出（stdin/stdout）实现服务器与客户端之间的通信。

```typescript:src/index.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

const transport = new StdioServerTransport();
```

### 2. McpServer

McpServer 是 MCP 的核心服务器类，用于创建和管理工具与资源。

```typescript:src/mcp-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

const server = new McpServer({
  name: "your-server-name",
  description: "服务器描述",
  version: "1.0.0"
});
```

### 3. Tool（工具）

Tool 是 MCP 中用于执行特定任务的函数。每个工具都需要：
- 名称
- 参数模式（使用 Zod 进行验证）
- 执行函数

```typescript:src/mcp-server.ts
import { z } from "zod";

server.tool(
  "tool-name",
  {
    param1: z.string(),
    param2: z.number().optional()
  },
  async (params) => {
    // 工具实现
    return {
      content: [{
        type: "text",
        text: "执行结果"
      }]
    };
  }
);
```

### 4. Resource（资源）

Resource 用于管理可访问的数据或状态。每个资源都需要：
- 名称
- URI 模板
- 获取内容的函数

```typescript:src/mcp-server.ts
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp";

server.resource(
  "resource-name",
  new ResourceTemplate("resource://{id}", { list: undefined }),
  async (uri, { id }) => ({
    contents: [{
      uri: uri.href,
      text: `资源内容: ${id}`
    }]
  })
);
```

## 使用示例
这里我使用 modelcontextprotocol的typescript-sdk进行开发

### 安装依赖

首先，需要安装必要的 npm 包：

```bash
npm install @modelcontextprotocol/sdk @playwright/test pngjs pixelmatch zod
```


让我通过一个实际的 Playwright UI 测试工具来理解这些概念如何协同工作。这个示例将展示如何创建一个完整的视觉测试工具。

### 1. 类型定义

首先，我们需要定义测试配置和结果的类型：

```typescript:src/types.ts
// types.ts
export interface VisualTestConfig {
  url: string;
  selector?: string;
  waitForSelector?: string;
  waitForTimeout?: number;
  threshold?: number;
  ignoreSelectors?: string[];
  viewport?: {
    width: number;
    height: number;
  };
  baselineImagePath?: string;
  baselineImage?: string | Buffer;
  login?: {
    url: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    username: string;
    password: string;
    successSelector?: string;
  };
  autoLogin?: {
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successSelector?: string;
    loginUrlPattern?: string;
  };
}

export interface VisualTestResult {
  success: boolean;
  message?: string;
  error?: string;
  diffPixels?: number;
  threshold?: number;
  passed?: boolean;
  baselineCreated?: boolean;
  baselineUpdated?: boolean;
  screenshots?: {
    current?: string;
    diff?: string;
  };
}
```

### 2. 创建服务器

```typescript:src/mcp-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

const server = new McpServer({
  name: "visual-test",
  description: "UI visual comparison test tool",
  version: "1.0.0"
});
```

### 3. 实现核心功能

#### 3.1 登录功能

```typescript:src/mcp-server.ts
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
```

#### 3.2 自动登录功能

```typescript:src/mcp-server.ts
async function autoLogin(page: any, config: VisualTestConfig["autoLogin"]) {
  if (!config) return false;

  try {
    await page.waitForSelector(config.usernameSelector);
    await page.waitForSelector(config.passwordSelector);
    await page.waitForSelector(config.submitSelector);

    await page.fill(config.usernameSelector, config.username);
    await page.fill(config.passwordSelector, config.password);
    await page.click(config.submitSelector);

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
```

#### 3.3 视觉测试核心功能

```typescript:src/mcp-server.ts
async function runVisualTest(config: VisualTestConfig): Promise<VisualTestResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // 设置视口大小
    const defaultViewport = { width: 1280, height: 720 };
    await page.setViewportSize({
      width: config.viewport?.width ?? defaultViewport.width,
      height: config.viewport?.height ?? defaultViewport.height
    });

    // 登录处理
    if (config.login) {
      await login(page, config.login);
    }

    // 访问目标页面
    await page.goto(config.url);
    await page.waitForLoadState("networkidle");

    // 检查是否需要自动登录
    await checkLoginRedirect(page, config);

    // 等待指定元素
    if (config.waitForSelector) {
      await page.waitForSelector(config.waitForSelector);
    }

    // 等待指定时间
    if (config.waitForTimeout) {
      await page.waitForTimeout(config.waitForTimeout);
    }

    // 隐藏需要忽略的元素
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

    // 获取页面截图
    const screenshot = await page.screenshot({
      fullPage: !config.selector,
      type: "png",
      ...(config.selector ? { selector: config.selector } : {}),
    });

    // 保存当前截图
    const currentScreenshotPath = path.join(screenshotsDir, "current.png");
    fs.writeFileSync(currentScreenshotPath, screenshot);

    // 处理基准图片
    const baselineScreenshotPath = path.join(screenshotsDir, "baseline.png");
    if (fs.existsSync(baselineScreenshotPath)) {
      console.log("使用现有基准图片");
    } else if (config.baselineImagePath) {
      const baselineBuffer = fs.readFileSync(config.baselineImagePath);
      fs.writeFileSync(baselineScreenshotPath, baselineBuffer);
    } else if (config.baselineImage) {
      let baselineBuffer: Buffer;
      if (Buffer.isBuffer(config.baselineImage)) {
        baselineBuffer = config.baselineImage;
      } else {
        baselineBuffer = Buffer.from(config.baselineImage, "base64");
      }
      fs.writeFileSync(baselineScreenshotPath, baselineBuffer);
    } else {
      fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
      return {
        success: true,
        message: "创建新的基准截图",
        baselineCreated: true,
      };
    }

    // 图片对比
    const baseline = PNG.sync.read(fs.readFileSync(baselineScreenshotPath));
    const current = PNG.sync.read(screenshot);

    if (baseline.width !== current.width || baseline.height !== current.height) {
      fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
      return {
        success: true,
        message: "更新基准截图",
        baselineUpdated: true,
      };
    }

    // 创建差异图片
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

    // 保存差异图片
    fs.writeFileSync(
      path.join(screenshotsDir, "diff.png"),
      PNG.sync.write(diff)
    );

    return {
      success: true,
      message: "成功创建差异图片",
      diffPixels: numDiffPixels,
      threshold: config.threshold || 100,
      passed: numDiffPixels < (config.threshold || 100),
    };
  } catch (error) {
    console.error("视觉对比测试失败:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "未知错误",
    };
  } finally {
    await browser.close();
  }
}
```

### 4. 定义 MCP 工具

```typescript:src/mcp-server.ts
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
    // 获取自动登录配置
    const autoLoginConfig = {
      username: process.env.AUTO_LOGIN_USERNAME,
      password: process.env.AUTO_LOGIN_PASSWORD,
      usernameSelector: process.env.AUTO_LOGIN_USERNAME_SELECTOR || "#username",
      passwordSelector: process.env.AUTO_LOGIN_PASSWORD_SELECTOR || "#password",
      submitSelector: process.env.AUTO_LOGIN_SUBMIT_SELECTOR || 'button[type="submit"]',
      successSelector: process.env.AUTO_LOGIN_SUCCESS_SELECTOR,
      loginUrlPattern: process.env.AUTO_LOGIN_URL_PATTERN || "login|signin|auth",
    };

    // 获取测试配置
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
            type: "text",
            text: result.message || "更新基准图片"
          }]
        };
      }

      return {
        content: [{
          type: "text",
          text: `差异像素: ${result.diffPixels}, 阈值: ${result.threshold}, 测试${result.passed ? '通过' : '失败'}`
        }, {
          type: "image",
          data: result.screenshots?.current || "",
          mimeType: "image/png"
        }, {
          type: "image",
          data: result.screenshots?.diff || "",
          mimeType: "image/png"
        }]
      };
    }

    return {
      content: [{
        type: "text",
        text: result.error || "未知错误"
      }]
    };
  }
);
```
### 项目地址 
https://www.npmjs.com/package/@anguske/mcp-playwright-visual-test

### 5. 配置 Cursor

在 Cursor 中使用该工具,需要在 `.cursor/mcp.json` 中添加以下配置:

```json:.cursor/mcp.json
{
  "mcpServers": {
    "@anguske/mcp-playwright-visual-test": {
      "command": "npx",
      "args": ["-y", "@anguske/mcp-playwright-visual-test"],
      "env": {
        "AUTO_LOGIN_USERNAME": "",
        "AUTO_LOGIN_PASSWORD": "",
        "AUTO_LOGIN_USERNAME_SELECTOR": "#userNameSignIn",
        "AUTO_LOGIN_PASSWORD_SELECTOR": "#passwordSignIn",
        "AUTO_LOGIN_SUBMIT_SELECTOR": "input[type=\"submit\"]",
        "AUTO_LOGIN_SUCCESS_SELECTOR": "",
        "TEST_VIEWPORT_WIDTH": 1440,
        "TEST_VIEWPORT_HEIGHT": 800,
        "TEST_THRESHOLD": 20,
        "TEST_WAIT_TIMEOUT": 10000,
        "AUTO_LOGIN_URL_PATTERN": "login|signin|auth",
        "PROJECT_ROOT": "C:/project/root"
      }
    }
  }
}
```

这个配置文件定义了 MCP 服务器的配置信息：

1. **服务器配置**：
   - `command`: 使用 `npx` 命令运行工具
   - `args`: 使用 `-y` 参数自动确认安装并运行 `@anguske/mcp-playwright-visual-test` 包

2. **环境变量配置**：
   - 自动登录配置：
     - `AUTO_LOGIN_USERNAME`: 登录用户名
     - `AUTO_LOGIN_PASSWORD`: 登录密码
     - `AUTO_LOGIN_USERNAME_SELECTOR`: 用户名输入框选择器
     - `AUTO_LOGIN_PASSWORD_SELECTOR`: 密码输入框选择器
     - `AUTO_LOGIN_SUBMIT_SELECTOR`: 提交按钮选择器
     - `AUTO_LOGIN_SUCCESS_SELECTOR`: 登录成功标识选择器
   
   - 测试配置：
     - `TEST_VIEWPORT_WIDTH`: 视口宽度 (1440px)
     - `TEST_VIEWPORT_HEIGHT`: 视口高度 (800px)
     - `TEST_THRESHOLD`: 差异阈值 (20)
     - `TEST_WAIT_TIMEOUT`: 等待超时时间 (10000ms)
   
   - 其他配置：
     - `AUTO_LOGIN_URL_PATTERN`: 登录页面 URL 匹配模式
     - `PROJECT_ROOT`: 项目根目录路径

当你在 Cursor 中使用这个工具时：

1. Cursor 会读取这个配置文件
2. 根据配置启动 MCP 服务器
3. 使用配置的环境变量运行测试
4. 显示测试结果和截图

例如，当你在 Cursor 中输入：
```
/test playwright-ui-test url="https://example.com"
```

Cursor 会：
1. 识别这是一个工具调用
2. 使用配置的环境变量启动服务器
3. 调用 `playwright-ui-test` 工具方法
4. 显示测试结果和截图

### 6. 添加资源

```typescript
server.resource(
  "testResult",
  new ResourceTemplate("test://{id}", { list: undefined }),
  async (uri, { id }) => ({
    contents: [{
      uri: uri.href,
      text: `测试结果 ID: ${id}`
    }]
  })
);
```

## 最佳实践

1. **参数验证**
   - 使用 Zod 进行严格的参数验证
   - 为可选参数提供默认值
   - 使用环境变量进行配置

2. **错误处理**
   - 使用 try-catch 捕获可能的错误
   - 返回结构化的错误信息
   - 在 finally 块中清理资源

3. **资源管理**
   - 使用有意义的 URI 模板
   - 实现适当的资源访问控制
   - 管理临时文件和目录

4. **工具设计**
   - 保持工具功能单一
   - 提供清晰的参数文档
   - 返回结构化的结果
   - 支持多种配置方式

5. **配置管理**
   - 使用环境变量进行配置
   - 提供合理的默认值
   - 支持多种配置来源


## 总结

MCP 提供了一个强大的框架来构建 AI 模型与外部工具的交互。通过合理使用 Tool 和 Resource，我们可以创建功能丰富且易于维护的 AI 应用。记住要遵循最佳实践，确保代码的可维护性和可扩展性。在实际开发中，要注意：

1. 合理组织代码结构
2. 实现完善的错误处理
3. 提供灵活的配置选项
4. 保持代码的可测试性
5. 注重用户体验和反馈