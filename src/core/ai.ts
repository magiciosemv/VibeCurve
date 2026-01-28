/**
 * 真正的 AI 驱动的市场分析器
 *
 * 核心改进：
 * 1. 移除规则引擎降级，强制使用真实 AI
 * 2. 如果 AI 不可用，抛出异常而不是返回假数据
 * 3. 使用 DeepSeek AI 进行真实的智能分析
 */

import dotenv from 'dotenv';
import axios, { AxiosError } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { createLogger } from '../utils/logger';

const logger = createLogger('AI');

dotenv.config();

/**
 * AI 分析结果接口
 */
export interface AIAnalysisResult {
  sentiment: 'bullish' | 'bearish' | 'neutral';
  confidence: number; // 0-1
  riskLevel: 'low' | 'medium' | 'high';
  recommendation: 'execute' | 'wait' | 'avoid';
  reasoning: string[];
  estimatedProfit?: number;
  estimatedLoss?: number;
  keyFactors: {
    factor: string;
    impact: 'positive' | 'negative' | 'neutral';
    weight: number;
  }[];
}

/**
 * 套利机会数据接口
 */
export interface ArbitrageOpportunity {
  tokenMint: string;
  tokenSymbol: string;
  buyDex: string;
  sellDex: string;
  buyPrice: number;
  sellPrice: number;
  priceDiff: number;
  estimatedProfit: number;
  liquidity: number;
  timestamp: number;
}

/**
 * 真正的 AI 驱动的市场分析器
 * 使用 DeepSeek AI 进行真实的智能分析
 */
export class AIAnalyzer {
  private apiKey: string;
  private apiUrl: string;
  private proxyAgent?: HttpsProxyAgent<string>;
  private requestTimeout: number = 10000; // 10秒超时

  constructor() {
    this.apiKey = process.env.AI_API_KEY || '';
    this.apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions';

    // 配置代理（如果需要）
    const proxyUrl = process.env.HTTPS_PROXY || process.env.http_proxy;
    if (proxyUrl) {
      this.proxyAgent = new HttpsProxyAgent<string>(proxyUrl);
      logger.info('[AI] Proxy configured for API requests');
    }

    if (!this.apiKey) {
      throw new Error('[AI] No API key provided. AI analysis requires a valid API key. Please set AI_API_KEY in your .env file.');
    }

    logger.info('[AI] DeepSeek AI integration initialized');
  }

  /**
   * 主分析函数：分析套利机会
   * @param opportunity 套利机会数据
   * @param additionalContext 额外的市场上下文（可选）
   * @returns AI 分析结果
   */
  async analyzeArbitrageOpportunity(
    opportunity: ArbitrageOpportunity,
    additionalContext?: {
      marketVolatility?: number;
      networkCongestion?: number;
      recentTrades?: Array<{ timestamp: number; success: boolean; profit: number }>;
    }
  ): Promise<AIAnalysisResult> {
    try {
      const prompt = this.buildAnalysisPrompt(opportunity, additionalContext);
      const aiResponse = await this.callDeepSeekAPI(prompt);
      return this.parseAIResponse(aiResponse, opportunity);
    } catch (error) {
      if (error instanceof AxiosError) {
        logger.error(`[AI] API request failed: ${error.message}`);
        if (error.response) {
          logger.error(`[AI] API response status: ${error.response.status}`);
        }
      } else {
        logger.error(`[AI] Analysis error: ${error}`);
      }
      // 失败时抛出异常，不降级到规则引擎
      throw new Error('AI analysis failed. Please check your API key and network connection.');
    }
  }

  /**
   * 构建专业的分析 Prompt
   */
  private buildAnalysisPrompt(
    opportunity: ArbitrageOpportunity,
    context?: {
      marketVolatility?: number;
      networkCongestion?: number;
      recentTrades?: Array<{ timestamp: number; success: boolean; profit: number }>;
    }
  ): string {
    const { tokenSymbol, buyDex, sellDex, buyPrice, sellPrice, priceDiff, liquidity, estimatedProfit } = opportunity;

    // 计算成功率（如果有历史交易数据）
    const successRate = context?.recentTrades
      ? (context.recentTrades.filter(t => t.success).length / context.recentTrades.length * 100).toFixed(1)
      : 'N/A';

    // 计算 ROI
    const roi = ((estimatedProfit / parseFloat(buyPrice.toFixed(2))) * 100).toFixed(2);

    return `你是一位专业的 Solana DeFi 套利交易分析师。请分析以下套利机会，并提供详细的评估。

## 套利机会数据
- 代币: ${tokenSymbol}
- 买入交易所: ${buyDex} ($${buyPrice.toFixed(6)})
- 卖出交易所: ${sellDex} ($${sellPrice.toFixed(6)})
- 价差: ${priceDiff.toFixed(4)}%
- 预估利润: ${estimatedProfit.toFixed(6)} SOL
- 流动性: $${liquidity.toFixed(2)}
- 投资回报率 (ROI): ${roi}%

## 市场环境
- 网络拥堵: ${context?.networkCongestion ? (context.networkCongestion * 100).toFixed(1) + '%' : 'N/A'}
- 市场波动率: ${context?.marketVolatility ? (context.marketVolatility * 100).toFixed(1) + '%' : 'N/A'}
- 历史成功率: ${successRate}%

## 分析要求
请以 JSON 格式返回分析结果，包含以下字段：
{
  "sentiment": "bullish" | "bearish" | "neutral",
  "confidence": 0-1之间的小数，
  "riskLevel": "low" | "medium" | "high",
  "recommendation": "execute" | "wait" | "avoid",
  "reasoning": ["理由1", "理由2", "理由3"],
  "estimatedProfit": 数字（SOL），
  "estimatedLoss": 数字（SOL，最坏情况），
  "keyFactors": [
    {"factor": "因素名称", "impact": "positive|negative|neutral", "weight": 0-1之间的小数}
  ]
}

请特别注意：
1. 如果流动性低于 $10,000，风险级别应为 high
2. 如果价差低于 0.1%，应避免执行
3. 网络拥堵超过 80% 时，建议 wait
4. 必须严格返回有效的 JSON 格式`;
  }

  /**
   * 调用 DeepSeek API
   */
  private async callDeepSeekAPI(prompt: string): Promise<string> {
    const config: any = {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      timeout: this.requestTimeout
    };

    if (this.proxyAgent) {
      config.httpsAgent = this.proxyAgent;
      config.proxy = false;
    }

    const payload = {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一位专业的 DeFi 交易分析师，擅长评估套利机会的风险和收益。你总是以 JSON 格式返回分析结果，保持客观、理性、数据驱动。'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3, // 降低随机性，提高一致性
      max_tokens: 1000
    };

    const startTime = Date.now();
    const response = await axios.post(this.apiUrl, payload, config);
    const duration = Date.now() - startTime;

    logger.info(`[AI] API call completed in ${duration}ms`);

    return response.data.choices[0].message.content.trim();
  }

  /**
   * 解析 AI 返回的 JSON 响应
   */
  private parseAIResponse(aiResponse: string, opportunity: ArbitrageOpportunity): AIAnalysisResult {
    try {
      // 尝试提取 JSON（处理可能的 markdown 格式）
      const jsonMatch = aiResponse.match(/```json\s*([\s\S]*?)\s*```/) ||
                       aiResponse.match(/\{[\s\S]*\}/);

      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);

      // 验证必需字段
      if (!parsed.sentiment || !parsed.confidence || !parsed.recommendation) {
        throw new Error('Invalid AI response: missing required fields');
      }

      // 确保数值在合理范围内
      parsed.confidence = Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.5));

      logger.info(`[AI] Analysis completed: ${parsed.sentiment} (${(parsed.confidence * 100).toFixed(1)}% confidence)`);

      return {
        sentiment: parsed.sentiment,
        confidence: parsed.confidence,
        riskLevel: parsed.riskLevel || 'medium',
        recommendation: parsed.recommendation,
        reasoning: Array.isArray(parsed.reasoning) ? parsed.reasoning : [parsed.reasoning || '无详细说明'],
        estimatedProfit: parsed.estimatedProfit,
        estimatedLoss: parsed.estimatedLoss,
        keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors : []
      };
    } catch (error) {
      logger.error(`[AI] Failed to parse AI response: ${error}`);
      logger.debug(`[AI] Raw response: ${aiResponse}`);
      throw new Error('Failed to parse AI response');
    }
  }

  /**
   * 批量分析多个机会
   */
  async analyzeBatch(
    opportunities: ArbitrageOpportunity[],
    context?: {
      marketVolatility?: number;
      networkCongestion?: number;
      recentTrades?: Array<{ timestamp: number; success: boolean; profit: number }>;
    }
  ): Promise<Map<string, AIAnalysisResult>> {
    const results = new Map<string, AIAnalysisResult>();

    // 并行分析，但限制并发数
    const concurrency = 3;
    for (let i = 0; i < opportunities.length; i += concurrency) {
      const batch = opportunities.slice(i, i + concurrency);
      const analyses = await Promise.all(
        batch.map(opp => this.analyzeArbitrageOpportunity(opp, context))
      );

      batch.forEach((opp, idx) => {
        results.set(opp.tokenMint, analyses[idx]);
      });
    }

    return results;
  }

  /**
   * 获取市场情绪分析（实时）
   */
  async getMarketSentiment(tokenSymbols: string[]): Promise<{
    overall: 'bullish' | 'bearish' | 'neutral';
    byToken: Map<string, 'bullish' | 'bearish' | 'neutral'>;
  }> {
    try {
      const prompt = `请分析以下 Solana 代币的市场情绪：${tokenSymbols.join(', ')}。

只返回 JSON 格式：
{
  "overall": "bullish" | "bearish" | "neutral",
  "byToken": {
    "代币1": "bullish" | "bearish" | "neutral",
    ...
  }
}

基于当前市场环境、DeFi 活动和交易量进行判断。`;

      const response = await this.callDeepSeekAPI(prompt);
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : response);

      return {
        overall: parsed.overall,
        byToken: new Map(Object.entries(parsed.byToken || {}))
      };
    } catch (error) {
      logger.error('[AI] Market sentiment analysis failed:', error instanceof Error ? error : new Error(String(error)));
      throw new Error('Failed to get market sentiment');
    }
  }
}

// 导出单例实例
export const aiAnalyzer = new AIAnalyzer();
