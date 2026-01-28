/**
 * Strategy Executor - 核心策略执行引擎
 *
 * 功能：
 * 1. 执行多种交易策略（DCA、Grid、Momentum、Mean Reversion）
 * 2. 实时风险管理
 * 3. 自动止损止盈
 * 4. Jito MEV 保护
 */

import {
  Connection,
  Keypair,
  Transaction,
  VersionedTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { jitoEngine } from './jito';
import { RiskManager, RiskConfig } from './risk';
import { createLogger } from '../utils/logger';

const logger = createLogger('StrategyExecutor');

/**
 * 策略类型
 */
export type StrategyType = 'DCA' | 'GRID' | 'MOMENTUM' | 'MEAN_REVERSION';

/**
 * 风险等级
 */
export type RiskLevel = 'conservative' | 'moderate' | 'aggressive';

/**
 * 交易策略接口
 */
export interface TradingStrategy {
  id: string;
  type: StrategyType;
  tokenMint: string;
  tokenSymbol: string;
  totalAmount: number;        // 总金额（SOL）
  intervals?: number;         // 分批次数（DCA/Grid）
  intervalSeconds?: number;    // 间隔时间（秒）
  stopLoss?: number;           // 止损百分比（0.15 = 15%）
  takeProfit?: number;         // 止盈百分比（0.30 = 30%）
  riskLevel: RiskLevel;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 策略执行事件
 */
export interface StrategyEvent {
  strategyId: string;
  type: 'CREATED' | 'STARTED' | 'EXECUTED' | 'STOPPED' | 'COMPLETED' | 'ERROR';
  timestamp: number;
  data?: any;
}

/**
 * 策略执行结果
 */
export interface StrategyExecutionResult {
  strategyId: string;
  success: boolean;
  executedAmount: number;
  executedPrice: number;
  signature?: string;
  error?: string;
  timestamp: number;
}

/**
 * 策略状态
 */
export interface StrategyStatus {
  strategyId: string;
  status: 'IDLE' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'ERROR';
  progress: number;           // 0-100
  executedAmount: number;      // 已执行金额（SOL）
  remainingAmount: number;     // 剩余金额（SOL）
  currentPrice: number;
  entryPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercentage: number;
  lastExecutionTime: number;
  nextExecutionTime?: number;
}

/**
 * 策略执行器
 */
export class StrategyExecutor {
  private connection: Connection;
  private wallet: Keypair;
  private riskManager: RiskManager;
  private strategies: Map<string, TradingStrategy> = new Map();
  private statuses: Map<string, StrategyStatus> = new Map();
  private executionTimers: Map<string, NodeJS.Timeout> = new Map();
  private priceMonitors: Map<string, NodeJS.Timeout> = new Map();
  private eventHandlers: Array<(event: StrategyEvent) => void> = [];

  constructor(connection: Connection, wallet: Keypair, riskConfig?: Partial<RiskConfig>) {
    this.connection = connection;
    this.wallet = wallet;
    this.riskManager = new RiskManager(connection, riskConfig);

    logger.info('[StrategyExecutor] Initialized', {
      wallet: wallet.publicKey.toBase58()
    });
  }

  /**
   * 添加事件监听器
   */
  on(event: StrategyEvent, callback: (event: StrategyEvent) => void): void {
    this.eventHandlers.push(callback);
  }

  /**
   * 触发事件
   */
  private emit(event: StrategyEvent): void {
    this.eventHandlers.forEach(handler => handler(event));
  }

  /**
   * 创建策略
   */
  async createStrategy(strategy: Omit<TradingStrategy, 'id' | 'createdAt' | 'updatedAt' | 'enabled'>): Promise<TradingStrategy> {
    const id = `${strategy.type.toLowerCase()}-${strategy.tokenSymbol.toLowerCase()}-${Date.now()}`;

    const newStrategy: TradingStrategy = {
      ...strategy,
      id,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.strategies.set(id, newStrategy);

    // 初始化策略状态
    this.statuses.set(id, {
      strategyId: id,
      status: 'IDLE',
      progress: 0,
      executedAmount: 0,
      remainingAmount: strategy.totalAmount,
      currentPrice: 0,
      entryPrice: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercentage: 0,
      lastExecutionTime: 0
    });

    this.emit({
      strategyId: id,
      type: 'CREATED',
      timestamp: Date.now(),
      data: newStrategy
    });

    logger.info(`[StrategyExecutor] Strategy created: ${id}`);
    return newStrategy;
  }

  /**
   * 启动策略
   */
  async startStrategy(strategyId: string): Promise<void> {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) {
      throw new Error(`Strategy not found: ${strategyId}`);
    }

    if (!strategy.enabled) {
      throw new Error(`Strategy is disabled: ${strategyId}`);
    }

    const status = this.statuses.get(strategyId);
    if (!status) {
      throw new Error(`Strategy status not found: ${strategyId}`);
    }

    if (status.status === 'RUNNING') {
      logger.warn(`[StrategyExecutor] Strategy already running: ${strategyId}`);
      return;
    }

    // 更新状态
    status.status = 'RUNNING';
    status.lastExecutionTime = Date.now();

    this.emit({
      strategyId,
      type: 'STARTED',
      timestamp: Date.now()
    });

    logger.info(`[StrategyExecutor] Strategy started: ${strategyId}`);

    // 根据策略类型执行
    switch (strategy.type) {
      case 'DCA':
        await this.executeDCAStrategy(strategy);
        break;
      case 'GRID':
        await this.executeGridStrategy(strategy);
        break;
      case 'MOMENTUM':
        await this.executeMomentumStrategy(strategy);
        break;
      case 'MEAN_REVERSION':
        await this.executeMeanReversionStrategy(strategy);
        break;
      default:
        throw new Error(`Unknown strategy type: ${strategy.type}`);
    }
  }

  /**
   * 停止策略
   */
  stopStrategy(strategyId: string): void {
    // 清除执行定时器
    const timer = this.executionTimers.get(strategyId);
    if (timer) {
      clearTimeout(timer);
      this.executionTimers.delete(strategyId);
    }

    // 清除价格监控
    const priceMonitor = this.priceMonitors.get(strategyId);
    if (priceMonitor) {
      clearInterval(priceMonitor);
      this.priceMonitors.delete(strategyId);
    }

    // 更新状态
    const status = this.statuses.get(strategyId);
    if (status) {
      status.status = 'PAUSED';
    }

    this.emit({
      strategyId,
      type: 'STOPPED',
      timestamp: Date.now()
    });

    logger.info(`[StrategyExecutor] Strategy stopped: ${strategyId}`);
  }

  /**
   * 删除策略
   */
  deleteStrategy(strategyId: string): void {
    this.stopStrategy(strategyId);
    this.strategies.delete(strategyId);
    this.statuses.delete(strategyId);

    logger.info(`[StrategyExecutor] Strategy deleted: ${strategyId}`);
  }

  /**
   * 执行 DCA 策略
   */
  private async executeDCAStrategy(strategy: TradingStrategy): Promise<void> {
    const { id, totalAmount, intervals, intervalSeconds, tokenMint, tokenSymbol } = strategy;

    if (!intervals || !intervalSeconds) {
      throw new Error('DCA strategy requires intervals and intervalSeconds');
    }

    const amountPerInterval = totalAmount / intervals;

    logger.info(`[StrategyExecutor] Executing DCA strategy: ${id}`);
    logger.info(`  Total Amount: ${totalAmount} SOL`);
    logger.info(`  Intervals: ${intervals}`);
    logger.info(`  Amount per interval: ${amountPerInterval.toFixed(4)} SOL`);
    logger.info(`  Interval: ${intervalSeconds} seconds`);

    // 执行第一次买入
    await this.executeBuy(id, tokenMint, amountPerInterval);

    // 设置定时器执行后续买入
    for (let i = 1; i < intervals; i++) {
      const timer = setTimeout(async () => {
        try {
          await this.executeBuy(id, tokenMint, amountPerInterval);

          // 检查是否完成
          const status = this.statuses.get(id);
          if (status && status.executedAmount >= totalAmount * 0.99) {
            this.completeStrategy(id);
          }
        } catch (error) {
          logger.error(`[StrategyExecutor] DCA execution failed`, error as Error);
          this.emit({
            strategyId: id,
            type: 'ERROR',
            timestamp: Date.now(),
            data: { error: (error as Error).message }
          });
        }
      }, i * intervalSeconds * 1000);

      this.executionTimers.set(id, timer);
    }

    // 启动价格监控
    this.startPriceMonitoring(strategy);
  }

  /**
   * 执行 Grid 策略
   */
  private async executeGridStrategy(strategy: TradingStrategy): Promise<void> {
    const { id, totalAmount, intervals, tokenMint } = strategy;

    if (!intervals) {
      throw new Error('Grid strategy requires intervals');
    }

    const amountPerGrid = totalAmount / intervals;

    logger.info(`[StrategyExecutor] Executing Grid strategy: ${id}`);
    logger.info(`  Total Amount: ${totalAmount} SOL`);
    logger.info(`  Grid levels: ${intervals}`);
    logger.info(`  Amount per grid: ${amountPerGrid.toFixed(4)} SOL`);

    // 获取当前价格
    const currentPrice = await this.getTokenPrice(tokenMint);

    // 设置网格买入点
    for (let i = 0; i < intervals; i++) {
      const buyPrice = currentPrice * (1 - (i + 1) * 0.02); // 每次下跌 2% 买入

      // 监控价格，当价格达到买入点时执行
      this.monitorPriceForBuy(id, tokenMint, buyPrice, amountPerGrid);
    }

    // 启动价格监控
    this.startPriceMonitoring(strategy);
  }

  /**
   * 执行 Momentum 策略
   */
  private async executeMomentumStrategy(strategy: TradingStrategy): Promise<void> {
    const { id, totalAmount, tokenMint } = strategy;

    logger.info(`[StrategyExecutor] Executing Momentum strategy: ${id}`);
    logger.info(`  Total Amount: ${totalAmount} SOL`);

    // 获取当前价格
    const currentPrice = await this.getTokenPrice(tokenMint);

    // 监控价格动量
    this.monitorMomentum(id, tokenMint, currentPrice, totalAmount);

    // 启动价格监控
    this.startPriceMonitoring(strategy);
  }

  /**
   * 执行 Mean Reversion 策略
   */
  private async executeMeanReversionStrategy(strategy: TradingStrategy): Promise<void> {
    const { id, totalAmount, tokenMint } = strategy;

    logger.info(`[StrategyExecutor] Executing Mean Reversion strategy: ${id}`);
    logger.info(`  Total Amount: ${totalAmount} SOL`);

    // 获取当前价格
    const currentPrice = await this.getTokenPrice(tokenMint);
    const meanPrice = currentPrice; // 初始均值

    // 监控价格回归均值
    this.monitorMeanReversion(id, tokenMint, meanPrice, totalAmount);

    // 启动价格监控
    this.startPriceMonitoring(strategy);
  }

  /**
   * 执行买入
   */
  private async executeBuy(
    strategyId: string,
    tokenMint: string,
    amount: number
  ): Promise<StrategyExecutionResult> {
    try {
      logger.info(`[StrategyExecutor] Executing buy: ${strategyId}`);
      logger.info(`  Token: ${tokenMint}`);
      logger.info(`  Amount: ${amount.toFixed(4)} SOL`);

      // 风险检查
      const riskCheck = await this.riskManager.checkTrade(
        tokenMint,
        amount,
        0, // currentPrice will be fetched
        true // isBuy
      );

      if (!riskCheck.approved) {
        throw new Error(`Risk check failed: ${riskCheck.reason}`);
      }

      // 调整金额
      const adjustedAmount = riskCheck.adjustedSize || amount;

      // 构建交易
      const transaction = await this.buildBuyTransaction(tokenMint, adjustedAmount);

      // 使用 Jito 发送交易
      const result = await jitoEngine.sendBundle([transaction as unknown as VersionedTransaction]);

      if (!result.success) {
        throw new Error(`Transaction failed: ${result.error}`);
      }

      // 更新策略状态
      const status = this.statuses.get(strategyId);
      if (status) {
        status.executedAmount += adjustedAmount;
        status.remainingAmount -= adjustedAmount;
        status.lastExecutionTime = Date.now();
        status.progress = (status.executedAmount / (status.executedAmount + status.remainingAmount)) * 100;

        // 如果是第一次买入，记录入场价格
        if (status.entryPrice === 0) {
          status.entryPrice = await this.getTokenPrice(tokenMint);
        }
      }

      const executionResult: StrategyExecutionResult = {
        strategyId,
        success: true,
        executedAmount: adjustedAmount,
        executedPrice: await this.getTokenPrice(tokenMint),
        signature: result.bundleId,
        timestamp: Date.now()
      };

      this.emit({
        strategyId,
        type: 'EXECUTED',
        timestamp: Date.now(),
        data: executionResult
      });

      logger.info(`[StrategyExecutor] Buy executed successfully: ${strategyId}`);
      logger.info(`  Signature: ${result.bundleId}`);
      logger.info(`  Amount: ${adjustedAmount.toFixed(4)} SOL`);

      return executionResult;

    } catch (error) {
      const err = error as Error;
      logger.error(`[StrategyExecutor] Buy execution failed`, err);

      const executionResult: StrategyExecutionResult = {
        strategyId,
        success: false,
        executedAmount: 0,
        executedPrice: 0,
        error: err.message,
        timestamp: Date.now()
      };

      this.emit({
        strategyId,
        type: 'ERROR',
        timestamp: Date.now(),
        data: executionResult
      });

      return executionResult;
    }
  }

  /**
   * 构建买入交易
   */
  private async buildBuyTransaction(tokenMint: string, amount: number): Promise<Transaction> {
    // 使用 Jupiter API 构建最优路径
    const jupiterApiUrl = 'https://quote-api.jup.ag/v6/quote';

    const response = await fetch(`${jupiterApiUrl}?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenMint}&amount=${amount * LAMPORTS_PER_SOL}&slippageBps=50`);

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const quote = await response.json();

    // 构建交易
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: this.wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true
      })
    });

    if (!swapResponse.ok) {
      throw new Error(`Jupiter swap error: ${swapResponse.status}`);
    }

    const swapData: any = await swapResponse.json();

    // 反序列化交易
    const transaction = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'));

    return transaction;
  }

  /**
   * 获取代币价格
   */
  private async getTokenPrice(tokenMint: string): Promise<number> {
    try {
      const jupiterApiUrl = 'https://price.jup.ag/v4/price';

      const response = await fetch(`${jupiterApiUrl}?ids=${tokenMint}`);

      if (!response.ok) {
        throw new Error(`Jupiter price API error: ${response.status}`);
      }

      const data: any = await response.json();
      const price = data.data[tokenMint]?.price;

      if (!price) {
        throw new Error(`Price not found for token: ${tokenMint}`);
      }

      return price;
    } catch (error) {
      logger.error(`[StrategyExecutor] Failed to get token price`, error as Error);
      return 0;
    }
  }

  /**
   * 启动价格监控
   */
  private startPriceMonitoring(strategy: TradingStrategy): void {
    const { id, tokenMint, stopLoss, takeProfit } = strategy;

    const monitor = setInterval(async () => {
      try {
        const currentPrice = await this.getTokenPrice(tokenMint);
        const status = this.statuses.get(id);

        if (!status) return;

        status.currentPrice = currentPrice;

        // 计算未实现盈亏
        if (status.entryPrice > 0) {
          status.unrealizedPnl = (currentPrice - status.entryPrice) * status.executedAmount;
          status.unrealizedPnlPercentage = ((currentPrice - status.entryPrice) / status.entryPrice) * 100;
        }

        // 检查止损
        if (stopLoss && status.unrealizedPnlPercentage <= -stopLoss * 100) {
          logger.warn(`[StrategyExecutor] Stop loss triggered: ${id}`);
          await this.executeSell(id, tokenMint, 'STOP_LOSS');
          this.stopStrategy(id);
        }

        // 检查止盈
        if (takeProfit && status.unrealizedPnlPercentage >= takeProfit * 100) {
          logger.info(`[StrategyExecutor] Take profit triggered: ${id}`);
          await this.executeSell(id, tokenMint, 'TAKE_PROFIT');
          this.stopStrategy(id);
        }

      } catch (error) {
        logger.error(`[StrategyExecutor] Price monitoring failed`, error as Error);
      }
    }, 5000); // 每 5 秒检查一次

    this.priceMonitors.set(id, monitor);
  }

  /**
   * 监控价格以执行买入（Grid 策略）
   */
  private monitorPriceForBuy(
    strategyId: string,
    tokenMint: string,
    targetPrice: number,
    amount: number
  ): void {
    const monitor = setInterval(async () => {
      try {
        const currentPrice = await this.getTokenPrice(tokenMint);

        if (currentPrice <= targetPrice) {
          logger.info(`[StrategyExecutor] Grid buy triggered: ${strategyId}`);
          await this.executeBuy(strategyId, tokenMint, amount);
          clearInterval(monitor);
        }
      } catch (error) {
        logger.error(`[StrategyExecutor] Grid monitoring failed`, error as Error);
      }
    }, 5000); // 每 5 秒检查一次
  }

  /**
   * 监控动量（Momentum 策略）
   */
  private monitorMomentum(
    strategyId: string,
    tokenMint: string,
    initialPrice: number,
    totalAmount: number
  ): void {
    let priceHistory: number[] = [initialPrice];

    const monitor = setInterval(async () => {
      try {
        const currentPrice = await this.getTokenPrice(tokenMint);
        priceHistory.push(currentPrice);

        // 保留最近 10 个价格点
        if (priceHistory.length > 10) {
          priceHistory.shift();
        }

        // 计算动量（简单移动平均）
        const sma = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
        const momentum = (currentPrice - sma) / sma;

        // 如果动量 > 5%，买入
        if (momentum > 0.05) {
          logger.info(`[StrategyExecutor] Momentum buy triggered: ${strategyId}`);
          await this.executeBuy(strategyId, tokenMint, totalAmount);
          clearInterval(monitor);
        }
      } catch (error) {
        logger.error(`[StrategyExecutor] Momentum monitoring failed`, error as Error);
      }
    }, 5000); // 每 5 秒检查一次
  }

  /**
   * 监控均值回归（Mean Reversion 策略）
   */
  private monitorMeanReversion(
    strategyId: string,
    tokenMint: string,
    meanPrice: number,
    totalAmount: number
  ): void {
    let priceHistory: number[] = [meanPrice];

    const monitor = setInterval(async () => {
      try {
        const currentPrice = await this.getTokenPrice(tokenMint);
        priceHistory.push(currentPrice);

        // 保留最近 20 个价格点
        if (priceHistory.length > 20) {
          priceHistory.shift();
        }

        // 计算新的均值
        const newMean = priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;

        // 如果价格低于均值 5%，买入
        if (currentPrice < newMean * 0.95) {
          logger.info(`[StrategyExecutor] Mean reversion buy triggered: ${strategyId}`);
          await this.executeBuy(strategyId, tokenMint, totalAmount);
          clearInterval(monitor);
        }
      } catch (error) {
        logger.error(`[StrategyExecutor] Mean reversion monitoring failed`, error as Error);
      }
    }, 5000); // 每 5 秒检查一次
  }

  /**
   * 执行卖出
   */
  private async executeSell(
    strategyId: string,
    tokenMint: string,
    reason: 'STOP_LOSS' | 'TAKE_PROFIT'
  ): Promise<void> {
    try {
      logger.info(`[StrategyExecutor] Executing sell: ${strategyId}`);
      logger.info(`  Reason: ${reason}`);

      // 获取持仓
      const status = this.statuses.get(strategyId);
      if (!status) {
        throw new Error(`Strategy status not found: ${strategyId}`);
      }

      // 构建卖出交易
      const transaction = await this.buildSellTransaction(tokenMint, status.executedAmount);

      // 使用 Jito 发送交易
      const result = await jitoEngine.sendBundle([transaction as unknown as VersionedTransaction]);

      if (!result.success) {
        throw new Error(`Transaction failed: ${result.error}`);
      }

      logger.info(`[StrategyExecutor] Sell executed successfully: ${strategyId}`);
      logger.info(`  Reason: ${reason}`);
      logger.info(`  Signature: ${result.bundleId}`);

    } catch (error) {
      logger.error(`[StrategyExecutor] Sell execution failed`, error as Error);
    }
  }

  /**
   * 构建卖出交易
   */
  private async buildSellTransaction(tokenMint: string, amount: number): Promise<Transaction> {
    // 使用 Jupiter API 构建最优路径
    const jupiterApiUrl = 'https://quote-api.jup.ag/v6/quote';

    const response = await fetch(`${jupiterApiUrl}?inputMint=${tokenMint}&outputMint=So11111111111111111111111111111111111111112&amount=${amount * LAMPORTS_PER_SOL}&slippageBps=50`);

    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const quote = await response.json();

    // 构建交易
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: this.wallet.publicKey.toBase58(),
        wrapAndUnwrapSol: true
      })
    });

    if (!swapResponse.ok) {
      throw new Error(`Jupiter swap error: ${swapResponse.status}`);
    }

    const swapData: any = await swapResponse.json();

    // 反序列化交易
    const transaction = Transaction.from(Buffer.from(swapData.swapTransaction, 'base64'));

    return transaction;
  }

  /**
   * 完成策略
   */
  private completeStrategy(strategyId: string): void {
    const status = this.statuses.get(strategyId);
    if (status) {
      status.status = 'COMPLETED';
      status.progress = 100;
    }

    this.emit({
      strategyId,
      type: 'COMPLETED',
      timestamp: Date.now()
    });

    logger.info(`[StrategyExecutor] Strategy completed: ${strategyId}`);
  }

  /**
   * 获取所有策略
   */
  getStrategies(): TradingStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * 获取策略状态
   */
  getStrategyStatus(strategyId: string): StrategyStatus | undefined {
    return this.statuses.get(strategyId);
  }

  /**
   * 获取所有策略状态
   */
  getAllStatuses(): StrategyStatus[] {
    return Array.from(this.statuses.values());
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    // 停止所有策略
    this.strategies.forEach((_, strategyId) => {
      this.stopStrategy(strategyId);
    });

    // 清理风险管理器
    this.riskManager.cleanup();

    logger.info('[StrategyExecutor] Resources cleaned up');
  }
}

// 导出单例
export const strategyExecutor = new StrategyExecutor(
  new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com'),
  require('bs58').decode(process.env.PRIVATE_KEY || '')
);
