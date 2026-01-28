/**
 * 🚀 Bonding Curve 狙击系统 - 黑客松增强版
 *
 * 核心功能：
 * 1. 实时监控 Pump.fun 新代币发射
 * 2. 智能评分系统（多维度评估）
 * 3. 自动狙击高潜力代币
 * 4. 实时可视化展示
 *
 * Alpha 来源：
 * - Pump.fun 代币在 Bonding Curve 阶段价格固定
 * - 当筹集到 1.5 SOL 时，会迁移到 Raydium AMM
 * - 这是一个巨大的价格催化剂（通常 5-10x 涨幅）
 * - 最佳入场时机：70-90% 进度
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import { sendTgAlert } from '../utils/notifier';

const logger = createLogger('BondingCurveSniper');

// ========================================
// 配置常量
// ========================================
const PUMP_FUN_API_BASE = 'https://api.pump.fun';
const PUMP_FUN_MIGRATION_THRESHOLD = 1.5; // SOL
const PUMP_PROGRAM_ID = '6EF8rrecthR5DkzonjNwu78hRvfCKubJ14M5uBEwF6P';

// ========================================
// 类型定义
// ========================================

/**
 * Bonding Curve 状态
 */
export interface BondingCurveStatus {
  tokenMint: string;
  tokenName: string;
  tokenSymbol: string;
  currentRaised: number;      // 当前筹集的 SOL
  targetRaised: number;        // 目标 1.5 SOL
  progress: number;            // 进度百分比 (0-100)
  isMigrated: boolean;         // 是否已迁移
  recommendation: 'SNIPER' | 'BUY' | 'WATCH' | 'AVOID';
  reason: string;
  timestamp: number;
}

/**
 * 代币评分结果
 */
export interface TokenScore {
  score: number;              // 0-100
  level: 'SNIPER' | 'BUY' | 'WATCH' | 'AVOID';
  factors: ScoreFactor[];
  confidence: number;         // 0-1
}

/**
 * 评分因子
 */
export interface ScoreFactor {
  factor: string;
  impact: number;             // 对总分的影响
  reason: string;
  value: number | string;
}

/**
 * Pump.fun API 响应
 */
interface PumpFunTokenResponse {
  mint: string;
  name: string;
  symbol: string;
  bonding_curve: boolean;
  migrated: boolean;
  raised: number;  // SOL
  market_cap?: number;
  creator?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

/**
 * 新代币事件
 */
export interface NewTokenEvent {
  tokenMint: string;
  tokenName: string;
  tokenSymbol: string;
  creator: string;
  timestamp: number;
  txSignature: string;
}

// ========================================
// 核心类：Bonding Curve 狙击系统
// ========================================

export class BondingCurveSniper extends EventEmitter {
  private connection: Connection;
  private isRunning = false;
  private pollInterval?: NodeJS.Timeout;
  private lastSignature: string | null = null;
  private monitoredTokens = new Map<string, BondingCurveStatus>();

  // 配置
  private config = {
    pollInterval: 3000,        // 3 秒轮询一次
    minProgress: 70,          // 最小进度才考虑狙击
    maxProgress: 95,          // 最大进度才考虑狙击
    minScore: 70,             // 最小评分才执行
    buyAmountSOL: 0.01,       // 默认买入金额
    autoExecute: false,       // 是否自动执行
    simulationMode: true,     // 模拟模式
  };

  constructor(
    connection: Connection,
    config?: Partial<typeof BondingCurveSniper.prototype.config>
  ) {
    super();
    this.connection = connection;
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  /**
   * 启动狙击系统
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bonding Curve Sniper 已在运行');
      return;
    }

    this.isRunning = true;
    logger.info('🚀 Bonding Curve Sniper 启动中...');
    logger.info(`   配置: 自动执行=${this.config.autoExecute}, 模拟模式=${this.config.simulationMode}`);
    logger.info(`   狙击范围: ${this.config.minProgress}% - ${this.config.maxProgress}%`);
    logger.info(`   最小评分: ${this.config.minScore}/100`);

    // 立即扫描一次
    await this.scan();

    // 定期扫描
    this.pollInterval = setInterval(() => {
      this.scan();
    }, this.config.pollInterval);
  }

  /**
   * 停止狙击系统
   */
  stop(): void {
    if (!this.isRunning) return;

    this.isRunning = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    logger.info('Bonding Curve Sniper 已停止');
  }

  /**
   * 扫描新代币
   */
  private async scan(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // 获取最新的 Pump.fun 交易
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(PUMP_PROGRAM_ID),
        { limit: 10 },
        'confirmed' as any
      );

      if (signatures.length === 0) return;

      const newestTx = signatures[0];

      // 初始化
      if (!this.lastSignature) {
        this.lastSignature = newestTx.signature;
        logger.info(`✅ 初始化完成，锁定: ${this.lastSignature.slice(0, 10)}...`);
        return;
      }

      // 检查是否有新交易
      if (newestTx.signature === this.lastSignature) {
        return;
      }

      // 处理新交易
      const newTxs = [];
      for (const tx of signatures) {
        if (tx.signature === this.lastSignature) break;
        newTxs.push(tx);
      }

      this.lastSignature = newestTx.signature;

      logger.info(`\n🎯 发现 ${newTxs.length} 个新交易！`);

      // 分析每个新交易
      for (const tx of newTxs) {
        await this.analyzeTransaction(tx.signature);
      }

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('扫描失败:', err);
    }
  }

  /**
   * 分析交易，提取代币信息
   */
  private async analyzeTransaction(signature: string): Promise<void> {
    try {
      const tx = await this.connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx) return;

      // 提取代币 Mint 地址（这里简化处理，实际需要解析交易数据）
      // 在真实场景中，需要解析 Pump.fun 的指令数据
      const tokenMint = this.extractTokenMintFromTx(tx);

      if (!tokenMint) {
        logger.debug(`无法从交易中提取代币信息: ${signature.slice(0, 10)}...`);
        return;
      }

      logger.info(`   🪙 新代币: ${tokenMint.slice(0, 10)}...`);

      // 获取 Bonding Curve 状态
      const status = await this.getBondingCurveStatus(tokenMint);

      // 评分
      const score = this.scoreToken(status);

      logger.info(`   📊 ${status.tokenSymbol} (${status.tokenName})`);
      logger.info(`      进度: ${status.progress.toFixed(1)}% | 评分: ${score.score}/100 (${score.level})`);
      logger.info(`      建议: ${status.recommendation} - ${status.reason}`);

      // 发射事件
      this.emit('newToken', {
        tokenMint: status.tokenMint,
        tokenName: status.tokenName,
        tokenSymbol: status.tokenSymbol,
        status,
        score,
        txSignature: signature
      });

      // 检查是否需要狙击
      if (this.shouldSnipe(status, score)) {
        await this.executeSnipe(status, score);
      }

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`分析交易失败: ${err.message}`);
    }
  }

  /**
   * 从交易中提取代币 Mint 地址
   * 注意：这是简化版本，实际需要解析 Pump.fun 的指令
   */
  private extractTokenMintFromTx(_tx: any): string | null {
    try {
      // 这里需要根据 Pump.fun 的实际指令格式来解析
      // 暂时返回 null，需要进一步研究 Pump.fun 的指令格式
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 获取 Bonding Curve 状态
   */
  private async getBondingCurveStatus(tokenMint: string): Promise<BondingCurveStatus> {
    try {
      const response = await axios.get(`${PUMP_FUN_API_BASE}/tokens/${tokenMint}`, {
        timeout: 5000
      });

      if (!response.data?.success) {
        throw new Error('API 返回失败');
      }

      const tokenInfo = response.data.data as PumpFunTokenResponse;

      const currentRaised = tokenInfo.raised || 0;
      const isMigrated = tokenInfo.migrated || false;
      const progress = Math.min((currentRaised / PUMP_FUN_MIGRATION_THRESHOLD) * 100, 100);

      // 生成建议
      let recommendation: 'SNIPER' | 'BUY' | 'WATCH' | 'AVOID';
      let reason: string;

      if (isMigrated) {
        recommendation = 'WATCH';
        reason = '已迁移到 Raydium AMM';
      } else if (progress >= 90 && progress < 100) {
        recommendation = 'SNIPER';
        reason = '🔥 接近迁移点，最佳狙击时机！';
      } else if (progress >= 70) {
        recommendation = 'BUY';
        reason = '进入加速期，交易活跃';
      } else if (progress >= 50) {
        recommendation = 'WATCH';
        reason = '中期阶段，观察确认趋势';
      } else {
        recommendation = 'AVOID';
        reason = '早期阶段，不确定性高';
      }

      return {
        tokenMint,
        tokenName: tokenInfo.name || 'Unknown',
        tokenSymbol: tokenInfo.symbol || 'UNKNOWN',
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
      logger.warn(`API 请求失败: ${err.message}`);

      // 返回默认状态
      return {
        tokenMint,
        tokenName: 'Unknown',
        tokenSymbol: 'UNKNOWN',
        currentRaised: 0,
        targetRaised: PUMP_FUN_MIGRATION_THRESHOLD,
        progress: 0,
        isMigrated: false,
        recommendation: 'AVOID',
        reason: '无法获取代币信息',
        timestamp: Date.now()
      };
    }
  }

  /**
   * 评分系统：多维度评估代币质量
   */
  private scoreToken(status: BondingCurveStatus): TokenScore {
    const factors: ScoreFactor[] = [];
    let totalScore = 0;

    // 1. 进度评分 (30 分)
    if (status.progress >= 90 && status.progress < 100) {
      totalScore += 30;
      factors.push({
        factor: '进度',
        impact: 30,
        reason: '🔥 接近迁移点，最佳入场时机',
        value: `${status.progress.toFixed(1)}%`
      });
    } else if (status.progress >= 70) {
      totalScore += 25;
      factors.push({
        factor: '进度',
        impact: 25,
        reason: '进入加速期，交易活跃',
        value: `${status.progress.toFixed(1)}%`
      });
    } else if (status.progress >= 50) {
      totalScore += 15;
      factors.push({
        factor: '进度',
        impact: 15,
        reason: '中期阶段，需要观察',
        value: `${status.progress.toFixed(1)}%`
      });
    } else {
      totalScore += 5;
      factors.push({
        factor: '进度',
        impact: 5,
        reason: '早期阶段，不确定性高',
        value: `${status.progress.toFixed(1)}%`
      });
    }

    // 2. 推荐评分 (30 分)
    if (status.recommendation === 'SNIPER') {
      totalScore += 30;
      factors.push({
        factor: '信号',
        impact: 30,
        reason: '🎯 强烈狙击信号',
        value: 'SNIPER'
      });
    } else if (status.recommendation === 'BUY') {
      totalScore += 20;
      factors.push({
        factor: '信号',
        impact: 20,
        reason: '买入信号',
        value: 'BUY'
      });
    } else if (status.recommendation === 'WATCH') {
      totalScore += 10;
      factors.push({
        factor: '信号',
        impact: 10,
        reason: '观望为主',
        value: 'WATCH'
      });
    } else {
      totalScore += 0;
      factors.push({
        factor: '信号',
        impact: 0,
        reason: '避免入场',
        value: 'AVOID'
      });
    }

    // 3. 迁移状态 (20 分)
    if (!status.isMigrated && status.progress > 50) {
      totalScore += 20;
      factors.push({
        factor: '状态',
        impact: 20,
        reason: '未迁移，有突破潜力',
        value: 'Bonding Curve'
      });
    } else if (status.isMigrated) {
      totalScore += 5;
      factors.push({
        factor: '状态',
        impact: 5,
        reason: '已迁移，机会已消失',
        value: 'Raydium AMM'
      });
    } else {
      totalScore += 10;
      factors.push({
        factor: '状态',
        impact: 10,
        reason: '早期，不确定性',
        value: 'Bonding Curve'
      });
    }

    // 4. 筹集金额评分 (20 分)
    if (status.currentRaised >= 1.0) {
      totalScore += 20;
      factors.push({
        factor: '流动性',
        impact: 20,
        reason: '流动性充足',
        value: `${status.currentRaised.toFixed(2)} SOL`
      });
    } else if (status.currentRaised >= 0.5) {
      totalScore += 15;
      factors.push({
        factor: '流动性',
        impact: 15,
        reason: '流动性良好',
        value: `${status.currentRaised.toFixed(2)} SOL`
      });
    } else {
      totalScore += 5;
      factors.push({
        factor: '流动性',
        impact: 5,
        reason: '流动性较低',
        value: `${status.currentRaised.toFixed(2)} SOL`
      });
    }

    // 确定等级
    let level: 'SNIPER' | 'BUY' | 'WATCH' | 'AVOID';
    if (totalScore >= 85) {
      level = 'SNIPER';
    } else if (totalScore >= 70) {
      level = 'BUY';
    } else if (totalScore >= 50) {
      level = 'WATCH';
    } else {
      level = 'AVOID';
    }

    // 计算置信度
    const confidence = Math.min(totalScore / 100, 1);

    return {
      score: totalScore,
      level,
      factors,
      confidence
    };
  }

  /**
   * 判断是否应该狙击
   */
  private shouldSnipe(status: BondingCurveStatus, score: TokenScore): boolean {
    // 检查配置
    if (!this.config.autoExecute) {
      logger.debug(`   ⏸️  自动执行已禁用，跳过`);
      return false;
    }

    // 检查进度范围
    if (status.progress < this.config.minProgress || status.progress > this.config.maxProgress) {
      logger.debug(`   ⏸️  进度不在狙击范围内 (${this.config.minProgress}%-${this.config.maxProgress}%)`);
      return false;
    }

    // 检查评分
    if (score.score < this.config.minScore) {
      logger.debug(`   ⏸️  评分不足 (${score.score} < ${this.config.minScore})`);
      return false;
    }

    // 检查是否已迁移
    if (status.isMigrated) {
      logger.debug(`   ⏸️  已迁移到 Raydium，跳过`);
      return false;
    }

    return true;
  }

  /**
   * 执行狙击
   */
  private async executeSnipe(status: BondingCurveStatus, score: TokenScore): Promise<void> {
    logger.info(`\n🎯 执行狙击: ${status.tokenSymbol} (${status.tokenName})`);
    logger.info(`   进度: ${status.progress.toFixed(1)}% | 评分: ${score.score}/100`);
    logger.info(`   金额: ${this.config.buyAmountSOL} SOL`);

    try {
      if (this.config.simulationMode) {
        logger.info(`   ✅ 模拟模式：狙击成功！`);
        logger.info(`   💰 预期收益: 5-10x (迁移后)`);
      } else {
        // 真实交易逻辑
        // TODO: 实现 Pump.fun 的买入逻辑
        logger.warn(`   ⚠️  真实交易模式：待实现`);
      }

      // 发送通知
      await sendTgAlert(
        `🎯 <b>Bonding Curve 狙击</b>\n` +
        `代币: ${status.tokenSymbol} (${status.tokenName})\n` +
        `进度: ${status.progress.toFixed(1)}%\n` +
        `评分: ${score.score}/100 (${score.level})\n` +
        `金额: ${this.config.buyAmountSOL} SOL\n` +
        `模式: ${this.config.simulationMode ? '模拟' : '真实'}`
      );

      // 发射事件
      this.emit('snipeExecuted', {
        status,
        score,
        timestamp: Date.now()
      });

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`狙击失败: ${err.message}`);
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<typeof BondingCurveSniper.prototype.config>): void {
    this.config = { ...this.config, ...config };
    logger.info('配置已更新:', this.config);
  }

  /**
   * 获取监控的代币列表
   */
  getMonitoredTokens(): BondingCurveStatus[] {
    return Array.from(this.monitoredTokens.values());
  }

  /**
   * 手动添加代币监控
   */
  async addToken(tokenMint: string): Promise<void> {
    const status = await this.getBondingCurveStatus(tokenMint);
    this.monitoredTokens.set(tokenMint, status);
    logger.info(`添加代币监控: ${status.tokenSymbol} (${status.tokenName})`);
  }
}

// ========================================
// 使用示例
// ========================================

/**
 * 使用示例：
 *
 * ```typescript
 * import { BondingCurveSniper } from './bondingCurveSniper';
 * import { Connection } from '@solana/web3.js';
 *
 * // 创建连接
 * const connection = new Connection('https://api.mainnet-beta.solana.com');
 *
 * // 创建狙击系统
 * const sniper = new BondingCurveSniper(connection, {
 *   pollInterval: 3000,
 *   minProgress: 70,
 *   maxProgress: 95,
 *   minScore: 70,
 *   buyAmountSOL: 0.01,
 *   autoExecute: false,  // 先用模拟模式测试
 *   simulationMode: true,
 * });
 *
 * // 监听事件
 * sniper.on('newToken', (data) => {
 *   console.log(`发现新代币: ${data.tokenSymbol}`);
 *   console.log(`评分: ${data.score.score}/100`);
 * });
 *
 * sniper.on('snipeExecuted', (data) => {
 *   console.log(`狙击执行: ${data.status.tokenSymbol}`);
 * });
 *
 * // 启动
 * await sniper.start();
 *
 * // 停止
 * // sniper.stop();
 * ```
 */
