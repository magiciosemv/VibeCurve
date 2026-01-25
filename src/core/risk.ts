/**
 * 风险管理系统
 * 提供仓位控制、止损止盈、风险评估等功能
 */

export interface RiskConfig {
  // 仓位管理
  maxPositionSize: number;      // 单次最大交易金额（SOL）
  maxTotalPosition: number;     // 总持仓上限（SOL）
  minPositionSize: number;      // 最小交易金额（SOL）

  // 止损止盈
  stopLossPercentage: number;   // 止损百分比（0.1 = 10%）
  takeProfitPercentage: number; // 止盈百分比（0.2 = 20%）
  trailingStopPercentage: number; // 移动止损百分比

  // 风险限制
  maxDailyLoss: number;         // 每日最大亏损（SOL）
  maxDrawdown: number;          // 最大回撤百分比
  maxOpenPositions: number;     // 最大同时持仓数量

  // 流动性要求
  minLiquidity: number;         // 最小流动性要求（SOL）
  maxSlippage: number;          // 最大滑点容忍度（0.01 = 1%）

  // 交易限制
  maxTradesPerHour: number;     // 每小时最大交易次数
  cooldownPeriod: number;       // 冷却期（秒）
}

export interface Position {
  tokenMint: string;
  tokenSymbol: string;
  entryPrice: number;
  currentPrice: number;
  amount: number;
  valueInSol: number;
  unrealizedPnl: number;
  unrealizedPnlPercentage: number;
  timestamp: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface RiskCheckResult {
  approved: boolean;
  reason?: string;
  adjustedSize?: number;
}

export class RiskManager {
  private config: RiskConfig;
  private positions: Map<string, Position> = new Map();
  private dailyPnl: number = 0;
  private dailyTrades: number = 0;
  private lastTradeTime: number = 0;
  private peakEquity: number = 0;
  private hourlyTradeCount: number = 0;
  private lastHourReset: number = Date.now();

  constructor(config: Partial<RiskConfig> = {}) {
    this.config = {
      maxPositionSize: 0.5,        // 0.5 SOL
      maxTotalPosition: 2.0,       // 2 SOL
      minPositionSize: 0.01,       // 0.01 SOL
      stopLossPercentage: 0.15,    // 15%
      takeProfitPercentage: 0.30,  // 30%
      trailingStopPercentage: 0.10, // 10%
      maxDailyLoss: 1.0,           // 1 SOL
      maxDrawdown: 0.20,           // 20%
      maxOpenPositions: 3,
      minLiquidity: 5.0,           // 5 SOL
      maxSlippage: 0.05,           // 5%
      maxTradesPerHour: 10,
      cooldownPeriod: 30,
      ...config
    };
  }

  /**
   * 检查交易是否被允许
   */
  async checkTrade(
    tokenMint: string,
    tradeSize: number,
    currentPrice: number,
    isBuy: boolean
  ): Promise<RiskCheckResult> {
    // 1. 检查冷却期
    if (Date.now() - this.lastTradeTime < this.config.cooldownPeriod * 1000) {
      const remaining = Math.ceil((this.config.cooldownPeriod * 1000 - (Date.now() - this.lastTradeTime)) / 1000);
      return {
        approved: false,
        reason: `冷却期中，还需等待 ${remaining} 秒`
      };
    }

    // 2. 检查每小时交易次数
    this.resetHourlyCounterIfNeeded();
    if (this.hourlyTradeCount >= this.config.maxTradesPerHour) {
      return {
        approved: false,
        reason: '已达到每小时最大交易次数限制'
      };
    }

    // 3. 检查每日亏损限制
    if (this.dailyPnl <= -this.config.maxDailyLoss) {
      return {
        approved: false,
        reason: `已达到每日最大亏损限制 (${this.config.maxDailyLoss} SOL)`
      };
    }

    // 4. 检查最大回撤
    const currentDrawdown = this.calculateDrawdown();
    if (currentDrawdown >= this.config.maxDrawdown) {
      return {
        approved: false,
        reason: `已达到最大回撤限制 (${(this.config.maxDrawdown * 100).toFixed(1)}%)`
      };
    }

    // 5. 检查交易大小
    if (tradeSize < this.config.minPositionSize) {
      return {
        approved: false,
        reason: `交易金额过小，最小为 ${this.config.minPositionSize} SOL`
      };
    }

    let adjustedSize = Math.min(tradeSize, this.config.maxPositionSize);

    // 6. 检查总持仓限制
    const totalPosition = this.getTotalPositionValue();
    if (totalPosition + adjustedSize > this.config.maxTotalPosition) {
      adjustedSize = Math.max(0, this.config.maxTotalPosition - totalPosition);
      if (adjustedSize < this.config.minPositionSize) {
        return {
          approved: false,
          reason: '总持仓已达上限'
        };
      }
    }

    // 7. 买入时检查持仓数量限制
    if (isBuy) {
      const openPositions = this.positions.size;
      if (openPositions >= this.config.maxOpenPositions && !this.positions.has(tokenMint)) {
        return {
          approved: false,
          reason: `已达到最大持仓数量 (${this.config.maxOpenPositions})`
        };
      }
    }

    return {
      approved: true,
      adjustedSize
    };
  }

  /**
   * 开仓
   */
  openPosition(
    tokenMint: string,
    tokenSymbol: string,
    entryPrice: number,
    amount: number,
    valueInSol: number
  ): Position {
    const position: Position = {
      tokenMint,
      tokenSymbol,
      entryPrice,
      currentPrice: entryPrice,
      amount,
      valueInSol,
      unrealizedPnl: 0,
      unrealizedPnlPercentage: 0,
      timestamp: Date.now(),
      stopLoss: entryPrice * (1 - this.config.stopLossPercentage),
      takeProfit: entryPrice * (1 + this.config.takeProfitPercentage)
    };

    this.positions.set(tokenMint, position);
    this.lastTradeTime = Date.now();
    this.hourlyTradeCount++;
    this.dailyTrades++;

    console.log(`[RiskManager] 开仓: ${tokenSymbol} ${amount} @ ${entryPrice.toFixed(8)}`);
    console.log(`  止损: ${position.stopLoss.toFixed(8)}`);
    console.log(`  止盈: ${position.takeProfit.toFixed(8)}`);

    return position;
  }

  /**
   * 平仓
   */
  closePosition(tokenMint: string, exitPrice: number): {
    position: Position;
    realizedPnl: number;
    realizedPnlPercentage: number;
  } | null {
    const position = this.positions.get(tokenMint);
    if (!position) return null;

    const realizedPnl = (exitPrice - position.entryPrice) * position.amount;
    const realizedPnlPercentage = ((exitPrice - position.entryPrice) / position.entryPrice) * 100;

    this.dailyPnl += realizedPnl;
    this.positions.delete(tokenMint);
    this.lastTradeTime = Date.now();
    this.hourlyTradeCount++;
    this.dailyTrades++;

    console.log(`[RiskManager] 平仓: ${position.tokenSymbol}`);
    console.log(`  入场: ${position.entryPrice.toFixed(8)}`);
    console.log(`  出场: ${exitPrice.toFixed(8)}`);
    console.log(`  盈亏: ${realizedPnl.toFixed(6)} SOL (${realizedPnlPercentage.toFixed(2)}%)`);

    return {
      position,
      realizedPnl,
      realizedPnlPercentage
    };
  }

  /**
   * 更新持仓价格并检查止损止盈
   */
  updatePositions(currentPrices: Map<string, number>): Array<{
    tokenMint: string;
    action: 'CLOSE' | 'HOLD' | 'UPDATE_STOP';
    reason: string;
  }> {
    const actions = [];

    for (const [tokenMint, position] of this.positions) {
      const currentPrice = currentPrices.get(tokenMint) || position.currentPrice;
      position.currentPrice = currentPrice;

      // 计算未实现盈亏
      position.unrealizedPnl = (currentPrice - position.entryPrice) * position.amount;
      position.unrealizedPnlPercentage = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;

      // 检查止损
      if (position.stopLoss && currentPrice <= position.stopLoss) {
        actions.push({
          tokenMint,
          action: 'CLOSE',
          reason: `触发止损 (${position.stopLoss.toFixed(8)})`
        });
        continue;
      }

      // 检查止盈
      if (position.takeProfit && currentPrice >= position.takeProfit) {
        actions.push({
          tokenMint,
          action: 'CLOSE',
          reason: `触发止盈 (${position.takeProfit.toFixed(8)})`
        });
        continue;
      }

      // 移动止损
      if (position.unrealizedPnlPercentage > 10) {
        const newStopLoss = currentPrice * (1 - this.config.trailingStopPercentage);
        if (newStopLoss > (position.stopLoss || 0)) {
          position.stopLoss = newStopLoss;
          actions.push({
            tokenMint,
            action: 'UPDATE_STOP',
            reason: `移动止损至 ${newStopLoss.toFixed(8)}`
          });
        }
      }

      actions.push({
        tokenMint,
        action: 'HOLD',
        reason: '持有中'
      });
    }

    return actions;
  }

  /**
   * 计算当前总持仓价值
   */
  getTotalPositionValue(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.valueInSol;
    }
    return total;
  }

  /**
   * 计算总未实现盈亏
   */
  getTotalUnrealizedPnl(): number {
    let total = 0;
    for (const position of this.positions.values()) {
      total += position.unrealizedPnl;
    }
    return total;
  }

  /**
   * 计算回撤
   */
  calculateDrawdown(): number {
    const currentEquity = this.peakEquity + this.dailyPnl + this.getTotalUnrealizedPnl();

    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
      return 0;
    }

    if (this.peakEquity === 0) return 0;

    return (this.peakEquity - currentEquity) / this.peakEquity;
  }

  /**
   * 获取所有持仓
   */
  getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * 获取特定持仓
   */
  getPosition(tokenMint: string): Position | undefined {
    return this.positions.get(tokenMint);
  }

  /**
   * 获取每日盈亏
   */
  getDailyPnl(): number {
    return this.dailyPnl;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalTrades: number;
    winRate: number;
    totalPnl: number;
    avgWin: number;
    avgLoss: number;
    currentDrawdown: number;
    openPositions: number;
  } {
    return {
      totalTrades: this.dailyTrades,
      winRate: 0, // TODO: 跟踪历史交易
      totalPnl: this.dailyPnl,
      avgWin: 0,
      avgLoss: 0,
      currentDrawdown: this.calculateDrawdown(),
      openPositions: this.positions.size
    };
  }

  /**
   * 重置每日计数器（每天调用）
   */
  resetDailyCounters() {
    this.dailyPnl = 0;
    this.dailyTrades = 0;
    console.log('[RiskManager] 每日计数器已重置');
  }

  /**
   * 重置每小时交易计数
   */
  private resetHourlyCounterIfNeeded() {
    const now = Date.now();
    if (now - this.lastHourReset > 3600000) { // 1 小时
      this.hourlyTradeCount = 0;
      this.lastHourReset = now;
    }
  }

  /**
   * 紧急平仓所有持仓
   */
  emergencyCloseAll(): string[] {
    const closedTokens = [];
    for (const tokenMint of this.positions.keys()) {
      closedTokens.push(tokenMint);
      this.positions.delete(tokenMint);
    }
    console.log(`[RiskManager] 紧急平仓 ${closedTokens.length} 个持仓`);
    return closedTokens;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<RiskConfig>) {
    this.config = { ...this.config, ...updates };
    console.log('[RiskManager] 配置已更新');
  }

  /**
   * 获取当前配置
   */
  getConfig(): RiskConfig {
    return { ...this.config };
  }
}

// 默认导出
export const defaultRiskConfig: RiskConfig = {
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
};
