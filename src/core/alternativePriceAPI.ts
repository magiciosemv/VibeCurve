/**
 * 备用价格数据源
 * 当 CoinGecko 速率限制时使用
 */

import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from '../utils/logger';

const logger = createLogger('AlternativePriceAPI');

/**
 * 备用价格 API 提供商
 */
class AlternativePriceAPI {
  private proxyUrl = 'http://192.168.101.105:7897';
  private axiosInstance: any;

  constructor() {
    const httpsAgent = new HttpsProxyAgent(this.proxyUrl);
    this.axiosInstance = axios.create({
      httpsAgent,
      timeout: 10000,
      headers: { 'User-Agent': 'VibeCurve/1.0' }
    });
  }

  /**
   * 方案 1: Binance API（最稳定，无需 API Key）
   */
  async getBinancePrice(symbol: string): Promise<number | null> {
    try {
      // Binance 交易对格式: SOLUSDT, BONKUSDT, etc.
      const ticker = symbol.toUpperCase() + 'USDT';
      const url = `https://api.binance.com/api/v3/ticker/price?symbol=${ticker}`;

      const response = await this.axiosInstance.get(url);
      return parseFloat(response.data.price);
    } catch (error) {
      logger.error(`Failed to fetch ${symbol}`, error as Error);
      return null;
    }
  }

  /**
   * 方案 2: CryptoCompare API（免费，需注册）
   */
  async getCryptoComparePrice(symbol: string): Promise<number | null> {
    try {
      const url = `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD`;

      const response = await this.axiosInstance.get(url);
      return response.data.USD;
    } catch (error) {
      logger.error(`Failed to fetch ${symbol}`, error as Error);
      return null;
    }
  }

  /**
   * 方案 3: CoinMarketCap（需要 API Key）
   */
  async getCoinMarketCapPrice(symbol: string): Promise<number | null> {
    try {
      const apiKey = process.env.COINMARKETCAP_API_KEY; // 需要在 .env 中配置
      if (!apiKey) {
        logger.warn('No API key found');
        return null;
      }

      const url = 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest';
      const response = await this.axiosInstance.get(url, {
        headers: { 'X-CMC_PRO_API_KEY': apiKey },
        params: { symbol: symbol }
      });

      return response.data.data[symbol].quote.USD.price;
    } catch (error) {
      logger.error(`Failed to fetch ${symbol}`, error as Error);
      return null;
    }
  }

  /**
   * 方案 4: Jupiter Quote API（直接使用，无需代理）
   */
  async getJupiterPrice(inputMint: string, outputMint: string = 'USDC'): Promise<number | null> {
    try {
      // 不使用代理，直接连接
      const directClient = axios.create({
        timeout: 10000
      });

      const amount = 1000000; // 1 SOL (9 decimals)
      const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=EPjFWdd5qrtqrep71NU3RXtzmU7CgqkSqwDayWiF&amount=${amount}`;

      const response = await directClient.get(url);
      const outAmount = parseInt(response.data.outAmount || '0', 10);
      const price = outAmount / amount;

      return price;
    } catch (error) {
      logger.error('Failed to fetch price', error as Error);
      return null;
    }
  }

  /**
   * 智能获取价格：自动尝试多个数据源
   */
  async getPrice(symbol: string, mint?: string): Promise<{ price: number; source: string } | null> {
    logger.info(`Fetching price for ${symbol}...`);

    // 尝试 Binance
    const binancePrice = await this.getBinancePrice(symbol);
    if (binancePrice) {
      logger.info(`Got price from Binance: $${binancePrice}`);
      return { price: binancePrice, source: 'Binance' };
    }

    // 尝试 Jupiter（如果有 mint 地址）
    if (mint) {
      const jupPrice = await this.getJupiterPrice(mint);
      if (jupPrice) {
        logger.info(`Got price from Jupiter: $${jupPrice}`);
        return { price: jupPrice, source: 'Jupiter' };
      }
    }

    // 尝试 CryptoCompare
    const ccPrice = await this.getCryptoComparePrice(symbol);
    if (ccPrice) {
      logger.info(`Got price from CryptoCompare: $${ccPrice}`);
      return { price: ccPrice, source: 'CryptoCompare' };
    }

    logger.error(`All sources failed for ${symbol}`);
    return null;
  }
}

export { AlternativePriceAPI };
