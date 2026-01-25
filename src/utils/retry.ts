/**
 * 错误处理和重试机制
 * 提供指数退避、熔断器等功能
 */

/**
 * 可重试的错误类型
 */
export class RetryableError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'RetryableError';
  }
}

/**
 * 不可重试的错误类型
 */
export class PermanentError extends Error {
  constructor(message: string, public readonly originalError?: any) {
    super(message);
    this.name = 'PermanentError';
  }
}

/**
 * 网络错误（通常是可重试的）
 */
export class NetworkError extends RetryableError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'NetworkError';
  }
}

/**
 * RPC 错误（可能是可重试的）
 */
export class RpcError extends RetryableError {
  constructor(message: string, originalError?: any) {
    super(message, originalError);
    this.name = 'RpcError';
  }
}

/**
 * 重试配置
 */
export interface RetryConfig {
  maxRetries: number;           // 最大重试次数
  initialDelay: number;         // 初始延迟（毫秒）
  maxDelay: number;             // 最大延迟（毫秒）
  backoffMultiplier: number;    // 退避乘数
  retryableErrors?: string[];   // 可重试的错误代码
  onRetry?: (attempt: number, error: Error) => void; // 重试回调
}

/**
 * 默认重试配置
 */
export const defaultRetryConfig: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'ETIMEDOUT',
    'ECONNREFUSED',
    'ECONNRESET',
    'ENOTFOUND',
    'EAI_AGAIN',
    'NETWORK_ERROR',
    'TEMPORARY_FAILURE'
  ]
};

/**
 * 带重试的异步函数执行
 */
export async function retryAsync<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...defaultRetryConfig, ...config };
  let lastError: Error;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // 如果是永久错误，立即抛出
      if (error instanceof PermanentError) {
        throw error;
      }

      // 如果是最后一次尝试，抛出错误
      if (attempt === finalConfig.maxRetries) {
        throw lastError;
      }

      // 检查是否可重试
      const shouldRetry = isRetryableError(error, finalConfig.retryableErrors || []);

      if (!shouldRetry) {
        throw lastError;
      }

      // 计算延迟时间（指数退避）
      const delay = Math.min(
        finalConfig.initialDelay * Math.pow(finalConfig.backoffMultiplier, attempt),
        finalConfig.maxDelay
      );

      console.log(`[Retry] 第 ${attempt + 1} 次尝试失败，${delay}ms 后重试:`, lastError.message);

      // 触发回调
      if (finalConfig.onRetry) {
        finalConfig.onRetry(attempt + 1, lastError);
      }

      // 等待后重试
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: any, retryableErrors: string[]): boolean {
  // 自定义错误类型
  if (error instanceof RetryableError) {
    return true;
  }

  if (error instanceof PermanentError) {
    return false;
  }

  // 检查错误代码
  const errorCode = error.code || error.name || '';
  if (retryableErrors.includes(errorCode)) {
    return true;
  }

  // 检查错误消息中的关键词
  const errorMessage = error.message || '';
  const retryableKeywords = [
    'timeout',
    'network',
    'connection',
    'temporary',
    'rate limit',
    'too many requests'
  ];

  const lowerMessage = errorMessage.toLowerCase();
  return retryableKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * 延迟函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 熔断器状态
 */
enum CircuitState {
  CLOSED = 'CLOSED',     // 正常运行
  OPEN = 'OPEN',         // 熔断打开（阻止请求）
  HALF_OPEN = 'HALF_OPEN' // 半开（尝试恢复）
}

/**
 * 熔断器配置
 */
export interface CircuitBreakerConfig {
  failureThreshold: number;    // 失败阈值
  successThreshold: number;    // 成功阈值（半开状态）
  timeout: number;             // 超时时间（毫秒）
  halfOpenTimeout: number;     // 半开状态超时（毫秒）
}

/**
 * 熔断器
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;

  constructor(private config: CircuitBreakerConfig) {}

  /**
   * 执行函数（带熔断保护）
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 检查熔断器状态
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN - requests are blocked');
      }
      this.setState(CircuitState.HALF_OPEN);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * 成功回调
   */
  private onSuccess() {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.setState(CircuitState.CLOSED);
        this.successCount = 0;
        this.failureCount = 0;
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * 失败回调
   */
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.failureThreshold) {
      this.setState(CircuitState.OPEN);
      this.nextAttemptTime = Date.now() + this.config.halfOpenTimeout;
    }
  }

  /**
   * 设置状态
   */
  private setState(state: CircuitState) {
    const oldState = this.state;
    this.state = state;
    console.log(`[CircuitBreaker] 状态变更: ${oldState} -> ${state}`);
  }

  /**
   * 获取当前状态
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * 重置熔断器
   */
  reset() {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    console.log('[CircuitBreaker] 已重置');
  }
}

/**
 * 并发限流器
 */
export class ConcurrencyLimiter {
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(private maxConcurrent: number) {}

  /**
   * 执行函数（带并发限制）
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // 等待可用槽位
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => {
        this.queue.push(resolve as () => void);
      });
    }

    this.running++;

    try {
      return await fn();
    } finally {
      this.running--;

      // 通知队列中的等待者
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }
}

/**
 * 超时包装器
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = 'Operation timed out'
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle!);
  }
}

/**
 * 批量执行（带并发控制）
 */
export async function batchExecute<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const limiter = new ConcurrencyLimiter(concurrency);
  const results: R[] = [];

  for (const item of items) {
    const result = await limiter.execute(() => fn(item));
    results.push(result);
  }

  return results;
}
