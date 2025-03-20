import { McpServer, ResourceTemplate, } from "@modelcontextprotocol/sdk/server/mcp.js";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs";
import path from "path";
import { z } from "zod";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// 创建截图目录
const getProjectRoot = () => {
    // 尝试从环境变量获取项目根目录
    const projectRoot = process.env.PROJECT_ROOT;
    if (projectRoot) {
        return projectRoot;
    }
    // 如果环境变量未设置，则尝试从当前文件路径推导
    const currentDir = __dirname;
    // 如果在 node_modules 中，向上查找直到找到项目根目录
    if (currentDir.includes('node_modules')) {
        const parts = currentDir.split(path.sep);
        const nodeModulesIndex = parts.indexOf('node_modules');
        return parts.slice(0, nodeModulesIndex).join(path.sep);
    }
    // 如果在 dist 目录中，返回上一级目录
    return path.dirname(currentDir);
};
const projectRoot = getProjectRoot();
const screenshotsDir = path.join(projectRoot, "screenshots");
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
    const loginUrlPattern = new RegExp(config.autoLogin.loginUrlPattern || /login|signin|auth/i);
    if (loginUrlPattern.test(currentUrl)) {
        console.log("检测到登录页面重定向，尝试自动登录...");
        const loginSuccess = await autoLogin(page, config.autoLogin);
        if (loginSuccess) {
            // 登录成功后重新访问目标页面
            console.log("登录成功，重新访问目标页面");
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
        const defaultViewport = { width: 1280, height: 720 };
        await page.setViewportSize({
            width: config.viewport?.width ?? defaultViewport.width,
            height: config.viewport?.height ?? defaultViewport.height
        });
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
        console.log("获取页面截图成功");
        // 保存当前截图
        const currentScreenshotPath = path.join(screenshotsDir, "current.png");
        fs.writeFileSync(currentScreenshotPath, screenshot);
        // 基准截图路径
        const baselineScreenshotPath = path.join(screenshotsDir, "baseline.png");
        // 优先检查是否已存在基准图片
        if (fs.existsSync(baselineScreenshotPath)) {
            console.log("使用已存在的基准图片", baselineScreenshotPath);
        }
        // 如果提供了基准图片路径，从该路径读取
        else if (config.baselineImagePath) {
            try {
                const baselineBuffer = fs.readFileSync(config.baselineImagePath);
                fs.writeFileSync(baselineScreenshotPath, baselineBuffer);
                console.log("从指定路径读取基准图片成功", baselineScreenshotPath);
            }
            catch (error) {
                console.error("读取指定路径基准图片失败:", error);
                return {
                    success: false,
                    error: `读取基准图片失败: ${error instanceof Error ? error.message : '未知错误'}`
                };
            }
        }
        // 如果提供了基准图片数据
        else if (config.baselineImage) {
            let baselineBuffer;
            if (Buffer.isBuffer(config.baselineImage)) {
                baselineBuffer = config.baselineImage;
            }
            else {
                baselineBuffer = Buffer.from(config.baselineImage, "base64");
            }
            fs.writeFileSync(baselineScreenshotPath, baselineBuffer);
            console.log("保存基准图片数据成功");
        }
        // 如果基准截图不存在，将当前截图作为基准
        else {
            fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
            console.log("创建新的基准图片");
            return {
                success: true,
                message: "已创建新的基准截图",
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
        const numDiffPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, { threshold: config.threshold ? config.threshold / 100 : 0.1 });
        // 保存差异图片
        fs.writeFileSync(path.join(screenshotsDir, "diff.png"), PNG.sync.write(diff));
        console.log("创建差异图片成功");
        return {
            success: true,
            message: "创建差异图片成功",
            diffPixels: numDiffPixels,
            threshold: config.threshold || 100,
            passed: numDiffPixels < (config.threshold || 100),
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
server.tool("playwright-ui-test", {
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
}, async (params) => {
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
    // 从环境变量获取视觉测试参数
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
                        text: result.message || "基准图片已更新"
                    }]
            };
        }
        return {
            content: [{
                    type: "text",
                    text: `差异像素数: ${result.diffPixels}, 阈值: ${result.threshold}, 测试${result.passed ? '通过' : '失败'}`
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
export { server };
