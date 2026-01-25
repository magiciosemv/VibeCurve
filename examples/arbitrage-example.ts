/**
 * 跨 DEX 套利系统使用示例
 *
 * 本示例展示如何使用 ArbitrageSystem 进行套利交易
 *
 * 运行方式:
 * npx ts-node examples/arbitrage-example.ts
 */

import { Connection, Keypair } from '@solana/web3.js';
import { config } from '../src/config';
import { ArbitrageSystem } from '../src/core/arbitrageSystem';
import { ArbitrageScanner } from '../src/core/dexAggregator';

/**
 * 示例 1: 基本套利扫描（手动模式）
 */
async function example1_BasicScan() {
  console.log('\n=== 示例 1: 基本套利扫描 ===\n');

  const connection = new Connection(config.rpcUrl);
  const scanner = new ArbitrageScanner(connection, 0.3, 10);

  // 扫描单个代币
  const opp = await scanner.scanToken(
    'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump',
    'Chill Guy'
  );

  if (opp) {
    console.log('发现套利机会!');
    console.log(JSON.stringify(opp, null, 2));
  } else {
    console.log('当前无套利机会');
  }
}

/**
 * 示例 2: 批量扫描多个代币
 */
async function example2_BatchScan() {
  console.log('\n=== 示例 2: 批量扫描 ===\n');

  const connection = new Connection(config.rpcUrl);
  const scanner = new ArbitrageScanner(connection, 0.3, 10);

  const tokens = [
    { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' },
    { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'WIF' },
    { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'Bonk' },
  ];

  const opportunities = await scanner.scanBatch(tokens);

  console.log(`\n扫描完成，发现 ${opportunities.length} 个机会:`);
  opportunities.forEach((opp, i) => {
    console.log(`\n${i + 1}. ${opp.tokenSymbol}`);
    console.log(`   路径: ${opp.buyDex} -> ${opp.sellDex}`);
    console.log(`   利润: ${opp.priceDiff.toFixed(3)}% (${opp.estimatedProfit.toFixed(4)} SOL)`);
    console.log(`   置信度: ${opp.confidence}`);
  });
}

/**
 * 示例 3: 自动套利系统（监控模式）
 */
async function example3_AutoSystem() {
  console.log('\n=== 示例 3: 自动套利系统 ===\n');

  const connection = new Connection(config.rpcUrl);
  const system = new ArbitrageSystem(connection, config.payer, {
    scanInterval: 15000,          // 15 秒扫描一次
    minProfitPercent: 0.3,       // 0.3% 最小利润
    minLiquidity: 10,            // 10 SOL 最小流动性
    tradeAmount: 0.01,           // 0.01 SOL 交易金额
    simulationMode: true,        // 模拟模式（安全）
    autoExecute: false,          // 不自动执行
    alertOnly: true,             // 仅发送通知
    tokensToScan: [
      { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' },
      { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'WIF' },
    ]
  });

  // 启动系统
  await system.start();

  console.log('\n套利系统已启动，按 Ctrl+C 停止');
  console.log('系统将每 15 秒扫描一次套利机会');
  console.log('发现机会时会发送 Telegram 通知\n');

  // 运行 5 分钟后自动停止（用于演示）
  setTimeout(() => {
    console.log('\n演示结束，停止系统...');
    system.stop();

    // 输出统计
    const stats = system.getStats();
    console.log('\n系统统计:', stats);

    process.exit(0);
  }, 5 * 60 * 1000);
}

/**
 * 示例 4: 启用真实交易模式
 *
 * ⚠️ 警告: 此模式将使用真实资金
 *
 * 使用前请确保:
 * 1. 已完成充分的回测
 * 2. 已在模拟模式下运行一段时间
 * 3. 了解所有风险
 * 4. 只使用小额资金开始
 */
async function example4_LiveTrading() {
  console.log('\n=== 示例 4: 真实交易模式 ===\n');
  console.log('⚠️  警告: 即将启用真实交易模式');
  console.log('⚠️  真实资金将被使用!');
  console.log('\n取消请按 Ctrl+C\n');

  // 等待 5 秒让用户有机会取消
  await new Promise(resolve => setTimeout(resolve, 5000));

  const connection = new Connection(config.rpcUrl);
  const system = new ArbitrageSystem(connection, config.payer, {
    scanInterval: 10000,          // 10 秒扫描一次
    minProfitPercent: 0.5,       // 0.5% 最小利润（更严格）
    minLiquidity: 50,            // 50 SOL 最小流动性（更严格）
    tradeAmount: 0.05,           // 0.05 SOL 交易金额
    simulationMode: false,       // 真实交易
    autoExecute: true,           // 自动执行
    alertOnly: false,            // 执行交易
    tokensToScan: [
      { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' },
      { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'WIF' },
    ]
  });

  // 启用真实交易
  system.enableLiveTrading(0.05);

  // 启动系统
  await system.start();

  console.log('\n真实交易系统已启动!');
  console.log('每笔交易金额: 0.05 SOL');
  console.log('请密切监控系统表现\n');

  // 不自动停止，需要手动停止
}

/**
 * 示例 5: 自定义参数扫描
 */
async function example5_CustomParams() {
  console.log('\n=== 示例 5: 自定义参数 ===\n');

  const connection = new Connection(config.rpcUrl);
  const system = new ArbitrageSystem(connection, config.payer, {
    scanInterval: 5000,           // 5 秒扫描一次（更快）
    minProfitPercent: 0.1,       // 0.1% 最小利润（更宽松）
    minLiquidity: 5,             // 5 SOL 最小流动性（更宽松）
    tradeAmount: 0.1,            // 0.1 SOL 交易金额
    simulationMode: true,
    autoExecute: false,
    alertOnly: true,
    tokensToScan: [
      { mint: 'GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump', symbol: 'Chill Guy' },
    ]
  });

  // 手动触发一次扫描
  const opportunities = await system.manualScan();

  console.log(`\n发现 ${opportunities.length} 个机会`);

  // 动态调整参数
  console.log('\n调整参数: 最小利润 0.5%');
  system.updateConfig({ minProfitPercent: 0.5 });

  const newOpps = await system.manualScan();
  console.log(`调整后发现 ${newOpps.length} 个机会`);
}

/**
 * 主函数 - 根据命令行参数运行不同示例
 */
async function main() {
  const args = process.argv.slice(2);
  const example = args[0] || '1';

  try {
    switch (example) {
      case '1':
        await example1_BasicScan();
        break;
      case '2':
        await example2_BatchScan();
        break;
      case '3':
        await example3_AutoSystem();
        break;
      case '4':
        await example4_LiveTrading();
        break;
      case '5':
        await example5_CustomParams();
        break;
      default:
        console.log('使用方法:');
        console.log('  npx ts-node examples/arbitrage-example.ts [示例编号]');
        console.log('\n可用的示例:');
        console.log('  1 - 基本套利扫描（手动模式）');
        console.log('  2 - 批量扫描多个代币');
        console.log('  3 - 自动套利系统（监控模式，5分钟后自动停止）');
        console.log('  4 - 真实交易模式（⚠️ 使用真实资金）');
        console.log('  5 - 自定义参数扫描');
    }
  } catch (error) {
    console.error('执行失败:', error);
    process.exit(1);
  }
}

// 运行主函数
main();
