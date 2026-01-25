/**
 * 交易执行引擎
 * 集成 Jupiter Aggregator 实现最优路径交易
 * 支持单次交易和批量交易
 */

import axios from 'axios';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  SystemProgram,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import { config } from '../config';
import { JitoEngine } from './jito';

/**
 * 代币定义
 */
export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

/**
 * 交易参数
 */
export interface TradeParams {
  inputMint: string;        // 输入代币地址
  outputMint: string;       // 输出代币地址
  amount: number;           // 金额（以最小单位计算）
  slippageBps?: number;     // 滑点容忍度（基点，100 = 1%）
  onlyDirectRoutes?: boolean; // 是否仅使用直接路由
  asLegacyTransaction?: boolean; // 是否使用旧版交易格式
}

/**
 * 交易报价
 */
export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
  contextSlot?: number;
  timeTaken?: number;
  asLegacyTransaction?: boolean;
}

/**
 * 交易执行结果
 */
export interface TradeResult {
  signature: string;
  success: boolean;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  fee: number;
  error?: string;
}

/**
 * 交易执行器类
 */
export class TradeExecutor {
  private connection: Connection;
  private wallet: Keypair;
  private jitoEngine?: JitoEngine;
  private useJito: boolean;

  constructor(connection: Connection, wallet: Keypair, useJito = false) {
    this.connection = connection;
    this.wallet = wallet;
    this.useJito = useJito;

    if (useJito) {
      this.jitoEngine = new JitoEngine();
    }
  }

  /**
   * 获取交易报价
   */
  async getQuote(params: TradeParams): Promise<QuoteResponse | null> {
    try {
      const response = await axios.get('https://quote-api.jup.ag/v6/quote', {
        params: {
          inputMint: params.inputMint,
          outputMint: params.outputMint,
          amount: params.amount.toString(),
          slippageBps: params.slippageBps || 300, // 默认 3% 滑点
          onlyDirectRoutes: params.onlyDirectRoutes || false,
          asLegacyTransaction: params.asLegacyTransaction || false
        },
        timeout: 10000
      });

      return response.data;
    } catch (err) {
      const error = err as Error;
      console.error('[Executor] 获取报价失败:', error.message);
      return null;
    }
  }

  /**
   * 获取交易费用估算
   */
  async getSwapFee(params: TradeParams): Promise<number> {
    const quote = await this.getQuote(params);
    if (!quote) return 0;

    // 计算总费用（所有路由的费用之和）
    let totalFee = 0;
    for (const route of quote.routePlan) {
      totalFee += parseFloat(route.swapInfo.feeAmount);
    }

    return totalFee;
  }

  /**
   * 构建交易
   */
  async buildSwapTransaction(
    quoteResponse: QuoteResponse,
    userPublicKey: string
  ): Promise<Transaction | VersionedTransaction | null> {
    try {
      const response = await axios.post('https://quote-api.jup.ag/v6/swap', {
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 10000 // 优先费用
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const swapTransaction = response.data.swapTransaction;

      // 反序列化交易
      if (quoteResponse.asLegacyTransaction) {
        return Transaction.from(Buffer.from(swapTransaction, 'base64'));
      } else {
        return VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
      }
    } catch (err) {
      const error = err as Error;
      console.error('[Executor] 构建交易失败:', error.message);
      return null;
    }
  }

  /**
   * 执行交易
   */
  async executeTrade(params: TradeParams): Promise<TradeResult> {
    try {
      console.log(`[Executor] 准备执行交易:`);
      console.log(`  输入: ${params.inputMint}`);
      console.log(`  输出: ${params.outputMint}`);
      console.log(`  数量: ${params.amount}`);

      // 1. 获取报价
      const quote = await this.getQuote(params);
      if (!quote) {
        return {
          signature: '',
          success: false,
          inputAmount: 0,
          outputAmount: 0,
          priceImpact: 0,
          fee: 0,
          error: '无法获取报价'
        };
      }

      console.log(`[Executor] 报价成功:`);
      console.log(`  输入: ${quote.inAmount}`);
      console.log(`  输出: ${quote.outAmount}`);
      console.log(`  价格影响: ${this.calculatePriceImpact(quote)}`);

      // 2. 构建交易
      const transaction = await this.buildSwapTransaction(
        quote,
        this.wallet.publicKey.toBase58()
      );

      if (!transaction) {
        return {
          signature: '',
          success: false,
          inputAmount: parseFloat(quote.inAmount),
          outputAmount: 0,
          priceImpact: 0,
          fee: 0,
          error: '构建交易失败'
        };
      }

      // 3. 签名交易
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([this.wallet]);
      } else {
        transaction.sign(this.wallet);
      }

      // 4. 发送交易
      let signature: string;
      if (this.useJito && this.jitoEngine) {
        // 使用 Jito Bundle (只支持 VersionedTransaction)
        let versionedTx: VersionedTransaction;
        if (transaction instanceof VersionedTransaction) {
          versionedTx = transaction;
        } else {
          // 如果是 legacy transaction，需要转换（这里简化处理）
          throw new Error('Jito bundles 仅支持 VersionedTransaction');
        }

        const result = await this.jitoEngine.sendBundle([versionedTx]);
        if (!result.success) {
          throw new Error(`Jito bundle 失败: ${result.error || '未知错误'}`);
        }
        signature = result.bundleId;
      } else {
        // 使用普通 RPC
        const serialized = transaction.serialize();
        signature = await this.connection.sendRawTransaction(serialized, {
          skipPreflight: false,
          maxRetries: 3
        });
      }

      console.log(`[Executor] 交易已发送: ${signature}`);

      // 5. 等待确认
      const confirmation = await this.connection.confirmTransaction(
        signature,
        'confirmed'
      );

      if (confirmation.value.err) {
        throw new Error(`交易失败: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`[Executor] 交易已确认`);

      return {
        signature,
        success: true,
        inputAmount: parseFloat(quote.inAmount),
        outputAmount: parseFloat(quote.outAmount),
        priceImpact: this.calculatePriceImpact(quote),
        fee: await this.getSwapFee(params)
      };

    } catch (err) {
      const error = err as Error;
      console.error('[Executor] 交易执行失败:', error.message);
      return {
        signature: '',
        success: false,
        inputAmount: 0,
        outputAmount: 0,
        priceImpact: 0,
        fee: 0,
        error: error.message
      };
    }
  }

  /**
   * 计算价格影响
   */
  private calculatePriceImpact(quote: QuoteResponse): number {
    const inputAmount = parseFloat(quote.inAmount);
    const outputAmount = parseFloat(quote.outAmount);
    const threshold = parseFloat(quote.otherAmountThreshold);

    if (outputAmount > threshold) {
      return 0; // 价格影响为正（滑点容忍范围内）
    }

    return ((threshold - outputAmount) / threshold) * 100;
  }

  /**
   * 批量执行交易（用于测试或套利）
   */
  async executeBatchTrades(trades: TradeParams[]): Promise<TradeResult[]> {
    const results: TradeResult[] = [];

    for (const trade of trades) {
      const result = await this.executeTrade(trade);
      results.push(result);

      // 如果失败，停止后续交易
      if (!result.success) {
        console.error('[Executor] 批量交易中断');
        break;
      }

      // 等待 1 秒避免速率限制
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * 计算最小输出数量（考虑滑点）
   */
  static calculateMinOutput(outAmount: string, slippageBps: number): string {
    const amount = parseFloat(outAmount);
    const minOutput = amount * (1 - slippageBps / 10000);
    return minOutput.toString();
  }
}

/**
 * SOL 买入代币
 */
export async function buyToken(
  executor: TradeExecutor,
  tokenMint: string,
  solAmount: number,
  slippageBps = 300
): Promise<TradeResult> {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  const params: TradeParams = {
    inputMint: SOL_MINT,
    outputMint: tokenMint,
    amount: solAmount * LAMPORTS_PER_SOL,
    slippageBps
  };

  return executor.executeTrade(params);
}

/**
 * 卖出代币换取 SOL
 */
export async function sellToken(
  executor: TradeExecutor,
  tokenMint: string,
  tokenAmount: number,
  tokenDecimals: number,
  slippageBps = 300
): Promise<TradeResult> {
  const SOL_MINT = 'So11111111111111111111111111111111111111112';

  const params: TradeParams = {
    inputMint: tokenMint,
    outputMint: SOL_MINT,
    amount: tokenAmount * Math.pow(10, tokenDecimals),
    slippageBps
  };

  return executor.executeTrade(params);
}
