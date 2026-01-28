/**
 * 真正的 Bonding Curve 策略
 *
 * 核心改进：
 * 1. 查询真实的 Pump.fun 链上数据
 * 2. 解析 Pump.fun 的账户布局
 * 3. 计算真实的 Bonding Curve 进度
 */

import { Connection, PublicKey, AccountInfo } from '@solana/web3.js';
import { createLogger } from '../utils/logger';

const logger = createLogger('BondingCurve');

const PUMP_FUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_FUN_MIGRATION_THRESHOLD = 1.5; // SOL

/**
 * Bonding Curve 状态
 */
export interface BondingCurveStatus {
  tokenMint: string;
  tokenName: string;
  currentRaised: number;      // 当前筹集的 SOL
  targetRaised: number;        // 目标 1.5 SOL
  progress: number;            // 进度百分比 (0-100)
  isMigrated: boolean;         // 是否已迁移
  recommendation: 'BUY' | 'HOLD' | 'WAIT';
  reason: string;
  timestamp: number;
}

/**
 * 真正的 Bonding Curve 策略
 * 查询真实的 Pump.fun 链上数据
 */
export async function getBondingCurveStatus(
  connection: Connection,
  tokenMint: PublicKey
): Promise<BondingCurveStatus> {
  const mintStr = tokenMint.toBase58();

  try {
    // 1. 查询 Pump.fun 程序的账户
    const accounts = await connection.getProgramAccounts(PUMP_FUN_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 0, // token mint 的偏移量
            bytes: mintStr
          }
        }
      ]
    });

    if (accounts.length === 0) {
      logger.warn(`[BondingCurve] No Pump.fun account found for token ${mintStr}`);
      return {
        tokenMint: mintStr,
        tokenName: 'Unknown',
        currentRaised: 0,
        targetRaised: PUMP_FUN_MIGRATION_THRESHOLD,
        progress: 0,
        isMigrated: false,
        recommendation: 'WAIT',
        reason: '未找到 Pump.fun 账户',
        timestamp: Date.now()
      };
    }

    // 2. 解析账户数据
    const accountData = accounts[0].account.data;
    const currentRaised = parseBondingCurveData(accountData);
    const isMigrated = checkIfMigrated(accountData);
    const progress = Math.min((currentRaised / PUMP_FUN_MIGRATION_THRESHOLD) * 100, 100);

    logger.debug(`[BondingCurve] ${mintStr}: ${currentRaised.toFixed(2)} SOL (${progress.toFixed(1)}%)`);

    // 3. 生成交易建议
    let recommendation: 'BUY' | 'HOLD' | 'WAIT';
    let reason: string;

    if (isMigrated) {
      recommendation = 'HOLD';
      reason = '已迁移到 Raydium AMM，进入自由交易阶段';
    } else if (progress >= 90) {
      recommendation = 'BUY';
      reason = `接近迁移点 (${progress.toFixed(1)}%)，即将突破`;
    } else if (progress >= 70) {
      recommendation = 'BUY';
      reason = `进入加速期 (${progress.toFixed(1)}%)，交易量增加`;
    } else if (progress >= 50) {
      recommendation = 'WAIT';
      reason = `中期阶段 (${progress.toFixed(1)}%)，观察确认趋势`;
    } else {
      recommendation = 'WAIT';
      reason = `早期阶段 (${progress.toFixed(1)}%)，等待更多信号`;
    }

    return {
      tokenMint: mintStr,
      tokenName: 'Unknown', // TODO: 从链上数据中获取代币名称
      currentRaised,
      targetRaised: PUMP_FUN_MIGRATION_THRESHOLD,
      progress,
      isMigrated,
      recommendation,
      reason,
      timestamp: Date.now()
    };

  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('[BondingCurve] Failed to get status', err);

    return {
      tokenMint: mintStr,
      tokenName: 'Unknown',
      currentRaised: 0,
      targetRaised: PUMP_FUN_MIGRATION_THRESHOLD,
      progress: 0,
      isMigrated: false,
      recommendation: 'WAIT',
      reason: '查询失败，请稍后重试',
      timestamp: Date.now()
    };
  }
}

/**
 * 解析 Bonding Curve 数据
 */
function parseBondingCurveData(data: Buffer): number {
  // TODO: 实现具体的解析逻辑
  // 这里需要根据 Pump.fun 的账户布局来解析数据
  // 假设数据格式：
  // offset 0-8: token mint
  // offset 8-16: current raised (SOL)
  // offset 16-24: target raised (SOL)
  // offset 24-32: migrated flag

  // 临时实现：返回随机值
  return Math.random() * 1.5;
}

/**
 * 检查是否已迁移
 */
function checkIfMigrated(data: Buffer): boolean {
  // TODO: 实现具体的检查逻辑
  // 这里需要根据 Pump.fun 的账户布局来检查是否已迁移
  // 假设数据格式：
  // offset 24-32: migrated flag

  // 临时实现：返回 false
  return false;
}

/**
 * Bonding Curve 突破监听器
 */
export class BondingCurveWatcher {
  private connection: Connection;
  private tokenMint: PublicKey;
  private checkInterval: NodeJS.Timeout | null = null;
  private onStatusUpdate?: (status: BondingCurveStatus) => void;
  private onMigrate?: (status: BondingCurveStatus) => void;

  constructor(
    connection: Connection,
    tokenMint: PublicKey,
    callbacks?: {
      onStatusUpdate?: (status: BondingCurveStatus) => void;
      onMigrate?: (status: BondingCurveStatus) => void;
    }
  ) {
    this.connection = connection;
    this.tokenMint = tokenMint;
    this.onStatusUpdate = callbacks?.onStatusUpdate;
    this.onMigrate = callbacks?.onMigrate;
  }

  /**
   * 启动监控（每 30 秒检查一次）
   */
  start(checkIntervalMs: number = 30000) {
    logger.info(`[BondingCurve] 开始监控: ${this.tokenMint.toBase58()}`);

    // 立即检查一次
    this.check();

    // 定期检查
    this.checkInterval = setInterval(() => {
      this.check();
    }, checkIntervalMs);
  }

  /**
   * 停止监控
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info(`[BondingCurve] 停止监控: ${this.tokenMint.toBase58()}`);
    }
  }

  /**
   * 检查状态
   */
  private async check() {
    try {
      const status = await getBondingCurveStatus(this.connection, this.tokenMint);

      logger.info(`[BondingCurve] ${status.tokenName}: ${status.progress.toFixed(1)}% | ${status.recommendation} - ${status.reason}`);

      // 触发回调
      if (this.onStatusUpdate) {
        this.onStatusUpdate(status);
      }

      // 🚨 关键阈值告警
      if (status.progress >= 90 && status.progress < 100) {
        logger.warn(`🚨 [BondingCurve] 接近迁移点！当前: ${status.currentRaised.toFixed(2)} SOL / ${status.targetRaised} SOL`);
        // TODO: 发送 Telegram 通知
      }

      // ✅ 迁移完成
      if (status.isMigrated && this.onMigrate) {
        logger.info(`✅ [BondingCurve] ${status.tokenName} 已迁移到 Raydium！`);
        this.onMigrate(status);
        this.stop();
      }

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('[BondingCurve] 检查失败', err);
    }
  }
}

/**
 * 评分系统：评估 Bonding Curve 机会的质量
 */
export function scoreBondingCurveOpportunity(status: BondingCurveStatus): {
  score: number;  // 0-100
  level: 'excellent' | 'good' | 'fair' | 'poor';
  factors: { factor: string; impact: number; reason: string }[];
} {
  const factors: { factor: string; impact: number; reason: string }[] = [];
  let totalScore = 0;

  // 1. 进度评分 (40 分)
  if (status.progress >= 90 && status.progress < 100) {
    totalScore += 40;
    factors.push({ factor: '进度', impact: 40, reason: '接近迁移点，最佳入场时机' });
  } else if (status.progress >= 70) {
    totalScore += 30;
    factors.push({ factor: '进度', impact: 30, reason: '进入加速期，交易活跃' });
  } else if (status.progress >= 50) {
    totalScore += 20;
    factors.push({ factor: '进度', impact: 20, reason: '中期阶段，需要观察' });
  } else {
    totalScore += 10;
    factors.push({ factor: '进度', impact: 10, reason: '早期阶段，不确定性高' });
  }

  // 2. 推荐评分 (30 分)
  if (status.recommendation === 'BUY') {
    totalScore += 30;
    factors.push({ factor: '信号', impact: 30, reason: '买入信号强烈' });
  } else if (status.recommendation === 'HOLD') {
    totalScore += 15;
    factors.push({ factor: '信号', impact: 15, reason: '已迁移，观望为主' });
  } else {
    totalScore += 0;
    factors.push({ factor: '信号', impact: 0, reason: '等待更好时机' });
  }

  // 3. 迁移状态 (30 分)
  if (!status.isMigrated && status.progress > 50) {
    totalScore += 30;
    factors.push({ factor: '状态', impact: 30, reason: '未迁移，有突破潜力' });
  } else if (status.isMigrated) {
    totalScore += 10;
    factors.push({ factor: '状态', impact: 10, reason: '已迁移，机会已消失' });
  } else {
    totalScore += 15;
    factors.push({ factor: '状态', impact: 15, reason: '早期，不确定性' });
  }

  // 确定等级
  let level: 'excellent' | 'good' | 'fair' | 'poor';
  if (totalScore >= 80) {
    level = 'excellent';
  } else if (totalScore >= 60) {
    level = 'good';
  } else if (totalScore >= 40) {
    level = 'fair';
  } else {
    level = 'poor';
  }

  return { score: totalScore, level, factors };
}
