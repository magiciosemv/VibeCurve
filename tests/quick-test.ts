/**
 * 快速测试 - 验证核心功能
 */

import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../src/config';

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║         VibeCurve 快速功能测试                                ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log('');

async function runQuickTest() {
  let passed = 0;
  let failed = 0;

  // 测试 1: 配置验证
  console.log('📋 测试 1: 配置验证...');
  try {
    if (!config.rpcUrl) throw new Error('RPC URL 未配置');
    if (!config.payer) throw new Error('钱包未配置');
    console.log('  ✓ 配置加载成功');
    passed++;
  } catch (err) {
    const error = err as Error;
    console.error(`  ✗ 失败: ${error.message}`);
    failed++;
  }

  // 测试 2: RPC 连接
  console.log('\n📋 测试 2: RPC 连接...');
  try {
    const connection = new Connection(config.rpcUrl);
    const slot = await connection.getSlot();
    console.log(`  ✓ RPC 连接成功 (Slot: ${slot})`);
    passed++;
  } catch (err) {
    const error = err as Error;
    console.error(`  ✗ RPC 连接失败: ${error.message}`);
    failed++;
  }

  // 测试 3: 模块加载
  console.log('\n📋 测试 3: 核心模块加载...');
  try {
    const { DexAggregator } = await import('../src/core/dexAggregator');
    const { ArbitrageScanner } = await import('../src/core/dexAggregator');
    const { ArbitrageExecutor } = await import('../src/core/arbitrageExecutor');
    const { ArbitrageSystem } = await import('../src/core/arbitrageSystem');
    console.log('  ✓ 所有核心模块加载成功');
    passed++;
  } catch (err) {
    const error = err as Error;
    console.error(`  ✗ 模块加载失败: ${error.message}`);
    failed++;
  }

  // 测试 4: API 可用性（简化版）
  console.log('\n📋 测试 4: API 可用性...');
  try {
    const apis = [
      'https://price.jup.ag/v6/price',
      'https://api.raydium.io/v2/sdk/liquidity/mainnet.json'
    ];

    for (const api of apis) {
      const response = await fetch(api, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error(`${api} 返回 ${response.status}`);
      }
    }
    console.log('  ✓ 所有 API 可访问');
    passed++;
  } catch (err) {
    const error = err as Error;
    console.error(`  ✗ API 测试失败: ${error.message}`);
    failed++;
    console.log('  ⚠️  这可能是因为网络问题或 API 不可用');
  }

  // 测试 5: 模拟套利执行
  console.log('\n📋 测试 5: 模拟套利执行...');
  try {
    const { ArbitrageExecutor } = await import('../src/core/arbitrageExecutor');
    const connection = new Connection(config.rpcUrl);
    const executor = new ArbitrageExecutor(connection, config.payer, {
      simulationMode: true
    });

    const mockOpp = {
      tokenMint: 'test',
      tokenSymbol: 'TEST',
      buyDex: 'Raydium',
      sellDex: 'Orca',
      buyPrice: 0.00001,
      sellPrice: 0.0000105,
      priceDiff: 0.5,
      estimatedProfit: 0.005,
      liquidity: 50,
      timestamp: Date.now(),
      confidence: 'MEDIUM' as const
    };

    const result = await executor.executeArbitrage(mockOpp);

    if (!result.success) {
      throw new Error(result.error);
    }

    if (result.netProfit <= 0) {
      throw new Error('模拟套利应该有利润');
    }

    console.log(`  ✓ 模拟套利成功`);
    console.log(`    利润: ${result.netProfit.toFixed(6)} SOL`);
    console.log(`    耗时: ${result.executionTime}ms`);
    passed++;
  } catch (err) {
    const error = err as Error;
    console.error(`  ✗ 模拟套利失败: ${error.message}`);
    failed++;
  }

  // 总结
  console.log('\n' + '='.repeat(60));
  console.log('测试总结:');
  console.log(`  总测试: ${passed + failed}`);
  console.log(`  通过: ${passed}`);
  console.log(`  失败: ${failed}`);
  console.log(`  成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('='.repeat(60));

  if (failed === 0) {
    console.log('\n✅ 所有测试通过！系统运行正常。');
    console.log('\n下一步:');
    console.log('1. 运行: npx ts-node src/dashboard-arbitrage.ts');
    console.log('2. 按 SPACE 启动模拟监控');
    console.log('3. 观察 30 分钟，收集套利机会数据');
  } else {
    console.log('\n⚠️  部分测试失败');
    console.log('\n建议:');
    console.log('1. 检查网络连接');
    console.log('2. 检查 RPC URL 配置');
    console.log('3. 确保所有依赖已安装');
  }
}

runQuickTest().catch(err => {
  const error = err as Error;
  console.error('\n测试运行失败:', error);
  process.exit(1);
});
