import { Keypair, VersionedTransaction } from '@solana/web3.js';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';
import { Bundle } from 'jito-ts/dist/sdk/block-engine/types';
import { config } from '../config';

/**
 * Jito Bundle 发送结果
 */
export interface BundleResult {
  bundleId: string;
  success: boolean;
  confirmed: boolean;
  slot?: number;
  error?: string;
}

export class JitoEngine {
  private client: any;
  private keypair: Keypair;
  private engineUrl: string;
  private tipLamports: number;

  constructor(tipLamports = 0.001 * 1e9) {
    this.keypair = config.payer;
    this.tipLamports = tipLamports;

    console.log('[Jito] Initializing Jito Block Engine...');

    let rawUrl = config.jito.blockEngineUrl || 'amsterdam.mainnet.block-engine.jito.wtf';
    rawUrl = rawUrl.replace('https://', '').replace('http://', '');

    if (!rawUrl.includes(':')) {
      rawUrl = `${rawUrl}:443`;
    }

    this.engineUrl = rawUrl;

    console.log(`   Auth Key: ${this.keypair.publicKey.toBase58()}`);
    console.log(`   Engine URL: ${this.engineUrl}`);
  }

  public getClient() {
    if (this.client) return this.client;

    try {
      this.client = searcherClient(
        this.engineUrl,
        this.keypair
      );
      return this.client;
    } catch (e) {
      console.error('[Jito] Connection Failed:', e);
      return null;
    }
  }

  /**
   * 发送 Jito Bundle
   *
   * @param txs - 交易数组（必须是 VersionedTransaction）
   * @param tipLamports - 小费金额（lamports），默认 0.001 SOL
   * @returns Bundle 结果
   */
  public async sendBundle(
    txs: VersionedTransaction[],
    tipLamports?: number
  ): Promise<BundleResult> {
    const client = this.getClient();
    if (!client) {
      return {
        bundleId: '',
        success: false,
        confirmed: false,
        error: 'Jito client not initialized'
      };
    }

    try {
      const tip = tipLamports || this.tipLamports;
      console.log(`[Jito] Preparing bundle with ${txs.length} transactions`);
      console.log(`[Jito] Tip amount: ${tip / 1e9} SOL`);

      // 创建 Bundle（只支持 VersionedTransaction）
      const bundle = new Bundle(txs, 3);

      // 添加小费交易（使用默认的 tip receiver 和 blockhash）
      // 注意：jito-ts 的 addTipTx 签名可能因版本而异
      try {
        // 尝试使用 2 参数版本
        (bundle as any).addTipTx(this.keypair, tip);
      } catch (e) {
        // 如果失败，尝试使用 4 参数版本
        try {
          (bundle as any).addTipTx(this.keypair, tip, undefined, undefined);
        } catch (e2) {
          console.warn('[Jito] addTipTx failed, continuing without tip:', e2);
        }
      }

      // 发送 Bundle
      console.log('[Jito] Sending bundle...');
      const bundleId = await client.sendBundle(bundle);

      console.log(`[Jito] Bundle sent: ${bundleId}`);

      // 等待确认
      const status = await this.getBundleStatus(bundleId);

      return {
        bundleId,
        success: true,
        confirmed: status.confirmed,
        slot: status.slot
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[Jito] Bundle send failed:', errorMessage);
      return {
        bundleId: '',
        success: false,
        confirmed: false,
        error: errorMessage
      };
    }
  }

  /**
   * 获取 Bundle 状态
   */
  public async getBundleStatus(bundleId: string): Promise<{
    confirmed: boolean;
    slot?: number;
    error?: string;
  }> {
    const client = this.getClient();
    if (!client) {
      return { confirmed: false, error: 'Jito client not initialized' };
    }

    try {
      // 轮询检查状态（最多等待 30 秒）
      for (let i = 0; i < 30; i++) {
        const status = await client.getBundleStatus(bundleId);

        if (status) {
          if (status.confirmed) {
            console.log(`[Jito] Bundle confirmed in slot: ${status.slot}`);
            return { confirmed: true, slot: status.slot };
          }

          if (status.errors && status.errors.length > 0) {
            console.error('[Jito] Bundle errors:', status.errors);
            return {
              confirmed: false,
              error: status.errors[0].toString()
            };
          }
        }

        // 等待 1 秒后重试
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 超时
      return {
        confirmed: false,
        error: 'Bundle confirmation timeout'
      };

    } catch (err) {
      const error = err as Error;
      console.error('[Jito] Get bundle status failed:', error.message);
      return {
        confirmed: false,
        error: error.message
      };
    }
  }

  /**
   * 计算最优小费金额
   * 根据网络拥堵情况动态调整
   */
  public calculateOptimalTip(): number {
    // TODO: 实现动态小费计算
    // 可以查询 Jito 的tip账户余额来估算网络拥堵
    return this.tipLamports;
  }

  /**
   * 检查 Bundle 是否仍在内存池中
   */
  public async isInMempool(bundleId: string): Promise<boolean> {
    const status = await this.getBundleStatus(bundleId);
    return !status.confirmed && !status.error;
  }
}

export const jitoEngine = new JitoEngine();