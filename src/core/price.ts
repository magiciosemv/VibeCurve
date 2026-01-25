/**
 * 价格获取模块
 * 支持多种数据源：
 * 1. Jupiter API (推荐) - 实时价格和流动性
 * 2. Raydium LP Pool - 直接读取池子状态
 * 3. CoinGecko API - 作为备用
 */

import axios from 'axios';
import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { config } from '../config';

/**
 * 代币价格信息
 */
export interface TokenPrice {
  price: number;           // 当前价格（SOL 计价）
  liquidity: number;       // 流动性（SOL）
  volume24h: number;       // 24小时交易量
  change24h: number;       // 24小时价格变化
  priceSource: 'jupiter' | 'raydium' | 'coingecko';
}

/**
 * 从 Jupiter API 获取价格
 * API 文档: https://station.jup.ag/docs/apis/price-api
 */
export async function getPriceFromJupiter(tokenMint: string): Promise<TokenPrice | null> {
  try {
    const response = await axios.get('https://price.jup.ag/v6/price', {
      params: {
        ids: tokenMint
      },
      timeout: 5000
    });

    const data = response.data.data[tokenMint];
    if (!data) return null;

    return {
      price: data.price,
      liquidity: 0, // Jupiter API 不提供流动性，需要单独查询
      volume24h: 0,
      change24h: 0,
      priceSource: 'jupiter'
    };
  } catch (error) {
    console.error(`[Price] Jupiter API error:`, error.message);
    return null;
  }
}

/**
 * 从 Raydium LP Pool 获取价格和流动性
 * 这需要知道 Pool 地址，可以通过 Raydium SDK 获取
 */
export async function getPriceFromRaydium(
  connection: Connection,
  poolAddress: PublicKey
): Promise<TokenPrice | null> {
  try {
    const poolAccount = await connection.getAccountInfo(poolAddress);
    if (!poolAccount) return null;

    // 解析 Raydium Pool 数据结构
    // 注意：这是简化版本，实际需要根据 Raydium 的 Pool 结构解析
    // 建议使用 @raydium-io/raydium-sdk

    return {
      price: 0, // 需要解析 pool 数据
      liquidity: 0,
      volume24h: 0,
      change24h: 0,
      priceSource: 'raydium'
    };
  } catch (error) {
    console.error(`[Price] Raydium error:`, error.message);
    return null;
  }
}

/**
 * 智能价格获取器
 * 按优先级尝试多个数据源
 */
export async function getTokenPrice(tokenMint: string): Promise<TokenPrice | null> {
  // 优先使用 Jupiter API（最快最准）
  let price = await getPriceFromJupiter(tokenMint);
  if (price) return price;

  // 备用方案：从链上获取（较慢）
  // TODO: 实现 Raydium LP 查询

  console.warn(`[Price] Failed to get price for ${tokenMint}`);
  return null;
}

/**
 * 计算价格变化趋势
 * 返回: 'up' | 'down' | 'sideways'
 */
export function getPriceTrend(prices: number[]): 'up' | 'down' | 'sideways' {
  if (prices.length < 3) return 'sideways';

  const recent = prices.slice(-5);
  const first = recent[0];
  const last = recent[recent.length - 1];
  const change = (last - first) / first;

  if (change > 0.02) return 'up';      // 上涨超过 2%
  if (change < -0.02) return 'down';   // 下跌超过 2%
  return 'sideways';                   // 震荡
}

/**
 * 计算价格波动率（用于风险评估）
 */
export function getPriceVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;

  const returns = [];
  for (let i = 1; i < prices.length; i++) {
    const ret = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(ret);
  }

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;

  return Math.sqrt(variance) * Math.sqrt(365); // 年化波动率
}
