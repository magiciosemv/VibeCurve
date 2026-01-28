/**
 * Solana 交易解析器
 * 用于识别 Pump.fun / Trends.fun 的真实交易方向
 */

import {
  Connection,
  ParsedTransactionWithMeta,
  PublicKey,
  ParsedAccountData
} from '@solana/web3.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('Parser');

/**
 * 代币余额变化
 */
export interface TokenBalanceChange {
  owner: string;
  mint: string;
  preBalance: number;
  postBalance: number;
  change: number;
  isBuy: boolean; // true = 买入, false = 卖出
  amount: number;
}

/**
 * 解析后的交易信息
 */
export interface ParsedTrade {
  signature: string;
  timestamp: number;
  trader: string;
  tokenMint: string;
  type: 'buy' | 'sell';
  amount: number;
  price?: number; // SOL per token
  valueInSol?: number;
}

/**
 * 从交易的 Token 余额变化中识别买卖方向
 *
 * 核心逻辑：
 * - 如果 SOL 余额减少、Token 余额增加 → BUY
 * - 如果 SOL 余额增加、Token 余额减少 → SELL
 */
export function parseTokenBalances(tx: ParsedTransactionWithMeta): TokenBalanceChange[] {
  if (!tx.meta) return [];

  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];
  const changes: TokenBalanceChange[] = [];

  // 创建 mint -> 预处理余额的映射
  const preBalanceMap = new Map<string, Map<string, number>>();
  preBalances.forEach(pb => {
    const mint = pb.mint;
    const owner = pb.owner;
    const balance = pb.uiTokenAmount?.amount || '0';

    if (!preBalanceMap.has(mint)) {
      preBalanceMap.set(mint, new Map());
    }
    preBalanceMap.get(mint)!.set(owner!, parseFloat(balance) / Math.pow(10, pb.uiTokenAmount?.decimals || 0));
  });

  // 处理后期余额变化
  postBalances.forEach(pb => {
    const mint = pb.mint;
    const owner = pb.owner;
    const postBalance = parseFloat(pb.uiTokenAmount?.amount || '0') / Math.pow(10, pb.uiTokenAmount?.decimals || 0);
    const preBalance = preBalanceMap.get(mint)?.get(owner!) || 0;

    const change = postBalance - preBalance;

    // 忽略微小变化（可能是套利或费用）
    if (Math.abs(change) < 0.01) return;

    changes.push({
      owner: owner!,
      mint,
      preBalance,
      postBalance,
      change,
      isBuy: change > 0,
      amount: Math.abs(change)
    });
  });

  return changes;
}

/**
 * 从交易中提取 SOL 转账信息
 */
export function parseSolTransfers(tx: ParsedTransactionWithMeta): { from: string; to: string; amount: number }[] {
  if (!tx.meta?.preBalances || !tx.meta?.postBalances) return [];

  const transfers = [];
  const preBalances = tx.meta.preBalances;
  const postBalances = tx.meta.postBalances;

  for (let i = 0; i < preBalances.length; i++) {
    const pre = preBalances[i];
    const post = postBalances[i];
    const change = post - pre;

    if (Math.abs(change) > 5000) { // 忽略小于 0.00005 SOL 的转账（约 0.00001 USD）
      const account = tx.transaction.message.accountKeys[i];
      transfers.push({
        from: change > 0 ? 'system' : account.pubkey.toBase58(),
        to: change > 0 ? account.pubkey.toBase58() : 'system',
        amount: Math.abs(change) / Math.pow(10, 9) // 转换为 SOL
      });
    }
  }

  return transfers;
}

/**
 * 完整交易解析
 * 综合分析 SOL 和 Token 余额变化
 */
export function parseTrade(
  tx: ParsedTransactionWithMeta,
  targetMint: PublicKey
): ParsedTrade | null {
  const targetMintStr = targetMint.toBase58();
  const tokenChanges = parseTokenBalances(tx);
  const solTransfers = parseSolTransfers(tx);

  // 找到目标代币的余额变化
  const targetTokenChange = tokenChanges.find(c => c.mint === targetMintStr);
  if (!targetTokenChange) return null;

  // 验证: 买入应该有 SOL 转出，卖出应该有 SOL 转入
  const totalSolOut = solTransfers
    .filter(t => t.to === targetTokenChange.owner)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSolIn = solTransfers
    .filter(t => t.from === targetTokenChange.owner)
    .reduce((sum, t) => sum + t.amount, 0);

  // 逻辑验证
  const isBuy = targetTokenChange.isBuy;
  if (isBuy && totalSolOut < 0.001) {
    logger.warn(`买入信号验证失败: SOL 转出过小 (${totalSolOut})`);
    return null;
  }
  if (!isBuy && totalSolIn < 0.001) {
    logger.warn(`卖出信号验证失败: SOL 转入过小 (${totalSolIn})`);
    return null;
  }

  return {
    signature: tx.transaction.signatures[0],
    timestamp: tx.blockTime || Date.now() / 1000,
    trader: targetTokenChange.owner,
    tokenMint: targetTokenChange.mint,
    type: isBuy ? 'buy' : 'sell',
    amount: targetTokenChange.amount,
    price: isBuy ? totalSolOut / targetTokenChange.amount : totalSolIn / targetTokenChange.amount,
    valueInSol: isBuy ? totalSolOut : totalSolIn
  };
}

/**
 * 批量解析交易（用于历史回测）
 */
export async function parseBatchTrades(
  connection: Connection,
  signatures: string[],
  targetMint: PublicKey
): Promise<ParsedTrade[]> {
  const trades: ParsedTrade[] = [];

  for (const sig of signatures) {
    try {
      const tx = await connection.getParsedTransaction(sig, {
        maxSupportedTransactionVersion: 0
      });
      if (!tx) continue;

      const trade = parseTrade(tx, targetMint);
      if (trade) trades.push(trade);
    } catch (error) {
      logger.error(`Failed to parse ${sig}:`, error as Error);
    }
  }

  return trades;
}

/**
 * 过滤低质量交易
 * 移除可能的套利、自成交等噪音
 */
export function filterNoiseTrades(trades: ParsedTrade[]): ParsedTrade[] {
  // 过滤规则：
  // 1. 移除金额过小的交易（< 0.01 SOL）
  // 2. 移除同一地址的连续对敲
  // 3. 移除已知的套利机器人地址

  const knownBotAddresses = new Set([
    // TODO: 添加已知的套利机器人地址
  ]);

  const filtered = trades.filter(t => {
    if (t.valueInSol && t.valueInSol < 0.01) return false;
    if (knownBotAddresses.has(t.trader)) return false;
    return true;
  });

  // 移除连续对敲（同一地址短时间内买入后又卖出）
  const cleaned: ParsedTrade[] = [];
  const lastTradeByTrader = new Map<string, ParsedTrade>();

  for (const trade of filtered.sort((a, b) => a.timestamp - b.timestamp)) {
    const lastTrade = lastTradeByTrader.get(trade.trader);

    if (lastTrade &&
      lastTrade.type === 'buy' &&
      trade.type === 'sell' &&
      trade.timestamp - lastTrade.timestamp < 10) {
      // 可能是对敲，跳过
      continue;
    }

    cleaned.push(trade);
    lastTradeByTrader.set(trade.trader, trade);
  }

  return cleaned;
}
