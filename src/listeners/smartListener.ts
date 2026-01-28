/**
 * 智能监听器
 * 使用真实的链上数据，而非随机模拟
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { config } from '../config';
import { parseTrade } from '../core/parser';
import { getTokenPrice, getPriceTrend } from '../core/price';
import { createLogger } from '../utils/logger';

const logger = createLogger('SmartListener');

/**
 * 交易事件回调
 */
export interface TradeEventCallback {
  (trade: {
    type: 'buy' | 'sell';
    amount: number;
    price: number;
    trader: string;
    timestamp: number;
  }): void;
}

/**
 * 价格更新回调
 */
export interface PriceUpdateCallback {
  (price: number, trend: 'up' | 'down' | 'sideways'): void;
}

/**
 * 智能监听器配置
 */
export interface SmartListenerConfig {
  targetMint: PublicKey;
  rpcUrl?: string;
  pollInterval?: number; // 轮询间隔（毫秒）
  onTrade?: TradeEventCallback;
  onPriceUpdate?: PriceUpdateCallback;
}

/**
 * 智能监听器类
 * 替代原有的 sniper.ts，使用真实数据
 */
export class SmartListener {
  private connection: Connection;
  private targetMint: PublicKey;
  private pollInterval: number;
  private lastSignature: string | null = null;
  private isRunning = false;
  private priceHistory: number[] = [];
  private onTrade?: TradeEventCallback;
  private onPriceUpdate?: PriceUpdateCallback;

  constructor(config: SmartListenerConfig) {
    this.connection = new Connection(config.rpcUrl, 'confirmed');
    this.targetMint = config.targetMint;
    this.pollInterval = config.pollInterval || 3000;
    this.onTrade = config.onTrade;
    this.onPriceUpdate = config.onPriceUpdate;
  }

  /**
   * 启动监听
   */
  async start() {
    if (this.isRunning) {
      logger.warn('[SmartListener] 已经在运行中');
      return;
    }

    this.isRunning = true;
    logger.info(`[SmartListener] 启动监听: ${this.targetMint.toBase58()}`);

    // 获取初始价格
    await this.updatePrice();

    // 开始轮询
    this.poll();
  }

  /**
   * 停止监听
   */
  stop() {
    this.isRunning = false;
    logger.info('[SmartListener] 已停止');
  }

  /**
   * 轮询循环
   */
  private async poll() {
    if (!this.isRunning) return;

    try {
      // 1. 获取最新交易签名
      const signatures = await this.connection.getSignaturesForAddress(
        this.targetMint,
        { limit: 5 }
      );

      if (signatures.length === 0) {
        // 无新交易，继续轮询
        setTimeout(() => this.poll(), this.pollInterval);
        return;
      }

      // 2. 处理新交易
      const newSignatures = this.getNewSignatures(signatures);

      for (const sigInfo of newSignatures) {
        try {
          const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0
          });

          if (!tx || tx.meta?.err) continue; // 跳过失败的交易

          // 解析交易
          const trade = parseTrade(tx, this.targetMint);
          if (trade) {
            logger.info(`${trade.type.toUpperCase()}: ${trade.amount} tokens @ ${trade.price?.toFixed(8)} SOL`);

            // 触发回调
            if (this.onTrade) {
              this.onTrade({
                type: trade.type,
                amount: trade.amount,
                price: trade.price || 0,
                trader: trade.trader,
                timestamp: trade.timestamp
              });
            }
          }
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));
          logger.error('解析交易失败:', err);
        }
      }

      // 更新最后签名的标记
      if (newSignatures.length > 0) {
        this.lastSignature = newSignatures[0].signature;
      }

      // 3. 更新价格
      await this.updatePrice();

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('轮询错误:', err);
    }

    // 继续轮询
    setTimeout(() => this.poll(), this.pollInterval);
  }

  /**
   * 获取新的签名（排除已处理的）
   */
  private getNewSignatures(signatures: any[]): any[] {
    if (!this.lastSignature) return signatures;

    const newSigs = [];
    for (const sig of signatures) {
      if (sig.signature === this.lastSignature) break;
      newSigs.push(sig);
    }

    return newSigs;
  }

  /**
   * 更新价格（从 Jupiter API）
   */
  private async updatePrice() {
    try {
      const priceData = await getTokenPrice(this.targetMint.toBase58());

      if (priceData && priceData.price > 0) {
        this.priceHistory.push(priceData.price);

        // 保持历史记录长度为 50
        if (this.priceHistory.length > 50) {
          this.priceHistory.shift();
        }

        // 计算趋势
        const trend = getPriceTrend(this.priceHistory);

        // 触发回调
        if (this.onPriceUpdate) {
          this.onPriceUpdate(priceData.price, trend);
        }
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('更新价格失败:', err);
    }
  }

  /**
   * 获取当前价格历史
   */
  getPriceHistory(): number[] {
    return [...this.priceHistory];
  }

  /**
   * 获取当前价格
   */
  getCurrentPrice(): number {
    return this.priceHistory[this.priceHistory.length - 1] || 0;
  }
}

/**
 * 便捷函数：创建并启动监听器
 */
export function createSmartListener(config: SmartListenerConfig): SmartListener {
  const listener = new SmartListener(config);
  listener.start();
  return listener;
}
