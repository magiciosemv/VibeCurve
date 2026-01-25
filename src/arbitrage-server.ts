/**
 * 套利系统 Web Dashboard Server
 * 提供 WebSocket API 和 HTTP 端点
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Connection } from '@solana/web3.js';
import { config } from './config';
import { ArbitrageSystem } from './core/arbitrageSystem';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3002;

// 套利系统实例
let arbitrageSystem: ArbitrageSystem | null = null;

// 缓存最近的机会（用于新连接的客户端）
const recentOpportunities: any[] = [];
const MAX_CACHED_OPPORTUNITIES = 10;

// WebSocket 连接处理
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connected:', socket.id);

  // 发送初始状态
  if (arbitrageSystem) {
    const stats = arbitrageSystem.getStats();
    const cfg = arbitrageSystem.getConfig();

    socket.emit('init', {
      config: cfg,
      stats: stats,
      isRunning: stats.system.isRunning
    });

    // 发送缓存的机会
    if (recentOpportunities.length > 0) {
      socket.emit('scan-result', recentOpportunities);
      console.log(`[Cache] Sending ${recentOpportunities.length} cached opportunities to client`);
    }
  }

  socket.on('disconnect', () => {
    console.log('[WebSocket] Client disconnected:', socket.id);
  });

  // 客户端请求启动系统
  socket.on('start', () => {
    if (arbitrageSystem) {
      arbitrageSystem.start();
      socket.emit('status', { running: true });
    }
  });

  // 客户端请求停止系统
  socket.on('stop', () => {
    if (arbitrageSystem) {
      arbitrageSystem.stop();
      socket.emit('status', { running: false });
    }
  });

  // 客户端请求手动扫描
  socket.on('scan', async () => {
    if (arbitrageSystem) {
      const opportunities = await arbitrageSystem.manualScan();
      socket.emit('scan-result', opportunities);
    }
  });

  // 客户端请求更新配置
  socket.on('update-config', (newConfig) => {
    if (arbitrageSystem) {
      arbitrageSystem.updateConfig(newConfig);
      const cfg = arbitrageSystem.getConfig();
      io.emit('config-updated', cfg);
    }
  });
});

// HTTP API 端点
app.get('/api/status', (req, res) => {
  if (!arbitrageSystem) {
    return res.json({ running: false, error: 'System not initialized' });
  }

  const stats = arbitrageSystem.getStats();
  res.json({
    running: stats.system.isRunning,
    ...stats
  });
});

app.get('/api/config', (req, res) => {
  if (!arbitrageSystem) {
    return res.json({ error: 'System not initialized' });
  }

  const cfg = arbitrageSystem.getConfig();
  res.json(cfg);
});

app.post('/api/config', (req, res) => {
  if (!arbitrageSystem) {
    return res.json({ error: 'System not initialized' });
  }

  arbitrageSystem.updateConfig(req.body);
  const cfg = arbitrageSystem.getConfig();
  res.json({ success: true, config: cfg });
});

app.post('/api/start', (req, res) => {
  if (!arbitrageSystem) {
    return res.json({ error: 'System not initialized' });
  }

  arbitrageSystem.start();
  res.json({ success: true, running: true });
});

app.post('/api/stop', (req, res) => {
  if (!arbitrageSystem) {
    return res.json({ error: 'System not initialized' });
  }

  arbitrageSystem.stop();
  res.json({ success: true, running: false });
});

app.post('/api/scan', async (req, res) => {
  if (!arbitrageSystem) {
    return res.json({ error: 'System not initialized' });
  }

  try {
    const opportunities = await arbitrageSystem.manualScan();
    res.json({ success: true, opportunities });
  } catch (error) {
    res.json({ success: false, error: String(error) });
  }
});

app.get('/api/history', (req, res) => {
  if (!arbitrageSystem) {
    return res.json({ error: 'System not initialized' });
  }

  const history = arbitrageSystem.getHistory();
  res.json({ success: true, history });
});

// AI Analysis endpoint
app.post('/api/ai-analyze', async (req, res) => {
  try {
    const { opportunity, context } = req.body;

    const apiKey = process.env.AI_API_KEY;
    const apiUrl = process.env.AI_API_URL || 'https://api.deepseek.com/v1/chat/completions';

    if (!apiKey) {
      // Return local analysis if no API key
      return res.json({
        success: true,
        analysis: generateLocalAnalysis(opportunity),
        recommendation: 'Local analysis based on predefined algorithms.'
      });
    }

    // Prepare analysis prompt
    const prompt = `Analyze this arbitrage opportunity:
Token: ${opportunity.tokenSymbol}
Buy DEX: ${opportunity.buyDex} at ${opportunity.buyPrice}
Sell DEX: ${opportunity.sellDex} at ${opportunity.sellPrice}
Spread: ${opportunity.priceDiff.toFixed(3)}%
Estimated Profit: ${opportunity.estimatedProfit.toFixed(4)} SOL
Liquidity: ${opportunity.liquidity.toFixed(2)} SOL
Confidence: ${opportunity.confidence}

Current Performance:
Total Trades: ${context.totalTrades}
Success Rate: ${context.successRate}
Current Profit: ${context.currentProfit} SOL

Provide:
1. Market analysis
2. Risk assessment
3. Clear recommendation (EXECUTE/CONSIDER/WAIT)`;

    // Call AI API
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          {
            role: 'system',
            content: 'You are an expert cryptocurrency trading analyst specializing in arbitrage opportunities on Solana DEXs. Provide professional, data-driven analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const analysis = data.choices[0].message.content;

    res.json({
      success: true,
      analysis: analysis,
      recommendation: analysis.includes('EXECUTE') ? 'Recommended for execution based on market analysis.' :
                      analysis.includes('WAIT') ? 'Monitor market conditions before execution.' :
                      'Consider execution with proper risk management.'
    });
  } catch (error) {
    console.error('[AI] Analysis failed:', error);
    const { opportunity } = req.body;
    res.json({
      success: true,
      analysis: generateLocalAnalysis(opportunity),
      recommendation: 'Local analysis (AI unavailable)'
    });
  }
});

function generateLocalAnalysis(opportunity: any): string {
  const spread = opportunity.priceDiff;
  let analysis = '';

  if (spread > 1.0) {
    analysis = `Exceptional arbitrage opportunity detected. The ${opportunity.priceDiff.toFixed(2)}% spread between ${opportunity.buyDex} and ${opportunity.sellDex} significantly exceeds typical market inefficiencies. Current liquidity depth of ${opportunity.liquidity.toFixed(2)} SOL supports the proposed trade size.`;
  } else if (spread > 0.5) {
    analysis = `Moderate arbitrage opportunity identified. The ${opportunity.priceDiff.toFixed(2)}% spread presents favorable risk-adjusted returns. Market conditions appear stable with adequate liquidity.`;
  } else {
    analysis = `Market efficiency observed. The current ${opportunity.priceDiff.toFixed(2)}% spread is within normal parameters. Continue monitoring for more significant opportunities.`;
  }

  return analysis;
}

// 启动服务器
async function startServer() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║         VibeCurve 套利系统 - Web Dashboard Server              ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log();

  const connection = new Connection(config.rpcUrl);
  console.log('[System] RPC connection established');
  console.log(`   钱包: ${config.payer.publicKey.toBase58()}`);
  console.log();

  // 初始化套利系统
  arbitrageSystem = new ArbitrageSystem(connection, config.payer, {
    scanInterval: 120000,       // 120 秒扫描一次（适配 CoinGecko API 限制）
    minProfitPercent: 0.3,      // 0.3% 最小利润
    minLiquidity: 10,           // 10 SOL 最小流动性
    tradeAmount: 0.05,          // 0.05 SOL 交易金额
    maxSlippage: 0.01,          // 1% 滑点
    autoExecute: false,         // 默认不自动执行
    simulationMode: true,       // 默认模拟模式
    alertOnly: true,            // 默认仅通知
  });

  // 监听套利机会事件
  arbitrageSystem.on('opportunity', (opportunity) => {
    console.log(`[Arbitrage] Opportunity detected: ${opportunity.tokenSymbol}`);
    console.log(`[Arbitrage]   Route: ${opportunity.buyDex} -> ${opportunity.sellDex}`);
    console.log(`[Arbitrage]   Profit: ${opportunity.priceDiff.toFixed(3)}% (${opportunity.estimatedProfit.toFixed(4)} SOL)`);

    // 添加到缓存
    recentOpportunities.unshift(opportunity);
    if (recentOpportunities.length > MAX_CACHED_OPPORTUNITIES) {
      recentOpportunities.pop();
    }

    // 广播到所有 WebSocket 客户端
    io.emit('opportunity', opportunity);
  });

  // 监听套利执行事件
  arbitrageSystem.on('executed', (result) => {
    console.log(`[Execution] Arbitrage ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.success) {
      console.log(`   净利润: ${result.netProfit.toFixed(6)} SOL`);
    } else {
      console.log(`   错误: ${result.error}`);
    }

    // 广播到所有 WebSocket 客户端
    io.emit('executed', result);

    // 同时发送更新的统计信息
    if (arbitrageSystem) {
      const stats = arbitrageSystem.getStats();
      io.emit('stats-updated', stats);
    }
  });

  // 启动 HTTP 服务器
  httpServer.listen(PORT, () => {
    console.log();
    console.log('🌐 Web Dashboard Server 已启动！');
    console.log();
    console.log(`   HTTP API:  http://localhost:${PORT}`);
    console.log(`   WebSocket: ws://localhost:${PORT}`);
    console.log();
    console.log('💡 前端可以通过以下方式连接:');
    console.log(`   - Socket.io: http://localhost:${PORT}`);
    console.log(`   - HTTP API: http://localhost:${PORT}/api/*`);
    console.log();
    console.log('📊 可用的 API 端点:');
    console.log(`   GET  /api/status      - 获取系统状态`);
    console.log(`   GET  /api/config      - 获取配置`);
    console.log(`   POST /api/config      - 更新配置`);
    console.log(`   POST /api/start       - 启动系统`);
    console.log(`   POST /api/stop        - 停止系统`);
    console.log(`   POST /api/scan        - 手动扫描`);
    console.log(`   GET  /api/history     - 获取历史记录`);
    console.log();
    console.log('🔗 WebSocket 事件:');
    console.log(`   - opportunity: 套利机会`);
    console.log(`   - executed: 执行结果`);
    console.log(`   - stats-updated: 统计更新`);
    console.log(`   - config-updated: 配置更新`);
    console.log();
    console.log('⌨️  按 Ctrl+C 停止服务器');
    console.log('═══════════════════════════════════════════════════════════════');
  });

  // 优雅关闭
  process.on('SIGINT', () => {
    console.log('\n⏹️  正在关闭服务器...');
    if (arbitrageSystem) {
      arbitrageSystem.stop();
    }
    httpServer.close(() => {
      console.log('[System] Server shutdown complete');
      process.exit(0);
    });
  });
}

// 启动
startServer().catch(console.error);
