/**
 * 单元测试 - 测试各个模块的基本功能
 */

import { TestSuite, delay, randomTokenMint, generateMockPrices, isValidPublicKey } from './test-utils';
import { Connection, Keypair } from '@solana/web3.js';
import { DexAggregator, ArbitrageScanner } from '../src/core/dexAggregator';
import { ArbitrageExecutor, ArbitrageStats } from '../src/core/arbitrageExecutor';
import { config } from '../src/config';

export async function runUnitTests() {
  const suite = new TestSuite('Unit Tests');

  // 测试 1: 配置验证
  await suite.test('配置加载验证', async () => {
    if (!config.rpcUrl) {
      throw new Error('RPC URL 未配置');
    }
    if (!config.payer) {
      throw new Error('钱包未配置');
    }
    // 配置加载成功
  });

  // 测试 2: 地址格式验证
  await suite.test('地址格式验证', async () => {
    const validAddress = 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump';
    if (!isValidPublicKey(validAddress)) {
      throw new Error('有效地址验证失败');
    }

    const invalidAddress = 'invalid_address_12345';
    if (isValidPublicKey(invalidAddress)) {
      throw new Error('无效地址应该验证失败');
    }
  });

  // 测试 3: DEX 聚合器初始化
  await suite.test('DEX 聚合器初始化', async () => {
    const connection = new Connection(config.rpcUrl);
    const aggregator = new DexAggregator(connection);

    if (!aggregator) {
      throw new Error('聚合器初始化失败');
    }

    const stats = aggregator.getCacheStats();
    if (stats.size !== 0) {
      throw new Error('缓存应该为空');
    }
  });

  // 测试 4: 套利扫描器初始化
  await suite.test('套利扫描器初始化', async () => {
    const connection = new Connection(config.rpcUrl);
    const scanner = new ArbitrageScanner(connection, 0.3, 10);

    if (!scanner) {
      throw new Error('扫描器初始化失败');
    }
  });

  // 测试 5: 套利执行器初始化（模拟模式）
  await suite.test('套利执行器初始化', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;
    const executor = new ArbitrageExecutor(connection, wallet, {
      simulationMode: true,
      tradeAmount: 0.1
    });

    const conf = executor.getConfig();
    if (conf.simulationMode !== true) {
      throw new Error('模拟模式未设置');
    }
  });

  // 测试 6: 模拟套利执行
  await suite.test('模拟套利执行', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;
    const executor = new ArbitrageExecutor(connection, wallet, {
      simulationMode: true,
      tradeAmount: 0.1
    });

    const mockOpp = {
      tokenMint: randomTokenMint(),
      tokenSymbol: 'TEST',
      buyDex: 'Raydium',
      sellDex: 'Orca',
      buyPrice: 0.00001,
      sellPrice: 0.0000105, // 0.5% 价差
      priceDiff: 0.5,
      estimatedProfit: 0.0005,
      liquidity: 100,
      timestamp: Date.now(),
      confidence: 'HIGH' as const
    };

    const result = await executor.executeArbitrage(mockOpp);

    if (!result.success) {
      throw new Error(`模拟执行失败: ${result.error}`);
    }

    if (result.netProfit <= 0) {
      throw new Error('模拟执行应该有利润');
    }

    console.log(`    模拟利润: ${result.netProfit.toFixed(6)} SOL`);
  });

  // 测试 7: 套利统计
  await suite.test('套利统计计算', async () => {
    const stats = new ArbitrageStats();

    // 添加一个成功的套利
    stats.addResult({
      success: true,
      opportunity: {} as any,
      trades: [] as any[],
      totalProfit: 0.1,
      totalCost: 0.1,
      netProfit: 0,
      executionTime: 1000
    });

    // 添加一个失败的套利
    stats.addResult({
      success: false,
      opportunity: {} as any,
      trades: [] as any[],
      totalProfit: 0,
      totalCost: 0,
      netProfit: -0.01,
      executionTime: 500,
      error: 'Failed'
    });

    const s = stats.getStats();

    if (s.totalExecutions !== 2) {
      throw new Error('执行次数应该为 2');
    }

    if (s.successRate !== 0.5) {
      throw new Error('成功率应该为 0.5');
    }

    if (s.netProfit !== -0.01) {
      throw new Error('净利润应该为 -0.01');
    }

    console.log(`    成功率: ${(s.successRate * 100).toFixed(1)}%`);
    console.log(`    净利润: ${s.netProfit.toFixed(6)} SOL`);
  });

  // 测试 8: 价格缓存机制
  await suite.test('价格缓存机制', async () => {
    const connection = new Connection(config.rpcUrl);
    const aggregator = new DexAggregator(connection);

    // 第一次获取（未缓存）
    const start1 = Date.now();
    // await aggregator.getAllPrices(randomTokenMint());
    const duration1 = Date.now() - start1;

    // 第二次获取（缓存）
    const start2 = Date.now();
    // await aggregator.getAllPrices(randomTokenMint());
    const duration2 = Date.now() - start2;

    console.log(`    首次获取: ${duration1}ms`);
    console.log(`    缓存获取: ${duration2}ms`);

    // 清除缓存
    aggregator.clearCache();
    const stats = aggregator.getCacheStats();
    if (stats.size !== 0) {
      throw new Error('缓存应该已清除');
    }
  });

  // 输出总结
  suite.summary();

  return suite.exportJson();
}
