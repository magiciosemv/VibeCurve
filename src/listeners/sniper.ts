/**
 * 真正的实时 Sniper 监听器
 *
 * 核心改进：
 * 1. 使用 WebSocket 订阅实现真正的实时监听
 * 2. 订阅账户变更和程序日志
 * 3. 实时分析交易，无需轮询
 */

import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('Sniper');

const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump');

/**
 * 交易事件
 */
export interface TradeEvent {
  type: 'buy' | 'sell';
  amount: number;
  signature: string;
  timestamp: number;
  trader?: string;
}

/**
 * 真正的实时 Sniper 监听器
 * 使用 WebSocket 订阅实现真正的实时监听
 */
export class RealTimeSniper {
  private connection: Connection;
  private targetMint: PublicKey;
  private onTrade?: (event: TradeEvent) => void;
  private accountSubscriptionId?: number;
  private logSubscriptionId?: number;

  constructor(
    connection: Connection,
    targetMint: PublicKey,
    onTrade?: (event: TradeEvent) => void
  ) {
    this.connection = connection;
    this.targetMint = targetMint;
    this.onTrade = onTrade;
  }

  /**
   * 启动实时监听
   */
  start() {
    logger.info(`🎯 SNIPER MODE: REAL-TIME WEBSOCKET`);
    logger.info(`🔭 Target: ${this.targetMint.toBase58()}`);

    // 1. 订阅账户变更
    this.accountSubscriptionId = this.connection.onAccountChange(
      this.targetMint,
      (accountInfo, context) => {
        logger.info(`📡 Account change detected: ${context.slot}`);
        this.analyzeAccountChange(accountInfo, context.slot);
      },
      'confirmed'
    );

    logger.info(`✅ Account subscription established: ${this.accountSubscriptionId}`);

    // 2. 订阅程序日志
    this.logSubscriptionId = this.connection.onLogs(
      this.targetMint,
      (log, context) => {
        logger.info(`📡 Program log detected: ${context.slot}`);
        this.analyzeProgramLog(log, context.slot);
      },
      'confirmed'
    );

    logger.info(`✅ Program log subscription established: ${this.logSubscriptionId}`);

    // 3. 优雅关闭
    process.on('SIGINT', () => {
      this.stop();
      process.exit(0);
    });
  }

  /**
   * 停止监听
   */
  stop() {
    logger.info('🛑 Closing subscriptions...');

    if (this.accountSubscriptionId !== undefined) {
      this.connection.removeAccountChangeListener(this.accountSubscriptionId);
      logger.info(`✅ Account subscription closed: ${this.accountSubscriptionId}`);
    }

    if (this.logSubscriptionId !== undefined) {
      this.connection.removeOnLogsListener(this.logSubscriptionId);
      logger.info(`✅ Program log subscription closed: ${this.logSubscriptionId}`);
    }
  }

  /**
   * 分析账户变更
   */
  private analyzeAccountChange(accountInfo: any, slot: number) {
    logger.info(`🔍 Analyzing account change at slot ${slot}`);

    // 解析账户数据
    const data = accountInfo.data;

    // 分析账户变更
    // TODO: 实现具体的分析逻辑
    // 这里可以解析代币的供应量变化、持有者数量变化等
  }

  /**
   * 分析程序日志
   */
  private analyzeProgramLog(log: any, slot: number) {
    logger.info(`🔍 Analyzing program log at slot ${slot}`);

    // 解析日志
    const logs = log.logs;

    // 分析程序日志
    // TODO: 实现具体的分析逻辑
    // 这里可以解析交易日志，识别买入/卖出操作
  }

  /**
   * 分析交易
   */
  private analyzeTransaction(tx: ParsedTransactionWithMeta, signature: string) {
    if (tx.meta?.err) {
      logger.warn(`   ❌ Failed Tx: ${signature.slice(0, 10)}...`);
      return;
    }

    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    let maxChange = 0;
    let trader: string | undefined;

    for (const post of postBalances) {
      if (post.mint !== this.targetMint.toBase58()) continue;

      const pre = preBalances.find(p => p.accountIndex === post.accountIndex);
      const preAmount = pre ? parseFloat(pre.uiTokenAmount.uiAmountString || "0") : 0;
      const postAmount = parseFloat(post.uiTokenAmount.uiAmountString || "0");
      const change = postAmount - preAmount;

      if (Math.abs(change) > 0.1) {
        if (Math.abs(change) > Math.abs(maxChange)) {
          maxChange = change;
          // 获取交易者地址
          trader = tx.transaction.message.accountKeys[0]?.pubkey?.toBase58();
        }
      }
    }

    if (maxChange === 0) {
      // 很多时候是机器人套利交易，余额变动很复杂，暂时忽略
      return;
    }

    const isBuy = maxChange > 0;
    const icon = isBuy ? "🟢 BUY " : "🔴 SELL";

    logger.info(`   ${icon} | ${Math.abs(maxChange).toFixed(2)} Tokens`);
    logger.info(`      🔗 https://solscan.io/tx/${signature}`);

    // 触发回调
    if (this.onTrade) {
      this.onTrade({
        type: isBuy ? 'buy' : 'sell',
        amount: Math.abs(maxChange),
        signature,
        timestamp: Date.now(),
        trader
      });
    }
  }
}

/**
 * 启动 Sniper 监听器（兼容旧接口）
 */
export async function startSniperListener(connection: Connection) {
  const sniper = new RealTimeSniper(connection, TARGET_MINT, (event) => {
    logger.info(`📊 Trade Event: ${event.type.toUpperCase()} ${event.amount.toFixed(2)} tokens`);
    logger.info(`   Signature: ${event.signature}`);
    if (event.trader) {
      logger.info(`   Trader: ${event.trader}`);
    }
  });

  sniper.start();
}
