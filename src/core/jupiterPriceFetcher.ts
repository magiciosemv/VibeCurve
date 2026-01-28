/**
 * Jupiter Price Fetcher
 * 使用 Jupiter API 获取真实的 DEX 价格
 * 通过代理访问，确保在中国网络环境下可用
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from '../utils/logger';

const logger = createLogger('JupiterPriceFetcher');

/**
 * DEX 价格信息
 */
export interface DexPrice {
  dex: string;
  price: number;           // 代币价格（USDC 计价）
  liquidity: number;       // 流动性
  address: string;         // 池地址
  timestamp: number;
  dataSource?: 'Jupiter';  // 数据来源标签
}

/**
 * Jupiter 报价响应
 */
interface JupiterQuoteResponse {
  data?: {
    [key: string]: any;
  };
  routePlan?: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      [key: string]: any;
    };
  }>;
  outAmount?: string;
  [key: string]: any;
}

/**
 * Jupiter Price Fetcher
 */
export class JupiterPriceFetcher {
  private connection: Connection;
  private cache: Map<string, { data: DexPrice[]; expiry: number }> = new Map();
  private readonly CACHE_TTL = 30000; // 30 秒缓存
  private readonly JUPITER_API = 'https://quote-api.jup.ag/v6';

  // 代理配置
  private readonly PROXY_HOST = process.env.HTTP_PROXY_HOST || '192.168.101.105';
  private readonly PROXY_PORT = process.env.HTTP_PROXY_PORT || '7897';
  private readonly PROXY_URL = `http://${this.PROXY_HOST}:${this.PROXY_PORT}`;

  // Axios instance with proxy
  private axiosInstance: any;

  constructor(connection: Connection) {
    this.connection = connection;

    // Create axios instance with proxy agent
    const httpsAgent = new HttpsProxyAgent(this.PROXY_URL);
    this.axiosInstance = axios.create({
      httpsAgent: httpsAgent,
      timeout: 10000,
      headers: {
        'User-Agent': 'VibeCurve/1.0'
      }
    });
  }

  /**
   * 从 Jupiter 获取价格
   */
  async getPrices(inputMint: string, outputMint: string, amount: number = 1000000): Promise<DexPrice[]> {
    const cacheKey = `${inputMint}-${outputMint}`;
    const cached = this.cache.get(cacheKey);

    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    try {
      // 使用 Jupiter Quote API
      const url = `${this.JUPITER_API}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;

      logger.info(`Fetching price from: ${url}`);
      logger.debug(`Using proxy: ${this.PROXY_URL}`);

      // Use axios with proxy
      const response = await this.axiosInstance.get(url);

      const data = response.data as JupiterQuoteResponse;

      if (!data || !data.routePlan || data.routePlan.length === 0) {
        logger.warn('No routes found');
        return [];
      }

      // 解析返回的路由信息
      const prices: DexPrice[] = [];

      for (const route of data.routePlan) {
        const ammKey = route.swapInfo?.ammKey;
        const label = route.swapInfo?.label || 'Unknown';

        if (ammKey) {
          // 计算价格：outputAmount / inputAmount
          const outAmount = parseInt(data.outAmount || '0', 10);
          const price = outAmount / amount;

          prices.push({
            dex: `Jupiter (${label})`,
            price: price,
            liquidity: 100, // Jupiter API 不直接返回流动性，使用默认值
            address: ammKey,
            timestamp: Date.now(),
            dataSource: 'Jupiter'
          });
        }
      }

      // 缓存结果
      this.cache.set(cacheKey, {
        data: prices,
        expiry: Date.now() + this.CACHE_TTL
      });

      logger.info(`Fetched ${prices.length} price(s)`);
      return prices;

    } catch (error) {
      logger.error('Failed to fetch prices', error as Error);
      return [];
    }
  }

  /**
   * 获取 SOL 的价格（以 USDC 计价）
   */
  async getSOLPrice(): Promise<DexPrice[]> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';  // SOL
    const USDC_MINT = 'EPjFWdd5qrtqrep71NU3RXtzmU7CgqkSqwDayWiF';   // USDC

    return await this.getPrices(SOL_MINT, USDC_MINT);
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
export async function testJupiterPriceFetcher(connection: Connection): Promise<void> {
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('Jupiter Price Fetcher - Test Mode');
  logger.info('═══════════════════════════════════════════════════════════');

  const fetcher = new JupiterPriceFetcher(connection);
  const prices = await fetcher.getSOLPrice();

  logger.info('Fetched prices from Jupiter API:');

  if (prices.length === 0) {
    logger.warn('No prices returned from Jupiter API');
    logger.warn('This might be due to:');
    logger.warn('1. Network connectivity issues');
    logger.warn('2. Proxy configuration problems');
    logger.warn('3. Jupiter API rate limiting');
  } else {
    for (const price of prices) {
      logger.info(`DEX: ${price.dex}`);
      logger.info(`Price: ${price.price.toFixed(6)} USDC per SOL`);
      logger.info(`Pool: ${price.address}`);
    }
  }

  logger.info('═══════════════════════════════════════════════════════════');
}
