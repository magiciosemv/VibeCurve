/**
 * 健康检查和监控端点
 * 提供 HTTP API 用于监控系统状态
 */

import { Connection } from '@solana/web3.js';
import { createLogger } from './logger';

const logger = createLogger('HealthCheck');

/**
 * 健康检查响应
 */
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: number;
  uptime: number;
  version: string;
  services: {
    rpc: ServiceStatus;
    ai: ServiceStatus;
    jito: ServiceStatus;
    memory: ServiceStatus;
  };
  metrics: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: number;
    uptime: number;
  };
}

/**
 * 服务状态
 */
export interface ServiceStatus {
  status: 'operational' | 'degraded' | 'down';
  latency?: number; // ms
  lastCheck: number;
  error?: string;
}

/**
 * 健康检查管理器
 */
export class HealthCheckManager {
  private connection: Connection;
  private startTime: number;
  private checks: Map<string, () => Promise<ServiceStatus>> = new Map();

  constructor(connection: Connection) {
    this.connection = connection;
    this.startTime = Date.now();

    // 注册默认检查项
    this.registerDefaultChecks();
  }

  /**
   * 注册默认检查项
   */
  private registerDefaultChecks(): void {
    // RPC 健康检查
    this.checks.set('rpc', async () => {
      const startTime = Date.now();
      try {
        const slot = await this.connection.getSlot();
        const latency = Date.now() - startTime;

        if (latency > 5000) {
          return {
            status: 'degraded',
            latency,
            lastCheck: Date.now(),
            error: `High latency: ${latency}ms`
          };
        }

        return {
          status: 'operational',
          latency,
          lastCheck: Date.now()
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
          status: 'down',
          lastCheck: Date.now(),
          error: err.message
        };
      }
    });

    // AI API 健康检查
    this.checks.set('ai', async () => {
      const startTime = Date.now();
      try {
        // 检查 AI API Key 是否配置
        const apiKey = process.env.AI_API_KEY;
        if (!apiKey || apiKey === 'YOUR_DEEPSEEK_API_KEY_HERE') {
          return {
            status: 'degraded',
            lastCheck: Date.now(),
            error: 'AI API key not configured'
          };
        }

        // 这里可以添加实际的 API 调用测试
        // 但为了避免消耗配额，只检查配置
        const latency = Date.now() - startTime;

        return {
          status: 'operational',
          latency,
          lastCheck: Date.now()
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
          status: 'down',
          lastCheck: Date.now(),
          error: err.message
        };
      }
    });

    // Jito 健康检查
    this.checks.set('jito', async () => {
      const startTime = Date.now();
      try {
        // 检查 Jito 配置
        const jitoUrl = process.env.JITO_BLOCK_ENGINE_URL;
        if (!jitoUrl) {
          return {
            status: 'degraded',
            lastCheck: Date.now(),
            error: 'Jito URL not configured'
          };
        }

        const latency = Date.now() - startTime;

        return {
          status: 'operational',
          latency,
          lastCheck: Date.now()
        };
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        return {
          status: 'down',
          lastCheck: Date.now(),
          error: err.message
        };
      }
    });

    // 内存健康检查
    this.checks.set('memory', async () => {
      const memUsage = process.memoryUsage();
      const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
      const heapTotalMB = memUsage.heapTotal / 1024 / 1024;
      const usagePercent = (heapUsedMB / heapTotalMB) * 100;

      if (usagePercent > 90) {
        return {
          status: 'degraded',
          lastCheck: Date.now(),
          error: `High memory usage: ${usagePercent.toFixed(1)}%`
        };
      }

      return {
        status: 'operational',
        lastCheck: Date.now()
      };
    });
  }

  /**
   * 获取完整健康状态
   */
  async getHealthStatus(): Promise<HealthStatus> {
    const services: any = {};

    // 执行所有检查
    const checkPromises = Array.from(this.checks.entries()).map(async ([name, checkFn]) => {
      try {
        const status = await checkFn();
        return [name, status];
      } catch (error) {
        return [name, {
          status: 'down',
          lastCheck: Date.now(),
          error: error instanceof Error ? error.message : String(error)
        }];
      }
    });

    const results = await Promise.all(checkPromises);
    results.forEach(([name, status]) => {
      services[name as string] = status;
    });

    // 计算整体状态
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    const downCount = Object.values(services).filter((s: any) => s.status === 'down').length;
    const degradedCount = Object.values(services).filter((s: any) => s.status === 'degraded').length;

    if (downCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    } else {
      overallStatus = 'healthy';
    }

    return {
      status: overallStatus,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      version: this.getVersion(),
      services,
      metrics: this.getMetrics()
    };
  }

  /**
   * 获取系统指标
   */
  private getMetrics(): HealthStatus['metrics'] {
    const memUsage = process.memoryUsage();

    // CPU 使用率（简化计算）
    const cpuUsage = process.cpuUsage();

    return {
      memoryUsage: memUsage,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // 转换为秒
      uptime: process.uptime()
    };
  }

  /**
   * 获取版本信息
   */
  private getVersion(): string {
    try {
      const packageJson = require('../../package.json');
      return packageJson.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  /**
   * 注册自定义健康检查
   */
  registerCheck(name: string, checkFn: () => Promise<ServiceStatus>): void {
    this.checks.set(name, checkFn);
    logger.info(`Registered custom health check: ${name}`);
  }

  /**
   * 移除健康检查
   */
  unregisterCheck(name: string): void {
    this.checks.delete(name);
    logger.info(`Unregistered health check: ${name}`);
  }

  /**
   * 快速健康检查（仅检查关键服务）
   */
  async quickCheck(): Promise<{ healthy: boolean; timestamp: number }> {
    try {
      // 只检查 RPC 连接
      await this.connection.getSlot();
      return {
        healthy: true,
        timestamp: Date.now()
      };
    } catch {
      return {
        healthy: false,
        timestamp: Date.now()
      };
    }
  }

  /**
   * 获取就绪状态（用于 K8s readiness probe）
   */
  async getReadiness(): Promise<{ ready: boolean; checks: Record<string, boolean> }> {
    const checks: Record<string, boolean> = {};

    // 检查 RPC 连接
    try {
      await this.connection.getSlot();
      checks.rpc = true;
    } catch {
      checks.rpc = false;
    }

    // 检查配置
    checks.config = !!(process.env.AI_API_KEY && process.env.AI_API_KEY !== 'YOUR_DEEPSEEK_API_KEY_HERE');

    const ready = Object.values(checks).every(c => c === true);

    return { ready, checks };
  }
}

/**
 * Express/HTTP 路由集成
 * 如果使用 Express，可以用这个函数创建路由
 */
export function createHealthRoutes(healthCheck: HealthCheckManager) {
  return {
    // 基础健康检查
    '/health': async (req: any, res: any) => {
      try {
        const status = await healthCheck.getHealthStatus();
        const statusCode = status.status === 'healthy' ? 200 :
                          status.status === 'degraded' ? 200 : 503;
        res.status(statusCode).json(status);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Health check failed', err);
        res.status(500).json({
          status: 'unhealthy',
          error: err.message
        });
      }
    },

    // 快速健康检查
    '/health/ready': async (req: any, res: any) => {
      try {
        const readiness = await healthCheck.getReadiness();
        const statusCode = readiness.ready ? 200 : 503;
        res.status(statusCode).json(readiness);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        res.status(503).json({
          ready: false,
          error: err.message
        });
      }
    },

    // 快速存活检查
    '/health/live': async (req: any, res: any) => {
      try {
        const check = await healthCheck.quickCheck();
        const statusCode = check.healthy ? 200 : 503;
        res.status(statusCode).json(check);
      } catch (error) {
        res.status(503).json({
          healthy: false,
          timestamp: Date.now()
        });
      }
    },

    // 详细指标
    '/metrics': async (req: any, res: any) => {
      try {
        const status = await healthCheck.getHealthStatus();
        res.json({
          timestamp: status.timestamp,
          uptime: status.uptime,
          memory: status.metrics.memoryUsage,
          cpu: status.metrics.cpuUsage,
          services: status.services
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('Metrics collection failed', err);
        res.status(500).json({
          error: err.message
        });
      }
    }
  };
}

/**
 * 使用示例：
 *
 * ```typescript
 * import { HealthCheckManager, createHealthRoutes } from './utils/health';
 *
 * const healthCheck = new HealthCheckManager(connection);
 *
 * // 如果使用 Express
 * import express from 'express';
 * const app = express();
 * const routes = createHealthRoutes(healthCheck);
 *
 * app.get('/health', routes['/health']);
 * app.get('/health/ready', routes['/health/ready']);
 * app.get('/health/live', routes['/health/live']);
 * app.get('/metrics', routes['/metrics']);
 *
 * // 自定义检查
 * healthCheck.registerCheck('database', async () => {
 *   const startTime = Date.now();
 *   try {
 *     await db.ping();
 *     return {
 *       status: 'operational',
 *       latency: Date.now() - startTime,
 *       lastCheck: Date.now()
 *     };
 *   } catch (error) {
 *     return {
 *       status: 'down',
 *       lastCheck: Date.now(),
 *       error: error.message
 *     };
 *   }
 * });
 * ```
 */
