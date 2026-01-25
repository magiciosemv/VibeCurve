/**
 * 模拟运行测试 - 模拟真实的套利场景
 */

import { TestSuite, delay, randomTokenMint } from './test-utils';
import { Connection } from '@solana/web3.js';
import { config } from '../src/config';
import { ArbitrageSystem } from '../src/core/arbitrageSystem';
import { DexAggregator } from '../src/core/dexAggregator';

export async function runSimulationTests() {
  const suite = new TestSuite('Simulation Tests');

  // 测试 1: 短期模拟运行（1 分钟）
  await suite.test('短期模拟运行', async () => {
    const connection = new Connection(config.rpcUrl);

    const system = new ArbitrageSystem(connection, config.payer, {
      scanInterval: 10000,  // 10 秒
      minProfitPercent: 0.3,
      minLiquidity: 5,       // 降低要求以增加测试机会
      tradeAmount: 0.01,
      simulationMode: true,
      autoExecute: false,      // 不自动执行
      alertOnly: true,
      tokensToScan: [
        { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' },
        { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'WIF' },
        { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnJ7xfgHd', symbol: 'Bonk' },
      ]
    });

    console.log('    开始 30 秒模拟运行...');

    // 启动系统
    await system.start();

    // 运行 30 秒（应该扫描 3 次）
    await delay(30000);

    // 停止系统
    system.stop();

    // 获取统计
    const stats = system.getStats();
    console.log(`    执行次数: ${stats.performance.totalExecutions}`);
    console.log(`    成功率: ${(stats.performance.successRate * 100).toFixed(1)}%`);
    console.log(`    净利润: ${stats.performance.netProfit.toFixed(6)} SOL`);

    if (stats.performance.totalExecutions === 0) {
      console.log('    ⚠️  未发现任何套利机会（可能市场平稳）');
    }
  });

  // 测试 2: 手动扫描测试
  await suite.test('手动扫描测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const system = new ArbitrageSystem(connection, config.payer, {
      minProfitPercent: 0.2,  // 降低阈值
      minLiquidity: 5,
      simulationMode: true,
      tokensToScan: [
        { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' },
        { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'WIF' },
      ]
    });

    const opportunities = await system.manualScan();

    console.log(`    扫描完成: 发现 ${opportunities.length} 个机会`);

    // 分析机会
    if (opportunities.length > 0) {
      opportunities.forEach((opp, i) => {
        console.log(`    ${i + 1}. ${opp.tokenSymbol}:`);
        console.log(`       路径: ${opp.buyDex} (${opp.buyPrice.toFixed(8)}) -> ${opp.sellDex} (${opp.sellPrice.toFixed(8)})`);
        console.log(`       利润: ${opp.priceDiff.toFixed(3)}% | ${opp.estimatedProfit.toFixed(4)} SOL`);
        console.log(`       置信度: ${opp.confidence} | 流动性: ${opp.liquidity.toFixed(1)} SOL`);
      });
    }
  });

  // 测试 3: 模拟连续执行测试
  await suite.test('模拟连续执行测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;
    const { ArbitrageExecutor } = await import('../src/core/arbitrageExecutor');

    const executor = new ArbitrageExecutor(connection, wallet, {
      simulationMode: true,
      tradeAmount: 0.1
    });

    const stats = new ArbExecutorStats();

    // 模拟 10 次套利
    const mockOpps = Array(10).fill(null).map((_, i) => ({
      tokenMint: `mock${i}`,
      tokenSymbol: `MOCK${i}`,
      buyDex: 'Raydium',
      sellDex: 'Orca',
      buyPrice: 0.00001 + Math.random() * 0.000001,
      sellPrice: 0.0000105 + Math.random() * 0.000001,
      priceDiff: 0.5,
      estimatedProfit: 0.005,
      liquidity: 100,
      timestamp: Date.now(),
      confidence: 'HIGH' as const
    }));

    for (const opp of mockOpps) {
      const result = await executor.executeArbitrage(opp);
      stats.addResult(result);
      await delay(100); // 模拟间隔
    }

    const s = stats.getStats();
    console.log(`    模拟 10 次套利:`);
    console.log(`    成功次数: ${s.totalExecutions}`);
    console.log(`    成功率: ${(s.successRate * 100).toFixed(1)}%`);
    console.log(`    净利润: ${s.netProfit.toFixed(6)} SOL`);
    console.log(`    平均耗时: ${s.avgExecutionTime.toFixed(0)}ms`);

    if (s.netProfit <= 0) {
      throw new Error('模拟应该有净利润');
    }
  });

  // 测试 4: 压力测试（高并发）
  await suite.test('压力测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const aggregator = new DexAggregator(connection);

    console.log('    并发获取 50 个代币价格...');

    const start = Date.now();
    const promises = [];

    for (let i = 0; i < 50; i++) {
      promises.push(aggregator.getAllPrices(randomTokenMint()));
    }

    await Promise.all(promises);
    const duration = Date.now() - start;

    console.log(`    完成 50 个代币查询: ${duration}ms`);
    console.log(`    平均每个: ${(duration / 50).toFixed(0)}ms`);

    if (duration > 30000) {
      throw new Error('压力测试失败: 超过 30 秒');
    }
  });

  // 测试 5: 长期稳定性
  suite.skip('长期稳定性测试', '需要较长时间，建议在后台运行');

  // 输出总结
  suite.summary();

  return suite.exportJson();
}

/**
 * ArbitorStats 引入（用于模拟测试）
 */
import { ArbitrageStats as ImportedStats } from '../src/core/arbitrageExecutor';

class ArbExecutorStats extends ImportedStats {}
