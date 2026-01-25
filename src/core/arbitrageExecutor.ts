/**
 * 套利执行器
 * 执行跨 DEX 套利交易
 */

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { TradeExecutor, buyToken, sellToken } from './executor';
import { JitoEngine } from './jito';
import { ArbitrageOpportunity } from './dexAggregator';

/**
 * 套利执行结果
 */
export interface ArbitrageResult {
  success: boolean;
  opportunity: ArbitrageOpportunity;
  trades: Array<{
    dex: string;
    type: 'BUY' | 'SELL';
    amount: number;
    price: number;
    signature?: string;
    error?: string;
  }>;
  totalProfit: number;
  totalCost: number;
  netProfit: number;
  executionTime: number;
  error?: string;
}

/**
 * 套利执行配置
 */
export interface ArbitrageConfig {
  tradeAmount: number;        // 交易金额（SOL）
  maxSlippage: number;        // 最大滑点（0.01 = 1%）
  useJito: boolean;           // 是否使用 Jito
  minProfitPercent: number;   // 最小利润百分比
  simulationMode: boolean;    // 模拟模式（不实际交易）
}

/**
 * 套利执行器类
 */
export class ArbitrageExecutor {
  private connection: Connection;
  private wallet: Keypair;
  private jitoEngine?: JitoEngine;
  private config: ArbitrageConfig;
  private executor: TradeExecutor;

  constructor(
    connection: Connection,
    wallet: Keypair,
    config: Partial<ArbitrageConfig> = {}
  ) {
    this.connection = connection;
    this.wallet = wallet;

    this.config = {
      tradeAmount: 0.1,        // 默认 0.1 SOL
      maxSlippage: 0.01,       // 1% 滑点
      useJito: true,           // 使用 Jito
      minProfitPercent: 0.3,  // 0.3% 最小利润
      simulationMode: true,    // 默认模拟模式
      ...config
    };

    this.executor = new TradeExecutor(connection, wallet, this.config.useJito);

    if (this.config.useJito) {
      this.jitoEngine = new JitoEngine();
    }
  }

  /**
   * 执行套利机会
   */
  async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<ArbitrageResult> {
    const startTime = Date.now();

    console.log(`[ArbitrageExecutor] 开始执行套利:`);
    console.log(`  代币: ${opportunity.tokenSymbol}`);
    console.log(`  路径: ${opportunity.buyDex} -> ${opportunity.sellDex}`);
    console.log(`  预期利润: ${opportunity.priceDiff.toFixed(3)}%`);

    // 检查是否满足最小利润要求
    if (opportunity.priceDiff < this.config.minProfitPercent) {
      return {
        success: false,
        opportunity,
        trades: [],
        totalProfit: 0,
        totalCost: 0,
        netProfit: 0,
        executionTime: Date.now() - startTime,
        error: `利润不足: ${opportunity.priceDiff}% < ${this.config.minProfitPercent}%`
      };
    }

    // 模拟模式
    if (this.config.simulationMode) {
      return this.simulateArbitrage(opportunity);
    }

    // 真实交易
    try {
      // 步骤 1: 在低价 DEX 买入
      console.log(`[ArbitrageExecutor] 步骤 1: 在 ${opportunity.buyDex} 买入`);

      // 注意：这里我们仍然使用 Jupiter 来执行交易
      // 因为直接与 DEX 交互需要构建复杂的交易指令
      // 而 Jupiter 会自动找到最优路径（包括该 DEX）
      const buyResult = await buyToken(
        this.executor,
        opportunity.tokenMint,
        this.config.tradeAmount,
        this.config.maxSlippage * 100
      );

      if (!buyResult.success) {
        return {
          success: false,
          opportunity,
          trades: [{
            dex: opportunity.buyDex,
            type: 'BUY',
            amount: this.config.tradeAmount,
            price: opportunity.buyPrice,
            error: buyResult.error || '买入失败'
          }],
          totalProfit: 0,
          totalCost: 0,
          netProfit: 0,
          executionTime: Date.now() - startTime,
          error: `买入失败: ${buyResult.error}`
        };
      }

      console.log(`[ArbitrageExecutor] 买入成功: ${buyResult.signature}`);

      // 步骤 2: 在高价 DEX 卖出
      console.log(`[ArbitrageExecutor] 步骤 2: 在 ${opportunity.sellDex} 卖出`);

      // 估算获得的代币数量
      const tokenAmount = this.config.tradeAmount / opportunity.buyPrice;

      const sellResult = await sellToken(
        this.executor,
        opportunity.tokenMint,
        tokenAmount,
        9, // 假设 9 位小数
        this.config.maxSlippage * 100
      );

      if (!sellResult.success) {
        return {
          success: false,
          opportunity,
          trades: [
            {
              dex: opportunity.buyDex,
              type: 'BUY',
              amount: this.config.tradeAmount,
              price: opportunity.buyPrice,
              signature: buyResult.signature
            },
            {
              dex: opportunity.sellDex,
              type: 'SELL',
              amount: tokenAmount,
              price: opportunity.sellPrice,
              error: sellResult.error || '卖出失败'
            }
          ],
          totalProfit: 0,
          totalCost: this.config.tradeAmount,
          netProfit: -this.config.tradeAmount, // 买入成功但卖出失败，算作亏损
          executionTime: Date.now() - startTime,
          error: `卖出失败: ${sellResult.error}`
        };
      }

      console.log(`[ArbitrageExecutor] 卖出成功: ${sellResult.signature}`);

      // 计算实际利润
      const totalCost = this.config.tradeAmount;
      const totalRevenue = sellResult.outputAmount;
      const netProfit = totalRevenue - totalCost;

      console.log(`[ArbitrageExecutor] 套利完成!`);
      console.log(`  成本: ${totalCost.toFixed(6)} SOL`);
      console.log(`  收入: ${totalRevenue.toFixed(6)} SOL`);
      console.log(`  净利润: ${netProfit.toFixed(6)} SOL`);

      return {
        success: netProfit > 0,
        opportunity,
        trades: [
          {
            dex: opportunity.buyDex,
            type: 'BUY',
            amount: this.config.tradeAmount,
            price: opportunity.buyPrice,
            signature: buyResult.signature
          },
          {
            dex: opportunity.sellDex,
            type: 'SELL',
            amount: tokenAmount,
            price: opportunity.sellPrice,
            signature: sellResult.signature
          }
        ],
        totalProfit: totalRevenue,
        totalCost,
        netProfit,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      console.error(`[ArbitrageExecutor] 执行失败:`, error);
      return {
        success: false,
        opportunity,
        trades: [],
        totalProfit: 0,
        totalCost: 0,
        netProfit: 0,
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 模拟套利（用于测试）
   */
  private simulateArbitrage(opportunity: ArbitrageOpportunity): ArbitrageResult {
    console.log(`[ArbitrageExecutor] 模拟模式: 不会执行真实交易`);

    const tradeAmount = this.config.tradeAmount;
    const tradingCost = 0.001; // 0.1% 交易成本

    // 计算买入获得的代币数量
    const buyAmount = tradeAmount / opportunity.buyPrice;

    // 计算卖出获得的 SOL
    const sellRevenue = buyAmount * opportunity.sellPrice;

    // 计算净利润
    const grossProfit = sellRevenue - tradeAmount;
    const netProfit = grossProfit - (tradeAmount * tradingCost);

    console.log(`[ArbitrageExecutor] 模拟结果:`);
    console.log(`  买入: ${tradeAmount.toFixed(6)} SOL @ ${opportunity.buyPrice.toFixed(8)}`);
    console.log(`  代币数量: ${buyAmount.toFixed(2)}`);
    console.log(`  卖出: ${buyAmount.toFixed(2)} @ ${opportunity.sellPrice.toFixed(8)}`);
    console.log(`  收入: ${sellRevenue.toFixed(6)} SOL`);
    console.log(`  净利润: ${netProfit.toFixed(6)} SOL`);

    return {
      success: netProfit > 0,
      opportunity,
      trades: [
        {
          dex: opportunity.buyDex,
          type: 'BUY',
          amount: tradeAmount,
          price: opportunity.buyPrice
        },
        {
          dex: opportunity.sellDex,
          type: 'SELL',
          amount: buyAmount,
          price: opportunity.sellPrice
        }
      ],
      totalProfit: sellRevenue,
      totalCost: tradeAmount,
      netProfit,
      executionTime: 0
    };
  }

  /**
   * 使用 Flash Loan 执行套利（高级功能）
   *
   * Flash Loan 允许你借入资金进行交易，如果在同一个区块内归还，
   * 则不需要支付利息。这是无风险套利的理想方式。
   */
  async executeFlashLoanArbitrage(
    opportunity: ArbitrageOpportunity,
    loanAmount: number
  ): Promise<ArbitrageResult> {
    console.log(`[ArbitrageExecutor] Flash Loan 套利（开发中）`);
    console.log(`  借款金额: ${loanAmount} SOL`);
    console.log(`  注意: Solana 的 Flash Loan 协议仍在发展中`);

    // TODO: 集成 MarginFi 或 Solend 的 Flash Loan
    // 目前 Solana 的 Flash Loan 生态不如 Ethereum 成熟

    return {
      success: false,
      opportunity,
      trades: [],
      totalProfit: 0,
      totalCost: 0,
      netProfit: 0,
      executionTime: 0,
      error: 'Flash Loan 功能开发中'
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ArbitrageConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.useJito !== undefined) {
      this.executor = new TradeExecutor(this.connection, this.wallet, config.useJito);

      if (config.useJito && !this.jitoEngine) {
        this.jitoEngine = new JitoEngine();
      }
    }

    console.log(`[ArbitrageExecutor] 配置已更新:`, this.config);
  }

  /**
   * 获取当前配置
   */
  getConfig(): ArbitrageConfig {
    return { ...this.config };
  }

  /**
   * 设置模拟模式
   */
  setSimulationMode(enabled: boolean): void {
    this.config.simulationMode = enabled;
    console.log(`[ArbitrageExecutor] 模拟模式: ${enabled ? '开启' : '关闭'}`);
  }
}

/**
 * 套利统计
 */
export class ArbitrageStats {
  private totalExecutions: number = 0;
  private successfulExecutions: number = 0;
  private totalProfit: number = 0;
  private totalLoss: number = 0;
  private history: ArbitrageResult[] = [];

  addResult(result: ArbitrageResult): void {
    this.totalExecutions++;
    this.history.push(result);

    if (result.success) {
      this.successfulExecutions++;
      if (result.netProfit > 0) {
        this.totalProfit += result.netProfit;
      } else {
        this.totalLoss += Math.abs(result.netProfit);
      }
    }

    // 只保留最近 100 条记录
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  getStats(): {
    totalExecutions: number;
    successRate: number;
    totalProfit: number;
    totalLoss: number;
    netProfit: number;
    avgExecutionTime: number;
  } {
    const avgExecutionTime = this.history.length > 0
      ? this.history.reduce((sum, r) => sum + r.executionTime, 0) / this.history.length
      : 0;

    return {
      totalExecutions: this.totalExecutions,
      successRate: this.totalExecutions > 0 ? this.successfulExecutions / this.totalExecutions : 0,
      totalProfit: this.totalProfit,
      totalLoss: this.totalLoss,
      netProfit: this.totalProfit - this.totalLoss,
      avgExecutionTime
    };
  }

  getHistory(): ArbitrageResult[] {
    return [...this.history];
  }

  clear(): void {
    this.totalExecutions = 0;
    this.successfulExecutions = 0;
    this.totalProfit = 0;
    this.totalLoss = 0;
    this.history = [];
  }
}
