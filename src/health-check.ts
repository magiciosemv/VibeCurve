/**
 * VibeCurve 功能检测脚本
 * 检测所有核心功能是否正常工作
 */

import { PublicKey } from '@solana/web3.js';
import { config, createConnection } from './config';
import { DexPriceAggregator, TOKEN_MINTS } from './core/dexPriceAggregator';
import { TrueArbitrageExecutor } from './core/trueArbitrageExecutor';
import { AIAnalyzer } from './core/ai';
import { JitoEngine } from './core/jito';
import { RealTimeSniper } from './listeners/sniper';
import { getBondingCurveStatus } from './strategies/bondingCurve';
import { SmartMoneyTracker } from './strategies/smartMoney';
import { RiskManager } from './core/risk';
import { createLogger } from './utils/logger';

const logger = createLogger('HealthCheck');

/**
 * 功能检测结果
 */
interface HealthCheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  message: string;
  duration: number;
}

/**
 * 运行所有功能检测
 */
export async function runHealthChecks(): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];

  logger.info('🚀 开始 VibeCurve 功能检测...\n');

  // 1. 配置检测
  results.push(await checkConfig());

  // 2. 网络连接检测
  results.push(await checkNetworkConnection());

  // 3. DEX 价格聚合器检测
  results.push(await checkDexPriceAggregator());

  // 4. 套利执行器检测
  results.push(await checkArbitrageExecutor());

  // 5. AI 分析检测
  results.push(await checkAIAnalyzer());

  // 6. Jito MEV 保护检测
  results.push(await checkJitoEngine());

  // 7. Sniper 监听器检测
  results.push(await checkSniper());

  // 8. Bonding Curve 策略检测
  results.push(await checkBondingCurve());

  // 9. Smart Money 追踪检测
  results.push(await checkSmartMoney());

  // 10. 风险管理检测
  results.push(await checkRiskManager());

  // 输出结果
  printResults(results);

  return results;
}

/**
 * 1. 配置检测
 */
async function checkConfig(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('📋 检测 1/10: 配置...');

    // 检查必需的配置项
    const requiredConfigs = [
      'rpcUrl',
      'payer',
      'jito.blockEngineUrl',
      'ai.apiKey',
      'server.port'
    ];

    const missingConfigs = requiredConfigs.filter(key => {
      const keys = key.split('.');
      let value: any = config;
      for (const k of keys) {
        value = value?.[k];
      }
      return !value;
    });

    if (missingConfigs.length > 0) {
      throw new Error(`缺少配置项: ${missingConfigs.join(', ')}`);
    }

    // 检查代理配置
    if (!config.proxy.host || !config.proxy.port) {
      throw new Error('代理配置缺失');
    }

    const duration = Date.now() - startTime;
    logger.info(`✅ 配置检测通过 (${duration}ms)\n`);

    return {
      name: '配置检测',
      status: 'pass',
      message: '所有必需配置项已设置',
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ 配置检测失败: ${err.message}\n`);

    return {
      name: '配置检测',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 2. 网络连接检测
 */
async function checkNetworkConnection(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('🌐 检测 2/10: 网络连接...');

    const connection = createConnection(config.rpcUrl);

    // 测试获取最新区块
    const slot = await connection.getSlot();
    logger.info(`   当前区块: ${slot}`);

    // 测试获取余额
    const balance = await connection.getBalance(config.payer.publicKey);
    logger.info(`   钱包余额: ${balance / 1e9} SOL`);

    const duration = Date.now() - startTime;
    logger.info(`✅ 网络连接检测通过 (${duration}ms)\n`);

    return {
      name: '网络连接',
      status: 'pass',
      message: `成功连接到 Solana 网络，当前区块: ${slot}`,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ 网络连接检测失败: ${err.message}\n`);

    return {
      name: '网络连接',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 3. DEX 价格聚合器检测
 */
async function checkDexPriceAggregator(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('💰 检测 3/10: DEX 价格聚合器...');

    const connection = createConnection(config.rpcUrl);
    const aggregator = new DexPriceAggregator(connection);

    // 测试获取 SOL 价格
    const prices = await aggregator.getAllPrices(TOKEN_MINTS.SOL);

    if (prices.length === 0) {
      throw new Error('未能获取任何 DEX 价格');
    }

    logger.info(`   获取到 ${prices.length} 个 DEX 价格:`);
    for (const price of prices) {
      logger.info(`   - ${price.dex}: $${price.price.toFixed(6)} (流动性: $${price.liquidity.toFixed(2)})`);
    }

    const duration = Date.now() - startTime;
    logger.info(`✅ DEX 价格聚合器检测通过 (${duration}ms)\n`);

    return {
      name: 'DEX 价格聚合器',
      status: 'pass',
      message: `成功获取 ${prices.length} 个 DEX 价格`,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ DEX 价格聚合器检测失败: ${err.message}\n`);

    return {
      name: 'DEX 价格聚合器',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 4. 套利执行器检测
 */
async function checkArbitrageExecutor(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('⚡ 检测 4/10: 套利执行器...');

    const connection = createConnection(config.rpcUrl);
    const executor = new TrueArbitrageExecutor(connection, config.payer);

    // 测试获取池子价格
    const raydiumPool = new PublicKey('...'); // TODO: 使用真实的池子地址
    const price = await executor.getPoolPrice({
      dex: 'raydium',
      poolAddress: raydiumPool,
      tokenMintA: TOKEN_MINTS.SOL,
      tokenMintB: TOKEN_MINTS.USDC,
      tokenAccountA: new PublicKey('...'),
      tokenAccountB: new PublicKey('...'),
      authority: new PublicKey('...'),
      programId: new PublicKey('...')
    });

    logger.info(`   Raydium 池子价格: ${price}`);

    const duration = Date.now() - startTime;
    logger.info(`✅ 套利执行器检测通过 (${duration}ms)\n`);

    return {
      name: '套利执行器',
      status: 'pass',
      message: '成功获取池子价格',
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ 套利执行器检测失败: ${err.message}\n`);

    return {
      name: '套利执行器',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 5. AI 分析检测
 */
async function checkAIAnalyzer(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('🤖 检测 5/10: AI 分析...');

    if (!config.ai.apiKey) {
      throw new Error('AI API Key 未设置');
    }

    const aiAnalyzer = new AIAnalyzer();

    // 测试 AI 分析
    const opportunity = {
      tokenMint: TOKEN_MINTS.SOL.toBase58(),
      tokenSymbol: 'SOL',
      buyDex: 'Raydium',
      sellDex: 'Orca',
      buyPrice: 150.0,
      sellPrice: 151.5,
      priceDiff: 1.0,
      estimatedProfit: 0.01,
      liquidity: 1000,
      timestamp: Date.now()
    };

    const analysis = await aiAnalyzer.analyzeArbitrageOpportunity(opportunity);

    logger.info(`   AI 建议: ${analysis.recommendation}`);
    logger.info(`   置信度: ${(analysis.confidence * 100).toFixed(1)}%`);
    logger.info(`   风险级别: ${analysis.riskLevel}`);

    const duration = Date.now() - startTime;
    logger.info(`✅ AI 分析检测通过 (${duration}ms)\n`);

    return {
      name: 'AI 分析',
      status: 'pass',
      message: `AI 分析成功，建议: ${analysis.recommendation}`,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ AI 分析检测失败: ${err.message}\n`);

    return {
      name: 'AI 分析',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 6. Jito MEV 保护检测
 */
async function checkJitoEngine(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('🛡️ 检测 6/10: Jito MEV 保护...');

    const jitoEngine = new JitoEngine();

    // 测试获取拥堵级别
    const congestionLevel = await jitoEngine.getCongestionLevel();
    logger.info(`   当前拥堵级别: ${congestionLevel}`);

    // 测试计算最优小费
    const optimalTip = await jitoEngine.calculateOptimalTip();
    logger.info(`   最优小费: ${optimalTip / 1e9} SOL`);

    const duration = Date.now() - startTime;
    logger.info(`✅ Jito MEV 保护检测通过 (${duration}ms)\n`);

    return {
      name: 'Jito MEV 保护',
      status: 'pass',
      message: `拥堵级别: ${congestionLevel}，最优小费: ${optimalTip / 1e9} SOL`,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Jito MEV 保护检测失败: ${err.message}\n`);

    return {
      name: 'Jito MEV 保护',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 7. Sniper 监听器检测
 */
async function checkSniper(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('🎯 检测 7/10: Sniper 监听器...');

    const connection = createConnection(config.rpcUrl);
    const targetMint = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump');

    // 测试创建 Sniper
    const sniper = new RealTimeSniper(connection, targetMint, (event) => {
      logger.info(`   检测到交易: ${event.type} ${event.amount} tokens`);
    });

    logger.info(`   Sniper 创建成功`);

    const duration = Date.now() - startTime;
    logger.info(`✅ Sniper 监听器检测通过 (${duration}ms)\n`);

    return {
      name: 'Sniper 监听器',
      status: 'pass',
      message: 'Sniper 创建成功',
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Sniper 监听器检测失败: ${err.message}\n`);

    return {
      name: 'Sniper 监听器',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 8. Bonding Curve 策略检测
 */
async function checkBondingCurve(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('📈 检测 8/10: Bonding Curve 策略...');

    const connection = createConnection(config.rpcUrl);
    const tokenMint = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump');

    // 测试获取 Bonding Curve 状态
    const status = await getBondingCurveStatus(connection, tokenMint);

    logger.info(`   代币: ${status.tokenName}`);
    logger.info(`   进度: ${status.progress.toFixed(1)}%`);
    logger.info(`   建议: ${status.recommendation}`);
    logger.info(`   原因: ${status.reason}`);

    const duration = Date.now() - startTime;
    logger.info(`✅ Bonding Curve 策略检测通过 (${duration}ms)\n`);

    return {
      name: 'Bonding Curve 策略',
      status: 'pass',
      message: `进度: ${status.progress.toFixed(1)}%，建议: ${status.recommendation}`,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Bonding Curve 策略检测失败: ${err.message}\n`);

    return {
      name: 'Bonding Curve 策略',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 9. Smart Money 追踪检测
 */
async function checkSmartMoney(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('💎 检测 9/10: Smart Money 追踪...');

    const connection = createConnection(config.rpcUrl);
    const tracker = new SmartMoneyTracker(connection, {
      minWinRate: 0.6,
      minTrades: 50,
      followDelay: 1000,
      notifyOnly: true
    });

    // 测试获取钱包列表
    const wallets = tracker.getWallets();
    logger.info(`   加载了 ${wallets.length} 个聪明钱钱包`);

    const duration = Date.now() - startTime;
    logger.info(`✅ Smart Money 追踪检测通过 (${duration}ms)\n`);

    return {
      name: 'Smart Money 追踪',
      status: 'pass',
      message: `加载了 ${wallets.length} 个聪明钱钱包`,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ Smart Money 追踪检测失败: ${err.message}\n`);

    return {
      name: 'Smart Money 追踪',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 10. 风险管理检测
 */
async function checkRiskManager(): Promise<HealthCheckResult> {
  const startTime = Date.now();

  try {
    logger.info('🔒 检测 10/10: 风险管理...');

    const connection = createConnection(config.rpcUrl);
    const riskManager = new RiskManager(connection, {
      maxPositionSize: 0.5,
      stopLossPercentage: 0.15,
      takeProfitPercentage: 0.30
    });

    // 测试交易检查
    const checkResult = await riskManager.checkTrade(
      TOKEN_MINTS.SOL.toBase58(),
      0.1,
      150.0,
      true
    );

    logger.info(`   交易检查: ${checkResult.approved ? '✅ 通过' : '❌ 拒绝'}`);
    if (checkResult.reason) {
      logger.info(`   原因: ${checkResult.reason}`);
    }

    const duration = Date.now() - startTime;
    logger.info(`✅ 风险管理检测通过 (${duration}ms)\n`);

    return {
      name: '风险管理',
      status: 'pass',
      message: `交易检查: ${checkResult.approved ? '通过' : '拒绝'}`,
      duration
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`❌ 风险管理检测失败: ${err.message}\n`);

    return {
      name: '风险管理',
      status: 'fail',
      message: err.message,
      duration
    };
  }
}

/**
 * 打印检测结果
 */
function printResults(results: HealthCheckResult[]) {
  logger.info('\n' + '='.repeat(60));
  logger.info('📊 VibeCurve 功能检测报告');
  logger.info('='.repeat(60) + '\n');

  let passCount = 0;
  let failCount = 0;
  let skipCount = 0;

  for (const result of results) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⏭️';
    const status = result.status === 'pass' ? '通过' : result.status === 'fail' ? '失败' : '跳过';

    logger.info(`${icon} ${result.name}: ${status}`);
    logger.info(`   ${result.message}`);
    logger.info(`   耗时: ${result.duration}ms\n`);

    if (result.status === 'pass') passCount++;
    else if (result.status === 'fail') failCount++;
    else skipCount++;
  }

  logger.info('='.repeat(60));
  logger.info(`总计: ${results.length} 个检测`);
  logger.info(`通过: ${passCount} 个`);
  logger.info(`失败: ${failCount} 个`);
  logger.info(`跳过: ${skipCount} 个`);
  logger.info(`成功率: ${((passCount / results.length) * 100).toFixed(1)}%`);
  logger.info('='.repeat(60) + '\n');

  // 如果有失败的检测，给出建议
  if (failCount > 0) {
    logger.warn('⚠️ 检测到失败的检测，请检查以下内容：');
    logger.warn('1. 确保所有必需的环境变量已设置');
    logger.warn('2. 确保网络连接正常，代理配置正确');
    logger.warn('3. 确保钱包有足够的 SOL 余额');
    logger.warn('4. 确保所有 API Key 有效');
  } else {
    logger.info('🎉 所有检测通过！VibeCurve 系统运行正常！');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  runHealthChecks()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('功能检测失败:', error);
      process.exit(1);
    });
}
