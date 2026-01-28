/**
 * 策略回测引擎
 *
 * 核心功能：
 * 1. 历史数据回测
 * 2. 性能指标计算（Sharpe Ratio、Max Drawdown、Win Rate）
 * 3. 参数优化
 * 4. 多策略对比
 */

import { Connection } from '@solana/web3.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('Backtester');

/**
 * 回测配置
 */
export interface BacktestConfig {
  startDate: string;      // 开始日期 (YYYY-MM-DD)
  endDate: string;        // 结束日期 (YYYY-MM-DD)
  initialCapital: number; // 初始资金（SOL）
  commission: number;     // 手续费（0.001 = 0.1%）
  slippage: number;       // 滑点（0.005 = 0.5%）
}

/**
 * 回测结果
 */
export interface BacktestResult {
  strategyId: string;
  strategyType: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  totalReturnPercentage: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercentage: number;
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  avgTradeDuration: number; // 平均持仓时间（秒）
  bestTrade: number;
  worstTrade: number;
  equityCurve: Array<{
    timestamp: number;
    equity: number;
    drawdown: number;
  }>;
  trades: Array<{
    timestamp: number;
    type: 'BUY' | 'SELL';
    price: number;
    amount: number;
    value: number;
    pnl: number;
  }>;
}

/**
 * 价格数据点
 */
export interface PriceData {
  timestamp: number;
  price: number;
  volume: number;
}

/**
 * 策略回测引擎
 */
export class StrategyBacktester {
  private connection: Connection;

  constructor(connection: Connection) {
    this.connection = connection;
    logger.info('[Backtester] Initialized');
  }

  /**
   * 回测DCA策略
   */
  async backtestDCA(
    tokenMint: string,
    config: BacktestConfig,
    dcaConfig: {
      totalAmount: number;
      intervals: number;
      intervalSeconds: number;
    }
  ): Promise<BacktestResult> {
    logger.info(`[Backtester] Backtesting DCA strategy for ${tokenMint}`);

    // 获取历史价格数据
    const priceData = await this.getHistoricalPriceData(tokenMint, config);

    // 初始化回测状态
    let capital = config.initialCapital;
    let position = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalWin = 0;
    let totalLoss = 0;
    let maxEquity = config.initialCapital;
    let maxDrawdown = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;

    const trades: BacktestResult['trades'] = [];
    const equityCurve: BacktestResult['equityCurve'] = [];

    // 计算每次买入金额
    const amountPerInterval = dcaConfig.totalAmount / dcaConfig.intervals;

    // 模拟DCA买入
    for (let i = 0; i < dcaConfig.intervals; i++) {
      const buyTime = priceData[0].timestamp + (i * dcaConfig.intervalSeconds * 1000);
      const pricePoint = priceData.find(p => p.timestamp >= buyTime);

      if (!pricePoint) break;

      // 计算买入价格（包含滑点）
      const buyPrice = pricePoint.price * (1 + config.slippage);
      const buyAmount = amountPerInterval / buyPrice;

      // 计算手续费
      const commission = amountPerInterval * config.commission;

      // 更新状态
      capital -= (amountPerInterval + commission);
      position += buyAmount;
      totalTrades++;

      trades.push({
        timestamp: buyTime,
        type: 'BUY',
        price: buyPrice,
        amount: buyAmount,
        value: amountPerInterval,
        pnl: 0
      });

      // 计算当前权益
      const currentEquity = capital + (position * buyPrice);
      equityCurve.push({
        timestamp: buyTime,
        equity: currentEquity,
        drawdown: (maxEquity - currentEquity) / maxEquity
      });

      // 更新最大权益和最大回撤
      if (currentEquity > maxEquity) {
        maxEquity = currentEquity;
      }
      const drawdown = (maxEquity - currentEquity) / maxEquity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // 最后卖出
    if (position > 0) {
      const lastPrice = priceData[priceData.length - 1].price;
      const sellPrice = lastPrice * (1 - config.slippage);
      const sellValue = position * sellPrice;
      const commission = sellValue * config.commission;

      const pnl = sellValue - commission - dcaConfig.totalAmount;

      capital += (sellValue - commission);
      position = 0;
      totalTrades++;

      trades.push({
        timestamp: priceData[priceData.length - 1].timestamp,
        type: 'SELL',
        price: sellPrice,
        amount: position,
        value: sellValue,
        pnl
      });

      if (pnl > 0) {
        winningTrades++;
        totalWin += pnl;
        if (pnl > bestTrade) bestTrade = pnl;
      } else {
        losingTrades++;
        totalLoss += Math.abs(pnl);
        if (pnl < worstTrade) worstTrade = pnl;
      }
    }

    // 计算最终结果
    const finalCapital = capital;
    const totalReturn = finalCapital - config.initialCapital;
    const totalReturnPercentage = (totalReturn / config.initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgWin = winningTrades > 0 ? totalWin / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : Infinity;

    // 计算Sharpe Ratio
    const returns = equityCurve.map((point, i) => {
      if (i === 0) return 0;
      return (point.equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
    });
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    // 计算Sortino Ratio
    const negativeReturns = returns.filter(r => r < 0);
    const stdNegative = Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length);
    const sortinoRatio = stdNegative > 0 ? (avgReturn / stdNegative) * Math.sqrt(252) : 0;

    // 计算Calmar Ratio
    const calmarRatio = maxDrawdown > 0 ? (totalReturnPercentage / 100) / maxDrawdown : 0;

    return {
      strategyId: `dca-${tokenMint}-${Date.now()}`,
      strategyType: 'DCA',
      startDate: config.startDate,
      endDate: config.endDate,
      initialCapital: config.initialCapital,
      finalCapital,
      totalReturn,
      totalReturnPercentage,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercentage: maxDrawdown * 100,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      avgTradeDuration: 0,
      bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
      worstTrade: worstTrade === Infinity ? 0 : worstTrade,
      equityCurve,
      trades
    };
  }

  /**
   * 回测网格策略
   */
  async backtestGrid(
    tokenMint: string,
    config: BacktestConfig,
    gridConfig: {
      totalAmount: number;
      gridLevels: number;
      gridSpacing: number; // 网格间距（百分比，0.02 = 2%）
    }
  ): Promise<BacktestResult> {
    logger.info(`[Backtester] Backtesting Grid strategy for ${tokenMint}`);

    // 获取历史价格数据
    const priceData = await this.getHistoricalPriceData(tokenMint, config);

    // 初始化回测状态
    let capital = config.initialCapital;
    let position = 0;
    let totalTrades = 0;
    let winningTrades = 0;
    let losingTrades = 0;
    let totalWin = 0;
    let totalLoss = 0;
    let maxEquity = config.initialCapital;
    let maxDrawdown = 0;
    let bestTrade = -Infinity;
    let worstTrade = Infinity;

    const trades: BacktestResult['trades'] = [];
    const equityCurve: BacktestResult['equityCurve'] = [];

    // 计算网格买入点
    const initialPrice = priceData[0].price;
    const gridBuys: Array<{ price: number; executed: boolean }> = [];
    const gridSells: Array<{ price: number; executed: boolean }> = [];

    for (let i = 0; i < gridConfig.gridLevels; i++) {
      const buyPrice = initialPrice * (1 - (i + 1) * gridConfig.gridSpacing);
      const sellPrice = buyPrice * (1 + gridConfig.gridSpacing);

      gridBuys.push({ price: buyPrice, executed: false });
      gridSells.push({ price: sellPrice, executed: false });
    }

    // 模拟网格交易
    for (const pricePoint of priceData) {
      const currentPrice = pricePoint.price;

      // 检查买入点
      for (let i = 0; i < gridBuys.length; i++) {
        if (!gridBuys[i].executed && currentPrice <= gridBuys[i].price) {
          const amountPerGrid = gridConfig.totalAmount / gridConfig.gridLevels;
          const buyPrice = currentPrice * (1 + config.slippage);
          const buyAmount = amountPerGrid / buyPrice;
          const commission = amountPerGrid * config.commission;

          capital -= (amountPerGrid + commission);
          position += buyAmount;
          totalTrades++;

          gridBuys[i].executed = true;

          trades.push({
            timestamp: pricePoint.timestamp,
            type: 'BUY',
            price: buyPrice,
            amount: buyAmount,
            value: amountPerGrid,
            pnl: 0
          });
        }
      }

      // 检查卖出点
      for (let i = 0; i < gridSells.length; i++) {
        if (gridSells[i].executed && currentPrice >= gridSells[i].price) {
          const sellPrice = currentPrice * (1 - config.slippage);
          const sellAmount = gridConfig.totalAmount / gridConfig.gridLevels;
          const sellValue = sellAmount * sellPrice;
          const commission = sellValue * config.commission;
          const pnl = sellValue - commission - (gridConfig.totalAmount / gridConfig.gridLevels);

          capital += (sellValue - commission);
          position -= sellAmount;
          totalTrades++;

          gridSells[i].executed = false;

          trades.push({
            timestamp: pricePoint.timestamp,
            type: 'SELL',
            price: sellPrice,
            amount: sellAmount,
            value: sellValue,
            pnl
          });

          if (pnl > 0) {
            winningTrades++;
            totalWin += pnl;
            if (pnl > bestTrade) bestTrade = pnl;
          } else {
            losingTrades++;
            totalLoss += Math.abs(pnl);
            if (pnl < worstTrade) worstTrade = pnl;
          }
        }
      }

      // 计算当前权益
      const currentEquity = capital + (position * currentPrice);
      equityCurve.push({
        timestamp: pricePoint.timestamp,
        equity: currentEquity,
        drawdown: (maxEquity - currentEquity) / maxEquity
      });

      // 更新最大权益和最大回撤
      if (currentEquity > maxEquity) {
        maxEquity = currentEquity;
      }
      const drawdown = (maxEquity - currentEquity) / maxEquity;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    // 计算最终结果
    const finalCapital = capital + (position * priceData[priceData.length - 1].price);
    const totalReturn = finalCapital - config.initialCapital;
    const totalReturnPercentage = (totalReturn / config.initialCapital) * 100;
    const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
    const avgWin = winningTrades > 0 ? totalWin / winningTrades : 0;
    const avgLoss = losingTrades > 0 ? totalLoss / losingTrades : 0;
    const profitFactor = totalLoss > 0 ? totalWin / totalLoss : Infinity;

    // 计算Sharpe Ratio
    const returns = equityCurve.map((point, i) => {
      if (i === 0) return 0;
      return (point.equity - equityCurve[i - 1].equity) / equityCurve[i - 1].equity;
    });
    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdReturn = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = stdReturn > 0 ? (avgReturn / stdReturn) * Math.sqrt(252) : 0;

    // 计算Sortino Ratio
    const negativeReturns = returns.filter(r => r < 0);
    const stdNegative = Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length);
    const sortinoRatio = stdNegative > 0 ? (avgReturn / stdNegative) * Math.sqrt(252) : 0;

    // 计算Calmar Ratio
    const calmarRatio = maxDrawdown > 0 ? (totalReturnPercentage / 100) / maxDrawdown : 0;

    return {
      strategyId: `grid-${tokenMint}-${Date.now()}`,
      strategyType: 'GRID',
      startDate: config.startDate,
      endDate: config.endDate,
      initialCapital: config.initialCapital,
      finalCapital,
      totalReturn,
      totalReturnPercentage,
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercentage: maxDrawdown * 100,
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      avgTradeDuration: 0,
      bestTrade: bestTrade === -Infinity ? 0 : bestTrade,
      worstTrade: worstTrade === Infinity ? 0 : worstTrade,
      equityCurve,
      trades
    };
  }

  /**
   * 获取历史价格数据
   */
  private async getHistoricalPriceData(
    tokenMint: string,
    config: BacktestConfig
  ): Promise<PriceData[]> {
    // TODO: 实现真实的历史数据获取
    // 这里可以使用 Jupiter API、CoinGecko API 或其他数据源

    // 模拟数据（仅用于演示）
    const startDate = new Date(config.startDate).getTime();
    const endDate = new Date(config.endDate).getTime();
    const duration = endDate - startDate;
    const points = 1000;
    const interval = duration / points;

    const priceData: PriceData[] = [];
    let price = 0.00001;

    for (let i = 0; i < points; i++) {
      const timestamp = startDate + (i * interval);
      // 随机游走
      price = price * (1 + (Math.random() - 0.5) * 0.02);

      priceData.push({
        timestamp,
        price,
        volume: Math.random() * 1000000
      });
    }

    return priceData;
  }

  /**
   * 参数优化
   */
  async optimizeParameters(
    tokenMint: string,
    config: BacktestConfig,
    strategyType: 'DCA' | 'GRID',
    parameterRanges: {
      [key: string]: {
        min: number;
        max: number;
        step: number;
      };
    }
  ): Promise<{
    bestParameters: any;
    bestResult: BacktestResult;
    allResults: BacktestResult[];
  }> {
    logger.info(`[Backtester] Optimizing parameters for ${strategyType} strategy`);

    const allResults: BacktestResult[] = [];
    let bestResult: BacktestResult | null = null;
    let bestParameters: any = null;

    // 生成所有参数组合
    const parameterCombinations = this.generateParameterCombinations(parameterRanges);

    // 回测每个参数组合
    for (const parameters of parameterCombinations) {
      let result: BacktestResult;

      if (strategyType === 'DCA') {
        result = await this.backtestDCA(tokenMint, config, parameters);
      } else {
        result = await this.backtestGrid(tokenMint, config, parameters);
      }

      allResults.push(result);

      // 选择最佳结果（基于Sharpe Ratio）
      if (!bestResult || result.sharpeRatio > bestResult.sharpeRatio) {
        bestResult = result;
        bestParameters = parameters;
      }
    }

    logger.info(`[Backtester] Optimization complete. Best Sharpe Ratio: ${bestResult?.sharpeRatio.toFixed(4)}`);

    return {
      bestParameters,
      bestResult: bestResult!,
      allResults
    };
  }

  /**
   * 生成参数组合
   */
  private generateParameterCombinations(
    parameterRanges: {
      [key: string]: {
        min: number;
        max: number;
        step: number;
      };
    }
  ): any[] {
    const keys = Object.keys(parameterRanges);
    const combinations: any[] = [];

    const generate = (index: number, current: any) => {
      if (index === keys.length) {
        combinations.push({ ...current });
        return;
      }

      const key = keys[index];
      const range = parameterRanges[key];

      for (let value = range.min; value <= range.max; value += range.step) {
        current[key] = value;
        generate(index + 1, current);
      }
    };

    generate(0, {});

    return combinations;
  }

  /**
   * 多策略对比
   */
  async compareStrategies(
    tokenMint: string,
    config: BacktestConfig,
    strategies: Array<{
      type: 'DCA' | 'GRID';
      config: any;
    }>
  ): Promise<{
    comparison: Array<{
      strategy: any;
      result: BacktestResult;
    }>;
    bestStrategy: {
      strategy: any;
      result: BacktestResult;
    };
  }> {
    logger.info(`[Backtester] Comparing ${strategies.length} strategies`);

    const comparison: Array<{
      strategy: any;
      result: BacktestResult;
    }> = [];

    for (const strategy of strategies) {
      let result: BacktestResult;

      if (strategy.type === 'DCA') {
        result = await this.backtestDCA(tokenMint, config, strategy.config);
      } else {
        result = await this.backtestGrid(tokenMint, config, strategy.config);
      }

      comparison.push({
        strategy,
        result
      });
    }

    // 选择最佳策略（基于Sharpe Ratio）
    const bestStrategy = comparison.reduce((best, current) => {
      return current.result.sharpeRatio > best.result.sharpeRatio ? current : best;
    });

    logger.info(`[Backtester] Comparison complete. Best strategy: ${bestStrategy.strategy.type}`);

    return {
      comparison,
      bestStrategy
    };
  }
}

export const strategyBacktester = new StrategyBacktester(
  new Connection(process.env.RPC_URL || 'https://api.mainnet-beta.solana.com')
);
