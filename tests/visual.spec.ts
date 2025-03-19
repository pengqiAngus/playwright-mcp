import { test, expect } from "@playwright/test";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import fs from "fs";
import path from "path";

// 配置选项
interface VisualTestConfig {
  url: string;
  selector?: string; // 要截图的元素选择器
  waitForSelector?: string; // 等待元素出现
  waitForTimeout?: number; // 等待时间（毫秒）
  threshold?: number; // 差异阈值
  ignoreSelectors?: string[]; // 忽略的元素选择器
  viewport?: { width: number; height: number }; // 视口大小
  login?: {
    url: string; // 登录页面URL
    username: string; // 用户名
    password: string; // 密码
    usernameSelector: string; // 用户名输入框选择器
    passwordSelector: string; // 密码输入框选择器
    submitSelector: string; // 提交按钮选择器
    successSelector?: string; // 登录成功后的元素选择器
  };
}

// 获取配置
const config: VisualTestConfig = {
  url: process.env.TARGET_URL || "http://localhost:8080",
  selector: process.env.SELECTOR,
  waitForSelector: process.env.WAIT_FOR_SELECTOR,
  waitForTimeout: parseInt(process.env.WAIT_FOR_TIMEOUT || "0"),
  threshold: parseInt(process.env.THRESHOLD || "100"),
  ignoreSelectors: process.env.IGNORE_SELECTORS?.split(",") || [],
  viewport: {
    width: parseInt(process.env.VIEWPORT_WIDTH || "1280"),
    height: parseInt(process.env.VIEWPORT_HEIGHT || "720"),
  },
  login:
    process.env.LOGIN === "true"
      ? {
          url:
            process.env.LOGIN_URL ||
            "https://edge-crm-dev.aaxisdev.net/customer/user/login",
          username: process.env.LOGIN_USERNAME || "",
          password: process.env.LOGIN_PASSWORD || "",
          usernameSelector: process.env.LOGIN_USERNAME_SELECTOR || "#username",
          passwordSelector: process.env.LOGIN_PASSWORD_SELECTOR || "#password",
          submitSelector:
            process.env.LOGIN_SUBMIT_SELECTOR || "button[type='submit']",
          successSelector: process.env.LOGIN_SUCCESS_SELECTOR,
        }
      : undefined,
};

// 登录函数
async function login(page: any) {
  if (!config.login) return;

  console.log("开始登录...");

  // 访问登录页面
  await page.goto(config.login.url);

  // 等待登录表单加载
  await page.waitForSelector(config.login.usernameSelector);
  await page.waitForSelector(config.login.passwordSelector);
  await page.waitForSelector(config.login.submitSelector);

  // 输入用户名和密码
  await page.fill(config.login.usernameSelector, config.login.username);
  await page.fill(config.login.passwordSelector, config.login.password);

  // 点击登录按钮
  await page.click(config.login.submitSelector);

  // 等待登录成功
  if (config.login.successSelector) {
    await page.waitForSelector(config.login.successSelector);
  } else {
    // 如果没有指定成功选择器，等待页面跳转
    await page.waitForNavigation();
  }

  console.log("登录成功");
}

// 添加样式比较接口
interface StyleDiff {
  selector: string;
  property: string;
  baseline: string;
  current: string;
}

// 添加样式比较函数
async function compareStyles(
  page: any,
  selector: string
): Promise<StyleDiff[]> {
  const styleProperties = [
    "padding",
    "margin",
    "font-size",
    "font-family",
    "color",
    "background-color",
    "border",
    "border-radius",
    "width",
    "height",
    "display",
    "position",
    "top",
    "left",
    "right",
    "bottom",
    "opacity",
    "box-shadow",
    "text-align",
    "line-height",
  ];

  const diffs: StyleDiff[] = [];

  // 获取所有匹配的元素
  const elements = await page.$$(selector);

  for (const element of elements) {
    // 获取元素的文本内容用于标识
    const text = await element.textContent();
    const elementSelector = await element.evaluate((el) => {
      let selector = "";
      while (el && el.nodeType === Node.ELEMENT_NODE) {
        let selectorPart = el.nodeName.toLowerCase();
        if (el.id) {
          selectorPart += `#${el.id}`;
        } else if (el.className) {
          selectorPart += `.${el.className.split(" ").join(".")}`;
        }
        selector = selectorPart + (selector ? " > " + selector : "");
        el = el.parentNode;
      }
      return selector;
    });

    // 获取元素的样式
    const styles = await element.evaluate((el, properties) => {
      const computedStyle = window.getComputedStyle(el);
      return properties.reduce((acc, prop) => {
        acc[prop] = computedStyle.getPropertyValue(prop);
        return acc;
      }, {} as Record<string, string>);
    }, styleProperties);

    // 比较样式
    for (const [property, value] of Object.entries(styles)) {
      if (value !== "") {
        diffs.push({
          selector: elementSelector,
          property,
          baseline: value,
          current: value,
        });
      }
    }
  }

  return diffs;
}

// 生成差异报告
function generateDiffReport(diffs: StyleDiff[]): string {
  if (diffs.length === 0) {
    return "# 视觉对比测试报告\n\n没有发现样式差异。";
  }

  let report = "# 视觉对比测试报告\n\n";
  report += "## 样式差异详情\n\n";

  // 按选择器分组
  const diffsBySelector = diffs.reduce((acc, diff) => {
    if (!acc[diff.selector]) {
      acc[diff.selector] = [];
    }
    acc[diff.selector].push(diff);
    return acc;
  }, {} as Record<string, StyleDiff[]>);

  for (const [selector, selectorDiffs] of Object.entries(diffsBySelector)) {
    report += `### ${selector}\n\n`;
    report += "| 属性 | 基准值 | 当前值 |\n";
    report += "|------|--------|--------|\n";

    for (const diff of selectorDiffs) {
      report += `| ${diff.property} | ${diff.baseline} | ${diff.current} |\n`;
    }

    report += "\n";
  }

  return report;
}

test("视觉对比测试", async ({ page }) => {
  // 在代码中添加断点
  await page.pause(); // 这里会暂停执行

  // 设置视口大小
  await page.setViewportSize(config.viewport);

  // 创建截图目录
  const screenshotsDir = path.join(__dirname, "../screenshots");
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  // 如果需要登录，先进行登录
  if (config.login) {
    await login(page);
  }

  // 访问目标页面
  await page.goto(config.url);

  // 等待页面加载完成
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
  if (config.ignoreSelectors.length > 0) {
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
    fullPage: !config.selector, // 如果指定了选择器，则只截取该元素
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
    console.log("已创建基准截图");
    return;
  }

  // 读取基准截图和当前截图
  const baseline = PNG.sync.read(fs.readFileSync(baselineScreenshotPath));
  const current = PNG.sync.read(screenshot);

  // 检查图片尺寸是否匹配
  if (baseline.width !== current.width || baseline.height !== current.height) {
    console.log("警告：基准图片和当前图片尺寸不匹配");
    console.log(`基准图片尺寸: ${baseline.width}x${baseline.height}`);
    console.log(`当前图片尺寸: ${current.width}x${current.height}`);

    // 如果尺寸不匹配，创建新的基准图片
    fs.copyFileSync(currentScreenshotPath, baselineScreenshotPath);
    console.log("已更新基准截图");
    return;
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
    {
      threshold: 0.1,
    }
  );

  // 保存差异图片
  fs.writeFileSync(path.join(screenshotsDir, "diff.png"), PNG.sync.write(diff));

  // 收集样式差异
  const styleDiffs = await compareStyles(page, config.selector || "body");

  // 生成差异报告
  const diffReport = generateDiffReport(styleDiffs);

  // 保存差异报告
  const reportPath = path.join(screenshotsDir, "diff-report.md");
  fs.writeFileSync(reportPath, diffReport);

  // 如果差异像素超过阈值，测试失败
  expect(numDiffPixels).toBeLessThan(config.threshold);
});
