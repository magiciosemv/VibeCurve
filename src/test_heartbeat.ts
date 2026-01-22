// src/test_heartbeat.ts
import { Connection } from '@solana/web3.js';
import { config } from './config';

async function testHeartbeat() {
  console.log("💓 Initiating Helius Heartbeat Check...");
  console.log(`🔌 Endpoint: ${config.wssUrl}`);

  const connection = new Connection(config.rpcUrl, {
    wsEndpoint: config.wssUrl,
    commitment: 'confirmed'
  });

  console.log("⏳ Connecting...");

  // 测试 1: 监听 Slot (区块高度) 变化
  // 这是最基础的 WebSocket 功能，如果这个不行，说明 WSS 彻底不通
  const slotSubId = connection.onSlotChange((slotInfo) => {
    console.log(`💓 [HEARTBEAT] New Slot: ${slotInfo.slot} | Parent: ${slotInfo.parent}`);
  });

  console.log(`✅ Listening for Slots (Sub ID: ${slotSubId})... Waiting 10 seconds...`);

  // 保持运行 10 秒
  setTimeout(async () => {
    console.log("🛑 Test finished. Removing listener.");
    await connection.removeSlotChangeListener(slotSubId);
    process.exit(0);
  }, 10000);
}

testHeartbeat().catch(console.error);