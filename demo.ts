/**
 * VibeCurve Demo Script
 *
 * 演示策略执行器的核心功能
 */

import { StrategyExecutor, TradingStrategy, StrategyType } from './src/core/strategyExecutor';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         VibeCurve Strategy Execution Demo                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  // 创建连接
  const rpcUrl = process.env.RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl);
  console.log(`✅ Connected to Solana: ${rpcUrl}`);

  // 创建钱包
  const privateKey = process.env.PRIVATE_KEY;
  let wallet: Keypair;

  if (privateKey) {
    wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
    console.log(`✅ Wallet loaded: ${wallet.publicKey.toBase58()}`);
  } else {
    wallet = Keypair.generate();
    console.log(`✅ Generated new wallet: ${wallet.publicKey.toBase58()}`);
    console.log(`   Private Key: ${bs58.encode(wallet.secretKey)}`);
  }

  // 创建策略执行器
  const executor = new StrategyExecutor(connection, wallet, {
    maxPositionSize: 0.5,
    maxTotalPosition: 2.0,
    minPositionSize: 0.01,
    stopLossPercentage: 0.15,
    takeProfitPercentage: 0.30,
    trailingStopPercentage: 0.10,
    maxDailyLoss: 1.0,
    maxDrawdown: 0.20,
    maxOpenPositions: 3,
    minLiquidity: 5.0,
    maxSlippage: 0.05,
    maxTradesPerHour: 10,
    cooldownPeriod: 30
  });

  console.log('✅ Strategy Executor initialized');
  console.log();

  // 监听策略事件
  executor.on({
    strategyId: '',
    type: 'CREATED',
    timestamp: 0
  }, (event) => {
    console.log(`📢 Event: ${event.type}`);
    console.log(`   Strategy ID: ${event.strategyId}`);
    console.log(`   Timestamp: ${new Date(event.timestamp).toISOString()}`);
    console.log();
  });

  // Demo 1: 创建 DCA 策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo 1: Creating DCA Strategy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const dcaStrategy = await executor.createStrategy({
    type: 'DCA' as StrategyType,
    tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    tokenSymbol: 'BONK',
    totalAmount: 1.0,
    intervals: 10,
    intervalSeconds: 3600,
    stopLoss: 0.15,
    takeProfit: 0.30,
    riskLevel: 'moderate'
  });

  console.log(`✅ DCA Strategy created: ${dcaStrategy.id}`);
  console.log(`   Type: ${dcaStrategy.type}`);
  console.log(`   Token: ${dcaStrategy.tokenSymbol}`);
  console.log(`   Total Amount: ${dcaStrategy.totalAmount} SOL`);
  console.log(`   Intervals: ${dcaStrategy.intervals}`);
  console.log(`   Interval: ${dcaStrategy.intervalSeconds} seconds`);
  console.log(`   Stop Loss: ${(dcaStrategy.stopLoss || 0) * 100}%`);
  console.log(`   Take Profit: ${(dcaStrategy.takeProfit || 0) * 100}%`);
  console.log();

  // Demo 2: 创建 Grid 策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo 2: Creating Grid Strategy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const gridStrategy = await executor.createStrategy({
    type: 'GRID' as StrategyType,
    tokenMint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    tokenSymbol: 'WIF',
    totalAmount: 0.5,
    intervals: 5,
    stopLoss: 0.15,
    takeProfit: 0.30,
    riskLevel: 'moderate'
  });

  console.log(`✅ Grid Strategy created: ${gridStrategy.id}`);
  console.log(`   Type: ${gridStrategy.type}`);
  console.log(`   Token: ${gridStrategy.tokenSymbol}`);
  console.log(`   Total Amount: ${gridStrategy.totalAmount} SOL`);
  console.log(`   Grid Levels: ${gridStrategy.intervals}`);
  console.log(`   Stop Loss: ${(gridStrategy.stopLoss || 0) * 100}%`);
  console.log(`   Take Profit: ${(gridStrategy.takeProfit || 0) * 100}%`);
  console.log();

  // Demo 3: 创建 Momentum 策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo 3: Creating Momentum Strategy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const momentumStrategy = await executor.createStrategy({
    type: 'MOMENTUM' as StrategyType,
    tokenMint: 'EKpQGSJtjMFqKZ9KQqMnxEJBkQpFGN6XTWqH5h1YuUuN',
    tokenSymbol: 'RAY',
    totalAmount: 0.5,
    stopLoss: 0.15,
    takeProfit: 0.30,
    riskLevel: 'aggressive'
  });

  console.log(`✅ Momentum Strategy created: ${momentumStrategy.id}`);
  console.log(`   Type: ${momentumStrategy.type}`);
  console.log(`   Token: ${momentumStrategy.tokenSymbol}`);
  console.log(`   Total Amount: ${momentumStrategy.totalAmount} SOL`);
  console.log(`   Risk Level: ${momentumStrategy.riskLevel}`);
  console.log(`   Stop Loss: ${(momentumStrategy.stopLoss || 0) * 100}%`);
  console.log(`   Take Profit: ${(momentumStrategy.takeProfit || 0) * 100}%`);
  console.log();

  // Demo 4: 创建 Mean Reversion 策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo 4: Creating Mean Reversion Strategy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const meanReversionStrategy = await executor.createStrategy({
    type: 'MEAN_REVERSION' as StrategyType,
    tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    tokenSymbol: 'USDC',
    totalAmount: 0.5,
    stopLoss: 0.15,
    takeProfit: 0.30,
    riskLevel: 'conservative'
  });

  console.log(`✅ Mean Reversion Strategy created: ${meanReversionStrategy.id}`);
  console.log(`   Type: ${meanReversionStrategy.type}`);
  console.log(`   Token: ${meanReversionStrategy.tokenSymbol}`);
  console.log(`   Total Amount: ${meanReversionStrategy.totalAmount} SOL`);
  console.log(`   Risk Level: ${meanReversionStrategy.riskLevel}`);
  console.log(`   Stop Loss: ${(meanReversionStrategy.stopLoss || 0) * 100}%`);
  console.log(`   Take Profit: ${(meanReversionStrategy.takeProfit || 0) * 100}%`);
  console.log();

  // Demo 5: 获取所有策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo 5: Getting All Strategies');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const strategies = executor.getStrategies();
  console.log(`✅ Total strategies: ${strategies.length}`);
  strategies.forEach((strategy, index) => {
    console.log(`   ${index + 1}. ${strategy.id}`);
    console.log(`      Type: ${strategy.type}`);
    console.log(`      Token: ${strategy.tokenSymbol}`);
    console.log(`      Amount: ${strategy.totalAmount} SOL`);
    console.log(`      Status: ${strategy.enabled ? 'Enabled' : 'Disabled'}`);
  });
  console.log();

  // Demo 6: 获取策略状态
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo 6: Getting Strategy Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const dcaStatus = executor.getStrategyStatus(dcaStrategy.id);
  if (dcaStatus) {
    console.log(`✅ DCA Strategy Status:`);
    console.log(`   Status: ${dcaStatus.status}`);
    console.log(`   Progress: ${dcaStatus.progress.toFixed(2)}%`);
    console.log(`   Executed: ${dcaStatus.executedAmount.toFixed(4)} SOL`);
    console.log(`   Remaining: ${dcaStatus.remainingAmount.toFixed(4)} SOL`);
    console.log(`   Entry Price: ${dcaStatus.entryPrice}`);
    console.log(`   Current Price: ${dcaStatus.currentPrice}`);
    console.log(`   Unrealized P&L: ${dcaStatus.unrealizedPnl.toFixed(6)} SOL (${dcaStatus.unrealizedPnlPercentage.toFixed(2)}%)`);
  }
  console.log();

  // Demo 7: 启动策略（仅演示，不实际执行）
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Demo 7: Starting Strategy (Simulation Mode)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  console.log('⚠️  Note: This is a simulation. No real trades will be executed.');
  console.log('⚠️  To execute real trades, set PRIVATE_KEY in .env file.');
  console.log();

  // 在实际环境中，你会这样启动策略：
  // await executor.startStrategy(dcaStrategy.id);

  console.log('✅ Demo completed successfully!');
  console.log();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Next Steps:');
  console.log('1. Configure your .env file with your wallet private key');
  console.log('2. Run: npm run server');
  console.log('3. Open: http://localhost:3002');
  console.log('4. Create and start your strategies');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 清理
  executor.cleanup();
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
