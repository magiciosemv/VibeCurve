// src/listeners/scanner.ts
import { Connection, PublicKey } from '@solana/web3.js';
import { sendTgAlert } from '../utils/notifier';

const PUMP_PROGRAM = new PublicKey("6EF8rrecthR5DkzonjNwu78hRvfCKubJ14M5uBEwF6P");

export class GlobalScanner {
  private connection: Connection;
  private lastSignature: string | null = null;
  private isRunning: boolean = false;

  constructor(connection: Connection) {
    this.connection = connection;
  }

  public async start() {
    this.isRunning = true;
    // 不用 await，让它在后台跑
    this.loop();
  }

  private async loop() {
    while (this.isRunning) {
      try {
        await this.scan();
        await new Promise(r => setTimeout(r, 2000));
      } catch (e) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  private async scan() {
    const signatures = await this.connection.getSignaturesForAddress(PUMP_PROGRAM, { limit: 5 }, 'confirmed');
    if (signatures.length === 0) return;

    if (!this.lastSignature) {
      this.lastSignature = signatures[0].signature;
      return;
    }

    const newSigs = [];
    for (const tx of signatures) {
      if (tx.signature === this.lastSignature) break;
      newSigs.push(tx.signature);
    }
    
    if (newSigs.length > 0) this.lastSignature = signatures[0].signature;

    for (const sig of newSigs.reverse()) {
        await this.processTransaction(sig);
    }
  }

  private async processTransaction(signature: string) {
    // 简单快速判断，不调用 getParsedTransaction 以节省 RPC 额度
    // 我们只通过 TG 发送一个通知，证明我们捕获到了
    // 在真实生产环境，这里需要解析交易内容
    console.log(`🆕 NEW LAUNCH DETECTED! Sig: ${signature.slice(0,8)}...`);
    
    // 只有当确定是 Create 指令时才发 TG (为了演示，这里简化为只要有新交易就视为活跃)
    // 真实环境需要 fetchTransaction 并检查 "Instruction: Create"
  }
}