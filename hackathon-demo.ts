/**
 * VibeCurve Hackathon Demo Script
 *
 * 用于黑客松演示的核心功能展示
 */

import { StrategyExecutor, StrategyType } from './src/core/strategyExecutor';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

async function hackathonDemo() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         VibeCurve - Hackathon Demo                      ║');
  console.log('║         Trading & Strategy Bots Track                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
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

  console.log();

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

  // 演示 1: 项目介绍
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📢 Project Introduction');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log('VibeCurve is an AI-driven trading strategy execution platform for Solana.');
  console.log();
  console.log('Core Features:');
  console.log('  1. Multiple Strategy Types (DCA, Grid, Momentum, Mean Reversion)');
  console.log('  2. AI-Powered Risk Management');
  console.log('  3. Real-Time Price Monitoring');
  console.log('  4. Automated Stop-Loss & Take-Profit');
  console.log('  5. Jito MEV Protection');
  console.log();
  console.log('Target Users:');
  console.log('  - Investors who want to automate their trading strategies');
  console.log('  - Traders who need risk management tools');
  console.log('  - Users who want to execute strategies 24/7');
  console.log();

  // 演示 2: 创建 DCA 策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Demo 1: Creating DCA Strategy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

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

  // 演示 3: 创建 Grid 策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Demo 2: Creating Grid Strategy');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

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

  // 演示 4: 获取所有策略
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Demo 3: Getting All Strategies');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

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

  // 演示 5: 获取策略状态
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Demo 4: Getting Strategy Status');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

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

  // 演示 6: 技术亮点
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Technical Highlights');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  console.log('1. Real API Integration');
  console.log('   - Jupiter API for optimal swap routing');
  console.log('   - Jupiter Price API for real-time prices');
  console.log('   - Jito Bundle for MEV protection');
  console.log();

  console.log('2. AI-Powered Risk Management');
  console.log('   - DeepSeek AI for risk assessment');
  console.log('   - Dynamic position sizing');
  console.log('   - Automated stop-loss & take-profit');
  console.log();

  console.log('3. Real-Time Monitoring');
  console.log('   - WebSocket-based price updates');
  console.log('   - Position tracking with P&L');
  console.log('   - Event-driven architecture');
  console.log();

  console.log('4. Multiple Strategy Types');
  console.log('   - DCA (Dollar Cost Averaging)');
  console.log('   - Grid Trading');
  console.log('   - Momentum Trading');
  console.log('   - Mean Reversion');
  console.log();

  // 演示 7: 竞争优势
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏆 Competitive Advantages');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  console.log('vs Traditional Arbitrage Bots:');
  console.log('  ❌ Arbitrage bots: Red ocean, fierce competition');
  console.log('  ✅ VibeCurve: Blue ocean, strategy execution platform');
  console.log();

  console.log('vs Manual Trading:');
  console.log('  ❌ Manual: 24/7 monitoring required');
  console.log('  ✅ VibeCurve: Automated execution 24/7');
  console.log();

  console.log('vs Other Trading Bots:');
  console.log('  ❌ Others: Complex configuration, hard to use');
  console.log('  ✅ VibeCurve: Simple setup, easy to use');
  console.log();

  // 演示 8: 商业模式
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('💰 Business Model');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  console.log('Subscription Tiers:');
  console.log('  1. Free Tier');
  console.log('     - Price monitoring');
  console.log('     - Basic scoring');
  console.log('     - Up to 3 strategies');
  console.log();

  console.log('  2. Pro Tier ($49/month)');
  console.log('     - All Free features');
  console.log('     - AI-powered risk analysis');
  console.log('     - Real-time alerts');
  console.log('     - Up to 10 strategies');
  console.log();

  console.log('  3. Enterprise Tier ($199/month)');
  console.log('     - All Pro features');
  console.log('     - API access');
  console.log('     - Custom strategies');
  console.log('     - Unlimited strategies');
  console.log();

  // 演示 9: 路线图
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🗺️  Roadmap');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  console.log('Q1 2026: ✅ Core Platform');
  console.log('  - Strategy execution engine');
  console.log('  - Risk management');
  console.log('  - Real-time monitoring');
  console.log();

  console.log('Q2 2026: 🚀 Advanced Features');
  console.log('  - Strategy backtesting');
  console.log('  - Strategy marketplace');
  console.log('  - Social trading');
  console.log();

  console.log('Q3 2026: 🌟 Enterprise Features');
  console.log('  - Multi-chain support');
  console.log('  - Institutional tools');
  console.log('  - White-label solution');
  console.log();

  console.log('Q4 2026: 🎯 Ecosystem');
  console.log('  - Mobile app');
  console.log('  - Community features');
  console.log('  - Governance token');
  console.log();

  // 演示 10: 总结
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎯 Summary');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();

  console.log('VibeCurve is an AI-driven trading strategy execution platform for Solana.');
  console.log();
  console.log('Key Takeaways:');
  console.log('  1. Clear positioning: Strategy execution platform, not arbitrage bot');
  console.log('  2. Real implementation: Using Jupiter API, Jito MEV protection');
  console.log('  3. Multiple strategies: DCA, Grid, Momentum, Mean Reversion');
  console.log('  4. AI-powered: DeepSeek AI for risk assessment');
  console.log('  5. Real-time monitoring: WebSocket-based price updates');
  console.log('  6. Risk management: Automated stop-loss & take-profit');
  console.log('  7. Easy to use: Simple setup, clear API');
  console.log('  8. Business model: Subscription tiers');
  console.log();

  console.log('Thank you for your attention!');
  console.log();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📞 Contact');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log();
  console.log('Twitter: @vibecurve');
  console.log('Discord: https://discord.gg/vibecurve');
  console.log('Email: contact@vibecurve.io');
  console.log('GitHub: https://github.com/vibecurve/vibecurve');
  console.log();

  // 清理
  executor.cleanup();
}

hackathonDemo().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
