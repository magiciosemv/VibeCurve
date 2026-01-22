import { Keypair } from '@solana/web3.js';
import { searcherClient } from 'jito-ts/dist/sdk/block-engine/searcher';
import { config } from '../config';

export class JitoEngine {
  private client: any;
  private keypair: Keypair;
  private engineUrl: string; // 显式定义一个类成员变量

  constructor() {
    this.keypair = config.payer;
    console.log("🛡️ Initializing Jito Block Engine...");
    
    // 1. 处理 URL
    let rawUrl = config.jito.blockEngineUrl || 'amsterdam.mainnet.block-engine.jito.wtf';
    rawUrl = rawUrl.replace('https://', '').replace('http://', '');
    
    if (!rawUrl.includes(':')) {
        rawUrl = `${rawUrl}:443`; 
    }

    this.engineUrl = rawUrl; // 赋值给类成员
    
    console.log(`   🔑 Auth Key: ${this.keypair.publicKey.toBase58()}`);
    console.log(`   ww Engine URL: ${this.engineUrl} (Formatted)`);
  }

  public getClient() {
    if (this.client) return this.client;

    try {
      this.client = searcherClient(
        this.engineUrl, // 这里现在是一个确定存在的 string
        this.keypair
      );
      return this.client;
    } catch (e) {
      console.error("   ❌ Jito Connection Failed:", e);
      return null;
    }
  }

  public async sendBundle(txs: any[]) {
    // 占位
  }
}

export const jitoEngine = new JitoEngine();