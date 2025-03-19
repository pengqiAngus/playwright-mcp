import { McpServer, ResourceTemplate, } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs";
import path from "path";
import { z } from "zod";
// 创建截图目录
const screenshotsDir = path.join(__dirname, "../screenshots");
if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
}
// 登录函数
async function login(page, loginConfig) {
    if (!loginConfig)
        return;
    await page.goto(loginConfig.url);
    await page.waitForSelector(loginConfig.usernameSelector);
    await page.waitForSelector(loginConfig.passwordSelector);
    await page.waitForSelector(loginConfig.submitSelector);
    await page.fill(loginConfig.usernameSelector, loginConfig.username);
    await page.fill(loginConfig.passwordSelector, loginConfig.password);
    await page.click(loginConfig.submitSelector);
    if (loginConfig.successSelector) {
        await page.waitForSelector(loginConfig.successSelector);
    }
    else {
        await page.waitForNavigation();
    }
}
// 自动登录函数
async function autoLogin(page, config) {
    if (!config)
        return false;
    try {
        // 等待登录表单元素出现
        await page.waitForSelector(config.usernameSelector);
        await page.waitForSelector(config.passwordSelector);
        await page.waitForSelector(config.submitSelector);
        // 输入用户名和密码
        await page.fill(config.usernameSelector, config.username);
        await page.fill(config.passwordSelector, config.password);
        // 点击登录按钮
        await page.click(config.submitSelector);
        // 等待登录成功
        if (config.successSelector) {
            await page.waitForSelector(config.successSelector);
        }
        else {
            await page.waitForNavigation();
        }
        return true;
    }
    catch (error) {
        console.error("自动登录失败:", error);
        return false;
    }
}
// 检查是否被重定向到登录页面
async function checkLoginRedirect(page, config) {
    if (!config.autoLogin)
        return false;
    const currentUrl = page.url();
    const loginUrlPattern = config.autoLogin.loginUrlPattern || /login|signin|auth/i;
    if (loginUrlPattern.test(currentUrl)) {
        console.log("检测到登录页面重定向，尝试自动登录...");
        const loginSuccess = await autoLogin(page, config.autoLogin);
        if (loginSuccess) {
            // 登录成功后重新访问目标页面
            await page.goto(config.url);
            await page.waitForLoadState("networkidle");
            return true;
        }
    }
    return false;
}
// 执行视觉对比测试
async function runVisualTest(config) {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
        // 设置视口大小
        await page.setViewportSize(config.viewport || { width: 1280, height: 720 });
        // 如果需要登录，先进行登录
        if (config.login) {
            await login(page, config.login);
        }
        // 访问目标页面
        await page.goto(config.url);
        await page.waitForLoadState("networkidle");
        // 检查是否被重定向到登录页面
        await checkLoginRedirect(page, config);
        // 等待指定元素出现
        if (config.waitForSelector) {
            await page.waitForSelector(config.waitForSelector);
        }
        // 等待指定时间
        if (config.waitForTimeout) {
            await page.waitForTimeout(config.waitForTimeout);
        }
        // 隐藏要忽略的元素
        if (config.ignoreSelectors?.length) {
            await page.evaluate((selectors) => {
                selectors.forEach((selector) => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach((el) => {
                        el.style.visibility = "hidden";
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
        // 基准截图路径
        const baselineScreenshotPath = path.join(screenshotsDir, "baseline.png");
        // 如果提供了基准图片数据，保存它
        if (config.baselineImage) {
            const baselineBuffer = Buffer.from(config.baselineImage, "base64");
            fs.writeFileSync(baselineScreenshotPath, baselineBuffer);
        }
        // 如果基准截图不存在，将当前截图作为基准
        else if (!fs.existsSync(baselineScreenshotPath)) {
            fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
            return {
                success: true,
                message: "已创建基准截图",
                baselineCreated: true,
            };
        }
        // 读取基准截图和当前截图
        const baseline = PNG.sync.read(fs.readFileSync(baselineScreenshotPath));
        const current = PNG.sync.read(screenshot);
        // 检查图片尺寸是否匹配
        if (baseline.width !== current.width ||
            baseline.height !== current.height) {
            fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
            return {
                success: true,
                message: "已更新基准截图",
                baselineUpdated: true,
            };
        }
        // 创建差异图片
        const { width, height } = baseline;
        const diff = new PNG({ width, height });
        const numDiffPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, { threshold: 0.1 });
        // 保存差异图片
        fs.writeFileSync(path.join(screenshotsDir, "diff.png"), PNG.sync.write(diff));
        // 将当前截图转换为 base64
        const currentBase64 = fs
            .readFileSync(currentScreenshotPath)
            .toString("base64");
        const diffBase64 = fs
            .readFileSync(path.join(screenshotsDir, "diff.png"))
            .toString("base64");
        return {
            success: true,
            diffPixels: numDiffPixels,
            threshold: config.threshold || 100,
            passed: numDiffPixels < (config.threshold || 100),
            screenshots: {
                current: currentBase64,
                diff: diffBase64,
            },
        };
    }
    catch (error) {
        console.error("视觉对比测试失败:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        };
    }
    finally {
        await browser.close();
    }
}
// 创建 MCP 服务器
const server = new McpServer({
    name: "visual-test",
    description: "UI视觉对比测试工具",
    version: "1.0.0",
});
// 添加视觉测试工具
server.tool("runTest", z.object({
    url: z.string().describe("要测试的页面URL"),
    selector: z.string().optional().describe("要截图的元素选择器"),
    waitForSelector: z.string().optional().describe("等待元素出现"),
    waitForTimeout: z.number().optional().describe("等待时间（毫秒）"),
    threshold: z.number().optional().describe("差异阈值"),
    ignoreSelectors: z
        .array(z.string())
        .optional()
        .describe("忽略的元素选择器"),
    viewport: z
        .object({
        width: z.number(),
        height: z.number(),
    })
        .optional(),
    baselineImage: z.string().optional().describe("基准图片的 base64 编码数据"),
}), async (params) => {
    // 从环境变量或配置文件中获取自动登录配置
    const autoLoginConfig = {
        username: process.env.AUTO_LOGIN_USERNAME,
        password: process.env.AUTO_LOGIN_PASSWORD,
        usernameSelector: process.env.AUTO_LOGIN_USERNAME_SELECTOR || "#username",
        passwordSelector: process.env.AUTO_LOGIN_PASSWORD_SELECTOR || "#password",
        submitSelector: process.env.AUTO_LOGIN_SUBMIT_SELECTOR || 'button[type="submit"]',
        successSelector: process.env.AUTO_LOGIN_SUCCESS_SELECTOR,
        loginUrlPattern: process.env.AUTO_LOGIN_URL_PATTERN || "login|signin|auth",
    };
    return await runVisualTest({
        ...params,
        autoLogin: autoLoginConfig,
    });
});
// 添加测试结果资源
server.resource("testResult", new ResourceTemplate("test://{id}", { list: undefined }), async (uri, { id }) => ({
    contents: [
        {
            uri: uri.href,
            text: `测试结果 ID: ${id}`,
        },
    ],
}));
// 启动服务器
const transport = new StdioServerTransport();
await server.connect(transport);
console.log("MCP 服务器已启动");
