/**
 * 性能测试 - 测试系统性能指标
 */

import { TestSuite, delay, PerformanceTest } from './test-utils';
import { Connection } from '@solana/web3.js';
import { config } from '../src/config';
import { DexAggregator, ArbitrageScanner } from '../src/core/dexAggregator';
import { ArbitrageExecutor } from '../src/core/arbitrageExecutor';

export async function runPerformanceTests() {
  const suite = new TestSuite('Performance Tests');
  const perf = new PerformanceTest();

  // 测试 1: API 响应时间
  await suite.test('API 响应时间测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const aggregator = new DexAggregator(connection);
    const testToken = 'So11111111111111111111111111111111111111112'; // SOL

    const times = [];
    for (let i = 0; i < 5; i++) {
      const time = await perf.measure('getJupiterPrice', async () => {
        await aggregator['getJupiterPrice'](testToken);
      });
      times.push(time);
      await delay(100);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);

    console.log(`    平均响应: ${avgTime.toFixed(0)}ms`);
    console.log(`    最大响应: ${maxTime}ms`);

    if (avgTime > 1000) {
      throw new Error('API 响应时间过长 (> 1s)');
    }
  });

  // 测试 2: 扫描性能
  await suite.test('扫描性能测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const scanner = new ArbitrageScanner(connection, 0.3, 10);

    const tokens = [
      { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' },
      { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'WIF' },
    ];

    const start = Date.now();
    await scanner.scanBatch(tokens);
    const duration = Date.now() - start;

    console.log(`    扫描 ${tokens.length} 个代币耗时: ${duration}ms`);
    console.log(`    平均每个代币: ${(duration / tokens.length).toFixed(0)}ms`);

    if (duration > 10000) {
      throw new Error('扫描速度过慢 (> 10s)');
    }
  });

  // 测试 3: 内存占用
  await suite.test('内存占用测试', async () => {
    const memBefore = process.memoryUsage();

    const connection = new Connection(config.rpcUrl);
    const aggregator = new DexAggregator(connection);

    // 添加 100 个代币到缓存
    for (let i = 0; i < 100; i++) {
      await aggregator.getAllPrices(`mock${i}`);
    }

    const memAfter = process.memoryUsage();
    const heapUsed = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024;

    console.log(`    堆内存增长: ${heapUsed.toFixed(2)} MB`);
    console.log(`    总堆内存: ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)} MB`);

    if (heapUsed > 50) {
      throw new Error('内存增长过多 (> 50 MB)');
    }
  });

  // 测试 4: 并发处理能力
  await suite.test('并发处理测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const scanner = new ArbitrageScanner(connection, 0.3, 10);

    const tokens = Array(10).fill(null).map((_, i) => ({
      mint: `mock${i}`,
      symbol: `TOKEN${i}`
    }));

    const start = Date.now();
    const results = await Promise.all(
      tokens.map(t => scanner.scanToken(t.mint, t.symbol))
    );
    const duration = Date.now() - start;

    const opportunities = results.filter(r => r !== null);
    console.log(`    并发扫描 10 个代币: ${duration}ms`);
    console.log(`    发现机会: ${opportunities.length} 个`);

    if (duration > 5000) {
      throw new Error('并发处理速度过慢');
    }
  });

  // 测试 5: 执行器性能
  await suite.test('执行器性能测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;
    const executor = new ArbitrageExecutor(connection, wallet, {
      simulationMode: true
    });

    const mockOpp = {
      tokenMint: 'test',
      tokenSymbol: 'TEST',
      buyDex: 'Raydium',
      sellDex: 'Orca',
      buyPrice: 0.00001,
      sellPrice: 0.0000103,
      priceDiff: 0.3,
      estimatedProfit: 0.003,
      liquidity: 50,
      timestamp: Date.now(),
      confidence: 'MEDIUM' as const
    };

    const times = [];
    for (let i = 0; i < 10; i++) {
      const time = await perf.measure('execution', async () => {
        await executor.executeArbitrage(mockOpp);
      });
      times.push(time);
    }

    const stats = perf.getStats();
    console.log(`    平均执行时间: ${stats.avg.toFixed(0)}ms`);
    console.log(`    最快: ${stats.min}ms | 最慢: ${stats.max}ms | 中位数: ${stats.median.toFixed(0)}ms`);

    if (stats.avg > 1000) {
      throw new Error('平均执行时间过长 (> 1s)');
    }
  });

  // 测试 6: 缓存效率
  await suite.test('缓存效率测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const aggregator = new DexAggregator(connection);

    const testToken = 'So11111111111111111111111111111111111111112';

    // 第一次获取（未缓存）
    const time1 = await perf.measure('first-call', async () => {
      await aggregator['getJupiterPrice'](testToken);
    });

    // 第二次获取（缓存）
    const time2 = await perf.measure('cached-call', async () => {
      await aggregator['getJupiterPrice'](testToken);
    });

    console.log(`    首次调用: ${time1}ms`);
    console.log(`   缓存调用: ${time2}ms`);
    console.log(`   加速比: ${(time1 / time2).toFixed(2)}x`);

    if (time2 > 100) {
      throw new Error('缓存效果不明显');
    }
  });

  // 输出总结
  suite.summary();

  return suite.exportJson();
}
