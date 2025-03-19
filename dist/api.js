import express from "express";
import { chromium } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs";
import path from "path";
const app = express();
app.use(express.json());
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
// 视觉对比测试接口
app.post("/api/visual-test", async (req, res) => {
    try {
        const config = req.body;
        const browser = await chromium.launch();
        const page = await browser.newPage();
        // 设置视口大小
        await page.setViewportSize(config.viewport || { width: 1280, height: 720 });
        // 如果需要登录，先进行登录
        if (config.login) {
            await login(page, config.login);
        }
        // 访问目标页面
        await page.goto(config.url);
        await page.waitForLoadState("networkidle");
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
        // 如果基准截图不存在，将当前截图作为基准
        if (!fs.existsSync(baselineScreenshotPath)) {
            fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
            await browser.close();
            return res.json({
                success: true,
                message: "已创建基准截图",
                baselineCreated: true,
            });
        }
        // 读取基准截图和当前截图
        const baseline = PNG.sync.read(fs.readFileSync(baselineScreenshotPath));
        const current = PNG.sync.read(screenshot);
        // 检查图片尺寸是否匹配
        if (baseline.width !== current.width ||
            baseline.height !== current.height) {
            fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
            await browser.close();
            return res.json({
                success: true,
                message: "已更新基准截图",
                baselineUpdated: true,
            });
        }
        // 创建差异图片
        const { width, height } = baseline;
        const diff = new PNG({ width, height });
        const numDiffPixels = pixelmatch(baseline.data, current.data, diff.data, width, height, { threshold: 0.1 });
        // 保存差异图片
        fs.writeFileSync(path.join(screenshotsDir, "diff.png"), PNG.sync.write(diff));
        await browser.close();
        // 返回测试结果
        res.json({
            success: true,
            diffPixels: numDiffPixels,
            threshold: config.threshold || 100,
            passed: numDiffPixels < (config.threshold || 100),
            screenshots: {
                current: "/screenshots/current.png",
                baseline: "/screenshots/baseline.png",
                diff: "/screenshots/diff.png",
            },
        });
    }
    catch (error) {
        console.error("视觉对比测试失败:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "未知错误",
        });
    }
});
// 提供静态文件访问
app.use("/screenshots", express.static(screenshotsDir));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API 服务器运行在 http://localhost:${PORT}`);
});
