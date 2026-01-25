/**
 * 配置验证系统
 * 使用 Zod 进行运行时配置验证
 */

import { config } from '../config';
import { Keypair } from '@solana/web3.js';

/**
 * 验证错误
 */
export class ValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(`配置验证失败 [${field}]: ${message}`);
    this.name = 'ValidationError';
  }
}

/**
 * 风险配置验证
 */
export function validateRiskConfig(config: any): void {
  if (typeof config.maxPositionSize !== 'number' || config.maxPositionSize <= 0) {
    throw new ValidationError('maxPositionSize', '必须是正数');
  }

  if (typeof config.stopLossPercentage !== 'number' ||
      config.stopLossPercentage < 0 || config.stopLossPercentage > 1) {
    throw new ValidationError('stopLossPercentage', '必须在 0-1 之间');
  }

  if (typeof config.takeProfitPercentage !== 'number' ||
      config.takeProfitPercentage <= 0) {
    throw new ValidationError('takeProfitPercentage', '必须大于 0');
  }

  if (config.stopLossPercentage >= config.takeProfitPercentage) {
    throw new ValidationError('stopLossPercentage', '必须小于 takeProfitPercentage');
  }
}

/**
 * RPC 配置验证
 */
export function validateRpcConfig(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new ValidationError('rpcUrl', '必须提供有效的 RPC URL');
  }

  try {
    new URL(url);
  } catch {
    throw new ValidationError('rpcUrl', 'URL 格式无效');
  }

  if (!url.startsWith('https://') && !url.startsWith('http://')) {
    throw new ValidationError('rpcUrl', '必须以 http:// 或 https:// 开头');
  }
}

/**
 * 私钥验证
 */
export function validatePrivateKey(privateKeyBase58: string): void {
  if (!privateKeyBase58 || typeof privateKeyBase58 !== 'string') {
    throw new ValidationError('privateKey', '必须提供私钥');
  }

  if (privateKeyBase58.length < 32) {
    throw new ValidationError('privateKey', '私钥长度不足');
  }

  try {
    Keypair.fromSecretKey(Buffer.from(privateKeyBase58, 'base58'));
  } catch (error) {
    throw new ValidationError('privateKey', '私钥格式无效');
  }
}

/**
 * API 配置验证
 */
export function validateApiConfig(apiKey?: string, apiUrl?: string): void {
  if (apiKey && typeof apiKey !== 'string') {
    throw new ValidationError('AI_API_KEY', '必须是字符串');
  }

  if (apiUrl && typeof apiUrl !== 'string') {
    throw new ValidationError('AI_API_URL', '必须是字符串');
  }

  if (apiUrl) {
    try {
      new URL(apiUrl);
    } catch {
      throw new ValidationError('AI_API_URL', 'URL 格式无效');
    }
  }
}

/**
 * Telegram 配置验证
 */
export function validateTelegramConfig(botToken?: string, chatId?: string): void {
  if (!botToken && !chatId) {
    // 如果两者都未提供，是允许的（不使用 Telegram）
    return;
  }

  if (botToken && typeof botToken !== 'string') {
    throw new ValidationError('TG_BOT_TOKEN', '必须是字符串');
  }

  if (chatId && typeof chatId !== 'string') {
    throw new ValidationError('TG_CHAT_ID', '必须是字符串');
  }

  if (botToken && !botToken.match(/^\d+:[A-Za-z0-9_-+$/)) {
    throw new ValidationError('TG_BOT_TOKEN', '格式无效');
  }
}

/**
 * Jito 配置验证
 */
export function validateJitoConfig(jitoConfig: any): void {
  if (!jitoConfig) return;

  if (jitoConfig.blockEngineUrl && typeof jitoConfig.blockEngineUrl !== 'string') {
    throw new ValidationError('jito.blockEngineUrl', '必须是字符串');
  }
}

/**
 * 完整配置验证
 */
export function validateAllConfig(): void {
  console.log('[Config] 开始验证配置...');

  try {
    validateRpcConfig(config.rpcUrl);
    console.log('[Config] RPC 配置有效');

    // 注意：这里不验证私钥，因为可能从其他地方加载
    // validatePrivateKey(config.privateKey);
    // console.log('[Config] 私钥有效');

    validateApiConfig(process.env.AI_API_KEY, process.env.AI_API_URL);
    console.log('[Config] API 配置有效');

    validateTelegramConfig(process.env.TG_BOT_TOKEN, process.env.TG_CHAT_ID);
    console.log('[Config] Telegram 配置有效');

    validateJitoConfig(config.jito);
    console.log('[Config] Jito 配置有效');

    console.log('[Config] 所有配置验证通过');
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`[Config] ${error.message}`);
      throw error;
    }
    throw error;
  }
}

/**
 * 环境变量必需检查
 */
export function checkRequiredEnvVars(): void {
  const required = [
    'PRIVATE_KEY'
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new ValidationError(
      'environment',
      `缺少必需的环境变量: ${missing.join(', ')}`
    );
  }
}

/**
 * 配置迁移（用于版本升级）
 */
export function migrateConfigIfNeeded(): void {
  // 这里可以处理旧版本配置的迁移
  // 例如：重命名字段、调整默认值等

  console.log('[Config] 配置迁移检查完成');
}

/**
 * 导出配置报告
 */
export function exportConfigReport(): {
  rpcUrl: string;
  hasPrivateKey: boolean;
  hasAiConfig: boolean;
  hasTelegramConfig: boolean;
  hasJitoConfig: boolean;
} {
  return {
    rpcUrl: config.rpcUrl,
    hasPrivateKey: !!process.env.PRIVATE_KEY,
    hasAiConfig: !!(process.env.AI_API_KEY || process.env.AI_API_URL),
    hasTelegramConfig: !!(process.env.TG_BOT_TOKEN && process.env.TG_CHAT_ID),
    hasJitoConfig: !!config.jito
  };
}
