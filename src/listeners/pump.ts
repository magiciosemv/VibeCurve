import { Connection, PublicKey } from '@solana/web3.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('Pump');

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5DkzonjNwu78hRvfCKubJ14M5uBEwF6P');

export async function startPumpListener(connection: Connection) {
  logger.info("🎧 Mode: Aggressive Polling (Force Processed)...");
  
  let lastSignature: string | null = null;
  let isProcessing = false;
  let staleCounter = 0;

  const poll = async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const signatures = await connection.getSignaturesForAddress(
        PUMP_PROGRAM_ID,
        { limit: 20 },
        // @ts-ignore  <--- 关键在这里：让 TS 忽略下一行的类型检查
        'processed' 
      );

      if (signatures.length === 0) {
          isProcessing = false;
          return;
      }

      const newestTx = signatures[0];

      if (!lastSignature) {
        lastSignature = newestTx.signature;
        logger.info(`✅ Initialized. Locked on: ${lastSignature.slice(0, 10)}...`);
        isProcessing = false;
        return;
      }

      if (newestTx.signature === lastSignature) {
        staleCounter++;
        if (staleCounter % 10 === 0) {
            // 每20秒抱怨一次
            logger.info(`\n💤 RPC Stale x${staleCounter}. No new data...`);
        } else {
            process.stdout.write('.');
        }
        isProcessing = false;
        return;
      }

      // === 发现新数据 ===
      const newTxs = [];
      for (const tx of signatures) {
        if (tx.signature === lastSignature) break;
        newTxs.push(tx);
      }

      lastSignature = newestTx.signature;
      staleCounter = 0;

      logger.info(`\n🚀 [NEW] Found ${newTxs.length} txs!`);
      // 打印最新一笔
      logger.info(`   👉 https://solscan.io/tx/${newTxs[0].signature}`);

    } catch (err) {
      // 忽略网络抖动错误
      process.stdout.write('x');
    } finally {
      isProcessing = false;
    }
  };

  // 间隔设为 2000ms，太快了免费节点处理不过来，反而更容易给缓存
  setInterval(poll, 2000);
}