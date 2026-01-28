/**
 * 真正的 DEX 价格聚合器
 *
 * 核心改进：
 * 1. 只聚合 DEX 价格（Raydium、Orca、Meteora），不聚合 CEX 价格
 * 2. 直接查询链上池子数据，不依赖第三方 API
 * 3. 支持实时价格更新
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('DexPriceAggregator');

/**
 * DEX 价格信息
 */
export interface DexPrice {
  dex: 'raydium' | 'orca' | 'meteora';
  poolAddress: PublicKey;
  price: number;
  liquidity: number;
  volume24h: number;
  timestamp: number;
}

/**
 * 套利机会
 */
export interface ArbitrageOpportunity {
  tokenMint: PublicKey;
  tokenSymbol: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  priceDiff: number;
  estimatedProfit: number;
  liquidity: number;
  timestamp: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * 真正的 DEX 价格聚合器
 */
export class DexPriceAggregator {
  private connection: Connection;
  private cache: Map<string, DexPrice[]> = new Map();
  private cacheTimeout = 5000; // 5 秒缓存

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * 获取代币在所有 DEX 的价格
   */
  async getAllPrices(tokenMint: PublicKey): Promise<DexPrice[]> {
    // 检查缓存
    const cached = this.cache.get(tokenMint.toBase58());
    if (cached && Date.now() - cached[0].timestamp < this.cacheTimeout) {
      return cached;
    }

    const prices: DexPrice[] = [];

    try {
      // 1. 获取 Raydium 价格
      const raydiumPrices = await this.getRaydiumPrices(tokenMint);
      prices.push(...raydiumPrices);

      // 2. 获取 Orca 价格
      const orcaPrices = await this.getOrcaPrices(tokenMint);
      prices.push(...orcaPrices);

      // 3. 获取 Meteora 价格
      const meteoraPrices = await this.getMeteoraPrices(tokenMint);
      prices.push(...meteoraPrices);

      // 更新缓存
      if (prices.length > 0) {
        this.cache.set(tokenMint.toBase58(), prices);
        logger.info(`Total prices fetched: ${prices.length}`);
      }

      return prices;
    } catch (err) {
      const error = err as Error;
      logger.error('获取价格失败:', error);
      return [];
    }
  }

  /**
   * 获取 Raydium 价格
   */
  private async getRaydiumPrices(tokenMint: PublicKey): Promise<DexPrice[]> {
    try {
      // Raydium 程序 ID
      const raydiumProgramId = new PublicKey('srmqPckym1BLr5h3DB1ctRcNkKy3Q7n7L6TnP5sWJq');

      // 查询 Raydium 的所有池子
      const accounts = await this.connection.getProgramAccounts(raydiumProgramId, {
        filters: [
          {
            memcmp: {
              offset: 32, // tokenA 或 tokenB 的偏移量
              bytes: tokenMint.toBase58()
            }
          }
        ]
      });

      const prices: DexPrice[] = [];

      for (const account of accounts) {
        try {
          const poolData = account.account.data;
          const price = this.parseRaydiumPoolPrice(poolData);
          const liquidity = this.parseRaydiumPoolLiquidity(poolData);

          prices.push({
            dex: 'raydium',
            poolAddress: account.pubkey,
            price,
            liquidity,
            volume24h: 0, // TODO: 从链上数据中获取
            timestamp: Date.now()
          });
        } catch (error) {
          // 忽略单个池子的错误
        }
      }

      logger.debug(`Raydium prices fetched: ${prices.length}`);
      return prices;
    } catch (error) {
      logger.error('获取 Raydium 价格失败', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * 获取 Orca 价格
   */
  private async getOrcaPrices(tokenMint: PublicKey): Promise<DexPrice[]> {
    try {
      // Orca 程序 ID
      const orcaProgramId = new PublicKey('whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc');

      // 查询 Orca 的所有池子
      const accounts = await this.connection.getProgramAccounts(orcaProgramId, {
        filters: [
          {
            memcmp: {
              offset: 32, // tokenA 或 tokenB 的偏移量
              bytes: tokenMint.toBase58()
            }
          }
        ]
      });

      const prices: DexPrice[] = [];

      for (const account of accounts) {
        try {
          const poolData = account.account.data;
          const price = this.parseOrcaPoolPrice(poolData);
          const liquidity = this.parseOrcaPoolLiquidity(poolData);

          prices.push({
            dex: 'orca',
            poolAddress: account.pubkey,
            price,
            liquidity,
            volume24h: 0, // TODO: 从链上数据中获取
            timestamp: Date.now()
          });
        } catch (error) {
          // 忽略单个池子的错误
        }
      }

      logger.debug(`Orca prices fetched: ${prices.length}`);
      return prices;
    } catch (error) {
      logger.error('获取 Orca 价格失败', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * 获取 Meteora 价格
   */
  private async getMeteoraPrices(tokenMint: PublicKey): Promise<DexPrice[]> {
    try {
      // Meteora 程序 ID
      const meteoraProgramId = new PublicKey('Eo7WjKq67rjJQSZxS6z3LkapzY3eMj6Xy8X5EQVnZU');

      // 查询 Meteora 的所有池子
      const accounts = await this.connection.getProgramAccounts(meteoraProgramId, {
        filters: [
          {
            memcmp: {
              offset: 32, // tokenA 或 tokenB 的偏移量
              bytes: tokenMint.toBase58()
            }
          }
        ]
      });

      const prices: DexPrice[] = [];

      for (const account of accounts) {
        try {
          const poolData = account.account.data;
          const price = this.parseMeteoraPoolPrice(poolData);
          const liquidity = this.parseMeteoraPoolLiquidity(poolData);

          prices.push({
            dex: 'meteora',
            poolAddress: account.pubkey,
            price,
            liquidity,
            volume24h: 0, // TODO: 从链上数据中获取
            timestamp: Date.now()
          });
        } catch (error) {
          // 忽略单个池子的错误
        }
      }

      logger.debug(`Meteora prices fetched: ${prices.length}`);
      return prices;
    } catch (error) {
      logger.error('获取 Meteora 价格失败', error instanceof Error ? error : new Error(String(error)));
      return [];
    }
  }

  /**
   * 解析 Raydium 池子价格
   */
  private parseRaydiumPoolPrice(poolData: Buffer): number {
    // Raydium 池子数据布局
    // tokenVaultA: offset 384, 8 bytes
    // tokenVaultB: offset 416, 8 bytes
    const tokenVaultABalance = poolData.readBigUInt64LE(384);
    const tokenVaultBBalance = poolData.readBigUInt64LE(416);

    return Number(tokenVaultBBalance) / Number(tokenVaultABalance);
  }

  /**
   * 解析 Raydium 池子流动性
   */
  private parseRaydiumPoolLiquidity(poolData: Buffer): number {
    const tokenVaultABalance = poolData.readBigUInt64LE(384);
    const tokenVaultBBalance = poolData.readBigUInt64LE(416);

    return (Number(tokenVaultABalance) + Number(tokenVaultBBalance)) / 1e9;
  }

  /**
   * 解析 Orca 池子价格
   */
  private parseOrcaPoolPrice(poolData: Buffer): number {
    // Orca 池子数据布局
    // tokenVaultA: offset 192, 8 bytes
    // tokenVaultB: offset 224, 8 bytes
    const tokenVaultABalance = poolData.readBigUInt64LE(192);
    const tokenVaultBBalance = poolData.readBigUInt64LE(224);

    return Number(tokenVaultBBalance) / Number(tokenVaultABalance);
  }

  /**
   * 解析 Orca 池子流动性
   */
  private parseOrcaPoolLiquidity(poolData: Buffer): number {
    const tokenVaultABalance = poolData.readBigUInt64LE(192);
    const tokenVaultBBalance = poolData.readBigUInt64LE(224);

    return (Number(tokenVaultABalance) + Number(tokenVaultBBalance)) / 1e9;
  }

  /**
   * 解析 Meteora 池子价格
   */
  private parseMeteoraPoolPrice(poolData: Buffer): number {
    // Meteora 池子数据布局
    // tokenVaultA: offset 64, 8 bytes
    // tokenVaultB: offset 72, 8 bytes
    const tokenVaultABalance = poolData.readBigUInt64LE(64);
    const tokenVaultBBalance = poolData.readBigUInt64LE(72);

    return Number(tokenVaultBBalance) / Number(tokenVaultABalance);
  }

  /**
   * 解析 Meteora 池子流动性
   */
  private parseMeteoraPoolLiquidity(poolData: Buffer): number {
    const tokenVaultABalance = poolData.readBigUInt64LE(64);
    const tokenVaultBBalance = poolData.readBigUInt64LE(72);

    return (Number(tokenVaultABalance) + Number(tokenVaultBBalance)) / 1e9;
  }

  /**
   * 扫描套利机会
   */
  async scanArbitrageOpportunities(
    tokenMint: PublicKey,
    tokenSymbol: string,
    minProfitPercent: number = 0.3,
    minLiquidity: number = 10
  ): Promise<ArbitrageOpportunity[]> {
    const prices = await this.getAllPrices(tokenMint);

    if (prices.length < 2) {
      return [];
    }

    const opportunities: ArbitrageOpportunity[] = [];

    // 找出最高和最低价格
    let lowestPrice = prices[0];
    let highestPrice = prices[0];

    for (const price of prices) {
      if (price.price < lowestPrice.price) {
        lowestPrice = price;
      }
      if (price.price > highestPrice.price) {
        highestPrice = price;
      }
    }

    // 计算价差
    const priceDiff = ((highestPrice.price - lowestPrice.price) / lowestPrice.price) * 100;

    // 过滤：最小利润
    if (priceDiff < minProfitPercent) {
      return [];
    }

    // 计算预期利润（考虑 0.1% 交易成本）
    const estimatedProfit = lowestPrice.price * priceDiff / 100 * 0.999;

    // 计算总流动性
    const totalLiquidity = (lowestPrice.liquidity + highestPrice.liquidity) / 2;

    // 过滤：最小流动性
    if (totalLiquidity < minLiquidity) {
      return [];
    }

    // 确定置信度
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    if (priceDiff > 1.0 && totalLiquidity > 100) {
      confidence = 'HIGH';
    } else if (priceDiff > 0.5 && totalLiquidity > 50) {
      confidence = 'MEDIUM';
    } else {
      confidence = 'LOW';
    }

    opportunities.push({
      tokenMint,
      tokenSymbol,
      buyDex: lowestPrice.dex,
      sellDex: highestPrice.dex,
      buyPrice: lowestPrice.price,
      sellPrice: highestPrice.price,
      priceDiff,
      estimatedProfit,
      liquidity: totalLiquidity,
      timestamp: Date.now(),
      confidence
    });

    return opportunities;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('缓存已清除');
  }
}

/**
 * 常用代币 Mint 地址
 */
export const TOKEN_MINTS = {
  SOL: new PublicKey('So11111111111111111111111111111111111111112'),
  USDC: new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
  BONK: new PublicKey('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263'),
  WIF: new PublicKey('7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr'),
  RAY: new PublicKey('EKpQGSJtjMFqKZ9KQqMnxEJBkQpFGN6XTWqH5h1YuUuN')
};

/**
 * 代币符号映射
 */
export const TOKEN_SYMBOLS: { [key: string]: string } = {
  'So11111111111111111111111111111111111111112': 'SOL',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 'USDC',
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': 'BONK',
  '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr': 'WIF',
  'EKpQGSJtjMFqKZ9KQqMnxEJBkQpFGN6XTWqH5h1YuUuN': 'RAY'
};
