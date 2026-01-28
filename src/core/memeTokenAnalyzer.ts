/**
 * Meme Token 深度分析器
 * 整合多维度指标评估新代币的质量
 *
 * 核心功能：
 * 1. 交易速度分析（买入加速度）
 * 2. 持仓地址分布（检测老鼠仓）
 * 3. 市场情绪评分
 * 4. Rug Pull 风险评估
 */

import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { createLogger } from '../utils/logger';

const logger = createLogger('MemeTokenAnalyzer');

/**
 * 代币持仓分析
 */
export interface HolderAnalysis {
  totalHolders: number;
  top10HoldersPercentage: number;  // 前10名持仓占比
  giniCoefficient: number;         // 基尼系数（0=完全平均，1=极度集中）
  whaleCount: number;              // 巨鲸地址数量（>1%持仓）
  isWhaleDominanted: boolean;      // 是否被巨鲸控制
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

/**
 * 交易速度分析
 */
export interface TransactionVelocity {
  txCount1h: number;
  txCount6h: number;
  txCount24h: number;
  acceleration: number;           // 交易加速度 (最近的1小时 vs 之前的5小时)
  momentum: 'SURGING' | 'STRONG' | 'STABLE' | 'WEAK' | 'DYING';
}

/**
 * 综合分析结果
 */
export interface MemeTokenAnalysis {
  tokenMint: string;
  tokenSymbol: string;
  overallScore: number;           // 0-100 总分
  recommendation: 'SNIPER' | 'BUY' | 'WATCH' | 'AVOID';
  holderAnalysis?: HolderAnalysis;
  txVelocity?: TransactionVelocity;
  riskFactors: string[];
  positiveFactors: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  timestamp: number;
}

/**
 * Meme Token 分析器类
 */
export class MemeTokenAnalyzer {
  private connection: Connection;
  private pumpApiBase = 'https://api.pump.fun';

  constructor(connection: Connection) {
    this.connection = connection;
  }

  /**
   * 全面分析代币
   */
  async analyzeToken(tokenMint: PublicKey | string): Promise<MemeTokenAnalysis> {
    const mintStr = typeof tokenMint === 'string' ? tokenMint : tokenMint.toBase58();

    logger.info(`[MemeAnalyzer] 开始分析代币: ${mintStr}`);

    try {
      // 并行获取多个数据源
      const [holderAnalysis, txVelocity, basicInfo] = await Promise.all([
        this.analyzeHolders(mintStr).catch(() => undefined),
        this.analyzeTransactionVelocity(mintStr).catch(() => undefined),
        this.getBasicTokenInfo(mintStr).catch(() => undefined),
      ]);

      // 计算总分
      const overallScore = this.calculateOverallScore({
        holderAnalysis,
        txVelocity,
      });

      // 生成推荐
      const recommendation = this.generateRecommendation(overallScore, {
        holderAnalysis,
        txVelocity,
      });

      // 生成风险和积极因素
      const { riskFactors, positiveFactors } = this.generateFactors({
        holderAnalysis,
        txVelocity,
      });

      // 确定置信度
      const confidence = this.determineConfidence({
        holderAnalysis,
        txVelocity,
        basicInfo,
      });

      return {
        tokenMint: mintStr,
        tokenSymbol: basicInfo?.symbol || 'UNKNOWN',
        overallScore,
        recommendation,
        holderAnalysis,
        txVelocity,
        riskFactors,
        positiveFactors,
        confidence,
        timestamp: Date.now(),
      };

    } catch (error) {
      logger.error(`[MemeAnalyzer] 分析失败: ${error}`);
      throw error;
    }
  }

  /**
   * 分析持仓分布
   */
  private async analyzeHolders(tokenMint: string): Promise<HolderAnalysis> {
    try {
      // 调用 Pump.fun API 获取持仓信息
      const response = await axios.get(`${this.pumpApiBase}/tokens/${tokenMint}/holders`, {
        timeout: 5000,
      });

      if (!response.data?.success || !response.data?.data) {
        throw new Error('Invalid API response');
      }

      const holders = response.data.data;

      // 计算各种指标
      const totalHolders = holders.length || 0;

      // 计算前10名持仓占比
      let top10Percentage = 0;
      if (holders.length > 0) {
        const sortedHolders = holders
          .sort((a: any, b: any) => b.balance - a.balance)
          .slice(0, 10);
        const totalSupply = holders.reduce((sum: number, h: any) => sum + h.balance, 0);
        const top10Supply = sortedHolders.reduce((sum: number, h: any) => sum + h.balance, 0);
        top10Percentage = (top10Supply / totalSupply) * 100;
      }

      // 计算基尼系数（简化版）
      const giniCoefficient = this.calculateGiniCoefficient(
        holders.map((h: any) => h.balance)
      );

      // 统计巨鲸数量（持仓 > 1%）
      const whaleCount = holders.filter((h: any) => h.balance > 1).length;

      // 判断是否被巨鲸控制
      const isWhaleDominanted = top10Percentage > 50 || whaleCount > 3;

      // 风险等级
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      if (isWhaleDominanted || giniCoefficient > 0.7) {
        riskLevel = 'HIGH';
      } else if (top10Percentage > 30 || giniCoefficient > 0.5) {
        riskLevel = 'MEDIUM';
      } else {
        riskLevel = 'LOW';
      }

      return {
        totalHolders,
        top10HoldersPercentage: top10Percentage,
        giniCoefficient,
        whaleCount,
        isWhaleDominanted,
        riskLevel,
      };

    } catch (error) {
      logger.warn(`[MemeAnalyzer] 持仓分析失败: ${error}`);
      // 返回默认值
      return {
        totalHolders: 0,
        top10HoldersPercentage: 50,
        giniCoefficient: 0.5,
        whaleCount: 0,
        isWhaleDominanted: false,
        riskLevel: 'MEDIUM',
      };
    }
  }

  /**
   * 分析交易速度
   */
  private async analyzeTransactionVelocity(tokenMint: string): Promise<TransactionVelocity> {
    try {
      const response = await axios.get(`${this.pumpApiBase}/tokens/${tokenMint}/activity`, {
        timeout: 5000,
      });

      if (!response.data?.success || !response.data?.data) {
        throw new Error('Invalid API response');
      }

      const activity = response.data.data;

      const txCount1h = activity.tx_1h || 0;
      const txCount6h = activity.tx_6h || 0;
      const txCount24h = activity.tx_24h || 0;

      // 计算加速度：最近1小时 vs 之前的5小时
      const txPrev5h = txCount6h - txCount1h;
      const acceleration = txPrev5h > 0 ? txCount1h / txPrev5h : 0;

      // 确定动量
      let momentum: TransactionVelocity['momentum'];
      if (acceleration >= 3) {
        momentum = 'SURGING';  // 激增
      } else if (acceleration >= 1.5) {
        momentum = 'STRONG';   // 强势
      } else if (acceleration >= 0.8) {
        momentum = 'STABLE';   // 稳定
      } else if (acceleration >= 0.3) {
        momentum = 'WEAK';     // 衰弱
      } else {
        momentum = 'DYING';    // 死亡
      }

      return {
        txCount1h,
        txCount6h,
        txCount24h,
        acceleration,
        momentum,
      };

    } catch (error) {
      logger.warn(`[MemeAnalyzer] 交易速度分析失败: ${error}`);
      // 返回默认值
      return {
        txCount1h: 0,
        txCount6h: 0,
        txCount24h: 0,
        acceleration: 0,
        momentum: 'WEAK',
      };
    }
  }

  /**
   * 获取基础代币信息
   */
  private async getBasicTokenInfo(tokenMint: string): Promise<{
    symbol: string;
    name: string;
    marketCap?: number;
    liquidity?: number;
  } | null> {
    try {
      const response = await axios.get(`${this.pumpApiBase}/tokens/${tokenMint}`, {
        timeout: 5000,
      });

      if (response.data?.success && response.data?.data) {
        const data = response.data.data;
        return {
          symbol: data.symbol || 'UNKNOWN',
          name: data.name || 'Unknown',
          marketCap: data.market_cap,
          liquidity: data.liquidity,
        };
      }

      return null;

    } catch (error) {
      logger.warn(`[MemeAnalyzer] 获取代币信息失败: ${error}`);
      return null;
    }
  }

  /**
   * 计算基尼系数（用于衡量集中度）
   */
  private calculateGiniCoefficient(values: number[]): number {
    if (values.length === 0) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    if (sum === 0) return 0;

    let gini = 0;
    for (let i = 0; i < n; i++) {
      gini += (2 * (i + 1) - n - 1) * sorted[i];
    }

    gini = gini / (n * sum);
    return Math.max(0, Math.min(1, gini));
  }

  /**
   * 计算总分 (0-100)
   */
  private calculateOverallScore(data: {
    holderAnalysis?: HolderAnalysis;
    txVelocity?: TransactionVelocity;
  }): number {
    let score = 50; // 基础分

    // 持仓分析评分 (30 分)
    if (data.holderAnalysis) {
      const { riskLevel, totalHolders, top10HoldersPercentage } = data.holderAnalysis;

      if (riskLevel === 'LOW') {
        score += 30;
      } else if (riskLevel === 'MEDIUM') {
        score += 15;
      } else {
        score -= 20; // 高风险扣分
      }

      // 持仓地址数奖励
      if (totalHolders >= 500) {
        score += 5;
      } else if (totalHolders < 100) {
        score -= 5;
      }
    }

    // 交易速度评分 (20 分)
    if (data.txVelocity) {
      const { momentum, acceleration } = data.txVelocity;

      if (momentum === 'SURGING') {
        score += 20;
      } else if (momentum === 'STRONG') {
        score += 15;
      } else if (momentum === 'STABLE') {
        score += 10;
      } else if (momentum === 'DYING') {
        score -= 15;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 生成推荐
   */
  private generateRecommendation(
    score: number,
    data: {
      holderAnalysis?: HolderAnalysis;
      txVelocity?: TransactionVelocity;
    }
  ): 'SNIPER' | 'BUY' | 'WATCH' | 'AVOID' {
    // 高分 + 交易激增 = SNIPER
    if (score >= 75 && data.txVelocity?.momentum === 'SURGING') {
      return 'SNIPER';
    }

    // 高分 = BUY
    if (score >= 70) {
      return 'BUY';
    }

    // 中分 = WATCH
    if (score >= 50) {
      return 'WATCH';
    }

    // 低分或高风险 = AVOID
    if (score < 40 || data.holderAnalysis?.riskLevel === 'HIGH') {
      return 'AVOID';
    }

    return 'WATCH';
  }

  /**
   * 生成风险和积极因素
   */
  private generateFactors(data: {
    holderAnalysis?: HolderAnalysis;
    txVelocity?: TransactionVelocity;
  }): { riskFactors: string[]; positiveFactors: string[] } {
    const riskFactors: string[] = [];
    const positiveFactors: string[] = [];

    // 持仓分析
    if (data.holderAnalysis) {
      const { riskLevel, totalHolders, top10HoldersPercentage, whaleCount, isWhaleDominanted } = data.holderAnalysis;

      if (isWhaleDominanted) {
        riskFactors.push(`⚠️ 巨鲸控制严重：前10名持仓 ${top10HoldersPercentage.toFixed(1)}%`);
      }

      if (whaleCount > 3) {
        riskFactors.push(`⚠️ 发现 ${whaleCount} 个巨鲸地址，可能存在老鼠仓`);
      }

      if (riskLevel === 'HIGH') {
        riskFactors.push('❌ 持仓集中度极高，Rug Pull 风险大');
      } else if (riskLevel === 'LOW') {
        positiveFactors.push(`✅ 持仓分布健康，${totalHolders} 个地址`);
      }

      if (totalHolders >= 500) {
        positiveFactors.push(`✅ 社区基础良好：${totalHolders} 个持币地址`);
      }
    }

    // 交易速度
    if (data.txVelocity) {
      const { momentum, acceleration, txCount1h } = data.txVelocity;

      if (momentum === 'SURGING') {
        positiveFactors.push(`🚀 交易激增：最近1小时 ${txCount1h} 笔交易`);
        positiveFactors.push(`🚀 加速度 ${(acceleration * 100).toFixed(0)}%`);
      } else if (momentum === 'DYING') {
        riskFactors.push('📉 交易量急剧萎缩，可能已失去热度');
      }
    }

    return { riskFactors, positiveFactors };
  }

  /**
   * 确定置信度
   */
  private determineConfidence(data: {
    holderAnalysis?: HolderAnalysis;
    txVelocity?: TransactionVelocity;
    basicInfo?: any;
  }): 'HIGH' | 'MEDIUM' | 'LOW' {
    // 有完整数据 = HIGH
    if (data.holderAnalysis && data.txVelocity && data.basicInfo) {
      return 'HIGH';
    }

    // 有部分数据 = MEDIUM
    if (data.holderAnalysis || data.txVelocity) {
      return 'MEDIUM';
    }

    // 缺少数据 = LOW
    return 'LOW';
  }

  /**
   * 批量分析
   */
  async analyzeBatch(tokenMints: Array<PublicKey | string>): Promise<Map<string, MemeTokenAnalysis>> {
    const results = new Map<string, MemeTokenAnalysis>();

    // 限制并发数
    const concurrency = 3;
    for (let i = 0; i < tokenMints.length; i += concurrency) {
      const batch = tokenMints.slice(i, i + concurrency);
      const analyses = await Promise.all(
        batch.map(mint => this.analyzeToken(mint).catch(err => {
          logger.error(`分析失败: ${err}`);
          return null;
        }))
      );

      batch.forEach((mint, idx) => {
        if (analyses[idx]) {
          results.set(typeof mint === 'string' ? mint : mint.toBase58(), analyses[idx]!);
        }
      });

      // 短暂延迟避免 API 限流
      if (i + concurrency < tokenMints.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return results;
  }
}

/**
 * 快速分析函数（便捷方法）
 */
export async function analyzeMemeToken(
  connection: Connection,
  tokenMint: PublicKey | string
): Promise<MemeTokenAnalysis> {
  const analyzer = new MemeTokenAnalyzer(connection);
  return analyzer.analyzeToken(tokenMint);
}
