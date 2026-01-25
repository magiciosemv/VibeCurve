/**
 * 集成测试 - 测试模块间的协作
 */

import { TestSuite, delay, randomTokenMint, generateMockPrices, testConnection, testApi } from './test-utils';
import { Connection } from '@solana/web3.js';
import { config } from '../src/config';
import { DexAggregator, ArbitrageScanner } from '../src/core/dexAggregator';
import { ArbitrageExecutor } from '../src/core/arbitrageExecutor';
import { ArbitrageSystem } from '../src/core/arbitrageSystem';

export async function runIntegrationTests() {
  const suite = new TestSuite('Integration Tests');

  // 测试 1: RPC 连接
  await suite.test('RPC 连接测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const connected = await testConnection(connection);

    if (!connected) {
      throw new Error('无法连接到 Solana RPC');
    }

    const slot = await connection.getSlot();
    console.log(`    当前 Slot: ${slot}`);
  });

  // 测试 2: Jupiter API 可用性
  await suite.test('Jupiter API 可用性', async () => {
    const available = await testApi('https://price.jup.ag/v6/price?ids=So11111111111111111111111111111111111111112');

    if (!available) {
      throw new Error('Jupiter API 不可用');
    }

    console.log('    Jupiter API 正常');
  });

  // 测试 3: Raydium API 可用性
  await suite.test('Raydium API 可用性', async () => {
    const available = await testApi('https://api.raydium.io/v2/sdk/liquidity/mainnet.json');

    if (!available) {
      throw new Error('Raydium API 不可用');
    }

    console.log('    Raydium API 正常');
  });

  // 测试 4: Orca API 可用性
  await suite.test('Orca API 可用性', async () => {
    const available = await testApi('https://api.orca.so/v1/whirlpool/list');

    if (!available) {
      throw new Error('Orca API 不可用');
    }

    console.log('    Orca API 正常');
  });

  // 测试 5: 完整的套利流程（模拟）
  await suite.test('完整套利流程（模拟）', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;

    // 1. 初始化扫描器
    const scanner = new ArbitrageScanner(connection, 0.3, 10);
    console.log('    ✓ 扫描器初始化成功');

    // 2. 创建模拟机会
    const mockOpp = {
      tokenMint: randomTokenMint(),
      tokenSymbol: 'MOCK',
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
    console.log('    ✓ 创建模拟机会');

    // 3. 执行套利
    const executor = new ArbitrageExecutor(connection, wallet, {
      simulationMode: true,
      tradeAmount: 0.1
    });

    const result = await executor.executeArbitrage(mockOpp);

    if (!result.success) {
      throw new Error(`套利执行失败: ${result.error}`);
    }

    if (result.netProfit <= 0) {
      throw new Error('套利应该有净利润');
    }

    console.log(`    ✓ 执行成功，利润: ${result.netProfit.toFixed(6)} SOL`);
  });

  // 测试 6: 套利系统集成
  await suite.test('套利系统集成测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;

    const system = new ArbitrageSystem(connection, wallet, {
      scanInterval: 5000,
      minProfitPercent: 0.3,
      minLiquidity: 10,
      tradeAmount: 0.01,
      simulationMode: true,
      autoExecute: false,
      alertOnly: true,
      tokensToScan: [
        { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' }
      ]
    });

    // 测试手动扫描
    const opportunities = await system.manualScan();

    console.log(`    扫描完成，发现 ${opportunities.length} 个机会`);

    // 获取统计
    const stats = system.getStats();
    console.log(`    系统状态: 运行=${stats.system.isRunning}, 扫描代币=${stats.system.tokensScanning}`);

    // 停止系统
    system.stop();
    console.log('    ✓ 系统已停止');
  });

  // 测试 7: 配置热更新
  await suite.test('配置热更新', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;

    const system = new ArbitrageSystem(connection, wallet, {
      minProfitPercent: 0.3
    });

    // 更新配置
    system.updateConfig({ minProfitPercent: 0.5 });

    const newConfig = system.getConfig();
    if (newConfig.minProfitPercent !== 0.5) {
      throw new Error('配置更新失败');
    }

    console.log('    ✓ 配置更新成功');
  });

  // 测试 8: 模式切换
  await suite.test('模式切换测试', async () => {
    const connection = new Connection(config.rpcUrl);
    const wallet = config.payer;

    const executor = new ArbitrageExecutor(connection, wallet, {
      simulationMode: true
    });

    // 切换到真实模式
    executor.setSimulationMode(false);
    if (executor.getConfig().simulationMode !== false) {
      throw new Error('模式切换失败');
    }

    // 切换回模拟模式
    executor.setSimulationMode(true);
    if (executor.getConfig().simulationMode !== true) {
      throw new Error('模式切换失败');
    }

    console.log('    ✓ 模式切换成功');
  });

  // 输出总结
  suite.summary();

  return suite.exportJson();
}
