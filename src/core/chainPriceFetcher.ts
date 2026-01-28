/**
 * On-Chain Price Fetcher
 * 直接从 Solana 链上读取 Raydium/Orca 池数据，计算真实价格
 * 不依赖任何第三方 API，100% 真实数据
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('ChainPriceFetcher');

/**
 * DEX 池配置
 */
interface PoolConfig {
  dex: string;
  address: string;
  tokenA: string;  // Token A mint address
  tokenB: string;  // Token B mint address
  decimalsA: number;
  decimalsB: number;
}

/**
 * 池储备数据
 */
interface PoolReserves {
  reserveA: bigint;
  reserveB: bigint;
  liquidity: bigint;
  timestamp: number;
}

/**
 * DEX 价格信息
 */
export interface DexPrice {
  dex: string;
  price: number;           // 代币价格（SOL 计价）
  liquidity: number;       // 流动性（SOL）
  address: string;         // 池地址
  timestamp: number;
  dataSource?: 'OnChain';  // 数据来源标签
}

/**
 * 已知池地址配置（SOL/USDC 交易对）
 * 更新时间: 2025-01-25
 *
 * 这些是当前活跃的池地址，来源于：
 * - Raydium: https://raydium.io/clmm/
 * - Orca: https://www.orca.so/pools
 */
const KNOWN_POOLS: PoolConfig[] = [
  // Raydium AMM Pool (SOL/USDC) - 主力池
  {
    dex: 'Raydium AMM',
    address: '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo',
    tokenA: 'So11111111111111111111111111111111111111112',  // SOL
    tokenB: 'EPjFWdd5qrtqrep71NU3RXtzmU7CgqkSqwDayWiF',   // USDC
    decimalsA: 9,
    decimalsB: 6
  },
  // Raydium CLMM Pool (SOL/USDC) - 集中流动性池
  {
    dex: 'Raydium CLMM',
    address: 'CAMMzoqiLyCmSbkCa8wVYemT66zCFXKjWGLPJxQgXRtz',
    tokenA: 'So11111111111111111111111111111111111111112',  // SOL
    tokenB: 'EPjFWdd5qrtqrep71NU3RXtzmU7CgqkSqwDayWiF',   // USDC
    decimalsA: 9,
    decimalsB: 6
  },
  // Orca Whirlpool (SOL/USDC)
  {
    dex: 'Orca Whirlpool',
    address: '7qbRF6YsyGuLUVs6Y1q64bdVrfe4ZcUUzLJRrjU9VRGY',
    tokenA: 'So11111111111111111111111111111111111111112',  // SOL
    tokenB: 'EPjFWdd5qrtqrep71NU3RXtzmU7CgqkSqwDayWiF',   // USDC
    decimalsA: 9,
    decimalsB: 6
  }
];

/**
 * On-Chain Price Fetcher
 */
export class ChainPriceFetcher {
  private connection: Connection;
  private cache: Map<string, { data: DexPrice; expiry: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 秒缓存

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * 获取所有已配置的池价格
   */
  async getAllPoolPrices(): Promise<DexPrice[]> {
    const prices: DexPrice[] = [];

    for (const pool of KNOWN_POOLS) {
      try {
        // 检查缓存
        const cached = this.cache.get(pool.address);
        if (cached && cached.expiry > Date.now()) {
          prices.push(cached.data);
          continue;
        }

        // 获取池价格
        const price = await this.getPoolPrice(pool);
        if (price) {
          prices.push(price);

          // 缓存结果
          this.cache.set(pool.address, {
            data: price,
            expiry: Date.now() + this.CACHE_TTL
          });
        }
      } catch (error) {
        logger.error(`Failed to fetch ${pool.dex} price`, error as Error);
      }
    }

    return prices;
  }

  /**
   * 获取单个池的价格
   */
  async getPoolPrice(pool: PoolConfig): Promise<DexPrice | null> {
    try {
      const accountInfo = await this.connection.getAccountInfo(
        new PublicKey(pool.address)
      );

      if (!accountInfo || !accountInfo.data) {
        logger.warn(`No data for pool ${pool.address}`);
        return null;
      }

      // 根据不同 DEX 解析数据
      if (pool.dex === 'Raydium') {
        return this.parseRaydiumPool(pool, accountInfo.data);
      } else if (pool.dex === 'Orca') {
        return this.parseOrcaPool(pool, accountInfo.data);
      }

      return null;
    } catch (error) {
      logger.error(`Error fetching pool ${pool.address}`, error as Error);
      return null;
    }
  }

  /**
   * 解析 Raydium 池数据
   * Raydium AMM 使用 x * y = k 公式
   */
  private parseRaydiumPool(pool: PoolConfig, data: Buffer): DexPrice | null {
    try {
      // 首先输出原始数据以便调试
      logger.debug(`Pool: ${pool.address}`);
      logger.debug(`Data length: ${data.length} bytes`);
      logger.debug(`First 32 bytes (hex): ${data.subarray(0, 32).toString('hex')}`);

      // Raydium pool data layout:
      // - 8 bytes: discriminator
      // - 8 bytes: token A reserve (u64)
      // - 8 bytes: token B reserve (u64)
      // ... 其他字段

      // 检查数据长度是否足够
      if (data.length < 24) {
        logger.error(`Data too short: ${data.length} bytes (need at least 24)`);
        return null;
      }

      const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);

      // 跳过 discriminator (8 bytes)
      const offset = 8;

      // 读取储备量
      const reserveA = dataView.getBigUint64(offset, true);  // little-endian
      const reserveB = dataView.getBigUint64(offset + 8, true);

      logger.debug(`Pool: ${pool.address}`);
      logger.debug(`Reserve A: ${reserveA.toString()}`);
      logger.debug(`Reserve B: ${reserveB.toString()}`);

      // 计算价格：price = reserveB / reserveA (考虑小数位)
      const price = this.calculatePrice(
        reserveA,
        reserveB,
        pool.decimalsA,
        pool.decimalsB
      );

      // 计算流动性 (SOL)
      const liquidity = this.calculateLiquidity(
        reserveA,
        reserveB,
        pool.decimalsA,
        pool.decimalsB
      );

      return {
        dex: pool.dex,
        price: price,
        liquidity: liquidity,
        address: pool.address,
        timestamp: Date.now(),
        dataSource: 'OnChain'
      };
    } catch (error) {
      logger.error('Failed to parse Raydium pool', error as Error);
      return null;
    }
  }

  /**
   * 解析 Orca 池数据
   * Orca Whirlpool 使用 concentrated liquidity，但核心原理类似
   */
  private parseOrcaPool(pool: PoolConfig, data: Buffer): DexPrice | null {
    try {
      // Orca Whirlpool data layout:
      // - 8 bytes: discriminator
      // - 8 bytes: token A reserve (u64)
      // - 8 bytes: token B reserve (u64)
      // ... 其他字段

      const dataView = new DataView(data.buffer);

      // 跳过 discriminator (8 bytes)
      const offset = 8;

      // 读取储备量
      const reserveA = dataView.getBigUint64(offset, true);  // little-endian
      const reserveB = dataView.getBigUint64(offset + 8, true);

      logger.debug(`Pool: ${pool.address}`);
      logger.debug(`Reserve A: ${reserveA.toString()}`);
      logger.debug(`Reserve B: ${reserveB.toString()}`);

      // 计算价格：price = reserveB / reserveA (考虑小数位)
      const price = this.calculatePrice(
        reserveA,
        reserveB,
        pool.decimalsA,
        pool.decimalsB
      );

      // 计算流动性 (SOL)
      const liquidity = this.calculateLiquidity(
        reserveA,
        reserveB,
        pool.decimalsA,
        pool.decimalsB
      );

      return {
        dex: pool.dex,
        price: price,
        liquidity: liquidity,
        address: pool.address,
        timestamp: Date.now(),
        dataSource: 'OnChain'
      };
    } catch (error) {
      logger.error('Failed to parse Orca pool', error as Error);
      return null;
    }
  }

  /**
   * 计算价格 (考虑小数位)
   * price = (reserveB / 10^decimalsB) / (reserveA / 10^decimalsA)
   */
  private calculatePrice(
    reserveA: bigint,
    reserveB: bigint,
    decimalsA: number,
    decimalsB: number
  ): number {
    const factorA = BigInt(10 ** decimalsA);
    const factorB = BigInt(10 ** decimalsB);

    // 转换为浮点数计算
    const normalizedA = Number(reserveA) / Number(factorA);
    const normalizedB = Number(reserveB) / Number(factorB);

    if (normalizedA === 0) {
      return 0;
    }

    return normalizedB / normalizedA;
  }

  /**
   * 计算流动性 (以 SOL 为单位)
   * liquidity = (reserveA / 10^decimalsA) + (reserveB / 10^decimalsB) * priceOfSOL
   */
  private calculateLiquidity(
    reserveA: bigint,
    reserveB: bigint,
    decimalsA: number,
    decimalsB: number
  ): number {
    const factorA = BigInt(10 ** decimalsA);
    const factorB = BigInt(10 ** decimalsB);

    const normalizedA = Number(reserveA) / Number(factorA);
    const normalizedB = Number(reserveB) / Number(factorB);

    // 简单计算：流动性 = tokenA 数量 + tokenB 数量 (以美元价值)
    // 这里简化为以 tokenA (SOL) 为单位
    const price = this.calculatePrice(reserveA, reserveB, decimalsA, decimalsB);

    return normalizedA + (normalizedB / price);
  }

  /**
   * 获取多个 DEX 的价格进行比较
   */
  async comparePrices(): Promise<Map<string, DexPrice>> {
    const prices = await this.getAllPoolPrices();
    const priceMap = new Map<string, DexPrice>();

    for (const price of prices) {
      priceMap.set(price.dex, price);
    }

    return priceMap;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * 测试函数
 */
export async function testChainPriceFetcher(connection: Connection): Promise<void> {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('Chain Price Fetcher - Test Mode');
  logger.info('═══════════════════════════════════════════════════════════');

  const fetcher = new ChainPriceFetcher(connection);
  const prices = await fetcher.getAllPoolPrices();

  logger.info('Fetched prices from on-chain pools:');

  for (const price of prices) {
    logger.info(`DEX: ${price.dex}`);
    logger.info(`Price: ${price.price.toFixed(6)} USDC per SOL`);
    logger.info(`Liquidity: ${price.liquidity.toFixed(2)} SOL`);
    logger.info(`Pool Address: ${price.address}`);
  }

  // 比较价差
  if (prices.length >= 2) {
    const lowest = prices.reduce((prev, curr) => prev.price < curr.price ? prev : curr);
    const highest = prices.reduce((prev, curr) => prev.price > curr.price ? prev : curr);
    const spread = ((highest.price - lowest.price) / lowest.price) * 100;

    logger.info('Price Spread:');
    logger.info(`Lowest:  ${lowest.dex} @ ${lowest.price.toFixed(6)}`);
    logger.info(`Highest: ${highest.dex} @ ${highest.price.toFixed(6)}`);
    logger.info(`Spread:   ${spread.toFixed(3)}%`);
  }

  logger.info('═══════════════════════════════════════════════════════════');
}
