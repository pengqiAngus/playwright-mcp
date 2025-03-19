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
  login?: {
    url: string;
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successSelector?: string;
  };
  baselineImage?: string;
  autoLogin?: {
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successSelector?: string;
    loginUrlPattern?: string; // 登录页面的 URL 模式，用于检测是否被重定向到登录页
  };
}
