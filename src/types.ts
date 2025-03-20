export interface VisualTestConfig {
  url: string;
  selector?: string;
  waitForSelector?: string;
  waitForTimeout?: number;
  threshold?: number;
  ignoreSelectors?: string[];
  viewport?: Partial<{
    width: number;
    height: number;
  }>;
  baselineImage?: string;
  baselineImagePath?: string;
  login?: {
    url: string;
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successSelector?: string;
  };
  autoLogin?: {
    username: string;
    password: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
    successSelector?: string;
    loginUrlPattern?: string | RegExp;
  };
}

export interface VisualTestResult {
  success: boolean;
  message?: string;
  baselineCreated?: boolean;
  baselineUpdated?: boolean;
  diffPixels?: number;
  threshold?: number;
  passed?: boolean;
  screenshots?: {
    current: string;
    diff: string;
  };
  error?: string;
}
