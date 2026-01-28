/**
 * Strategy Server - 策略管理服务器
 *
 * 功能：
 * 1. 提供 REST API 端点
 * 2. WebSocket 实时通信
 * 3. 策略管理
 * 4. 实时监控
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Connection, Keypair } from '@solana/web3.js';
import { StrategyExecutor, TradingStrategy, StrategyStatus } from './core/strategyExecutor';
import { config } from './config';
import { createLogger } from './utils/logger';

const logger = createLogger('StrategyServer');

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

// 策略执行器实例
let strategyExecutor: StrategyExecutor | null = null;

// WebSocket 连接处理
io.on('connection', (socket) => {
  logger.info('WebSocket client connected', { socketId: socket.id });

  // 发送初始状态
  if (strategyExecutor) {
    const strategies = strategyExecutor.getStrategies();
    const statuses = strategyExecutor.getAllStatuses();

    socket.emit('init', {
      strategies,
      statuses
    });
  }

  socket.on('disconnect', () => {
    logger.info('WebSocket client disconnected', { socketId: socket.id });
  });

  // 客户端请求创建策略
  socket.on('create-strategy', async (strategyData) => {
    if (!strategyExecutor) {
      socket.emit('error', { message: 'Strategy executor not initialized' });
      return;
    }

    try {
      const strategy = await strategyExecutor.createStrategy(strategyData);
      socket.emit('strategy-created', strategy);
      io.emit('strategies-updated', strategyExecutor.getStrategies());
    } catch (error) {
      const err = error as Error;
      socket.emit('error', { message: err.message });
    }
  });

  // 客户端请求启动策略
  socket.on('start-strategy', async (strategyId: string) => {
    if (!strategyExecutor) {
      socket.emit('error', { message: 'Strategy executor not initialized' });
      return;
    }

    try {
      await strategyExecutor.startStrategy(strategyId);
      socket.emit('strategy-started', { strategyId });
      io.emit('statuses-updated', strategyExecutor.getAllStatuses());
    } catch (error) {
      const err = error as Error;
      socket.emit('error', { message: err.message });
    }
  });

  // 客户端请求停止策略
  socket.on('stop-strategy', (strategyId: string) => {
    if (!strategyExecutor) {
      socket.emit('error', { message: 'Strategy executor not initialized' });
      return;
    }

    try {
      strategyExecutor.stopStrategy(strategyId);
      socket.emit('strategy-stopped', { strategyId });
      io.emit('statuses-updated', strategyExecutor.getAllStatuses());
    } catch (error) {
      const err = error as Error;
      socket.emit('error', { message: err.message });
    }
  });

  // 客户端请求删除策略
  socket.on('delete-strategy', (strategyId: string) => {
    if (!strategyExecutor) {
      socket.emit('error', { message: 'Strategy executor not initialized' });
      return;
    }

    try {
      strategyExecutor.deleteStrategy(strategyId);
      socket.emit('strategy-deleted', { strategyId });
      io.emit('strategies-updated', strategyExecutor.getStrategies());
    } catch (error) {
      const err = error as Error;
      socket.emit('error', { message: err.message });
    }
  });

  // 客户端请求获取策略状态
  socket.on('get-status', (strategyId: string) => {
    if (!strategyExecutor) {
      socket.emit('error', { message: 'Strategy executor not initialized' });
      return;
    }

    const status = strategyExecutor.getStrategyStatus(strategyId);
    socket.emit('status', status);
  });

  // 客户端请求获取所有策略状态
  socket.on('get-all-statuses', () => {
    if (!strategyExecutor) {
      socket.emit('error', { message: 'Strategy executor not initialized' });
      return;
    }

    const statuses = strategyExecutor.getAllStatuses();
    socket.emit('all-statuses', statuses);
  });
});

// HTTP API 端点
app.get('/api/strategies', (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  const strategies = strategyExecutor.getStrategies();
  res.json({ success: true, strategies });
});

app.get('/api/strategies/:id', (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  const strategies = strategyExecutor.getStrategies();
  const strategy = strategies.find(s => s.id === req.params.id);

  if (!strategy) {
    return res.json({ error: 'Strategy not found' });
  }

  res.json({ success: true, strategy });
});

app.post('/api/strategies', async (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  try {
    const strategy = await strategyExecutor.createStrategy(req.body);
    res.json({ success: true, strategy });
  } catch (error) {
    const err = error as Error;
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/strategies/:id/start', async (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  try {
    await strategyExecutor.startStrategy(req.params.id);
    res.json({ success: true, message: 'Strategy started' });
  } catch (error) {
    const err = error as Error;
    res.json({ success: false, error: err.message });
  }
});

app.post('/api/strategies/:id/stop', (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  try {
    strategyExecutor.stopStrategy(req.params.id);
    res.json({ success: true, message: 'Strategy stopped' });
  } catch (error) {
    const err = error as Error;
    res.json({ success: false, error: err.message });
  }
});

app.delete('/api/strategies/:id', (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  try {
    strategyExecutor.deleteStrategy(req.params.id);
    res.json({ success: true, message: 'Strategy deleted' });
  } catch (error) {
    const err = error as Error;
    res.json({ success: false, error: err.message });
  }
});

app.get('/api/statuses', (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  const statuses = strategyExecutor.getAllStatuses();
  res.json({ success: true, statuses });
});

app.get('/api/statuses/:id', (req, res) => {
  if (!strategyExecutor) {
    return res.json({ error: 'Strategy executor not initialized' });
  }

  const status = strategyExecutor.getStrategyStatus(req.params.id);

  if (!status) {
    return res.json({ error: 'Strategy status not found' });
  }

  res.json({ success: true, status });
});

// 启动服务器
async function startServer() {
  logger.info('╔══════════════════════════════════════════════════════════════╗');
  logger.info('║         VibeCurve Strategy Server                              ║');
  logger.info('╚══════════════════════════════════════════════════════════════╝');

  const connection = new Connection(config.rpcUrl);
  logger.info('RPC connection established', { wallet: config.payer.publicKey.toBase58() });

  // 初始化策略执行器
  strategyExecutor = new StrategyExecutor(connection, config.payer, {
    maxPositionSize: 0.5,
    maxTotalPosition: 2.0,
    minPositionSize: 0.01,
    stopLossPercentage: 0.15,
    takeProfitPercentage: 0.30,
    trailingStopPercentage: 0.10,
    maxDailyLoss: 1.0,
    maxDrawdown: 0.20,
    maxOpenPositions: 3,
    minLiquidity: 5.0,
    maxSlippage: 0.05,
    maxTradesPerHour: 10,
    cooldownPeriod: 30
  });

  // 监听策略事件
  strategyExecutor.on({
    strategyId: '',
    type: 'CREATED',
    timestamp: 0
  }, (event) => {
    logger.info(`Strategy event: ${event.type}`, { strategyId: event.strategyId });
    io.emit('strategy-event', event);
  });

  // 启动 HTTP 服务器
  httpServer.listen(PORT, () => {
    logger.info('Strategy Server 已启动！');
    logger.info(`HTTP API:  http://localhost:${PORT}`);
    logger.info(`WebSocket: ws://localhost:${PORT}`);
    logger.info('前端可以通过以下方式连接:');
    logger.info(`- Socket.io: http://localhost:${PORT}`);
    logger.info(`- HTTP API: http://localhost:${PORT}/api/*`);
    logger.info('可用的 API 端点:');
    logger.info(`GET  /api/strategies           - 获取所有策略`);
    logger.info(`GET  /api/strategies/:id       - 获取单个策略`);
    logger.info(`POST /api/strategies           - 创建策略`);
    logger.info(`POST /api/strategies/:id/start  - 启动策略`);
    logger.info(`POST /api/strategies/:id/stop   - 停止策略`);
    logger.info(`DELETE /api/strategies/:id       - 删除策略`);
    logger.info(`GET  /api/statuses              - 获取所有策略状态`);
    logger.info(`GET  /api/statuses/:id          - 获取单个策略状态`);
    logger.info('WebSocket 事件:');
    logger.info(`- create-strategy: 创建策略`);
    logger.info(`- start-strategy: 启动策略`);
    logger.info(`- stop-strategy: 停止策略`);
    logger.info(`- delete-strategy: 删除策略`);
    logger.info(`- get-status: 获取策略状态`);
    logger.info(`- get-all-statuses: 获取所有策略状态`);
    logger.info('按 Ctrl+C 停止服务器');
  });

  // 优雅关闭
  process.on('SIGINT', () => {
    logger.info('正在关闭服务器...');
    if (strategyExecutor) {
      strategyExecutor.cleanup();
    }
    httpServer.close(() => {
      logger.info('Server shutdown complete');
      process.exit(0);
    });
  });
}

// 启动
startServer().catch((error) => {
  logger.error('Failed to start server', error);
});
