/**
 * DEX 价格聚合器
 * 从多个 DEX 获取实时价格，识别套利机会
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';

/**
 * DEX 价格信息
 */
export interface DexPrice {
  dex: string;
  price: number;           // 代币价格（SOL 计价）
  liquidity: number;       // 流动性（SOL）
  address: string;         // 池地址
  timestamp: number;
}

/**
 * 套利机会
 */
export interface ArbitrageOpportunity {
  tokenMint: string;
  tokenSymbol: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  priceDiff: number;       // 价差百分比
  estimatedProfit: number;  // 预估利润（SOL）
  liquidity: number;
  timestamp: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * DEX 聚合器类
 */
export class DexAggregator {
  private connection: Connection;
  private cache: Map<string, DexPrice[]> = new Map();
  private cacheTimeout = 5000; // 5 秒缓存

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * 获取代币在所有 DEX 的价格
   */
  async getAllPrices(tokenMint: string): Promise<DexPrice[]> {
    // 检查缓存
    const cached = this.cache.get(tokenMint);
    if (cached && Date.now() - cached[0].timestamp < this.cacheTimeout) {
      return cached;
    }

    const prices: DexPrice[] = [];

    try {
      // 1. Jupiter 价格（作为基准）
      const jupiterPrice = await this.getJupiterPrice(tokenMint);
      if (jupiterPrice) prices.push(jupiterPrice);

      // 2. Raydium 价格
      const raydiumPrice = await this.getRaydiumPrice(tokenMint);
      if (raydiumPrice) prices.push(raydiumPrice);

      // 3. Orca 价格
      const orcaPrice = await this.getOrcaPrice(tokenMint);
      if (orcaPrice) prices.push(orcaPrice);

      // 4. Meteora 价格
      const meteoraPrice = await this.getMeteoraPrice(tokenMint);
      if (meteoraPrice) prices.push(meteoraPrice);

      // 更新缓存
      if (prices.length > 0) {
        this.cache.set(tokenMint, prices);
      }

      return prices;
    } catch (err) {
      const error = err as Error;
      console.error('[DexAggregator] 获取价格失败:', error);
      return [];
    }
  }

  /**
   * 从 Jupiter API 获取价格
   */
  private async getJupiterPrice(tokenMint: string): Promise<DexPrice | null> {
    try {
      const response = await axios.get('https://price.jup.ag/v6/price', {
        params: { ids: tokenMint },
        timeout: 15000  // 增加超时到 15 秒
      });

      const data = response.data.data[tokenMint];
      if (!data) return null;

      return {
        dex: 'Jupiter',
        price: data.price,
        liquidity: 0, // Jupiter 不提供流动性数据
        address: 'aggregated',
        timestamp: Date.now()
      };
    } catch (err) {
      const error = err as Error;
      console.error('[DexAggregator] Jupiter API 失败:', error.message);
      return null;
    }
  }

  /**
   * 从 Raydium 获取价格
   */
  private async getRaydiumPrice(tokenMint: string): Promise<DexPrice | null> {
    try {
      // Raydium API
      const response = await axios.get('https://api.raydium.io/v2/sdk/liquidity/mainnet.json', {
        timeout: 15000
      });

      const data = response.data;
      const pools = data.official || data.unofficial || [];

      // 查找包含目标代币的池子
      for (const pool of pools) {
        if (pool.baseMint === tokenMint || pool.quoteMint === tokenMint) {
          // 计算价格
          const price = pool.baseMint === tokenMint
            ? pool.quoteReserve / pool.baseReserve
            : pool.baseReserve / pool.quoteReserve;

          return {
            dex: 'Raydium',
            price,
            liquidity: (pool.baseReserve + pool.quoteReserve) / 2,
            address: pool.id,
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (err) {
      const error = err as Error;
      console.error('[DexAggregator] Raydium API 失败:', error.message);
      return null;
    }
  }

  /**
   * 从 Orca 获取价格
   */
  private async getOrcaPrice(tokenMint: string): Promise<DexPrice | null> {
    try {
      // Orca API（Whirlpools）
      const response = await axios.get('https://api.orca.so/v1/whirlpool/list', {
        timeout: 15000
      });

      const pools = response.data;

      // 查找包含目标代币的池子（以 SOL 为交易对）
      const SOL_MINT = 'So11111111111111111111111111111111111111112';

      for (const pool of pools) {
        if ((pool.tokenA.mint === tokenMint && pool.tokenB.mint === SOL_MINT) ||
            (pool.tokenB.mint === tokenMint && pool.tokenA.mint === SOL_MINT)) {

          const price = pool.tokenA.mint === tokenMint
            ? pool.tokenB.amount / pool.tokenA.amount
            : pool.tokenA.amount / pool.tokenB.amount;

          return {
            dex: 'Orca',
            price,
            liquidity: pool.liquidity || 0,
            address: pool.address,
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (err) {
      const error = err as Error;
      console.error('[DexAggregator] Orca API 失败:', error.message);
      return null;
    }
  }

  /**
   * 从 Meteora 获取价格
   */
  private async getMeteoraPrice(tokenMint: string): Promise<DexPrice | null> {
    try {
      const response = await axios.get('https://api.meteora.fi/pairs', {
        timeout: 15000
      });

      const pairs = response.data.pairs || [];

      const SOL_MINT = 'So11111111111111111111111111111111111111111112';

      for (const pair of pairs) {
        if ((pair.tokenA.mint === tokenMint && pair.tokenB.mint === SOL_MINT) ||
            (pair.tokenB.mint === tokenMint && pair.tokenA.mint === SOL_MINT)) {

          const price = pair.tokenA.mint === tokenMint
            ? pair.tokenB.price / pair.tokenA.price
            : pair.tokenA.price / pair.tokenB.price;

          return {
            dex: 'Meteora',
            price,
            liquidity: pair.liquidity || 0,
            address: pair.address,
            timestamp: Date.now()
          };
        }
      }

      return null;
    } catch (err) {
      const error = err as Error;
      console.error('[DexAggregator] Meteora API 失败:', error.message);
      return null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

/**
 * 套利机会扫描器
 */
export class ArbitrageScanner {
  private aggregator: DexAggregator;
  private minProfitPercent: number;
  private minLiquidity: number;

  constructor(
    connection: Connection,
    minProfitPercent = 0.3,  // 最小 0.3% 价差
    minLiquidity = 10          // 最小 10 SOL 流动性
  ) {
    this.aggregator = new DexAggregator(connection);
    this.minProfitPercent = minProfitPercent;
    this.minLiquidity = minLiquidity;
  }

  /**
   * 扫描单个代币的套利机会
   */
  async scanToken(tokenMint: string, tokenSymbol: string): Promise<ArbitrageOpportunity | null> {
    const prices = await this.aggregator.getAllPrices(tokenMint);

    if (prices.length < 2) {
      return null; // 需要至少 2 个 DEX 有价格
    }

    // 找出最高价和最低价
    let highest = prices[0];
    let lowest = prices[0];

    for (const price of prices) {
      if (price.price > highest.price) highest = price;
      if (price.price < lowest.price) lowest = price;
    }

    // 计算价差
    const priceDiff = ((highest.price - lowest.price) / lowest.price) * 100;

    // 过滤掉小机会
    if (priceDiff < this.minProfitPercent) {
      return null;
    }

    // 过滤掉流动性不足的
    const avgLiquidity = (highest.liquidity + lowest.liquidity) / 2;
    if (avgLiquidity < this.minLiquidity) {
      return null;
    }

    // 估算利润（考虑 0.1% 交易成本）
    const tradingCost = 0.1; // 0.1% 交易成本（滑点 + 手续费）
    const netProfit = priceDiff - tradingCost;

    if (netProfit <= 0) {
      return null;
    }

    // 计算置信度
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (avgLiquidity > 100 && priceDiff > 1.0) {
      confidence = 'HIGH';
    } else if (avgLiquidity > 50 && priceDiff > 0.5) {
      confidence = 'MEDIUM';
    }

    // 估算利润（假设 1 SOL 本金）
    const estimatedProfit = 1 * (netProfit / 100);

    return {
      tokenMint,
      tokenSymbol,
      buyDex: lowest.dex,
      sellDex: highest.dex,
      buyPrice: lowest.price,
      sellPrice: highest.price,
      priceDiff: netProfit,
      estimatedProfit,
      liquidity: avgLiquidity,
      timestamp: Date.now(),
      confidence
    };
  }

  /**
   * 批量扫描多个代币
   */
  async scanBatch(tokens: Array<{ mint: string; symbol: string }>): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const token of tokens) {
      const opp = await this.scanToken(token.mint, token.symbol);
      if (opp) {
        opportunities.push(opp);
        console.log(`[ArbitrageScanner] 发现机会: ${token.symbol}`);
        console.log(`  ${opp.buyDex} (${opp.buyPrice.toFixed(8)}) -> ${opp.sellDex} (${opp.sellPrice.toFixed(8)})`);
        console.log(`  价差: ${opp.priceDiff.toFixed(3)}% | 利润: ${opp.estimatedProfit.toFixed(4)} SOL`);
        console.log(`  流动性: ${opp.liquidity.toFixed(2)} SOL | 置信度: ${opp.confidence}`);
      }

      // 避免速率限制
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // 按利润排序
    opportunities.sort((a, b) => b.estimatedProfit - a.estimatedProfit);

    return opportunities;
  }

  /**
   * 更新扫描参数
   */
  updateParams(minProfitPercent?: number, minLiquidity?: number): void {
    if (minProfitPercent !== undefined) {
      this.minProfitPercent = minProfitPercent;
    }
    if (minLiquidity !== undefined) {
      this.minLiquidity = minLiquidity;
    }
  }

  /**
   * 获取聚合器实例
   */
  getAggregator(): DexAggregator {
    return this.aggregator;
  }
}
