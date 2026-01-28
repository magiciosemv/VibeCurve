import dotenv from 'dotenv';
import { Keypair, Connection } from '@solana/web3.js';
import bs58 from 'bs58';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from './utils/logger';

const logger = createLogger('Config');

dotenv.config();

/**
 * RPC节点配置（支持负载均衡）
 */
const RPC_URLS = [
  process.env.RPC_URL_1 || 'https://api.mainnet-beta.solana.com',
  process.env.RPC_URL_2 || 'https://solana-api.projectserum.com',
  process.env.RPC_URL_3 || 'https://rpc.ankr.com/solana',
  process.env.RPC_URL_4 || 'https://solana.publicnode.com',
].filter(url => url && url.length > 0);

/**
 * WebSocket URL配置
 */
const WSS_URLS = [
  process.env.WSS_URL_1 || 'wss://api.mainnet-beta.solana.com',
  process.env.WSS_URL_2 || 'wss://solana-api.projectserum.com',
].filter(url => url && url.length > 0);

/**
 * 代理配置（可选）
 */
let httpsAgent: HttpsProxyAgent<string> | undefined;
let PROXY_HOST = process.env.HTTP_PROXY_HOST || '';
let PROXY_PORT = process.env.HTTP_PROXY_PORT || '';
let PROXY_URL = '';

if (process.env.HTTP_PROXY_HOST && process.env.HTTP_PROXY_PORT) {
  PROXY_HOST = process.env.HTTP_PROXY_HOST;
  PROXY_PORT = process.env.HTTP_PROXY_PORT;
  PROXY_URL = `http://${PROXY_HOST}:${PROXY_PORT}`;

  httpsAgent = new HttpsProxyAgent(PROXY_URL);
  logger.info(`[Config] Proxy configured: ${PROXY_HOST}:${PROXY_PORT}`);
}

/**
 * 创建带负载均衡的 Connection
 */
export const createConnection = (rpcUrl?: string): Connection => {
  const url = rpcUrl || RPC_URLS[Math.floor(Math.random() * RPC_URLS.length)];

  const connectionConfig: any = {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000, // 60秒超时
  };

  if (httpsAgent) {
    connectionConfig.httpAgent = httpsAgent;
  }

  return new Connection(url, connectionConfig);
};

/**
 * 创建WebSocket Connection
 */
export const createWSConnection = (wssUrl?: string): Connection => {
  const url = wssUrl || WSS_URLS[Math.floor(Math.random() * WSS_URLS.length)];

  const connectionConfig: any = {
    commitment: 'confirmed',
    confirmTransactionInitialTimeout: 60000,
    wsEndpoint: url,
  };

  if (httpsAgent) {
    connectionConfig.httpAgent = httpsAgent;
  }

  return new Connection(url, connectionConfig);
};

// 解析私钥
function parsePrivateKey(): Keypair {
  const privateKey = process.env.PRIVATE_KEY;
  
  if (!privateKey || privateKey.length === 0) {
    logger.warn('未设置 PRIVATE_KEY，使用随机钱包');
    return Keypair.generate();
  }

  try {
    return Keypair.fromSecretKey(bs58.decode(privateKey));
  } catch (error) {
    logger.warn('私钥解析失败，使用随机钱包:', error);
    return Keypair.generate();
  }
}

export const config = {
  rpcUrl: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  wssUrl: process.env.WSS_URL || 'wss://api.mainnet-beta.solana.com',
  proxy: {
    host: PROXY_HOST,
    port: PROXY_PORT,
    url: PROXY_URL,
    httpsAgent,
  },
  payer: parsePrivateKey(),
  jito: {
    blockEngineUrl: process.env.JITO_BLOCK_ENGINE_URL || 'https://amsterdam.mainnet.block-engine.jito.wtf',
    authKey: process.env.JITO_AUTH_KEY,
  },
  strategy: {
    buyAmount: parseFloat(process.env.BUY_AMOUNT_SOL || '0.01'),
  },
  ai: {
    apiKey: process.env.AI_API_KEY,
    apiUrl: process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions',
  },
  server: {
    port: parseInt(process.env.PORT || '3002'),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
};

logger.info(`Config loaded. Wallet: ${config.payer.publicKey.toBase58()}`);
logger.info(`Proxy: ${config.proxy.host}:${config.proxy.port}`);
logger.info(`RPC URL: ${config.rpcUrl}`);
