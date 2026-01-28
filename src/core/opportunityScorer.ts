/**
 * 智能机会评分系统
 * 多维度评估套利和 Meme Token 机会的质量
 */

import { createLogger } from '../utils/logger';

const logger = createLogger('OpportunityScorer');

/**
 * 机会评分结果
 */
export interface OpportunityScore {
  totalScore: number;        // 0-100 总分
  recommendation: 'EXECUTE' | 'WATCH' | 'AVOID';
  breakdown: {
    profitability: number;   // 0-100 盈利潜力
    liquidity: number;       // 0-100 流动性评分
    timing: number;          // 0-100 市场时机
    risk: number;            // 0-100 风险控制（越高越安全）
  };
  reasoning: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

/**
 * 机会数据接口
 */
export interface OpportunityData {
  tokenSymbol: string;
  priceDiff: number;         // 价差百分比
  estimatedProfit: number;   // 预估利润 (SOL)
  liquidity: number;         // 流动性 (SOL)
  volume24h?: number;        // 24小时交易量
  priceChange24h?: number;   // 24小时价格变化
  holderCount?: number;      // 持仓地址数
  isMemeToken?: boolean;     // 是否为 Meme Token
  bondingCurveProgress?: number; // Bonding Curve 进度 (0-1)
  marketCap?: number;        // 市值
}

/**
 * 加权配置
 */
const WEIGHTS = {
  profitability: 0.35,  // 盈利潜力权重 35%
  liquidity: 0.25,      // 流动性权重 25%
  timing: 0.25,         // 市场时机权重 25%
  risk: 0.15,           // 风险控制权重 15%
};

/**
 * 机会评分器类
 */
export class OpportunityScorer {
  /**
   * 评分单个机会
   */
  static score(opp: OpportunityData): OpportunityScore {
    const profitability = this.scoreProfitability(opp);
    const liquidity = this.scoreLiquidity(opp);
    const timing = this.scoreTiming(opp);
    const risk = this.scoreRisk(opp);

    // 计算加权总分
    const totalScore =
      profitability * WEIGHTS.profitability +
      liquidity * WEIGHTS.liquidity +
      timing * WEIGHTS.timing +
      risk * WEIGHTS.risk;

    const recommendation = this.getRecommendation(totalScore, opp);
    const reasoning = this.generateReasoning(opp, {
      profitability,
      liquidity,
      timing,
      risk,
    });

    const confidence = this.getConfidence(totalScore, opp);

    return {
      totalScore: Math.round(totalScore),
      recommendation,
      breakdown: {
        profitability: Math.round(profitability),
        liquidity: Math.round(liquidity),
        timing: Math.round(timing),
        risk: Math.round(risk),
      },
      reasoning,
      confidence,
    };
  }

  /**
   * 评分盈利潜力 (0-100)
   */
  private static scoreProfitability(opp: OpportunityData): number {
    let score = 0;

    // 价差评分 (0-40分)
    if (opp.priceDiff >= 2.0) {
      score += 40;
    } else if (opp.priceDiff >= 1.0) {
      score += 30;
    } else if (opp.priceDiff >= 0.5) {
      score += 20;
    } else if (opp.priceDiff >= 0.3) {
      score += 10;
    }

    // 绝对利润评分 (0-30分)
    const profitSOL = opp.estimatedProfit;
    if (profitSOL >= 0.1) {
      score += 30;
    } else if (profitSOL >= 0.05) {
      score += 20;
    } else if (profitSOL >= 0.01) {
      score += 10;
    } else if (profitSOL >= 0.005) {
      score += 5;
    }

    // ROI 评分 (0-30分)
    const roi = (opp.estimatedProfit / (opp.liquidity * 0.01)) * 100;
    if (roi >= 10) {
      score += 30;
    } else if (roi >= 5) {
      score += 20;
    } else if (roi >= 2) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * 评分流动性 (0-100)
   */
  private static scoreLiquidity(opp: OpportunityData): number {
    let score = 0;

    // 基础流动性评分 (0-60分)
    if (opp.liquidity >= 10000) {
      score += 60;
    } else if (opp.liquidity >= 5000) {
      score += 50;
    } else if (opp.liquidity >= 1000) {
      score += 40;
    } else if (opp.liquidity >= 500) {
      score += 30;
    } else if (opp.liquidity >= 100) {
      score += 20;
    } else if (opp.liquidity >= 50) {
      score += 10;
    }

    // 交易量评分 (0-40分)
    if (opp.volume24h) {
      const volume = opp.volume24h;
      if (volume >= 1000000) {
        score += 40;
      } else if (volume >= 500000) {
        score += 30;
      } else if (volume >= 100000) {
        score += 20;
      } else if (volume >= 50000) {
        score += 10;
      }
    }

    return Math.min(100, score);
  }

  /**
   * 评分市场时机 (0-100)
   */
  private static scoreTiming(opp: OpportunityData): number {
    let score = 50; // 基础分

    // Bonding Curve 进度评分 (对于 Meme Token)
    if (opp.isMemeToken && opp.bondingCurveProgress !== undefined) {
      const progress = opp.bondingCurveProgress;

      // 进度在 30%-70% 之间是最佳时机
      if (progress >= 0.3 && progress <= 0.7) {
        score += 30;
      } else if (progress >= 0.2 && progress <= 0.8) {
        score += 20;
      } else if (progress < 0.1) {
        score -= 20; // 太早期，风险高
      } else if (progress > 0.9) {
        score -= 10; // 接近完全上线，空间有限
      }
    }

    // 24小时价格变化评分
    if (opp.priceChange24h !== undefined) {
      const change = Math.abs(opp.priceChange24h);

      // 适度波动（5%-20%）是好的
      if (change >= 5 && change <= 20) {
        score += 20;
      } else if (change > 50) {
        score -= 20; // 过度波动，风险高
      } else if (change < 2) {
        score -= 10; // 波动太小，机会少
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 评分风险控制 (0-100，分数越高越安全)
   */
  private static scoreRisk(opp: OpportunityData): number {
    let score = 50; // 基础分

    // 流动性风险 (0-30分)
    if (opp.liquidity >= 1000) {
      score += 30;
    } else if (opp.liquidity >= 500) {
      score += 20;
    } else if (opp.liquidity >= 100) {
      score += 10;
    } else {
      score -= 20; // 流动性太低，高风险
    }

    // 分散度评分 (持仓地址数) (0-20分)
    if (opp.holderCount) {
      if (opp.holderCount >= 1000) {
        score += 20;
      } else if (opp.holderCount >= 500) {
        score += 15;
      } else if (opp.holderCount >= 100) {
        score += 10;
      } else if (opp.holderCount < 50) {
        score -= 10; // 持仓过于集中
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 获取推荐操作
   */
  private static getRecommendation(
    totalScore: number,
    opp: OpportunityData
  ): 'EXECUTE' | 'WATCH' | 'AVOID' {
    // 高分且流动性充足 → EXECUTE
    if (totalScore >= 70 && opp.liquidity >= 500) {
      return 'EXECUTE';
    }

    // 中等分数或流动性一般 → WATCH
    if (totalScore >= 50 && opp.liquidity >= 100) {
      return 'WATCH';
    }

    // 低分或流动性太低 → AVOID
    if (totalScore < 40 || opp.liquidity < 50) {
      return 'AVOID';
    }

    // 默认 WATCH
    return 'WATCH';
  }

  /**
   * 生成推理说明
   */
  private static generateReasoning(
    opp: OpportunityData,
    scores: {
      profitability: number;
      liquidity: number;
      timing: number;
      risk: number;
    }
  ): string[] {
    const reasons: string[] = [];

    // 盈利潜力
    if (scores.profitability >= 80) {
      reasons.push(`✅ 优秀的盈利潜力：价差 ${opp.priceDiff.toFixed(2)}%，预期利润 ${opp.estimatedProfit.toFixed(4)} SOL`);
    } else if (scores.profitability >= 60) {
      reasons.push(`✓ 良好的盈利潜力：价差 ${opp.priceDiff.toFixed(2)}%`);
    } else if (scores.profitability < 40) {
      reasons.push(`⚠️ 盈利潜力不足：价差仅 ${opp.priceDiff.toFixed(2)}%`);
    }

    // 流动性
    if (scores.liquidity >= 80) {
      reasons.push(`✅ 流动性充足：${opp.liquidity.toFixed(0)} SOL，滑点风险低`);
    } else if (scores.liquidity >= 60) {
      reasons.push(`✓ 流动性良好：${opp.liquidity.toFixed(0)} SOL`);
    } else if (scores.liquidity < 40) {
      reasons.push(`❌ 流动性不足：仅 ${opp.liquidity.toFixed(0)} SOL，滑点风险高`);
    }

    // 市场时机
    if (opp.isMemeToken && opp.bondingCurveProgress !== undefined) {
      const progressPercent = (opp.bondingCurveProgress * 100).toFixed(0);
      if (scores.timing >= 70) {
        reasons.push(`✅ 最佳入场时机：Bonding Curve 进度 ${progressPercent}%`);
      } else if (opp.bondingCurveProgress < 0.2) {
        reasons.push(`⚠️ 过于早期：Bonding Curve 仅 ${progressPercent}%，建议观望`);
      } else if (opp.bondingCurveProgress > 0.9) {
        reasons.push(`⚠️ 接近完全上线：Bonding Curve ${progressPercent}%，上升空间有限`);
      }
    }

    // 风险
    if (scores.risk >= 70) {
      reasons.push(`✅ 风险可控：多重指标显示安全性高`);
    } else if (scores.risk < 40) {
      reasons.push(`❌ 风险过高：建议谨慎对待`);
    }

    return reasons;
  }

  /**
   * 获取置信度
   */
  private static getConfidence(
    totalScore: number,
    opp: OpportunityData
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    // 高分 + 高流动性 = HIGH
    if (totalScore >= 75 && opp.liquidity >= 1000) {
      return 'HIGH';
    }

    // 低分或低流动性 = LOW
    if (totalScore < 50 || opp.liquidity < 100) {
      return 'LOW';
    }

    // 其他 = MEDIUM
    return 'MEDIUM';
  }

  /**
   * 批量评分
   */
  static scoreBatch(opportunities: OpportunityData[]): Map<string, OpportunityScore> {
    const results = new Map<string, OpportunityScore>();

    for (const opp of opportunities) {
      const score = this.score(opp);
      results.set(opp.tokenSymbol, score);
    }

    return results;
  }

  /**
   * 获取顶级机会（按分数排序）
   */
  static getTopOpportunities(
    opportunities: OpportunityData[],
    limit: number = 5
  ): Array<{ opp: OpportunityData; score: OpportunityScore }> {
    const scored = opportunities.map(opp => ({
      opp,
      score: this.score(opp),
    }));

    // 按总分降序排序
    scored.sort((a, b) => b.score.totalScore - a.score.totalScore);

    return scored.slice(0, limit);
  }

  /**
   * 获取适合执行的机会（过滤掉不建议执行的）
   */
  static getExecutableOpportunities(
    opportunities: OpportunityData[]
  ): Array<{ opp: OpportunityData; score: OpportunityScore }> {
    const scored = opportunities.map(opp => ({
      opp,
      score: this.score(opp),
    }));

    // 只返回推荐为 EXECUTE 或 WATCH 且分数较高的
    return scored.filter(
      item => item.score.recommendation !== 'AVOID' && item.score.totalScore >= 50
    );
  }
}

/**
 * 快速评分函数（便捷方法）
 */
export function scoreOpportunity(opp: OpportunityData): OpportunityScore {
  return OpportunityScorer.score(opp);
}

/**
 * 快速批量评分
 */
export function scoreOpportunities(opps: OpportunityData[]): Map<string, OpportunityScore> {
  return OpportunityScorer.scoreBatch(opps);
}
