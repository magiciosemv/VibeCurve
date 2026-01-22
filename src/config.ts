import dotenv from 'dotenv';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

dotenv.config();

export const config = {
  rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  wssUrl: process.env.WSS_URL || 'wss://api.mainnet-beta.solana.com',
  // 简单的私钥解析逻辑
  payer: process.env.PRIVATE_KEY 
    ? Keypair.fromSecretKey(bs58.decode(process.env.PRIVATE_KEY)) 
    : Keypair.generate(), // 避免报错，生成随机钱包作为占位
  jito: {
    blockEngineUrl: process.env.JITO_BLOCK_ENGINE_URL,
    authKey: process.env.JITO_AUTH_KEY,
  },
  strategy: {
    buyAmount: parseFloat(process.env.BUY_AMOUNT_SOL || '0.01'),
  }
};

console.log(`✅ Config Loaded. Wallet Public Key: ${config.payer.publicKey.toBase58()}`);