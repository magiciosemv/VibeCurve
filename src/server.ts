import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from './config';
import { simulator } from './core/simulator';
import { getAiComment } from './core/ai';
import { GlobalScanner } from './listeners/scanner';

const app = express();
app.use(cors());
const httpServer = createServer(app);
// 允许跨域，方便前端开发
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = 3001;
const TARGET_MINT = new PublicKey('GKjAe1bQXXLoEitJYSuyw6qt97tTVoKkGEgWPEo6pump');
const TARGET_NAME = "Chill Guy (Web Demo)";

// 状态缓存
let mockPrice = 0.000020;
let aiCommentary = "AI 正在接入神经... (Initializing)";
const priceHistory: { time: string, price: number }[] = [];

// === WebSocket 连接处理 ===
io.on('connection', (socket) => {
  console.log('[WS] Frontend Connected:', socket.id);
  
  // 客户端一连上来，先发给它历史数据和当前状态
  socket.emit('init-data', {
    target: TARGET_NAME,
    price: mockPrice,
    history: priceHistory,
    ai: aiCommentary
  });
});

// === 核心逻辑 (复用之前的逻辑) ===
async function startServer() {
  const connection = new Connection(config.rpcUrl, 'confirmed');
  console.log("🚀 Backend Server Started on Port", PORT);

  // 1. 启动全网扫描 (并广播)
  // 我们稍微魔改一下 console.log 来捕获 Scanner 的输出
  const originalLog = console.log;
  console.log = (msg: any) => {
    if (typeof msg === 'string' && msg.includes('NEW LAUNCH')) {
        // 推送全网扫描事件
        io.emit('global-scan', { message: msg, timestamp: new Date().toISOString() });
    }
    originalLog(msg);
  };
  const scanner = new GlobalScanner(connection);
  scanner.start();

  // 2. 初始化 AI
  getAiComment('intro', TARGET_NAME).then(res => {
      aiCommentary = res;
      io.emit('ai-update', res);
  });

  let lastSignature: string | null = null;
  let consecutiveBuys = 0;

  // 主循环
  setInterval(async () => {
    try {
        // 模拟价格随机波动 (为了图表好看)
        // 真实环境这里不需要模拟，而是直接取 token price
        const randomFluctuation = (Math.random() - 0.5) * 0.0000001;
        mockPrice += randomFluctuation;

        const signatures = await connection.getSignaturesForAddress(TARGET_MINT, { limit: 3 });
        if (signatures.length > 0) {
            const newest = signatures[0];
            if (newest.signature !== lastSignature) {
                // 有新交易
                lastSignature = newest.signature;
                const isBuy = Math.random() > 0.45; // 模拟
                const amount = Math.floor(Math.random() * 50000) + 1000;
                
                // 更新价格趋势
                if (isBuy) {
                    mockPrice *= 1.005;
                    consecutiveBuys++;
                    if (consecutiveBuys >= 3) {
                        getAiComment('pump', TARGET_NAME).then(res => {
                            aiCommentary = res;
                            io.emit('ai-update', res);
                        });
                        simulator.buy(mockPrice, 0.1);
                    }
                } else {
                    mockPrice *= 0.992;
                    consecutiveBuys = 0;
                    getAiComment('dump', TARGET_NAME).then(res => {
                        aiCommentary = res;
                        io.emit('ai-update', res);
                    });
                    simulator.sell(mockPrice);
                }

                // 🔥 推送交易事件给前端
                io.emit('new-tx', {
                    type: isBuy ? 'buy' : 'sell',
                    amount: amount,
                    price: mockPrice,
                    hash: newest.signature,
                    timestamp: new Date().toLocaleTimeString()
                });
            }
        }

        // 记录历史并推送价格更新
        const timeLabel = new Date().toLocaleTimeString();
        priceHistory.push({ time: timeLabel, price: mockPrice });
        if (priceHistory.length > 50) priceHistory.shift();
        
        // 🔥 推送实时价格
        io.emit('price-update', {
            price: mockPrice,
            time: timeLabel,
            status: simulator.getStatus(mockPrice)
        });

    } catch (e) { console.error(e); }
  }, 2000);

  httpServer.listen(PORT, () => {
    console.log(`📡 WebSocket Server ready at http://localhost:${PORT}`);
  });
}

startServer();