/**
 * 套利监控系统
 * 整合扫描器和执行器，自动发现并执行套利机会
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { ArbitrageScanner, ArbitrageOpportunity } from './coingeckoAggregator';
import { ArbitrageExecutor, ArbitrageResult, ArbitrageStats } from './arbitrageExecutor';
import { sendTgAlert } from '../utils/notifier';
import { createLogger } from '../utils/logger';

/**
 * 套利系统配置
 */
export interface ArbitrageSystemConfig {
  scanInterval: number;        // 扫描间隔（毫秒）
  minProfitPercent: number;    // 最小利润百分比
  minLiquidity: number;        // 最小流动性
  tradeAmount: number;         // 交易金额（SOL）
  maxSlippage: number;         // 最大滑点
  autoExecute: boolean;        // 是否自动执行
  simulationMode: boolean;     // 模拟模式
  alertOnly: boolean;          // 仅发送通知，不自动交易
  tokensToScan: Array<{        // 要扫描的代币
    mint: string;
    symbol: string;
  }>;
}

/**
 * 套利系统类
 */
export class ArbitrageSystem extends EventEmitter {
  private connection: Connection;
  private wallet: Keypair;
  private scanner: ArbitrageScanner;
  private executor: ArbitrageExecutor;
  private stats: ArbitrageStats;
  private config: ArbitrageSystemConfig;
  private logger = createLogger('ArbitrageSystem');
  private isRunning = false;
  private scanTimer?: NodeJS.Timeout;

  constructor(
    connection: Connection,
    wallet: Keypair,
    config: Partial<ArbitrageSystemConfig> = {}
  ) {
    super();

    this.connection = connection;
    this.wallet = wallet;
    this.stats = new ArbitrageStats();

    this.config = {
      scanInterval: 10000,      // 10 秒扫描一次
      minProfitPercent: 0.3,    // 0.3% 最小利润
      minLiquidity: 10,         // 10 SOL 最小流动性
      tradeAmount: 0.05,        // 0.05 SOL 交易金额
      maxSlippage: 0.01,        // 1% 滑点
      autoExecute: false,       // 默认不自动执行
      simulationMode: true,     // 默认模拟模式
      alertOnly: true,          // 默认仅通知
      tokensToScan: [
        // Solana 生态热门代币（CoinGecko 支持）
        { mint: 'So11111111111111111111111111111111111111112', symbol: 'SOL' },
        { mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', symbol: 'BONK' },
        { mint: '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr', symbol: 'WIF' },
        { mint: 'EPjFWdd5qrtqrep71NU3RXtzmU7CgqkSqwDayWiF', symbol: 'JUP' },
        { mint: 'EKpQGSJtjMFqKZ9KQqMnxEJBkQpFGN6XTWqH5h1YuUuN', symbol: 'RAY' },
      ],
      ...config
    };

    this.scanner = new ArbitrageScanner(
      connection,
      this.config.minProfitPercent,
      this.config.minLiquidity
    );

    this.executor = new ArbitrageExecutor(connection, wallet, {
      tradeAmount: this.config.tradeAmount,
      maxSlippage: this.config.maxSlippage,
      simulationMode: this.config.simulationMode
    });
  }

  /**
   * 启动套利系统
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('套利系统已在运行');
      return;
    }

    this.isRunning = true;
    this.logger.info('套利系统启动中...');

    if (this.config.simulationMode) {
      this.logger.info('运行模式: 模拟（不会执行真实交易）');
    } else {
      this.logger.warn('运行模式: 真实交易（资金有风险）');
    }

    if (this.config.alertOnly) {
      this.logger.info('自动执行: 关闭（仅发送通知）');
    } else {
      this.logger.warn('自动执行: 开启（将自动执行套利）');
    }

    // 立即扫描一次
    await this.scan();

    // 定期扫描
    this.scanTimer = setInterval(() => {
      this.scan();
    }, this.config.scanInterval);
  }

  /**
   * 停止套利系统
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = undefined;
    }

    this.logger.info('套利系统已停止');

    // 输出统计
    const stats = this.stats.getStats();
    this.logger.info('系统统计:', stats);
  }

  /**
   * 扫描套利机会
   */
  private async scan(): Promise<void> {
    if (!this.isRunning) return;

    try {
      this.logger.debug(`开始扫描 ${this.config.tokensToScan.length} 个代币...`);

      const opportunities = await this.scanner.scanBatch(this.config.tokensToScan);

      if (opportunities.length === 0) {
        this.logger.debug('未发现套利机会');
        return;
      }

      this.logger.info(`发现 ${opportunities.length} 个套利机会`);

      for (const opp of opportunities) {
        // 发送通知
        await this.sendAlert(opp);

        // 发射机会事件
        this.emit('opportunity', opp);

        // 如果启用自动执行且不是仅通知模式
        if (this.config.autoExecute && !this.config.alertOnly) {
          const result = await this.executeOpportunity(opp);
          this.stats.addResult(result);

          if (result.success) {
            this.logger.info(`套利成功! 利润: ${result.netProfit.toFixed(6)} SOL`);
          }
        }
      }

    } catch (err) {
      const error = err as Error;
      this.logger.error('扫描失败:', error);
    }
  }

  /**
   * 执行单个套利机会
   */
  private async executeOpportunity(opportunity: ArbitrageOpportunity): Promise<ArbitrageResult> {
    this.logger.info(`执行套利: ${opportunity.tokenSymbol}`);
    this.logger.info(`  ${opportunity.buyDex} (${opportunity.buyPrice.toFixed(8)}) -> ${opportunity.sellDex} (${opportunity.sellPrice.toFixed(8)})`);
    this.logger.info(`  预期利润: ${opportunity.priceDiff.toFixed(3)}%`);

    const result = await this.executor.executeArbitrage(opportunity);

    // 发射执行事件
    this.emit('executed', result);

    if (result.success) {
      this.logger.info(`✓ 套利成功! 净利润: ${result.netProfit.toFixed(6)} SOL`);

      // 发送成功通知
      await sendTgAlert(
        `✅ <b>套利成功</b>\n` +
        `代币: ${opportunity.tokenSymbol}\n` +
        `路径: ${opportunity.buyDex} -> ${opportunity.sellDex}\n` +
        `利润: <b>${result.netProfit.toFixed(6)} SOL</b>\n` +
        `耗时: ${result.executionTime}ms`
      );
    } else {
      this.logger.warn(`✗ 套利失败: ${result.error}`);

      await sendTgAlert(
        `❌ <b>套利失败</b>\n` +
        `代币: ${opportunity.tokenSymbol}\n` +
        `错误: ${result.error || '未知错误'}`
      );
    }

    return result;
  }

  /**
   * 发送套利警报
   */
  private async sendAlert(opportunity: ArbitrageOpportunity): Promise<void> {
    const emoji = opportunity.confidence === 'HIGH' ? '🔥' : opportunity.confidence === 'MEDIUM' ? '⚠️' : '💰';

    const message = `${emoji} <b>套利机会</b>\n` +
      `代币: ${opportunity.tokenSymbol}\n` +
      `路径: ${opportunity.buyDex} -> ${opportunity.sellDex}\n` +
      `价差: <b>${opportunity.priceDiff.toFixed(3)}%</b>\n` +
      `利润: ${opportunity.estimatedProfit.toFixed(4)} SOL\n` +
      `流动性: ${opportunity.liquidity.toFixed(2)} SOL\n` +
      `置信度: ${opportunity.confidence}`;

    await sendTgAlert(message);
  }

  /**
   * 添加要扫描的代币
   */
  addToken(mint: string, symbol: string): void {
    this.config.tokensToScan.push({ mint, symbol });
    this.logger.info(`添加代币: ${symbol}`);
  }

  /**
   * 移除要扫描的代币
   */
  removeToken(mint: string): void {
    this.config.tokensToScan = this.config.tokensToScan.filter(t => t.mint !== mint);
    this.logger.info(`移除代币: ${mint}`);
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ArbitrageSystemConfig>): void {
    const oldConfig = { ...this.config };

    this.config = { ...this.config, ...config };

    // 更新扫描器参数
    if (config.minProfitPercent !== undefined || config.minLiquidity !== undefined) {
      this.scanner.updateParams(
        this.config.minProfitPercent,
        this.config.minLiquidity
      );
    }

    // 更新执行器配置
    this.executor.updateConfig({
      tradeAmount: this.config.tradeAmount,
      maxSlippage: this.config.maxSlippage,
      simulationMode: this.config.simulationMode
    });

    // 如果扫描间隔改变，重启定时器
    if (config.scanInterval !== undefined && config.scanInterval !== oldConfig.scanInterval) {
      if (this.isRunning) {
        this.stop();
        this.start();
      }
    }

    this.logger.info('配置已更新:', this.config);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    system: {
      isRunning: boolean;
      scanInterval: number;
      tokensScanning: number;
    };
    performance: ReturnType<ArbitrageStats['getStats']>;
  } {
    return {
      system: {
        isRunning: this.isRunning,
        scanInterval: this.config.scanInterval,
        tokensScanning: this.config.tokensToScan.length
      },
      performance: this.stats.getStats()
    };
  }

  /**
   * 获取历史记录
   */
  getHistory(): ArbitrageResult[] {
    return this.stats.getHistory();
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.stats.clear();
    this.logger.info('历史记录已清空');
  }

  /**
   * 手动触发扫描
   */
  async manualScan(): Promise<ArbitrageOpportunity[]> {
    this.logger.info('手动触发扫描...');
    const opportunities = await this.scanner.scanBatch(this.config.tokensToScan);

    // 发射每个机会事件
    for (const opp of opportunities) {
      await this.sendAlert(opp);
      this.emit('opportunity', opp);
    }

    return opportunities;
  }

  /**
   * 启用真实交易模式
   */
  enableLiveTrading(tradeAmount?: number): void {
    this.logger.warn('=== 真实交易模式已启用 ===');
    this.logger.warn('警告: 真实资金将被使用');

    this.updateConfig({
      simulationMode: false,
      autoExecute: true,
      alertOnly: false,
      tradeAmount: tradeAmount || this.config.tradeAmount
    });
  }

  /**
   * 启用模拟模式
   */
  enableSimulationMode(): void {
    this.logger.info('模拟模式已启用（不会执行真实交易）');

    this.updateConfig({
      simulationMode: true,
      autoExecute: false
    });
  }

  /**
   * 获取当前配置
   */
  getConfig(): ArbitrageSystemConfig {
    return { ...this.config };
  }
}
