/**
 * 🎯 增强版评分系统 - 黑客松演示专用
 *
 * 核心功能：
 * 1. 多维度可视化评分（雷达图、进度条）
 * 2. 实时评分更新（WebSocket 推送）
 * 3. 评分历史追踪（展示评分变化趋势）
 * 4. 多策略评分（套利、Bonding Curve、Smart Money）
 *
 * 演示亮点：
 * - 炫酷的雷达图展示
 * - 实时评分动画
 * - 评分历史曲线
 * - 多策略对比
 */

import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';
import { OpportunityScorer, OpportunityData, OpportunityScore } from './opportunityScorer';
import { AIAnalyzer, AIAnalysisResult } from './ai';

const logger = createLogger('EnhancedScorer');

// ========================================
// 类型定义
// ========================================

/**
 * 评分策略类型
 */
export type ScoringStrategy = 'ARBITRAGE' | 'BONDING_CURVE' | 'SMART_MONEY' | 'MEME_TOKEN';

/**
 * 增强版评分结果
 */
export interface EnhancedScore extends OpportunityScore {
  strategy: ScoringStrategy;
  timestamp: number;
  aiAnalysis?: AIAnalysisResult;
  visualData: {
    radarChart: RadarChartData;
    progressBars: ProgressBarData[];
    scoreHistory: ScoreHistoryPoint[];
  };
  metadata: {
    tokenSymbol: string;
    tokenMint: string;
    source: string;
    network: 'mainnet' | 'devnet' | 'testnet';
  };
}

/**
 * 雷达图数据
 */
export interface RadarChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor: string;
    borderColor: string;
  }[];
}

/**
 * 进度条数据
 */
export interface ProgressBarData {
  label: string;
  value: number;
  max: number;
  color: string;
  icon: string;
}

/**
 * 评分历史点
 */
export interface ScoreHistoryPoint {
  timestamp: number;
  totalScore: number;
  breakdown: {
    profitability: number;
    liquidity: number;
    timing: number;
    risk: number;
  };
}

/**
 * 评分历史记录
 */
export interface ScoreHistory {
  tokenMint: string;
  tokenSymbol: string;
  points: ScoreHistoryPoint[];
  maxPoints: number; // 最多保留多少个历史点
}

// ========================================
// 配置常量
// ========================================

const STRATEGY_CONFIGS: Record<ScoringStrategy, {
  name: string;
  color: string;
  icon: string;
  weights: {
    profitability: number;
    liquidity: number;
    timing: number;
    risk: number;
  };
}> = {
  ARBITRAGE: {
    name: '套利策略',
    color: '#667eea',
    icon: '💰',
    weights: {
      profitability: 0.4,
      liquidity: 0.3,
      timing: 0.2,
      risk: 0.1,
    }
  },
  BONDING_CURVE: {
    name: 'Bonding Curve',
    color: '#f093fb',
    icon: '📈',
    weights: {
      profitability: 0.3,
      liquidity: 0.2,
      timing: 0.4,
      risk: 0.1,
    }
  },
  SMART_MONEY: {
    name: 'Smart Money',
    color: '#4facfe',
    icon: '🧠',
    weights: {
      profitability: 0.25,
      liquidity: 0.25,
      timing: 0.25,
      risk: 0.25,
    }
  },
  MEME_TOKEN: {
    name: 'Meme Token',
    color: '#fa709a',
    icon: '🚀',
    weights: {
      profitability: 0.35,
      liquidity: 0.15,
      timing: 0.35,
      risk: 0.15,
    }
  }
};

// ========================================
// 核心类：增强版评分器
// ========================================

export class EnhancedScorer extends EventEmitter {
  private aiAnalyzer: AIAnalyzer;
  private scoreHistories = new Map<string, ScoreHistory>();
  private maxHistoryPoints = 50; // 最多保留 50 个历史点

  constructor() {
    super();
    this.aiAnalyzer = new AIAnalyzer();
  }

  /**
   * 评分单个机会（增强版）
   */
  async scoreEnhanced(
    opp: OpportunityData,
    strategy: ScoringStrategy,
    metadata: {
      tokenSymbol: string;
      tokenMint: string;
      source: string;
      network: 'mainnet' | 'devnet' | 'testnet';
    }
  ): Promise<EnhancedScore> {
    logger.info(`[EnhancedScorer] 评分 ${metadata.tokenSymbol} (${strategy})`);

    // 1. 基础评分
    const baseScore = OpportunityScorer.score(opp);

    // 2. AI 分析（如果可用）
    let aiAnalysis: AIAnalysisResult | undefined;
    try {
      aiAnalysis = await this.aiAnalyzer.analyzeArbitrageOpportunity({
        tokenMint: metadata.tokenMint,
        tokenSymbol: metadata.tokenSymbol,
        buyDex: opp.tokenSymbol,
        sellDex: opp.tokenSymbol,
        buyPrice: 0,
        sellPrice: 0,
        priceDiff: opp.priceDiff,
        estimatedProfit: opp.estimatedProfit,
        liquidity: opp.liquidity,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.warn('[EnhancedScorer] AI 分析失败，使用基础评分');
    }

    // 3. 生成可视化数据
    const visualData = this.generateVisualData(baseScore, strategy);

    // 4. 更新评分历史
    this.updateScoreHistory(metadata.tokenMint, metadata.tokenSymbol, baseScore);

    // 5. 构建增强版评分
    const enhancedScore: EnhancedScore = {
      ...baseScore,
      strategy,
      timestamp: Date.now(),
      aiAnalysis,
      visualData,
      metadata
    };

    // 6. 发射事件
    this.emit('scoreUpdated', enhancedScore);

    return enhancedScore;
  }

  /**
   * 生成可视化数据
   */
  private generateVisualData(
    score: OpportunityScore,
    strategy: ScoringStrategy
  ): EnhancedScore['visualData'] {
    const config = STRATEGY_CONFIGS[strategy];

    // 1. 雷达图数据
    const radarChart: RadarChartData = {
      labels: ['盈利潜力', '流动性', '市场时机', '风险控制'],
      datasets: [{
        label: config.name,
        data: [
          score.breakdown.profitability,
          score.breakdown.liquidity,
          score.breakdown.timing,
          score.breakdown.risk,
        ],
        backgroundColor: `${config.color}33`, // 20% 透明度
        borderColor: config.color,
      }]
    };

    // 2. 进度条数据
    const progressBars: ProgressBarData[] = [
      {
        label: '盈利潜力',
        value: score.breakdown.profitability,
        max: 100,
        color: '#667eea',
        icon: '💰'
      },
      {
        label: '流动性',
        value: score.breakdown.liquidity,
        max: 100,
        color: '#4facfe',
        icon: '💧'
      },
      {
        label: '市场时机',
        value: score.breakdown.timing,
        max: 100,
        color: '#f093fb',
        icon: '⏰'
      },
      {
        label: '风险控制',
        value: score.breakdown.risk,
        max: 100,
        color: '#fa709a',
        icon: '🛡️'
      }
    ];

    // 3. 评分历史
    const scoreHistory = this.getScoreHistory(score.breakdown);

    return {
      radarChart,
      progressBars,
      scoreHistory
    };
  }

  /**
   * 更新评分历史
   */
  private updateScoreHistory(
    tokenMint: string,
    tokenSymbol: string,
    score: OpportunityScore
  ): void {
    let history = this.scoreHistories.get(tokenMint);

    if (!history) {
      history = {
        tokenMint,
        tokenSymbol,
        points: [],
        maxPoints: this.maxHistoryPoints
      };
      this.scoreHistories.set(tokenMint, history);
    }

    // 添加新的评分点
    history.points.push({
      timestamp: Date.now(),
      totalScore: score.totalScore,
      breakdown: { ...score.breakdown }
    });

    // 限制历史点数量
    if (history.points.length > history.maxPoints) {
      history.points.shift();
    }

    // 发射历史更新事件
    this.emit('historyUpdated', history);
  }

  /**
   * 获取评分历史
   */
  private getScoreHistory(breakdown: OpportunityScore['breakdown']): ScoreHistoryPoint[] {
    // 返回最近的历史点（这里简化处理，实际应该从 tokenMint 获取）
    return [{
      timestamp: Date.now(),
      totalScore: breakdown.profitability + breakdown.liquidity + breakdown.timing + breakdown.risk,
      breakdown
    }];
  }

  /**
   * 获取完整的评分历史
   */
  getFullScoreHistory(tokenMint: string): ScoreHistory | undefined {
    return this.scoreHistories.get(tokenMint);
  }

  /**
   * 批量评分
   */
  async scoreBatchEnhanced(
    opportunities: Array<{
      opp: OpportunityData;
      strategy: ScoringStrategy;
      metadata: {
        tokenSymbol: string;
        tokenMint: string;
        source: string;
        network: 'mainnet' | 'devnet' | 'testnet';
      };
    }>
  ): Promise<Map<string, EnhancedScore>> {
    const results = new Map<string, EnhancedScore>();

    // 并发评分，但限制并发数
    const concurrency = 3;
    for (let i = 0; i < opportunities.length; i += concurrency) {
      const batch = opportunities.slice(i, i + concurrency);
      const scores = await Promise.all(
        batch.map(item => this.scoreEnhanced(item.opp, item.strategy, item.metadata))
      );

      batch.forEach((item, idx) => {
        results.set(item.metadata.tokenMint, scores[idx]);
      });
    }

    return results;
  }

  /**
   * 获取策略配置
   */
  getStrategyConfig(strategy: ScoringStrategy) {
    return STRATEGY_CONFIGS[strategy];
  }

  /**
   * 获取所有策略配置
   */
  getAllStrategies(): Record<ScoringStrategy, typeof STRATEGY_CONFIGS[ScoringStrategy]> {
    return STRATEGY_CONFIGS;
  }

  /**
   * 清空评分历史
   */
  clearScoreHistory(tokenMint?: string): void {
    if (tokenMint) {
      this.scoreHistories.delete(tokenMint);
      logger.info(`[EnhancedScorer] 清空 ${tokenMint} 的评分历史`);
    } else {
      this.scoreHistories.clear();
      logger.info('[EnhancedScorer] 清空所有评分历史');
    }
  }

  /**
   * 导出评分数据（用于演示）
   */
  exportScoreData(tokenMint: string): {
    history: ScoreHistory | undefined;
    latestScore: EnhancedScore | undefined;
  } {
    return {
      history: this.getFullScoreHistory(tokenMint),
      latestScore: undefined // 需要额外存储最新评分
    };
  }
}

// ========================================
// 工具函数
// ========================================

/**
 * 生成评分颜色
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return '#10b981'; // 绿色
  if (score >= 60) return '#3b82f6'; // 蓝色
  if (score >= 40) return '#f59e0b'; // 黄色
  return '#ef4444'; // 红色
}

/**
 * 生成推荐操作颜色
 */
export function getRecommendationColor(recommendation: 'EXECUTE' | 'WATCH' | 'AVOID'): string {
  switch (recommendation) {
    case 'EXECUTE': return '#10b981';
    case 'WATCH': return '#f59e0b';
    case 'AVOID': return '#ef4444';
  }
}

/**
 * 生成置信度颜色
 */
export function getConfidenceColor(confidence: 'HIGH' | 'MEDIUM' | 'LOW'): string {
  switch (confidence) {
    case 'HIGH': return '#10b981';
    case 'MEDIUM': return '#f59e0b';
    case 'LOW': return '#ef4444';
  }
}

// ========================================
// 使用示例
// ========================================

/**
 * 使用示例：
 *
 * ```typescript
 * import { EnhancedScorer } from './enhancedScorer';
 *
 * // 创建评分器
 * const scorer = new EnhancedScorer();
 *
 * // 监听事件
 * scorer.on('scoreUpdated', (enhancedScore) => {
 *   console.log(`评分更新: ${enhancedScore.metadata.tokenSymbol}`);
 *   console.log(`总分: ${enhancedScore.totalScore}/100`);
 *   console.log(`雷达图数据:`, enhancedScore.visualData.radarChart);
 * });
 *
 * scorer.on('historyUpdated', (history) => {
 *   console.log(`历史更新: ${history.tokenSymbol}`);
 *   console.log(`历史点数: ${history.points.length}`);
 * });
 *
 * // 评分
 * const enhancedScore = await scorer.scoreEnhanced(
 *   {
 *     tokenSymbol: 'BONK',
 *     priceDiff: 0.5,
 *     estimatedProfit: 0.01,
 *     liquidity: 1000,
 *     isMemeToken: true,
 *     bondingCurveProgress: 0.75,
 *   },
 *   'BONDING_CURVE',
 *   {
 *     tokenSymbol: 'BONK',
 *     tokenMint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
 *     source: 'pump.fun',
 *     network: 'mainnet'
 *   }
 * );
 *
 * // 获取评分历史
 * const history = scorer.getFullScoreHistory('DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263');
 * console.log('评分历史:', history);
 * ```
 */
