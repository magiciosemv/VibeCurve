/**
 * 测试工具和辅助函数
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { config } from '../src/config';

/**
 * 测试结果记录
 */
export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  duration: number;
  error?: string;
  details?: any;
}

/**
 * 测试套件
 */
export class TestSuite {
  private results: TestResult[] = [];
  private suiteName: string;

  constructor(name: string) {
    this.suiteName = name;
  }

  /**
   * 运行单个测试
   */
  async test(name: string, fn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    console.log(`\n[${this.suiteName}] ${name}...`);

    try {
      await fn();
      const duration = Date.now() - startTime;
      this.results.push({
        name,
        status: 'PASS',
        duration
      });
      console.log(`  ✓ PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({
        name,
        status: 'FAIL',
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      console.error(`  ✗ FAILED (${duration}ms): ${error}`);
    }
  }

  /**
   * 跳过测试
   */
  skip(name: string, reason: string): void {
    console.log(`\n[${this.suiteName}] ${name}...`);
    console.log(`  ⊘ SKIPPED: ${reason}`);
    this.results.push({
      name,
      status: 'SKIP',
      duration: 0
    });
  }

  /**
   * 输出测试总结
   */
  summary(): void {
    console.log('\n' + '='.repeat(60));
    console.log(`TEST SUMMARY: ${this.suiteName}`);
    console.log('='.repeat(60));

    const passed = this.results.filter(r => r.status === 'PASS').length;
    const failed = this.results.filter(r => r.status === 'FAIL').length;
    const skipped = this.results.filter(r => r.status === 'SKIP').length;
    const total = this.results.length;

    console.log(`Total: ${total} | Passed: ${passed} | Failed: ${failed} | Skipped: ${skipped}`);
    console.log(`Success Rate: ${((passed / (total - skipped) * 100).toFixed(1))}%`);

    if (failed > 0) {
      console.log('\nFailed Tests:');
      this.results
        .filter(r => r.status === 'FAIL')
        .forEach(r => {
          console.log(`  ✗ ${r.name}`);
          console.log(`    ${r.error}`);
        });
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * 导出 JSON 格式报告
   */
  exportJson(): any {
    return {
      suite: this.suiteName,
      timestamp: new Date().toISOString(),
      summary: {
        total: this.results.length,
        passed: this.results.filter(r => r.status === 'PASS').length,
        failed: this.results.filter(r => r.status === 'FAIL').length,
        skipped: this.results.filter(r => r.status === 'SKIP').length,
        successRate: this.results.filter(r => r => r.status === 'PASS').length / (this.results.length - this.results.filter(r => r.status === 'SKIP').length)
      },
      tests: this.results
    };
  }
}

/**
 * 模拟延迟
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成随机代币地址
 */
export function randomTokenMint(): string {
  return Math.random().toString().substring(2, 10) + '...'.repeat(30) + '...';
}

/**
 * 生成模拟价格数据
 */
export function generateMockPrices(dex: string, basePrice: number, variance: number): number {
  return basePrice * (1 + (Math.random() - 0.5) * variance);
}

/**
 * 验证地址格式
 */
export function isValidPublicKey(address: string): boolean {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * 测试 RPC 连接
 */
export async function testConnection(connection: Connection): Promise<boolean> {
  try {
    const slot = await connection.getSlot();
    return slot > 0;
  } catch {
    return false;
  }
}

/**
 * 测试 API 可用性
 */
export async function testApi(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * 性能测试辅助类
 */
export class PerformanceTest {
  private measurements: number[] = [];

  async measure(name: string, fn: () => Promise<void>): Promise<number> {
    const start = Date.now();
    await fn();
    const duration = Date.now() - start;
    this.measurements.push(duration);
    return duration;
  }

  getStats(): { min: number; max: number; avg: number; median: number } {
    const sorted = [...this.measurements].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg,
      median
    };
  }

  clear(): void {
    this.measurements = [];
  }
}
